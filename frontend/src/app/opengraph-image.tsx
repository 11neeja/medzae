import { ImageResponse } from 'next/og'
import { SITE_URL } from '@/lib/seo'

// Social share card (Open Graph) — shown when Medzae is linked from search
// results, chats, and social posts. Twitter/X falls back to this image via
// the summary_large_image card in the root metadata.
// Edge runtime: @vercel/og's Node build cannot resolve its WASM assets from
// paths with spaces/parentheses (this repo's path, on Windows); the edge
// bundle loads them differently and works everywhere.
export const runtime = 'edge'
export const alt = 'Medzae — a practice for medical minds. Medical platform for learning and collaboration.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const PILLS = ['News', 'Events', 'Notebook', 'Groups', 'Chat', 'AI Assistant']

// Same globe mark as app/icon.svg, inlined so the share card and the
// favicon read as one brand.
const GLOBE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><defs><radialGradient id="s" cx="37%" cy="32%" r="80%"><stop offset="0%" stop-color="#2A5AD6"/><stop offset="50%" stop-color="#0B3B91"/><stop offset="100%" stop-color="#00093A"/></radialGradient></defs><circle cx="16" cy="16" r="15.5" fill="url(#s)"/><g fill="none" stroke="#D7E7FF" stroke-width="1.35" opacity="0.8" stroke-linecap="round"><ellipse cx="16" cy="16" rx="8" ry="15.3"/><line x1="16" y1="1.2" x2="16" y2="30.8"/><ellipse cx="16" cy="16" rx="15.3" ry="8"/><line x1="1.2" y1="16" x2="30.8" y2="16"/></g><g fill="#FFFFFF" opacity="0.92"><path d="M9.5 8.2c1.8-.5 3.4.2 3.1 1.6-.3 1.3-2 1.4-2.2 2.6-.2 1.2 1.1 1.9.5 2.9-.6 1-2.6.8-3.4-.2-.9-1.1-.8-3 .1-4.6.5-.9 1.1-1.5 1.9-2.3z"/><path d="M19 15.5c1.6-.3 3 .6 3.1 2 .1 1.5-1 2.2-1 3.6 0 1.5 1 2.4.3 3.5-.7 1.1-2.3 1-3-.2-.8-1.3-.4-2.7-.6-4-.2-1.6-.5-3 .3-4 .4-.5.9-.8 1.6-.9z"/></g><ellipse cx="11" cy="10" rx="5.6" ry="3.6" fill="#FFFFFF" opacity="0.13"/><circle cx="16" cy="16" r="15" fill="none" stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="1"/></svg>`

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'linear-gradient(135deg, #000B33 0%, #0B2566 55%, #0B3B91 100%)',
          color: '#FFFFFF',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Soft accent glow, echoing the landing page orbs */}
        <div
          style={{
            position: 'absolute',
            top: -180,
            right: -140,
            width: 520,
            height: 520,
            borderRadius: 260,
            background: 'rgba(230, 240, 255, 0.14)',
            filter: 'blur(90px)',
          }}
        />

        {/* Brand row: globe mark + wordmark left, domain right */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              width={64}
              height={64}
              src={`data:image/svg+xml,${encodeURIComponent(GLOBE)}`}
              alt=""
            />
            <div style={{ display: 'flex', fontSize: 44, letterSpacing: -1 }}>Medzae</div>
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: 'rgba(230, 240, 255, 0.7)' }}>
            {SITE_URL.replace('https://', '')}
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 84,
              lineHeight: 1.05,
              letterSpacing: -3,
              maxWidth: 980,
            }}
          >
            A practice for medical minds.
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 30,
              color: 'rgba(230, 240, 255, 0.85)',
              maxWidth: 900,
            }}
          >
            The all-in-one medical platform for students, doctors, professors, and researchers.
          </div>
        </div>

        {/* Feature pills */}
        <div style={{ display: 'flex', gap: 14 }}>
          {PILLS.map((pill) => (
            <div
              key={pill}
              style={{
                display: 'flex',
                padding: '12px 22px',
                borderRadius: 999,
                fontSize: 22,
                color: '#E6F0FF',
                background: 'rgba(230, 240, 255, 0.10)',
                border: '1px solid rgba(230, 240, 255, 0.25)',
              }}
            >
              {pill}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  )
}
