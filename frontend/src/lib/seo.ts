// Central SEO configuration — single source of truth for canonical URLs,
// brand copy, and structured data used by layout metadata, robots.ts,
// sitemap.ts, manifest.ts, and the JSON-LD blocks.

// Public origin of the deployed site. medzae.com is the canonical host; both
// vercel.app subdomains 308 to it. This must always name the host that serves
// the site directly — an earlier default pointed at a subdomain that only
// redirected, which made Google resolve every page to a redirect instead of
// indexing it. Override with NEXT_PUBLIC_SITE_URL if the origin ever moves;
// canonicals, the sitemap, robots, llms.txt, and Open Graph URLs all follow it
// automatically.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://medzae.com'
).replace(/\/$/, '')

export const SITE_NAME = 'Medzae'
export const SITE_TAGLINE = 'A practice for medical minds'

// Title kept under ~60 chars so Google shows it untruncated; carries the
// highest-value phrase ("medical platform") next to the brand.
export const SITE_TITLE = 'Medzae — Medical Platform for Learning & Collaboration'

// Meta description ~160 chars: brand, audience, and feature keywords.
export const SITE_DESCRIPTION =
  'Medzae is the all-in-one medical hub for students, doctors, professors, and researchers — medical news, events, notebooks, groups, chat, and an AI study assistant.'

export const CONTACT_EMAIL = 'contact@medzae.com'
export const GITHUB_URL = 'https://github.com/11neeja/medihub'

// Public social account. Declared once here so the handle, the profile URL,
// and the `sameAs` entry below can never drift apart — every follow link in
// the app (landing contact block, landing footer, signed-in sidebar, email
// footers) resolves back to these two constants.
export const INSTAGRAM_HANDLE = 'medzae_web'
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`

// Query phrases Medzae should surface for. Google ignores the keywords meta
// tag outright; Bing and some AI crawlers still read it, so it costs nothing
// to keep — but it is the weakest signal here and adding head terms like
// "health" to it does not make the site compete for them. Real ranking comes
// from the title/description, the JSON-LD below, and pages that answer the
// query. Ordered brand → legacy brand → category → long-tail, because the
// long-tail entries are the ones actually winnable.
export const SITE_KEYWORDS = [
  'Medzae',
  'medzae web',
  'medzae website',
  'medzae platform',
  'medzae medical',
  // Former brand — people who used or heard of the product before the rename
  // still search this, and it is a legitimate alternate name for the site.
  'MediHub',
  'medihub medical platform',
  'medical platform',
  'medical hub',
  'medical learning platform',
  'medical collaboration platform',
  'medical study platform',
  'healthcare education platform',
  'medical AI assistant',
  'AI medical study assistant',
  'platform for medical students',
  'medical student community',
  'medical news feed',
  'medical events',
  'medical notebook app',
  'note taking app for medical students',
  'doctor networking platform',
]

export const FEATURE_LIST = [
  'Curated medical news feed',
  'Medical events and conference discovery',
  'Notebook workspace for notes, PDFs, and tasks',
  'Community groups and real-time chat',
  'AI study assistant for questions and document summaries',
  'Opportunities board for medical roles and internships',
]

// Serialize JSON-LD for a <script type="application/ld+json"> block.
// Escapes "<" so user-visible strings can never close the script tag.
export function jsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

// Site-wide structured data: who Medzae is (Organization), what the site is
// (WebSite, with alternate names matching common brand searches), and what
// the product is (WebApplication). Rendered once in the root layout.
export const SITE_GRAPH = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      // "MediHub" is the pre-rename name, declared so the two brands resolve
      // to one entity instead of competing — this is what carries recognition
      // across the rename for anyone still searching the old name.
      alternateName: ['MediHub', 'Medzae Web'],
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon.svg` },
      email: CONTACT_EMAIL,
      // sameAs is how Google ties this Organization to the profiles that
      // represent it elsewhere — the Instagram account is the public-facing
      // one, so it leads.
      sameAs: [INSTAGRAM_URL, GITHUB_URL],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      alternateName: [
        'Medzae Web',
        'Medzae Website',
        'medzae',
        'Med Zae',
        'MediHub',
      ],
      description: SITE_DESCRIPTION,
      inLanguage: 'en',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'WebApplication',
      '@id': `${SITE_URL}/#webapp`,
      name: `${SITE_NAME} — ${SITE_TAGLINE}`,
      url: SITE_URL,
      applicationCategory: 'MedicalApplication',
      operatingSystem: 'Any (web browser)',
      description: SITE_DESCRIPTION,
      featureList: FEATURE_LIST,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
}
