/**
 * Medzae Gmail relay — Google Apps Script web app.
 *
 * Sends Medzae's transactional mail (welcome / password reset / contact)
 * through the real Gmail account over HTTPS, so it works from hosts that
 * cannot reach smtp.gmail.com (Render). Free; consumer Gmail allows ~100
 * recipients/day — beyond that the backend falls back to SMTP, which Render
 * cannot reach, so a day that busy effectively means no mail until the
 * quota resets.
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
 * SENDING AS contact@medzae.com — the backend passes `from` (SMTP_FROM_EMAIL).
 * Gmail only allows it for an address verified under Settings → Accounts →
 * "Send mail as" in this same account, and that alias must be configured to
 * send *through the medzae.com mail server* (mailserver.businessidentity.llc),
 * not through Gmail: medzae.com publishes p=quarantine DMARC, so mail that
 * Gmail signs as gmail.com is quarantined as spam. Routing it through the
 * domain's own server keeps SPF and DKIM aligned. If the alias is missing,
 * this script still delivers — from the Gmail address — and says so in the
 * `warning` field rather than dropping a password reset on the floor.
 *
 * NOTE: after editing this code later, use Deploy → Manage deployments →
 * edit (pencil) → Version: New version — otherwise /exec keeps running the
 * old code.
 */

const SECRET = 'PASTE_YOUR_SECRET_HERE'

// Browser sanity check: opening the /exec URL should show this JSON.
function doGet() {
  return json_({
    ok: true,
    service: 'Medzae gmail relay',
    usage: 'POST JSON {secret, to, subject, html, text, from, fromName, replyTo}',
    aliases: GmailApp.getAliases(),
  })
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}')
    if (!body || body.secret !== SECRET) return json_({ ok: false, error: 'unauthorized' })

    // Health probe used by the backend's startup verification — no send.
    // It reports the aliases too, so /api/health can tell whether this
    // account may still send as contact@medzae.com.
    if (body.ping) {
      return json_({ ok: true, pong: true, remaining: MailApp.getRemainingDailyQuota(), aliases: GmailApp.getAliases() })
    }

    const to = String(body.to || '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json_({ ok: false, error: 'invalid recipient: ' + to })

    const account = Session.getEffectiveUser().getEmail()
    const options = {
      htmlBody: body.html ? String(body.html) : undefined,
      name: String(body.fromName || 'Medzae'),
    }

    if (body.replyTo) options.replyTo = String(body.replyTo).trim()

    // GmailApp throws on an unverified `from`, which would mean no mail at
    // all — check the alias list first and degrade to the account address.
    const from = String(body.from || '').trim()
    let warning = null
    if (from && from !== account) {
      if (GmailApp.getAliases().indexOf(from) !== -1) {
        options.from = from
      } else {
        warning =
          from + ' is not a verified "Send mail as" alias of ' + account +
          ' — sent from the account address instead. Add and verify it in Gmail → Settings → Accounts.'
      }
    }

    GmailApp.sendEmail(to, String(body.subject || '(no subject)'), String(body.text || ''), options)

    return json_({ ok: true, from: options.from || account, warning: warning, remaining: MailApp.getRemainingDailyQuota() })
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) })
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}
