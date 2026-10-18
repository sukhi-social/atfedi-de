// translate.atfedi.de — two panes side by side, like an editor's split view:
// the source language on the left (read-only), yours on the right. Both are
// split into paragraphs and kept level row by row. Drafts save as you type
// (when signed in), and "Download" puts the right pane back together as a
// markdown file.

import { paragraphs, unwrap, isFence, highlight, check } from './markdown.js';

const LANGS = ['ko', 'ja', 'en'];
const LANG_NAMES = { en: 'English', ja: '日本語', ko: '한국어' };

const STRINGS = {
  en: {
    tagline: 'Translate atfedi.de, one paragraph at a time',
    loginLabel: 'Sign in with your fediverse account — enter the server it lives on',
    loginButton: 'Sign in',
    loginHint: 'Mastodon, Misskey, GoToSocial, and most others work. We only read your account name.',
    doc: 'Page', from: 'From', to: 'Into',
    howto: "The left side is the source. Each paragraph lines up with its translation, but they don't have to match word for word. Write it the way your language would say it.",
    readOnly: 'read-only',
    download: 'Download',
    goesTo: (p) => `It goes to ${p} in atfedi-content.`,
    signedIn: 'Signed in as', logout: 'Sign out',
    saving: 'saving…', saved: 'saved',
    notSaved: "couldn't save",
    signInToSave: 'Sign in to keep drafts. You can still download what you write.',
    progress: (done, total) => `${done} / ${total} translated`,
    warnings: (n) => `${n} to check`,
    nextEmpty: 'Next untranslated',
    copySource: 'Copy the source',
    keys: 'Alt+↑↓ move between paragraphs · Ctrl+Enter next untranslated · Ctrl+Shift+Enter copy the source in',
    checks: {
      url: (d) => `A link from the source is missing: ${d}`,
      icon: (d) => `An icon from the source is missing: ${d}`,
      code: (d) => `Code from the source is missing: ${d}`,
      heading: (d) => `Heading level differs (source / yours): ${d}`,
      items: (d) => `List items differ (source / yours): ${d}`,
    },
  },
  ja: {
    tagline: 'atfedi.de を、一段落ずつ訳す',
    loginLabel: 'フェディバースのアカウントでログイン。アカウントのあるサーバーを入れてください',
    loginButton: 'ログイン',
    loginHint: 'Mastodon、Misskey、GoToSocial など、たいていのサーバーで使えます。読むのはアカウント名だけ。',
    doc: 'ページ', from: '原文', to: '訳す先',
    howto: '左が原文。段落ごとに横に並びますが、一語ずつ合わせなくて大丈夫。その言語らしい言い方で。',
    readOnly: '読み取り専用',
    download: 'ダウンロード',
    goesTo: (p) => `atfedi-content の ${p} に置くものです。`,
    signedIn: 'ログイン中', logout: 'ログアウト',
    saving: '保存中…', saved: '保存しました',
    notSaved: '保存できませんでした',
    signInToSave: 'ログインすると下書きが残ります。ダウンロードはログインなしでもできます。',
    progress: (done, total) => `${total} 段落中 ${done} 訳済み`,
    warnings: (n) => `確認 ${n}`,
    nextEmpty: '次の未訳へ',
    copySource: '原文を写す',
    keys: 'Alt+↑↓ 段落を移動 · Ctrl+Enter 次の未訳へ · Ctrl+Shift+Enter 原文を写す',
    checks: {
      url: (d) => `原文のリンクが見当たりません: ${d}`,
      icon: (d) => `原文のアイコンが見当たりません: ${d}`,
      code: (d) => `原文のコードが見当たりません: ${d}`,
      heading: (d) => `見出しの深さがちがいます(原文 / 訳): ${d}`,
      items: (d) => `箇条書きの数がちがいます(原文 / 訳): ${d}`,
    },
  },
  ko: {
    tagline: 'atfedi.de를 문단 하나씩 번역해요',
    loginLabel: '페디버스 계정으로 로그인해요. 계정이 있는 서버를 적어 주세요',
    loginButton: '로그인',
    loginHint: '마스토돈, Misskey, GoToSocial 등 대부분의 서버에서 돼요. 읽는 건 계정 이름뿐이에요.',
    doc: '페이지', from: '원문', to: '옮길 언어',
    howto: '왼쪽이 원문이에요. 문단마다 옆에 나란히 놓이지만, 한 단어씩 맞출 필요는 없어요. 그 언어다운 말투로 써 주세요.',
    readOnly: '읽기 전용',
    download: '내려받기',
    goesTo: (p) => `atfedi-content의 ${p}에 들어갈 파일이에요.`,
    signedIn: '로그인:', logout: '로그아웃',
    saving: '저장 중…', saved: '저장했어요',
    notSaved: '저장하지 못했어요',
    signInToSave: '로그인하면 초안이 남아요. 내려받기는 로그인 없이도 돼요.',
    progress: (done, total) => `${total}개 중 ${done}개 번역`,
    warnings: (n) => `확인 ${n}`,
    nextEmpty: '다음 빈 문단',
    copySource: '원문 복사',
    keys: 'Alt+↑↓ 문단 이동 · Ctrl+Enter 다음 빈 문단 · Ctrl+Shift+Enter 원문 복사해 넣기',
    checks: {
      url: (d) => `원문의 링크가 빠졌어요: ${d}`,
      icon: (d) => `원문의 아이콘이 빠졌어요: ${d}`,
      code: (d) => `원문의 코드가 빠졌어요: ${d}`,
      heading: (d) => `제목 단계가 달라요 (원문 / 번역): ${d}`,
      items: (d) => `목록 항목 수가 달라요 (원문 / 번역): ${d}`,
    },
  },
};

