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
