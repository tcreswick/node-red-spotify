'use strict';
module.exports = function (RED) {
  function SpotifyWatchNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.server = RED.nodes.getNode(config.server);
    const interval = Math.max(2, parseInt(config.interval, 10) || 5) * 1000;
    const emitAlways = !!config.emitAlways;
    let last; let timer; let busy = false;

    function sig(p) {
      if (!p) return 'none';
      return [p.is_playing, p.item && p.item.uri, p.device && p.device.id, p.shuffle_state, p.repeat_state,
        p.device && p.device.volume_percent].join('|');
    }
    async function poll() {
      if (busy || !node.server) return; busy = true;
      try {
        if (!node.server.isAuthorized()) { node.status({ fill: 'yellow', shape: 'ring', text: 'not authorised' }); return; }
        const r = await node.server.request('GET', '/me/player', { additional_types: 'episode' });
        const p = r.status === 204 ? null : r.body;
        const s = sig(p);
        node.status({ fill: p && p.is_playing ? 'green' : 'grey', shape: 'dot', text: p ? (p.is_playing ? 'playing' : 'paused') : 'idle' });
        if (emitAlways || s !== last) {
          const prev = last; last = s;
          if (prev !== undefined || emitAlways || config.emitInitial) {
            const track = p && p.item;
            let event = 'changed';
            if (prev === 'none') event = 'started'; else if (s === 'none') event = 'stopped';
            node.send({
              topic: 'spotify/player', event, payload: p,
              track: track ? { uri: track.uri, name: track.name, artists: (track.artists || []).map(a => a.name) } : null
            });
          }
        }
      } catch (e) {
        node.status({ fill: 'red', shape: 'ring', text: String(e.statusCode || 'error') });
        node.warn(e.message);
      } finally { busy = false; }
    }
    if (node.server) { timer = setInterval(poll, interval); setTimeout(poll, 500); }
    node.on('close', () => { clearInterval(timer); });
  }
  RED.nodes.registerType('spotify-watch', SpotifyWatchNode);
};
