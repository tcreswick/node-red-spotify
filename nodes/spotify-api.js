'use strict';
const { byId } = require('./operations');

function coerce(value, type) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return value;
  switch (type) {
    case 'number': { const n = Number(value); if (Number.isNaN(n)) throw new Error('Not a number: ' + value); return n; }
    case 'boolean': return value === 'true' || value === '1';
    case 'array': return value.trim().startsWith('[') ? JSON.parse(value) : value.split(',').map(s => s.trim()).filter(Boolean);
    case 'json': return JSON.parse(value);
    default: return value;
  }
}

// Accept ids as plain id, URI or open.spotify.com URL for convenience.
function cleanId(v) {
  if (typeof v !== 'string') return v;
  const m = v.match(/^spotify:[a-z]+:([A-Za-z0-9]+)$/) || v.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?[a-z]+\/([A-Za-z0-9]+)/);
  return m ? m[1] : v;
}

module.exports = function (RED) {
  function SpotifyApiNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.server = RED.nodes.getNode(config.server);
    node.operation = config.operation;
    node.fixed = config.params || {};
    node.allPages = !!config.allPages;
    node.maxPages = Math.max(1, parseInt(config.maxPages, 10) || 20);

    if (!node.server) { node.status({ fill: 'red', shape: 'ring', text: 'no config' }); }

    node.on('input', async (msg, send, done) => {
      send = send || node.send.bind(node); done = done || (e => e && node.error(e, msg));
      try {
        if (!node.server) throw new Error('No Spotify config node selected');
        const opName = (config.operation === 'msg' || !config.operation) ? msg.operation : config.operation;
        const op = byId[opName];
        if (!op) throw new Error('Unknown operation: ' + opName);

        const payload = msg.payload;
        const firstRequired = Array.isArray(payload) ? op.params.find(p => p.required && p.type === 'array') : (typeof payload === 'string' ? op.params.find(p => p.required) : undefined);
        const args = {};
        for (const p of op.params) {
          let v;
          if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload[p.name] !== undefined) v = payload[p.name];
          else if (msg[p.name] !== undefined) v = msg[p.name];
          else if (node.fixed[p.name] !== undefined && node.fixed[p.name] !== '') v = node.fixed[p.name];
          else if (p.default !== undefined) v = p.default;
          else if ((typeof payload === 'string' || Array.isArray(payload)) && firstRequired && firstRequired.name === p.name) v = payload;
          v = coerce(v, p.type);
          if (v === undefined) {
            if (p.required && !(p.name === 'user_id')) throw new Error('Missing required parameter: ' + p.name);
            continue;
          }
          args[p.name] = v;
        }

        let apiPath = op.path;
        const query = {}; const body = {};
        for (const p of op.params) {
          let v = args[p.name];
          if (p.in === 'path') {
            if (p.name === 'user_id' && (v === undefined || v === 'me')) v = node.server.getUserId();
            if (!v) throw new Error('Missing path parameter: ' + p.name);
            apiPath = apiPath.replace('{' + p.name + '}', encodeURIComponent(cleanId(v)));
          } else if (v === undefined) continue;
          else if (p.in === 'query') query[p.name] = Array.isArray(v) ? v.map(cleanId) : (p.name === 'ids' ? cleanId(v) : v);
          else body[p.name] = (p.name === 'ids' && Array.isArray(v)) ? v.map(cleanId) : v;
        }
        // convenience: ids supplied as array of URIs for body 'ids' already cleaned
        let reqBody; let ctype;
        if (opName === 'uploadPlaylistCover') { reqBody = body.image; ctype = 'image/jpeg'; }
        else if (Object.keys(body).length) reqBody = body;
        else if (['PUT', 'POST'].includes(op.method) && /\/me\/(tracks|albums|following)$/.test(op.path)) reqBody = body;

        node.status({ fill: 'blue', shape: 'dot', text: op.op });
        let r = await node.server.request(op.method, apiPath, query, reqBody, ctype);
        let result = r.body;

        if (node.allPages && result && typeof result === 'object') {
          // Handles {items,next} and {<key>:{items,next}} (search, followed artists)
          const holder = Array.isArray(result.items) ? result : Object.values(result).find(v => v && Array.isArray(v.items));
          if (holder) {
            let pages = 1;
            while (holder.next && pages < node.maxPages) {
              const nr = await node.server.request('GET', holder.next);
              const nh = Array.isArray(nr.body.items) ? nr.body : Object.values(nr.body).find(v => v && Array.isArray(v.items));
              if (!nh) break;
              holder.items = holder.items.concat(nh.items); holder.next = nh.next; pages++;
            }
            holder.fetchedPages = pages;
          }
        }

        msg.payload = result;
        msg.statusCode = r.status;
        msg.headers = r.headers;
        msg.operation = op.op;
        node.status({});
        send(msg); done();
      } catch (err) {
        node.status({ fill: 'red', shape: 'ring', text: (err.statusCode || 'error') + '' });
        msg.statusCode = err.statusCode; msg.error = { message: err.message, body: err.body };
        done(err);
      }
    });
  }
  RED.nodes.registerType('spotify-api', SpotifyApiNode);
};
