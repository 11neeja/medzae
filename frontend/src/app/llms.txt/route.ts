import {
  SITE_URL,
  SITE_NAME,
  CONTACT_EMAIL,
  GITHUB_URL,
} from '@/lib/seo'

// AI-assistant site summary, served at /llms.txt. This was a static file in
// public/, which meant every URL in it had to be hand-edited on a domain
// change — and it silently kept pointing at the old host through the rebrand.
// As a route it follows SITE_URL like robots.ts and sitemap.ts do.
export const dynamic = 'force-static'

export function GET() {
  const body = `# ${SITE_NAME}

> ${SITE_NAME} is a free, all-in-one medical platform — a digital health hub where medical students, doctors, professors, and researchers read curated medical news, discover conferences and events, organize notebooks, join communities, chat in real time, and study with an AI assistant. It runs in any modern browser at ${SITE_URL}.

${SITE_NAME} (also searched as "medzae web", "medzae website", or "med zae") unifies seven tools that medical professionals usually juggle separately: a medical news feed drawn from a global source network, an events calendar with Eventbrite sync, a notebook workspace for notes/PDFs/tasks, community groups, real-time chat, an opportunities board for medical roles and internships, and an AI study assistant that answers medical questions and summarizes documents.

## Pages

- [Home / Landing](${SITE_URL}/): What ${SITE_NAME} is, features, FAQ, and contact form
- [Sign up](${SITE_URL}/signup): Create a free account
- [Log in](${SITE_URL}/login): Access an existing account

## Key facts

- Audience: medical students, doctors, professors, and researchers
- Price: free to join
- Platform: web application (works in any modern browser, desktop and mobile)
- Features: medical news feed, events discovery, notebook workspace, groups, real-time chat, opportunities board, AI study assistant
- Contact: ${CONTACT_EMAIL}
- Source: ${GITHUB_URL}

## FAQ

- What is ${SITE_NAME}? An all-in-one medical platform for learning and collaboration — news, events, notebooks, groups, chat, opportunities, and an AI study assistant in one place.
- Who is it for? Medical students, doctors, professors, and researchers who want one organized hub for daily learning and collaboration.
- How does the AI assistant help? It answers medical questions, summarizes uploaded documents, and captures study-ready insights that can be saved to the notebook.
- Is it beginner-friendly? Yes — the interface is calm and intuitive, designed for quick onboarding.
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
