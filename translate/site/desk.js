// The desk's shared ground: which desk this is (translate or write), the
// language it speaks, what it holds while it runs, and the little helpers its
// parts all lean on.

import { LANGS, LANG_NAMES, STRINGS } from './strings.js';

export const WRITE = location.hostname.startsWith('write.');

// The desk speaks the language you picked in its corner, if you ever did;
// otherwise the language you're writing in, then the browser's.
const uiChosen = (() => {
  try {
    return JSON.parse(localStorage.getItem('desk:ui'));
  } catch {
    return null;
  }
})();
const uiTarget = new URLSearchParams(location.hash.slice(1)).get(WRITE ? 'from' : 'to');
export const uiLang =
  [uiChosen, uiTarget].find((l) => LANGS.includes(l)) ??
  LANGS.find((l) => navigator.language.toLowerCase().startsWith(l)) ??
  'en';
export const s = STRINGS[uiLang];
document.documentElement.lang = uiLang;
if (WRITE) {
  s.tagline = s.writeTagline;
  s.howto = s.writeHowto;
  s.from = s.lang;
  document.title = 'write — atfedi.de';
  document.querySelector('.title-tag').firstChild.textContent = 'write ';
  document.getElementById('to').closest('label').hidden = true;
  document.getElementById('beside').closest('label').hidden = false;
  // the page in paragraph rows, as in translate, with no source pane
  // unless you put another language beside it
  document.documentElement.classList.add('write');
}
for (const el of document.querySelectorAll('[data-t]')) el.textContent = s[el.dataset.t];
{
  const pick = document.getElementById('ui-lang');
  pick.ariaLabel = s.uiLang;
  for (const l of ['en', 'ja', 'ko']) pick.append(new Option(LANG_NAMES[l], l, false, l === uiLang));
  pick.addEventListener('change', () => {
    try {
      localStorage.setItem('desk:ui', JSON.stringify(pick.value));
    } catch {
      // blocked: this visit still switches
    }
    location.reload();
  });
}

export const $ = (id) => document.getElementById(id);
export const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// --- state -----------------------------------------------------------------

// What the desk holds while it runs, shared by its parts.
export const state = {
  me: null, // the handle you're signed in as
  agreed: false, // CC0 for what this account sends, asked once (/api/cc0)
  docs: [],
  rows: [], // the paragraph rows on screen
};

export async function getJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(String(res.status));
  return await res.json();
}

export async function getText(url) {
  const res = await fetch(url);
  return res.ok ? await res.text() : null;
}

// --- on this device ---------------------------------------------------------
//
// The desk never makes you wait on the Worker. Every keystroke is kept here
// first (localStorage, synchronous), and the server copy follows quietly.
// Pages, the page list and who you are come from here too when you've been
// before, so the desk opens on what you saw last and refreshes behind it.

export const local = {
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
export const draftKey = (doc, lang) => `drafts:${doc}:${lang}`;

// cached first, then the network; onFresh runs when the network says otherwise
export async function swr(key, load, onFresh) {
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

export function readHash() {
  return Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
}

export function writeHash() {
  const p = new URLSearchParams({ doc: $('doc').value, from: $('from').value, to: $('to').value });
  if (WRITE && besideOn()) p.set('beside', $('beside').value);
  history.replaceState(null, '', `#${p}`);
}

// write: whether the left reference column is on (the box beside the picker).
export const besideOn = () => $('beside-on').checked && !!$('beside').value;
