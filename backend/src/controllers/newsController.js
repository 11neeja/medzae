// ─── NewsAPI.org integration with 24-hour cache ────────────────────
const NEWS_API_KEY = process.env.NEWS_API_KEY
const NEWS_API_BASE = 'https://newsapi.org/v2'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

let newsCache = {
  articles: [],
  fetchedAt: 0,
}

// Medical / health search queries for broad coverage
const HEALTH_QUERIES = [
  'medical health',
  'clinical trial',
  'surgery innovation',
  'cardiology',
  'neurology',
  'pediatrics',
  'oncology',
  'telemedicine',
  'gene therapy',
  'vaccine',
]

// ── Medical relevance gate ─────────────────────────────────────────
// NewsAPI's "health" category and keyword searches still return off-topic
// stories (lifestyle, business "healthy economy", "price surge", celebrity
// health, etc.). Every article must match this before it reaches the feed,
// so the feed stays medical/health-only — never general news.
//
// Stems use a leading word boundary only, so "cardiolog" matches
// "cardiology/cardiologist", "therap" matches "therapy/therapeutic", etc.
// Ambiguous short words (flu, gene, drug) are boundary-locked, and known
// false-positive traps are avoided (no bare "surge", "cardio", "immunity",
// "heart", "who").
const MEDICAL_RE = /\b(?:health|medic|clinic|hospital|patient|doctor|physician|nurse|nursing|surgery|surgical|surgeon|disease|illness|infect|virus|viral|bacteri|epidemi|pandemi|outbreak|covid|coronavirus|influenza|\bflu\b|vaccin|immuniz|immunolog|immunotherap|immune system|autoimmun|antibiotic|antiviral|antibod|cancer|oncolog|tumou?r|leukemia|lymphoma|melanoma|carcinoma|chemo|cardiac|cardiolog|cardiovascular|heart disease|heart attack|stroke|hypertension|cholesterol|neuro|alzheimer|dementia|parkinson|epilep|seizure|migraine|diabet|insulin|obesity|asthma|arthritis|respiratory|psychiatr|psycholog|mental health|depression|anxiety|autism|adhd|pediatr|paediatr|infant|newborn|maternal|pregnan|fertility|prenatal|genetic|genom|crispr|gene therap|gene edit|stem cell|therap|treatment|transplant|\bdrug|medication|pharma|clinical trial|\bfda\b|biotech|medtech|life science|telemedicine|telehealth|epidemiolog|radiolog|patholog|dermatolog|orthop|obstetric|an[ae]sth|nephrolog|gastroenterolog|endocrin|h[ae]matolog|urolog|ophthalmolog|nutrition|malnutrition|wellness|public health|world health)/i

// True only for genuinely medical/health articles. Checks title + description
// (the fields NewsAPI reliably populates on the free tier).
export const isMedicalArticle = (article) =>
  MEDICAL_RE.test(`${article?.title || ''} ${article?.description || ''}`)

// NewsAPI's `content` is a ~200-char excerpt that sometimes carries HTML and
// always ends in a "[+1234 chars]" marker. Keep only the readable text.
const cleanContent = (content) =>
  (content || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s*\[\+\d+ chars\]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(…|\.\.\.)$/, '')

// Map article to our standard shape
const mapArticle = (raw, index) => {
  // Derive specialty from keywords in title + description
  const text = `${raw.title || ''} ${raw.description || ''}`.toLowerCase()
  let specialty = 'General Medicine'
  if (/cardio|heart|ecg|cardiac/.test(text)) specialty = 'Cardiology'
  else if (/neuro|brain|alzheimer|cognit/.test(text)) specialty = 'Neurology'
  else if (/surg|robot|minimally.invasive|operat/.test(text)) specialty = 'Surgery'
  else if (/pediat|child|infant|vaccin/.test(text)) specialty = 'Pediatrics'
  else if (/trial|research|study|breakthrough|crispr|gene/.test(text)) specialty = 'Research & Trials'
  else if (/oncol|cancer|melanoma|tumor|immunotherapy/.test(text)) specialty = 'Oncology'
  else if (/telemedic|digital.health|remote.care/.test(text)) specialty = 'Telemedicine'

  // Generate tags from keywords
  const tags = []
  if (/ai |artificial.intelligence|machine.learn|algorithm/.test(text)) tags.push('AI')
  if (/cardio|heart/.test(text)) tags.push('Cardiology')
  if (/neuro|brain/.test(text)) tags.push('Neurology')
  if (/surg/.test(text)) tags.push('Surgery')
  if (/pediat|child/.test(text)) tags.push('Pediatrics')
  if (/vaccin/.test(text)) tags.push('Vaccines')
  if (/cancer|oncol|melanoma/.test(text)) tags.push('Oncology')
  if (/gene|crispr|genom/.test(text)) tags.push('Gene Therapy')
  if (/research|study|trial/.test(text)) tags.push('Research')
  if (/technolog|innovat|robot/.test(text)) tags.push('Technology')
  if (/drug|pharma|treatment|therap/.test(text)) tags.push('Treatment')
  if (/public.health|who|cdc/.test(text)) tags.push('Public Health')
  if (/mental|psych|depress|anxiety/.test(text)) tags.push('Mental Health')
  if (/diabet|metabol|endocrin/.test(text)) tags.push('Endocrinology')
  if (/immunother/.test(text)) tags.push('Immunotherapy')
  if (tags.length === 0) tags.push('Health')

  // Calculate relative time
  const publishedAt = raw.publishedAt ? new Date(raw.publishedAt) : new Date()
  const diffMs = Date.now() - publishedAt.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  let timeAgo
  if (diffHours < 1) timeAgo = 'Just now'
  else if (diffHours < 24) timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  else {
    const days = Math.floor(diffHours / 24)
    timeAgo = `${days} day${days > 1 ? 's' : ''} ago`
  }

  return {
    id: `news-${index}-${Date.now()}`,
    title: raw.title || 'Untitled',
    summary: raw.description || raw.content || '',
    content: cleanContent(raw.content),
    author: (raw.author || '').trim(),
    imageUrl: raw.urlToImage || '',
    url: raw.url || '',
    tags: tags.slice(0, 4), // max 4 tags
    source: raw.source?.name || 'Unknown',
    specialty,
    timeAgo,
    publishedAt: raw.publishedAt,
    featured: index === 0,
  }
}

