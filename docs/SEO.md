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
| `llms.txt` | `src/app/llms.txt/route.ts` | Plain-language site summary for AI assistants (ChatGPT, Claude, Perplexity) |

The site origin defaults to `https://medzae.vercel.app` and is defined once in
`src/lib/seo.ts`. Every surface above derives its URLs from it, so moving to a
custom domain is a single change — see
[Moving to medzae.com](#moving-to-medzaecom) below.

> **Never hardcode the origin anywhere else.** The rebrand shipped with the
> origin still set to the old `medihub-web` host, which meant the live site
> advertised canonicals, `og:url`, JSON-LD `@id`s, and a sitemap all pointing
> at a URL that only 307-redirects back — Google saw every page as a redirect
> to itself and had no stable URL to index.

## One-time manual steps (do these after deploying)

### 1. Google Search Console — covers Google + Chrome + most AI engines

The token baked into `src/app/layout.tsx`
(`2ujO5Tqw1xbRZZM--5YipXrF2LaxbqsANEmC9oQny4E`) belongs to the **old
`medihub-web` property**. A Search Console property is per-origin and each one
issues its own token, so the rename needs a new property:

1. Deploy this code to Vercel.
2. In <https://search.google.com/search-console>, **Add property** →
   *URL prefix* → `https://medzae.vercel.app`. Choose the **HTML tag** method
   and copy the `content="…"` value.
3. Set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` to that value in Vercel
   (Settings → Environment Variables) and redeploy — it overrides the baked-in
   default. Then click **Verify**.
4. In Search Console → **Sitemaps**, submit `sitemap.xml`.
5. In **URL Inspection**, paste the homepage URL → **Request indexing**.
   Repeat for `/signup` and `/login`. Google usually indexes within hours to
   a few days.

Keep the old `medihub-web` property. It is where Google reports the old URLs,
and you need it to watch them drop out of the index as the redirect is
followed.

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

- **Custom domain**: see [Moving to medzae.com](#moving-to-medzaecom) — the
  single biggest lever available.
- **Content**: a `/blog` or guides section targeting long-tail queries
  ("best note app for medical students", "how to keep up with medical
  news") is what eventually wins non-brand searches like "medical platform".

## Moving to medzae.com

A `vercel.app` subdomain ranks noticeably worse than an owned domain, cannot be
verified as a Search Console *Domain* property, and shares its root domain's
reputation with every other Vercel project. "Medzae" is a coined word with
essentially no competing results, so an exact-match domain should take the
brand query quickly. Do it in this order:

1. **Buy the domain**, then add it in Vercel → Project → Settings → Domains.
   Set `medzae.com` as the **primary** domain and let Vercel redirect
   `www.medzae.com` to it, so only one host is canonical.
2. **Set `NEXT_PUBLIC_SITE_URL=https://medzae.com`** in Vercel's environment
   variables and redeploy. This is the only code-side change: canonicals,
   `sitemap.xml`, `robots.txt`, `llms.txt`, OG/Twitter URLs, and the JSON-LD
   `@id`s all re-derive from it.
3. **Keep `medzae.vercel.app` attached** and redirecting to the new domain.
   Vercel's default project redirect is a **307 (temporary)** — switch it to
   **308 (permanent)** in the domain's settings so Google transfers the
   ranking signals instead of holding both URLs.
4. **Add a Search Console *Domain* property** for `medzae.com` (DNS TXT
   verification). A Domain property covers `http`/`https`, `www`, and every
   subdomain at once and never breaks on redeploys — unlike the meta-tag
   method, which only ever verifies one exact origin.
5. **Submit the new `sitemap.xml`** and use **Change of Address** in the old
   property (Settings → Change of address) to tell Google the site moved.
6. **Update the non-SEO URLs that do not read `SITE_URL`**: the backend's
   `FRONTEND_URL` on Render (password-reset and welcome-email links point at
   the wrong host otherwise) and the Google OAuth client's **Authorized
   JavaScript origins** (see `docs/GOOGLE_SSO.md`) — sign-in breaks silently
   without the second one.

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

- `https://medzae.vercel.app/robots.txt`, `/sitemap.xml`, `/llms.txt`,
  `/manifest.webmanifest`, `/opengraph-image` should all load — and every URL
  printed inside the first three must be on the current origin, not the old
  one. `curl -s https://medzae.vercel.app/ | grep canonical` is the fastest
  check that the origin is right.
- Rich results test: <https://search.google.com/test/rich-results>
- Share-card preview: <https://www.opengraph.xyz> (or paste the link in
  WhatsApp/Slack).
- After a few days: search `site:medzae.vercel.app` on Google/Bing to
  confirm indexing.
