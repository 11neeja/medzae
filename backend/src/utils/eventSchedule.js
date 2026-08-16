// Turning an event's human-facing date/time strings into an instant we can
// schedule reminders against.
//
// Every source hands us a different shape, and none of them are guaranteed:
//   Eventbrite  date "2026-03-14"                time "09:00 AM - 05:00 PM"
//   Hack Club   date "2026-03-14T09:00:00.000Z"  time "09:00 AM – 05:00 PM UTC"
//   Devpost     date "2026-03-14T00:00:00.000Z"  time "May 05 - Jun 11, 2026"
//   Local       date "2026-03-14"                time "09:00 AM"  (or null)
//
// Everything here resolves to UTC. The event's own strings are what the user
// reads in the UI; startAt exists purely so the sweep has something to compare
// against, and keeping it in one fixed zone is what makes the comparison
// deterministic on a server that knows nothing about the user's timezone.

// Events whose source gave a date but no usable clock time are anchored here
// rather than at midnight — a 00:00 start leaves the "morning of" reminder no
// window to fire in, and 09:00 is the honest guess for an all-day listing.
const DEFAULT_HOUR_UTC = 9

// Does this string already carry a clock time (an ISO timestamp), as opposed
// to a bare calendar date? "2026-03-14T09:00:00Z" yes, "2026-03-14" no.
const carriesTime = (str) => /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(str)

// First clock time in a free-text string. Handles "09:00", "9:00 AM",
// "09:00 AM - 05:00 PM" (takes the start), and "14:30 – 18:00 UTC".
// Returns { hour, minute } in 24-hour form, or null.
const firstClockTime = (str) => {
  if (!str) return null
  const m = String(str).match(/(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?/i)
  if (!m) return null

  let hour = Number(m[1])
  const minute = Number(m[2])
  const meridiem = m[3] ? m[3].toLowerCase().replace(/\./g, '') : ''

  if (Number.isNaN(hour) || Number.isNaN(minute)) return null
  if (minute > 59) return null

  if (meridiem === 'pm' && hour < 12) hour += 12
  else if (meridiem === 'am' && hour === 12) hour = 0

  if (hour > 23) return null
  return { hour, minute }
}

/**
 * Resolve an event's start instant from its date and time strings.
 * @param {object} event - { date, time } as carried on the event payload
 * @returns {Date|null} UTC start instant, or null if nothing parseable
 */
export function resolveStartAt({ date, time } = {}) {
  if (!date) return null

  const base = new Date(date)
  if (Number.isNaN(base.getTime())) return null

  // An ISO timestamp already pins the moment — trust it and stop, unless it
  // landed exactly on midnight, which is what Devpost emits for "no time
  // given" and is indistinguishable from a genuine midnight start. Treating
  // it as unset lets the time string (or the default hour) improve on it.
  const isoHasTime =
    carriesTime(String(date)) &&
    !(base.getUTCHours() === 0 && base.getUTCMinutes() === 0)
  if (isoHasTime) return base

  const clock = firstClockTime(time)
  const resolved = new Date(base)
  resolved.setUTCHours(
    clock ? clock.hour : DEFAULT_HOUR_UTC,
    clock ? clock.minute : 0,
    0,
    0
  )
  return resolved
}

/**
 * Resolve the last day of a multi-day event.
 *
 * Only the UTC calendar date of the result is used (it decides how many
 * squares the calendar paints), so the clock time is picked for tidiness
 * rather than precision: the second time in a range like "09:00 AM - 05:00 PM"
 * if there is one, otherwise the same default hour as the start.
 *
 * Returns null for single-day events, and also whenever the parsed end lands
 * before the start — a backwards range means the parse was wrong, and one
 * correct square beats a nonsensical span.
 *
 * @param {object} event - { endDate, time }
 * @param {Date|null} startAt - resolved start, used to reject bad ranges
 */
export function resolveEndAt({ endDate, time } = {}, startAt = null) {
  if (!endDate) return null

  const base = new Date(endDate)
  if (Number.isNaN(base.getTime())) return null

  let resolved
  if (carriesTime(String(endDate)) && !(base.getUTCHours() === 0 && base.getUTCMinutes() === 0)) {
    resolved = base
  } else {
    // Second clock time in the string, if the source gave a range.
    const times = String(time || '').match(/(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?/gi) || []
    const clock = times.length > 1 ? firstClockTime(times[1]) : null
    resolved = new Date(base)
    resolved.setUTCHours(clock ? clock.hour : DEFAULT_HOUR_UTC, clock ? clock.minute : 0, 0, 0)
  }

  if (startAt instanceof Date && resolved.getTime() < startAt.getTime()) return null
  return resolved
}

/**
 * Inclusive count of UTC calendar days an event covers. 1 when single-day.
 * Capped so a mis-parsed year can't make the calendar loop for centuries.
 */
export const MAX_EVENT_DAYS = 400

export function eventDaySpan(startAt, endAt) {
  if (!startAt || !endAt) return 1
  const days = Math.round(
    (startOfUTCDay(endAt).getTime() - startOfUTCDay(startAt).getTime()) / 86400000
  ) + 1
  if (!Number.isFinite(days) || days < 1) return 1
  return Math.min(days, MAX_EVENT_DAYS)
}

/**
 * Human-readable "when" line for reminder copy.
 * Prefers the resolved instant; falls back to whatever text the source gave.
 */
export function formatEventWhen(startAt, dateText, timeText) {
  if (startAt instanceof Date && !Number.isNaN(startAt.getTime())) {
    const day = startAt.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
    const clock = startAt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    })
    return `${day} · ${clock} UTC`
  }
  return [dateText, timeText].filter(Boolean).join(' · ') || 'Date to be announced'
}

