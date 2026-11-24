// One-shot import of the old Tkinter app (grimoire_data.json + Melanges/ folder).
// Idempotent: anything that already exists is skipped.
import { supabase } from './supabase';
import { applyFog, rasterizeCircle, type FogGrid } from './fog';

interface LegacyData {
  items: string[];
  combos: Record<string, string>;
  deleted_pairs: string[];
  quests: Record<string, { doc?: { t: string; v?: string; file?: string; scale?: number; indent?: number }[]; theory?: string }>;
}
interface Stroke { x: number; y: number; r: number; op: 'reveal' | 'hide' }

export interface LegacyBundle {
  data: LegacyData;
  strokes: Stroke[];
  images: Map<string, File>; // "Quest name/file.png" -> File
}

const norm = (s: string) => s.trim().toLowerCase();

export async function readLegacyFolder(files: FileList | File[]): Promise<LegacyBundle | null> {
  const list = Array.from(files);
  const path = (f: File) => (f as any).webkitRelativePath as string || f.name;
  const dataFile = list.find((f) => path(f).endsWith('grimoire_data.json'));
  if (!dataFile) return null;
  const data = JSON.parse(await dataFile.text()) as LegacyData;
  data.items ??= []; data.combos ??= {}; data.deleted_pairs ??= []; data.quests ??= {};

  const fogFile = list.find((f) => path(f).endsWith('Melanges/map_fog.json'));
  const strokes: Stroke[] = fogFile ? (JSON.parse(await fogFile.text()).strokes ?? []) : [];

  const images = new Map<string, File>();
  for (const f of list) {
    const m = path(f).match(/Melanges\/Quests\/([^/]+)\/([^/]+\.(png|jpe?g|webp|gif))$/i);
    if (m) images.set(`${m[1]}/${m[2]}`, f);
  }
  return { data, strokes, images };
}

export function summarize(b: LegacyBundle) {
  const referenced = new Set<string>();
  for (const [q, v] of Object.entries(b.data.quests))
    for (const blk of v.doc ?? []) if (blk.t === 'img' && blk.file) referenced.add(`${q}/${blk.file}`);
  return {
    elements: b.data.items.length,
    mixtures: Object.keys(b.data.combos).length + b.data.deleted_pairs.length,
    quests: Object.keys(b.data.quests).length,
    images: [...referenced].filter((k) => b.images.has(k)).length,
    strokes: b.strokes.length,
  };
}

// Old map placed the 3 noitamap parts side by side with the middle part centered on x=0
// and y=0 at the top. Convert to real game coordinates (the DZI "TopLeft" values).
function legacyToWorld(x: number, y: number) {
  const W_LEFT = 36352, W_MID = 36352;
  const oldMid = -W_MID / 2, oldLeft = oldMid - W_LEFT, oldRight = oldMid + W_MID;
  const realLeft = -53760, realMid = -17920, realRight = 17920, top = -31744;
  let wx: number;
  if (x < oldMid) wx = x - oldLeft + realLeft;
  else if (x < oldRight) wx = x - oldMid + realMid;
  else wx = x - oldRight + realRight;
  return { x: wx, y: y + top };
}

