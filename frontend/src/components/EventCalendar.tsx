'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  X, ChevronLeft, ChevronRight, MapPin, ExternalLink, Trash2,
  BellRing, BellOff, CalendarDays, Clock,
} from 'lucide-react';
import type { EventRegistration } from '@/lib/api';

interface EventCalendarProps {
  open: boolean;
  registrations: EventRegistration[];
  loading?: boolean;
  // Set when the registrations request itself failed. An empty calendar and a
  // broken backend look identical otherwise, which is exactly the confusion
  // this feature caused the first time it shipped.
  error?: string | null;
  onClose: () => void;
  onRemove: (eventKey: string) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Everything here buckets by UTC, deliberately. The backend resolves each
// event's start instant in UTC (it has no way to know the viewer's timezone)
// and schedules the reminders off that. If the grid placed an event by local
// date, an event near midnight would sit on one day and be reminded about on
// another. The human-readable time still comes from the source's own strings,
// so nothing here invents a precision the listing never had.
const utcDayKey = (iso: string) => iso.slice(0, 10);

const utcKeyOf = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const todayKey = () => new Date().toISOString().slice(0, 10);

// Days in a month, and the Monday-first offset its 1st falls on.
const monthMeta = (year: number, month: number) => {
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leadingBlanks = (first.getUTCDay() + 6) % 7; // Sun=0 → Mon-first
  return { daysInMonth, leadingBlanks };
};

// What the source itself said about when this happens. Preferred over any
// reformatting of startAt — "May 05 - Jun 11, 2026" carries more truth than
// a single synthesised timestamp would.
const whenText = (reg: EventRegistration) => {
  const parts = [reg.timeText, reg.dateText && !reg.timeText ? reg.dateText : null].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  if (reg.startAt) {
    return new Date(reg.startAt).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    }) + ' UTC';
  }
  return 'Time to be announced';
};

// Plain-language state of this registration's two reminders.
// `short` is what the badge shows — it has to survive a 320px-wide screen
// without wrapping into a blob, and the full schedule is already stated once
// in the modal header. `full` becomes the tooltip.
const reminderState = (reg: EventRegistration): {
  short: string; full: string; sent: boolean; muted: boolean;
} => {
  if (!reg.startAt) {
    return { short: 'No date', full: 'No date given — reminders cannot be scheduled', sent: false, muted: true };
  }
  if (new Date(reg.startAt).getTime() < Date.now()) {
    return { short: 'Passed', full: 'This event has already taken place', sent: true, muted: true };
  }
  if (reg.remindedDayOfAt) {
    return { short: 'Reminded today', full: 'Both reminders sent — this event starts today', sent: true, muted: false };
  }
  if (reg.remindedDayBeforeAt) {
    return { short: 'Reminded', full: 'Day-before reminder sent; the morning-of reminder is still to come', sent: true, muted: false };
  }
  return { short: 'Reminders on', full: 'Reminders set for 1 day before and the morning of', sent: false, muted: false };
};

const SOURCE_LABEL: Record<string, string> = {
  local: 'Medzae',
  eventbrite: 'Eventbrite',
  hackclub: 'Hack Club',
  devpost: 'Devpost',
};

// ─── Span colours ──────────────────────────────────────────────────
// Four categorical hues so overlapping multi-day events stay distinguishable
// instead of merging into one block. This exact set was validated with the
// data-viz palette checker against the white calendar surface using the
// all-pairs rule (any two events can land in the same square, so it isn't
// enough for neighbours alone to separate):
//
//   lightness band PASS · chroma floor PASS
//   worst all-pairs CVD ΔE 9.2 (aqua↔orange, deutan) — above the 8 target
//   worst all-pairs normal-vision ΔE 16.3 (violet↔blue) — above the 15 floor
//
// Five hues could not clear those floors in any ordering, so the palette stops
// at four rather than inventing a fifth. Aqua sits at 2.8:1 against white,
// under the 3:1 contrast line, which obliges the "relief" rule — every event is
// also named in the list beside the grid, so identity is never colour-alone.
const SPAN_COLORS = [
  { fill: '#2a78d6', name: 'blue' },
  { fill: '#eb6834', name: 'orange' },
  { fill: '#1baf7a', name: 'aqua' },
  { fill: '#4a3aa7', name: 'violet' },
];

