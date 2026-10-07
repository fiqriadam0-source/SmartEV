# Architecture

SmartEV Stor is a store-room app: staff record material usage, stock is restocked, stock levels are listed, and notifications go to Telegram. It merges two earlier projects, [MATERIAL-USAGE](https://github.com/fiqriadam0-source/MATERIAL-USAGE) and [RESTOCK](https://github.com/fiqriadam0-source/RESTOCK), which shared the same backend.

```
Browser (React SPA, PWA)  ──fetch──▶  Google Apps Script web app (/exec)  ──▶  Google Sheet
                                              │
                                              └──▶  Telegram Bot API
```

There is no server of our own. The Apps Script web app is the only backend and the Google Sheet is the database.

## Frontend

- React 19 + Vite 8 + Tailwind CSS 4 (`@tailwindcss/vite`). Plain JavaScript (JSX), no TypeScript.
- Single page, no router library. The current page is the URL hash: `#usage`, `#restock`, `#stock`, `#telegram` (see `PAGES` in `src/App.jsx`).
- All pages stay mounted and are hidden with the `hidden` attribute, so half-filled forms survive page switches.

| Path | Role |
| --- | --- |
| `src/App.jsx` | Shell: header, hamburger menu, theme switcher, install banner, shared data (materials, stock) |
| `src/api.js` | Backend URL (`VITE_API_URL`), `apiGet` / `apiPost` helpers, loaders (`fetchMaterials`, `fetchStock`, `fetchUsageHistory`) |
| `src/pages/UsagePage.jsx` | Material usage form: multiple rows, live balance lookup (debounced, per-row request counters), usage history |
| `src/pages/AddItemPage.jsx` | Admin-only page prepared for a future add-item flow to the `Stock` sheet |
| `src/pages/RestockPage.jsx` | Restock form + stock side panel |
| `src/pages/StockPage.jsx` | Full stock grid |
| `src/pages/TelegramPage.jsx` | Usage history view with size and newest item indicator; the old manual Telegram sender is no longer the primary flow |
| `src/components/` | `MaterialCombobox`, `StockList`, `StatusMessage` |
| `src/hooks/useRemoteData.js` | Load-on-mount + `reload()`; loaders must be stable module-level functions |
| `src/hooks/useInstallPrompt.js` | Add to Home Screen banner (native prompt / iOS instructions) |
| `src/themes.js` | Three Tailwind colour themes; pages receive the active theme as `theme` |
| `public/sw.js` | Service worker (registered only in production builds) |

Styling notes: headings use the `font-display` class (Archivo Black, defined in `src/index.css` `@theme`). Theme colours come from the `theme` object, not hard-coded per page.

Lint: `npm run lint` (ESLint with `react-hooks` v7 rules, which are strict: no writing globals in components, no sync `setState` in effects).

## Backend: Google Apps Script

Source: `backend/stock.gs`. It is **not** deployed from this repo automatically. Someone pastes it into the Apps Script project bound to the Google Sheet and publishes a new version of the existing deployment (Deploy → Manage deployments → Edit → New version) so the `/exec` URL stays the same.

Requests:

| Method | Parameters | Result |
| --- | --- | --- |
| GET | `action=getMaterials` | `string[]` unique material names |
| GET | `action=getSizesByMaterial&material=` | `string[]` sizes |
| GET | `action=getBalanceByMaterial&material=&saiz=` | `{ material, baki, minimum, saiz }` |
| GET | `action=getStock` | `[{ material, saiz, baki, minimum }]` |
| GET | `action=getUsageHistory` | usage rows, newest first |
| POST | `nama, tujuan, items` (JSON array) | record usage; text reply containing `Berjaya` on success |
| POST | `type=restock, material, saiz, kuantiti` | text reply `Restock Success` |
| POST | `type=telegram, message` | text reply `Telegram Success` |

Constraints that shape the frontend:

- POSTs are sent as `FormData` and read with `e.parameter`. Replies are plain text, and the frontend matches on substrings (`Berjaya`, `Restock Success`, `Telegram Success`, `Error`).
- Apps Script web apps do not answer CORS preflight (`OPTIONS`). Requests must stay "simple": no custom headers such as `Authorization`, no JSON content type. Pass extra data as form fields or query parameters.
- Telegram token and chat ID are read from **Script Properties** `TELEGRAM_TOKEN` and `TELEGRAM_CHAT_ID`. Never put them in code or in `VITE_*` variables.

### Google Sheet

| Sheet | Columns |
| --- | --- |
| `Stock` | A bahan, B stok awal, C digunakan, D baki, E minimum, F saiz |
| `MaterialUsage` | tarikh, nama, material, kuantiti, unit, tujuan, saiz |
| `Restock` | tarikh, material, kuantiti, saiz |

A material can have several rows in `Stock`, one per size (column F).

## Environment and deploy

| Variable | Where | Notes |
| --- | --- | --- |
| `VITE_API_URL` | `.env.local` (git-ignored), Vercel env vars, or GitHub Actions variable | Apps Script `/exec` URL. Baked into the public bundle at build time, so never a secret. |
| `VITE_SUPABASE_URL` | same | Supabase project URL. Public by design; see [plans/login-supabase.md](plans/login-supabase.md). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same | Supabase publishable (anon) key. Public by design, never the `service_role` key. |

- `.env.example` is the committed template.
- **Vercel** (intended host): Vite preset, set `VITE_API_URL` plus the two Supabase vars above, redeploy after changing any of them. No rewrites needed because navigation is hash-based.
- **GitHub Pages** (alternative): `.github/workflows/deploy-pages.yml`; `vite.config.js` sets `base` to `/<repo>/` only when running in GitHub Actions.

## Known issues / pending

- Login/roles (Supabase) is in progress but not deployed: migration not yet run, backend not yet redeployed with the auth check, `AUTH_MODE` stays `off` until then. See [plans/login-supabase.md](plans/login-supabase.md) for the exact handoff steps.
- `backend/stock.gs` changes (new `getStock`, Telegram via Script Properties, column E fix, auth check) must be deployed to Apps Script before the Stock page, Telegram page, and login work in production.
- Telegram bot tokens that were committed in the original repos must be revoked with @BotFather.
- A multi-item usage POST writes rows one at a time. If a later item fails (not found or not enough stock), earlier items are already saved.
- The old MATERIAL-USAGE and RESTOCK sites still call the same backend.
