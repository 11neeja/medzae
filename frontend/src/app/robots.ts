import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

// Auth-gated app pages: crawlers only ever see the session splash or a
// redirect there, so keeping them out of the index protects the site's
// quality signals. All marketing value lives on /, /login, /signup.
const APP_ONLY_ROUTES = [
  '/home',
  '/feed',
  '/chat',
  '/notebook',
  '/assistant',
  '/groups',
  '/events',
  '/opportunities',
  '/forgot-password',
  '/reset-password',
]

// AI search & answer-engine crawlers, explicitly welcomed so Medzae can be
// found and cited from ChatGPT, Claude, Perplexity, Grok, Gemini, Copilot,
// Meta AI, and friends. (An unknown name in robots.txt is simply ignored,
// so this list is safe to keep generous.)
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'GoogleOther',
  'Applebot',
  'Applebot-Extended',
  'Bingbot',
  'DuckAssistBot',
  'GrokBot',
  'xAI-Bot',
  'meta-externalagent',
  'FacebookBot',
  'Amazonbot',
  'CCBot',
  'cohere-ai',
  'Bytespider',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: APP_ONLY_ROUTES,
      },
      {
        userAgent: AI_CRAWLERS,
        allow: '/',
        disallow: APP_ONLY_ROUTES,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
