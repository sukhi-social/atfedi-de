// translate.atfedi.de — two panes side by side, like an editor's split view:
// the source language on the left (read-only), yours on the right. Both are
// split into paragraphs and kept level row by row. Drafts save as you type
// (when signed in), "Download" puts the right pane back together as a
// markdown file, and "Send" commits it to atfedi-content as you.
//
// write.atfedi.de is the same desk with the same language on both sides: the
// page as it is on the left, your own rewrite on the right.

import { paragraphs, align, unwrap, isFence, highlight, check } from './markdown.js';

const LANGS = ['ko', 'ja', 'en'];
const LANG_NAMES = { en: 'English', ja: '日本語', ko: '한국어' };
const WRITE = location.hostname.startsWith('write.');

const STRINGS = {
  en: {
    tagline: 'Translate atfedi.de, one paragraph at a time',
    loginLabel: 'Sign in with your fediverse account — enter the server it lives on',
    loginButton: 'Sign in',
    loginHint: 'Mastodon, Misskey, GoToSocial, and most others work. We only read your account name.',
    doc: 'Page', from: 'From', to: 'Into', lang: 'Language',
    howto: "The left side is the source. Each paragraph lines up with its translation, but they don't have to match word for word. Write it the way your language would say it.",
    readOnly: 'read-only',
    download: 'Download',
    writeTagline: 'Rewrite an atfedi.de page in your own words',
    writeHowto: "This is the page as it is. Rewrite it the way you'd say it. When you send it, the commit is yours, and Claude is credited as Assisted-by if it wrote the version you started from.",
    send: 'Send',
    cc0Agree: 'What I send is CC0: I give up my copyright in it as far as the law allows.',
    cc0More: 'What is CC0?',
    cc0Needed: 'Tick the CC0 box beside Send to send.',
    picture: 'Picture',
    pictureFailed: "A picture couldn't be uploaded. Try sending again.",
    undo: 'Undo',
    chipWaiting: 'Sending…', chipSending: 'Sending', chipSent: 'Sent', chipPublished: 'Published', chipProposed: 'Sent as a PR', viewPR: 'View', chipFailed: "Couldn't send", retry: 'Retry',
    goesTo: (p) => `It goes to ${p} in atfedi-content.`,
    signedIn: 'Signed in as', logout: 'Sign out',
    saving: 'saving…', saved: 'saved',
    notSaved: 'saved on this device only',
    signInToSave: 'Your drafts stay on this device. Sign in to keep them anywhere and to send.',
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
    doc: 'ページ', from: '原文', to: '訳す先', lang: '言語',
    howto: '左が原文。段落ごとに横に並びますが、一語ずつ合わせなくて大丈夫。その言語らしい言い方で。',
    readOnly: '読み取り専用',
    download: 'ダウンロード',
    writeTagline: 'atfedi.de のページを、自分のことばで書き直す',
    writeHowto: 'いまのページが入っています。自分の言い方で書き直してください。送ると、コミットはあなたの名前になります。もとの文を Claude が書いていたら、Assisted-by に Claude が入ります。',
    send: '送る',
    cc0Agree: '送るものは CC0 にして、著作権をできるかぎり手放します。',
    cc0More: 'CC0 とは',
    cc0Needed: '送るには、となりの CC0 にチェックを入れてください。',
    picture: '画像',
    pictureFailed: '画像をアップロードできませんでした。もう一度送ってみてください。',
    undo: '取り消す',
    chipWaiting: '送ります…', chipSending: '送っています', chipSent: '送りました', chipPublished: '公開しました', chipProposed: 'PR にしました', viewPR: '見る', chipFailed: '送れませんでした', retry: 'もう一度',
    goesTo: (p) => `atfedi-content の ${p} に置くものです。`,
    signedIn: 'ログイン中', logout: 'ログアウト',
    saving: '保存中…', saved: '保存しました',
    notSaved: 'この端末にだけ保存しました',
    signInToSave: '下書きはこの端末に残ります。ログインすると、どこでも続きが書けて、送れるようになります。',
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
    doc: '페이지', from: '원문', to: '옮길 언어', lang: '언어',
    howto: '왼쪽이 원문이에요. 문단마다 옆에 나란히 놓이지만, 한 단어씩 맞출 필요는 없어요. 그 언어다운 말투로 써 주세요.',
    readOnly: '읽기 전용',
    download: '내려받기',
    writeTagline: 'atfedi.de 페이지를 내 말로 다시 써요',
    writeHowto: '지금의 페이지가 들어 있어요. 내 말투로 다시 써 주세요. 보내면 커밋은 내 이름으로 남아요. 원래 글을 Claude가 썼다면 Assisted-by에 Claude가 들어가요.',
    send: '보내기',
    cc0Agree: '보내는 글은 CC0로 하고, 저작권을 가능한 만큼 내려놓을게요.',
    cc0More: 'CC0가 뭔가요?',
    cc0Needed: '보내려면 옆의 CC0에 체크해 주세요.',
    picture: '사진',
    pictureFailed: '사진을 올리지 못했어요. 다시 보내 보세요.',
    undo: '취소',
    chipWaiting: '보내요…', chipSending: '보내는 중', chipSent: '보냈어요', chipPublished: '공개했어요', chipProposed: 'PR로 보냈어요', viewPR: '보기', chipFailed: '보내지 못했어요', retry: '다시',
    goesTo: (p) => `atfedi-content의 ${p}에 들어갈 파일이에요.`,
    signedIn: '로그인:', logout: '로그아웃',
    saving: '저장 중…', saved: '저장했어요',
    notSaved: '이 기기에만 저장했어요',
    signInToSave: '초안은 이 기기에 남아요. 로그인하면 어디서든 이어 쓰고 보낼 수 있어요.',
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
if (WRITE) {
  s.tagline = s.writeTagline;
  s.howto = s.writeHowto;
  s.from = s.lang;
  document.title = 'write — atfedi.de';
  document.querySelector('.title-tag').firstChild.textContent = 'write ';
  document.getElementById('to').closest('label').hidden = true;
  // one editor with the whole page: no source pane, no paragraph rows
  document.documentElement.classList.add('write');
}
for (const el of document.querySelectorAll('[data-t]')) el.textContent = s[el.dataset.t];

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// --- state -----------------------------------------------------------------

let me = null;
let agreed = false; // CC0 for what this account sends, asked once (/api/cc0)
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

// --- on this device ---------------------------------------------------------
//
// The desk never makes you wait on the Worker. Every keystroke is kept here
// first (localStorage, synchronous), and the server copy follows quietly.
// Pages, the page list and who you are come from here too when you've been
// before, so the desk opens on what you saw last and refreshes behind it.

const local = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(`desk:${key}`));
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value == null) localStorage.removeItem(`desk:${key}`);
      else localStorage.setItem(`desk:${key}`, JSON.stringify(value));
    } catch {
      // full or blocked: the server copy still works
    }
  },
};
const draftKey = (doc, lang) => `drafts:${doc}:${lang}`;

