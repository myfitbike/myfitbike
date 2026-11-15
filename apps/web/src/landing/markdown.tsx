// Tiny markdown renderer for content/ATTRIBUTIONS.md: headings, paragraphs, lists, tables, **bold**, `code`, links.
// Builds React elements (never raw HTML), so the text can't inject markup.
import type { ReactNode } from 'react';

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+)/g;
const safeHref = (u: string) => (/^(https?:|mailto:|\/)/.test(u) ? u : `https://${u}`);

export function inline(text: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((t, i) => {
    if (t.startsWith('**')) return <strong key={i} className="font-semibold text-text">{t.slice(2, -2)}</strong>;
    if (t.startsWith('`')) return <code key={i} className="px-1 py-0.5 rounded bg-white/8 text-[0.9em] text-primary break-all">{t.slice(1, -1)}</code>;
    const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t);
    if (m) return <a key={i} href={safeHref(m[2]!)} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2 hover:brightness-110">{m[1]}</a>;
    if (/^https?:\/\//.test(t)) return <a key={i} href={t} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2 break-all">{t}</a>;
    return t;
  });
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r/g, '').split('\n'); const out: ReactNode[] = []; let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { /* page has its own h1, so markdown # becomes h2 */
      const lvl = h[1]!.length; const k = out.length;
      out.push(lvl <= 1 ? <h2 key={k} className="text-headline-lg text-text mt-10 mb-4">{inline(h[2]!)}</h2> : lvl === 2 ? <h2 key={k} className="text-headline-md text-text mt-10 mb-3">{inline(h[2]!)}</h2> : <h3 key={k} className="text-body-lg font-semibold text-text mt-6 mb-2">{inline(h[2]!)}</h3>);
      i++; continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[] = []; while (i < lines.length && lines[i]!.trim().startsWith('|')) rows.push(lines[i++]!);
      const [head, ...rest] = rows; const body = rest.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
      out.push(
        <div key={out.length} className="my-5 overflow-x-auto rounded-card border border-white/10">
          <table className="w-full min-w-[560px] text-left text-body-md">
            <thead className="bg-surface-container-high/70"><tr>{cells(head!).map((c, j) => <th key={j} scope="col" className="px-4 py-3 text-label-caps uppercase text-text-secondary font-semibold">{inline(c)}</th>)}</tr></thead>
            <tbody>{body.map((r, j) => <tr key={j} className="border-t border-white/6 align-top">{cells(r).map((c, k) => <td key={k} className="px-4 py-3 text-on-surface-variant">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.trim()) { const l = lines[i]!; if (/^\s*[-*]\s+/.test(l)) items.push(l.replace(/^\s*[-*]\s+/, '')); else items[items.length - 1] += ' ' + l.trim(); i++; }
      out.push(<ul key={out.length} className="my-4 list-disc pl-6 space-y-1.5 text-body-lg text-on-surface-variant marker:text-accent">{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,4}\s|\s*\||\s*[-*]\s)/.test(lines[i]!)) para.push(lines[i++]!.trim());
    out.push(<p key={out.length} className="my-4 text-body-lg text-on-surface-variant">{inline(para.join(' '))}</p>);
  }
  return <>{out}</>;
}
