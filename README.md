# Plinko

Play-money Plinko with a $100 buy-in, hold-to-drop (Space or the button), auto mode, cash-outs and a full cash-out history. All game text uses ASD-STE100 Simplified Technical English.
Live at https://plinko.akshaydongare.com

## What's here

| Path | What it does |
|---|---|
| `index.html` | The game. Works signed out (saved on the device) or signed in (saved to your account). |
| `admin.html` | Players dashboard at `/admin`, only for the emails in `ADMIN_EMAILS`. |
| `api/auth.js` | Sign-in: 6-digit email codes, passkeys, sign out, delete account. |
| `api/state.js` | Loads and saves each player's game (balance, settings, cash-out history). |
| `api/admin.js` | Every player's email, dates and history for the dashboard. |
| `lib/` | Redis over REST, cookies and sessions, email sending. |

No build step: Vercel serves the HTML files as they are and runs `api/` as functions.

## Environment variables (set in Vercel)

| Name | What it is |
|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis REST endpoint and token (any `*_REST_API_URL` / `*_REST_API_TOKEN` pair also works). All keys are stored under `plinko:`, so the database can be shared with other projects. |
| `RESEND_API_KEY` | Resend key for sending sign-in codes from `plinko@akshaydongare.com`. |
| `ADMIN_EMAILS` | Comma-separated emails that can open `/admin`. |

## How sign-in works

- New players sign in with their email and a 6-digit code (expires in 10 minutes, 5 tries, 5 codes an hour).
- After that they can add a passkey (Face ID, Touch ID, Windows Hello or a phone via QR) for one-tap sign-in.
- Sessions last 30 days in an HttpOnly cookie. Signing out clears the game from that device.
- Guest history on a device is merged into the account the first time that device signs in.

Play money only. Nothing here takes or pays out real money.
