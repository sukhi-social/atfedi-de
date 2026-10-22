// Sending a page back to atfedi-content, as a commit by the person who wrote
// it. The desk (translate.atfedi.de, write.atfedi.de) calls this when someone
// presses "Send".
//
//   Author      the person, as @user@server
//   Committer   atfedi.de write (the Worker, through CONTENT_GITHUB_TOKEN)
//   Assisted-by the AI that last wrote this file, if it was one
//
// A file Claude drafted carries "Assisted-by: Claude" on its first human
// rewrite. After that the last author is a person, so the trailer stops: the
// page is theirs. The site's credits line is built from this history
// (atfedi-content scripts/build.mjs).
//
// Pictures the page uses go in the same commit, under media/.
//
// People on WRITE_PUBLISHERS commit to main, which deploys. Everyone else gets
// a branch and a pull request, and is published once someone merges it.

const API = 'https://api.github.com';

// Commit emails that mean "an AI wrote this", and the name it goes by.
const AI_AUTHORS = { 'noreply@anthropic.com': 'Claude' };

export async function gh(env, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.CONTENT_GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'atfedi.de write',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`github ${method} ${path}: ${res.status}`);
  return await res.json();
}

// @kuro_admin@sukhi.f3liz.casa → a git identity. The address is under
// atfedi.de (no mailbox), so GitHub never ties it to someone else's account.
export function gitIdentity(handle) {
  const [, user, host] = handle.split('@');
  return { name: handle, email: `${user}@${host}.users.atfedi.de` };
}

const publishers = (env) =>
  new Set(
    (env.WRITE_PUBLISHERS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );

export const b64 = (data) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

// The pictures a page points at: ![…](/media/<sha>.<ext>)
const mediaIn = (text) => [...new Set([...text.matchAll(/\/media\/([0-9a-f]{64}\.(?:webp|png|jpg|gif))/g)].map((m) => m[1]))];

/**
 * Commit one page, and any pictures it uses that aren't published yet, as a
 * single commit. Returns { published, url }: published is true when it went
 * to main, otherwise url is the pull request.
 *
 * `staged(name)` gives a picture's bytes from the desk's uploads
 * ({ bytes } | { published: true } | null).
 */
export async function sendPage(env, { handle, path, text, doc, lang, staged }) {
  const repo = env.CONTENT_REPO ?? 'sukhi-social/atfedi-content';
  const main = env.CONTENT_BRANCH ?? 'main';
  const enc = encodeURIComponent;

  const pictures = [];
  for (const name of mediaIn(text)) {
    const got = await staged(name);
    if (!got) throw Object.assign(new Error(`missing picture ${name}`), { status: 400 });
    if (got.bytes) pictures.push({ path: `media/${name}`, bytes: got.bytes });
  }

  const [head, current, history] = await Promise.all([
    gh(env, 'GET', `/repos/${repo}/git/ref/heads/${enc(main)}`),
    gh(env, 'GET', `/repos/${repo}/contents/${path}?ref=${enc(main)}`),
    gh(env, 'GET', `/repos/${repo}/commits?path=${enc(path)}&sha=${enc(main)}&per_page=1`),
  ]);
  const ai = AI_AUTHORS[history?.[0]?.commit?.author?.email ?? ''];
  const verb = current ? 'Rewrite' : 'Add';
  const message = `${verb} ${doc} (${lang})${ai ? `\n\nAssisted-by: ${ai}` : ''}`;

  // blobs → a tree on top of main → one commit
  const files = [{ path, bytes: text }, ...pictures];
  const blobs = await Promise.all(
    files.map((f) => gh(env, 'POST', `/repos/${repo}/git/blobs`, { content: b64(f.bytes), encoding: 'base64' })),
  );
  const base = await gh(env, 'GET', `/repos/${repo}/git/commits/${head.object.sha}`);
  const tree = await gh(env, 'POST', `/repos/${repo}/git/trees`, {
    base_tree: base.tree.sha,
    tree: files.map((f, i) => ({ path: f.path, mode: '100644', type: 'blob', sha: blobs[i].sha })),
  });
  const now = new Date().toISOString();
  const commit = await gh(env, 'POST', `/repos/${repo}/git/commits`, {
    message,
    tree: tree.sha,
    parents: [head.object.sha],
    author: { ...gitIdentity(handle), date: now },
    committer: { name: 'atfedi.de write', email: 'write@atfedi.de', date: now },
  });

  if (publishers(env).has(handle.toLowerCase())) {
    // not forced: if main moved meanwhile this fails, and they can send again
    await gh(env, 'PATCH', `/repos/${repo}/git/refs/heads/${enc(main)}`, { sha: commit.sha });
    return { published: true, url: null };
  }
  const slug = handle.replace(/^@/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const branch = `write/${slug}/${doc.replaceAll('/', '-')}-${lang}-${Date.now().toString(36)}`;
  await gh(env, 'POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
  const pr = await gh(env, 'POST', `/repos/${repo}/pulls`, {
    title: `${verb} ${doc} (${lang})`,
    head: branch,
    base: main,
    body: `Sent from the atfedi.de desk by ${handle}.${ai ? `\n\nThe file was last written by ${ai}, so the commit carries \`Assisted-by: ${ai}\`.` : ''}`,
  });
  return { published: false, url: pr.html_url };
}