export async function runImport(b: LegacyBundle, me: string, log: (msg: string) => void) {
  // ---- Elements -----------------------------------------------------------
  log('Elements…');
  const { data: existingEls, error: e1 } = await supabase.from('elements').select('id,name');
  if (e1) throw e1;
  const byName = new Map<string, string>((existingEls ?? []).map((e) => [norm(e.name), e.id]));

  const wanted = new Map<string, string>(); // norm -> display
  for (const it of b.data.items) if (it.trim()) wanted.set(norm(it), it.trim());
  for (const r of Object.values(b.data.combos)) if (r.trim() && norm(r) !== 'none') wanted.set(norm(r), wanted.get(norm(r)) ?? r.trim());
  for (const k of [...Object.keys(b.data.combos), ...b.data.deleted_pairs])
    for (const part of k.split('||')) if (!wanted.has(norm(part))) wanted.set(norm(part), part.toUpperCase());

  const toInsert = [...wanted].filter(([n]) => !byName.has(n)).map(([, name]) => ({ name, lang: 'fr' }));
  if (toInsert.length) {
    const { data, error } = await supabase.from('elements').insert(toInsert).select('id,name');
    if (error) throw error;
    for (const e of data ?? []) byName.set(norm(e.name), e.id);
  }
  log(`  +${toInsert.length} elements`);

  // ---- Mixtures -----------------------------------------------------------
  log('Mixtures…');
  const { data: existingMix, error: e2 } = await supabase.from('mixtures').select('ingredients');
  if (e2) throw e2;
  const mixKey = (ids: string[]) => [...ids].sort().join(',');
  const haveMix = new Set((existingMix ?? []).map((m) => mixKey(m.ingredients)));

  const rows: { ingredients: string[]; result_id: string | null; no_reaction: boolean }[] = [];
  const addRow = (k: string, result: string | null) => {
    const ids = k.split('||').map((p) => byName.get(norm(p))!);
    if (ids.some((x) => !x) || new Set(ids).size < 2) return;
    const key = mixKey(ids);
    if (haveMix.has(key)) return;
    haveMix.add(key);
    const noReaction = result === null || norm(result) === 'none';
    rows.push({ ingredients: ids, result_id: noReaction ? null : byName.get(norm(result!)) ?? null, no_reaction: noReaction });
  };
  for (const [k, r] of Object.entries(b.data.combos)) addRow(k, r);
  for (const k of b.data.deleted_pairs) addRow(k, null);
  if (rows.length) {
    const { error } = await supabase.from('mixtures').insert(rows);
    if (error) throw error;
  }
  log(`  +${rows.length} mixtures`);

  // ---- Notes (quests + theories) -----------------------------------------
  log('Notes…');
  const { data: existingNotes, error: e3 } = await supabase.from('notes').select('title,kind');
  if (e3) throw e3;
  const haveNote = new Set((existingNotes ?? []).map((n) => `${n.kind}|${norm(n.title)}`));
  let notesAdded = 0, imgsUploaded = 0;

  for (const [title, q] of Object.entries(b.data.quests)) {
    if (!haveNote.has(`quest|${norm(title)}`)) {
      const { data: note, error } = await supabase
        .from('notes').insert({ kind: 'quest', title, status: 'in_progress', lang: 'fr' }).select('id').single();
      if (error) throw error;

      const parts: string[] = [];
      for (const blk of q.doc ?? []) {
        if (blk.t === 'text') parts.push((blk.v ?? '').replace(/\s+$/, ''));
        else if (blk.t === 'img' && blk.file) {
          const f = b.images.get(`${title}/${blk.file}`);
          if (!f) { parts.push(`*(missing image ${blk.file})*`); continue; }
          const path = `notes/${note.id}/${blk.file}`;
          const { error: upErr } = await supabase.storage.from('images').upload(path, f, { upsert: true, contentType: f.type || undefined });
          if (upErr) throw upErr;
          imgsUploaded++;
          const scale = Math.max(10, Math.min(300, Number(blk.scale) || 100));
          parts.push(`![${blk.file}](kirja:${path}${scale !== 100 ? ` "w=${scale}"` : ''})`);
        }
      }
      const { error: upd } = await supabase.from('notes').update({ body: parts.join('\n\n').trim() }).eq('id', note.id);
      if (upd) throw upd;
      notesAdded++;
      log(`  quest: ${title}`);
    }
    const theory = (q.theory ?? '').trim();
    const theoryTitle = `${title} — Théorie`;
    if (theory && !haveNote.has(`theory|${norm(theoryTitle)}`)) {
      const { error } = await supabase.from('notes').insert({
        kind: 'theory', title: theoryTitle, body: theory, status: 'idea', lang: 'fr', tags: [title],
      });
      if (error) throw error;
      notesAdded++;
    }
  }
  log(`  +${notesAdded} notes, ${imgsUploaded} images`);

  // ---- Map fog (strokes → explored cells of the importing admin) ----------
  if (b.strokes.length) {
    log('Map…');
    const grid: FogGrid = new Map();
    for (const s of b.strokes) {
      if (!isFinite(s.x) || !isFinite(s.y) || !(s.r > 0)) continue;
      const w = legacyToWorld(s.x, s.y);
      rasterizeCircle(grid, w.x, w.y, s.r, s.op === 'hide');
    }
    const n = await applyFog(me, grid, false, (done, total) => log(`  map ${done}/${total}`));
    log(`  ${n} map chunks`);
  }
}
