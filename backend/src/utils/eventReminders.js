// Event reminders: one the day before, one on the morning of.
//
// Why a sweep and not a timer per event: this backend has no scheduler, and
// Render puts the instance to sleep. Anything built on setTimeout would lose
// every pending reminder the moment the process died. Instead the due set is
// *recomputed from the database* on every sweep, so a reminder that came due
// while the server was asleep still goes out on the next wake — late, but sent.
//
// The sweep is safe to run as often as you like. Each send is claimed with a
// conditional UPDATE (see claimReminder), so concurrent sweeps, a cron ping
// landing on top of the interval, or a restart mid-sweep can never double-send.

import prisma from '../config/prisma.js'
import { createAndEmitNotification } from './notification.js'
import { sendEventReminderEmail, hasMailConfig } from './mailer.js'
import { formatEventWhen, resolveStartAt, startOfUTCDay } from './eventSchedule.js'

const DAY_MS = 24 * 60 * 60 * 1000
const SWEEP_INTERVAL_MS = 10 * 60 * 1000

// Floor on how often an incidental request may trigger a sweep, so a busy
// events page can't turn every page load into a database scan.
const KICK_COOLDOWN_MS = 5 * 60 * 1000
let lastSweepAt = 0
let sweepInFlight = null

/**
 * Claim one reminder for one registration by stamping its column, but only if
 * it is still unstamped. updateMany returns the row count, which makes this an
 * atomic compare-and-set: exactly one caller can ever win a given reminder.
 *
 * A day-of claim also burns any unsent day-before stamp. If a user registers
 * a few hours before an event, both reminders are technically due at once —
 * sending "starts tomorrow" alongside "starts today" would be nonsense, so the
 * more urgent one wins and the other is retired silently.
 */
async function claimReminder(registration, lead) {
  const now = new Date()
  const where = { id: registration.id }
  const data = {}

  if (lead === 'day-of') {
    where.remindedDayOfAt = null
    data.remindedDayOfAt = now
    if (!registration.remindedDayBeforeAt) data.remindedDayBeforeAt = now
  } else {
    where.remindedDayBeforeAt = null
    data.remindedDayBeforeAt = now
  }

  const { count } = await prisma.eventRegistration.updateMany({ where, data })
  return count === 1
}

// Deliver one reminder over both channels. The in-app notification is the
// channel that must not fail, so it goes first and email is best-effort:
// gmail-relay is the only working provider since Brevo was removed, and a
// relay outage must not cost the user their bell notification.
async function deliverReminder(io, registration, lead) {
  const when = formatEventWhen(registration.startAt, registration.dateText, registration.timeText)
  const headline = lead === 'day-of' ? 'Happening today' : 'Happening tomorrow'

  await createAndEmitNotification(io, {
    userId: registration.userId,
    type: 'event_reminder',
    title: headline,
    message: `${registration.title} — ${when}${registration.location ? ` · ${registration.location}` : ''}`,
    link: '/events?calendar=1',
    metadata: { eventKey: registration.eventKey, lead, source: registration.source },
  })

  if (!hasMailConfig()) return

  try {
    await sendEventReminderEmail({
      name: registration.user?.name || 'there',
      email: registration.user?.email,
      title: registration.title,
      when,
      location: registration.location,
      lead,
      eventUrl: registration.externalUrl,
    })
  } catch (err) {
    console.error(`[EventReminders] email failed for ${registration.eventKey}:`, err.message)
  }
}

/**
 * Find and deliver every reminder that is currently due.
 * @param {object} io - Socket.IO server instance
 * @returns {Promise<{scanned:number, sent:number}>}
 */
export async function runEventReminderSweep(io) {
  const now = new Date()

  // Both reminder windows sit inside the 24 hours before an event starts, so
  // one range query covers them. Events already under way are excluded — a
  // reminder that arrives after the fact is worse than no reminder.
  const due = await prisma.eventRegistration.findMany({
    where: {
      startAt: { gt: now, lte: new Date(now.getTime() + DAY_MS) },
      OR: [{ remindedDayBeforeAt: null }, { remindedDayOfAt: null }],
    },
    include: { user: { select: { name: true, email: true } } },
  })

  let sent = 0
  for (const registration of due) {
    const startAt = registration.startAt
    const dayOfDue = !registration.remindedDayOfAt && now >= startOfUTCDay(startAt)
    const dayBeforeDue =
      !registration.remindedDayBeforeAt && now >= new Date(startAt.getTime() - DAY_MS)

    const lead = dayOfDue ? 'day-of' : dayBeforeDue ? 'day-before' : null
    if (!lead) continue

    try {
      if (!(await claimReminder(registration, lead))) continue
      await deliverReminder(io, registration, lead)
      sent += 1
    } catch (err) {
      console.error(`[EventReminders] ${lead} failed for ${registration.eventKey}:`, err.message)
    }
  }

  lastSweepAt = Date.now()
  if (sent > 0) console.log(`[EventReminders] sent ${sent} of ${due.length} due reminders`)
  return { scanned: due.length, sent }
}

// Deduped sweep — concurrent callers share one run rather than each opening
// their own scan of the table.
export function triggerEventReminderSweep(io) {
  if (!sweepInFlight) {
    sweepInFlight = runEventReminderSweep(io)
      .catch((err) => {
        console.error('[EventReminders] sweep failed:', err.message)
        return { scanned: 0, sent: 0 }
      })
      .finally(() => { sweepInFlight = null })
  }
  return sweepInFlight
}

// Fire-and-forget sweep for request handlers to call. Rate-limited, so it adds
// nothing to the latency of the request that triggered it.
export function kickEventReminderSweep(io) {
  if (Date.now() - lastSweepAt < KICK_COOLDOWN_MS) return
  triggerEventReminderSweep(io)
}

/**
 * Fill in startAt for rows that don't have one yet.
 *
 * The migration that introduced this table backfilled every pre-existing
 * local registration from the join table but left startAt NULL, because
 * Event.date is free text and a SQL cast that threw would have failed the
 * deploy. This resolves them with the same parser every other path uses.
 *
 * Rows whose date is genuinely unparseable stay NULL and are simply retried
 * on the next boot — the set is tiny and shrinks to nothing in practice.
 */
export async function backfillMissingStartAt() {
  const pending = await prisma.eventRegistration.findMany({
    where: { startAt: null, dateText: { not: null } },
    select: { id: true, dateText: true, timeText: true },
  })
  if (pending.length === 0) return 0

  let fixed = 0
  for (const row of pending) {
    const startAt = resolveStartAt({ date: row.dateText, time: row.timeText })
    if (!startAt) continue
    await prisma.eventRegistration.update({ where: { id: row.id }, data: { startAt } })
    fixed += 1
  }
  if (fixed > 0) console.log(`[EventReminders] resolved startAt for ${fixed} backfilled registrations`)
  return fixed
}

/**
 * Start the in-process sweep loop. This covers the instance's waking hours;
 * the /api/events/reminders/run endpoint covers the rest (point an external
 * pinger at it if reminders must land while nobody is using the site).
 */
export function startEventReminderScheduler(io) {
  // Repair before the first sweep, so backfilled rows are eligible for their
  // reminders on this boot rather than the next one.
  backfillMissingStartAt()
    .catch((err) => console.error('[EventReminders] startAt backfill failed:', err.message))
    .then(() => triggerEventReminderSweep(io))
  const timer = setInterval(() => triggerEventReminderSweep(io), SWEEP_INTERVAL_MS)
  // Don't hold the event loop open on shutdown.
  if (typeof timer.unref === 'function') timer.unref()
  return timer
}
