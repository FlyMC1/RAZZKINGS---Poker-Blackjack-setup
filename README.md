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

Windows release builds now include a branded NSIS web installer that downloads the app payload, installs the app, and creates Desktop/Start Menu shortcuts from the installed files.

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

1. On Windows, download and run the latest `RAZZKINGS Web Setup` installer.
2. The installer downloads the app payload, installs the app, and creates a Desktop shortcut.
3. Launch from the Desktop shortcut **RAZZKINGS** or run `npm run host:public:oneclick` for the launcher path.
4. Create table.
5. Share generated links/QR with players.

The top-right host badge shows network availability:

- Green **Live public**: outside-network links are using a public HTTPS tunnel.
- Orange **LAN only**: the app is running locally/on your network only.
- Red **Host error**: the app cannot reach the local host server.

### Windows Full Auto Setup

1. Double-click the Windows web installer (`RAZZKINGS Web Setup`).
2. The installer downloads the app payload and installs it into the chosen location.
3. Desktop and Start Menu shortcuts are created from the installed app files.
4. Launch with Desktop shortcut **RAZZKINGS**.

If you want the separate host/bootstrap path, keep the extracted project folder and use `setup-public-host-windows.cmd` only for first-run dependency setup.

The launcher will start the app with a Cloudflare public URL so outside-network users can join.
The launcher window now prints the project folder and dependency checks immediately. If it appears idle, use the latest `RAZZKINGS-public-host-project-<version>.zip`, extract it fully, and run the `.cmd` file from the extracted folder.

### Manual Session Flow

1. Run `npm run host:public:oneclick`.
2. Create table.
3. Share generated links/QR with players.

## Release Artifacts

`npm run dist` writes artifacts into `release/`.

- Linux: `RAZZKINGS-<version>.AppImage`
- Windows: `RAZZKINGS Web Setup` and `RAZZKINGS Setup` installers, plus the packaged app output

Optional Linux launcher helpers are included as `launch-beta.sh` and `RAZZKINGS.desktop`.