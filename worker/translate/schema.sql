-- translate.atfedi.de — run once by hand against the remote D1:
--
--   npx wrangler d1 execute atfedi-fedi --remote --file worker/translate/schema.sql
--
-- Sessions are kept apart from console's `sessions` on purpose: anyone on
-- the fediverse can sign in here, and that must never count as a console
-- login.
CREATE TABLE IF NOT EXISTS translate_sessions (
  id      TEXT PRIMARY KEY, -- the cookie value: an unguessable random id
  handle  TEXT NOT NULL,    -- @user@host, lowercased
  expires TEXT NOT NULL     -- ISO timestamp
);

-- One translator's draft of one paragraph. `doc` is the content path without
-- its language (e.g. 'basics/moving'), `idx` the paragraph's position in the
-- source. Each person keeps their own draft; nothing here reaches the site
-- until someone carries it into the repo.
CREATE TABLE IF NOT EXISTS translate_drafts (
  doc        TEXT NOT NULL,
  lang       TEXT NOT NULL,
  idx        INTEGER NOT NULL,
  by_handle  TEXT NOT NULL,
  text       TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (doc, lang, idx, by_handle)
);

-- A page someone pressed "Send" on. The desk answers at once and the commit
-- happens after (ctx.waitUntil), so the writer never waits on GitHub; this
-- row is how the desk finds out how it went: sending → published | proposed
-- (url is the pull request) | failed.
CREATE TABLE IF NOT EXISTS translate_sends (
  id         TEXT PRIMARY KEY,
  by_handle  TEXT NOT NULL,
  doc        TEXT NOT NULL,
  lang       TEXT NOT NULL,
  status     TEXT NOT NULL,
  url        TEXT,
  updated_at TEXT NOT NULL
);

-- The people who agreed that what they send is CC0, as atfedi-content is:
-- asked once, beside the Send button, before their first send.
CREATE TABLE IF NOT EXISTS translate_cc0 (
  handle    TEXT PRIMARY KEY,
  agreed_at TEXT NOT NULL
);
