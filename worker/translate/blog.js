// write.atfedi.de/blog/ — the blog's posts, for the accounts in BLOG_EDITORS.
//
// The posts are pages in atfedi-content (content/posts/<slug>.<lang>.md), so
// the same desk edits and sends them. This only decides who sees them: the
// page list at /blog/ (docs.json?scope=blog) and Send for a post are for
// editors; the ordinary page picker never lists a post, and anyone else gets
// a 404 for the page.

export const isPost = (doc) => typeof doc === 'string' && doc.startsWith('posts/');

export const isBlogEditor = (env, handle) =>
  !!handle &&
  (env.BLOG_EDITORS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .includes(handle.toLowerCase());
