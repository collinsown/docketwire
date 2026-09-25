#!/usr/bin/env node
/*
  Docket Wire site builder. Plain Node 18 or later, nothing to install.

    node build.js          builds the site into dist/
    node build.js serve    builds, then previews it at http://localhost:8080

  Content lives in content/. Files and folders whose names start with _ are ignored.
*/
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CONTENT = path.join(ROOT, 'content');
const OUT = path.join(ROOT, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const SITE_URL = String(process.env.SITE_URL || cfg.url || '').trim().replace(/\/+$/, '');
const BUILD_ID = Date.now().toString(36);
const YEAR = new Date().getUTCFullYear();
const warnings = [];
const warn = (m) => warnings.push(m);

/* ---------- helpers ---------- */

const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ENT[c]);
const unesc = (s) => String(s).replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]));
const slugify = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter(Boolean);

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function parseDate(s) {
  const m = String(s || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0))) : null;
}
const fmtDay = (d) => (d ? `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '');
const fmtFull = (d) => (d ? `${d.getUTCDate()} ${MONL[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '');
const fmtLong = (d) => (d ? `${DOW[d.getUTCDay()]} ${fmtFull(d)}` : '');
const isoDay = (d) => (d ? d.toISOString().slice(0, 10) : '');
const dayOrRaw = (s) => { const d = parseDate(s); return d ? fmtDay(d) : String(s || ''); };

function read(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '') : ''; }
function files(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(ext) && !f.startsWith('_') && !f.startsWith('.')).sort().map((f) => path.join(dir, f));
}
function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    if (f.startsWith('.')) continue;
    const a = path.join(from, f), b = path.join(to, f);
    if (fs.statSync(a).isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}
const absUrl = (p) => (SITE_URL ? `${SITE_URL}/${String(p || '').replace(/^\/+/, '')}` : '');
function resolveUrl(u, root) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^(https?:|mailto:|tel:)/i.test(u) || u.startsWith('#')) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';
  return root + u.replace(/^\/+/, '');
}

/* ---------- front matter, sources, CSV ---------- */

function frontMatter(text) {
  const m = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { data: {}, body: text };
  const data = {};
  let key = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const item = raw.match(/^\s+-\s+(.*)$/);
    if (item && key) {
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(unquote(item[1]));
      continue;
    }
    const kv = raw.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) {
      key = kv[1];
      const v = kv[2].trim();
      data[key] = /^\[.*\]$/.test(v) ? v.slice(1, -1).split(',').map(unquote).filter(Boolean) : unquote(v);
    }
  }
  return { data, body: text.slice(m[0].length) };
}
function unquote(v) {
  v = String(v).trim();
  return (/^".*"$/.test(v) || /^'.*'$/.test(v)) ? v.slice(1, -1) : v;
}
function parseSources(v) {
  const out = [];
  for (const part of (Array.isArray(v) ? v : String(v || '').split(';'))) {
    const s = String(part).trim();
    if (!s) continue;
    const md = [...s.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)];
    if (md.length) { md.forEach((m) => out.push({ name: m[1].trim(), url: m[2].trim() })); continue; }
    const bar = s.lastIndexOf('|');
    if (bar > -1) out.push({ name: s.slice(0, bar).trim() || 'Source', url: s.slice(bar + 1).trim() });
    else if (/^https?:\/\//i.test(s)) { let host = s; try { host = new URL(s).hostname.replace(/^www\./, ''); } catch (e) { /* keep */ } out.push({ name: host, url: s }); }
    else out.push({ name: s, url: '' });
  }
  return out;
}
const srcLink = (s) => (/^https?:\/\//i.test(s.url || '') ? `<a href="${esc(s.url)}" rel="noopener">${esc(s.name)}</a>` : esc(s.name));
const srcLine = (list, label = 'Source') => (list.length ? `<p class="src">${list.length > 1 ? label + 's' : label}: ${list.map(srcLink).join('; ')}</p>` : '');

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(head.map((h, k) => [h, (r[k] || '').trim()])));
}

/* ---------- Markdown ---------- */

const emph = (s) => s
  .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
  .replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
  .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?![*\w])/g, '$1<em>$2</em>')
  .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<em>$2</em>');

