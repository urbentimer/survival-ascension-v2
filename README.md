# Survival Ascension — 8-player online co-op prototype

A browser client plus an authoritative Node.js / Colyseus server. Players create private rooms and invite friends with the Colyseus room ID. Rooms are not exposed through a public room browser; joining requires the exact room ID.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

From the project root:

```bash
npm install --prefix server
npm run dev:server
```

Then serve the client folder from a local static web server. For example:

```bash
cd client
npx http-server -p 8080
```

Open `http://localhost:8080` in a browser. Create a room in one browser window and join the displayed room code from another. For two devices on the same LAN, use the host computer's LAN IP for the client page and append `?server=ws://HOST_LAN_IP:2567` to the client URL.

## Deploy for friends over the internet

1. Deploy `server/` to a Node.js host that supports persistent WebSocket connections and exposes port `2567` (or provide `PORT`).
2. Set `PUBLIC_ADDRESS` to the public WebSocket address if your host requires it.
3. Host the contents of `client/` on a static HTTPS host.
4. Open the client with `?server=wss://YOUR_GAME_SERVER_HOST`.
5. Share the static client URL with friends. The host creates a room and shares the room code.

The browser page must use `wss://` when served over HTTPS. Do not expose a plain `ws://` server to an HTTPS page; browsers block mixed content.

## Current prototype gameplay

- Up to 8 players in one private room
- Host starts the match and advances cleared stages
- Server-authoritative player movement, zombie movement, collision damage, firing, zombie HP, kills and boss state
- Zombie types: walker, runner, brute, spitter and Undead King
- Individual XP and five server-validated upgrades
- Downed players can be revived by a nearby teammate using `E`

## Important prototype limitations

- This is a playable engineering prototype, not a production-ready game.
- The current client uses CDN-hosted `colyseus.js`; production deployments should pin and self-host the dependency.
- The server currently applies automatic hitscan damage to the nearest zombie when a client sends its fire tick. It does not yet simulate projectile trajectories, weapon inventory, persistent accounts, saved progression, matchmaking, anti-cheat rate limiting, or reconnection recovery.
- XP is credited to the player who lands the final hit. A full shared team XP option can be added later.
- Gold is currently a simple client display derived from personal kills; a persistent shop/economy is not implemented yet.
- The current spitter implementation uses server-side periodic damage rather than visible projectile replication.
- Before public release, add HTTPS/WSS hosting, origin restrictions, authentication/rate limits, logging, reconnection handling and load testing.

## Project structure

```text
survival-ascension-coop/
  client/
    index.html
  server/
    package.json
    src/
      index.js
      schema.js
      SurvivalRoom.js
  package.json
  README.md
```
