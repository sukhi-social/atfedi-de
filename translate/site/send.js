// Getting your words out of the desk: downloading the page, pictures, the
// one-time CC0 agreement and sending to atfedi-content. The same for translate
// and write.

import { $, el, getJson, local, s, state, uiLang } from './desk.js';

export const repoPathOf = (doc, from, to) =>
  doc.repoPath[to] ?? doc.repoPath[from].replace(`.${from}.md`, `.${to}.md`);

// The right pane, put back together as one markdown file.
const assemble = () =>
  state.rows
    .map((r) => r.box.value.trim())
    .filter(Boolean)
    .join('\n\n') + '\n';

export function downloadButton(lang) {
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

export async function addPicture(file, row) {
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

export function pictureButton() {
  const input = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true, hidden: true });
  const button = el('button', { type: 'button', className: 'small ghost', textContent: s.picture });
  let target = null;
  if (!state.me) {
    button.disabled = true;
    button.title = s.signInToSave;
  }
  // remember the paragraph you were in; the click takes focus away from it
  button.addEventListener('mousedown', () => {
    target = state.rows.find((r) => r.el.classList.contains('active')) ?? state.rows.at(-1);
  });
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const row = target ?? state.rows.at(-1);
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
  if (state.agreed) return null;
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
  if (state.agreed) return;
  const res = await fetch('/api/cc0', { method: 'POST' });
  if (!res.ok) throw new Error(String(res.status));
  state.agreed = true;
  local.set('who', { handle: state.me, cc0: true });
}

export function sendButton(doc, lang, repoPath) {
  const button = el('button', { type: 'button', className: 'small', textContent: s.send });
  if (!state.me) {
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
