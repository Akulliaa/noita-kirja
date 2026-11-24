// Full backup: every table as JSON + every stored image, in one zip.
import { zipSync, strToU8 } from 'fflate';
import { supabase } from './supabase';

const TABLES = ['profiles', 'elements', 'mixtures', 'notes', 'note_history', 'books', 'glyphs', 'pins', 'fog_chunks', 'player_positions'];

async function all(table: string) {
  const out: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function listImages(prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from('images').list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const f of data ?? []) {
      const path = prefix ? `${prefix}/${f.name}` : f.name;
      if (f.id === null) out.push(...(await listImages(path))); // folder
      else out.push(path);
    }
    if (!data || data.length < 1000) return out;
  }
}

export async function buildBackup(log: (m: string) => void): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    data[t] = await all(t);
    log(`${t}: ${data[t].length}`);
  }
  files['data.json'] = strToU8(JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 1));

  const paths = await listImages();
  log(`images: ${paths.length}`);
  for (let i = 0; i < paths.length; i++) {
    const { data: blob, error } = await supabase.storage.from('images').download(paths[i]);
    if (error || !blob) { log(`⚠ ${paths[i]}`); continue; }
    files[`images/${paths[i]}`] = new Uint8Array(await blob.arrayBuffer());
    if (i % 10 === 9) log(`images ${i + 1}/${paths.length}`);
  }
  return zipSync(files, { level: 0 });
}
