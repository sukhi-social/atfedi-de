// The editors, shared by translate and write: the page as paragraph rows, each
// with its own draft, kept level with the language beside it (write: when the
// reference is shown). Drafts, keys, the checks in the gutter, and the Send,
// Download and Picture buttons in the tab bar.

import { $, WRITE, besideOn, draftKey, el, getJson, getText, local, s, state, swr, writeHash } from './desk.js';
import { paragraphs, align, unwrap, isFence, highlight, check } from './markdown.js';
import { LANG_NAMES } from './strings.js';
import { repoPathOf, downloadButton, addPicture, pictureButton, sendButton } from './send.js';

// --- the editors ---------------------------------------------------------------

// Two panes, like an editor's side-by-side view: the source on the left is
// read-only, yours on the right is editable. Each paragraph is one row of a
// CSS grid, so a row is as tall as its taller side and the shorter side shows
// a hatched filler under its text. Nothing is boxed; the panes read as two
// continuous documents.
//
// What helps with comparing and fixing, borrowed from translation tools and
// editors:
//   - the row you're in is lit on both sides, so your eye finds its source
//   - markdown marks are faded and the words are not (Typora); the right
//     side does this by laying a highlighted copy under a clear textarea
//   - keys to step between paragraphs and jump to the next empty one, and
//     one to copy the source in when most of it stays (code, a list of links)
//   - a quiet check for links, icons, code, heading level and list items the
//     source has but the translation lost, shown in the gutter
//   - a running count of what's translated and what's worth a second look

const saveTimers = new Map();
let renderCount = 0;

function keepLocally(doc, lang, idx, text) {
  const all = local.get(draftKey(doc, lang)) ?? {};
  if (text.trim()) all[idx] = text;
  else delete all[idx];
  local.set(draftKey(doc, lang), Object.keys(all).length ? all : null);
}

// The server copy, so a draft follows you to another device. Quiet when it
// works; when it doesn't, the words are still here, and the tab says so.
async function saveDraft(doc, lang, idx, text, row) {
  row.el.classList.toggle('drafted', text.trim() !== '');
  if (!state.me) return;
  const status = $('status');
  try {
    await getJson('/api/drafts', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ doc, lang, idx, text }),
    });
    if (status.textContent === s.notSaved) status.textContent = '';
  } catch {
    status.textContent = s.notSaved;
  }
}

// write was once one editor, saving the whole page as draft 0. Such a draft
// becomes one draft per paragraph row, laid out against the source the way the
// rows are, so a paragraph one side lacks leaves a gap there and not a shift.
let sourceBlocks = [];
function wholeToRows(drafts, split) {
  const keys = Object.keys(drafts);
  if (!WRITE || keys.length !== 1 || keys[0] !== '0') return drafts;
  const parts = split(drafts[0]);
  if (parts.length < 2) return drafts;
  const rowsOf = align(sourceBlocks, parts).map((pair) => pair[1]);
  return Object.fromEntries(rowsOf.flatMap((p, i) => (p == null ? [] : [[i, p]])));
}

// The server's drafts arrive after the page is up, and fill only paragraphs
// this device has nothing for and you haven't touched.
async function mergeServerDrafts(doc, lang, at) {
  if (!state.me) return;
  const server = await getJson(`/api/drafts?doc=${encodeURIComponent(doc)}&lang=${lang}`)
    .then((r) => r.drafts)
    .catch(() => ({}));
  if (at !== renderCount) return; // a different page is up now
  const mine = local.get(draftKey(doc, lang)) ?? {};
  for (const [idx, text] of Object.entries(wholeToRows(server, (md) => paragraphs(md).map(unwrap)))) {
    const row = state.rows[idx];
    if (!row || mine[idx] != null || row.touched) continue;
    row.box.value = text;
    row.el.classList.add('drafted');
    paint(row);
    review(row);
  }
}

// The highlighted copy under the textarea; the trailing newline keeps an
// ending blank line from collapsing, so the heights always agree.
function paint(row) {
  row.mirror.innerHTML = `${highlight(row.box.value)}\n`;
}

