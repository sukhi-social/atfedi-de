// D1 access for translate.atfedi.de (tables: worker/translate/schema.sql).

export async function putSession(db, s) {
  await db
    .prepare('INSERT INTO translate_sessions (id, handle, expires) VALUES (?, ?, ?)')
    .bind(s.id, s.handle, s.expires)
    .run();
}

export async function getSession(db, id) {
  return await db
    .prepare('SELECT id, handle, expires FROM translate_sessions WHERE id = ?')
    .bind(id)
    .first();
}

export async function deleteSession(db, id) {
  await db.prepare('DELETE FROM translate_sessions WHERE id = ?').bind(id).run();
}

/** One person's drafts for a document in one language: { idx: text }. */
export async function listDrafts(db, doc, lang, handle) {
  const { results } = await db
    .prepare('SELECT idx, text FROM translate_drafts WHERE doc = ? AND lang = ? AND by_handle = ?')
    .bind(doc, lang, handle)
    .all();
  return Object.fromEntries((results ?? []).map((r) => [r.idx, r.text]));
}

/** Save (or, with empty text, clear) one paragraph's draft. */
export async function putDraft(db, d) {
  if (d.text === '') {
    await db
      .prepare('DELETE FROM translate_drafts WHERE doc = ? AND lang = ? AND idx = ? AND by_handle = ?')
      .bind(d.doc, d.lang, d.idx, d.handle)
      .run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO translate_drafts (doc, lang, idx, by_handle, text, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(doc, lang, idx, by_handle) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
    )
    .bind(d.doc, d.lang, d.idx, d.handle, d.text, new Date().toISOString())
    .run();
}

/** Clear one person's drafts for a document once it has been sent. */
export async function clearDrafts(db, doc, lang, handle) {
  await db
    .prepare('DELETE FROM translate_drafts WHERE doc = ? AND lang = ? AND by_handle = ?')
    .bind(doc, lang, handle)
    .run();
}

/** Note a send, or how it went. */
export async function putSend(db, s) {
  await db
    .prepare(
      `INSERT INTO translate_sends (id, by_handle, doc, lang, status, url, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, url = excluded.url, updated_at = excluded.updated_at`,
    )
    .bind(s.id, s.handle, s.doc, s.lang, s.status, s.url ?? null, new Date().toISOString())
    .run();
}

export async function getSend(db, id, handle) {
  return await db
    .prepare('SELECT status, url FROM translate_sends WHERE id = ? AND by_handle = ?')
    .bind(id, handle)
    .first();
}
