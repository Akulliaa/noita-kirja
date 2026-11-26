// Quests with steps, stored as plain markdown in the note body so translation,
// history, search and backups keep working unchanged:
//
//   Optional intro text…
//
//   ## [ ] Step title            ([x] = step done)
//   📍 [Zone 3](#/map?x=120&y=4500)
//   📍 a place without coordinates
//
//   Step details (markdown, images…)
//
// Read without this module it is still a normal, readable markdown note.

export interface QuestLoc { label: string; x: number | null; y: number | null }
export interface QuestStep { title: string; done: boolean; locs: QuestLoc[]; body: string }
export interface Quest { intro: string; steps: QuestStep[] }

// Tolerant to what machine translation may do to the checkbox: "[ ]", "[]", "[x]", "[X]", "[✓]".
const STEP_RE = /^##[ \t]+\[\s*([xX✓✔]?)\s*\][ \t]*(.*)$/;
const LOC_RE = /^📍\s*(.*)$/u;
const LOC_LINK_RE = /^\[([^\]]*)\]\(#\/map\?x=(-?\d+(?:\.\d+)?)&y=(-?\d+(?:\.\d+)?)[^)]*\)\s*$/;

/** True when the text contains at least one step heading. */
export function hasSteps(src: string): boolean {
  return parseQuest(src).steps.length > 0;
}

export function parseQuest(src: string): Quest {
  const lines = (src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const intro: string[] = [];
  const steps: (QuestStep & { lines: string[] })[] = [];
  let fence = false;
  let inHead = false; // still reading the 📍 lines right after a heading
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const m = !fence && STEP_RE.exec(line);
    if (m) {
      steps.push({ title: m[2].trim(), done: m[1] !== '', locs: [], body: '', lines: [] });
      inHead = true;
      continue;
    }
    const cur = steps[steps.length - 1];
    if (!cur) { intro.push(line); continue; }
    if (inHead) {
      const l = LOC_RE.exec(line.trim());
      if (l) { cur.locs.push(parseLoc(l[1])); continue; }
      if (!line.trim() && !cur.lines.length) continue;
      inHead = false;
    }
    cur.lines.push(line);
  }
  return {
    intro: intro.join('\n').trim(),
    steps: steps.map(({ lines, ...s }) => ({ ...s, body: lines.join('\n').trim() })),
  };
}

function parseLoc(s: string): QuestLoc {
  const m = LOC_LINK_RE.exec(s.trim());
  if (m) return { label: m[1].trim(), x: Number(m[2]), y: Number(m[3]) };
  return { label: s.trim(), x: null, y: null };
}

const hasXY = (l: QuestLoc) => l.x !== null && l.y !== null && isFinite(l.x) && isFinite(l.y);

export function serializeQuest(q: Quest): string {
  const out: string[] = [];
  if (q.intro.trim()) out.push(q.intro.trim());
  for (const s of q.steps) {
    const head = [`## [${s.done ? 'x' : ' '}] ${s.title.trim() || '…'}`];
    for (const l of s.locs) {
      const label = l.label.trim().replace(/[[\]]/g, '');
      if (hasXY(l)) head.push(`📍 [${label || `${Math.round(l.x!)}, ${Math.round(l.y!)}`}](#/map?x=${Math.round(l.x!)}&y=${Math.round(l.y!)})`);
      else if (label) head.push(`📍 ${label}`);
    }
    out.push(head.join('\n'));
    if (s.body.trim()) out.push(s.body.trim());
  }
  return out.join('\n\n') + '\n';
}

/**
 * Steps to display: text (titles, labels, details) from the reader's language,
 * coordinates and done flags always from the original (they don't depend on language).
 */
export function displayQuest(original: string, shown: string): Quest {
  const o = parseQuest(original);
  if (shown === original) return o;
  const s = parseQuest(shown);
  if (s.steps.length !== o.steps.length) return o;
  return {
    intro: s.intro,
    steps: o.steps.map((os, i) => {
      const ss = s.steps[i];
      return {
        title: ss.title || os.title,
        done: os.done,
        body: ss.body,
        locs: os.locs.map((ol, j) => ({ ...ol, label: ss.locs.length === os.locs.length ? ss.locs[j].label || ol.label : ol.label })),
      };
    }),
  };
}

/** Flip the done flag of step `i` directly in a markdown text (null if the step isn't found). */
export function toggleStepIn(src: string | null, i: number, done: boolean): string | null {
  if (!src) return null;
  const lines = src.split('\n');
  let n = -1, fence = false;
  for (let k = 0; k < lines.length; k++) {
    if (/^\s*(```|~~~)/.test(lines[k])) fence = !fence;
    if (fence || !STEP_RE.test(lines[k])) continue;
    if (++n === i) {
      lines[k] = lines[k].replace(/^(##[ \t]+)\[[^\]]*\]/, `$1[${done ? 'x' : ' '}]`);
      return lines.join('\n');
    }
  }
  return null;
}

/** Located places of a quest, in step order. */
export function questPlaces(q: Quest): { step: number; title: string; label: string; x: number; y: number; done: boolean }[] {
  return q.steps.flatMap((s, i) =>
    s.locs.filter(hasXY).map((l) => ({ step: i, title: s.title, label: l.label, x: l.x!, y: l.y!, done: s.done })));
}

/**
 * Turn an existing free-text quest into steps: every line starting with a number
 * ("1: …", "2. …", "3) …", "Étape 4 - …") begins a step; text before the first one
 * stays as the intro. A "(zone 3)" / "(biome 4)" in the line becomes the step's place.
 * Returns null when fewer than two such lines are found.
 */
export function guessSteps(src: string): Quest | null {
  const lines = (src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const STARTS = /^\s*(?:\*\*)?\s*(?:(?:[ée]tape|step)\s*)?(\d{1,3})\s*[:.)\-–]\s*(.+?)\s*(?:\*\*)?\s*$/i;
  const intro: string[] = [];
  const steps: { title: string; locs: QuestLoc[]; lines: string[] }[] = [];
  for (const line of lines) {
    const m = STARTS.exec(line);
    if (m) {
      let title = m[2];
      const locs: QuestLoc[] = [];
      title = title.replace(/\s*\(((?:zone|biome|area)\b[^)]*)\)\s*/i, (_, z: string) => {
        locs.push({ label: z.trim(), x: null, y: null });
        return ' ';
      }).replace(/\s+/g, ' ').trim();
      if (!locs.length) {
        const z = /\b(?:zone|biome|area)\s+\d+\b/i.exec(title);
        if (z) locs.push({ label: z[0], x: null, y: null });
      }
      steps.push({ title, locs, lines: [] });
    } else if (steps.length) steps[steps.length - 1].lines.push(line);
    else intro.push(line);
  }
  if (steps.length < 2) return null;
  return {
    intro: intro.join('\n').trim(),
    steps: steps.map((s) => ({ title: s.title, done: false, locs: s.locs, body: s.lines.join('\n').trim() })),
  };
}
