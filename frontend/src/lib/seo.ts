// Central SEO configuration — single source of truth for canonical URLs,
// brand copy, and structured data used by layout metadata, robots.ts,
// sitemap.ts, manifest.ts, and the JSON-LD blocks.

// Public origin of the deployed site. Still the original Vercel host — the
// Medzae rebrand did not move the deployment. Override with
// NEXT_PUBLIC_SITE_URL when the project moves to a custom domain; canonicals,
// the sitemap, and Open Graph URLs all follow it automatically.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://medihub-web.vercel.app'
).replace(/\/$/, '')

export const SITE_NAME = 'Medzae'
export const SITE_TAGLINE = 'A practice for medical minds'

// Title kept under ~60 chars so Google shows it untruncated; carries the
// highest-value phrase ("medical platform") next to the brand.
export const SITE_TITLE = 'Medzae — Medical Platform for Learning & Collaboration'

// Meta description ~160 chars: brand, audience, and feature keywords.
export const SITE_DESCRIPTION =
  'Medzae is the all-in-one medical hub for students, doctors, professors, and researchers — medical news, events, notebooks, groups, chat, and an AI study assistant.'

export const CONTACT_EMAIL = 'suva.neeja11@gmail.com'
export const GITHUB_URL = 'https://github.com/11neeja/medihub'

// Query phrases Medzae should surface for. Google ignores the keywords meta
// tag but Bing and several AI crawlers still read it — costs nothing.
export const SITE_KEYWORDS = [
  'Medzae',
  'medzae web',
  'medzae website',
  'medzae platform',
  'medical platform',
  'medical hub',
  'health website',
  'medical learning platform',
  'medical collaboration platform',
  'platform for medical students',
  'medical student community',
  'medical news feed',
  'medical events',
  'medical notebook app',
  'AI medical study assistant',
  'doctor networking platform',
  'healthcare education platform',
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
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon.svg` },
      email: CONTACT_EMAIL,
      sameAs: [GITHUB_URL],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      alternateName: ['Medzae Web', 'Medzae Website', 'medzae', 'Med Zae'],
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
