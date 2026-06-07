import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { getMode } from '../shared/game.js';
import { applyAction, finishGame, initializeGame } from './engine.js';
import { loadReplay, saveReplay } from './replayStore.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true,
  },
});

const tables = new Map();
let serverStarted = false;

app.use(express.json());

app.get('/health', (_, response) => {
  response.json({ ok: true, service: 'razzkings-server' });
});

app.get('/api/tables/:tableId', (request, response) => {
  const table = tables.get(request.params.tableId);

  if (!table) {
    response.status(404).json({ error: 'Table not found' });
    return;
  }

  response.json(table);
});

app.get('/api/replays/:replayId', async (request, response) => {
  try {
    const replay = await loadReplay(request.params.replayId);
    response.json(replay);
  } catch {
    response.status(404).json({ error: 'Replay not found' });
  }
});

app.post('/api/tables', (request, response) => {
  const {
    modeId = 'texas-holdem',
    deckCount = 2,
    startingChips = 1000,
    maxPlayers = 8,
    tableName = 'RAZZKINGS Night Table',
  } = request.body ?? {};

  const mode = getMode(modeId);
  const tableId = randomUUID();
  const table = {
    id: tableId,
    tableName,
    modeId: mode.id,
    deckCount,
    startingChips,
    maxPlayers: Math.min(maxPlayers, mode.seats),
    phase: 'draft',
    players: [],
    spectators: [],
    log: [],
    media: {},
    avatars: {},
    updatedAt: new Date().toISOString(),
  };

  tables.set(tableId, table);
  response.status(201).json(table);
});

app.post('/api/tables/:tableId/start', (request, response) => {
  const table = tables.get(request.params.tableId);

  if (!table) {
    response.status(404).json({ error: 'Table not found' });
    return;
  }

  table.gameState = initializeGame(table);
  table.phase = 'live';
  table.updatedAt = new Date().toISOString();
  table.preview = createPreviewFromGameState(table.gameState);
  table.log.push({
    id: randomUUID(),
    type: 'table-started',
    timestamp: table.updatedAt,
  });

  io.to(table.id).emit('table:update', table);
  response.json(table);
});

app.post('/api/tables/:tableId/action', async (request, response) => {
  const table = tables.get(request.params.tableId);

  if (!table || !table.gameState) {
    response.status(404).json({ error: 'Table not found or not started' });
    return;
  }

  const { action, amount } = request.body ?? {};

  if (String(action ?? '').toLowerCase() === 'finish') {
    const finished = finishGame(table);

    if (!finished.ok) {
      response.status(400).json({ error: finished.error });
      return;
    }

    table.updatedAt = new Date().toISOString();
    table.preview = createPreviewFromGameState(table.gameState);
    table.log.push({
      id: randomUUID(),
      type: 'table-finished',
      timestamp: table.updatedAt,
    });

    const replayId = randomUUID();
    const replay = {
      id: replayId,
      tableId: table.id,
      tableName: table.tableName,
      modeId: table.modeId,
      finishedAt: table.updatedAt,
      gameState: table.gameState,
      log: table.log,
      players: table.players,
    };

    await saveReplay(replay);
    table.replayId = replayId;
    table.replayUrl = `/replay/${replayId}`;
    table.phase = 'finished';

    io.to(table.id).emit('table:update', table);
    response.json(table);
    return;
  }

  const result = applyAction(table, request.body?.socketId, String(action ?? '').toLowerCase(), amount);

  if (!result.ok) {
    response.status(400).json({ error: result.error });
    return;
  }

  table.updatedAt = new Date().toISOString();
  table.preview = createPreviewFromGameState(table.gameState);
  table.log.push({
    id: randomUUID(),
    type: 'action',
    action,
    amount,
    timestamp: table.updatedAt,
  });

  if (table.gameState.finished) {
    const replayId = randomUUID();
    const replay = {
      id: replayId,
      tableId: table.id,
      tableName: table.tableName,
      modeId: table.modeId,
      finishedAt: table.updatedAt,
      gameState: table.gameState,
      log: table.log,
      players: table.players,
    };

    await saveReplay(replay);
    table.replayId = replayId;
    table.replayUrl = `/replay/${replayId}`;
    table.phase = 'finished';
  }

  io.to(table.id).emit('table:update', table);
  response.json(table);
});

app.post('/api/tables/:tableId/finish', async (request, response) => {
  const table = tables.get(request.params.tableId);

  if (!table || !table.gameState) {
    response.status(404).json({ error: 'Table not found or not started' });
    return;
  }

  const result = finishGame(table);

  if (!result.ok) {
    response.status(400).json({ error: result.error });
    return;
  }

  table.updatedAt = new Date().toISOString();
  table.preview = createPreviewFromGameState(table.gameState);
  table.log.push({
    id: randomUUID(),
    type: 'table-finished',
    timestamp: table.updatedAt,
  });

  const replayId = randomUUID();
  const replay = {
    id: replayId,
    tableId: table.id,
    tableName: table.tableName,
    modeId: table.modeId,
    finishedAt: table.updatedAt,
    gameState: table.gameState,
    log: table.log,
    players: table.players,
  };

  await saveReplay(replay);
  table.replayId = replayId;
  table.replayUrl = `/replay/${replayId}`;

  io.to(table.id).emit('table:update', table);
  response.json(table);
});

app.get('/replay/:replayId', async (request, response) => {
  try {
    const replay = await loadReplay(request.params.replayId);
    response.json(replay);
  } catch {
    response.status(404).json({ error: 'Replay not found' });
  }
});

