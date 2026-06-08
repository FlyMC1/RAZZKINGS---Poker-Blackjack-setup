# RAZZKINGS Table Host

Play-money casino table host for Texas Hold'em, blackjack, and classic poker.

## Quick Start

1. Install dependencies:
	- `npm install`
2. Start host app:
	- `npm start`
3. Create a table from host UI and share player/spectator links.

## Commands

- `npm start`: Build frontend and launch desktop host app.
- `npm run dev`: Run Vite dev client + Electron host.
- `npm run dist`: Build desktop release artifacts into `release/`.
- `npm run tunnel:quick`: Start a free Cloudflare Quick Tunnel to `http://localhost:3001`.
- `npm run host:public`: Run host app and Quick Tunnel together.
- `npm run host:public:oneclick`: One-click public host launcher (auto tunnel URL detection + app launch).
- `npm run setup:windows`: Guided Windows setup (install deps + create Desktop shortcut).

## Tournament Hand Flow

- Card Games now support explicit hand progression.
- After a hand finishes, host uses **Deal next hand** to continue.
- Tournament runs until one player has remaining chips, or host manually ends and saves replay.

## Replay Retention

- Replays auto-expire after a retention period.
- Configure with environment variable: `REPLAY_RETENTION_DAYS`
- Default: `30` days.

## Host Outside Your Network (Free)

Use Cloudflare Tunnel (free).

Step-by-step setup guide:

- [docs/hosting-public.md](docs/hosting-public.md)

### Fast Session Flow

1. On Windows (first-time setup), run `setup-public-host-windows.cmd`.
2. After setup, use Desktop shortcut **RAZZKINGS Public Host**.
3. Or run `npm run host:public:oneclick`.
4. Create table.
5. Share generated links/QR with players.

### Windows Full Auto Setup

1. Double-click `setup-public-host-windows.cmd`.
2. Follow prompts for each step:
	- install/check Node.js LTS,
	- install/check cloudflared,
	- run `npm install`,
	- create Desktop shortcut.
3. Launch with Desktop shortcut **RAZZKINGS Public Host**.

The launcher will start the app with a Cloudflare public URL so outside-network users can join.

### Manual Session Flow

1. Run `npm run host:public:oneclick`.
2. Create table.
3. Share generated links/QR with players.

## Release Artifacts

`npm run dist` writes artifacts into `release/`.

- Linux: `RAZZKINGS-<version>.AppImage`
- Windows: NSIS/portable outputs depending on build mode

Optional Linux launcher helpers are included as `launch-beta.sh` and `RAZZKINGS.desktop`.