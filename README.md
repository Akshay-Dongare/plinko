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

## Start-up picture on iPhone

- An iPhone shows a start-up picture from the push on the Home Screen icon until the page is ready. Without one, the screen is white.
- The picture is the game screen with nothing in it: the red background, the cabinet, the board, the cards and the drop bar.
- There are no picture files. `startPic` in `index.html` draws the picture in Safari for the screen of that phone, and iOS takes it when the player adds the app to the Home Screen.
- A copy of the app that is already on a Home Screen has no picture. Remove that copy and add the app again to get one.
- Safari cannot tell the height of the status bar of the installed app, so `startPic` has a small table of iPhone screen heights. A screen that is not in the table gets a usual value, and the shapes can be some points off.
- Android makes its own start-up screen from `manifest.webmanifest`.

## To clear the game data of all players

- `DATA_V` in `lib/state.js` is the data version. Each save holds the version that wrote it.
- If you raise `DATA_V`, the server replaces each older save with an empty game when it next reads that save. Balance, sessions and history go. The account and the two sound settings stay.
- This cannot be undone. Version 2 started on 25 November 2026 and version 3 on 26 November 2026.

## The fall of a ball

- The path of a ball is fixed at the moment of the drop: one 50/50 choice for each row. The fall is only a picture of that path. It does not change the odds.
- The ball makes one bounce on each peg of its path. It lands a little to the left or to the right of the top of the peg and leaves the peg to that side.
- Each hop to the next peg is a true flight. The side speed does not change in the air, and gravity makes the curve. Each hop has its own height and its own time (`HOP` and `makeBall` in `index.html`).
- Nothing turns the ball in the air and no bounce goes against the peg. A first version used ball physics with a search and a push toward the slot. It let a ball bounce on one peg for more than a second and turned some bounces around, so it looked fixed. It was removed.

## Sound and music

- All sound is made in the browser with Web Audio. There are no sound files.
- The win sounds are a mallet on a G major pentatonic scale, so that hits at the same time stay in tune.
- The music is one loop of 8 bars in G major ("Casino floor"): bells that go up and down on a soft pad, with a slow pulse. It is in `index.html`, below the win sounds.
- The header has two round buttons. The note button is for the music. The speaker button is for the game sounds. Each button has its word below it: "Music" and "Sounds". Each button has its own on and off, and the game saves the two settings with the account.
- A browser lets sound start only after a touch, a click or a key. So the music starts with the first one after the game shows, at any place on the page. This is also true after a reload. A browser that lets sound start with no touch plays the music at once.
- If the music is on but silent (after a reload, or after iOS stops the sound), a push on the note button starts it. That push does not turn the music off.
- In Chrome, a reload with F5, Cmd+R or Ctrl+R keeps the music with no touch. The page does that reload itself, and Chrome then lets the sound start. The reload button of the browser and a phone cannot do this: there the first touch starts the music.
- The music stops when the note button is off, when the page is hidden and on the sign-in card.
- The music is quiet. Its average level is 6 dB below the ball sounds, and its peaks are 15 dB below. The value is `bus.gain` in `musStart`.
- A save from before the music has no music setting. If that player had the sound off, the music is off too.

## Buy-in and currency

- Sign-up asks one question: "How much does a good evening out cost you?" The answer is the player's buy-in. There are 4 tiles and a field for a different amount.
- The currency comes from the device's time zone: India gets ₹, all other places get $. A small link on the question changes it. Amounts are never converted.
- Tiles: $50, $100, $200, $300 and ₹1,000, ₹2,000, ₹3,000, ₹5,000. Limits: $10 to $5,000 and ₹200 to ₹2,00,000. They are in `CURS` in `index.html` and `STAKE` in `lib/state.js`.
- Bets scale with the buy-in: the default bet is 1% and the minimum is 0.1%.
- A player can change the buy-in between sessions. The currency is locked after the first session, because amounts in two currencies cannot be added. The dashboard shows totals for all players in evenings out.

## How sign-in works

- New players sign in with their email and a 6-digit code (expires in 10 minutes, 5 tries, 5 codes an hour).
- A phone can load the page again when the player comes back from the mail app. The open code request (email, name, buy-in) stays on the device for 10 minutes in `localStorage` (`plinko-code`), so the card for the code comes back. A sign-in or "Use a different email" removes it.
- After that they can add a passkey (Face ID, Touch ID, Windows Hello or a phone via QR) for one-tap sign-in.
- Sessions last 30 days in an HttpOnly cookie. Signing out clears the game from that device.
- Guest history on a device is merged into the account the first time that device signs in.

Play money only. Nothing here takes or pays out real money.