// Fetch from NewsAPI and populate cache
const fetchNews = async () => {
  const now = Date.now()
  if (newsCache.articles.length > 0 && now - newsCache.fetchedAt < CACHE_TTL_MS) {
    console.log(`[NewsAPI] Returning ${newsCache.articles.length} cached articles`)
    return newsCache.articles
  }

  console.log('[NewsAPI] Fetching fresh articles…')
  const allArticles = []
  const seenTitles = new Set()

  try {
    // Fetch health-related top headlines
    const headlinesRes = await fetch(
      `${NEWS_API_BASE}/top-headlines?category=health&language=en&pageSize=20&apiKey=${NEWS_API_KEY}`
    )
    if (headlinesRes.ok) {
      const data = await headlinesRes.json()
      if (data.articles) {
        for (const a of data.articles) {
          if (a.title && !a.title.includes('[Removed]') && !seenTitles.has(a.title) && isMedicalArticle(a)) {
            seenTitles.add(a.title)
            allArticles.push(a)
          }
        }
      }
    }

    // Fetch with additional medical queries for broader coverage
    for (const query of HEALTH_QUERIES.slice(0, 3)) {
      try {
        const res = await fetch(
          `${NEWS_API_BASE}/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${NEWS_API_KEY}`
        )
        if (res.ok) {
          const data = await res.json()
          if (data.articles) {
            for (const a of data.articles) {
              // The keyword search is the leakiest source of off-topic stories,
              // so the medical gate matters most here.
              if (a.title && !a.title.includes('[Removed]') && !seenTitles.has(a.title) && isMedicalArticle(a)) {
                seenTitles.add(a.title)
                allArticles.push(a)
              }
            }
          }
        }
      } catch (err) {
        console.error(`[NewsAPI] Query "${query}" failed:`, err.message)
      }
    }

    // Sort by publish date descending
    allArticles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))

    // Map and cache
    const mapped = allArticles.map((a, i) => mapArticle(a, i))
    newsCache = { articles: mapped, fetchedAt: Date.now() }
    console.log(`[NewsAPI] Cached ${mapped.length} articles`)
    return mapped
  } catch (err) {
    console.error('[NewsAPI] Fetch failed:', err.message)
    // Return stale cache if available
    if (newsCache.articles.length > 0) return newsCache.articles
    return []
  }
}

// ─── Controller handlers ───────────────────────────────────────────

// GET /api/news
export const getNews = async (req, res) => {
  try {
    const articles = await fetchNews()
    const { specialty, search, sort } = req.query

    let filtered = [...articles]

    // Filter by specialty
    if (specialty && specialty !== 'All') {
      filtered = filtered.filter(a => a.specialty === specialty)
    }

    // Search
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        a =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.tags.some(t => t.toLowerCase().includes(q))
      )
    }

    // Sort
    if (sort === 'popular') {
      // Shuffle for "popular" since NewsAPI free tier doesn't provide popularity scores
      filtered.sort(() => Math.random() - 0.5)
    }

    res.json(filtered)
  } catch (err) {
    console.error('[NewsAPI] getNews error:', err.message)
    res.status(500).json({ message: 'Failed to fetch news', error: err.message })
  }
}

// POST /api/news/refresh — force cache refresh
export const refreshNewsCache = async (req, res) => {
  try {
    newsCache = { articles: [], fetchedAt: 0 }
    const articles = await fetchNews()
    res.json({ message: 'News cache refreshed', count: articles.length })
  } catch (err) {
    console.error('[NewsAPI] refresh error:', err.message)
    res.status(500).json({ message: 'Failed to refresh news', error: err.message })
  }
}

// GET /api/news/trending — return trending topic names
export const getTrendingTopics = async (req, res) => {
  try {
    const articles = await fetchNews()
    // Count tag frequency
    const tagCount = {}
    for (const a of articles) {
      for (const t of a.tags) {
        tagCount[t] = (tagCount[t] || 0) + 1
      }
    }
    // Sort by frequency, return top 5
    const trending = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name)

    res.json(trending)
  } catch (err) {
    console.error('[NewsAPI] trending error:', err.message)
    res.status(500).json({ message: 'Failed to get trending topics', error: err.message })
  }
}
