# Google sign-in ("Continue with Google")

Medzae supports Google SSO on both the **login** and **signup** pages. One
endpoint covers both: signing in with a Google account that Medzae has never
seen creates the account on the spot; signing in with a known one just logs in.

## How the flow works

```
Browser                                Backend (Render)
───────                                ────────────────
1. GIS button click → Google popup
2. Google returns an ID token
   (a signed JWT "credential")
3. POST /api/users/google  ──────────► 4. google-auth-library verifies the
   { credential, rememberMe }             token signature + audience against
                                          GOOGLE_CLIENT_ID, requires a
                                          verified email
                                       5. Find user by googleId,
                                          else link by email,
                                          else create the account
                                          (password = null, welcome email)
6. Store Medzae JWT exactly  ◄──────  6. Respond with the same shape as
   like a password login                  /login: { _id, name, email, role,
   (localStorage/sessionStorage)          token }
```

- **No client secret and no redirect URIs** — the frontend uses the Google
  Identity Services (GIS) button, which returns an ID token directly; the
  backend only verifies it. Only "Authorized JavaScript origins" matter.
- **Account linking**: if someone registered with email+password and later
  clicks "Continue with Google" with the same (Google-verified) email, the
  Google identity is attached to the existing account — no duplicate users.
- **Google-only accounts** have `password = null`:
  - Password login answers: *"This account signs in with Google…"*
  - "Forgot password?" still works and effectively **sets** a first password,
    after which both login methods work.
- If `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is unset (or the GIS script is blocked by
  an ad blocker), the button and its "or" divider simply don't render —
  email/password remains the fallback. If `GOOGLE_CLIENT_ID` is missing on the
  backend, `POST /api/users/google` answers 503.

## One-time Google Cloud setup (~5 min)

1. Open <https://console.cloud.google.com/apis/credentials> (create/select a
   project, e.g. "Medzae").
2. Configure the **OAuth consent screen** (Branding): External, app name
   "Medzae", your support email. No extra scopes needed (only openid/email/
   profile, which are default). Publish the app so any Google account can sign
   in (while in "Testing" mode only listed test users can).
3. **Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins — one entry per host the button loads on,
     with no path and no trailing slash. A missing entry is the usual cause of
     the button failing silently:
     - `http://localhost:3000`
     - `https://medzae.com` — the live site; without this, sign-in is broken
       in production
     - `https://www.medzae.com` (308s to the apex, but list it anyway — a
       visitor who lands on `www` loads the button before the redirect)
     - `https://medzae.vercel.app` and `https://medihub-web.vercel.app`
       (pre-domain hosts; only needed while they still redirect)
   - Authorized redirect URIs: **leave empty** (not used by this flow).
4. Copy the **Client ID** (`xxxxx.apps.googleusercontent.com`). There is a
   client secret on that page — it is **not needed anywhere**.

## Environment variables (same value in both places)

| Where                      | Variable                       |
| -------------------------- | ------------------------------ |
| Vercel + `frontend/.env.local` | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |
| Render + `backend/.env`        | `GOOGLE_CLIENT_ID`             |

After setting the Vercel variable, **redeploy the frontend** (NEXT_PUBLIC_*
values are baked in at build time). Render restarts pick up its variable
automatically.

## Database migration

`backend/prisma/migrations/20260717000000_add_google_sso` makes
`User.password` nullable and adds a unique `User.googleId`. It is additive —
no existing data is touched.

- **Render**: applied automatically on deploy (`prisma migrate deploy` now
  runs in the build command).
- **Local dev**: `cd backend && npx prisma migrate deploy && npx prisma generate`

If the very first `migrate deploy` against an existing database fails with
**P3005** ("database schema is not empty"), the DB predates migration
tracking. Baseline the old migrations once, then deploy applies only the new
one:

```bash
cd backend
npx prisma migrate resolve --applied 20260222101020_add_opportunities
npx prisma migrate resolve --applied 20260222103650_add_note_position
npx prisma migrate resolve --applied 20260525092009_medihub
npx prisma migrate resolve --applied 20260531000100_add_password_reset_to_user
npx prisma migrate deploy
```

## Debugging

- `GET /api/health` → `googleAuth.configured` tells whether the backend has
  `GOOGLE_CLIENT_ID` set (same pattern as the `mail` and `ai` blocks).
- Button not showing → `NEXT_PUBLIC_GOOGLE_CLIENT_ID` missing at build time,
  or the GIS script is blocked (ad blocker / privacy extension).
- Google popup error `"The given origin is not allowed for the given client
  ID"` → the exact page origin isn't listed under Authorized JavaScript
  origins (scheme and port must match; changes take a few minutes to
  propagate).
- `401 Google sign-in could not be verified` → frontend and backend client
  IDs differ (audience mismatch) or the credential expired mid-flight; a
  second click issues a fresh one.
