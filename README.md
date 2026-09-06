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
- Menus and photos are placeholders/community-style fallbacks — there's no
  official menu or photo API wired in yet. See the code comments in `src/Perch.jsx`
  near `ShopArt` and the "Menu" tab for exactly where real data would plug in.
- Live nationwide city search is not wired up yet — only the four preloaded
  cities currently have real data. See the project chat history for notes on
  wiring in the Google Places API (New) for true nationwide search, using your
  own API key.

## Getting started

```bash
npm install
npm run dev
```

Then open the local URL Vite prints (usually http://localhost:5173).

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

## Adding a real API key later

If you wire up the Google Places API (or any other service key), put it in a
`.env` file at the project root (already covered by `.gitignore`) rather than
hardcoding it in `Perch.jsx` — especially before pushing to a public GitHub repo.
