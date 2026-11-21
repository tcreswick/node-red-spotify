'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';
const PENDING_TTL = 10 * 60 * 1000;

const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = function (RED) {
  const pending = new Map(); // state -> {id, clientId, clientSecret, redirectUri, verifier, created}
  let tokenFile = null;
  let tokenCache = null;

  function getTokenFile() {
    if (!tokenFile) tokenFile = path.join(RED.settings.userDir || process.cwd(), 'spotify-web-api-tokens.json');
    return tokenFile;
  }
  function loadTokens() {
    if (tokenCache) return tokenCache;
    try { tokenCache = JSON.parse(fs.readFileSync(getTokenFile(), 'utf8')); } catch (e) { tokenCache = {}; }
    return tokenCache;
  }
  function saveTokens() {
    const tmp = getTokenFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(tokenCache, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, getTokenFile());
  }
  function getTokenEntry(id) { return loadTokens()[id]; }
  function setTokenEntry(id, entry) { loadTokens(); tokenCache[id] = entry; saveTokens(); }
  function deleteTokenEntry(id) { loadTokens(); delete tokenCache[id]; saveTokens(); }

  async function tokenRequest(params, clientId, clientSecret) {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const body = new URLSearchParams(params);
    if (clientSecret) headers.Authorization = 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64');
    else body.set('client_id', clientId);
    const res = await fetch(TOKEN_URL, { method: 'POST', headers, body });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch (e) { json = {}; }
    if (!res.ok) {
      const err = new Error('Spotify token error: ' + (json.error_description || json.error || res.status));
      err.statusCode = res.status; throw err;
    }
    return json;
  }

  function gc() {
    const now = Date.now();
    for (const [k, v] of pending) if (now - v.created > PENDING_TTL) pending.delete(k);
  }

  // ---- Admin endpoints (editor) ----
  RED.httpAdmin.post('/spotify-web-api/auth', RED.auth.needsPermission('spotify-config.write'), (req, res) => {
    gc();
    const b = req.body || {};
    const id = b.id;
    if (!id) return res.status(400).json({ error: 'missing id' });
    const stored = RED.nodes.getCredentials(id) || {};
    const clientId = b.clientId || stored.clientId;
    const clientSecret = b.clientSecret || stored.clientSecret || '';
    if (!clientId) return res.status(400).json({ error: 'Client ID is required' });
    if (!b.redirectUri) return res.status(400).json({ error: 'Redirect URI is required' });
    const state = b64url(crypto.randomBytes(16));
    const verifier = b64url(crypto.randomBytes(48));
    pending.set(state, { id, clientId, clientSecret, redirectUri: b.redirectUri, verifier, created: Date.now() });
    const url = AUTH_URL + '?' + new URLSearchParams({
      response_type: 'code', client_id: clientId, redirect_uri: b.redirectUri, state,
      scope: (b.scope || '').trim(), show_dialog: 'true',
      code_challenge_method: 'S256', code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest())
    });
    res.json({ url });
  });

  RED.httpAdmin.get('/spotify-web-api/status', RED.auth.needsPermission('spotify-config.read'), (req, res) => {
    const e = getTokenEntry(req.query.id);
    res.json(e ? { authorized: true, user: e.user || null, scope: e.scope || '' } : { authorized: false });
  });

  RED.httpAdmin.post('/spotify-web-api/revoke', RED.auth.needsPermission('spotify-config.write'), (req, res) => {
    deleteTokenEntry((req.body || {}).id);
    res.json({ ok: true });
  });

  RED.httpAdmin.get('/spotify-web-api/operations', RED.auth.needsPermission('spotify-api.read'), (req, res) => {
    res.json(require('./operations').operations);
  });

  // Unauthenticated: Spotify redirects the browser here. Protected by the one-time `state`.
  RED.httpAdmin.get('/spotify-web-api/callback', async (req, res) => {
    const page = (ok, msg) => res.status(ok ? 200 : 400).send(
      '<!doctype html><meta charset="utf-8"><title>Spotify</title><body style="font-family:sans-serif;text-align:center;margin-top:3em">' +
      '<h2>' + (ok ? 'Spotify authorised ✔' : 'Authorisation failed') + '</h2><p>' +
      String(msg).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) +
      '</p><p>You can close this window.</p><script>try{window.opener&&window.opener.postMessage({spotifyAuth:' + (ok ? 'true' : 'false') +
      '},"*")}catch(e){}' + (ok ? 'setTimeout(function(){window.close()},1500)' : '') + '</script></body>');
    const { state, code, error } = req.query;
    const p = pending.get(state);
    if (!p) return page(false, 'Unknown or expired state. Start the authorisation again.');
    pending.delete(state);
    if (error) return page(false, error);
    if (!code) return page(false, 'No code returned');
    try {
      const t = await tokenRequest({
        grant_type: 'authorization_code', code, redirect_uri: p.redirectUri, code_verifier: p.verifier
      }, p.clientId, p.clientSecret);
      const entry = {
        accessToken: t.access_token, refreshToken: t.refresh_token,
        expiresAt: Date.now() + (t.expires_in || 3600) * 1000, scope: t.scope || ''
      };
      try {
        const me = await fetch(API_BASE + '/me', { headers: { Authorization: 'Bearer ' + t.access_token } });
        if (me.ok) { const j = await me.json(); entry.user = j.display_name || j.id; entry.userId = j.id; }
      } catch (e) { /* non-fatal */ }
      setTokenEntry(p.id, entry);
      RED.events.emit('spotify-web-api:authorized', p.id);
      page(true, entry.user ? 'Logged in as ' + entry.user : 'Done');
    } catch (e) {
      page(false, e.message);
    }
  });

  // ---- Config node ----
  function SpotifyConfigNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.name = config.name;
    node.maxRetries = Math.max(0, parseInt(config.maxRetries, 10) || 3);
    let refreshing = null;

    const onAuth = id => { if (id === node.id) node.emit('authorized'); };
    RED.events.on('spotify-web-api:authorized', onAuth);
    node.on('close', () => RED.events.removeListener('spotify-web-api:authorized', onAuth));

    node.isAuthorized = () => !!getTokenEntry(node.id);
    node.getUserId = () => (getTokenEntry(node.id) || {}).userId;

    async function refresh() {
      const e = getTokenEntry(node.id);
      if (!e || !e.refreshToken) throw new Error('Not authorised: open the Spotify config node and click "Authorise"');
      const c = node.credentials || {};
      const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: e.refreshToken }, c.clientId, c.clientSecret);
      const n = Object.assign({}, e, {
        accessToken: t.access_token, refreshToken: t.refresh_token || e.refreshToken,
        expiresAt: Date.now() + (t.expires_in || 3600) * 1000, scope: t.scope || e.scope
      });
      setTokenEntry(node.id, n);
      return n;
    }

    node.getAccessToken = async function (force) {
      const e = getTokenEntry(node.id);
      if (!e) throw new Error('Not authorised: open the Spotify config node and click "Authorise"');
      if (!force && e.accessToken && e.expiresAt - Date.now() > 60000) return e.accessToken;
      if (!refreshing) refreshing = refresh().finally(() => { refreshing = null; });
      return (await refreshing).accessToken;
    };

    // Returns {status, headers, body}. Throws on HTTP errors (err.statusCode, err.body).
    node.request = async function (method, apiPath, query, body, contentType) {
      const url = new URL(apiPath.startsWith('http') ? apiPath : API_BASE + apiPath);
      for (const [k, v] of Object.entries(query || {})) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
      }
      let forced = false;
      for (let attempt = 0; ; attempt++) {
        const token = await node.getAccessToken(forced);
        const headers = { Authorization: 'Bearer ' + token };
        let payload;
        if (body !== undefined) {
          if (contentType) { headers['Content-Type'] = contentType; payload = body; }
          else { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
        }
        const res = await fetch(url, { method, headers, body: payload });
        if (res.status === 401 && !forced) { forced = true; continue; }
        if (res.status === 429 && attempt < node.maxRetries) {
          const wait = Math.min(60, parseInt(res.headers.get('retry-after'), 10) || 1);
          await sleep(wait * 1000 + 100); continue;
        }
        if (res.status >= 500 && attempt < node.maxRetries) { await sleep(500 * (attempt + 1)); continue; }
        const text = await res.text();
        let data = text;
        try { data = text ? JSON.parse(text) : null; } catch (e) { /* keep text */ }
        if (!res.ok) {
          const msg = (data && data.error && (data.error.message || data.error)) || res.statusText;
          const err = new Error('Spotify API ' + res.status + ': ' + msg);
          err.statusCode = res.status; err.body = data; throw err;
        }
        const hdrs = {}; res.headers.forEach((v, k) => { hdrs[k] = v; });
        return { status: res.status, headers: hdrs, body: data };
      }
    };
  }

  RED.nodes.registerType('spotify-config', SpotifyConfigNode, {
    credentials: { clientId: { type: 'text' }, clientSecret: { type: 'password' } }
  });
};
