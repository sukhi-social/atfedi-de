// translate.atfedi.de's login — any fediverse account, not just sukhi.
//
// console, yum and dash sign in against sukhi alone and then check an
// allowlist, because what they guard is hard to undo. Translating is the
// opposite: a draft only sits in D1 until someone carries it into the repo,
// so anyone with an account somewhere on the fediverse is welcome.
//
// Two flows cover most servers:
//   - Mastodon-compatible OAuth2 (Mastodon, GoToSocial, Pleroma/Akkoma,
//     Hollo, sukhi, …): we register an app with each server the first time
//     someone from it signs in, and keep it in oauth_app (app_name
//     'translate', base = that server).
//   - MiAuth (Misskey and its forks): no app registration, just a session id
//     the server hands back with a token.
// Which one a server speaks is read from its NodeInfo.
//
// We only need to know *who* someone is. The token is used once, to read the
// account, and is not kept. Sessions live in their own table
// (translate_sessions), so a translate login never opens console's door.

import { getOAuthApp, putOAuthApp } from '../federation/store.js';
import { putSession, getSession, deleteSession } from './store.js';

const APP_NAME = 'translate';
const CLIENT_NAME = 'atfedi.de translate';
const WEBSITE = 'https://translate.atfedi.de';
const REDIRECT_URI = 'https://translate.atfedi.de/callback';
const SCOPE = 'read';
const SESSION_TTL_S = 60 * 60 * 24 * 30; // a month
const STATE_TTL_S = 600;

const MISSKEY_FAMILY = new Set([
  'misskey',
  'sharkey',
  'firefish',
  'iceshrimp',
  'cherrypick',
  'foundkey',
  'catodon',
]);

// --- cookies ---------------------------------------------------------------

function parseCookies(request) {
  const out = {};
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const setCookie = (name, value, maxAge) =>
  `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
const clearCookie = (name) => `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

const text = (body, status) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

// --- the server someone typed ------------------------------------------------

// "mastodon.social", "https://misskey.io/", "@me@example.social" → a bare
// hostname, or null. Only public DNS names: no IP literals, no localhost.
export function normalizeServer(input) {
  let s = String(input ?? '').trim().toLowerCase();
  const at = s.match(/^@?[^@\s]+@([^@\s/]+)$/);
  if (at) s = at[1];
  s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s)) return null;
  if (s === 'localhost' || s.endsWith('.localhost') || s.endsWith('.local')) return null;
  return s;
}