// cached first, then the network; onFresh runs when the network says otherwise
async function swr(key, load, onFresh) {
  const cached = local.get(key);
  const fresh = load().then((v) => {
    if (v != null && JSON.stringify(v) !== JSON.stringify(cached)) {
      local.set(key, v);
      if (cached != null) onFresh?.(v);
    }
    return v;
  });
  return cached ?? (await fresh);
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
  if (WRITE) {
    from.value = have.includes(hash.from) ? hash.from : have.includes(uiLang) ? uiLang : have[0];
    to.value = from.value;
  }
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
  if (!me) return;
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

// The server's drafts arrive after the page is up, and fill only paragraphs
// this device has nothing for and you haven't touched.
async function mergeServerDrafts(doc, lang, at) {
  if (!me) return;
  const server = await getJson(`/api/drafts?doc=${encodeURIComponent(doc)}&lang=${lang}`)
    .then((r) => r.drafts)
    .catch(() => ({}));
  if (at !== renderCount) return; // a different page is up now
  const mine = local.get(draftKey(doc, lang)) ?? {};
  for (const [idx, text] of Object.entries(server)) {
    const row = rows[idx];
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
  const done = rows.filter((r) => r.box.value.trim()).length;
  const warn = rows.filter((r) => r.el.classList.contains('warn')).length;
  const parts = [...(WRITE ? [] : [s.progress(done, rows.length)]), ...(warn ? [s.warnings(warn)] : [])];
  $('progress').textContent = parts.join(' · ');
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
  if (WRITE) $('to').value = from;
  const to = $('to').value;
  writeHash();

  const at = ++renderCount;
  // a newer copy of either side re-renders, unless you've started writing
  const refresh = () => at === renderCount && !rows.some((r) => r.touched) && renderPairs();
  const page = (lang) =>
    swr(`page:${doc.doc}:${lang}`, () => getText(`/content/${doc.doc}.${lang}.md`), refresh);
  const [source, target] = await Promise.all([page(from), doc.title[to] ? page(to) : null]);
  if (at !== renderCount) return;
  let drafts = local.get(draftKey(doc.doc, to)) ?? {};
  // drafts from when write had a row per paragraph don't fit one editor
  if (WRITE && Object.keys(drafts).some((i) => i !== '0')) {
    drafts = {};
    local.set(draftKey(doc.doc, to), null);
  }
  const split = (md) => paragraphs(md ?? '').map(unwrap);
  // write is one editor holding the whole page
  const whole = (md) => split(md).join('\n\n');
  const pairs = WRITE ? [[whole(source), whole(target)]] : align(split(source), split(target));
  const left = pairs.map((p) => p[0]);
  const right = pairs.map((p) => p[1]);
  // a draft the page now says too has been published: let it go
  const stale = Object.keys(drafts).filter((i) => drafts[i].trim() === (right[i] ?? '').trim());
  if (stale.length) {
    for (const i of stale) delete drafts[i];
    local.set(draftKey(doc.doc, to), Object.keys(drafts).length ? drafts : null);
  }
  const count = pairs.length;
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
    ...(WRITE ? [] : [jump]),
    pictureButton(),
    downloadButton(to),
    sendButton(doc.doc, to, repoPathOf(doc, from, to)),
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
      el('div', { className: 'src' }, el('span', { className: 'num', textContent: src == null ? '' : String(idx + 1) }), srcPre),
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
    box.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length || !me) return;
      e.preventDefault();
      for (const f of files) addPicture(f, row);
    });
    box.addEventListener('dragover', (e) => me && e.preventDefault());
    box.addEventListener('drop', (e) => {
      const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length || !me) return;
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
  rows.forEach(review);
  mergeServerDrafts(doc.doc, to, at);

  $('repo-path').textContent = `${s.goesTo(repoPathOf(doc, from, to))}${me ? '' : ` ${s.signInToSave}`}`;
}

