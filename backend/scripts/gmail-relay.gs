/**
 * Medzae Gmail relay — Google Apps Script web app.
 *
 * Sends Medzae's transactional mail (welcome / password reset) through the
 * real Gmail account over HTTPS, so it works from hosts that cannot reach
 * smtp.gmail.com (Render) and lands in inboxes as authenticated gmail.com
 * mail. Free; consumer Gmail allows ~100 recipients/day — beyond that the
 * backend falls back to SMTP, which Render cannot reach, so a day that busy
 * effectively means no mail until the quota resets.
 *
 * SETUP (once, ~3 minutes, logged in as the Gmail account that should send):
 *  1. Open https://script.google.com → New project.
 *  2. Replace the default code with this whole file.
 *  3. Set SECRET below to the same value as GMAIL_RELAY_SECRET in the
 *     backend env (backend/.env locally, Render dashboard in production).
 *  4. Save. Then: Deploy → New deployment → gear icon → Web app →
 *     Execute as: Me · Who has access: Anyone → Deploy.
 *  5. Authorize when asked (Advanced → Go to <project> (unsafe) is expected
 *     for personal scripts).
 *  6. Copy the Web app URL (ends in /exec) into GMAIL_RELAY_URL.
 *
 * NOTE: after editing this code later, use Deploy → Manage deployments →
 * edit (pencil) → Version: New version — otherwise /exec keeps running the
 * old code.
 */

const SECRET = 'PASTE_YOUR_SECRET_HERE'

// Browser sanity check: opening the /exec URL should show this JSON.
function doGet() {
  return json_({ ok: true, service: 'Medzae gmail relay', usage: 'POST JSON {secret, to, subject, html, text}' })
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}')
    if (!body || body.secret !== SECRET) return json_({ ok: false, error: 'unauthorized' })

    // Health probe used by the backend's startup verification — no send.
    if (body.ping) return json_({ ok: true, pong: true, remaining: MailApp.getRemainingDailyQuota() })

    const to = String(body.to || '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json_({ ok: false, error: 'invalid recipient: ' + to })

    GmailApp.sendEmail(to, String(body.subject || '(no subject)'), String(body.text || ''), {
      htmlBody: body.html ? String(body.html) : undefined,
      name: String(body.fromName || 'Medzae'),
    })

    return json_({ ok: true, remaining: MailApp.getRemainingDailyQuota() })
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) })
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}