function review(row) {
  const issues = check(row.src, row.box.value);
  row.el.classList.toggle('warn', issues.length > 0);
  row.flag.title = issues.map((i) => s.checks[i.kind](i.detail)).join('\n');
  row.el.classList.toggle('empty', !row.box.value.trim());
  tally();
}

function tally() {
  const done = state.rows.filter((r) => r.box.value.trim()).length;
  const warn = state.rows.filter((r) => r.el.classList.contains('warn')).length;
  const parts = [...(WRITE ? [] : [s.progress(done, state.rows.length)]), ...(warn ? [s.warnings(warn)] : [])];
  $('progress').textContent = parts.join(' · ');
}

function focusRow(i, atEnd = false) {
  const row = state.rows[i];
  if (!row) return;
  row.box.focus();
  if (atEnd) row.box.setSelectionRange(row.box.value.length, row.box.value.length);
  row.el.scrollIntoView({ block: 'nearest' });
}

const nextEmpty = (from) => {
  for (let k = 1; k <= state.rows.length; k++) {
    const i = (from + k) % state.rows.length;
    if (!state.rows[i].box.value.trim()) return i;
  }
  return -1;
};

function copySource(row) {
  if (row.src == null) return;
  row.box.focus();
  row.box.select();
  // execCommand keeps the browser's undo history; fall back to assignment
  if (!document.execCommand('insertText', false, row.src)) {
    row.box.value = row.src;
    row.box.dispatchEvent(new Event('input'));
  }
}

function onKey(e, row) {
  const mod = e.ctrlKey || e.metaKey;
  if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    focusRow(row.idx + (e.key === 'ArrowDown' ? 1 : -1), true);
  } else if (mod && e.shiftKey && e.key === 'Enter') {
    e.preventDefault();
    copySource(row);
  } else if (mod && e.key === 'Enter') {
    e.preventDefault();
    const i = nextEmpty(row.idx);
    if (i >= 0) focusRow(i);
  }
}

