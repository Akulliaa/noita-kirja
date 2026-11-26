// Player titles earned from contributions. Edit names / thresholds / weights freely.
import type { Lang } from './types';

export interface Contrib { notes: number; books: number; mixtures: number; runes: number; pins: number }

/** Points for each kind of contribution. */
export const WEIGHTS: Contrib = { notes: 3, books: 5, mixtures: 1, runes: 2, pins: 1 };

export const RANKS: { min: number; icon: string; name: Record<Lang, string> }[] = [
  { min: 0, icon: '🕯️', name: { fr: 'Vagabond', en: 'Wanderer' } },
  { min: 5, icon: '📜', name: { fr: 'Apprenti', en: 'Apprentice' } },
  { min: 15, icon: '🔍', name: { fr: 'Chercheur', en: 'Seeker' } },
  { min: 35, icon: '⚗️', name: { fr: 'Alchimiste', en: 'Alchemist' } },
  { min: 70, icon: '📚', name: { fr: 'Érudit', en: 'Scholar' } },
  { min: 120, icon: '🗝️', name: { fr: 'Archiviste', en: 'Archivist' } },
  { min: 200, icon: '🔮', name: { fr: 'Sage', en: 'Sage' } },
  { min: 320, icon: '✨', name: { fr: 'Archimage', en: 'Archmage' } },
];

export function points(c: Contrib): number {
  return (Object.keys(WEIGHTS) as (keyof Contrib)[]).reduce((s, k) => s + c[k] * WEIGHTS[k], 0);
}

/** Current rank, next rank (if any) and progress 0..1 towards it. */
export function rankOf(pts: number) {
  let i = 0;
  while (i + 1 < RANKS.length && pts >= RANKS[i + 1].min) i++;
  const cur = RANKS[i], next = RANKS[i + 1] ?? null;
  const progress = next ? (pts - cur.min) / (next.min - cur.min) : 1;
  return { cur, next, progress };
}

// ---------------------------------------------------------------------------
// Special titles: unlocked by doing one specific thing, each with 3 levels.
// ---------------------------------------------------------------------------
export interface Stats extends Contrib { explored: number } // explored = % of the whole map

export interface Title {
  id: string;
  stat: keyof Stats;
  icon: string;
  what: Record<Lang, string>; // what is counted, e.g. "mixtures recorded"
  tiers: { n: number; name: Record<Lang, string> }[];
}

export const TITLES: Title[] = [
  { id: 'alchemist', stat: 'mixtures', icon: '⚗️', what: { fr: 'mélanges enregistrés', en: 'mixtures recorded' }, tiers: [
    { n: 10, name: { fr: 'Apprenti alchimiste', en: 'Apprentice alchemist' } },
    { n: 50, name: { fr: 'Alchimiste', en: 'Alchemist' } },
    { n: 150, name: { fr: 'Grand alchimiste', en: 'Grand alchemist' } } ] },
  { id: 'explorer', stat: 'explored', icon: '🧭', what: { fr: '% de la carte explorée', en: '% of the map explored' }, tiers: [
    { n: 0.5, name: { fr: 'Éclaireur', en: 'Scout' } },
    { n: 2, name: { fr: 'Explorateur', en: 'Explorer' } },
    { n: 5, name: { fr: 'Grand explorateur', en: 'Pathfinder' } } ] },
  { id: 'librarian', stat: 'books', icon: '📚', what: { fr: 'livres trouvés', en: 'books found' }, tiers: [
    { n: 1, name: { fr: 'Lecteur', en: 'Reader' } },
    { n: 5, name: { fr: 'Bibliothécaire', en: 'Librarian' } },
    { n: 15, name: { fr: 'Gardien des livres', en: 'Keeper of books' } } ] },
  { id: 'scribe', stat: 'notes', icon: '🪶', what: { fr: 'notes écrites', en: 'notes written' }, tiers: [
    { n: 3, name: { fr: 'Scribe', en: 'Scribe' } },
    { n: 10, name: { fr: 'Chroniqueur', en: 'Chronicler' } },
    { n: 30, name: { fr: 'Historien', en: 'Loremaster' } } ] },
  { id: 'runes', stat: 'runes', icon: '🔣', what: { fr: 'textes runiques ajoutés', en: 'runic texts added' }, tiers: [
    { n: 1, name: { fr: 'Déchiffreur', en: 'Decipherer' } },
    { n: 5, name: { fr: 'Runologue', en: 'Runologist' } },
    { n: 15, name: { fr: 'Maître des runes', en: 'Rune master' } } ] },
  { id: 'cartographer', stat: 'pins', icon: '📍', what: { fr: 'repères posés', en: 'pins placed' }, tiers: [
    { n: 5, name: { fr: 'Arpenteur', en: 'Surveyor' } },
    { n: 20, name: { fr: 'Cartographe', en: 'Cartographer' } },
    { n: 50, name: { fr: 'Maître cartographe', en: 'Master cartographer' } } ] },
];

/** Level reached (0 = locked, 1..3), the current and next tier, and the counted value. */
export function titleLevel(title: Title, s: Stats) {
  const value = s[title.stat];
  let level = 0;
  while (level < title.tiers.length && value >= title.tiers[level].n) level++;
  return { level, value, cur: level ? title.tiers[level - 1] : null, next: title.tiers[level] ?? null };
}
