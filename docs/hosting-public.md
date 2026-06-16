# Public Hosting Guide (Free)

This guide sets up optional public hosting for RAZZKINGS so players can join from outside your local network using Cloudflare Tunnel (free). The Windows installer itself sets up local/LAN play by default.

## What Is Already Set Up In This Repo

The repo now includes:

- `npm run tunnel:quick` to open a Cloudflare Quick Tunnel to `http://localhost:3001`.
- `npm run host:public` to run the host app and tunnel together.
- `npm run host:public:oneclick` to automatically start tunnel, capture URL, and launch the app with that URL preconfigured.
- `npm run setup:windows` for guided Windows setup.
- `start-public-host.cmd` for double-click launch on Windows.
- `setup-public-host-windows.cmd` for double-click Windows install/setup wizard.
- Host UI field **Public URL override** for stable public links in the app.

## Best Free Option

Use **Cloudflare Quick Tunnel** (`trycloudflare.com`).

Pros:
- Free
- Works with WebSocket traffic (required for live table/chat)
- No router port forwarding
- Works on mobile and desktop clients

Tradeoff:
- URL changes every session

## One-Time Setup On Host PC

### Windows

Recommended local installation:

1. Download and double-click the latest `RAZZKINGS Setup` installer.
2. The installer installs the app locally and creates shortcuts.
3. Launch from Desktop shortcut **RAZZKINGS**.

Public hosting is optional after installation. If you want to open the app outside your network, use the launcher options below.

Terminal alternative:

1. Run `npm run setup:windows`.

### Linux

1. Install Node.js LTS (if not installed).
2. Install cloudflared from Cloudflare docs/package manager.
3. In the project folder, install dependencies:
   - `npm install`

## Start Public Hosting (Each Session)

### Option A (Recommended): One-Click Launcher

1. Open terminal in repo root and run:
   - `npm run host:public:oneclick`
2. Or on Windows, double-click:
   - `start-public-host.cmd`
3. Or use the Desktop shortcut created by the installer:
   - `RAZZKINGS`
4. The launcher will:
   - verify cloudflared,
   - install dependencies if missing,
   - start a Cloudflare tunnel,
   - capture the `https://...trycloudflare.com` URL,
   - start RAZZKINGS with `PUBLIC_BASE_URL` already set.
5. Create a table and share the generated links/QR.

The app badge in the top-right corner confirms hosting state:

- Green **Live public** means the app is using the Cloudflare public URL and outside-network users should be able to join.
- Orange **LAN only** means the app is available only on the local network.
- Red **Host error** means the app cannot reach the local host server.

If `start-public-host.cmd` opens but appears to do nothing, update to the latest `RAZZKINGS-public-host-project-<version>.zip`, extract it fully, and run the `.cmd` file from the extracted folder. The launcher should print the project folder and each dependency check immediately.

### Option B: Manual (Legacy)

1. Open terminal in repo root.
2. Run:
   - `npm run host:public`
3. Wait for cloudflared output that includes a URL like:
   - `https://<random>.trycloudflare.com`
4. In RAZZKINGS host panel, set **Public URL override** to that URL.
5. Create table.
6. Share generated player/spectator links or QR codes.

## Stop Hosting

1. In terminal where `host:public` is running, press `Ctrl + C`.
2. This shuts down both the app process and tunnel process.

## Troubleshooting

### Links still point to localhost

- Set **Public URL override** before clicking **Create table**.
- If table already exists, create a new table after setting override.

### Players can open page but cannot interact

- Confirm `npm run host:public` is still running.
- Confirm host machine internet is stable.
- Generate a new Quick Tunnel URL if disconnected.

### Tunnel command not found

- Verify `cloudflared` is installed and available on PATH:
  - Windows: `cloudflared --version`
  - Linux: `cloudflared --version`

## Security Notes

- Share only player/spectator links.
- Do not share host control screen publicly.
- Keep session short-lived; stop tunnel when done.
- Quick Tunnel is for lightweight community use. For long-term production, use a named tunnel + managed domain.

## Replay Retention Setting

- Replay files auto-expire based on `REPLAY_RETENTION_DAYS`.
- Default retention is `30` days if unset.
