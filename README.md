# RAZZKINGS Table Host

Play-money casino table host for Texas Hold'em, blackjack, and classic poker.

## Start

1. Install dependencies with `npm install`.
2. Start the host app with `npm start`.
3. For development, use `npm run dev` to run the Vite client and desktop host together.
4. Create a table from the host screen and share the generated player or spectator link.
5. Build a distributable release with `npm run dist`.
6. On Linux, run the beta artifact at `release/RAZZKINGS-0.1.0.AppImage`.
7. Use `launch-beta.sh` or `RAZZKINGS.desktop` if you want a simple desktop launcher for the beta build.

## Included in this first implementation

- Electron-based desktop host shell.
- Dark table UI with the brand logo asset.
- Host controls for game mode, starting chips, deck count, and max players.
- Basic player or spectator join flow from a shared table link.
- Socket-based chat scaffold and replay-friendly table state.

## Release notes

This first usable release is a host-only tabletop app: the dealer uses the host camera feed, players and spectators join with uploaded pictures, and finished sessions can be reopened with a replay link.

Release artifacts are written to `release/` when you run `npm run dist`.

`npm start` now builds the frontend first and then launches the host app directly, so it can be used as the one-command local run path.

`RAZZKINGS.desktop` and `launch-beta.sh` are included for a simple Linux shortcut setup.