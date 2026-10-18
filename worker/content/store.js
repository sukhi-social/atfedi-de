// The words, from R2. atfedi-content's deploy mirrors its dist/ into the
// CONTENT bucket: content/<doc>.<lang>.md for every page, and index.json
// listing them ({ docs: [{ doc, title: {lang}, lead: {lang}, files }] }).
// Merging there is the deploy; nothing here needs rebuilding.

export async function contentIndex(env) {
  const obj = await env.CONTENT.get('index.json');
  if (!obj) return { docs: [] };
  return await obj.json();
}

/** The markdown of one page in one language, or null. */
export async function contentFile(env, doc, lang) {
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+){1,3}$/.test(doc) || !/^[a-z]{2}$/.test(lang)) return null;
  const obj = await env.CONTENT.get(`content/${doc}.${lang}.md`);
  return obj ? await obj.text() : null;
}

// Pictures. They are named by the sha256 of their bytes, so a name never
// changes meaning and can be cached forever.
//   media/<sha>.<ext>     published: atfedi-content's media/, mirrored here
//   staging/<sha>.<ext>   uploaded from the desk, not sent yet (a lifecycle
//                         rule on the bucket clears this prefix after 30 days)
export const MEDIA_NAME = /^[0-9a-f]{64}\.(webp|png|jpg|gif)$/;
export const MEDIA_TYPES = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif' };

/** A picture as a response, or null. The desk also sees staged ones. */
export async function serveMedia(env, name, { staging = false } = {}) {
  if (!MEDIA_NAME.test(name)) return null;
  const obj =
    (await env.CONTENT.get(`media/${name}`)) ?? (staging ? await env.CONTENT.get(`staging/${name}`) : null);
  if (!obj) return null;
  return new Response(obj.body, {
    headers: {
      'content-type': MEDIA_TYPES[name.split('.').pop()],
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}

/** Keep an upload until its page is sent; returns its name. */
export async function stageMedia(env, bytes, ext) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const name = `${sha}.${ext}`;
  if (!(await env.CONTENT.head(`media/${name}`)) && !(await env.CONTENT.head(`staging/${name}`))) {
    await env.CONTENT.put(`staging/${name}`, bytes, { httpMetadata: { contentType: MEDIA_TYPES[ext] } });
  }
  return name;
}

/** The staged bytes of a picture a page uses, or null when it is already published (or missing). */
export async function stagedMedia(env, name) {
  if (await env.CONTENT.head(`media/${name}`)) return { published: true };
  const obj = await env.CONTENT.get(`staging/${name}`);
  return obj ? { bytes: await obj.arrayBuffer() } : null;
}
