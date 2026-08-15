# Medzae SEO & Discoverability Guide

Everything technical is already wired into the frontend. This document explains
what ships automatically and, more importantly, the **one-time manual steps**
that only the site owner can do — search engines will not know the site exists
until it is submitted to them once.

## What the code already does

| Surface | Where | What it serves |
|---|---|---|
| Titles, descriptions, keywords | `src/app/layout.tsx` + per-route `layout.tsx` | Keyword-rich `<title>`/`<meta>` on every page; auth-only pages are `noindex` so crawlers never index empty splash screens |
| Canonical URLs | root + route layouts | Point every indexable page at its one true URL |
| Open Graph / Twitter cards | `src/app/opengraph-image.tsx` | Branded 1200×630 share image for Google, WhatsApp, Slack, X, LinkedIn previews |
| Favicon / app icons | `src/app/icon.svg`, `apple-icon.tsx` | Browser tab, bookmarks, iOS home screen |
| `robots.txt` | `src/app/robots.ts` | Welcomes Googlebot/Bingbot **and every major AI crawler by name** (GPTBot, ClaudeBot, PerplexityBot, Grok, Google-Extended, Meta, Amazon, Apple…); hides auth-only routes |
| `sitemap.xml` | `src/app/sitemap.ts` | Lists `/`, `/signup`, `/login` for crawlers |
| Web app manifest | `src/app/manifest.ts` | PWA identity (name, colors, icons) |
| Structured data (JSON-LD) | root layout + landing page | `Organization`, `WebSite` (with alternate names like "medzae web"), `WebApplication`, and `FAQPage` — powers Google rich results and AI answer engines |
| `llms.txt` | `frontend/public/llms.txt` | Plain-language site summary for AI assistants (ChatGPT, Claude, Perplexity) |

The site origin defaults to `https://medihub-web.vercel.app`. When a custom
domain arrives, set `NEXT_PUBLIC_SITE_URL` in Vercel and everything
(canonicals, sitemap, OG URLs, robots) follows automatically.

## One-time manual steps (do these after deploying)

### 1. Google Search Console — covers Google + Chrome + most AI engines

The property's HTML-tag verification token
(`2ujO5Tqw1xbRZZM--5YipXrF2LaxbqsANEmC9oQny4E`) is already baked into
`src/app/layout.tsx`, so:

1. Deploy this code to Vercel.
2. In <https://search.google.com/search-console>, open the
   `https://medihub-web.vercel.app` property and click **Verify** (HTML tag
   method). A different property/token can override via the
   `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` env var.
3. In Search Console → **Sitemaps**, submit `sitemap.xml`.
4. In **URL Inspection**, paste the homepage URL → **Request indexing**.
   Repeat for `/signup` and `/login`. Google usually indexes within hours to
   a few days.

### 2. Bing Webmaster Tools — covers Bing, Edge, Yahoo, DuckDuckGo, ChatGPT search

1. Go to <https://www.bing.com/webmasters> and sign in.
2. Choose **Import from Google Search Console** (one click, reuses step 1) —
   or verify with a meta tag via `NEXT_PUBLIC_BING_SITE_VERIFICATION`.
3. Submit `sitemap.xml` there too, then use **URL Submission** for the
   homepage. Bing's index also feeds Yahoo, DuckDuckGo, Ecosia, and
   ChatGPT's web search.

### 3. Backlinks — the part that actually moves rankings

Search position is mostly decided by *who links to you*. Cheap, legitimate wins:

- Add the live URL to the GitHub repo's **About** field (Settings icon on the
  repo page → Website) and in `README.md`.
- Share the site on LinkedIn / X / Reddit (r/medicalschool etc.) — social
  links get crawled fast and seed AI training data.
- Ask any college/med-school pages, newsletters, or friends' sites to link
  to it.

### 4. Optional but high-impact later

- **Custom domain** (e.g. `medzae.com`, `medzae.health`): `vercel.app`
  subdomains rank noticeably worse than owned domains, and the site is still
  served from the old `medihub-web` host, which now says nothing about the
  brand — an owned `medzae` domain is the single biggest lever for winning
  the brand query. "Medzae" is a coined name with almost no competing
  results, so it should rank quickly once it has a matching domain. When you
  buy one, set `NEXT_PUBLIC_SITE_URL` and re-verify in Search Console.
- **Content**: a `/blog` or guides section targeting long-tail queries
  ("best note app for medical students", "how to keep up with medical
  news") is what eventually wins non-brand searches like "medical platform".

## How AI search finds Medzae

- **Crawling**: `robots.txt` explicitly allows GPTBot, OAI-SearchBot,
  ClaudeBot, PerplexityBot, Grok/xAI, Google-Extended, Applebot, Amazonbot,
  Meta, CCBot, and others.
- **Understanding**: JSON-LD (`WebSite` alternate names, `WebApplication`
  feature list, `FAQPage`) + `llms.txt` give engines clean, quotable facts.
- **Sourcing**: ChatGPT search rides on Bing, Perplexity/Claude fetch pages
  directly and both consult Google/Bing indexes — so steps 1–2 above are
  what put Medzae in AI answers. Expect AI engines to pick the site up
  days-to-weeks after classic search does.

## Verifying it works

- `https://medihub-web.vercel.app/robots.txt`, `/sitemap.xml`, `/llms.txt`,
  `/manifest.webmanifest`, `/opengraph-image` should all load.
- Rich results test: <https://search.google.com/test/rich-results>
- Share-card preview: <https://www.opengraph.xyz> (or paste the link in
  WhatsApp/Slack).
- After a few days: search `site:medihub-web.vercel.app` on Google/Bing to
  confirm indexing.
