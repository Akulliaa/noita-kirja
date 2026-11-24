// Fill every missing translation in the database (admin tool).
import { supabase } from './supabase';
import { translateText, otherLang } from './translate';
import type { Lang } from './types';

const PLAN: { table: string; fields: string[] }[] = [
  { table: 'elements', fields: ['name'] },
  { table: 'mixtures', fields: ['note'] },
  { table: 'notes', fields: ['title', 'body'] },
  { table: 'books', fields: ['title', 'content', 'loc_label'] },
  { table: 'glyphs', fields: ['meaning', 'notes'] },
  { table: 'pins', fields: ['title'] },
];

export async function translateMissing(log: (m: string) => void, shouldStop: () => boolean) {
  let done = 0, failed = 0;
  for (const { table, fields } of PLAN) {
    const cols = ['id', 'lang', ...fields, ...fields.map((f) => `${f}_tr`)].join(',');
    const { data, error } = await supabase.from(table).select(cols);
    if (error) { log(`❌ ${table}: ${error.message}`); continue; }
    const rows = ((data ?? []) as unknown as Record<string, any>[]).filter((r) =>
      fields.some((f) => r[f] && String(r[f]).trim() && !r[`${f}_tr`]));
    log(`${table}: ${rows.length}`);
    for (const r of rows) {
      if (shouldStop()) { log('⏹'); return { done, failed }; }
      const patch: Record<string, string> = {};
      for (const f of fields) {
        if (!r[f] || !String(r[f]).trim() || r[`${f}_tr`]) continue;
        const tr = await translateText(String(r[f]), r.lang as Lang, otherLang(r.lang as Lang));
        if (tr === null) { failed++; continue; }
        patch[`${f}_tr`] = tr;
      }
      if (Object.keys(patch).length) {
        const { error: e } = await supabase.from(table).update(patch).eq('id', r.id);
        if (e) { failed++; log(`❌ ${table}: ${e.message}`); } else done++;
      }
    }
  }
  return { done, failed };
}