export async function renderPairs() {
  const doc = state.docs.find((d) => d.doc === $('doc').value);
  if (!doc) return;
  const from = $('from').value;
  if (WRITE) $('to').value = from;
  const to = $('to').value;
  // write shows nothing on the left unless the beside box is ticked
  const left = WRITE ? (besideOn() ? $('beside').value : '') : from;
  document.documentElement.classList.toggle('beside', WRITE && !!left);
  writeHash();

  const at = ++renderCount;
  // a newer copy of either side re-renders, unless you've started writing
  const refresh = () => at === renderCount && !state.rows.some((r) => r.touched) && renderPairs();
  const page = (lang) =>
    swr(`page:${doc.doc}:${lang}`, () => getText(`/content/${doc.doc}.${lang}.md`), refresh);
  // with nothing beside it, write still checks your rewrite against the page as it is
  const [source, target] = await Promise.all([page(left || from), doc.title[to] ? page(to) : null]);
  if (at !== renderCount) return;
  const split = (md) => paragraphs(md ?? '').map(unwrap);
  sourceBlocks = split(source);
  const drafts = wholeToRows(local.get(draftKey(doc.doc, to)) ?? {}, split);
  local.set(draftKey(doc.doc, to), Object.keys(drafts).length ? drafts : null);
  // write: the page beside itself (its source pane hidden), or beside another
  // language, paired paragraph by paragraph inside each heading's section
  const pairs = align(split(source), split(target));
  const srcs = pairs.map((p) => p[0]);
  const right = pairs.map((p) => p[1]);
  // a draft the page now says too has been published: let it go
  const stale = Object.keys(drafts).filter((i) => drafts[i].trim() === (right[i] ?? '').trim());
  if (stale.length) {
    for (const i of stale) delete drafts[i];
    local.set(draftKey(doc.doc, to), Object.keys(drafts).length ? drafts : null);
  }
  const count = pairs.length;
  const name = doc.doc.split('/').pop();

  $('tab-from').replaceChildren(`${name}.${left}.md`, el('span', { className: 'tag', textContent: s.readOnly }));
  const jump = el('button', { type: 'button', className: 'small ghost', textContent: s.nextEmpty });
  jump.addEventListener('click', () => {
    const at = state.rows.findIndex((r) => r.el.classList.contains('active'));
    const i = nextEmpty(at < 0 ? -1 : at);
    if (i >= 0) focusRow(i);
  });
  $('tab-to').replaceChildren(
    `${name}.${to}.md`,
    el('span', { className: 'tag', id: 'status' }),
    ...(WRITE ? [] : [jump]),
    pictureButton(),
    downloadButton(to),
    sendButton(doc.doc, to, repoPathOf(doc, from, to)),
  );

  const pane = $('pairs');
  pane.replaceChildren();
  state.rows = [];
  for (let idx = 0; idx < count; idx++) {
    const src = srcs[idx];
    const draft = drafts[idx];
    const box = el('textarea', {
      value: draft ?? right[idx] ?? '',
      lang: to,
      rows: 1,
      spellcheck: true,
      ariaLabel: `${LANG_NAMES[to]} ${idx + 1}`,
    });
    const mirror = el('pre', { className: 'mirror', ariaHidden: 'true', lang: to });
    const flag = el('span', { className: 'flag', textContent: '!' });
    const copy = el('button', { type: 'button', className: 'copy', textContent: '⇥', title: s.copySource, tabIndex: -1 });
    const srcPre = el('pre', { lang: left || from });
    srcPre.innerHTML = highlight(src ?? '');
    const rowEl = el(
      'div',
      { className: `para${draft != null ? ' drafted' : ''}${isFence(src) ? ' code' : ''}` },
      el('div', { className: 'src' }, el('span', { className: 'num', textContent: src == null ? '' : String(idx + 1) }), srcPre),
      el(
        'div',
        { className: 'dst' },
        el('span', { className: 'num' }, String(idx + 1), flag, copy),
        el('div', { className: 'ed' }, mirror, box),
      ),
    );
    const row = { idx, src, box, mirror, flag, el: rowEl };
    state.rows.push(row);

    // the filler under a short paragraph, and the source beside it, still
    // belong to it: a click there puts you in this paragraph
    rowEl.addEventListener('mousedown', (e) => {
      if (e.target === box || e.target === copy || window.getSelection()?.toString()) return;
      if (e.target.closest('.src pre')) return; // let the source be selected and copied
      e.preventDefault();
      focusRow(idx, true);
    });
    copy.addEventListener('click', () => copySource(row));
    box.addEventListener('focus', () => rowEl.classList.add('active'));
    box.addEventListener('blur', () => {
      rowEl.classList.remove('active');
      clearTimeout(saveTimers.get(idx));
      saveDraft(doc.doc, to, idx, box.value, row);
    });
    box.addEventListener('keydown', (e) => onKey(e, row));
    box.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length || !state.me) return;
      e.preventDefault();
      for (const f of files) addPicture(f, row);
    });
    box.addEventListener('dragover', (e) => state.me && e.preventDefault());
    box.addEventListener('drop', (e) => {
      const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length || !state.me) return;
      e.preventDefault();
      box.focus();
      for (const f of files) addPicture(f, row);
    });
    box.addEventListener('input', () => {
      row.touched = true;
      keepLocally(doc.doc, to, idx, box.value);
      paint(row);
      review(row);
      clearTimeout(saveTimers.get(idx));
      saveTimers.set(idx, setTimeout(() => saveDraft(doc.doc, to, idx, box.value, row), 1200));
    });
    paint(row);
    pane.append(rowEl);
  }
  state.rows.forEach(review);
  mergeServerDrafts(doc.doc, to, at);

  $('repo-path').textContent = `${s.goesTo(repoPathOf(doc, from, to))}${state.me ? '' : ` ${s.signInToSave}`}`;
}
