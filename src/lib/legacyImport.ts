// One-shot import of the old Tkinter app: ELEMENTS ONLY (by choice — mixtures,
// quests, theories and map start fresh). Idempotent: existing names are skipped.
import { supabase } from './supabase';

const norm = (s: string) => s.trim().toLowerCase();

/** Read the element names from the old grimoire_data.json. */
export async function readLegacyElements(file: File): Promise<string[] | null> {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data?.items)) return null;
    const seen = new Map<string, string>();
    for (const it of data.items) if (typeof it === 'string' && it.trim()) seen.set(norm(it), it.trim());
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  } catch {
    return null;
  }
}

/** Insert the names that don't exist yet. Returns how many were added. */
export async function importElements(names: string[]): Promise<number> {
  const { data: existing, error } = await supabase.from('elements').select('name');
  if (error) throw error;
  const have = new Set((existing ?? []).map((e) => norm(e.name)));
  const rows = names.filter((n) => !have.has(norm(n))).map((name) => ({ name, lang: 'fr' }));
  if (rows.length) {
    const { error: insErr } = await supabase.from('elements').insert(rows);
    if (insErr) throw insErr;
  }
  return rows.length;
}