async function fetchJson(url, init) {
  const res = await fetch(url, { ...init, headers: { accept: 'application/json', ...init?.headers } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return await res.json();
}

// NodeInfo → the software's name ('mastodon', 'misskey', …), or null.
async function softwareOf(host) {
  try {
    const index = await fetchJson(`https://${host}/.well-known/nodeinfo`);
    const link = (index.links ?? []).find((l) => /nodeinfo\.diaspora\.software\/ns\/schema\//.test(l.rel));
    if (!link?.href || new URL(link.href).host !== host) return null;
    const info = await fetchJson(link.href);
    return String(info?.software?.name ?? '').toLowerCase() || null;
  } catch {
    return null;
  }
}

// This app's OAuth client on a Mastodon-compatible server, registering on
// first need.
async function getApp(env, host) {
  const base = `https://${host}`;
  const existing = await getOAuthApp(env.FEDI_DB, base, APP_NAME);
  if (existing) return { base, ...existing };
  const app = await fetchJson(new URL('/api/v1/apps', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: CLIENT_NAME,
      redirect_uris: REDIRECT_URI,
      scopes: SCOPE,
      website: WEBSITE,
    }),
  });
  if (!app?.client_id || !app?.client_secret) throw new Error('app registration failed');
  await putOAuthApp(env.FEDI_DB, base, APP_NAME, app.client_id, app.client_secret);
  return { base, client_id: app.client_id, client_secret: app.client_secret };
}

// --- endpoints -----------------------------------------------------------------

// GET /login?server=example.social — send them to their own server.
export async function handleLogin(request, env) {
  const host = normalizeServer(new URL(request.url).searchParams.get('server'));
  if (!host) return text('Please enter the server your account lives on, like mastodon.social.', 400);

  const software = await softwareOf(host);
  const state = crypto.randomUUID();
  let location;
  let flow;

  if (software && MISSKEY_FAMILY.has(software)) {
    flow = 'miauth';
    const auth = new URL(`/miauth/${state}`, `https://${host}`);
    auth.searchParams.set('name', CLIENT_NAME);
    auth.searchParams.set('callback', REDIRECT_URI);
    auth.searchParams.set('permission', 'read:account');
    location = auth.href;
  } else {
    flow = 'oauth';
    let app;
    try {
      app = await getApp(env, host);
    } catch {
      return text(`Couldn't sign in with ${host}. It may not support this kind of login yet.`, 502);
    }
    const auth = new URL('/oauth/authorize', app.base);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('client_id', app.client_id);
    auth.searchParams.set('redirect_uri', REDIRECT_URI);
    auth.searchParams.set('scope', SCOPE);
    auth.searchParams.set('state', state);
    location = auth.href;
  }

  const headers = new Headers({ location });
  headers.append('set-cookie', setCookie('tr_state', `${flow} ${host} ${state}`, STATE_TTL_S));
  return new Response(null, { status: 302, headers });
}

// GET /callback — back from their server, with a code (OAuth) or a session
// (MiAuth). Either way we end up with @username@host.
export async function handleCallback(request, env) {
  const url = new URL(request.url);
  const [flow, host, state] = (parseCookies(request).tr_state ?? '').split(' ');
  if (!flow || !host || !state) return text('Login took too long. Please try again.', 400);

  let username;
  try {
    if (flow === 'miauth') {
      if (url.searchParams.get('session') !== state) throw new Error('state');
      const res = await fetchJson(`https://${host}/api/miauth/${state}/check`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res?.ok) throw new Error('miauth');
      username = res.user?.username;
    } else {
      if (url.searchParams.get('state') !== state) throw new Error('state');
      const code = url.searchParams.get('code');
      if (!code) throw new Error('code');
      const app = await getApp(env, host);
      const tok = await fetchJson(new URL('/oauth/token', app.base), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          client_id: app.client_id,
          client_secret: app.client_secret,
          redirect_uri: REDIRECT_URI,
          scope: SCOPE,
        }),
      });
      const acct = await fetchJson(new URL('/api/v1/accounts/verify_credentials', app.base), {
        headers: { authorization: `Bearer ${tok.access_token}` },
      });
      username = acct?.username;
    }
  } catch {
    return text('Could not complete the login. Please try again.', 502);
  }
  if (!username || !/^[A-Za-z0-9_.-]+$/.test(username)) {
    return text('Could not read the account name.', 502);
  }

  const handle = `@${username}@${host}`.toLowerCase();
  const id = (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', '');
  const expires = new Date(Date.now() + SESSION_TTL_S * 1000).toISOString();
  await putSession(env.FEDI_DB, { id, handle, expires });

  const headers = new Headers({ location: '/' });
  headers.append('set-cookie', clearCookie('tr_state'));
  headers.append('set-cookie', setCookie('tr_session', id, SESSION_TTL_S));
  return new Response(null, { status: 302, headers });
}

// A session cookie → @user@host, or null.
export async function sessionHandle(request, env) {
  const id = parseCookies(request).tr_session;
  if (!id) return null;
  const s = await getSession(env.FEDI_DB, id);
  if (!s) return null;
  if (new Date(s.expires).getTime() < Date.now()) {
    await deleteSession(env.FEDI_DB, id);
    return null;
  }
  return s.handle;
}

// GET /logout
export async function handleLogout(request, env) {
  const id = parseCookies(request).tr_session;
  if (id) await deleteSession(env.FEDI_DB, id);
  const headers = new Headers({ location: '/' });
  headers.append('set-cookie', clearCookie('tr_session'));
  return new Response(null, { status: 302, headers });
}
