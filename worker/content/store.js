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
