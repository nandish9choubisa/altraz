# Altraz — AI Misinformation Scanner

Front-end only (React + Vite + Tailwind). No backend, no login. Data is stored in the visitor's browser.

## Run locally
```bash
npm install
cp .env.example .env.local   # then put your Groq key inside
npm run dev
```

## Build
```bash
npm run build   # output in dist/
```

## Environment variables (set in your host's dashboard, not in git)
| Name | Required | Notes |
|---|---|---|
| `VITE_GROQ_KEYS` | yes | Comma-separated Groq API keys |
| `VITE_CURRENTS_KEY` | no | Currents news key |

Note: Vite bundles these into the public JavaScript, so anyone can read them from the browser.
Use free-tier keys you can rotate, or put a small proxy in front of the APIs.

## Deploy (free)
Cloudflare Pages / Netlify / Vercel: build command `npm run build`, output directory `dist`.
