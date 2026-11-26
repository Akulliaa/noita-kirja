// Tiny hand-off between pages for one-shot effects (e.g. stamp a note after saving it).
let pendingStamp: string | null = null;

export function queueStamp(id: string) { pendingStamp = id; }

/** True once if a stamp was queued for this id. */
export function takeStamp(id: string): boolean {
  if (pendingStamp !== id) return false;
  pendingStamp = null;
  return true;
}

export const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
