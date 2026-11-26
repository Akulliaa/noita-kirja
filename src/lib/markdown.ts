// Markdown → safe HTML. Images use "kirja:<storage path>" and an optional title "w=50" (% width).
import { Marked } from 'marked';
import DOMPurify from 'dompurify';

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    image({ href, title, text }) {
      const alt = (text ?? '').replace(/"/g, '&quot;');
      const w = /^w=(\d{1,3})$/.exec(title ?? '')?.[1];
      const style = w ? ` style="width:${Math.min(300, Number(w))}%"` : '';
      if (href?.startsWith('kirja:')) {
        return `<img data-kirja="${href.slice(6).replace(/"/g, '')}" alt="${alt}"${style} loading="lazy">`;
      }
      return `<img src="${href}" alt="${alt}"${style} loading="lazy">`;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const internal = href.startsWith('#/');
      const t = title ? ` title="${title.replace(/"/g, '&quot;')}"` : '';
      return `<a href="${href}"${t}${internal ? '' : ' target="_blank" rel="noopener noreferrer"'}>${text}</a>`;
    },
  },
});

DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
  if (data.attrName === 'data-kirja') data.forceKeepAttr = true;
});

export function renderMarkdown(src: string): string {
  const html = marked.parse(src ?? '', { async: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'data-kirja'] });
}

/** Paths of the private images used in a text. */
export function imagePaths(src: string): string[] {
  return [...(src ?? '').matchAll(/\(kirja:([^)\s"]+)/g)].map((m) => m[1]);
}

/** Plain-text excerpt for previews. */
export function excerpt(src: string, len = 180): string {
  const s = (src ?? '')
    .replace(/^##[ \t]+\[\s*[xX✓✔]?\s*\][ \t]*/gm, '▸ ') // quest steps
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '🖼')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > len ? s.slice(0, len - 1) + '…' : s;
}