const repoPathOf = (doc, from, to) =>
  doc.repoPath[to] ?? doc.repoPath[from].replace(`.${from}.md`, `.${to}.md`);

// The right pane, put back together as one markdown file.
const assemble = () =>
  rows
    .map((r) => r.box.value.trim())
    .filter(Boolean)
    .join('\n\n') + '\n';

function downloadButton(lang) {
  const button = el('button', { type: 'button', className: 'small', textContent: s.download });
  button.addEventListener('click', () => {
    const doc = $('doc').value;
    const text = assemble();
    const a = el('a', {
      href: URL.createObjectURL(new Blob([text], { type: 'text/markdown' })),
      download: `${doc.split('/').pop()}.${lang}.md`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  });
  return button;
}

// --- pictures --------------------------------------------------------------
//
// Like early Instagram: the upload starts the moment a picture is chosen, and
// you keep writing while it goes. The picture is shrunk here first (long side
// 1600px, WebP), named by the sha256 of those bytes, and its markdown goes in
// at once with the cursor in the alt text, so nothing waits on the network.
// The Worker names it the same way, so the name is already final. "Send" only
// waits if an upload is somehow still on its way.

const MAX_SIDE = 1600;
const uploads = new Map(); // name → { blob, promise }
const EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };

async function shrink(file) {
  if (file.type === 'image/gif') return file; // keep it moving
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = el('canvas', { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.85));
  // a browser without WebP encoding hands back PNG; if that's bigger, keep the original
  return blob && (blob.type === 'image/webp' || blob.size < file.size) ? blob : file;
}

async function sha256(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function upload(blob, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      return await getJson('/api/upload', { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
    } catch (e) {
      if (i + 1 >= tries) throw e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
}

function insertAt(box, text, selectFrom, selectTo) {
  box.focus();
  const at = box.selectionStart;
  if (!document.execCommand('insertText', false, text)) {
    box.setRangeText(text, at, box.selectionEnd, 'end');
    box.dispatchEvent(new Event('input'));
  }
  box.setSelectionRange(at + selectFrom, at + selectTo);
}

async function addPicture(file, row) {
  const ext0 = EXT[file.type];
  if (!ext0) return;
  const blob = await shrink(file);
  const name = `${await sha256(blob)}.${EXT[blob.type] ?? ext0}`;
  // its own paragraph, cursor between the [] for the alt text
  const before = row.box.value.slice(0, row.box.selectionStart);
  const lead = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
  insertAt(row.box, `${lead}![](/media/${name})\n\n`, lead.length + 2, lead.length + 2);
  if (!uploads.has(name)) {
    const promise = upload(blob);
    promise.catch(() => {}); // looked at again when sending
    uploads.set(name, { blob, promise });
  }
}

// Before sending: every picture has made it up. One that failed in the
// background gets one more try here.
async function uploadsSettled() {
  for (const [name, u] of uploads) {
    try {
      await u.promise;
    } catch {
      u.promise = upload(u.blob, 1);
      try {
        await u.promise;
      } catch {
        throw new Error('picture');
      }
    }
    uploads.set(name, u);
  }
}

function pictureButton() {
  const input = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true, hidden: true });
  const button = el('button', { type: 'button', className: 'small ghost', textContent: s.picture });
  let target = null;
  if (!me) {
    button.disabled = true;
    button.title = s.signInToSave;
  }
  // remember the paragraph you were in; the click takes focus away from it
  button.addEventListener('mousedown', () => {
    target = rows.find((r) => r.el.classList.contains('active')) ?? rows.at(-1);
  });
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const row = target ?? rows.at(-1);
    for (const f of input.files) addPicture(f, row);
    input.value = '';
  });
  return el('span', {}, button, input);
}