io.on('connection', (socket) => {
  socket.on('table:join', ({ tableId, name, role = 'player', avatarUrl = null }) => {
    const table = tables.get(tableId);

    if (!table) {
      socket.emit('table:error', 'Table not found');
      return;
    }

    socket.join(tableId);
    socket.data.tableId = tableId;
    socket.data.name = name;
    socket.data.role = role;
    socket.data.avatarUrl = avatarUrl;

    if (role === 'spectator') {
      if (!table.spectators.some((spectator) => spectator.id === socket.id)) {
        table.spectators.push({ id: socket.id, name: name ?? 'Guest Spectator', avatarUrl: avatarUrl ?? null });
      }
    } else if (!table.players.some((player) => player.id === socket.id)) {
      table.players.push({ id: socket.id, name: name ?? `Player ${table.players.length + 1}`, avatarUrl: avatarUrl ?? null });
    }

    if (avatarUrl) {
      table.avatars[socket.id] = avatarUrl;
    }

    table.updatedAt = new Date().toISOString();
    io.to(tableId).emit('table:update', table);
  });

  socket.on('table:action', async ({ tableId, action, amount }) => {
    const table = tables.get(tableId);

    if (!table || !table.gameState) {
      socket.emit('table:error', 'Table not started');
      return;
    }

    if (String(action ?? '').toLowerCase() === 'finish') {
      const finished = finishGame(table);

      if (!finished.ok) {
        socket.emit('table:error', finished.error);
        return;
      }

      table.updatedAt = new Date().toISOString();
      table.preview = createPreviewFromGameState(table.gameState);
      table.log.push({
        id: randomUUID(),
        type: 'table-finished',
        timestamp: table.updatedAt,
      });

      const replayId = randomUUID();
      const replay = {
        id: replayId,
        tableId: table.id,
        tableName: table.tableName,
        modeId: table.modeId,
        finishedAt: table.updatedAt,
        gameState: table.gameState,
        log: table.log,
        players: table.players,
      };

      await saveReplay(replay);
      table.replayId = replayId;
      table.replayUrl = `/replay/${replayId}`;
      table.phase = 'finished';

      io.to(tableId).emit('table:update', table);
      return;
    }

    const result = applyAction(table, socket.id, String(action ?? '').toLowerCase(), amount);

    if (!result.ok) {
      socket.emit('table:error', result.error);
      return;
    }

    table.updatedAt = new Date().toISOString();
    table.preview = createPreviewFromGameState(table.gameState);
    table.log.push({
      id: randomUUID(),
      type: 'action',
      action,
      amount,
      actor: socket.data.name,
      timestamp: table.updatedAt,
    });

    if (table.gameState.finished) {
      const replayId = randomUUID();
      const replay = {
        id: replayId,
        tableId: table.id,
        tableName: table.tableName,
        modeId: table.modeId,
        finishedAt: table.updatedAt,
        gameState: table.gameState,
        log: table.log,
        players: table.players,
      };

      await saveReplay(replay);
      table.replayId = replayId;
      table.replayUrl = `/replay/${replayId}`;
      table.phase = 'finished';
    }

    io.to(tableId).emit('table:update', table);
  });

  socket.on('media:state', ({ tableId, enabled, role, muted }) => {
    const table = tables.get(tableId);

    if (!table) {
      return;
    }

    if ((role ?? socket.data.role) !== 'host') {
      return;
    }

    table.media[socket.id] = {
      id: socket.id,
      name: socket.data.name ?? 'Guest',
      role: role ?? socket.data.role ?? 'player',
      enabled: Boolean(enabled),
      muted: Boolean(muted),
      updatedAt: new Date().toISOString(),
    };

    io.to(tableId).emit('media:update', table.media);
  });

  socket.on('media:signal', ({ to, signal, tableId }) => {
    if (!to || !signal || !tableId) {
      return;
    }

    io.to(to).emit('media:signal', {
      from: socket.id,
      signal,
      tableId,
      name: socket.data.name ?? 'Guest',
    });
  });

  socket.on('chat:message', ({ tableId, message, emoji = '⭐' }) => {
    const table = tables.get(tableId);

    if (!table) {
      return;
    }

    const entry = {
      id: randomUUID(),
      name: socket.data.name ?? 'Guest',
      message,
      emoji,
      timestamp: new Date().toISOString(),
    };

    table.log.push({ ...entry, type: 'chat-message' });
    io.to(tableId).emit('chat:message', entry);
  });

  socket.on('disconnect', () => {
    const table = tables.get(socket.data.tableId);

    if (!table) {
      return;
    }

    table.players = table.players.filter((player) => player.id !== socket.id);
    table.spectators = table.spectators.filter((spectator) => spectator.id !== socket.id);
    delete table.media[socket.id];
    delete table.avatars[socket.id];
    table.updatedAt = new Date().toISOString();
    io.to(table.id).emit('table:update', table);
    io.to(table.id).emit('media:update', table.media);
  });
});

export function startServer(port = process.env.PORT || 3001) {
  if (serverStarted) {
    return httpServer;
  }

  serverStarted = true;

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      console.log(`RAZZKINGS server listening on http://localhost:${port}`);
      resolve(httpServer);
    });
  });
}

export function stopServer() {
  if (!serverStarted) {
    return;
  }

  httpServer.close();
  serverStarted = false;
}

if (process.argv[1]?.endsWith('server/index.js')) {
  startServer();
}

function createPreviewFromGameState(gameState) {
  return {
    dealerHand: gameState.dealerHand ?? [],
    communityCards: gameState.communityCards ?? [],
    playerHands: (gameState.seats ?? []).map((seat) => seat.hand ?? []),
  };
}