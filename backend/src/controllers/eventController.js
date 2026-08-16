import prisma from '../config/prisma.js'
import { resolveStartAt, resolveEndAt, parseDevpostRange } from '../utils/eventSchedule.js'
import { kickEventReminderSweep, runEventReminderSweep } from '../utils/eventReminders.js'

// ─── Eventbrite cache (24-hour TTL) ────────────────────────────────
const EVENTBRITE_TOKEN = process.env.EVENTBRITE_TOKEN
const EVENTBRITE_BASE  = 'https://www.eventbriteapi.com/v3'
const CACHE_TTL_MS     = 24 * 60 * 60 * 1000 // 24 hours

let eventbriteCache = {
  events: [],
  fetchedAt: 0,
}

// Helper: map Eventbrite format tag → our type
const mapFormatTag = (tags) => {
  const formatTag = tags?.find(t => t.prefix === 'EventbriteFormat')
  const name = formatTag?.display_name?.toLowerCase() || ''
  if (name.includes('seminar') || name.includes('talk') || name.includes('class')) return 'Workshop'
  if (name.includes('conference')) return 'Conference'
  if (name.includes('festival') || name.includes('expo') || name.includes('show')) return 'Fest'
  if (name.includes('networking') || name.includes('party')) return 'Fest'
  if (name.includes('workshop') || name.includes('training')) return 'Workshop'
  return 'Conference'
}

// Helper: fetch real image URL from Eventbrite media API
const fetchImageUrl = async (imageId) => {
  if (!imageId) return ''
  try {
    const res = await fetch(`${EVENTBRITE_BASE}/media/${imageId}/?token=${EVENTBRITE_TOKEN}`)
    if (res.ok) {
      const data = await res.json()
      return data.original?.url || data.crop_mask?.original?.url || data.url || ''
    }
  } catch (err) {
    console.error(`[Eventbrite] Failed to fetch image ${imageId}:`, err.message)
  }
  return ''
}

// Helper: resolve image URL from multiple possible fields on the event object.
// Inline fields are checked first (no network); the media API — a separate
// round-trip per event, historically the biggest source of latency in the
// cold aggregation — is only used when nothing inline is available.
const resolveImageUrl = async (event) => {
  // 1) Direct image object (some API responses include this)
  if (event.image?.url) return event.image.url
  if (event.image?.original?.url) return event.image.original.url

  // 2) Logo object
  if (event.logo?.url) return event.logo.url
  if (event.logo?.original?.url) return event.logo.original.url

  // 3) Primary image
  if (event.primary_image?.url) return event.primary_image.url

  // 4) Last resort: resolve the image_id via the media API
  return await fetchImageUrl(event.image_id)
}

// Helper: extract city location from locations array
const getLocation = (locations, isOnline) => {
  if (isOnline) return 'Online'
  if (!locations || !locations.length) return 'TBA'
  const locality = locations.find(l => l.type === 'locality')
  const region = locations.find(l => l.type === 'region')
  const country = locations.find(l => l.type === 'country')
  const parts = [locality?.name, region?.name, country?.name].filter(Boolean)
  return parts.join(', ') || 'TBA'
}

// Helper: format time from HH:MM to 12hr format
const formatTime12 = (time24) => {
  if (!time24) return ''
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 || 12
  return `${hr.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`
}

// Helper: map a single destination_event → our Event shape (imageUrl resolved separately)
const mapDestinationEvent = (eb, imageUrl) => {
  const startTime = formatTime12(eb.start_time)
  const endTime   = formatTime12(eb.end_time)
  const timeStr   = startTime && endTime ? `${startTime} - ${endTime}` : startTime || 'TBA'

  return {
    _id:              `eb-${eb.id}`,
    id:               `eb-${eb.id}`,
    title:            eb.name || 'Untitled Event',
    organizer:        'Eventbrite',
    date:             eb.start_date || '',
    // Only meaningful when it differs from the start — Eventbrite sends
    // end_date on single-day events too.
    endDate:          eb.end_date && eb.end_date !== eb.start_date ? eb.end_date : '',
    time:             timeStr,
    location:         getLocation(eb.locations, eb.is_online_event),
    mode:             eb.is_online_event ? 'Online' : 'On-campus',
    type:             mapFormatTag(eb.tags),
    shortDescription: eb.summary || '',
    longDescription:  eb.summary || '',
    imageUrl:         imageUrl || '',
    featured:         false,
    capacity:         null,
    registered:       0,
    isRegistered:     false,
    source:           'eventbrite',
    eventbriteUrl:    eb.url || '',
  }
}

