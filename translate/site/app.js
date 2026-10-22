// translate.atfedi.de and write.atfedi.de — one desk, two ways in.
//
// translate: two panes side by side, like an editor's split view. The source
// language on the left (read-only), yours on the right, both split into
// paragraphs and kept level row by row. Drafts save as you type (when signed
// in), "Download" puts the right pane back together as a markdown file, and
// "Send" commits it to atfedi-content as you.
//
// write: the same rows in one language. You can put another language beside
// it, read-only, on the left: the Korean you just finished while you write
// the English.
//
// The parts: strings.js (what it says), desk.js (shared ground), editor.js
// (the rows), send.js (download, pictures, CC0, send). This file picks the
// page and the languages and starts it.

import { $, BLOG, WRITE, el, getJson, getText, local, readHash, s, state, swr, uiLang } from './desk.js';
import { LANGS, LANG_NAMES } from './strings.js';
import { renderPairs } from './editor.js';
import { initPicker } from './picker.js';

// --- who's here ------------------------------------------------------------------

function renderWho() {
  const who = $('who');
  who.replaceChildren();
  if (state.me) {
    who.append(`${s.signedIn} ${state.me}`, el('a', { href: '/logout', textContent: s.logout }));
    $('login').hidden = true;
    // the blog's posts have their own page, for the accounts that may edit them
    if (BLOG) who.append(el('a', { href: '/', textContent: '← write' }));
    else if (WRITE && state.blog) who.append(el('a', { href: '/blog/', textContent: 'blog' }));
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
    fillBeside(doc);
  }
}

// write: another language of the page, read-only on the left, shown or hidden
// with the box beside the picker. Both choices are kept on this device. Hidden,
// the page is still split into paragraph rows; only the left column goes.
function fillBeside(doc) {
  const from = $('from').value;
  const have = LANGS.filter((l) => doc.title[l] && l !== from);
  const beside = $('beside');
  const keep = beside.value;
  beside.replaceChildren(...have.map((l) => el('option', { value: l, textContent: LANG_NAMES[l] })));
  const want = [keep, readHash().beside, local.get('beside')].find((l) => have.includes(l));
  beside.value = want ?? have[0] ?? '';
}

// --- start -------------------------------------------------------------------

async function start() {
  // what you saw last, at once; the network catches up behind it
  const setWho = (v) => {
    state.me = v?.handle || null;
    state.agreed = !!(state.me && v.cc0);
    state.blog = !!(state.me && v?.blog);
  };
  let who;
  [who, state.docs] = await Promise.all([
    swr('who', () => getJson('/api/me').catch(() => null), (v) => {
      setWho(v);
      renderWho();
      renderPairs();
    }),
    swr(BLOG ? 'docs:blog' : 'docs', () => getJson(BLOG ? '/docs.json?scope=blog' : '/docs.json').catch(() => null), (v) => {
      state.docs = v;
      document.dispatchEvent(new Event('docs-fresh'));
    }),
  ]);
  setWho(who);
  state.docs ??= [];
  renderWho();

  const hash = readHash();
  const pick = $('doc');
  pick.replaceChildren(
    ...state.docs.map((d) =>
      el('option', { value: d.doc, textContent: d.title[uiLang] ?? Object.values(d.title)[0] }),
    ),
  );
  if (state.docs.some((d) => d.doc === hash.doc)) pick.value = hash.doc;
  fillLangs(state.docs.find((d) => d.doc === pick.value));

  pick.addEventListener('change', () => {
    fillLangs(state.docs.find((d) => d.doc === pick.value));
    renderPairs();
  });
  $('from').addEventListener('change', () => {
    if (WRITE) fillBeside(state.docs.find((d) => d.doc === pick.value));
    renderPairs();
  });
  // opening with a link that names a language shows it; otherwise as last left
  $('beside-on').checked = !!readHash().beside || local.get('beside-on') === true;
  $('beside').addEventListener('change', () => {
    local.set('beside', $('beside').value || null);
    // choosing a language is asking to see it
    $('beside-on').checked = true;
    local.set('beside-on', true);
    renderPairs();
  });
  $('beside-on').addEventListener('change', () => {
    local.set('beside-on', $('beside-on').checked);
    renderPairs();
  });
  $('to').addEventListener('change', renderPairs);
  initPicker();
  await renderPairs();
}

// Once the desk is up and idle, fetch the other pages ahead, so switching
// opens them at once.
function prefetch() {
  const idle = window.requestIdleCallback ?? ((f) => setTimeout(f, 1500));
  idle(async () => {
    for (const d of state.docs) {
      for (const lang of new Set([$('from').value, $('to').value])) {
        if (!d.title[lang] || local.get(`page:${d.doc}:${lang}`)) continue;
        const text = await getText(`/content/${d.doc}.${lang}.md`);
        if (text != null) local.set(`page:${d.doc}:${lang}`, text);
      }
    }
  });
}

start().then(prefetch);