/** Start of the UTC calendar day a given instant falls on. */
export function startOfUTCDay(d) {
  const copy = new Date(d)
  copy.setUTCHours(0, 0, 0, 0)
  return copy
}

// Devpost gives one free-text range, never two fields: "May 05 - Jun 11, 2026",
// and sometimes "Aug 14 - 16, 2026" where the second half omits the month.
//
// "May 05 2026" is parsed by Date as LOCAL midnight, so serialising it straight
// to ISO shifted the date by a day on any server east of UTC (and put the event
// on the wrong calendar square). Everything here re-anchors to UTC midnight so
// the result is the date the listing actually says, on every server.
// Recognisable date shapes: "May 05", "5 May", a bare day number (which
// borrows the month from the range's other half), or an ISO date.
const LOOKS_LIKE_A_DATE = /^(?:[A-Za-z]{3,}\s+\d{1,2}|\d{1,2}\s+[A-Za-z]{3,}|\d{1,2}|\d{4}-\d{2}-\d{2})$/

const utcMidnightFrom = (text, year, fallbackMonth) => {
  const cleaned = String(text || '').replace(/,.*$/, '').replace(/\b20\d{2}\b/, '').trim()
  if (!cleaned) return ''

  // Date's parser is lenient enough to turn "coming soon 2026" into 1 January
  // — a date nobody announced, which would then sit on the calendar and fire a
  // reminder. Require something that actually looks like a date first.
  if (!LOOKS_LIKE_A_DATE.test(cleaned)) return ''

  // A bare day number ("16") borrows the month from the range's first half.
  const spec = /^\d{1,2}$/.test(cleaned) && fallbackMonth ? `${fallbackMonth} ${cleaned}` : cleaned
  const d = new Date(`${spec} ${year}`)
  if (isNaN(d.getTime())) return ''
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString()
}

export const parseDevpostRange = (str) => {
  if (!str) return { start: '', end: '' }
  const yearMatch = str.match(/\b(20\d{2})\b/)
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear()
  const [firstPart, secondPart] = str.split(/\s*[-–—]\s*/)
  const month = (firstPart || '').match(/[A-Za-z]{3,}/)?.[0] || ''

  const start = utcMidnightFrom(firstPart, year, '')
  const end = secondPart ? utcMidnightFrom(secondPart, year, month) : ''
  // Ignore a backwards or same-day range — one correct square beats a bad span.
  return { start, end: end && end > start ? end : '' }
}