const uiLang = LANGS.find((l) => navigator.language.toLowerCase().startsWith(l)) ?? 'en';
const s = STRINGS[uiLang];
document.documentElement.lang = uiLang;
for (const el of document.querySelectorAll('[data-t]')) el.textContent = s[el.dataset.t];

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// --- state -----------------------------------------------------------------

let me = null;
let docs = [];

async function getJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(String(res.status));
  return await res.json();
}

async function getText(url) {
  const res = await fetch(url);
  return res.ok ? await res.text() : null;
}

function readHash() {
  return Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
}

function writeHash() {
  const p = new URLSearchParams({ doc: $('doc').value, from: $('from').value, to: $('to').value });
  history.replaceState(null, '', `#${p}`);
}

// --- who's here ------------------------------------------------------------------

function renderWho() {
  const who = $('who');
  who.replaceChildren();
  if (me) {
    who.append(`${s.signedIn} ${me}`, el('a', { href: '/logout', textContent: s.logout }));
    $('login').hidden = true;
  } else {
    $('login').hidden = false;
  }
}

// --- the pickers -------------------------------------------------------------

function fillLangs(doc) {
  const have = LANGS.filter((l) => doc.title[l]);
  const hash = readHash();
  const from = $('from');
  from.replaceChildren(...have.map((l) => el('option', { value: l, textContent: LANG_NAMES[l] })));
  from.value = have.includes(hash.from) ? hash.from : have.find((l) => l !== uiLang) ?? have[0];
  const to = $('to');
  to.replaceChildren(...LANGS.map((l) => el('option', { value: l, textContent: LANG_NAMES[l] })));
  to.value = LANGS.includes(hash.to) && hash.to !== from.value ? hash.to : uiLang !== from.value ? uiLang : LANGS.find((l) => l !== from.value);
}

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
let rows = [];

async function saveDraft(doc, lang, idx, text, row) {
  if (!me) return;
  const status = $('status');
  status.textContent = s.saving;
  try {
    await getJson('/api/drafts', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ doc, lang, idx, text }),
    });
    status.textContent = s.saved;
    row.el.classList.toggle('drafted', text.trim() !== '');
  } catch {
    status.textContent = s.notSaved;
  }
}

const loadDrafts = (doc, lang) =>
  me
    ? getJson(`/api/drafts?doc=${encodeURIComponent(doc)}&lang=${lang}`)
        .then((r) => r.drafts)
        .catch(() => ({}))
    : Promise.resolve({});

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
  const done = rows.filter((r) => r.box.value.trim()).length;
  const warn = rows.filter((r) => r.el.classList.contains('warn')).length;
  $('progress').textContent = `${s.progress(done, rows.length)}${warn ? ` · ${s.warnings(warn)}` : ''}`;
}

function focusRow(i, atEnd = false) {
  const row = rows[i];
  if (!row) return;
  row.box.focus();
  if (atEnd) row.box.setSelectionRange(row.box.value.length, row.box.value.length);
  row.el.scrollIntoView({ block: 'nearest' });
}