// Commit the right pane to atfedi-content as you. Publishers' pages go
// straight up; anyone else's become a pull request (worker/content/github.js).
//
// No waiting here either. Pressing Send gives you a few seconds to take it
// back (and pictures use them to finish going up); then the Worker answers
// at once and does the commit after, and the result turns up in the note
// below when it's in.
const UNDO_MS = 4000;

// atfedi-content is CC0, so what you send has to be too. Until you've agreed
// once, a small box sits beside Send; the agreement is kept with your account
// when you first send, and the box doesn't come back after that.
function cc0Box(button) {
  if (agreed) return null;
  const box = el('input', { type: 'checkbox' });
  button.disabled = true;
  button.title = s.cc0Needed;
  box.addEventListener('change', () => {
    button.disabled = !box.checked;
    button.title = box.checked ? '' : s.cc0Needed;
  });
  const deed = `https://creativecommons.org/publicdomain/zero/1.0/deed.${uiLang}`;
  return el(
    'label',
    { className: 'cc0' },
    box,
    ' ',
    s.cc0Agree,
    ' ',
    el('a', { href: deed, target: '_blank', rel: 'noopener license', textContent: s.cc0More }),
  );
}

async function agree() {
  if (agreed) return;
  const res = await fetch('/api/cc0', { method: 'POST' });
  if (!res.ok) throw new Error(String(res.status));
  agreed = true;
  local.set('who', { handle: me, cc0: true });
}

