// The page picker: a button where the page <select> was, and under it a panel
// to find a page by kind, by state or by what it says. Everything it shows
// comes from what the desk already holds (state.docs, cached on this device),
// so it opens and filters without waiting for the Worker.
//
// The hidden <select id="doc"> stays the one place the chosen page lives;
// choosing here sets it and fires its change event, as picking from it did.

import { $, WRITE, el, local, s, state, uiLang } from './desk.js';
import { LANGS, LANG_NAMES } from './strings.js';

const p = s.picker;
const KIND_ORDER = ['basics', 'site', 'tool'];
const LANG_SHORT = { ja: '日', ko: '한', en: 'En' };

// what a page is: the section its path starts with
const kindOf = (doc) => (doc.startsWith('basics/') ? 'basics' : doc.startsWith('tool-pages/') ? 'tool' : 'site');

// a page's worst state across its languages: waiting on a person, changed
// since a person sent it, or published as it is
function stateOf(d) {
  // a page list cached before the Worker sent states has none: say so, rather
  // than call everything published
  if (!d.files) return 'unknown';
  const have = Object.values(d.files ?? {}).map((f) => f.state);
  return have.includes('ai') ? 'needs' : have.includes('chg') ? 'changed' : 'published';
}

const updatedOf = (d) => Object.values(d.files ?? {}).reduce((t, f) => Math.max(t, Date.parse(f.updated) || 0), 0);

// pages and languages with a rewrite kept on this device, not sent yet
function deviceDrafts() {
  const found = new Map();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const m = localStorage.key(i).match(/^desk:drafts:(.+):([a-z]{2})$/);
      if (!m) continue;
      const v = JSON.parse(localStorage.getItem(localStorage.key(i)));
      if (v && Object.keys(v).length) found.set(m[1], [...(found.get(m[1]) ?? []), m[2]]);
    }
  } catch {
    // blocked: no device drafts to show
  }
  return found;
}

const rtf = new Intl.RelativeTimeFormat(uiLang, { numeric: 'auto' });
function ago(ms) {
  if (!ms) return '';
  const min = Math.round((ms - Date.now()) / 60000);
  const steps = [[60, 'minute'], [24, 'hour'], [30, 'day'], [12, 'month']];
  let n = min;
  for (const [per, unit] of steps) {
    if (Math.abs(n) < per) return rtf.format(n, unit);
    n = Math.round(n / per);
  }
  return rtf.format(n, 'year');
}

const dot = (state) => el('i', { className: `dot ${state ?? 'none'}`, textContent: state ? '' : '–' });

function langDots(d, onPick) {
  const wrap = el('span', { className: 'langs' });
  for (const l of ['ja', 'ko', 'en']) {
    const f = d.files?.[l];
    if (!d.files) break;
    const b = el('button', { type: 'button', className: 'l', title: LANG_NAMES[l] }, dot(f?.state), LANG_SHORT[l]);
    b.disabled = !f;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onPick(d, l);
    });
    wrap.append(b);
  }
  return wrap;
}

