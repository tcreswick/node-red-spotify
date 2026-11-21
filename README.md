# @tcreswick/node-red-spotify

[![npm](https://img.shields.io/npm/v/@tcreswick/node-red-spotify)](https://www.npmjs.com/package/@tcreswick/node-red-spotify)
[![Node-RED Flow Library](https://img.shields.io/badge/Node--RED-Flow%20Library-8f0000)](https://flows.nodered.org/node/@tcreswick/node-red-spotify)
[![CI](https://github.com/tcreswick/node-red-spotify/actions/workflows/ci.yml/badge.svg)](https://github.com/tcreswick/node-red-spotify/actions/workflows/ci.yml)

Node-RED nodes for the [Spotify Web API](https://developer.spotify.com/documentation/web-api), with the OAuth
(Authorization Code + PKCE) flow handled by a configuration node.

Listed on the Node-RED Flow Library: <https://flows.nodered.org/node/@tcreswick/node-red-spotify>

## Nodes
- **spotify-config** – Client ID/Secret, scopes, redirect URI, *Authorise* button. Stores tokens in
  `<userDir>/spotify-web-api-tokens.json` (mode 600), refreshes automatically, retries 429/5xx.
- **spotify-api** – ~80 operations (player, search, tracks, albums, artists, playlists, library, user, shows, browse).
  Parameters come from `msg.payload.<param>`, `msg.<param>`, or the node fields. IDs can be IDs, URIs or URLs.
  Optional "fetch all pages". Operation can be set via `msg.operation`.
- **spotify-watch** – polls the player and emits on track / state change.

## Setup
1. Create an app at <https://developer.spotify.com/dashboard>.
2. Install from the Node-RED palette manager (search "spotify"), or `cd ~/.node-red && npm install @tcreswick/node-red-spotify` and restart.
3. Add a Spotify node, edit the config, copy the displayed **Redirect URI**
   (`<editor origin>/spotify-web-api/callback`) into the Spotify app's Redirect URIs.
   Spotify requires HTTPS (or `http://127.0.0.1`). If Node-RED sits behind a proxy, set the Redirect URI field manually.
4. Enter Client ID (Secret optional), click **Authorise with Spotify**, then Done/Deploy.

## Notes
- Playback control needs Spotify Premium and an active device.
- Spotify removed audio-features/analysis, recommendations, related-artists etc. for new apps (Nov 2024); they return 403 there.
- Tests: `npm test` (mocked HTTP).
