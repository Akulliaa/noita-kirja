// Show user content in the reader's language: original if it matches, else the stored translation.
import { i18n } from './i18n.svelte';
import type { Lang } from './types';

type Translatable = { lang: Lang } & Record<string, any>;

export function lt(item: Translatable | null | undefined, field: string): string {
  if (!item) return '';
  const orig = item[field] ?? '';
  if (item.lang === i18n.lang) return orig;
  const tr = item[`${field}_tr`];
  return tr && String(tr).trim() ? tr : orig;
}

/** True when the reader sees the original because no translation exists yet. */
export function untranslated(item: Translatable | null | undefined, field: string): boolean {
  if (!item || item.lang === i18n.lang) return false;
  const orig = item[field];
  return !!orig && String(orig).trim() !== '' && !item[`${field}_tr`];
}