const nextEmpty = (from) => {
  for (let k = 1; k <= rows.length; k++) {
    const i = (from + k) % rows.length;
    if (!rows[i].box.value.trim()) return i;
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

async function renderPairs() {
  const doc = docs.find((d) => d.doc === $('doc').value);
  if (!doc) return;
  const from = $('from').value;
  const to = $('to').value;
  writeHash();

  const [source, target, drafts] = await Promise.all([
    getText(`/content/${doc.doc}.${from}.md`),
    doc.title[to] ? getText(`/content/${doc.doc}.${to}.md`) : null,
    loadDrafts(doc.doc, to),
  ]);
  const left = paragraphs(source ?? '').map(unwrap);
  const right = paragraphs(target ?? '').map(unwrap);
  const count = Math.max(left.length, right.length);
  const name = doc.doc.split('/').pop();

  $('tab-from').replaceChildren(`${name}.${from}.md`, el('span', { className: 'tag', textContent: s.readOnly }));
  const jump = el('button', { type: 'button', className: 'small ghost', textContent: s.nextEmpty });
  jump.addEventListener('click', () => {
    const at = rows.findIndex((r) => r.el.classList.contains('active'));
    const i = nextEmpty(at < 0 ? -1 : at);
    if (i >= 0) focusRow(i);
  });
  $('tab-to').replaceChildren(
    `${name}.${to}.md`,
    el('span', { className: 'tag', id: 'status' }),
    jump,
    downloadButton(to),
  );

  const pane = $('pairs');
  pane.replaceChildren();
  rows = [];
  for (let idx = 0; idx < count; idx++) {
    const src = left[idx];
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
    const srcPre = el('pre', { lang: from });
    srcPre.innerHTML = highlight(src ?? '');
    const rowEl = el(
      'div',
      { className: `para${draft != null ? ' drafted' : ''}${isFence(src) ? ' code' : ''}` },
      el('div', { className: 'src' }, el('span', { className: 'num', textContent: String(idx + 1) }), srcPre),
      el(
        'div',
        { className: 'dst' },
        el('span', { className: 'num' }, String(idx + 1), flag, copy),
        el('div', { className: 'ed' }, mirror, box),
      ),
    );
    const row = { idx, src, box, mirror, flag, el: rowEl };
    rows.push(row);

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
    box.addEventListener('input', () => {
      paint(row);
      review(row);
      clearTimeout(saveTimers.get(idx));
      saveTimers.set(idx, setTimeout(() => saveDraft(doc.doc, to, idx, box.value, row), 1200));
    });
    paint(row);
    pane.append(rowEl);
  }
  rows.forEach(review);

  const repoPath = doc.repoPath[to] ?? doc.repoPath[from].replace(`.${from}.md`, `.${to}.md`);
  $('repo-path').textContent = `${s.goesTo(repoPath)}${me ? '' : ` ${s.signInToSave}`}`;
}

// The right pane, put back together as one markdown file.
function downloadButton(lang) {
  const button = el('button', { type: 'button', className: 'small', textContent: s.download });
  button.addEventListener('click', () => {
    const doc = $('doc').value;
    const text =
      rows.map((r) => r.box)
        .map((t) => t.value.trim())
        .filter(Boolean)
        .join('\n\n') + '\n';
    const a = el('a', {
      href: URL.createObjectURL(new Blob([text], { type: 'text/markdown' })),
      download: `${doc.split('/').pop()}.${lang}.md`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  });
  return button;
}

// --- start -------------------------------------------------------------------

async function start() {
  [me, docs] = await Promise.all([
    getJson('/api/me').then((r) => r.handle).catch(() => null),
    getJson('/docs.json'),
  ]);
  renderWho();

  const hash = readHash();
  const pick = $('doc');
  pick.replaceChildren(
    ...docs.map((d) =>
      el('option', { value: d.doc, textContent: d.title[uiLang] ?? Object.values(d.title)[0] }),
    ),
  );
  if (docs.some((d) => d.doc === hash.doc)) pick.value = hash.doc;
  fillLangs(docs.find((d) => d.doc === pick.value));

  pick.addEventListener('change', () => {
    fillLangs(docs.find((d) => d.doc === pick.value));
    renderPairs();
  });
  $('from').addEventListener('change', renderPairs);
  $('to').addEventListener('change', renderPairs);
  await renderPairs();
}

start();
