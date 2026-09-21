const theme = {
  background: '#F5F8FF',
  card: '#FFFFFF',
  navy: '#0B194D',
  blue: '#1D4ED8',
  softBlue: '#E8F1FF',
  text: '#334155',
  muted: '#64748B',
  border: '#D8E2F1',
}

// Public Instagram account, mirrored from frontend/src/lib/seo.ts. Every mail
// the platform sends carries it in the footer, so a welcome or reminder email
// is also a chance to pick up a follower.
const INSTAGRAM_HANDLE = 'medzae_web'
const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`

// Escape user-supplied values before interpolating them into email HTML —
// the contact form's name/email/message come straight from a public form.
const esc = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const shell = (content) => `
  <div style="margin:0;padding:0;background:${theme.background};font-family:Arial,Helvetica,sans-serif;color:${theme.text};">
    <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
      <div style="background:${theme.card};border:1px solid ${theme.border};border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(11,25,77,0.08);">
        <div style="padding:28px 32px;background:linear-gradient(135deg, ${theme.navy} 0%, ${theme.blue} 100%);color:#fff;">
          <div style="font-size:13px;letter-spacing:0.24em;text-transform:uppercase;opacity:0.8;">Medzae</div>
          <div style="font-size:30px;font-weight:700;margin-top:10px;line-height:1.15;">${content.title}</div>
          <div style="font-size:15px;opacity:0.92;margin-top:10px;line-height:1.6;">${content.subtitle}</div>
        </div>
        <div style="padding:32px;">
          ${content.body}
        </div>
      </div>
      <div style="text-align:center;font-size:12px;color:${theme.muted};padding:18px 10px 0;line-height:1.6;">
        Medzae • Built for medical learning and collaboration<br>
        Follow us on <a href="${INSTAGRAM_URL}" style="color:${theme.blue};text-decoration:none;font-weight:700;">Instagram @${INSTAGRAM_HANDLE}</a> for more updates
      </div>
    </div>
  </div>