// Fetch events from Eventbrite destination/search API (with 24hr cache)
const fetchEventbriteEvents = async () => {
  const now = Date.now()
  if (eventbriteCache.events.length > 0 && now - eventbriteCache.fetchedAt < CACHE_TTL_MS) {
    console.log(`[Eventbrite] Returning ${eventbriteCache.events.length} cached events`)
    return eventbriteCache.events
  }

  const allEvents = []

  // Search queries for medical/health events
  const queries = [
    'medical health conference',
    'healthcare workshop',
    'medical seminar',
    'nursing conference',
    'clinical research',
  ]

  // Run all searches in parallel — they're independent, so there's no reason
  // to pay for them one after another (5× the latency).
  const searchResults = await Promise.allSettled(
    queries.map(async (q) => {
      const res = await fetch(`${EVENTBRITE_BASE}/destination/search/?token=${EVENTBRITE_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_search: {
            dates: 'current_future',
            page_size: 20,
            q,
          },
        }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      return data.events?.results || []
    })
  )
  searchResults.forEach((r, i) => {
    if (r.status === 'fulfilled') allEvents.push(...r.value)
    else console.error(`[Eventbrite] Search for "${queries[i]}" failed:`, r.reason?.message || r.reason)
  })

  // Deduplicate by event ID
  const seen = new Set()
  const unique = allEvents.filter(e => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })

  // Fetch real image URLs in parallel (batch of 10 at a time to avoid rate limits)
  const imageUrls = new Map()
  for (let i = 0; i < unique.length; i += 10) {
    const batch = unique.slice(i, i + 10)
    const urls = await Promise.all(batch.map(e => resolveImageUrl(e)))
    batch.forEach((e, idx) => imageUrls.set(e.id, urls[idx]))
  }

  const mapped = unique.map(e => mapDestinationEvent(e, imageUrls.get(e.id) || ''))

  eventbriteCache = { events: mapped, fetchedAt: Date.now() }
  console.log(`[Eventbrite] Cached ${mapped.length} events at ${new Date().toISOString()}`)
  return mapped
}

// @desc    Get Eventbrite events (cached 24hr)
// @route   GET /api/events/eventbrite
export const getEventbriteEvents = async (req, res) => {
  try {
    const events = await fetchEventbriteEvents()
    res.json(events)
  } catch (error) {
    console.error('Eventbrite controller error:', error)
    res.status(500).json({ message: 'Failed to fetch Eventbrite events', error: error.message })
  }
}

// @desc    Force refresh Eventbrite cache
// @route   POST /api/events/eventbrite/refresh
export const refreshEventbriteCache = async (req, res) => {
  eventbriteCache = { events: [], fetchedAt: 0 }
  try {
    const events = await fetchEventbriteEvents()
    res.json({ message: `Cache refreshed with ${events.length} events`, events })
  } catch (error) {
    res.status(500).json({ message: 'Failed to refresh cache', error: error.message })
  }
}

// ─── Multi-source external event aggregation (24-hour cache) ───────
// Sources: Eventbrite (above) + Hack Club + Devpost. Each fetcher is
// independent and failure-isolated, so one bad source can't break the
// page. To add another source (paid API, RSS, etc.), write a fetcher
// that returns this same normalised shape and add it to the
// Promise.allSettled list in fetchExternalEvents().

// A realistic browser UA — some endpoints (Devpost) reject non-browser agents.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Coarse region buckets used by the "Region" filter on the events page.
const COUNTRY_REGION = {
  IN: 'India',
  US: 'North America', CA: 'North America',
  MX: 'Latin America', BR: 'Latin America', AR: 'Latin America', CL: 'Latin America',
  CO: 'Latin America', PE: 'Latin America', UY: 'Latin America', EC: 'Latin America',
  GB: 'Europe', IE: 'Europe', FR: 'Europe', DE: 'Europe', ES: 'Europe', IT: 'Europe',
  NL: 'Europe', SE: 'Europe', NO: 'Europe', FI: 'Europe', DK: 'Europe', PL: 'Europe',
  PT: 'Europe', CH: 'Europe', AT: 'Europe', BE: 'Europe', CZ: 'Europe', GR: 'Europe',
  RO: 'Europe', HU: 'Europe', UA: 'Europe', RS: 'Europe', SK: 'Europe', BG: 'Europe',
  CN: 'Asia-Pacific', JP: 'Asia-Pacific', KR: 'Asia-Pacific', SG: 'Asia-Pacific',
  MY: 'Asia-Pacific', ID: 'Asia-Pacific', TH: 'Asia-Pacific', VN: 'Asia-Pacific',
  PH: 'Asia-Pacific', AU: 'Asia-Pacific', NZ: 'Asia-Pacific', HK: 'Asia-Pacific',
  TW: 'Asia-Pacific', BD: 'Asia-Pacific', PK: 'Asia-Pacific', LK: 'Asia-Pacific', NP: 'Asia-Pacific',
  AE: 'Middle East & Africa', SA: 'Middle East & Africa', QA: 'Middle East & Africa',
  IL: 'Middle East & Africa', TR: 'Middle East & Africa', EG: 'Middle East & Africa',
  ZA: 'Middle East & Africa', NG: 'Middle East & Africa', KE: 'Middle East & Africa',
  MA: 'Middle East & Africa', GH: 'Middle East & Africa',
}

// Fallback when we only have a free-text location string (no country code).
const REGION_KEYWORDS = [
  { region: 'India', re: /\b(india|bengaluru|bangalore|mumbai|delhi|hyderabad|chennai|pune|kolkata|gurgaon|gurugram|noida|ahmedabad|jaipur)\b/i },
  { region: 'North America', re: /\b(usa|u\.s\.a|united states|america|new york|san francisco|boston|chicago|seattle|los angeles|texas|california|canada|toronto|vancouver|ontario)\b/i },
  { region: 'Europe', re: /\b(uk|united kingdom|england|london|france|paris|germany|berlin|munich|spain|madrid|barcelona|italy|rome|netherlands|amsterdam|sweden|stockholm|europe|ireland|dublin|poland|portugal|lisbon|switzerland|zurich)\b/i },
  { region: 'Asia-Pacific', re: /\b(china|beijing|shanghai|japan|tokyo|korea|seoul|singapore|malaysia|indonesia|thailand|bangkok|vietnam|philippines|australia|sydney|melbourne|new zealand|hong kong|taiwan|bangladesh|pakistan|sri lanka|nepal)\b/i },
  { region: 'Middle East & Africa', re: /\b(uae|dubai|abu dhabi|saudi|qatar|doha|israel|tel aviv|turkey|istanbul|egypt|cairo|africa|nigeria|lagos|kenya|nairobi|south africa|morocco)\b/i },
  { region: 'Latin America', re: /\b(mexico|brazil|sao paulo|argentina|buenos aires|chile|santiago|colombia|bogota|peru|lima)\b/i },
]

// Resolve an event to a region bucket. Prefers an ISO country code, then
// keyword-matches a location string, then defaults to "Other".
const deriveRegion = (countryCode, location, isOnline) => {
  if (isOnline) return 'Online'
  if (countryCode && COUNTRY_REGION[countryCode.toUpperCase()]) {
    return COUNTRY_REGION[countryCode.toUpperCase()]
  }
  const text = location || ''
  for (const { region, re } of REGION_KEYWORDS) {
    if (re.test(text)) return region
  }
  return 'Other'
}

// Format an HH:MM time slice out of an ISO timestamp (UTC).
const isoTimeUTC = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
}

// Medical/healthcare relevance filter. General sources (Hack Club, Devpost)
// list every kind of event, so we keep only those whose title/themes match
// these terms. Eventbrite is already health-scoped by its search queries.
const HEALTH_RE = /\b(health|healthcare|medical|medicine|med-?tech|clinic|clinical|hospital|patient|biotech|bio-?medical|life ?science|pharma|pharmaceutical|wellness|mental health|telemedicine|telehealth|nursing|nurse|surgery|surgical|disease|genom|genetic|diagnos|therapy|therapeutic|neuro|cardio|oncolog|cancer|covid|vaccine|epidemic|pandemic|public health|disability|assistive|accessib|aging|elder|nutrition|mhealth|ehealth|digital health)\b/i

// ── Hack Club: free, no-auth JSON of upcoming hackathons worldwide ──
const HACKCLUB_URL = 'https://hackathons.hackclub.com/api/events/upcoming'

const fetchHackClubEvents = async () => {
  try {
    const res = await fetch(HACKCLUB_URL, { headers: { 'User-Agent': BROWSER_UA } })
    if (!res.ok) { console.error(`[HackClub] status ${res.status}`); return [] }
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data
      .filter(e => HEALTH_RE.test(e.name || ''))
      .map(e => {
      const isOnline = !!e.virtual
      const mode = isOnline ? 'Online' : e.hybrid ? 'Hybrid' : 'On-campus'
      const location = isOnline
        ? 'Online'
        : [e.city, e.state, e.country].filter(Boolean).join(', ') || 'TBA'
      const start = isoTimeUTC(e.start)
      const end = isoTimeUTC(e.end)
      return {
        _id: `hc-${e.id}`,
        id: `hc-${e.id}`,
        title: e.name || 'Untitled Hackathon',
        organizer: e.hack_club_event ? 'Hack Club' : 'Community Hackathon',
        date: e.start || '',
        // Hackathons routinely run a weekend or longer; e.end is a full ISO
        // instant, so the calendar can span it exactly.
        endDate: e.end || '',
        time: start && end ? `${start} – ${end} UTC` : start ? `${start} UTC` : 'TBA',
        location,
        mode,
        type: 'Hackathon',
        shortDescription: location === 'Online' ? 'Online hackathon.' : `Hackathon in ${location}.`,
        longDescription: `${e.name} — a hackathon ${location === 'Online' ? 'held online' : `taking place in ${location}`}. Visit the official site for the schedule, eligibility, and registration.`,
        imageUrl: e.banner || e.logo || '',
        featured: false,
        capacity: null,
        registered: 0,
        isRegistered: false,
        source: 'hackclub',
        region: deriveRegion(e.countryCode, location, isOnline),
        externalUrl: e.website || '',
      }
    })
  } catch (err) {
    console.error('[HackClub] fetch failed:', err.message)
    return []
  }
}

// ── Devpost: unofficial but stable JSON of hackathons (filtered to health-tech) ──
const DEVPOST_URL = 'https://devpost.com/api/hackathons'


const fetchDevpostEvents = async () => {
  const collected = []
  try {
    for (const page of [1, 2]) {
      const res = await fetch(`${DEVPOST_URL}?status[]=open&status[]=upcoming&page=${page}`, {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      })
      if (!res.ok) { console.error(`[Devpost] page ${page} status ${res.status}`); continue }
      const data = await res.json()
      if (data.hackathons?.length) collected.push(...data.hackathons)
    }
  } catch (err) {
    console.error('[Devpost] fetch failed:', err.message)
  }
  return collected
    .filter(h => HEALTH_RE.test(`${h.title || ''} ${(h.themes || []).map(t => t.name).join(' ')}`))
    .map(h => {
    const location = h.displayed_location?.location || 'Online'
    const isOnline = /online|everywhere|virtual/i.test(location)
    const themeText = (h.themes || []).map(t => t.name).join(' ')
    const thumb = h.thumbnail_url
      ? (h.thumbnail_url.startsWith('//') ? `https:${h.thumbnail_url}` : h.thumbnail_url)
      : ''
    const prize = h.prize_amount ? String(h.prize_amount).replace(/<[^>]+>/g, '') : ''
    const devpostRange = parseDevpostRange(h.submission_period_dates)
    return {
      _id: `dp-${h.id}`,
      id: `dp-${h.id}`,
      title: h.title || 'Untitled Hackathon',
      organizer: h.organization_name || 'Devpost',
      date: devpostRange.start,
      endDate: devpostRange.end,
      time: h.submission_period_dates || 'TBA',
      location,
      mode: isOnline ? 'Online' : 'On-campus',
      type: 'Hackathon',
      shortDescription: `${h.submission_period_dates || ''}${themeText ? ` · ${themeText}` : ''}`.trim() || 'Hackathon on Devpost.',
      longDescription: `${h.title} hosted by ${h.organization_name || 'Devpost'}. ${prize ? `Prizes: ${prize}. ` : ''}${h.registrations_count ? `${h.registrations_count} participants registered. ` : ''}Visit Devpost for full details and registration.`,
      imageUrl: thumb,
      featured: false,
      capacity: null,
      registered: h.registrations_count || 0,
      isRegistered: false,
      source: 'devpost',
      region: deriveRegion(null, location, isOnline),
      externalUrl: h.url || '',
    }
  })
}

// ── Aggregator: merge every source behind one 24hr in-memory cache ──
// Serving is stale-while-revalidate: a warm cache (even an expired one) is
// returned instantly and refreshed in the background, so a user only ever
// waits on the third-party APIs when the cache is completely empty (a brand
// new deploy, or the first hit after Render's free tier slept and wiped it —
// which startup warming pre-empts). This is what makes it feel like news.
let externalCache = { events: [], fetchedAt: 0 }
let externalRefreshInFlight = null

// Run the actual multi-source aggregation and repopulate the cache.
const refreshExternalCache = async () => {
  const [ebRes, hcRes, dpRes] = await Promise.allSettled([
    fetchEventbriteEvents(),
    fetchHackClubEvents(),
    fetchDevpostEvents(),
  ])

  // Eventbrite events predate the region/externalUrl fields — backfill them.
  const eb = (ebRes.status === 'fulfilled' ? ebRes.value : []).map(e => ({
    ...e,
    externalUrl: e.externalUrl || e.eventbriteUrl || '',
    region: e.region || deriveRegion(null, e.location, e.mode === 'Online'),
  }))
  const hc = hcRes.status === 'fulfilled' ? hcRes.value : []
  const dp = dpRes.status === 'fulfilled' ? dpRes.value : []

  // Merge + dedupe by id
  const seen = new Set()
  const merged = [...eb, ...hc, ...dp].filter(e => {
    if (!e || seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })

  // Sort by date ascending; undated events sink to the bottom.
  merged.sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : Infinity
    const db = b.date ? new Date(b.date).getTime() : Infinity
    return da - db
  })

  externalCache = { events: merged, fetchedAt: Date.now() }
  console.log(`[External] Cached ${merged.length} events (EB:${eb.length} HC:${hc.length} DP:${dp.length})`)
  return merged
}

// Deduped refresh — only one aggregation runs at a time, so concurrent
// requests (and background refreshes) share a single set of upstream calls.
const triggerExternalRefresh = () => {
  if (!externalRefreshInFlight) {
    externalRefreshInFlight = refreshExternalCache()
      .catch((err) => {
        console.error('[External] refresh failed:', err.message)
        return externalCache.events // fall back to whatever we already had
      })
      .finally(() => { externalRefreshInFlight = null })
  }
  return externalRefreshInFlight
}

const fetchExternalEvents = async () => {
  const now = Date.now()
  const isFresh = externalCache.events.length > 0 && now - externalCache.fetchedAt < CACHE_TTL_MS
  if (isFresh) return externalCache.events

  // Stale but non-empty → serve it instantly, refresh in the background.
  if (externalCache.events.length > 0) {
    console.log(`[External] Serving ${externalCache.events.length} stale events; refreshing in background`)
    triggerExternalRefresh() // fire-and-forget
    return externalCache.events
  }

  // Cold cache → this is the only path that has to wait on the upstream APIs.
  return triggerExternalRefresh()
}

// Warm the cache in the background on server startup so the first visitor
// after a cold start reads a ready cache instead of blocking on aggregation.
export const warmExternalEvents = () => triggerExternalRefresh()

// @desc    Get aggregated external events (Eventbrite + Hack Club + Devpost), cached 24hr
// @route   GET /api/events/external
export const getExternalEvents = async (req, res) => {
  try {
    res.json(await fetchExternalEvents())
  } catch (error) {
    console.error('External events error:', error)
    res.status(500).json({ message: 'Failed to fetch external events', error: error.message })
  }
}

// @desc    Force refresh the external event cache
// @route   POST /api/events/external/refresh
export const refreshExternalEvents = async (req, res) => {
  externalCache = { events: [], fetchedAt: 0 }
  eventbriteCache = { events: [], fetchedAt: 0 }
  try {
    const events = await triggerExternalRefresh()
    res.json({ message: `Refreshed ${events.length} external events`, events })
  } catch (error) {
    res.status(500).json({ message: 'Failed to refresh external events', error: error.message })
  }
}

// @desc    Get all events
// @route   GET /api/events
export const getEvents = async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      include: { registeredUsers: { select: { id: true } } },
      orderBy: { date: 'asc' },
    })
    const eventsWithStatus = events.map(event => {
      const { registeredUsers, ...rest } = event
      return {
        ...rest,
        _id: event.id,
        region: deriveRegion(null, event.location, event.mode === 'Online'),
        registered: registeredUsers.length,
        isRegistered: req.user
          ? registeredUsers.some(u => u.id === req.user.id)
          : false,
      }
    })
    res.json(eventsWithStatus)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Create an event
// @route   POST /api/events
export const createEvent = async (req, res) => {
  try {
    const {
      title, organizer, date, endDate, time, location, mode, type,
      shortDescription, longDescription, imageUrl, featured, capacity,
    } = req.body

    const event = await prisma.event.create({
      data: {
        title, organizer, date, endDate: endDate || null, time, location, mode, type,
        shortDescription, longDescription, imageUrl, featured,
        capacity: capacity || 100,
        createdById: req.user.id,
      },
    })

    res.status(201).json({ ...event, _id: event.id })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Register/unregister for an event
// @route   PUT /api/events/:id/register
export const toggleRegistration = async (req, res) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: { registeredUsers: { select: { id: true } } },
    })
    if (!event) return res.status(404).json({ message: 'Event not found' })

    const isRegistered = event.registeredUsers.some(u => u.id === req.user.id)

    const updated = await prisma.event.update({
      where: { id: req.params.id },
      data: {
        registeredUsers: isRegistered
          ? { disconnect: { id: req.user.id } }
          : { connect: { id: req.user.id } },
      },
      include: { registeredUsers: { select: { id: true } } },
    })

    // Mirror into EventRegistration so the calendar has one source of truth
    // for local and external events alike, and so local events get reminders
    // on the same path as everything else.
    if (isRegistered) {
      await deleteRegistration(req.user.id, event.id)
    } else {
      await upsertRegistration(req.user.id, {
        eventKey: event.id,
        source: 'local',
        title: event.title,
        organizer: event.organizer,
        date: event.date,
        endDate: event.endDate,
        time: event.time,
        location: event.location,
        mode: event.mode,
        type: event.type,
        imageUrl: event.imageUrl,
      })
    }

    const { registeredUsers, ...rest } = updated
    res.json({
      ...rest,
      _id: updated.id,
      registered: registeredUsers.length,
      isRegistered: registeredUsers.some(u => u.id === req.user.id),
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// ─── Registrations & calendar ──────────────────────────────────────
// A registration is a snapshot, not a reference — see the EventRegistration
// model comment. External events vanish from the 24h cache; the user's
// calendar entry must not vanish with them.

// Shape an event payload into the snapshot columns, resolving the start
// instant that reminders are scheduled against.
const toSnapshot = (payload) => {
  const startAt = resolveStartAt({ date: payload.date, time: payload.time })
  return {
    source: payload.source || 'local',
    title: payload.title,
    organizer: payload.organizer || null,
    dateText: payload.date || null,
    endDateText: payload.endDate || null,
    timeText: payload.time || null,
    location: payload.location || null,
    mode: payload.mode || null,
    type: payload.type || null,
    imageUrl: payload.imageUrl || null,
    externalUrl: payload.externalUrl || null,
    startAt,
    endAt: resolveEndAt({ endDate: payload.endDate, time: payload.time }, startAt),
  }
}

async function upsertRegistration(userId, payload) {
  const snapshot = toSnapshot(payload)
  const existing = await prisma.eventRegistration.findUnique({
    where: { userId_eventKey: { userId, eventKey: payload.eventKey } },
  })

  // A moved event needs its already-sent reminders retired, otherwise the
  // stamps from the old date suppress the reminders for the new one.
  const startChanged =
    existing && existing.startAt?.getTime() !== snapshot.startAt?.getTime()
  const resetStamps = startChanged
    ? { remindedDayBeforeAt: null, remindedDayOfAt: null }
    : {}

  return prisma.eventRegistration.upsert({
    where: { userId_eventKey: { userId, eventKey: payload.eventKey } },
    create: { userId, eventKey: payload.eventKey, ...snapshot },
    update: { ...snapshot, ...resetStamps },
  })
}

async function deleteRegistration(userId, eventKey) {
  return prisma.eventRegistration.deleteMany({ where: { userId, eventKey } })
}

// @desc    List my registered events (drives the calendar)
// @route   GET /api/events/registrations
export const getMyRegistrations = async (req, res) => {
  try {
    const registrations = await prisma.eventRegistration.findMany({
      where: { userId: req.user.id },
      orderBy: [{ startAt: 'asc' }, { createdAt: 'asc' }],
    })
    // Opportunistic catch-up: if the instance has been asleep, this is often
    // the first request after it wakes. Rate-limited and not awaited.
    kickEventReminderSweep(req.app.get('io'))
    res.json(registrations)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Confirm a registration (the user says they completed it)
// @route   POST /api/events/registrations
export const confirmRegistration = async (req, res) => {
  try {
    const { eventKey, title } = req.body
    if (!eventKey || !title) {
      return res.status(400).json({ message: 'eventKey and title are required' })
    }

    const registration = await upsertRegistration(req.user.id, req.body)

    // Keep the local-event counter honest when the confirmation came through
    // this route rather than the toggle (external events have no Event row).
    if ((req.body.source || 'local') === 'local') {
      await prisma.event.update({
        where: { id: eventKey },
        data: { registeredUsers: { connect: { id: req.user.id } } },
      }).catch(() => {}) // no Event row → nothing to keep in sync
    }

    res.status(201).json(registration)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Remove a registration from my calendar
// @route   DELETE /api/events/registrations/:eventKey
export const cancelRegistration = async (req, res) => {
  try {
    const { eventKey } = req.params
    await deleteRegistration(req.user.id, eventKey)
    await prisma.event.update({
      where: { id: eventKey },
      data: { registeredUsers: { disconnect: { id: req.user.id } } },
    }).catch(() => {}) // external event → no Event row to update

    res.json({ message: 'Registration removed', eventKey })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Run the reminder sweep now (for an external cron pinger)
// @route   POST /api/events/reminders/run
// Guarded by REMINDER_CRON_SECRET rather than a user session, so a scheduler
// can call it. Unset secret = endpoint disabled, never open.
export const runReminders = async (req, res) => {
  const secret = process.env.REMINDER_CRON_SECRET
  if (!secret) return res.status(404).json({ message: 'Not enabled' })

  const provided = req.get('x-reminder-secret') || req.query.secret
  if (provided !== secret) return res.status(401).json({ message: 'Unauthorized' })

  try {
    const result = await runEventReminderSweep(req.app.get('io'))
    res.json({ message: 'Sweep complete', ...result })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Delete an event
// @route   DELETE /api/events/:id
export const deleteEvent = async (req, res) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } })
    if (!event) return res.status(404).json({ message: 'Event not found' })
    await prisma.event.delete({ where: { id: req.params.id } })
    res.json({ message: 'Event deleted' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
