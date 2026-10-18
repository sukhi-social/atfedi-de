// translate.atfedi.de — the source on the left, your language on the right,
// one paragraph per row. Drafts save as you leave each box (when signed in);
// "Download" puts the right column back together as a markdown file.

const LANGS = ['ko', 'ja', 'en'];
const LANG_NAMES = { en: 'English', ja: '日本語', ko: '한국어' };

const STRINGS = {
  en: {
    tagline: 'Translate atfedi.de, one paragraph at a time',
    loginLabel: 'Sign in with your fediverse account — enter the server it lives on',
    loginButton: 'Sign in',
    loginHint: 'Mastodon, Misskey, GoToSocial, and most others work. We only read your account name.',
    doc: 'Page', from: 'From', to: 'Into',
    howto: "Rows line up by paragraph, but they don't have to match word for word. Write it the way your language would say it.",
    download: 'Download the translation',
    goesTo: (p) => `It goes to ${p} in the repository.`,
    signedIn: 'Signed in as', logout: 'Sign out',
    mine: 'your draft', live: 'on the site now', saving: 'saving…', saved: 'saved',
    notSaved: "couldn't save", extra: '(no matching paragraph in the source)',
    signInToSave: 'Sign in to keep drafts. You can still download what you write.',
  },
  ja: {
    tagline: 'atfedi.de を、一段落ずつ訳す',
    loginLabel: 'フェディバースのアカウントでログイン。アカウントのあるサーバーを入れてください',
    loginButton: 'ログイン',
    loginHint: 'Mastodon、Misskey、GoToSocial など、たいていのサーバーで使えます。読むのはアカウント名だけ。',
    doc: 'ページ', from: '原文', to: '訳す先',
    howto: '段落ごとに並べていますが、一語ずつ合わせなくて大丈夫。その言語らしい言い方で。',
    download: '訳をダウンロード',
    goesTo: (p) => `リポジトリの ${p} に置くものです。`,
    signedIn: 'ログイン中', logout: 'ログアウト',
    mine: 'わたしの下書き', live: 'いまのサイト', saving: '保存中…', saved: '保存しました',
    notSaved: '保存できませんでした', extra: '(原文に対応する段落なし)',
    signInToSave: 'ログインすると下書きが残ります。ダウンロードはログインなしでもできます。',
  },
  ko: {
    tagline: 'atfedi.de를 문단 하나씩 번역해요',
    loginLabel: '페디버스 계정으로 로그인해요. 계정이 있는 서버를 적어 주세요',
    loginButton: '로그인',
    loginHint: '마스토돈, Misskey, GoToSocial 등 대부분의 서버에서 돼요. 읽는 건 계정 이름뿐이에요.',
    doc: '페이지', from: '원문', to: '옮길 언어',
    howto: '문단별로 나란히 놓았지만, 한 단어씩 맞출 필요는 없어요. 그 언어다운 말투로 써 주세요.',
    download: '번역 내려받기',
    goesTo: (p) => `저장소의 ${p}에 들어갈 파일이에요.`,
    signedIn: '로그인:', logout: '로그아웃',
    mine: '내 초안', live: '지금 사이트', saving: '저장 중…', saved: '저장했어요',
    notSaved: '저장하지 못했어요', extra: '(원문에 맞는 문단이 없어요)',
    signInToSave: '로그인하면 초안이 남아요. 내려받기는 로그인 없이도 돼요.',
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

// --- paragraphs --------------------------------------------------------------

// Split markdown into paragraphs at blank lines, keeping fenced blocks
// (``` code, ::: cards) whole even when they contain blank lines.
export function paragraphs(markdown) {
  const blocks = [];
  let current = [];
  let fence = null;
  const flush = () => {
    if (current.length) blocks.push(current.join('\n'));
    current = [];
  };
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const open = line.match(/^(```|:::)/);
    if (fence) {
      current.push(line);
      if (line.trim() === fence) {
        fence = null;
        flush();
      }
    } else if (open) {
      flush();
      fence = open[1];
      current.push(line);
    } else if (line.trim() === '') {
      flush();
    } else {
      current.push(line);
    }
  }
  flush();
  return blocks;
}

const isCode = (block) => /^(```|:::)/.test(block);

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

// --- the rows ----------------------------------------------------------------

let saveTimers = new Map();

async function saveDraft(doc, lang, idx, text, mark) {
  if (!me) return;
  mark.textContent = s.saving;
  mark.className = 'mark';
  try {
    await getJson('/api/drafts', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ doc, lang, idx, text }),
    });
    mark.textContent = text.trim() ? s.saved : '';
    mark.className = 'mark saved';
  } catch {
    mark.textContent = s.notSaved;
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
    me ? getJson(`/api/drafts?doc=${encodeURIComponent(doc.doc)}&lang=${to}`).then((r) => r.drafts).catch(() => ({})) : {},
  ]);
  const left = paragraphs(source ?? '');
  const right = paragraphs(target ?? '');
  const rows = Math.max(left.length, right.length);

  const list = $('pairs');
  list.replaceChildren();
  for (let idx = 0; idx < rows; idx++) {
    const src = left[idx];
    const draft = drafts[idx];
    const live = right[idx];
    const mark = el('span', {
      className: 'mark',
      textContent: draft != null ? s.mine : live != null ? s.live : '',
    });
    const box = el('textarea', { value: draft ?? live ?? '', lang: to });
    box.rows = Math.min(14, Math.max(3, Math.ceil((src ?? live ?? '').length / 60)));
    box.addEventListener('input', () => {
      clearTimeout(saveTimers.get(idx));
      saveTimers.set(idx, setTimeout(() => saveDraft(doc.doc, to, idx, box.value, mark), 1200));
    });
    box.addEventListener('blur', () => {
      clearTimeout(saveTimers.get(idx));
      saveDraft(doc.doc, to, idx, box.value, mark);
    });
    list.append(
      el(
        'li',
        { className: 'pair' },
        el('pre', {
          className: src != null && isCode(src) ? 'source code' : 'source',
          textContent: src ?? s.extra,
          lang: from,
        }),
        el('div', { className: 'target' }, box, mark),
      ),
    );
  }

  const repoPath = doc.repoPath[to] ?? doc.repoPath[from].replace(`.${from}.md`, `.${to}.md`);
  $('repo-path').textContent = `${s.goesTo(repoPath)}${me ? '' : ` ${s.signInToSave}`}`;
}

function download() {
  const doc = $('doc').value;
  const to = $('to').value;
  const text =
    [...document.querySelectorAll('.target textarea')]
      .map((t) => t.value.trim())
      .filter(Boolean)
      .join('\n\n') + '\n';
  const a = el('a', {
    href: URL.createObjectURL(new Blob([text], { type: 'text/markdown' })),
    download: `${doc.split('/').pop()}.${to}.md`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
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
  $('download').addEventListener('click', download);
  await renderPairs();
}

start();
