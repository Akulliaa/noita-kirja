# Noita Kirja Codex – Web rewrite plan

## Decisions
- **Hosting**: static site on GitHub Pages → `https://akulliaa.github.io/noita-kirja/` (separate public repo, code only).
- **Backend**: Supabase free tier (Postgres + Auth + Storage + Realtime). Roles enforced with Row Level Security.
  Weekly GitHub Action ping so the free project never pauses.
- **Login**: username + password only. Internally mapped to a fake address `username@users.grimoire.invalid`
  (never shown, never mailed). No email confirmation. New sign-ups are *pending* until an admin approves.
  Forgotten password → admin resets it (Supabase Edge Function).
- **Roles**: `admin` (add/edit everything), `reader` (view only). Everyone (admin or reader) can have their own exploration track.
- **Browsers**: Firefox, Chrome, Edge, Brave all supported for using the site. Internet Explorer is not supported (retired by Microsoft in 2022).
- **Map tiles**: loaded directly from noitamap's tile server (CORS `*` verified).
- **Fog**: solid black on unexplored areas, no blur.
- **Global map**: admins' explored areas by default, colored outline per player, checkbox "include readers".
  **Individual map**: every member has their own.
- **Tracking**: tiny Noita mod that sends the position itself (via Windows' built-in `curl.exe`, hidden, async)
  using a personal "tracker key" generated on the site → works whatever the browser, even with the site closed.
  Fallback 1: Chrome/Edge page reads the mod's position file. Fallback 2: sync after game from the save folder (to verify).
- **Languages**: FR/EN UI toggle. User content translated once at save time (free online service, Chrome built-in translator when available), both versions stored, admin can correct.

## Phases
1. Base: Vite + TypeScript app, GitHub Pages deploy, Supabase schema/RLS, username login, approval, import of current data.
2. Alchemy: elements (+ merge duplicates), mixtures with 2+ ingredients, table with filters.
3. Notes: quests/theories/misc, tags, status, images (paste/drag, auto-compress), realtime, history, search.
4. Map: black fog, manual brush, pins ↔ notes, per-player maps, global map with colored outlines.
5. Tracking: mod + tracker keys + live dots; fallbacks.
6. FR/EN UI + auto-translation.
7. Polish: activity feed, JSON backup export, anti-pause cron, mobile layout.

## Rule
No game spoilers anywhere (no recipes, locations or mechanics the players haven't found themselves).
