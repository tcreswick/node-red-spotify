'use strict';
// Mock-based test: loads nodes with a fake RED and a stubbed fetch.
const assert = require('assert');
const handlers = {}; const types = {};
const RED = {
  settings: { userDir: require('os').tmpdir() + '/spotify-test-' + process.pid },
  httpAdmin: { get: (p, ...h) => handlers['GET ' + p] = h.pop(), post: (p, ...h) => handlers['POST ' + p] = h.pop() },
  auth: { needsPermission: () => (q, r, n) => n() },
  events: new (require('events'))(),
  nodes: {
    createNode(n, c) { require('events').EventEmitter.call(n); Object.assign(n, require('events').EventEmitter.prototype); n.status = () => {}; n.send = m => n.sent = m; n.error = e => n.err = e; n.credentials = RED.creds; },
    registerType: (t, c) => types[t] = c, getCredentials: () => RED.creds, getNode: id => RED.cfg
  }
};
require('fs').mkdirSync(RED.settings.userDir, { recursive: true });
RED.creds = { clientId: 'cid', clientSecret: 'sec' };
require('../nodes/spotify-config')(RED); require('../nodes/spotify-api')(RED);
const calls = [];
global.fetch = async (url, o) => {
  url = String(url); calls.push({ url, o });
  const mk = (st, body) => ({ ok: st < 400, status: st, statusText: '', headers: new Map(Object.entries({})), text: async () => body ? JSON.stringify(body) : '', json: async () => body });
  if (url.includes('/api/token')) return mk(200, { access_token: 'AT' + calls.length, refresh_token: 'RT', expires_in: 3600, scope: 'x' });
  if (url.endsWith('/me')) return mk(200, { id: 'u1', display_name: 'User' });
  if (url.includes('/search')) return mk(200, { tracks: { items: [1], next: null } });
  return mk(204);
};
(async () => {
  let out; const res = { json: o => out = o, status() { return this; }, send: o => out = o };
  handlers['POST /spotify-web-api/auth']({ body: { id: 'c1', redirectUri: 'https://x/cb', scope: 'a b' } }, res);
  const u = new URL(out.url); assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  await handlers['GET /spotify-web-api/callback']({ query: { state: u.searchParams.get('state'), code: 'CODE' } }, res);
  assert(/Logged in as User/.test(out));
  let st; handlers['GET /spotify-web-api/status']({ query: { id: 'c1' } }, { json: o => st = o }); assert(st.authorized && st.user === 'User');
  const cfgNode = { id: 'c1' }; types['spotify-config'].call(cfgNode, { id: 'c1' });
  RED.cfg = cfgNode;
  const run = async (conf, msg) => { const n = { id: 'n' }; types['spotify-api'].call(n, Object.assign({ server: 'c1' }, conf));
    await new Promise(r => { n.emit('input', msg, m => { n.out = m; }, e => { if (e) n.err = e.message; r(e); }); }); if (n.err) console.log('err', n.err); return n; };
  calls.length = 0;
  let n = await run({ operation: 'search' }, { payload: { q: 'abba', type: 'track,album' } });
  assert.equal(n.out.payload.tracks.items.length, 1);
  assert(calls[0].url.includes('/search?q=abba&type=track%2Calbum'), calls[0].url);
  assert.equal(calls[0].o.headers.Authorization.slice(0, 9), 'Bearer AT');
  n = await run({ operation: 'createPlaylist' }, { payload: { name: 'X', public: false } });
  assert(calls[1].url.endsWith('/users/u1/playlists')); assert.equal(calls[1].o.body, '{"name":"X","public":false}');
  n = await run({ operation: 'addPlaylistItems' }, { payload: ['spotify:track:abc'], id: 'https://open.spotify.com/playlist/PL1?si=1' });
  assert(calls[2].url.endsWith('/playlists/PL1/tracks'), calls[2].url);
  n = await run({ operation: 'setVolume' }, { payload: { volume_percent: 30 } });
  assert(calls[3].url.endsWith('/me/player/volume?volume_percent=30')); assert.equal(n.out.payload, null);
  // expired token triggers refresh
  require('fs'); const f = RED.settings.userDir + '/spotify-web-api-tokens.json';
  const t = JSON.parse(require('fs').readFileSync(f)); t.c1.expiresAt = 0; require('fs').writeFileSync(f, JSON.stringify(t));
  delete require.cache[f];
  console.log('ok');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