function inline(src, root) {
  const keep = [];
  const stash = (html) => `\u0001${keep.push(html) - 1}\u0001`;
  let s = esc(src);
  s = s.replace(/`([^`\n]+)`/g, (m, c) => stash(`<code>${c}</code>`));
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, u) => {
    const url = resolveUrl(unesc(u), root);
    return url ? stash(`<img src="${esc(url)}" alt="${alt}" loading="lazy">`) : '';
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
    const url = resolveUrl(unesc(u), root);
    if (!url) return t;
    return stash(`<a href="${esc(url)}"${/^https?:/i.test(url) ? ' rel="noopener"' : ''}>${emph(t)}</a>`);
  });
  s = emph(s);
  for (let n = 0; n < 4 && s.includes('\u0001'); n++) s = s.replace(/\u0001(\d+)\u0001/g, (m, k) => keep[+k]);
  return s;
}

function md(src, root = './') {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const ids = new Set();
  const blank = (l) => /^\s*$/.test(l);
  const isHr = (l) => /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(l);
  const isHeading = (l) => /^ {0,3}#{1,6}\s/.test(l);
  const isQuote = (l) => /^ {0,3}>/.test(l);
  const itemRe = /^ {0,3}(?:([-*+])|(\d{1,3})[.)])\s+(.*)$/;
  const isFence = (l) => /^ {0,3}```/.test(l);
  const isSep = (l) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l) && l.includes('-') && (l.includes('|') || /:?-{3,}:?/.test(l));
  const isTable = (l, next) => l.includes('|') && next !== undefined && next.includes('|') && isSep(next);
  const starts = (l, next) => isHeading(l) || isHr(l) || isQuote(l) || itemRe.test(l) || isFence(l) || isTable(l, next);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }
    if (isFence(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !isFence(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    let m = line.match(/^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (m) {
      const lv = Math.min(Math.max(m[1].length, 2), 4);
      let id = slugify(m[2].replace(/[*_`[\]()]/g, ''));
      while (ids.has(id)) id += '-x';
      ids.add(id);
      out.push(`<h${lv} id="${id}">${inline(m[2], root)}</h${lv}>`);
      i++;
      continue;
    }
    if (isHr(line)) { out.push('<hr>'); i++; continue; }
    if (isQuote(line)) {
      const buf = [];
      while (i < lines.length && isQuote(lines[i])) buf.push(lines[i++].replace(/^ {0,3}>\s?/, ''));
      const inner = md(buf.join('\n'), root);
      const cut = /^<h3[^>]*>[\s\S]*?<\/h3>/.exec(inner);
      out.push(cut ? `<aside class="explainer">${cut[0]}<div class="explainer-body">${inner.slice(cut[0].length).trim()}</div></aside>` : `<blockquote>${inner}</blockquote>`);
      continue;
    }
    if (isTable(line, lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
      i += 2;
      const body = [];
      while (i < lines.length && !blank(lines[i]) && lines[i].includes('|')) body.push(cells(lines[i++]));
      const cell = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c, root)}</${tag}>`;
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c, k) => cell('th', c, k)).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${head.map((x, k) => cell('td', r[k] || '', k)).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    m = line.match(itemRe);
    if (m) {
      const ordered = !m[1];
      const start = ordered ? parseInt(m[2], 10) : 1;
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const mm = l.match(itemRe);
        if (mm && !mm[1] === ordered) { items.push([mm[3]]); i++; continue; }
        if (blank(l)) {
          const nx = lines[i + 1] && lines[i + 1].match(itemRe);
          if (nx && !nx[1] === ordered) { i++; continue; }
          break;
        }
        if (items.length && !mm && !starts(l, lines[i + 1])) { items[items.length - 1].push(l.trim()); i++; continue; }
        break;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>${items.map((it) => `<li>${inline(it.join(' '), root)}</li>`).join('')}</${tag}>`);
      continue;
    }
    const buf = [line.trim()];
    i++;
    while (i < lines.length && !blank(lines[i]) && !starts(lines[i], lines[i + 1])) buf.push(lines[i++].trim());
    out.push(`<p>${inline(buf.join(' '), root)}</p>`);
  }
  return out.join('\n');
}
const plain = (markdown) => String(markdown || '').replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`|-]/g, ' ').replace(/\s+/g, ' ').trim();

/* ---------- dates ---------- */

const NOW = new Date();
const TODAY = Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate());
const UTC = (y, m, d) => new Date(Date.UTC(y, m, d));

/* A date can be exact (2026-09-11), approximate (~2026-09-30), a month (2026-09),
   a quarter (2026-Q4), a half year (2026-H2), a year (2026), or free text ("Not fixed"). */
function when(raw) {
  let s = String(raw == null ? '' : raw).trim();
  const w = { raw: s, kind: 'none', approx: false, start: null, end: null, label: 'Not fixed', short: 'Not fixed', iso: '' };
  if (!s || /^(not fixed|tbc|tba|tbd|unknown|n\/a|-)$/i.test(s)) return w;
  if (s.startsWith('~')) { w.approx = true; s = s.slice(1).trim(); }
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    const d = UTC(+m[1], +m[2] - 1, +m[3]);
    return Object.assign(w, { kind: 'day', start: d, end: d, iso: isoDay(d), label: `${w.approx ? 'Around ' : ''}${fmtDay(d)}`, short: fmtDay(d) });
  }
  if ((m = s.match(/^(\d{4})-(\d{2})$/))) {
    const y = +m[1], mo = +m[2] - 1;
    return Object.assign(w, { kind: 'month', start: UTC(y, mo, 1), end: UTC(y, mo + 1, 0), iso: `${m[1]}-${m[2]}`, label: `${w.approx ? 'Around ' : ''}${MONL[mo]} ${y}`, short: `${MON[mo]} ${y}` });
  }
  if ((m = s.match(/^(\d{4})-Q([1-4])$/i))) {
    const y = +m[1], q = +m[2];
    return Object.assign(w, { kind: 'quarter', start: UTC(y, (q - 1) * 3, 1), end: UTC(y, q * 3, 0), iso: `${y}-Q${q}`, label: `Q${q} ${y}`, short: `Q${q} ${y}` });
  }
  if ((m = s.match(/^(\d{4})-H([12])$/i))) {
    const y = +m[1], h = +m[2];
    return Object.assign(w, { kind: 'half', start: UTC(y, (h - 1) * 6, 1), end: UTC(y, h * 6, 0), iso: `${y}-H${h}`, label: `${h === 1 ? 'First' : 'Second'} half of ${y}`, short: `H${h} ${y}` });
  }
  if ((m = s.match(/^(\d{4})$/))) {
    const y = +m[1];
    return Object.assign(w, { kind: 'year', start: UTC(y, 0, 1), end: UTC(y, 11, 31), iso: String(y), label: String(y), short: String(y) });
  }
  return Object.assign(w, { kind: 'text', label: s, short: s });
}
const dated = (w) => Boolean(w && w.start);
const upcoming = (w) => !dated(w) || w.end.getTime() >= TODAY;
const whenSort = (w) => (dated(w) ? w.start.getTime() + (w.kind === 'day' ? 0 : 1) : Infinity);
const byDeadline = (a, b) => (dated(a) ? a.end.getTime() : Infinity) - (dated(b) ? b.end.getTime() : Infinity) || (a.kind === 'day' ? 0 : 1) - (b.kind === 'day' ? 0 : 1);
const timeTag = (w, text = w.label) => (w.kind === 'day' ? `<time datetime="${w.iso}">${esc(text)}</time>` : `<span>${esc(text)}</span>`);

/* ---------- content ---------- */

function loadCSV(name, map) {
  const p = path.join(CONTENT, name);
  if (!fs.existsSync(p)) return [];
  return parseCSV(read(p)).map(map).filter(Boolean);
}

const AUTH = new Map();
function loadAuthorities() {
  for (const r of loadCSV('authorities.csv', (x) => (x.code ? x : null))) {
    const a = { code: r.code, slug: slugify(r.code), name: r.name || r.code, short: r.short || r.code, kind: r.kind || '', country: r.country || '', website: r.website || '', about: r.about || '', gates: [], known: true };
    AUTH.set(r.code.toLowerCase(), a);
    if (r.name) AUTH.set(r.name.toLowerCase(), a);
  }
}
function authority(raw) {
  const k = String(raw || '').trim();
  if (!k) return null;
  const hit = AUTH.get(k.toLowerCase());
  if (hit) return hit;
  warn(`"${k}" is not in content/authorities.csv, so it has no regulator page.`);
  const a = { code: k, slug: slugify(k), name: k, short: k, kind: '', country: '', website: '', about: '', gates: [], known: false };
  AUTH.set(k.toLowerCase(), a);
  return a;
}

const STATUS = {
  cleared: { label: 'Cleared', waiting: 0 },
  conditions: { label: 'Cleared with conditions', waiting: 0 },
  pending: { label: 'Pending', waiting: 1 },
  hold: { label: 'On hold by order', waiting: 2 },
  challenged: { label: 'Challenged', waiting: 3 },
  refused: { label: 'Refused', waiting: 0 },
  unknown: { label: 'Not reported', waiting: 0 },
};
const STATUS_ALIAS = { approved: 'cleared', granted: 'cleared', clear: 'cleared', conditional: 'conditions', 'with conditions': 'conditions', appealed: 'challenged', appeal: 'challenged', stayed: 'hold', order: 'hold', frozen: 'hold', blocked: 'refused', rejected: 'refused', '': 'unknown', 'not reported': 'unknown' };
function statusOf(raw, where) {
  const k = String(raw || '').trim().toLowerCase();
  const s = STATUS[k] ? k : STATUS_ALIAS[k];
  if (!s) { warn(`${where}: status "${raw}" is not one of ${Object.keys(STATUS).join(', ')}. Shown as not reported.`); return 'unknown'; }
  return s;
}

function sectionsOf(body) {
  const out = { _: [] };
  let cur = '_';
  for (const line of String(body || '').replace(/\r\n?/g, '\n').split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { cur = h[1].trim().toLowerCase(); out[cur] = out[cur] || []; continue; }
    out[cur].push(line);
  }
  return out;
}
const bullets = (lines) => (lines || []).map((l) => l.match(/^\s*[-*]\s+(.+)$/)).filter(Boolean).map((m) => m[1].trim());
function cells(line, n) {
  const parts = line.split('|').map((x) => x.trim());
  if (parts.length > n) parts.splice(n - 1, parts.length, parts.slice(n - 1).join(' | '));
  while (parts.length < n) parts.push('');
  return parts;
}
function docketNumber(raw) {
  const m = String(raw || '').match(/^\s*(?:no\.?\s*)?(\d+)\s*(?:of|\/)\s*(\d{4})\s*$/i);
  if (!m) return null;
  const n = +m[1], y = +m[2];
  return { n, y, label: `No. ${n} of ${y}`, sort: y * 10000 + n };
}

function loadDockets() {
  const out = [];
  for (const file of files(path.join(CONTENT, 'dockets'), '.md')) {
    const rel = path.relative(ROOT, file);
    const { data, body } = frontMatter(read(file));
    if (!data.title) { warn(`Skipped ${rel}: it needs a title.`); continue; }
    const slug = slugify(data.slug || path.basename(file, '.md'));
    const sec = sectionsOf(body);
    const gates = bullets(sec.gates).map((l) => {
      const [a, what, st, w, note, src] = cells(l, 6);
      const g = { auth: authority(a), what, status: statusOf(st, rel), when: when(w), note, sources: parseSources(src) };
      return g;
    });
    const entries = bullets(sec.entries || sec.docket).map((l, k) => {
      const [w, text, src] = cells(l, 3);
      const e = { when: when(w), text, sources: parseSources(src), order: k };
      if (e.when.kind === 'text') warn(`${rel}: entry date "${w}" was not understood. Use YYYY-MM-DD, YYYY-MM or YYYY.`);
      return e;
    }).sort((a, b) => (dated(a.when) ? a.when.start.getTime() : -Infinity) - (dated(b.when) ? b.when.start.getTime() : -Infinity) || a.order - b.order);
    entries.forEach((e, k) => { e.n = k + 1; });
    const next = bullets(sec.next).map((l) => { const [w, text, src] = cells(l, 3); return { when: when(w), text, sources: parseSources(src) }; });
    const status = String(data.status || 'open').toLowerCase();
    const d = {
      file, slug, url: `dockets/${slug}/`, no: docketNumber(data.number), title: data.title, summary: data.summary || '',
      kind: data.kind || '', sector: data.sector || '', country: data.country || '', value: data.value || '',
      parties: data.parties || '', advisers: list(String(data.advisers || '').replace(/;/g, ',')), explainer: data.explainer || '',
      status: ['open', 'completed', 'withdrawn', 'blocked'].includes(status) ? status : 'open', closed: when(data.closed),
      waitingText: data.waiting || '', gates, entries, next, note: (sec.note || []).join('\n').trim(),
    };
    if (!d.no) warn(`${rel}: add a docket number, for example "number: 9 of 2026".`);
    const datedEntries = entries.filter((e) => dated(e.when));
    d.opened = datedEntries.length ? datedEntries[0].when : when('');
    d.last = datedEntries.length ? datedEntries[datedEntries.length - 1].when : when('');
    d.open = d.status === 'open';
    const hold = gates.filter((g) => STATUS[g.status].waiting).sort((a, b) => STATUS[a.status].waiting - STATUS[b.status].waiting)[0];
    d.waiting = !d.open ? null : d.waitingText ? { text: d.waitingText, auth: authority.peek(d.waitingText) } : hold ? { text: hold.auth.name, auth: hold.auth } : { text: 'Completion', auth: null };
    d.sectorSlug = slugify(d.sector);
    gates.forEach((g) => g.auth && g.auth.gates.push({ docket: d, gate: g }));
    out.push(d);
  }
  const seen = new Map();
  out.forEach((d) => { if (d.no) { const k = d.no.label; if (seen.has(k)) warn(`${d.no.label} is used by both ${seen.get(k)} and ${d.slug}.`); seen.set(k, d.slug); } });
  return out.sort((a, b) => (b.last.start ? b.last.start.getTime() : 0) - (a.last.start ? a.last.start.getTime() : 0) || ((a.no && a.no.sort) || 0) - ((b.no && b.no.sort) || 0));
}
authority.peek = (raw) => AUTH.get(String(raw || '').trim().toLowerCase()) || null;

function loadExplainers() {
  const posts = [];
  const seen = new Set();
  for (const file of files(path.join(CONTENT, 'explainers'), '.md')) {
    const name = path.basename(file, '.md');
    const { data, body } = frontMatter(read(file));
    const date = parseDate(data.date || name);
    if (!data.title || !date) { warn(`Skipped ${path.relative(ROOT, file)}: it needs a title and a date (YYYY-MM-DD).`); continue; }
    let slug = slugify(data.slug || name.replace(/^\d{4}-\d{2}-\d{2}-?/, '') || data.title);
    if (seen.has(slug)) { warn(`Two explainers share the address "${slug}"; renamed the second.`); slug += '-2'; }
    seen.add(slug);
    const words = plain(body).split(' ').filter(Boolean).length;
    posts.push({
      file, slug, url: `explainers/${slug}/`, title: data.title, date, iso: date.toISOString(),
      emoji: data.emoji || '', dek: data.dek || '', short: data.short || '', tags: list(data.tags),
      author: data.author || cfg.defaultAuthor || cfg.name, sources: parseSources(data.sources), image: data.image || '',
      tone: data.tone || '', docketSlug: data.docket || '', body, minutes: Math.max(1, Math.round(words / 230)),
    });
  }
  return posts.sort((a, b) => b.date - a.date || a.title.localeCompare(b.title));
}

function loadPages() {
  return files(path.join(CONTENT, 'pages'), '.md').map((file) => {
    const { data, body } = frontMatter(read(file));
    return { slug: slugify(data.slug || path.basename(file, '.md')), title: data.title || path.basename(file, '.md'), description: data.description || '', body };
  });
}
const loadEmbed = () => read(path.join(CONTENT, 'subscribe-embed.html')).replace(/<!--[\s\S]*?-->/g, '').trim();

/* ---------- components ---------- */

let EMBED = '';
const TONES = ['red', 'slate', 'fog'];
function toneFor(p) {
  if (TONES.includes(p.tone)) return p.tone;
  let h = 7;
  for (const ch of slugify(p.tags[0] || p.slug)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}
function tile(p, size, root, label = '') {
  const cls = `tile tile-${size} tone-${toneFor(p)}${label ? ' has-tab' : ''}${p.image ? ' has-img' : ''}`;
  const tab = label ? `<span class="tile-tab">${esc(label)}</span>` : '';
  const face = p.image ? `<img src="${esc(resolveUrl(p.image, root))}" alt="">` : `<span class="tile-face" aria-hidden="true">${esc(p.emoji || '§')}</span>`;
  return `<div class="${cls}"${label ? '' : ' aria-hidden="true"'}>${tab}${face}</div>`;
}
const tagList = (tags) => (tags.length ? `<p class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</p>` : '');

function explainerRow(p, root) {
  return `<article class="row">
<a class="row-main" href="${root}${p.url}">${tile(p, 'sm', root)}<div class="row-text"><h3>${esc(p.title)}</h3>${p.dek ? `<p class="row-dek">${esc(p.dek)}</p>` : ''}</div></a>
<div class="row-side"><p class="row-meta"><time datetime="${p.iso}">${fmtDay(p.date)}</time><span>${p.minutes} min read</span></p>${tagList(p.tags)}</div>
</article>`;
}

let subCount = 0;
function subscribe(root, variant) {
  const id = `sub-${++subCount}`;
  const live = Boolean(EMBED || (cfg.subscribe && cfg.subscribe.formAction));
  let body;
  if (EMBED) body = `<div class="sub-embed">${EMBED}</div>`;
  else if (live) {
    body = `<form class="sub-form" action="${esc(cfg.subscribe.formAction)}" method="post" target="_blank">
<label class="sr-only" for="${id}-email">Email address</label>
<input id="${id}-email" type="email" name="${esc(cfg.subscribe.emailField || 'email')}" placeholder="Your email address" autocomplete="email" required>
<button class="btn btn-red" type="submit">Get alerts</button>
</form>`;
  } else body = `<p class="sub-soon">Email alerts open shortly. Until then, follow new entries on the <a href="${root}wire.xml">Wire feed</a> or add the <a href="${root}cause-list/">cause list</a> to your calendar.</p>`;
  const head = variant === 'page' ? '' : `<h2 class="sub-h" id="${id}">Docket alerts by email</h2><p class="sub-sub">Free, once a week: what moved, what comes next and one explainer.</p>`;
  return `<section class="subscribe subscribe-${variant}"${head ? ` aria-labelledby="${id}"` : ''}>${head}${body}${live ? `<p class="sub-note">Unsubscribe from any email. <a href="${root}privacy/">How we use your address</a>.</p>` : ''}</section>`;
}

const authLink = (a, root, text) => (a && a.known && a.gates.length ? `<a href="${root}regulators/${a.slug}/">${esc(text || a.name)}</a>` : esc(text || (a ? a.name : '')));

function track(d, size, root) {
  const gates = d.gates.map((g) => {
    const st = STATUS[g.status];
    const detail = size === 'lg'
      ? `<span class="g-state">${esc(st.label)}</span>${dated(g.when) ? `<span class="g-date">${timeTag(g.when, g.when.short)}</span>` : ''}`
      : `<span class="sr-only">: ${esc(st.label)}${dated(g.when) ? `, ${esc(g.when.short)}` : ''}</span>`;
    return `<li class="gate st-${g.status}"${size === 'lg' ? '' : ` title="${esc(`${g.auth ? g.auth.name : ''}: ${st.label}`)}"`}><span class="node" aria-hidden="true"></span><span class="g-name">${size === 'lg' ? authLink(g.auth, root, g.auth ? g.auth.short : '') : esc(g.auth ? g.auth.short : '')}</span>${detail}</li>`;
  });
  const done = d.status === 'completed';
  const endLabel = done ? 'Completed' : d.status === 'withdrawn' ? 'Withdrawn' : d.status === 'blocked' ? 'Blocked' : 'Completion';
  const endState = done ? (dated(d.closed) ? d.closed.short : 'Done') : d.open ? 'Not yet' : '';
  gates.push(`<li class="gate st-end ${done ? 'is-done' : 'is-open'}"><span class="node" aria-hidden="true"></span><span class="g-name">${endLabel}</span>${size === 'lg' ? `<span class="g-state">${esc(endState)}</span>` : `<span class="sr-only">: ${esc(endState)}</span>`}</li>`);
  return `<ol class="track track-${size}" style="--n:${gates.length}" aria-label="Approvals and challenges">${gates.join('')}</ol>`;
}

const TRACK_KEY = `<ul class="track-key" aria-label="Key to the gates">${['cleared', 'conditions', 'pending', 'hold', 'challenged'].map((s) => `<li class="st-${s}"><span class="node" aria-hidden="true"></span>${STATUS[s].label}</li>`).join('')}</ul>`;

function boardRow(d, root) {
  const auths = [...new Set(d.gates.map((g) => g.auth && g.auth.slug).filter(Boolean))];
  const search = [d.title, d.summary, d.parties, d.kind, d.sector, d.country, d.gates.map((g) => g.auth ? `${g.auth.name} ${g.auth.short}` : '').join(' ')].join(' ').toLowerCase();
  const nx = d.next.filter((n) => upcoming(n.when) && dated(n.when)).sort((a, b) => whenSort(a.when) - whenSort(b.when))[0];
  const side = d.open
    ? `<p><span class="br-k">Waiting on</span><strong>${esc(d.waiting.text)}</strong></p>${nx ? `<p><span class="br-k">Next date</span><strong>${timeTag(nx.when, nx.when.label)}</strong></p>` : ''}${dated(d.last) && d.last.kind !== 'year' ? `<p><span class="br-k">Last entry</span><strong>${timeTag(d.last, d.last.short)}</strong></p>` : ''}`
    : `<p><span class="br-k">${d.status === 'completed' ? 'Completed' : d.status === 'withdrawn' ? 'Withdrawn' : 'Blocked'}</span><strong>${dated(d.closed) ? timeTag(d.closed, d.closed.short) : (dated(d.last) ? timeTag(d.last, d.last.short) : '')}</strong></p>`;
  return `<article class="board-row${d.open ? '' : ' is-closed'}" data-item data-search="${esc(search)}" data-status="${d.open ? 'open' : 'closed'}" data-sector="${esc(d.sectorSlug)}" data-authority="${esc(auths.join('|'))}">
<a class="br-main" href="${root}${d.url}">${d.no ? `<span class="br-no">${esc(d.no.label)}</span>` : ''}<h3>${esc(d.title)}</h3>${d.summary ? `<p class="br-sum">${esc(d.summary)}</p>` : ''}</a>
<div class="br-track">${track(d, 'sm', root)}</div>
<div class="br-side">${side}</div>
</article>`;
}

function causeItem(it, root, compact, own = false) {
  const w = it.when;
  let big, small;
  if (w.kind === 'day') { big = String(w.start.getUTCDate()); small = `${MON[w.start.getUTCMonth()]}${w.approx ? ', approx.' : ''}`; }
  else if (w.kind === 'month') { big = MON[w.start.getUTCMonth()]; small = `${w.start.getUTCFullYear()}${w.approx ? ', approx.' : ''}`; }
  else if (w.kind === 'quarter' || w.kind === 'half') { big = w.short.split(' ')[0]; small = String(w.start.getUTCFullYear()); }
  else if (w.kind === 'year') { big = String(w.start.getUTCFullYear()); small = 'Year'; }
  else { big = ''; small = w.kind === 'text' ? w.label : 'Date not fixed'; }
  const who = it.docket ? `<a href="${root}${it.docket.url}">${esc(it.docket.title)}</a>` : `<strong>${esc(it.title)}</strong>`;
  const src = !compact && it.sources.length ? srcLine(it.sources) : '';
  const auth = it.auth ? `<span class="ci-auth">${authLink(it.auth, root, it.auth.short)}</span>` : '';
  return `<li class="ci ci-${w.kind}"${dated(w) ? ` data-end="${isoDay(w.end)}"` : ''}><span class="ci-date${big ? '' : ' ci-open'}" aria-hidden="${dated(w) ? 'true' : 'false'}"><b>${esc(big)}</b><span>${esc(small)}</span></span><div class="ci-body">${dated(w) ? `<span class="sr-only">${esc(w.label)}: </span>` : ''}${own ? '' : `<p class="ci-what">${who}${auth}</p>`}<p class="ci-text">${inline(it.text, root)}</p>${src}</div></li>`;
}

function wireList(entries, root) {
  return `<ol class="wire">${entries.map(({ d, e }) => `<li><p class="w-meta">${timeTag(e.when, e.when.short)}<a href="${root}${d.url}#e-${e.n}">${esc(d.title)}</a></p><p class="w-text">${inline(e.text, root)}</p></li>`).join('')}</ol>`;
}

function figureGrid(figs) {
  return `<div class="figures">${figs.map((f) => `<article class="figure"><h3>${esc(f.label)}</h3><p class="val">${esc(f.value)}</p>${f.asAt ? `<p class="asat">${esc(f.asAt)}</p>` : ''}${f.note ? `<p class="note">${esc(f.note)}</p>` : ''}${srcLine(f.sources)}</article>`).join('')}</div>`;
}

function shareBar(p) {
  const u = absUrl(p.url);
  const e = encodeURIComponent;
  const a = (net, label, href, blank = true) => `<a class="share-btn" data-net="${net}" href="${esc(href || '#')}"${blank ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
  return `<div class="share" data-share data-title="${esc(p.title)}"><span class="share-label">Share</span>${a('linkedin', 'LinkedIn', u && `https://www.linkedin.com/sharing/share-offsite/?url=${e(u)}`)}${a('whatsapp', 'WhatsApp', u && `https://wa.me/?text=${e(`${p.title} ${u}`)}`)}${a('x', 'X', u && `https://twitter.com/intent/tweet?text=${e(p.title)}&url=${e(u)}`)}${a('email', 'Email', u && `mailto:?subject=${e(p.title)}&body=${e(u)}`, false)}<button class="share-btn" type="button" data-copy hidden>Copy link</button></div>`;
}

function calendarLinks(root) {
  if (!SITE_URL) return `<a class="btn" href="${root}calendar.ics">Calendar file</a>`;
  const https = absUrl('calendar.ics');
  const webcal = https.replace(/^https?:/, 'webcal:');
  return `<a class="btn btn-red" href="${esc(webcal)}">Add to Outlook or Apple Calendar</a><a class="btn" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}" target="_blank" rel="noopener">Add to Google Calendar</a>`;
}

/* ---------- page shell ---------- */

const NAV = [['dockets', 'Dockets', 'dockets/'], ['cause', 'Cause list', 'cause-list/'], ['regulators', 'Regulators', 'regulators/'], ['explainers', 'Explainers', 'explainers/'], ['rates', 'Rates', 'rates/'], ['about', 'About', 'about/']];
const MARK = '<svg class="mark" viewBox="0 0 28 24" aria-hidden="true" focusable="false"><path d="M1 3.6C1 2.7 1.7 2 2.6 2h7.2c.4 0 .8.2 1.1.5L13.4 5h12c.9 0 1.6.7 1.6 1.6v13.8c0 .9-.7 1.6-1.6 1.6H2.6C1.7 22 1 21.3 1 20.4z" fill="#B3261E"/><path d="M6 12.5h16M6 16.5h10" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>';

function shell(o) {
  const root = o.root;
  const title = o.title ? `${o.title} | ${cfg.name}` : `${cfg.name}: ${cfg.tagline}`;
  const desc = o.description || cfg.description;
  const canon = o.path != null ? absUrl(o.path) : '';
  const img = o.image ? (/^https?:/i.test(o.image) ? o.image : absUrl(o.image)) : absUrl('assets/og.png');
  const socialLinks = Object.keys(SOCIAL_LABELS).filter((k) => /^https?:\/\//.test((cfg.social || {})[k] || '')).map((k) => `<li><a href="${esc(cfg.social[k])}" rel="noopener">${SOCIAL_LABELS[k]}</a></li>`).join('');
  return `<!doctype html>
<html lang="${esc(cfg.language || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${canon ? `<link rel="canonical" href="${esc(canon)}">\n` : ''}${o.noindex ? '<meta name="robots" content="noindex">\n' : ''}<meta property="og:site_name" content="${esc(cfg.name)}">
<meta property="og:type" content="${o.type || 'website'}">
<meta property="og:title" content="${esc(o.title || cfg.name)}">
<meta property="og:description" content="${esc(desc)}">
${canon ? `<meta property="og:url" content="${esc(canon)}">\n` : ''}${img ? `<meta property="og:image" content="${esc(img)}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n` : ''}<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff">
<meta name="color-scheme" content="light">
<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${root}assets/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="${esc(cfg.name)}: new docket entries" href="${root}wire.xml">
<link rel="alternate" type="application/rss+xml" title="${esc(cfg.name)}: explainers" href="${root}rss.xml">
<link rel="preload" href="${root}assets/fonts/SchibstedGrotesk.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${root}assets/style.css?v=${BUILD_ID}">
${o.head || ''}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="masthead">
<div class="wrap mast-in">
<a class="brand" href="${root}">${MARK}<span>${esc(cfg.name)}</span></a>
<nav class="nav" aria-label="Sections">${NAV.map(([k, label, href]) => `<a href="${root}${href}"${o.active === k ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
<a class="btn btn-red mast-cta" href="${root}subscribe/">Get alerts</a>
</div>
</header>
<main id="main">
${o.body}
</main>
<footer class="foot">
<div class="wrap foot-in">
<div class="foot-about">
<p class="foot-name">${esc(cfg.name)}</p>
<p>${esc(cfg.description)}</p>
<p class="foot-small">An independent publication. Nothing here is legal advice.</p>
</div>
<nav class="foot-col" aria-label="The docket"><p class="foot-h">The docket</p><ul><li><a href="${root}dockets/">All dockets</a></li><li><a href="${root}cause-list/">Cause list</a></li><li><a href="${root}regulators/">Regulators and courts</a></li><li><a href="${root}explainers/">Explainers</a></li><li><a href="${root}rates/">Rates</a></li></ul></nav>
<div class="foot-col"><p class="foot-h">Follow</p><ul><li><a href="${root}subscribe/">Email alerts</a></li><li><a href="${root}cause-list/#calendar">Cause list calendar</a></li><li><a href="${root}wire.xml">Wire feed</a></li>${socialLinks}<li><a href="${root}about/">About</a></li><li><a href="${root}privacy/">Privacy</a></li></ul></div>
</div>
<div class="wrap foot-base"><span>&copy; ${NOW.getUTCFullYear()} ${esc(cfg.name)}</span><span>Every entry links to its source.</span></div>
</footer>
<script src="${root}assets/site.js?v=${BUILD_ID}" defer></script>
</body>
</html>
`;
}
const SOCIAL_LABELS = { linkedin: 'LinkedIn', x: 'X', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', whatsapp: 'WhatsApp channel' };

/* ---------- writing ---------- */

const sitemap = [];
function write(rel, html, { index = true, lastmod = '' } = {}) {
  const target = rel.endsWith('/') || rel === '' ? path.join(OUT, rel, 'index.html') : path.join(OUT, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
  if (index) sitemap.push({ loc: rel, lastmod });
}
const rootFor = (rel) => '../'.repeat(rel.split('/').filter(Boolean).length) || './';
const pageHead = (h1, lede = '', extra = '', width = 'wrap') => `<section class="${width} page-head"><h1>${h1}</h1>${lede ? `<p>${lede}</p>` : ''}${extra}</section>`;
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  loadAuthorities();
  const dockets = loadDockets();
  const explainers = loadExplainers();
  const figs = loadCSV('rates.csv', (r) => (r.label ? { label: r.label, value: r.value || '', asAt: r.as_at || '', note: r.note || '', sources: parseSources(r.sources) } : null));
  const extraDates = loadCSV('calendar.csv', (r) => (r.title ? { when: when(r.date), title: r.title, text: r.note || r.title, auth: r.authority ? authority(r.authority) : null, sources: parseSources(r.sources), docket: null } : null));
  const pages = loadPages();
  EMBED = loadEmbed();

  const bySlug = new Map(dockets.map((d) => [d.slug, d]));
  for (const p of explainers) {
    p.docket = p.docketSlug ? bySlug.get(p.docketSlug) : null;
    if (p.docketSlug && !p.docket) warn(`Explainer "${p.title}" points to a docket called "${p.docketSlug}" that does not exist.`);
    if (p.docket) p.docket.explainerPost = p;
    p.html = md(p.body, '../../');
  }
  for (const d of dockets) if (d.explainer && !d.explainerPost) { const p = explainers.find((x) => x.slug === d.explainer); if (p) d.explainerPost = p; }

  const open = dockets.filter((d) => d.open);
  const closedAt = (d) => (dated(d.closed) ? d.closed.start.getTime() : dated(d.last) ? d.last.start.getTime() : 0);
  const closed = dockets.filter((d) => !d.open).sort((a, b) => closedAt(b) - closedAt(a));
  const causeAll = [
    ...open.flatMap((d) => d.next.map((n) => ({ when: n.when, text: n.text, sources: n.sources, docket: d, auth: null }))),
    ...extraDates,
  ].sort((a, b) => byDeadline(a.when, b.when));
  const cause = causeAll.filter((it) => upcoming(it.when));
  const allEntries = dockets.flatMap((d) => d.entries.filter((e) => dated(e.when)).map((e) => ({ d, e }))).sort((a, b) => b.e.when.start - a.e.when.start || b.e.n - a.e.n);
  const waitingCount = open.filter((d) => d.gates.some((g) => STATUS[g.status].waiting)).length;
  const lastEntry = allEntries[0] ? allEntries[0].e.when : null;
  const authorities = [...new Set([...AUTH.values()])].filter((a) => a.known && a.gates.length).sort((a, b) => b.gates.length - a.gates.length || a.name.localeCompare(b.name));

  /* home */
  {
    const root = './';
    const causeCard = `<aside class="cl-card" aria-labelledby="cl-h"><h2 class="cl-tab" id="cl-h">Cause list</h2><div class="cl-body">${cause.length ? `<ol class="cause cause-compact">${cause.slice(0, 6).map((it) => causeItem(it, root, true)).join('')}</ol>` : '<p class="empty">No dates on the list yet.</p>'}<p class="cl-foot"><a href="${root}cause-list/">Full cause list</a><a href="${root}cause-list/#calendar">Add it to your calendar</a></p></div></aside>`;
    let body = `<section class="hero"><div class="wrap hero-in">
<div class="hero-copy">
<h1>${esc(cfg.tagline)}.</h1>
<p class="lede">${esc(cfg.lede || cfg.description)}</p>
<p class="hero-count">${count(open.length, 'open matter', 'open matters')}, ${waitingCount} waiting on a regulator, court or tribunal.${lastEntry ? ` Last entry ${esc(lastEntry.short)}.` : ''}</p>
${subscribe(root, 'hero')}
</div>
${causeCard}
</div></section>`;
    body += `<section class="wrap block"><header class="block-h"><h2>Open matters</h2><a href="${root}dockets/">All dockets</a></header>${TRACK_KEY}${open.length ? `<div class="board">${open.map((d) => boardRow(d, root)).join('\n')}</div>` : '<p class="empty">The first docket opens here.</p>'}</section>`;
    body += `<div class="wrap block split"><section><header class="block-h"><h2>Latest entries</h2><a href="${root}wire.xml">Wire feed</a></header>${allEntries.length ? wireList(allEntries.slice(0, 8), root) : '<p class="empty">No entries yet.</p>'}</section>`;
    body += `<section><header class="block-h"><h2>Rates</h2><a href="${root}rates/">All rates</a></header>${figs.length ? `<dl class="rates">${figs.map((f) => `<div><dt>${esc(f.label)}</dt><dd><strong>${esc(f.value)}</strong><span>${esc(f.asAt)}</span></dd></div>`).join('')}</dl>` : '<p class="empty">No rates yet.</p>'}</section></div>`;
    if (explainers.length) body += `<section class="wrap block"><header class="block-h"><h2>Explainers</h2><a href="${root}explainers/">All explainers</a></header><div class="rows">${explainers.slice(0, 4).map((p) => explainerRow(p, root)).join('\n')}</div></section>`;
    if (closed.length) body += `<section class="wrap block"><header class="block-h"><h2>Closed</h2><a href="${root}dockets/?status=closed">All closed dockets</a></header><div class="board">${closed.slice(0, 4).map((d) => boardRow(d, root)).join('\n')}</div></section>`;
    write('', shell({ root, path: '', body }), { lastmod: lastEntry ? isoDay(lastEntry.start) : '' });
  }

  /* all dockets */
  {
    const rel = 'dockets/';
    const root = rootFor(rel);
    const sectors = [...new Map(dockets.filter((d) => d.sector).map((d) => [d.sectorSlug, d.sector])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const filters = `<form class="filters" data-filter-form hidden role="search" onsubmit="return false"><label class="sr-only" for="f-q">Search dockets</label><input id="f-q" type="search" name="q" placeholder="Search parties, regulators or sectors"><label class="sr-only" for="f-status">Status</label><select id="f-status" name="status"><option value="">Open and closed</option><option value="open">Open</option><option value="closed">Closed</option></select><label class="sr-only" for="f-sector">Sector</label><select id="f-sector" name="sector"><option value="">All sectors</option>${sectors.map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('')}</select><label class="sr-only" for="f-auth">Regulator or court</label><select id="f-auth" name="authority"><option value="">All regulators and courts</option>${authorities.map((a) => `<option value="${esc(a.slug)}">${esc(a.name)}</option>`).join('')}</select><span class="count" data-filter-count aria-live="polite">${count(dockets.length, 'docket', 'dockets')}</span></form>`;
    const body = `${pageHead('Dockets', 'Every matter on the Wire, open and closed. Each docket is a live file: the approvals and challenges it has to pass, every step on the record with its source, and what comes next.')}<section class="wrap">${filters}${TRACK_KEY}${dockets.length ? `<div class="board">${[...open, ...closed].map((d) => boardRow(d, root)).join('\n')}</div><p class="empty" data-filter-empty hidden>No dockets match. Clear the search or a filter to see more.</p>` : '<p class="empty">The first docket opens here.</p>'}</section>`;
    write(rel, shell({ root, path: rel, title: 'Dockets', active: 'dockets', body }), { lastmod: lastEntry ? isoDay(lastEntry.start) : '' });
  }

  /* each docket */
  for (const d of dockets) {
    const rel = d.url;
    const root = rootFor(rel);
    const facts = [
      ['Status', d.open ? 'Open' : d.status === 'completed' ? `Completed${dated(d.closed) ? ` ${d.closed.label}` : ''}` : d.status === 'withdrawn' ? 'Withdrawn' : 'Blocked'],
      ...(d.open ? [['Waiting on', d.waiting.auth ? authLink(d.waiting.auth, root) : esc(d.waiting.text), true]] : []),
      ['Value', d.value || 'Not disclosed'],
      ['Kind', [d.kind, d.sector].filter(Boolean).join(', ')],
      ['First entry', dated(d.opened) ? d.opened.label : 'None yet'],
      ['Last entry', dated(d.last) ? d.last.label : 'None yet'],
    ];
    const gatesHtml = d.gates.length ? `<ol class="gates">${d.gates.map((g) => `<li class="gate-row st-${g.status}"><div class="gr-head"><span class="node" aria-hidden="true"></span><h3>${authLink(g.auth, root)}</h3><span class="badge st-${g.status}">${esc(STATUS[g.status].label)}</span></div><p class="gr-what">${esc(g.what)}${dated(g.when) ? `<span>${timeTag(g.when)}</span>` : ''}</p>${g.note ? `<p class="gr-note">${inline(g.note, root)}</p>` : ''}${srcLine(g.sources)}</li>`).join('')}</ol>` : '<p class="empty">No approvals or challenges on the record yet.</p>';
    const sheet = d.entries.length ? `<ol class="sheet">${d.entries.map((e) => `<li id="e-${e.n}"><span class="sh-no">${e.n}</span><span class="sh-date">${dated(e.when) ? timeTag(e.when, e.when.short) : esc(e.when.label)}</span><div class="sh-body"><p>${inline(e.text, root)}</p>${srcLine(e.sources)}</div></li>`).join('')}</ol>` : '<p class="empty">No entries yet.</p>';
    const nextItems = d.next.filter((n) => upcoming(n.when));
    const nextHtml = nextItems.length ? `<ol class="cause cause-compact">${nextItems.map((n) => causeItem({ when: n.when, text: n.text, sources: n.sources, docket: null, title: '', auth: null }, root, false, true)).join('')}</ol>` : `<p class="side-empty">${d.open ? 'No date on the record.' : 'Nothing further. This docket is closed.'}</p>`;
    const ex = d.explainerPost;
    const cite = `Docket Wire, '${d.title}'${d.no ? `, ${d.no.label}` : ''}${dated(d.last) ? ` (last entry ${d.last.label})` : ''}`;
    const related = dockets.filter((x) => x !== d && x.gates.some((g) => d.gates.some((h) => h.auth && g.auth && h.auth.slug === g.auth.slug))).slice(0, 4);
    const body = `<article class="docket">
<header class="wrap docket-head">
<div class="file">
${d.no ? `<p class="file-tab">${esc(d.no.label)}</p>` : ''}
<div class="file-body">
<h1>${esc(d.title)}</h1>
${d.summary ? `<p class="docket-sum">${esc(d.summary)}</p>` : ''}
${d.parties ? `<p class="docket-parties"><span>Parties</span>${esc(d.parties)}</p>` : ''}
<dl class="facts">${facts.map(([k, v, raw]) => `<div><dt>${k}</dt><dd>${raw ? v : esc(v)}</dd></div>`).join('')}</dl>
${track(d, 'lg', root)}
</div>
</div>
</header>
<div class="wrap docket-cols">
<div class="docket-main">
<section aria-labelledby="gates-h"><h2 id="gates-h">Gates</h2><p class="sec-note">The approvals and challenges on the record, with the authority's decision as reported.</p>${gatesHtml}</section>
${d.note ? `<section class="prose docket-note">${md(d.note, root)}</section>` : ''}
<section aria-labelledby="sheet-h"><h2 id="sheet-h">Docket sheet</h2><p class="sec-note">Every step in date order, each with its source.</p>${sheet}</section>
</div>
<aside class="docket-side">
<section aria-labelledby="next-h"><h2 id="next-h">Next</h2>${nextHtml}</section>
${ex ? `<section class="side-ex" aria-labelledby="ex-h"><h2 id="ex-h">The explainer</h2><a class="ex-card" href="${root}${ex.url}">${tile(ex, 'sm', root)}<span><strong>${esc(ex.title)}</strong><span>${ex.minutes} min read</span></span></a></section>` : ''}
<section aria-labelledby="cite-h"><h2 id="cite-h">Cite this docket</h2><p class="cite" data-cite>${esc(cite)}${absUrl(d.url) ? `, <span data-cite-url>${esc(absUrl(d.url))}</span>` : ''}</p><button class="share-btn" type="button" data-copy-cite hidden>Copy citation</button></section>
<section class="side-follow" aria-labelledby="follow-h"><h2 id="follow-h">Follow this docket</h2><p>New entries go out in the weekly email and on the <a href="${root}wire.xml">Wire feed</a>. Its dates are on the <a href="${root}cause-list/">cause list</a>.</p></section>
</aside>
</div>
${related.length ? `<section class="wrap block"><header class="block-h"><h2>Before the same regulators and courts</h2></header><div class="board">${related.map((x) => boardRow(x, root)).join('\n')}</div></section>` : ''}
</article>`;
    const desc = `${d.no ? `${d.no.label}. ` : ''}${d.summary || d.title}. Approvals, challenges and every step on the record, with sources.`;
    write(rel, shell({ root, path: rel, title: d.title, description: desc, active: 'dockets', body }), { lastmod: dated(d.last) ? isoDay(d.last.start) : '' });
  }

  /* cause list */
  {
    const rel = 'cause-list/';
    const root = rootFor(rel);
    const fixed = cause.filter((it) => it.when.kind === 'day');
    const windows = cause.filter((it) => dated(it.when) && it.when.kind !== 'day');
    const loose = cause.filter((it) => !dated(it.when));
    const byMonth = new Map();
    fixed.forEach((it) => { const k = `${MONL[it.when.start.getUTCMonth()]} ${it.when.start.getUTCFullYear()}`; if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k).push(it); });
    const group = (h, list) => `<section class="cl-group"><h2>${esc(h)}</h2><ol class="cause">${list.map((it) => causeItem(it, root, false)).join('')}</ol></section>`;
    const body = `${pageHead('Cause list', 'The dates coming up on open dockets, and the deadlines in the rules that shape deals. Add it to your calendar and every date arrives there, updated whenever the list changes.')}
<section class="wrap cl-page">
<div class="cl-lists">${cause.length ? `${[...byMonth.entries()].map(([k, list]) => group(k, list)).join('')}${windows.length ? group('Expected, date not yet fixed', windows) : ''}${loose.length ? group('Date not fixed', loose) : ''}` : '<p class="empty">No dates on the list yet.</p>'}</div>
<section class="cl-subscribe" id="calendar" aria-labelledby="cal-h"><h2 id="cal-h">Add the cause list to your calendar</h2><p>Subscribe once and the dates above appear in your calendar, updated whenever the list changes. Dates known only as a month or a quarter stay on this page.</p><p class="cal-btns">${calendarLinks(root)}</p>${SITE_URL ? `<p class="cal-url">Calendar address: <code>${esc(absUrl('calendar.ics'))}</code></p>` : ''}</section>
</section>`;
    write(rel, shell({ root, path: rel, title: 'Cause list', active: 'cause', description: 'Upcoming dates on East African deals, disputes and the rules that shape them, as a list and a calendar you can subscribe to.', body }));
  }

  /* regulators and courts */
  {
    const rel = 'regulators/';
    const root = rootFor(rel);
    const body = `${pageHead('Regulators and courts', 'The authorities whose yes, no or order decides whether a deal closes. Each page lists the matters before it and what it has decided.')}<section class="wrap"><ul class="auth-grid">${authorities.map((a) => {
      const live = a.gates.filter((x) => x.docket.open && STATUS[x.gate.status].waiting).length;
      const decided = a.gates.length - live;
      return `<li><a href="${root}regulators/${a.slug}/"><strong>${esc(a.name)}</strong><span>${esc([a.kind, a.country].filter(Boolean).join(', '))}</span><span class="auth-count">${[live ? `${live} open` : '', decided ? `${decided} decided` : ''].filter(Boolean).join(', ')}</span></a></li>`;
    }).join('')}</ul></section>`;
    write(rel, shell({ root, path: rel, title: 'Regulators and courts', active: 'regulators', body }));
    for (const a of authorities) {
      const r2 = `regulators/${a.slug}/`;
      const root2 = rootFor(r2);
      const rowsFor = (list) => `<ol class="gates">${list.map(({ docket: d, gate: g }) => `<li class="gate-row st-${g.status}"><div class="gr-head"><span class="node" aria-hidden="true"></span><h3><a href="${root2}${d.url}">${esc(d.title)}</a></h3><span class="badge st-${g.status}">${esc(STATUS[g.status].label)}</span></div><p class="gr-what">${esc(g.what)}${dated(g.when) ? `<span>${timeTag(g.when)}</span>` : ''}</p>${g.note ? `<p class="gr-note">${inline(g.note, root2)}</p>` : ''}${srcLine(g.sources)}</li>`).join('')}</ol>`;
      const waiting = a.gates.filter((x) => x.docket.open && STATUS[x.gate.status].waiting);
      const rest = a.gates.filter((x) => !waiting.includes(x)).sort((x, y) => whenSort(y.gate.when) - whenSort(x.gate.when));
      const about = [esc(a.about), a.website ? `<a href="${esc(a.website)}" rel="noopener">Official website</a>` : ''].filter(Boolean).join(' ');
      const body2 = `${pageHead(esc(a.name), about, '')}<section class="wrap auth-page">${waiting.length ? `<section><h2>Open</h2><p class="sec-note">Pending before the ${esc(a.short)}, held by an order or under challenge.</p>${rowsFor(waiting)}</section>` : ''}${rest.length ? `<section><h2>Decided</h2>${rowsFor(rest)}</section>` : ''}</section>`;
      write(r2, shell({ root: root2, path: r2, title: a.name, active: 'regulators', description: `Matters before the ${a.name} on Docket Wire: what is waiting and what it has decided.`, body: body2 }));
    }
  }

  /* explainers */
  {
    const rel = 'explainers/';
    const root = rootFor(rel);
    const body = `${pageHead('Explainers', 'Longer reads on single matters: what happened, who had to say yes, and what the lawyers did. Each one sits on its docket.')}<section class="wrap">${explainers.length ? `<div class="rows">${explainers.map((p) => explainerRow(p, root)).join('\n')}</div>` : '<p class="empty">The first explainer lands here.</p>'}</section>`;
    write(rel, shell({ root, path: rel, title: 'Explainers', active: 'explainers', body }));
  }
  explainers.forEach((p, k) => {
    const root = rootFor(p.url);
    const newer = explainers[k - 1], older = explainers[k + 1];
    const canon = absUrl(p.url);
    const ld = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: p.dek || p.short || '',
      datePublished: p.iso, author: { '@type': p.author === cfg.name ? 'Organization' : 'Person', name: p.author },
      publisher: { '@type': 'Organization', name: cfg.name }, ...(canon ? { url: canon, mainEntityOfPage: canon } : {}),
    }).replace(/</g, '\\u003c');
    const onDocket = p.docket ? `<a class="on-docket" href="${root}${p.docket.url}"><span>On the docket</span><strong>${p.docket.no ? `${esc(p.docket.no.label)}: ` : ''}${esc(p.docket.title)}</strong><span>${p.docket.open ? `Waiting on ${esc(p.docket.waiting.text)}` : 'Closed'}</span></a>` : '';
    const body = `<article class="post">
<header class="narrow post-head">
${tile(p, 'md', root)}
${tagList(p.tags)}
<h1>${esc(p.title)}</h1>
${p.dek ? `<p class="post-dek">${esc(p.dek)}</p>` : ''}
<p class="post-meta"><time datetime="${p.iso}">${fmtFull(p.date)}</time><span>By ${esc(p.author)}</span><span>${p.minutes} min read</span></p>
</header>
<div class="narrow">
${onDocket}
${p.short ? `<aside class="short" aria-labelledby="short-h"><h2 id="short-h">The short version</h2><p>${inline(p.short, root)}</p></aside>` : ''}
<div class="prose">
${p.html}
</div>
${p.sources.length ? `<section class="sources" aria-labelledby="src-h"><h2 id="src-h">Sources</h2><ol>${p.sources.map((s) => `<li>${srcLink(s)}</li>`).join('')}</ol></section>` : ''}
${shareBar(p)}
${subscribe(root, 'inline')}
${newer || older ? `<nav class="post-nav" aria-label="More explainers">${older ? `<a class="pn pn-older" href="${root}${older.url}"><span>Previous</span>${esc(older.title)}</a>` : '<span></span>'}${newer ? `<a class="pn pn-newer" href="${root}${newer.url}"><span>Next</span>${esc(newer.title)}</a>` : '<span></span>'}</nav>` : ''}
</div>
</article>`;
    write(p.url, shell({ root, path: p.url, title: p.title, description: p.dek || p.short, type: 'article', image: p.image ? resolveUrl(p.image, '') : '', active: 'explainers', head: `<meta property="article:published_time" content="${p.iso}">\n<script type="application/ld+json">${ld}</script>\n`, body }), { lastmod: isoDay(p.date) });
  });

  /* rates */
  {
    const rel = 'rates/';
    const root = rootFor(rel);
    const body = `${pageHead('Rates', 'The figures that price deals in Kenya, each as at the date shown and linked to its source.')}<section class="wrap">${figs.length ? figureGrid(figs) : '<p class="empty">The first figures land here.</p>'}</section>`;
    write(rel, shell({ root, path: rel, title: 'Rates', active: 'rates', body }));
  }

  /* pages from content/pages */
  for (const pg of pages) {
    const rel = `${pg.slug}/`;
    const root = rootFor(rel);
    let extra = '';
    if (pg.slug === 'about') {
      extra += `<h2 id="gates-key">How to read a gate</h2><dl class="key-list">${Object.keys(STATUS).map((s) => `<div><dt class="st-${s}"><span class="node" aria-hidden="true"></span>${esc(STATUS[s].label)}</dt><dd>${esc({ cleared: 'The authority has said yes.', conditions: 'The authority has said yes, subject to conditions.', pending: 'A decision is awaited, or the approval is still needed.', hold: 'A court or tribunal order stops the deal moving for now.', challenged: 'The decision has been appealed or challenged.', refused: 'The authority has said no.', unknown: 'The approval is expected but nothing has been reported.' }[s])}</dd></div>`).join('')}</dl>`;
      if (cfg.contactEmail) extra += `<h2>Contact</h2><p><a href="mailto:${esc(cfg.contactEmail)}">${esc(cfg.contactEmail)}</a></p>`;
    }
    const body = `${pageHead(esc(pg.title), '', '', 'narrow')}<section class="narrow prose page-prose">${md(pg.body, root)}${extra}</section>`;
    write(rel, shell({ root, path: rel, title: pg.title, description: pg.description, active: pg.slug === 'about' ? 'about' : '', body }));
  }

  /* subscribe */
  {
    const rel = 'subscribe/';
    const root = rootFor(rel);
    const body = `${pageHead('Docket alerts by email', 'Free, once a week: what moved on the docket, the dates coming up, and one explainer on a single matter.')}<section class="wrap sub-page">${subscribe(root, 'page')}<p class="sub-sample">Prefer your calendar? <a href="${root}cause-list/#calendar">Add the cause list</a> and every date arrives there.</p></section>`;
    write(rel, shell({ root, path: rel, title: 'Email alerts', body }));
  }

  /* 404: served from any depth, so links must be absolute */
  {
    const root = SITE_URL ? `${SITE_URL}/` : '/';
    const body = `${pageHead('That page is not here', 'It may have moved when the site was updated.')}<section class="wrap"><p class="lost"><a class="btn" href="${root}">Go to the front page</a> <a class="btn" href="${root}dockets/">See all dockets</a></p></section>`;
    write('404.html', shell({ root, title: 'Page not found', noindex: true, body }), { index: false });
  }

  /* feeds and calendar */
  const xml = (s) => esc(s);
  const cdata = (s) => `<![CDATA[${String(s).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
  const rss = (title, desc, self, items) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
<title>${xml(title)}</title>
<link>${xml(SITE_URL || '')}/</link>
<description>${xml(desc)}</description>
<language>${xml(String(cfg.language || 'en').toLowerCase())}</language>
${SITE_URL ? `<atom:link href="${xml(absUrl(self))}" rel="self" type="application/rss+xml"/>\n` : ''}${items}
</channel>
</rss>
`;
  const base = SITE_URL ? `${SITE_URL}/` : '/';
  fs.writeFileSync(path.join(OUT, 'wire.xml'), rss(`${cfg.name}: new docket entries`, 'Every new entry on every docket, with its source.', 'wire.xml', allEntries.slice(0, 60).map(({ d, e }) => {
    const link = `${absUrl(d.url) || d.url}#e-${e.n}`;
    return `<item><title>${xml(`${d.title}: ${plain(e.text)}`)}</title><link>${xml(link)}</link><guid isPermaLink="false">${xml(`${d.slug}-${e.when.iso}-${slugify(plain(e.text)).slice(0, 40)}`)}</guid><pubDate>${e.when.start.toUTCString()}</pubDate><description>${cdata(`<p>${inline(e.text, base)}</p>${srcLine(e.sources)}`)}</description></item>`;
  }).join('\n')));
  fs.writeFileSync(path.join(OUT, 'rss.xml'), rss(`${cfg.name}: explainers`, cfg.description, 'rss.xml', explainers.slice(0, 30).map((p) => {
    const full = `${p.short ? `<p><strong>The short version.</strong> ${inline(p.short, base)}</p>` : ''}${md(p.body, base)}${p.sources.length ? `<p><strong>Sources:</strong> ${p.sources.map(srcLink).join('; ')}</p>` : ''}`;
    return `<item><title>${xml(p.title)}</title><link>${xml(absUrl(p.url) || p.url)}</link><guid isPermaLink="${SITE_URL ? 'true' : 'false'}">${xml(absUrl(p.url) || p.url)}</guid><pubDate>${p.date.toUTCString()}</pubDate>${p.tags.map((t) => `<category>${xml(t)}</category>`).join('')}<description>${xml(p.dek || p.short)}</description><content:encoded>${cdata(full)}</content:encoded></item>`;
  }).join('\n')));

  const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = (line) => { const out = []; let s = line; while (Buffer.byteLength(s, 'utf8') > 75) { let cut = 75; while (Buffer.byteLength(s.slice(0, cut), 'utf8') > 75) cut--; out.push(s.slice(0, cut)); s = ' ' + s.slice(cut); } out.push(s); return out.join('\r\n'); };
  const stamp = NOW.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const ymd = (dt) => isoDay(dt).replace(/-/g, '');
  const events = causeAll.filter((it) => it.when.kind === 'day').map((it) => {
    const title = it.docket ? `${it.docket.title}: ${plain(it.text)}` : it.title;
    const url = it.docket ? absUrl(it.docket.url) : absUrl('cause-list/');
    const desc = [plain(it.text), it.when.approx ? 'The date is approximate.' : '', it.sources.length ? `Source: ${it.sources.map((s) => `${s.name} ${s.url}`).join('; ')}` : '', url].filter(Boolean).join('\n');
    const end = new Date(it.when.start.getTime() + 86400000);
    return ['BEGIN:VEVENT', `UID:${slugify(title).slice(0, 60)}-${ymd(it.when.start)}@docket-wire`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(it.when.start)}`, `DTEND;VALUE=DATE:${ymd(end)}`, `SUMMARY:${icsText(title)}`, `DESCRIPTION:${icsText(desc)}`, ...(url ? [`URL:${url}`] : []), 'TRANSP:TRANSPARENT', 'END:VEVENT'].map(fold).join('\r\n');
  });
  fs.writeFileSync(path.join(OUT, 'calendar.ics'), ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${cfg.name}//Cause list//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsText(`${cfg.name} cause list`)}`, 'X-WR-TIMEZONE:Africa/Nairobi', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H', ...events, 'END:VCALENDAR'].join('\r\n') + '\r\n');

  if (SITE_URL) {
    fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map((s) => `<url><loc>${xml(absUrl(s.loc))}</loc>${s.lastmod ? `<lastmod>${s.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`);
    fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${absUrl('sitemap.xml')}\n`);
  } else {
    fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\n');
    warn('No site address yet, so feeds, the sitemap, citations and calendar buttons use local links. GitHub fills the address in when it publishes; set "url" in site.config.json for other hosts.');
  }

  copyDir(path.join(ROOT, 'assets'), path.join(OUT, 'assets'));
  copyDir(path.join(CONTENT, 'images'), path.join(OUT, 'images'));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  if (!EMBED && !(cfg.subscribe && cfg.subscribe.formAction)) warn('No sign-up form yet: paste your beehiiv embed code into content/subscribe-embed.html.');
  console.log(`Built ${count(dockets.length, 'docket', 'dockets')} (${open.length} open), ${count(explainers.length, 'explainer', 'explainers')}, ${count(cause.length, 'date', 'dates')} on the cause list, ${count(authorities.length, 'regulator page', 'regulator pages')} and ${count(figs.length, 'rate', 'rates')} into dist/.`);
  [...new Set(warnings)].forEach((w) => console.log(`Note: ${w}`));
}

/* ---------- local preview ---------- */

function serve(port = Number(process.env.PORT) || 8080) {
  const http = require('http');
  const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml', '.ics': 'text/calendar; charset=utf-8', '.txt': 'text/plain', '.json': 'application/json' };
  http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(OUT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    let code = 200;
    if (!fs.existsSync(f)) { f = path.join(OUT, '404.html'); code = 404; }
    res.writeHead(code, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(port, () => console.log(`Preview at http://localhost:${port} (Ctrl+C to stop)`));
}

build();
if (process.argv[2] === 'serve') serve();
