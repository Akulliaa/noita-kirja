// Free machine translation FR <-> EN, tried in order:
//  1. Chrome's built-in on-device Translator API (unlimited, private)
//  2. Google Translate public endpoint (no key, may be rate-limited)
//  3. MyMemory (no key, ~5000 chars/day per connection)
// Markdown images, link targets and inline code are protected with placeholders.
import type { Lang } from './types';

interface Provider {
  name: string;
  maxBytes: number;
  run(text: string, from: Lang, to: Lang): Promise<string>;
}

const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s).length;

// ---- providers --------------------------------------------------------------
const chromeCache = new Map<string, any>();
const chrome: Provider = {
  name: 'chrome',
  maxBytes: 20000,
  async run(text, from, to) {
    const T = (globalThis as any).Translator;
    if (!T) throw new Error('unavailable');
    const key = `${from}>${to}`;
    let tr = chromeCache.get(key);
    if (!tr) {
      const av = await T.availability({ sourceLanguage: from, targetLanguage: to });
      if (av === 'unavailable') throw new Error('unavailable');
      tr = await T.create({ sourceLanguage: from, targetLanguage: to });
      chromeCache.set(key, tr);
    }
    return await tr.translate(text);
  },
};

let googleBlockedUntil = 0;
const google: Provider = {
  name: 'google',
  maxBytes: 4000,
  async run(text, from, to) {
    if (Date.now() < googleBlockedUntil) throw new Error('blocked');
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    const r = await fetch(url);
    if (!r.ok) { googleBlockedUntil = Date.now() + 10 * 60_000; throw new Error(`HTTP ${r.status}`); }
    const data = await r.json();
    return (data[0] as [string][]).map((s) => s[0]).join('');
  },
};

const myMemory: Provider = {
  name: 'mymemory',
  maxBytes: 480,
  async run(text, from, to) {
    const r = await fetch(`https://api.mymemory.translated.net/get?langpair=${from}|${to}&q=${encodeURIComponent(text)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    if (d.quotaFinished || d.responseStatus !== 200) throw new Error(d.responseDetails || 'quota');
    return d.responseData.translatedText as string;
  },
};

const PROVIDERS = [chrome, google, myMemory];

// ---- markdown protection ------------------------------------------------------
function protect(src: string) {
  const kept: string[] = [];
  const hold = (s: string) => { kept.push(s); return `⟦${kept.length - 1}⟧`; };
  const text = src
    .replace(/`[^`\n]+`/g, hold)                 // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, hold)      // images (whole)
    .replace(/\]\([^)]*\)/g, (m) => ']' + hold(m.slice(1))) // link targets (keep link text)
    .replace(/https?:\/\/\S+/g, hold);           // bare URLs
  return { text, kept };
}

function restore(text: string, kept: string[]) {
  const used = new Set<number>();
  let out = text.replace(/⟦\s*(\d+)\s*⟧/g, (_, n) => { used.add(Number(n)); return kept[Number(n)] ?? ''; });
  const lost = kept.filter((_, i) => !used.has(i));
  if (lost.length) out += '\n\n' + lost.join('\n\n');
  return out;
}

/** Split into pieces under maxBytes (at line, then sentence boundaries); each keeps the separator that followed it. */
function chunks(text: string, maxBytes: number): { t: string; sep: string }[] {
  if (bytes(text) <= maxBytes) return [{ t: text, sep: '' }];
  // atoms: sentences, each with the separator that follows it
  const atoms: { t: string; sep: string }[] = [];
  const lines = text.split('\n');
  lines.forEach((line, li) => {
    const lineSep = li < lines.length - 1 ? '\n' : '';
    const sentences = bytes(line) <= maxBytes ? [line] : line.split(/(?<=[.!?…])\s+/);
    sentences.forEach((sen, si) => {
      const sep = si < sentences.length - 1 ? ' ' : lineSep;
      if (bytes(sen) <= maxBytes) { atoms.push({ t: sen, sep }); return; }
      const words = sen.split(' ');
      let cur = '';
      for (const w of words) {
        if (cur && bytes(cur + ' ' + w) > maxBytes) { atoms.push({ t: cur, sep: ' ' }); cur = w; }
        else cur = cur ? cur + ' ' + w : w;
      }
      atoms.push({ t: cur, sep });
    });
  });
  // greedy packing
  const out: { t: string; sep: string }[] = [];
  let cur: { t: string; sep: string } | null = null;
  for (const a of atoms) {
    if (cur && bytes(cur.t + cur.sep + a.t) <= maxBytes) cur = { t: cur.t + cur.sep + a.t, sep: a.sep };
    else { if (cur) out.push(cur); cur = { ...a }; }
  }
  if (cur) out.push(cur);
  return out;
}

const cache = new Map<string, string>();
export let lastProvider = '';

/** Translate markdown/plain text. Returns null when every provider failed. */
export async function translateText(src: string, from: Lang, to: Lang): Promise<string | null> {
  if (!src?.trim() || from === to) return src ?? '';
  const ck = `${from}|${to}|${src}`;
  const hit = cache.get(ck);
  if (hit !== undefined) return hit;

  const { text, kept } = protect(src);
  for (const p of PROVIDERS) {
    try {
      let joined = '';
      for (const part of chunks(text, p.maxBytes)) {
        joined += (part.t.trim() ? await p.run(part.t, from, to) : part.t) + part.sep;
      }
      const result = restore(joined, kept);
      cache.set(ck, result);
      lastProvider = p.name;
      return result;
    } catch {
      /* try the next provider */
    }
  }
  return null;
}

export const otherLang = (l: Lang): Lang => (l === 'fr' ? 'en' : 'fr');

/**
 * Fill `<field>_tr` for each field whose original changed (or has no translation yet).
 * `row` is mutated and returned. `manual` lists fields whose translation was edited by hand.
 */
export async function addTranslations<T extends Record<string, any>>(
  row: T,
  fields: string[],
  lang: Lang,
  before?: Record<string, any> | null,
  manual: string[] = [],
): Promise<T> {
  const to = otherLang(lang);
  for (const f of fields) {
    if (manual.includes(f)) continue;
    const val = row[f];
    const changed = !before || before[f] !== val || before.lang !== lang;
    if (!changed && before?.[`${f}_tr`]) continue;
    if (val === null || val === undefined || String(val).trim() === '') { (row as any)[`${f}_tr`] = null; continue; }
    (row as any)[`${f}_tr`] = await translateText(String(val), lang, to);
  }
  return row;
}

// exported for tests
export const _internal = { protect, restore, chunks };
