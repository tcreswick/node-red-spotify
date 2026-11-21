'use strict';
// Data-driven description of supported Spotify Web API endpoints.
// p(): name, in (path|query|body), required, type (string|number|boolean|array|json), help
const P = (name, where, required, type, help) => ({ name, in: where, required: !!required, type: type || 'string', help: help || '' });
const id = (n, h) => P(n || 'id', 'path', true, 'string', h || 'Spotify ID');
const q = (n, t, h) => P(n, 'query', false, t, h);
const qr = (n, t, h) => P(n, 'query', true, t, h);
const b = (n, t, h, r) => P(n, 'body', r, t, h);
const paging = [q('limit', 'number'), q('offset', 'number')];
const market = q('market', 'string', 'ISO country code');
const device = q('device_id', 'string');

const ops = [
  // Player
  ['player', 'getPlayback', 'Get playback state', 'GET', '/me/player', [market, q('additional_types')]],
  ['player', 'getDevices', 'Get available devices', 'GET', '/me/player/devices', []],
  ['player', 'getCurrentlyPlaying', 'Get currently playing track', 'GET', '/me/player/currently-playing', [market, q('additional_types')]],
  ['player', 'getRecentlyPlayed', 'Get recently played tracks', 'GET', '/me/player/recently-played', [q('limit', 'number'), q('after', 'number'), q('before', 'number')]],
  ['player', 'getQueue', 'Get the queue', 'GET', '/me/player/queue', []],
  ['player', 'transferPlayback', 'Transfer playback', 'PUT', '/me/player', [b('device_ids', 'array', 'Array with one device id', true), b('play', 'boolean')]],
  ['player', 'play', 'Start/resume playback', 'PUT', '/me/player/play', [device, b('context_uri', 'string', 'album/artist/playlist URI'), b('uris', 'array', 'Track URIs'), b('offset', 'json', '{"position":0} or {"uri":"..."}'), b('position_ms', 'number')]],
  ['player', 'pause', 'Pause playback', 'PUT', '/me/player/pause', [device]],
  ['player', 'next', 'Skip to next', 'POST', '/me/player/next', [device]],
  ['player', 'previous', 'Skip to previous', 'POST', '/me/player/previous', [device]],
  ['player', 'seek', 'Seek to position', 'PUT', '/me/player/seek', [qr('position_ms', 'number'), device]],
  ['player', 'setRepeat', 'Set repeat mode', 'PUT', '/me/player/repeat', [qr('state', 'string', 'track, context or off'), device]],
  ['player', 'setShuffle', 'Set shuffle', 'PUT', '/me/player/shuffle', [qr('state', 'boolean'), device]],
  ['player', 'setVolume', 'Set volume', 'PUT', '/me/player/volume', [qr('volume_percent', 'number', '0-100'), device]],
  ['player', 'addToQueue', 'Add item to queue', 'POST', '/me/player/queue', [qr('uri', 'string'), device]],
  // Search
  ['search', 'search', 'Search for items', 'GET', '/search', [qr('q', 'string', 'Query'), qr('type', 'string', 'Comma list: album,artist,playlist,track,show,episode,audiobook'), market, q('limit', 'number'), q('offset', 'number'), q('include_external')]],
  // Tracks
  ['tracks', 'getTrack', 'Get track', 'GET', '/tracks/{id}', [id(), market]],
  ['tracks', 'getTracks', 'Get several tracks', 'GET', '/tracks', [qr('ids', 'array'), market]],
  ['tracks', 'getAudioFeatures', 'Get audio features (track)', 'GET', '/audio-features/{id}', [id()]],
  ['tracks', 'getAudioAnalysis', 'Get audio analysis', 'GET', '/audio-analysis/{id}', [id()]],
  ['tracks', 'getRecommendations', 'Get recommendations', 'GET', '/recommendations', [q('seed_artists', 'array'), q('seed_genres', 'array'), q('seed_tracks', 'array'), q('limit', 'number'), market]],
  // Albums
  ['albums', 'getAlbum', 'Get album', 'GET', '/albums/{id}', [id(), market]],
  ['albums', 'getAlbums', 'Get several albums', 'GET', '/albums', [qr('ids', 'array'), market]],
  ['albums', 'getAlbumTracks', 'Get album tracks', 'GET', '/albums/{id}/tracks', [id(), market].concat(paging)],
  ['albums', 'getNewReleases', 'Get new releases', 'GET', '/browse/new-releases', paging],
  // Artists
  ['artists', 'getArtist', 'Get artist', 'GET', '/artists/{id}', [id()]],
  ['artists', 'getArtists', 'Get several artists', 'GET', '/artists', [qr('ids', 'array')]],
  ['artists', 'getArtistAlbums', 'Get artist albums', 'GET', '/artists/{id}/albums', [id(), q('include_groups'), market].concat(paging)],
  ['artists', 'getArtistTopTracks', 'Get artist top tracks', 'GET', '/artists/{id}/top-tracks', [id(), market]],
  ['artists', 'getRelatedArtists', 'Get related artists', 'GET', '/artists/{id}/related-artists', [id()]],
  // Playlists
  ['playlists', 'getMyPlaylists', 'Get my playlists', 'GET', '/me/playlists', paging],
  ['playlists', 'getUserPlaylists', 'Get user playlists', 'GET', '/users/{user_id}/playlists', [id('user_id', 'User ID')].concat(paging)],
  ['playlists', 'getPlaylist', 'Get playlist', 'GET', '/playlists/{id}', [id(), market, q('fields')]],
  ['playlists', 'getPlaylistItems', 'Get playlist items', 'GET', '/playlists/{id}/tracks', [id(), market, q('fields')].concat(paging)],
  ['playlists', 'createPlaylist', 'Create playlist', 'POST', '/users/{user_id}/playlists', [id('user_id', 'User ID (use "me" to auto-fill)'), b('name', 'string', '', true), b('public', 'boolean'), b('collaborative', 'boolean'), b('description', 'string')]],
  ['playlists', 'changePlaylistDetails', 'Change playlist details', 'PUT', '/playlists/{id}', [id(), b('name'), b('public', 'boolean'), b('collaborative', 'boolean'), b('description')]],
  ['playlists', 'addPlaylistItems', 'Add items to playlist', 'POST', '/playlists/{id}/tracks', [id(), b('uris', 'array', 'Track/episode URIs', true), b('position', 'number')]],
  ['playlists', 'removePlaylistItems', 'Remove items from playlist', 'DELETE', '/playlists/{id}/tracks', [id(), b('tracks', 'json', '[{"uri":"spotify:track:..."}]', true), b('snapshot_id')]],
  ['playlists', 'replacePlaylistItems', 'Replace playlist items', 'PUT', '/playlists/{id}/tracks', [id(), b('uris', 'array', 'Track/episode URIs', true)]],
  ['playlists', 'getPlaylistCover', 'Get playlist cover image', 'GET', '/playlists/{id}/images', [id()]],
  ['playlists', 'uploadPlaylistCover', 'Upload playlist cover (base64 JPEG in payload.image)', 'PUT', '/playlists/{id}/images', [id(), b('image', 'string', 'Base64 JPEG <256KB', true)]],
  // Library
  ['library', 'getSavedTracks', 'Get saved tracks', 'GET', '/me/tracks', [market].concat(paging)],
  ['library', 'saveTracks', 'Save tracks', 'PUT', '/me/tracks', [b('ids', 'array', 'Track IDs', true)]],
  ['library', 'removeSavedTracks', 'Remove saved tracks', 'DELETE', '/me/tracks', [b('ids', 'array', 'Track IDs', true)]],
  ['library', 'checkSavedTracks', 'Check saved tracks', 'GET', '/me/tracks/contains', [qr('ids', 'array')]],
  ['library', 'getSavedAlbums', 'Get saved albums', 'GET', '/me/albums', [market].concat(paging)],
  ['library', 'saveAlbums', 'Save albums', 'PUT', '/me/albums', [b('ids', 'array', 'Album IDs', true)]],
  ['library', 'removeSavedAlbums', 'Remove saved albums', 'DELETE', '/me/albums', [b('ids', 'array', 'Album IDs', true)]],
  ['library', 'checkSavedAlbums', 'Check saved albums', 'GET', '/me/albums/contains', [qr('ids', 'array')]],
  ['library', 'getSavedShows', 'Get saved shows', 'GET', '/me/shows', paging],
  ['library', 'saveShows', 'Save shows', 'PUT', '/me/shows', [qr('ids', 'array')]],
  ['library', 'removeSavedShows', 'Remove saved shows', 'DELETE', '/me/shows', [qr('ids', 'array')]],
  ['library', 'getSavedEpisodes', 'Get saved episodes', 'GET', '/me/episodes', [market].concat(paging)],
  ['library', 'followPlaylist', 'Follow playlist', 'PUT', '/playlists/{id}/followers', [id(), b('public', 'boolean')]],
  ['library', 'unfollowPlaylist', 'Unfollow playlist', 'DELETE', '/playlists/{id}/followers', [id()]],
  // Users / follow
  ['user', 'getMe', 'Get current user profile', 'GET', '/me', []],
  ['user', 'getUser', 'Get user profile', 'GET', '/users/{user_id}', [id('user_id', 'User ID')]],
  ['user', 'getTopItems', 'Get top artists or tracks', 'GET', '/me/top/{type}', [id('type', 'artists or tracks'), q('time_range', 'string', 'short_term, medium_term, long_term')].concat(paging)],
  ['user', 'getFollowedArtists', 'Get followed artists', 'GET', '/me/following', [Object.assign(q('type'), { default: 'artist' }), q('after'), q('limit', 'number')]],
  ['user', 'follow', 'Follow artists/users', 'PUT', '/me/following', [qr('type', 'string', 'artist or user'), b('ids', 'array', 'IDs', true)]],
  ['user', 'unfollow', 'Unfollow artists/users', 'DELETE', '/me/following', [qr('type', 'string', 'artist or user'), b('ids', 'array', 'IDs', true)]],
  ['user', 'checkFollowing', 'Check if following artists/users', 'GET', '/me/following/contains', [qr('type'), qr('ids', 'array')]],
  // Shows / episodes / audiobooks
  ['shows', 'getShow', 'Get show', 'GET', '/shows/{id}', [id(), market]],
  ['shows', 'getShowEpisodes', 'Get show episodes', 'GET', '/shows/{id}/episodes', [id(), market].concat(paging)],
  ['shows', 'getEpisode', 'Get episode', 'GET', '/episodes/{id}', [id(), market]],
  ['shows', 'getAudiobook', 'Get audiobook', 'GET', '/audiobooks/{id}', [id(), market]],
  ['shows', 'getAudiobookChapters', 'Get audiobook chapters', 'GET', '/audiobooks/{id}/chapters', [id(), market].concat(paging)],
  // Categories / markets
  ['browse', 'getCategories', 'Get browse categories', 'GET', '/browse/categories', [q('locale'), q('limit', 'number'), q('offset', 'number')]],
  ['browse', 'getCategory', 'Get a browse category', 'GET', '/browse/categories/{id}', [id(), q('locale')]],
  ['browse', 'getGenreSeeds', 'Get available genre seeds', 'GET', '/recommendations/available-genre-seeds', []],
  ['browse', 'getMarkets', 'Get available markets', 'GET', '/markets', []]
].map(([group, op, label, method, path, params]) => ({ group, op, label, method, path, params }));

const byId = {};
ops.forEach(o => { byId[o.op] = o; });
module.exports = { operations: ops, byId };
