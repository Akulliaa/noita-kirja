# Noita Kirja

A shared, spoiler-free journal for a group playing Noita together: alchemy mixtures,
notes & theories, a library of found books, a Rosetta Stone for the game's alphabet,
and a fog-of-war map that each player reveals by exploring (automatically, with a small mod).

**Site:** https://akulliaa.github.io/noita-kirja/

## Features
- Username + password accounts (no email). New accounts wait for admin approval.
- Roles: **admin** (edit everything) and **reader** (read-only, can still track their own map).
- Elements & mixtures with 2+ ingredients, untested-pairs helper, merge duplicates.
- Notes (quests / theories / misc) with status, tags, images (paste a screenshot), history & restore.
- Library of books with a location on the map; Rosetta Stone of glyphs with confidence levels.
- Map on noitamap tiles with black fog, per-player maps, global map with a colored outline per player,
  pins, book markers, live player dots. Tiles of unexplored areas are never downloaded.
- Tracker mod for Noita (works with Entangled Worlds) that reveals the map as you play.
- French / English interface; everything users write is machine-translated on save (editable).
- Activity feed, global search, one-click full backup (data + images).

## Architecture
- Static site (Vite + Svelte 5 + TypeScript) deployed to GitHub Pages by `.github/workflows/deploy.yml`.
- Supabase (free tier): Postgres with Row Level Security, Auth, Storage (private `images` bucket), Realtime.
- `.github/workflows/keepalive.yml` pings Supabase twice a week so the free project never pauses.
- The Supabase URL and *publishable* key in `src/lib/config.ts` are public by design; access is enforced by RLS.

## Database setup
Run each file of `supabase/migrations/` **in order** in Supabase → SQL Editor:

| File | Adds |
|---|---|
| `001_init.sql` | profiles/roles, elements, mixtures, notes, books, glyphs, pins, fog, storage, realtime |
| `002_merge_elements.sql` | merge duplicate elements |
| `003_note_history.sql` | note version history |
| `004_tracker.sql` | tracker keys, `track()` endpoint, live positions |
| `005_quiet_translations.sql` | adding translations doesn't count as an edit |
| `006_rune_locations.sql` | map position of runic texts (Rosetta Stone tab) |
| `007_quiet_tracking.sql` | lighter tracking: only writes map/position when something changed (lets the mod send every second) |
| `008_user_prefs.sql` | private per-account preferences (players hidden on the global map, map layers) |

Also: Authentication → Sign In / Providers → Email → turn **Confirm email** off.
The first account created becomes admin.

## Tracker mod
Source in `mod/noita_kirja_tracker/`. Players don't copy it by hand: the **Tracker** page of the site
builds a zip containing their personal key. Requires Noita's "unsafe mods" (already needed by Entangled Worlds)
and Windows 10/11 (uses the built-in `curl.exe`, started hidden). Temp files and a log go to `%TEMP%`.

## Development
```bash
npm install
npm run dev      # http://localhost:5173/noita-kirja/
npm run check    # type-check
npm run build
```

The old desktop app lives in `legacy/` (git-ignored, never published).
