// write.atfedi.de/blog/ — pick one of the blog's posts, edit the file, send it
// as a pull request (worker/translate/blog.js). Only BLOG_EDITORS reach this
// page; the Worker answers 404 to everyone else.
//
// Like the rest of the desk, a keystroke is kept on this device first, so the
// page never waits on the network to let you write.

const T = {
  en: {
    tag: 'blog posts', back: '← pages', post: 'Post', lang: 'Language',
    howto: 'The whole file, front matter and all. Send opens a pull request; the post reaches blog.atfedi.de after you merge it and deploy.',
    send: 'Send', sending: 'Sending…', sent: 'Pull request opened:', failed: 'Could not send. Your words are still here.',
    bad: 'The top of the file needs title, description, date and author between two --- lines.',
    kept: 'Kept on this device, not sent yet.', loading: 'Loading…', gone: 'This post does not exist in that language.',
  },
  ja: {
    tag: 'blog の記事', back: '← ページ', post: '記事', lang: '言語',
    howto: 'ファイルまるごと、先頭の front matter もそのまま直せます。送るとプルリクエストになります。blog.atfedi.de に出るのは、マージしてデプロイしたあとです。',
    send: '送る', sending: '送っています…', sent: 'プルリクエストを開きました:', failed: '送れませんでした。書いたものは、ここに残っています。',
    bad: '先頭の --- と --- のあいだに、title・description・date・author が要ります。',
    kept: 'この端末に残してあります。まだ送っていません。', loading: '読み込み中…', gone: 'この言語の記事はありません。',
  },
  ko: {
    tag: 'blog 글', back: '← 페이지', post: '글', lang: '언어',
    howto: '파일 전체를 앞머리(front matter)까지 그대로 고칠 수 있어요. 보내면 풀 리퀘스트가 열리고, blog.atfedi.de에는 머지하고 배포한 뒤에 나와요.',
    send: '보내기', sending: '보내는 중…', sent: '풀 리퀘스트를 열었어요:', failed: '보내지 못했어요. 쓴 글은 여기 그대로 있어요.',
    bad: '맨 위 --- 두 줄 사이에 title, description, date, author가 있어야 해요.',
    kept: '이 기기에 남겨 두었어요. 아직 보내지 않았어요.', loading: '불러오는 중…', gone: '이 언어로는 이 글이 없어요.',
  },
};
const $ = (id) => document.getElementById(id);
const chosen = (() => {
  try {
    return JSON.parse(localStorage.getItem('desk:ui'));
  } catch {
    return null;
  }
})();
const uiLang = [chosen, ...navigator.languages.map((l) => l.slice(0, 2))].find((l) => T[l]) ?? 'en';
const t = T[uiLang];
document.documentElement.lang = uiLang;
$('tag').textContent = t.tag;
$('back').textContent = t.back;
$('l-post').textContent = t.post;
$('l-lang').textContent = t.lang;
$('howto').textContent = t.howto;
$('send').textContent = t.send;

const LANG_NAMES = { en: 'English', ja: '日本語', ko: '한국어', v: 'English (dev)' };
const draftKey = (dir, slug) => `desk:blog:${dir}/${slug}`;
const keep = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // blocked: the page still works
  }
};
const kept = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

let posts = []; // [{ dir, slug }]
let original = ''; // the text as last fetched, to tell an edit from a rest

const setHash = () => history.replaceState(null, '', `#${new URLSearchParams({ post: $('post').value, lang: $('lang').value })}`);
const current = () => ({ slug: $('post').value, dir: $('lang').value });

function fillLangs() {
  const slug = $('post').value;
  const have = posts.filter((p) => p.slug === slug).map((p) => p.dir);
  const want = new URLSearchParams(location.hash.slice(1)).get('lang');
  const prefer = [$('lang').value, want, uiLang].find((l) => have.includes(l)) ?? have[0];
  $('lang').replaceChildren(...have.map((d) => new Option(LANG_NAMES[d], d)));
  $('lang').value = prefer;
}

async function open() {
  const { slug, dir } = current();
  setHash();
  $('path').textContent = `blog/src/content/posts/${dir}/${slug}.mdoc`;
  $('status').textContent = t.loading;
  $('text').disabled = true;
  $('send').disabled = true;
  const res = await fetch(`/api/blog/post?${new URLSearchParams({ dir, slug })}`);
  if (current().slug !== slug || current().dir !== dir) return; // moved on meanwhile
  if (!res.ok) {
    $('status').textContent = t.gone;
    return;
  }
  original = (await res.json()).text;
  const mine = kept(draftKey(dir, slug));
  $('text').value = mine ?? original;
  $('text').lang = dir === 'v' ? 'en' : dir;
  $('text').disabled = false;
  $('send').disabled = false;
  $('status').textContent = mine != null && mine !== original ? t.kept : '';
}

$('text').addEventListener('input', () => {
  const { slug, dir } = current();
  keep(draftKey(dir, slug), $('text').value === original ? null : $('text').value);
  $('status').textContent = '';
});
$('post').addEventListener('change', () => {
  fillLangs();
  open();
});
$('lang').addEventListener('change', open);

$('send').addEventListener('click', async () => {
  const { slug, dir } = current();
  $('send').disabled = true;
  $('status').textContent = t.sending;
  try {
    const res = await fetch('/api/blog/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dir, slug, text: $('text').value }),
    });
    if (res.status === 400) {
      $('status').textContent = t.bad;
      return;
    }
    if (!res.ok) throw new Error(String(res.status));
    const { url } = await res.json();
    original = $('text').value;
    keep(draftKey(dir, slug), null);
    const a = Object.assign(document.createElement('a'), { href: url, textContent: url, target: '_blank', rel: 'noopener' });
    $('status').replaceChildren(`${t.sent} `, a);
  } catch {
    $('status').textContent = t.failed;
  } finally {
    $('send').disabled = false;
  }
});

(async () => {
  const res = await fetch('/api/blog/posts');
  if (!res.ok) {
    location.replace('/');
    return;
  }
  posts = await res.json();
  const slugs = [...new Set(posts.map((p) => p.slug))].sort();
  const want = new URLSearchParams(location.hash.slice(1)).get('post');
  $('post').replaceChildren(...slugs.map((s) => new Option(s, s)));
  $('post').value = slugs.includes(want) ? want : slugs[0];
  fillLangs();
  open();
})();
