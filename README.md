# Plinko

Play-money Plinko with hold-to-drop (Space or the button), auto mode, cash-outs and a full cash-out history. Each player sets their own buy-in at sign-up: the cost of a good evening out, in $ or ₹. All game text uses ASD-STE100 Simplified Technical English.
Live at https://plinko.akshaydongare.com

## What's here

| Path | What it does |
|---|---|
| `index.html` | The game. On the live site you must sign in, and your game is saved to your account. |
| `og.png` | The picture that chat apps show with a link to the game. The `og:` tags in `index.html` point to it on the live site. |
| `icon-maskable-512.png` | The home screen icon for Android. Android cuts this icon to a circle or to a different shape, so the board is smaller and stays in the middle. `manifest.webmanifest` points to it. |
| `admin.html` | Players dashboard at `/admin`, only for the emails in `ADMIN_EMAILS`. |
| `api/auth.js` | Sign-in: 6-digit email codes, passkeys, sign out, delete account. |
| `api/state.js` | Loads and saves each player's game (balance, settings, cash-out history). |
| `api/admin.js` | Every player's email, dates and history for the dashboard. |
| `lib/` | Redis over REST, cookies and sessions, email sending. |
| `dev/serve.mjs` | Local dev server with an in-memory database and fake email. |

No build step: Vercel serves the HTML files as they are and runs `api/` as functions.

## Run it locally

```
npm ci
node dev/serve.mjs
```

This serves the full app at http://localhost:3000 with an in-memory database and fake email, so it needs no secrets. Sign-in codes print in the terminal. Any email works, and `akshay@akshaydongare.com` is the admin. Data is lost when the server stops.

## Environment variables (set in Vercel)

| Name | What it is |
|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis REST endpoint and token (any `*_REST_API_URL` / `*_REST_API_TOKEN` pair also works). All keys are stored under `plinko:`, so the database can be shared with other projects. |
| `RESEND_API_KEY` | Resend key for sending sign-in codes from `plinko@akshaydongare.com`. |
| `ADMIN_EMAILS` | Comma-separated emails that can open `/admin`. |

## Sound and music

- All sound is made in the browser with Web Audio. There are no sound files.
- The win sounds are a mallet on a G major pentatonic scale, so that hits at the same time stay in tune.
- The music is one loop of 8 bars in G major ("Casino floor"): bells that go up and down on a soft pad, with a slow pulse. It is in `index.html`, below the win sounds.
- The music starts with the first sound of a session, for example the buy-in. It stops when the sound is off, when the page is hidden and on the sign-in card.

## Buy-in and currency

- Sign-up asks one question: "How much does a good evening out cost you?" The answer is the player's buy-in. There are 4 tiles and a field for a different amount.
- The currency comes from the device's time zone: India gets ₹, all other places get $. A small link on the question changes it. Amounts are never converted.
- Tiles: $50, $100, $200, $300 and ₹1,000, ₹2,000, ₹3,000, ₹5,000. Limits: $10 to $5,000 and ₹200 to ₹2,00,000. They are in `CURS` in `index.html` and `STAKE` in `lib/state.js`.
- Bets scale with the buy-in: the default bet is 1% and the minimum is 0.1%.
- A player can change the buy-in between sessions. The currency is locked after the first session, because amounts in two currencies cannot be added. The dashboard shows totals for all players in evenings out.

## How sign-in works

- New players sign in with their email and a 6-digit code (expires in 10 minutes, 5 tries, 5 codes an hour).
- After that they can add a passkey (Face ID, Touch ID, Windows Hello or a phone via QR) for one-tap sign-in.
- Sessions last 30 days in an HttpOnly cookie. Signing out clears the game from that device.
- Guest history on a device is merged into the account the first time that device signs in.

Play money only. Nothing here takes or pays out real money.