`

export const buildWelcomeEmail = ({ name }) => shell({
  title: 'Welcome to Medzae',
  subtitle: 'Your account is ready. Start exploring your study and collaboration workspace.',
  body: `
    <p style="margin:0 0 18px;font-size:16px;line-height:1.8;">Hi ${name},</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.8;">Welcome to Medzae. You can now use your dashboard, medical feed, notebook, chat, events, and AI assistant in one place.</p>
    <div style="background:${theme.softBlue};border:1px solid ${theme.border};border-radius:18px;padding:18px 20px;margin:24px 0;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${theme.blue};">What you can do next</p>
      <p style="margin:0;color:${theme.text};font-size:14px;line-height:1.7;">Complete your profile, browse the feed, join groups, and start saving notes and documents.</p>
    </div>
    <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/home" style="display:inline-block;background:${theme.navy};color:#fff;text-decoration:none;padding:14px 24px;border-radius:14px;font-weight:700;margin-top:6px;">Go to Medzae</a>
  `,
})

export const buildDiagnosticEmail = ({ name }) => shell({
  title: 'Mail Delivery Check',
  subtitle: 'A diagnostic message confirming Medzae can deliver email from this environment.',
  body: `
    <p style="margin:0 0 18px;font-size:16px;line-height:1.8;">Hi ${name},</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.8;">You requested a mail delivery check. Since this message reached you, welcome and password-reset emails are working from this server.</p>
    <div style="background:${theme.softBlue};border:1px solid ${theme.border};border-radius:18px;padding:18px 20px;margin:24px 0;">
      <p style="margin:0;font-size:14px;line-height:1.7;color:${theme.text};">Sent ${new Date().toUTCString()} via the /api/users/test-email diagnostic endpoint.</p>
    </div>
  `,
})

export const buildContactEmail = ({ name, email, message }) => shell({
  title: 'New Contact Message',
  subtitle: 'Someone reached out through the Medzae “Get in touch” form.',
  body: `
    <div style="background:${theme.softBlue};border:1px solid ${theme.border};border-radius:18px;padding:18px 20px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${theme.blue};">From</p>
      <p style="margin:0;font-size:15px;line-height:1.7;color:${theme.text};">${esc(name)} &lt;<a href="mailto:${esc(email)}" style="color:${theme.blue};text-decoration:none;">${esc(email)}</a>&gt;</p>
    </div>
    <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${theme.blue};">Message</p>
    <p style="margin:0;font-size:15px;line-height:1.8;color:${theme.text};white-space:pre-wrap;">${esc(message)}</p>
    <a href="mailto:${esc(email)}" style="display:inline-block;background:${theme.navy};color:#fff;text-decoration:none;padding:14px 24px;border-radius:14px;font-weight:700;margin-top:26px;">Reply to ${esc(name)}</a>
  `,
})

// Sent to the NEW address when someone changes their sign-in email. The old
// address keeps working until this link is clicked, so a typo locks nobody out.
export const buildEmailChangeEmail = ({ name, confirmUrl, newEmail }) => shell({
  title: 'Confirm Your New Email',
  subtitle: 'Confirm this address to finish changing the email you sign in with.',
  body: `
    <p style="margin:0 0 18px;font-size:16px;line-height:1.8;">Hi ${name},</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.8;">You asked to change your Medzae sign-in email to <strong>${newEmail}</strong>. Confirm below and this becomes the address you log in with.</p>
    <div style="background:${theme.softBlue};border:1px solid ${theme.border};border-radius:18px;padding:18px 20px;margin:24px 0;">
      <p style="margin:0;font-size:14px;line-height:1.7;color:${theme.text};">Your current email keeps working until you confirm. The link expires in 1 hour. If you did not request this, ignore this message — nothing changes.</p>
    </div>
    <a href="${confirmUrl}" style="display:inline-block;background:${theme.navy};color:#fff;text-decoration:none;padding:14px 24px;border-radius:14px;font-weight:700;margin-top:6px;">Confirm Email Address</a>
    <p style="margin:20px 0 0;font-size:12px;line-height:1.7;color:${theme.muted};word-break:break-all;">If the button does not work, copy and paste this link into your browser:<br>${confirmUrl}</p>
  `,
})

export const buildPasswordResetEmail = ({ name, resetUrl }) => shell({
  title: 'Reset Your Password',
  subtitle: 'We received a request to reset your Medzae password. This link expires in 1 hour.',
  body: `
    <p style="margin:0 0 18px;font-size:16px;line-height:1.8;">Hi ${name},</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.8;">Use the button below to choose a new password. If you did not request this, you can ignore this message safely.</p>
    <div style="background:${theme.softBlue};border:1px solid ${theme.border};border-radius:18px;padding:18px 20px;margin:24px 0;">
      <p style="margin:0;font-size:14px;line-height:1.7;color:${theme.text};">For security, the link will expire after one hour and can only be used once.</p>
    </div>
    <a href="${resetUrl}" style="display:inline-block;background:${theme.navy};color:#fff;text-decoration:none;padding:14px 24px;border-radius:14px;font-weight:700;margin-top:6px;">Reset Password</a>
    <p style="margin:20px 0 0;font-size:12px;line-height:1.7;color:${theme.muted};word-break:break-all;">If the button does not work, copy and paste this link into your browser:<br>${resetUrl}</p>
  `,
})

// Reminder for an event the user confirmed they registered for. `lead` is
// 'day-before' or 'day-of' — the only difference is the framing, since the
// useful content (what, when, where, and the link back) is identical.
// Event titles come from third-party feeds, so every interpolated value here
// goes through esc() — Devpost and Eventbrite titles regularly contain "&".
export const buildEventReminderEmail = ({ name, title, when, location, lead, eventUrl, calendarUrl }) => shell({
  title: lead === 'day-of' ? 'Happening today' : 'Happening tomorrow',
  subtitle: lead === 'day-of'
    ? 'An event you registered for starts today.'
    : 'An event you registered for starts tomorrow.',
  body: `
    <p style="margin:0 0 18px;font-size:16px;line-height:1.8;">Hi ${esc(name)},</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.8;">This is a reminder that you registered for the event below.</p>
    <div style="background:${theme.softBlue};border:1px solid ${theme.border};border-radius:18px;padding:20px 22px;margin:24px 0;">
      <p style="margin:0 0 10px;font-size:18px;font-weight:700;line-height:1.4;color:${theme.navy};">${esc(title)}</p>
      <p style="margin:0;font-size:14px;line-height:1.9;color:${theme.text};">
        <strong>When</strong> &nbsp;${esc(when)}<br>
        <strong>Where</strong> &nbsp;${esc(location || 'To be announced')}
      </p>
    </div>
    <a href="${esc(calendarUrl)}" style="display:inline-block;background:${theme.navy};color:#fff;text-decoration:none;padding:14px 24px;border-radius:14px;font-weight:700;margin-top:6px;">Open my calendar</a>
    ${eventUrl ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:${theme.muted};">Event page: <a href="${esc(eventUrl)}" style="color:${theme.blue};">${esc(eventUrl)}</a></p>` : ''}
    <p style="margin:18px 0 0;font-size:12px;line-height:1.7;color:${theme.muted};">You are getting this because you marked yourself as registered on Medzae. Remove the event from your calendar to stop its reminders.</p>
  `,
})