function sendButton(doc, lang, repoPath) {
  const button = el('button', { type: 'button', className: 'small', textContent: s.send });
  if (!me) {
    button.disabled = true;
    button.title = s.signInToSave;
    return button;
  }
  const consent = cc0Box(button);
  // what's happening shows here, beside the button you pressed
  const chip = el('span', { className: 'chip', hidden: true, role: 'status' });
  const show = (state, ...children) => {
    chip.hidden = false;
    chip.dataset.state = state;
    chip.replaceChildren(...children);
  };

  const send = () => {
    const text = assemble();
    let undone = false;
    const undo = el('button', { type: 'button', className: 'small ghost', textContent: s.undo });
    undo.addEventListener('click', () => {
      undone = true;
      clearTimeout(timer);
      button.hidden = false;
      chip.hidden = true;
    });
    button.hidden = true;
    // the bar runs out over the undo window
    show('waiting', el('span', { className: 'bar', style: `animation-duration: ${UNDO_MS}ms` }), s.chipWaiting, undo);
    const ready = uploadsSettled(); // starts now, inside the undo window
    ready.catch(() => {});
    const timer = setTimeout(async () => {
      if (undone) return;
      show('sending', s.chipSending);
      try {
        await ready;
        await agree();
        consent?.remove();
        const { id } = await getJson('/api/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ doc, lang, text }),
        });
        // the drafts stay on this device until the page itself says the same
        // (renderPairs drops them then), so a pull request still shows yours
        show('sent', s.chipSent);
        const res = await follow(id);
        if (res?.status === 'published') show('done', s.chipPublished);
        else if (res?.status === 'proposed') show('done', s.chipProposed, ' ', el('a', { href: res.url, target: '_blank', rel: 'noopener', textContent: s.viewPR }));
        else if (res?.status === 'failed') throw new Error('send');
        // still unknown after a minute: leave "sent"
      } catch (e) {
        const again = el('button', { type: 'button', className: 'small ghost', textContent: s.retry });
        again.addEventListener('click', send);
        show('failed', e.message === 'picture' ? s.pictureFailed : s.chipFailed, again);
      } finally {
        button.hidden = false;
        $('repo-path').textContent = s.goesTo(repoPath);
      }
    }, UNDO_MS);
  };
  button.addEventListener('click', send);
  return el('span', { className: 'send' }, ...(consent ? [consent] : []), button, chip);
}

// How the send went, checked quietly until it's settled; null if it never says.
async function follow(id) {
  for (let wait = 1000; wait < 60000; wait *= 1.5) {
    await new Promise((r) => setTimeout(r, wait));
    const res = await getJson(`/api/sends/${id}`).catch(() => null);
    if (res && res.status !== 'sending') return res;
  }
  return null;
}

// Every button answers the moment a finger or the mouse goes down, not when
// the click finishes: the press is drawn at once (style.css, .pressed).
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest?.('button');
  if (!b || b.disabled) return;
  b.classList.add('pressed');
  const up = () => b.classList.remove('pressed');
  b.addEventListener('pointerup', up, { once: true });
  b.addEventListener('pointercancel', up, { once: true });
  b.addEventListener('pointerleave', up, { once: true });
});

// --- start -------------------------------------------------------------------

async function start() {
  // what you saw last, at once; the network catches up behind it
  const setWho = (v) => {
    me = v?.handle || null;
    agreed = !!(me && v.cc0);
  };
  let who;
  [who, docs] = await Promise.all([
    swr('who', () => getJson('/api/me').catch(() => null), (v) => {
      setWho(v);
      renderWho();
      renderPairs();
    }),
    swr('docs', () => getJson('/docs.json').catch(() => null)),
  ]);
  setWho(who);
  docs ??= [];
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

// Once the desk is up and idle, fetch the other pages ahead, so switching
// opens them at once.
function prefetch() {
  const idle = window.requestIdleCallback ?? ((f) => setTimeout(f, 1500));
  idle(async () => {
    for (const d of docs) {
      for (const lang of new Set([$('from').value, $('to').value])) {
        if (!d.title[lang] || local.get(`page:${d.doc}:${lang}`)) continue;
        const text = await getText(`/content/${d.doc}.${lang}.md`);
        if (text != null) local.set(`page:${d.doc}:${lang}`, text);
      }
    }
  });
}

start().then(prefetch);
