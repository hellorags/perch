# Perch

Find your next cozy coffee shop to work from — a prototype coffee-shop discovery app
built for students and remote workers who need outlets, seating, and quiet.

## What's real vs. sample data

- Shop names, addresses, ratings, hours, and phone numbers for the four preloaded
  cities (Norcross GA, Austin TX, Seattle WA, Chicago IL) are real, pulled from
  public listings.
- Outlets/parking/noise fields are compiled from public reviews where mentioned;
  shops with no clear mention are honestly marked "not yet reported" rather than
  guessed.
- Menus and photos are placeholders/community-style fallbacks for the four
  preloaded cities — there's no official menu API, so that tab stays honest
  about it. See `src/Perch.jsx` near `ShopArt` and the "Menu" tab.
- Live nationwide city search **is wired up** — type any US city and (with an
  API key configured, see below) it queries Google Places for real. Without a
  key, typing an unsupported city just tells you so and points you back to
  the four preloaded ones.

## Getting started

```bash
npm install
npm run dev
```

Then open the local URL Vite prints (usually http://localhost:5173).

## Enabling live nationwide search (optional)

The four preloaded cities work with zero setup. To search *any* US city live:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/), create
   a project (or use an existing one).
2. Enable **"Places API (New)"** for that project (Console → APIs & Services →
   Library → search "Places API (New)" → Enable). Google requires billing to
   be enabled on the project even to use the free monthly credit — you'll need
   to add a card, but typical prototype usage stays within the free tier.
3. Create an API key (APIs & Services → Credentials → Create Credentials →
   API Key).
4. **Restrict the key** (Credentials → click your key → "Application
   restrictions" → HTTP referrers) to your own domain (and `localhost` while
   developing). This matters because the key ends up visible in your app's
   browser bundle — anyone could otherwise use it and run up your bill.
5. Copy `.env.example` to `.env` and paste your key in:
   ```
   cp .env.example .env
   ```
6. Restart `npm run dev` (Vite only reads `.env` on startup).

Even with referrer restrictions, remember this key is client-side and visible
in the Network tab of any browser's dev tools — that's a real limitation of a
frontend-only app like this one. A production version would proxy Places
requests through a small backend so the key never reaches the browser at all.

## Building for production

```bash
npm run build
npm run preview
```

## Project structure

```
perch-app/
├── index.html
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── vite.config.js
└── src/
    ├── main.jsx      # React entry point
    ├── App.jsx       # Renders <Perch />
    ├── Perch.jsx     # The actual app — all UI, data, and logic lives here
    └── index.css     # Tailwind directives
```