export function initPicker() {
  const select = $('doc');
  const button = $('page-btn');
  const panel = $('page-panel');
  const ui = { kind: 'all', state: 'all', query: '', index: 0, open: false, shown: [] };

  const titleOf = (d) => d.title[uiLang] ?? Object.values(d.title)[0];
  const showTitle = () => {
    const d = state.docs.find((x) => x.doc === select.value);
    button.replaceChildren(el('span', { className: 'cur', textContent: d ? titleOf(d) : '' }), el('kbd', { textContent: '/' }));
  };
  showTitle();

  // the page list refreshed behind the cached one: show the new states
  document.addEventListener('docs-fresh', () => {
    showTitle();
    if (ui.open) render();
  });

  const choose = (d, lang) => {
    close();
    const changed = select.value !== d.doc;
    select.value = d.doc;
    if (changed) select.dispatchEvent(new Event('change'));
    if (lang) {
      const target = WRITE || $('from').value === lang ? $('from') : $('to');
      if (target.value !== lang && [...target.options].some((o) => o.value === lang)) {
        target.value = lang;
        target.dispatchEvent(new Event('change'));
      }
    }
    showTitle();
  };

  function matches(d, drafts) {
    if (ui.kind !== 'all' && kindOf(d.doc) !== ui.kind) return false;
    if (ui.state !== 'all' && stateOf(d) !== ui.state) return false;
    const q = ui.query.trim().toLowerCase();
    if (!q) return true;
    const hay = [d.doc, ...Object.values(d.title), ...Object.values(d.lead ?? {})].join('\n').toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  }

  function row(d, drafts, index) {
    const kind = kindOf(d.doc);
    const lang = drafts.get(d.doc);
    const sub = el('div', { className: 'sub' }, el('span', { className: `ptag c-${kind}`, textContent: p[kind][0] }), `${d.doc}`);
    const when = ago(updatedOf(d));
    if (when) sub.append(` · ${when}`);
    if (lang) sub.append(' · ', el('span', { className: 'local', textContent: p.localDraft(lang.map((l) => LANG_NAMES[l]).join(', ')) }));
    const title = el('div', { className: 't', textContent: titleOf(d) });
    const r = el('div', { className: `row${d.doc === select.value ? ' sel' : ''}${index === ui.index ? ' cur' : ''}`, role: 'option' }, title, sub, langDots(d, choose));
    if (d.doc === select.value) title.dataset.open = p.open;
    r.addEventListener('click', () => choose(d));
    r.addEventListener('pointermove', () => {
      if (ui.index !== index) {
        ui.index = index;
        panel.querySelector('.row.cur')?.classList.remove('cur');
        r.classList.add('cur');
      }
    });
    return r;
  }

  function counts() {
    const n = { all: state.docs.length, basics: 0, site: 0, tool: 0 };
    for (const d of state.docs) n[kindOf(d.doc)]++;
    return n;
  }

  function render() {
    const drafts = deviceDrafts();
    const n = counts();
    const keepFocus = panel.contains(document.activeElement) && document.activeElement.matches('input');
    const cats = el('div', { className: 'cats', role: 'tablist', ariaLabel: p.kinds }, el('h4', { textContent: p.kinds }));
    for (const k of ['all', ...KIND_ORDER]) {
      const on = ui.kind === k;
      const label = k === 'all' ? p.all : p[k][0];
      const a = el(
        'button',
        { type: 'button', className: `cat${on ? ' on' : ''}`, role: 'tab', ariaSelected: String(on) },
        el('span', { className: 'n' }, el('span', {}, ...(k === 'all' ? [] : [el('i', { className: `c-${k}` })]), label), el('b', { textContent: String(n[k]) })),
        ...(k === 'all' ? [] : [el('span', { className: 'd', textContent: p[k][1] })]),
      );
      a.addEventListener('click', () => {
        ui.kind = k;
        ui.index = 0;
        render();
      });
      cats.append(a);
    }

    const search = el('div', { className: 'search' }, el('input', { value: ui.query, placeholder: p.search, ariaLabel: p.search, autocomplete: 'off' }));
    search.firstChild.addEventListener('input', (e) => {
      ui.query = e.target.value;
      ui.index = 0;
      renderList();
    });

    const chips = el('div', { className: 'stateline' }, `${p.stateLabel}:`);
    for (const [k, label] of [['all', p.all], ['needs', p.needs], ['changed', p.changed], ['published', p.published]]) {
      const c = el('button', { type: 'button', className: `pchip${ui.state === k ? ' on' : ''}`, textContent: label });
      c.addEventListener('click', () => {
        ui.state = k;
        ui.index = 0;
        render();
      });
      chips.append(c);
    }

    const list = el('div', { className: 'list', role: 'listbox' });
    const foot = el(
      'div',
      { className: 'foot' },
      el('span', { className: 'legend' }, ...['pub', 'chg', 'ai', 'none'].map((st, i) => el('span', { className: 'l' }, dot(st === 'none' ? null : st), p.legend[i]))),
      el('span', { className: 'keys', textContent: '↑↓ Enter Esc' }),
    );
    panel.replaceChildren(cats, search, chips, list, foot);
    renderList();
    if (keepFocus || ui.open) search.firstChild.focus();
  }

  function renderList() {
    const drafts = deviceDrafts();
    const list = panel.querySelector('.list');
    const found = state.docs.filter((d) => matches(d, drafts));
    const byRecent = (a, b) => updatedOf(b) - updatedOf(a) || titleOf(a).localeCompare(titleOf(b));
    const groups = [];
    if (ui.query.trim()) {
      const q = ui.query.trim().toLowerCase();
      const starts = (d) => (titleOf(d).toLowerCase().includes(q) ? 0 : 1);
      groups.push([null, found.slice().sort((a, b) => starts(a) - starts(b) || byRecent(a, b))]);
    } else {
      const mine = found.filter((d) => drafts.has(d.doc)).sort(byRecent);
      groups.push([p.onDevice, mine]);
      const rest = found.filter((d) => !drafts.has(d.doc));
      for (const [st, label] of [['needs', p.groupNeeds], ['changed', p.groupChanged], ['published', p.groupPublished], ['unknown', p.checking]]) {
        groups.push([label, rest.filter((d) => stateOf(d) === st).sort(byRecent)]);
      }
    }
    ui.shown = [];
    list.replaceChildren();
    for (const [label, docs] of groups) {
      if (!docs.length) continue;
      if (label) list.append(el('div', { className: 'group', textContent: label }));
      for (const d of docs) {
        list.append(row(d, drafts, ui.shown.length));
        ui.shown.push(d);
      }
    }
    if (!ui.shown.length) list.append(el('div', { className: 'empty', textContent: p.none }));
  }

  function openPanel() {
    ui.open = true;
    ui.index = 0;
    ui.query = '';
    panel.hidden = false;
    button.ariaExpanded = 'true';
    render();
    panel.querySelector('.search input')?.focus();
    ui.open = true;
  }

  function close() {
    if (!ui.open) return;
    ui.open = false;
    panel.hidden = true;
    button.ariaExpanded = 'false';
    button.focus({ preventScroll: true });
  }

  const move = (by) => {
    if (!ui.shown.length) return;
    ui.index = (ui.index + by + ui.shown.length) % ui.shown.length;
    panel.querySelector('.row.cur')?.classList.remove('cur');
    const r = panel.querySelectorAll('.row')[ui.index];
    r?.classList.add('cur');
    r?.scrollIntoView({ block: 'nearest' });
  };

  button.addEventListener('click', () => (ui.open ? close() : openPanel()));
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') (e.preventDefault(), move(1));
    else if (e.key === 'ArrowUp') (e.preventDefault(), move(-1));
    else if (e.key === 'Enter' && e.target.matches('input') && ui.shown[ui.index]) (e.preventDefault(), choose(ui.shown[ui.index]));
  });
  document.addEventListener('pointerdown', (e) => {
    if (ui.open && !panel.contains(e.target) && !button.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || ui.open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    openPanel();
  });
}