// Past the four validated slots, events fold into one neutral rather than
// cycling the hues — a repeated hue would claim two events are the same thing.
// They stay tellable apart by name and by their own row in the list.
const OVERFLOW_COLOR = { fill: '#64748B', name: 'slate' };

const colorForIndex = (i: number) => (i < SPAN_COLORS.length ? SPAN_COLORS[i] : OVERFLOW_COLOR);

// Geometry of the bar strip inside a day square.
// The square is rounded-lg (8px). A full-width bar closer than that to the
// bottom gets eaten by the corner arc — which is what made three bars read as
// one buckled blob — so the strip starts at the radius, where the edges are
// straight again.
const BAR_H = 3;
const BAR_GAP = 2;
const STRIP_BOTTOM = 8;
const MAX_BARS = 3;
const stripHeight = (n: number) => n * BAR_H + Math.max(0, n - 1) * BAR_GAP;

/** Inclusive day span between two UTC instants, capped against bad parses. */
const MAX_SPAN_DAYS = 400;
const daySpan = (startISO: string, endISO: string | null) => {
  if (!endISO) return 1;
  const a = Date.parse(startISO.slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(endISO.slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  const days = Math.round((b - a) / 86400000) + 1;
  return days < 1 ? 1 : Math.min(days, MAX_SPAN_DAYS);
};

const addUTCDays = (iso: string, n: number) =>
  new Date(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') + n * 86400000)
    .toISOString().slice(0, 10);

// One event's presence on one calendar square.
interface DayEntry {
  reg: EventRegistration;
  color: { fill: string; name: string };
  isFirst: boolean;
  isLast: boolean;
  dayIndex: number;   // 1-based
  totalDays: number;
  /**
   * Fixed row within the day's bar strip, held for the event's whole span.
   * Without this the strip re-stacks per day, so a three-day event would sit
   * in the bottom row on a quiet day and the middle row on a busy one — the
   * run zig-zags instead of reading as one continuous band.
   */
  lane: number;
}

/** Human range: "14–16 Aug 2026", or a single date when it's a one-day event. */
const rangeText = (reg: EventRegistration) => {
  if (!reg.startAt) return null;
  const fmt = (iso: string, withMonth = true, withYear = true) =>
    new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      ...(withMonth ? { month: 'short' as const } : {}),
      ...(withYear ? { year: 'numeric' as const } : {}),
      timeZone: 'UTC',
    });
  if (!reg.endAt || daySpan(reg.startAt, reg.endAt) === 1) return fmt(reg.startAt);
  const sameMonth = reg.startAt.slice(0, 7) === reg.endAt.slice(0, 7);
  // "14–16 Aug 2026" reads better than repeating the month on both ends.
  return `${fmt(reg.startAt, !sameMonth, false)} – ${fmt(reg.endAt)}`;
};

export default function EventCalendar({
  open, registrations, loading, error, onClose, onRemove,
}: EventCalendarProps) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(now.getUTCMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Colour is assigned from a stable ordering of the whole registration set
  // (oldest first), never from position in a filtered view — changing month or
  // selecting a day must not repaint the events that remain on screen.
  const colorByKey = useMemo(() => {
    const order = [...registrations].sort((a, b) =>
      Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.eventKey.localeCompare(b.eventKey)
    );
    return new Map(order.map((r, i) => [r.eventKey, colorForIndex(i)]));
  }, [registrations]);

  // Group registrations by UTC day. A multi-day event is written into EVERY
  // square it covers — that is what makes a 14–16 Aug conference read as three
  // days rather than one. Undated ones are kept aside so they stay reachable
  // instead of silently vanishing from the calendar.
  const { byDay, undated, laneCount } = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    const none: EventRegistration[] = [];
    const dated: EventRegistration[] = [];
    for (const reg of registrations) {
      (reg.startAt ? dated : none).push(reg);
    }

    // Lane packing. Earliest start first, longest first on ties, so the events
    // that constrain the most days claim their lane before short ones fill it.
    const ordered = [...dated].sort((a, b) => {
      const byStart = Date.parse(a.startAt!) - Date.parse(b.startAt!);
      if (byStart) return byStart;
      const sa = daySpan(a.startAt!, a.endAt);
      const sb = daySpan(b.startAt!, b.endAt);
      if (sb !== sa) return sb - sa;
      return a.eventKey.localeCompare(b.eventKey);
    });

    const occupancy = new Map<string, Set<number>>();
    let maxLane = -1;

    for (const reg of ordered) {
      const totalDays = daySpan(reg.startAt!, reg.endAt);
      const days: string[] = [];
      for (let i = 0; i < totalDays; i += 1) days.push(addUTCDays(reg.startAt!, i));

      // Lowest lane that is free on EVERY day this event covers.
      let lane = 0;
      while (days.some(d => occupancy.get(d)?.has(lane))) lane += 1;
      if (lane > maxLane) maxLane = lane;

      const color = colorByKey.get(reg.eventKey) || OVERFLOW_COLOR;
      days.forEach((key, i) => {
        const taken = occupancy.get(key) || new Set<number>();
        taken.add(lane);
        occupancy.set(key, taken);

        const entry: DayEntry = {
          reg, color, lane,
          isFirst: i === 0,
          isLast: i === totalDays - 1,
          dayIndex: i + 1,
          totalDays,
        };
        const list = map.get(key);
        if (list) list.push(entry); else map.set(key, [entry]);
      });
    }

    for (const list of map.values()) list.sort((a, b) => a.lane - b.lane);

    return {
      byDay: map,
      undated: none,
      // Every square reserves the same number of rows, so bars line up across
      // the grid and the day numbers all sit at the same height.
      laneCount: Math.min(maxLane + 1, MAX_BARS),
    };
  }, [registrations, colorByKey]);

  // "Coming up" includes events already under way — a conference on its second
  // day has not stopped being relevant just because it started yesterday.
  const upcoming = useMemo(
    () => registrations
      .filter(r => {
        if (!r.startAt) return false;
        const finishes = r.endAt
          ? Date.parse(r.endAt.slice(0, 10) + 'T23:59:59Z')
          : Date.parse(r.startAt);
        return finishes >= Date.now();
      })
      .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime()),
    [registrations]
  );

  const { daysInMonth, leadingBlanks } = monthMeta(viewYear, viewMonth);
  const today = todayKey();

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(d.getUTCFullYear());
    setViewMonth(d.getUTCMonth());
  };

  const jumpToToday = () => {
    const d = new Date();
    setViewYear(d.getUTCFullYear());
    setViewMonth(d.getUTCMonth());
    setSelectedDay(todayKey());
  };

  // The detail pane shows the selected day, or the next few upcoming events
  // when nothing is selected — an empty pane on open would waste the space.
  // Both are DayEntry[] so the card renders one shape; the "coming up" view
  // always describes an event from its own first day.
  const detailList: DayEntry[] = selectedDay
    ? (byDay.get(selectedDay) || [])
    : upcoming.slice(0, 6).map(reg => {
        const totalDays = reg.startAt ? daySpan(reg.startAt, reg.endAt) : 1;
        return {
          reg,
          color: colorByKey.get(reg.eventKey) || OVERFLOW_COLOR,
          isFirst: true,
          isLast: totalDays === 1,
          dayIndex: 1,
          totalDays,
          lane: 0, // unused in the list view; lanes only position grid bars
        };
      });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-[rgba(0,11,51,0.42)] backdrop-blur-sm flex items-center justify-center z-[100] fade-in p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Your event calendar"
    >
      {/* Phones get a full-bleed sheet: at 320px a centred card with margins
          leaves the 7-column month grid too narrow to tap accurately. From
          `sm` up it becomes a normal centred modal. */}
      <div
        className="relative bg-[var(--color-surface-white)] w-full h-full rounded-none border-0 sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-2xl sm:border border-[var(--color-border-hairline)] overflow-hidden flex flex-col"
        style={{ boxShadow: 'var(--shadow-modal)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Head. On very short viewports (a landscape phone is ~360px tall,
            leaving the modal ~330px) the eyebrow and subtitle would eat half
            the sheet before a single calendar row showed, so they collapse. */}
        <div className="px-4 sm:px-6 md:px-8 pt-5 sm:pt-7 pb-4 sm:pb-5 [@media(max-height:430px)]:py-3 border-b border-[var(--color-border-hairline)] flex items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="label !mb-2 [@media(max-height:430px)]:hidden">Your calendar</p>
            <h2
              className="text-[var(--color-navy)]"
              style={{
                fontFamily: 'var(--font-fraunces), serif',
                fontSize: 'clamp(1.4rem, 2.6vw, 1.75rem)',
                fontWeight: 500,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
              }}
            >
              Registered events
            </h2>
            <p className={`body-sm mt-1.5 [@media(max-height:430px)]:hidden ${error ? 'text-red-600' : 'text-[var(--color-text-muted)]'}`}>
              {error
                ? error
                : registrations.length === 0
                  ? 'Nothing here yet — confirm a registration and it lands on this calendar.'
                  : `${registrations.length} registration${registrations.length === 1 ? '' : 's'} · reminders 1 day before and the morning of`}
            </p>
          </div>
          <button onClick={onClose} className="icon-btn shrink-0" aria-label="Close calendar">
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          {/* ── Month grid ── */}
          <div className="p-4 sm:p-6 md:p-7 min-w-0 lg:border-r border-[var(--color-border-hairline)]">
            {/* Below `lg` the grid is the full width of the modal, and square
                day cells would then balloon on any wide-but-short screen (a
                landscape phone gave 91px cells, so barely two rows fit above
                the fold). Cap the width there and centre it; from `lg` the
                two-column layout already constrains it. */}
            <div className="w-full max-w-[440px] mx-auto lg:max-w-none lg:mx-0">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-1">
                <button onClick={() => shiftMonth(-1)} className="icon-btn icon-btn-sm" aria-label="Previous month">
                  <ChevronLeft className="w-4 h-4" strokeWidth={2} />
                </button>
                <button onClick={() => shiftMonth(1)} className="icon-btn icon-btn-sm" aria-label="Next month">
                  <ChevronRight className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
              <p className="text-[var(--color-navy)] font-semibold text-[0.85rem] sm:text-[0.95rem] truncate px-1">
                {MONTHS[viewMonth]} {viewYear}
              </p>
              <button onClick={jumpToToday} className="btn-ghost !px-2 sm:!px-3 !py-1.5 !text-[0.7rem] sm:!text-[0.75rem] shrink-0">
                Today
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center text-[10px] uppercase tracking-[0.14em] font-semibold text-[var(--color-text-soft)] py-1">
                  {/* Initials on phones; the full abbreviation once there's room. */}
                  <span className="sm:hidden">{d.slice(0, 1)}</span>
                  <span className="hidden sm:inline">{d}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: leadingBlanks }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const key = utcKeyOf(viewYear, viewMonth, day);
                const events = byDay.get(key) || [];
                const isToday = key === today;
                const isSelected = key === selectedDay;
                const hasEvents = events.length > 0;

                // Up to three bars per square; a fourth event becomes "+N"
                // rather than shrinking every bar into invisibility.
                // Draw one row per reserved lane; a lane with nothing in it on
                // this day renders as an invisible spacer so the lanes above
                // and below stay put.
                const lanes: (DayEntry | null)[] = Array.from(
                  { length: laneCount },
                  (_, i) => events.find(e => e.lane === i) || null
                );
                const overflow = events.filter(e => e.lane >= laneCount).length;

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(isSelected ? null : key)}
                    disabled={!hasEvents && !isToday}
                    className={[
                      'aspect-square rounded-lg flex items-center justify-center text-[0.75rem] sm:text-[0.8rem] transition-colors relative overflow-hidden',
                      isSelected
                        ? 'bg-[var(--color-navy)] text-white font-semibold'
                        : hasEvents
                          ? 'bg-[var(--color-surface-elevated)] text-[var(--color-navy)] font-semibold hover:bg-[var(--color-accent-soft)]'
                          : isToday
                            ? 'text-[var(--color-navy)] font-semibold hover:bg-[var(--color-surface-elevated)]'
                            : 'text-[var(--color-text-soft)] cursor-default',
                      isToday && !isSelected ? 'ring-1 ring-[var(--color-accent)] ring-inset' : '',
                    ].join(' ')}
                    // Reserve the strip's height so the number centres in the
                    // space ABOVE the bars instead of colliding with them on a
                    // small square.
                    style={laneCount > 0 ? { paddingBottom: STRIP_BOTTOM + stripHeight(laneCount) } : undefined}
                    aria-label={
                      hasEvents
                        ? `${day} — ${events.length} event${events.length === 1 ? '' : 's'}: ${events.map(e => e.reg.title).join(', ')}`
                        : `${day}`
                    }
                    title={hasEvents ? events.map(e => e.reg.title).join('\n') : undefined}
                  >
                    <span className="leading-none">{day}</span>

                    {/* Overflow count goes in the corner, not in the strip —
                        inside it, the bars got squeezed to fit the text. */}
                    {overflow > 0 && (
                      <span className={`absolute top-[3px] right-[4px] text-[8px] leading-none font-semibold ${isSelected ? 'text-white/70' : 'text-[var(--color-text-soft)]'}`}>
                        +{overflow}
                      </span>
                    )}

                    {hasEvents && (
                      // Bars run edge to edge so consecutive days of one event
                      // read as a continuous run, with only the true first and
                      // last day rounded. They sit STRIP_BOTTOM up from the
                      // bottom — clear of the 8px corner radius, which was
                      // clipping their ends and making three bars look like one
                      // buckled block. Each bar is its own mark with a 2px gap;
                      // that gap is what stops two events merging, colour aside.
                      <span
                        className="absolute inset-x-0 flex flex-col"
                        style={{ bottom: STRIP_BOTTOM, gap: BAR_GAP }}
                      >
                        {lanes.map((e, laneIdx) => (
                          <span
                            key={laneIdx}
                            className="w-full"
                            style={{
                              height: BAR_H,
                              background: e ? e.color.fill : 'transparent',
                              borderTopLeftRadius: e?.isFirst ? 2 : 0,
                              borderBottomLeftRadius: e?.isFirst ? 2 : 0,
                              borderTopRightRadius: e?.isLast ? 2 : 0,
                              borderBottomRightRadius: e?.isLast ? 2 : 0,
                            }}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {undated.length > 0 && (
              <div className="mt-6 pt-5 border-t border-[var(--color-border-hairline)]">
                <p className="label !mb-2.5">No date given</p>
                <div className="space-y-1.5">
                  {undated.map(reg => (
                    <div key={reg.eventKey} className="flex items-center justify-between gap-2 text-[0.8rem]">
                      <span className="text-[var(--color-text)] truncate min-w-0">{reg.title}</span>
                      <button
                        onClick={() => onRemove(reg.eventKey)}
                        className="icon-btn icon-btn-sm icon-btn-danger shrink-0"
                        aria-label={`Remove ${reg.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
          </div>

          {/* ── Detail pane ── */}
          <div className="p-4 sm:p-6 md:p-7 min-w-0 bg-[var(--color-surface-elevated)] border-t lg:border-t-0 border-[var(--color-border-hairline)]">
            <p className="label !mb-3.5">
              {selectedDay
                ? new Date(`${selectedDay}T00:00:00Z`).toLocaleDateString('en-GB', {
                    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
                  })
                : 'Coming up'}
            </p>

            {loading ? (
              <div className="space-y-2.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-20 rounded-xl bg-[var(--color-surface-white)] shimmer" />
                ))}
              </div>
            ) : detailList.length === 0 ? (
              // `empty-plate` is a fixed 4rem icon plate — it wraps the icon
              // only. Wrapping the whole empty state in it squeezed the text
              // into a bordered 64px box.
              <div className="py-10 text-center">
                <div className="empty-plate">
                  <CalendarDays className="w-7 h-7" strokeWidth={1.25} />
                </div>
                <p className="label justify-center !mb-2">
                  {selectedDay ? 'Free day' : 'Nothing scheduled'}
                </p>
                <p className="body-sm text-[var(--color-text-muted)] max-w-[24ch] mx-auto leading-relaxed">
                  {selectedDay
                    ? 'No registrations on this day.'
                    : 'Register for an event and confirm it — it lands here with reminders.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {detailList.map(({ reg, color, totalDays, dayIndex }) => {
                  const reminder = reminderState(reg);
                  const span = rangeText(reg);
                  return (
                    <div key={reg.eventKey} className="card-item p-3.5 sm:p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        {/* The colour chip is this card's half of the legend:
                            it ties the row to its bars in the grid, and the
                            title beside it means identity is never colour
                            alone (aqua sits under 3:1 on white). */}
                        <div className="flex items-start gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 mt-[5px]"
                            style={{ background: color.fill }}
                            aria-hidden
                          />
                          {/* min-w-0 + break-words: third-party titles can be a
                              single very long unbroken string. */}
                          <p className="text-[0.875rem] sm:text-[0.9rem] font-semibold text-[var(--color-navy)] leading-snug min-w-0 break-words">
                            {reg.title}
                          </p>
                        </div>
                        <button
                          onClick={() => onRemove(reg.eventKey)}
                          className="icon-btn icon-btn-sm icon-btn-danger shrink-0"
                          aria-label={`Remove ${reg.title} from calendar`}
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </button>
                      </div>

                      <div className="space-y-1 mb-3">
                        {totalDays > 1 && (
                          <p className="flex items-start gap-1.5 text-[0.78rem] font-semibold text-[var(--color-navy)]">
                            <CalendarDays className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.75} />
                            <span className="min-w-0 break-words">
                              {span} · {totalDays} days
                              {selectedDay ? ` · day ${dayIndex}` : ''}
                            </span>
                          </p>
                        )}
                        {/* Devpost's "time" is itself a date range ("Aug 21 -
                            25, 2026"), so on a multi-day event it just repeats
                            the span line above. Only show it when it carries an
                            actual clock time. */}
                        {(totalDays === 1 || /\d{1,2}:\d{2}/.test(reg.timeText || '')) && (
                          <p className="flex items-start gap-1.5 text-[0.78rem] text-[var(--color-text-muted)]">
                            <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.75} />
                            <span className="min-w-0 break-words">{whenText(reg)}</span>
                          </p>
                        )}
                        {reg.location && (
                          <p className="flex items-start gap-1.5 text-[0.78rem] text-[var(--color-text-muted)]">
                            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.75} />
                            <span className="min-w-0 break-words">{reg.location}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex items-center flex-wrap gap-1.5">
                        <span className="badge badge-sm badge-muted">
                          {SOURCE_LABEL[reg.source] || reg.source}
                        </span>
                        <span
                          className={`badge badge-sm inline-flex items-center gap-1 max-w-full ${reminder.muted ? 'badge-muted' : reminder.sent ? 'badge-success' : ''}`}
                          title={reminder.full}
                        >
                          {reminder.muted
                            ? <BellOff className="w-3 h-3 shrink-0" strokeWidth={2} />
                            : <BellRing className="w-3 h-3 shrink-0" strokeWidth={2} />}
                          {reminder.short}
                        </span>
                        {reg.externalUrl && (
                          <a
                            href={reg.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="badge badge-sm inline-flex items-center gap-1 hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" strokeWidth={2} /> Event page
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
