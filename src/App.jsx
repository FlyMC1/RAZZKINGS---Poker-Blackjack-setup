import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import logoUrl from '../472547406_9085022924947210_4288262986662297431_n.jpg';
import { buildPreviewHands, gameModes, getMode } from '../shared/game.js';

const apiBase = 'http://localhost:3001';
const socket = io(apiBase, { autoConnect: false });

const initialConfig = {
  modeId: 'texas-holdem',
  deckCount: 2,
  startingChips: 1000,
  maxPlayers: 6,
  tableName: 'RAZZKINGS Night Table',
};

const emojiBar = ['⭐', '🔥', '🎯', '🎲', '🃏', '💎'];

export default function App() {
  const profileStorageKey = 'razzkings-profile';
  const storedProfile = readStoredProfile(profileStorageKey);
  const [config, setConfig] = useState(initialConfig);
  const [table, setTable] = useState(null);
  const [roomName, setRoomName] = useState(storedProfile.roomName);
  const [avatarUrl, setAvatarUrl] = useState(storedProfile.avatarUrl);
  const [avatarPreview, setAvatarPreview] = useState(storedProfile.avatarUrl);
  const [chatText, setChatText] = useState('');
  const [chatFeed, setChatFeed] = useState([]);
  const [deviceClass, setDeviceClass] = useState(getDeviceClass());
  const [joinRole, setJoinRole] = useState('player');
  const [isJoined, setIsJoined] = useState(false);
  const [mediaEnabled, setMediaEnabled] = useState(false);
  const [queryTableId] = useState(() => new URLSearchParams(window.location.search).get('table'));
  const [queryReplayId] = useState(() => new URLSearchParams(window.location.search).get('replay'));
  const [replayData, setReplayData] = useState(null);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const autoJoinRef = useRef(false);

  const mode = useMemo(() => getMode(config.modeId), [config.modeId]);
  const preview = useMemo(
    () => buildPreviewHands(config.modeId, config.maxPlayers, config.deckCount),
    [config.deckCount, config.maxPlayers, config.modeId],
  );

  useEffect(() => {
    if (storedProfile.roomName !== roomName || storedProfile.avatarUrl !== avatarUrl || storedProfile.joinRole !== joinRole) {
      window.localStorage.setItem(profileStorageKey, JSON.stringify({ roomName, avatarUrl, joinRole }));
    }
  }, [avatarUrl, joinRole, profileStorageKey, roomName, storedProfile.avatarUrl, storedProfile.joinRole, storedProfile.roomName]);

  useEffect(() => {
    if (!queryReplayId) {
      return undefined;
    }

    let active = true;

    fetch(`${apiBase}/api/replays/${queryReplayId}`)
      .then((response) => response.json())
      .then((nextReplay) => {
        if (active) {
          setReplayData(nextReplay);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [queryReplayId]);

  useEffect(() => {
    if (!queryTableId) {
      return undefined;
    }

    let active = true;

    fetch(`${apiBase}/api/tables/${queryTableId}`)
      .then((response) => response.json())
      .then((nextTable) => {
        if (active) {
          setTable(nextTable);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [queryTableId]);

  useEffect(() => {
    if (!queryTableId || !table?.id || autoJoinRef.current) {
      return;
    }

    autoJoinRef.current = true;
    setIsJoined(true);

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit('table:join', {
      tableId: table.id,
      name: roomName,
      role: joinRole,
      avatarUrl,
    });
  }, [avatarUrl, joinRole, queryTableId, roomName, table?.id]);

  useEffect(() => {
    const onResize = () => setDeviceClass(getDeviceClass());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!table?.id || !isJoined) {
      return undefined;
    }

    socket.connect();
    socket.emit('table:join', { tableId: table.id, name: roomName, role: joinRole, avatarUrl });

    const handleReconnect = () => {
      socket.emit('table:join', { tableId: table.id, name: roomName, role: joinRole, avatarUrl });
    };

    const handleUpdate = (nextTable) => setTable(nextTable);
    const handleMessage = (entry) => setChatFeed((current) => [entry, ...current].slice(0, 20));

    socket.on('table:update', handleUpdate);
    socket.on('chat:message', handleMessage);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('table:update', handleUpdate);
      socket.off('chat:message', handleMessage);
      socket.off('connect', handleReconnect);
    };
  }, [avatarUrl, isJoined, joinRole, roomName, table?.id]);

  async function createTable() {
    const response = await fetch(`${apiBase}/api/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    const nextTable = await response.json();
    setTable({ ...nextTable, preview: buildPreviewHands(nextTable.modeId, nextTable.maxPlayers, nextTable.deckCount) });
    setChatFeed([]);
  }

  async function startTable() {
    if (!table?.id) {
      return;
    }

    const response = await fetch(`${apiBase}/api/tables/${table.id}/start`, { method: 'POST' });
    const nextTable = await response.json();
    setTable(nextTable);
  }

  async function triggerAction(action) {
    if (!table?.id) {
      return;
    }

    socket.emit('table:action', {
      tableId: table.id,
      action,
      amount: 10,
    });
  }

  async function enableMedia() {
    if (!navigator.mediaDevices?.getUserMedia) {
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    setMediaEnabled(true);

    if (table?.id) {
      socket.emit('media:state', {
        tableId: table.id,
        enabled: true,
        role: 'host',
        muted: false,
      });
    }
  }

  function disableMedia() {
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
    }

    localStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    setMediaEnabled(false);

    if (table?.id) {
      socket.emit('media:state', {
        tableId: table.id,
        enabled: false,
        role: 'host',
        muted: true,
      });
    }
  }

  function handleAvatarUpload(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const nextAvatar = String(reader.result ?? '');
      setAvatarUrl(nextAvatar);
      setAvatarPreview(nextAvatar);
    };
    reader.readAsDataURL(file);
  }

  function joinTable() {
    if (!table?.id) {
      return;
    }

    setIsJoined(true);

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit('table:join', {
      tableId: table.id,
      name: roomName,
      role: joinRole,
      avatarUrl,
    });
  }

  function sendChat(emoji = '⭐') {
    if (!table?.id || !chatText.trim()) {
      return;
    }

    socket.emit('chat:message', {
      tableId: table.id,
      message: chatText.trim(),
      emoji,
    });

    setChatText('');
  }

  const livePreview = table?.preview ?? preview;
  const replayPreview = replayData?.gameState
    ? {
        dealerHand: replayData.gameState.dealerHand ?? [],
        communityCards: replayData.gameState.communityCards ?? [],
        playerHands: (replayData.gameState.seats ?? []).map((seat) => seat.hand ?? []),
      }
    : null;
  const actionButtons = mode.actionSet;
  const joinUrl = table ? `${window.location.origin}?table=${table.id}` : 'Create a table to generate a join link';
  const joinLabel = joinRole === 'spectator' ? 'Join as spectator' : 'Join as player';
  const replayUrl = table?.replayId ? `${window.location.origin}?replay=${table.replayId}` : null;
  const hostAvatar = table?.players?.[0]?.avatarUrl ?? avatarPreview;

  if (queryReplayId && replayData) {
    return (
      <div className={`app-shell device-${deviceClass}`}>
        <main className="layout-grid replay-layout">
          <section className="hero-card">
            <div className="hero-top">
              <img className="brand-logo" src={logoUrl} alt="RAZZKINGS logo" />
              <div>
                <p className="eyebrow">Replay mode</p>
                <h1>{replayData.tableName}</h1>
                <p className="subtitle">Finished {new Date(replayData.finishedAt).toLocaleString()}</p>
              </div>
            </div>
            <div className="replay-summary">
              <strong>{replayData.gameState?.result?.label ?? 'Replay loaded'}</strong>
              <p>{replayData.gameState?.result ? JSON.stringify(replayData.gameState.result, null, 2) : 'No result data available.'}</p>
            </div>
            <div className="link-box">
              <span>Replay link</span>
              <strong>{`${window.location.origin}?replay=${queryReplayId}`}</strong>
            </div>
          </section>

          <section className="stage-card">
            <div className="stage-header">
              <div>
                <p className="eyebrow">{getMode(replayData.modeId).label}</p>
                <h2>Replay table</h2>
              </div>
              <div className="status-pill">finished</div>
            </div>
            <div className="stage-grid">
              <article className="seat seat-dealer">
                <span>Dealer seat</span>
                <div className="card-stack">
                  {replayPreview.dealerHand.length ? replayPreview.dealerHand.map((card) => <CardChip key={card.id} card={card} />) : <SeatPlaceholder />}
                </div>
              </article>
              <article className="seat seat-community">
                <span>Community / board</span>
                <div className="card-stack board-stack">
                  {replayPreview.communityCards.length ? replayPreview.communityCards.map((card) => <CardChip key={card.id} card={card} />) : <SeatPlaceholder />}
                </div>
              </article>
              {replayPreview.playerHands.map((hand, index) => (
                <article className="seat" key={`replay-seat-${index}`}>
                  <span>{replayData.players?.[index]?.name ?? `Seat ${index + 1}`}</span>
                  <div className="card-stack">
                    {hand.length ? hand.map((card) => <CardChip key={card.id} card={card} />) : <SeatPlaceholder />}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={`app-shell device-${deviceClass}`}>
      <main className="layout-grid">
        <section className="hero-card">
          <div className="hero-top">
            <img className="brand-logo" src={logoUrl} alt="RAZZKINGS logo" />
            <div>
              <p className="eyebrow">Host device control room</p>
              <h1>RAZZKINGS</h1>
              <p className="subtitle">
                Launch a play-money poker room with live players, spectators, chat, and replay-ready sessions.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Game
              <select
                value={config.modeId}
                onChange={(event) => setConfig((current) => ({ ...current, modeId: event.target.value }))}
              >
                {gameModes.map((gameMode) => (
                  <option key={gameMode.id} value={gameMode.id}>
                    {gameMode.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Starting chips
              <input
                type="number"
                min="100"
                step="100"
                value={config.startingChips}
                onChange={(event) => setConfig((current) => ({ ...current, startingChips: Number(event.target.value) }))}
              />
            </label>

            <label>
              Deck count
              <input
                type="number"
                min={mode.deckRange[0]}
                max={mode.deckRange[1]}
                value={config.deckCount}
                onChange={(event) => setConfig((current) => ({ ...current, deckCount: Number(event.target.value) }))}
              />
            </label>

            <label>
              Max players
              <input
                type="number"
                min="2"
                max={mode.seats}
                value={config.maxPlayers}
                onChange={(event) => setConfig((current) => ({ ...current, maxPlayers: Number(event.target.value) }))}
              />
            </label>

            <label className="wide">
              Table name
              <input
                value={config.tableName}
                onChange={(event) => setConfig((current) => ({ ...current, tableName: event.target.value }))}
              />
            </label>

            <label className="wide">
              Upload your picture
              <input type="file" accept="image/*" onChange={handleAvatarUpload} />
            </label>

            {avatarPreview ? (
              <div className="avatar-preview wide">
                <img src={avatarPreview} alt="Uploaded avatar preview" />
                <span>Your uploaded picture will show on your seat.</span>
              </div>
            ) : null}
          </div>

          <div className="action-row">
            <button className="primary" onClick={createTable}>Create table</button>
            <button className="secondary" onClick={startTable} disabled={!table}>
              Start live session
            </button>
          </div>

          <div className="link-box">
            <span>Player / spectator link</span>
            <strong>{joinUrl}</strong>
          </div>
        </section>

        <section className="stage-card">
          <div className="stage-header">
            <div>
              <p className="eyebrow">{mode.label}</p>
              <h2>{table?.tableName ?? config.tableName}</h2>
            </div>
            <div className="status-pill">{table?.phase ?? 'draft'}</div>
          </div>

          <div className="stage-grid">
            <article className="seat seat-dealer">
              <span>Dealer seat</span>
              <SeatAvatar avatarUrl={hostAvatar} label="Host image" />
              <div className="card-stack">
                {livePreview.dealerHand.length ? livePreview.dealerHand.map((card) => <CardChip key={card.id} card={card} />) : <SeatPlaceholder />}
              </div>
            </article>

            <article className="seat seat-community">
              <span>Community / board</span>
              <div className="card-stack board-stack">
                {livePreview.communityCards.length ? livePreview.communityCards.map((card) => <CardChip key={card.id} card={card} />) : <SeatPlaceholder />}
              </div>
            </article>

            {livePreview.playerHands.slice(0, config.maxPlayers).map((hand, index) => (
              <article className="seat" key={`seat-${index}`}>
                <span>Seat {index + 1}</span>
                <SeatAvatar avatarUrl={table?.players?.[index]?.avatarUrl ?? avatarPreview} label="Player image" />
                <div className="card-stack">
                  {hand.length ? hand.map((card) => <CardChip key={card.id} card={card} />) : <SeatPlaceholder />}
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="side-panel">
          <section className="panel-card">
            <h3>Join table</h3>
            <div className="chat-input-row">
              <input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Your name" />
            </div>
            <div className="chat-input-row">
              <select value={joinRole} onChange={(event) => setJoinRole(event.target.value)}>
                <option value="player">Player</option>
                <option value="spectator">Spectator</option>
              </select>
            </div>
            <div className="chat-input-row">
              <input type="file" accept="image/*" onChange={handleAvatarUpload} />
            </div>
            <button className="primary" type="button" onClick={joinTable} disabled={!table}>
              {joinLabel}
            </button>
          </section>

          <section className="panel-card">
            <h3>Turn actions</h3>
            <div className="button-stack">
              {actionButtons.map((action) => (
                <button key={action} className="ghost" type="button" onClick={() => triggerAction(action)}>
                  {action}
                </button>
              ))}
            </div>
            <button className="secondary action-wide" type="button" onClick={() => triggerAction('finish')}>
              Finish table and save replay
            </button>
          </section>

          <section className="panel-card">
            <h3>Host live feed</h3>
            <div className="media-actions">
              <button className="secondary" type="button" onClick={enableMedia} disabled={mediaEnabled}>
                Start host camera and mic
              </button>
              <button className="secondary" type="button" onClick={disableMedia} disabled={!mediaEnabled}>
                Stop host camera and mic
              </button>
            </div>
            <video className="media-preview" ref={localVideoRef} autoPlay playsInline muted />
            <div className="media-grid">
              <div className="media-slot active">Host feed shown to table</div>
              <div className="media-slot">Player images only</div>
              <div className="media-slot">No player video</div>
              <div className="media-slot">Replay ready</div>
            </div>
            <div className="roster-list">
              <div className="roster-item">
                <strong>Host</strong>
                <span>live feed only</span>
              </div>
            </div>
          </section>

          <section className="panel-card chat-panel">
            <h3>Spectator chat</h3>
            <div className="chat-input-row">
              <input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Type a message" />
              <button className="primary" type="button" onClick={() => sendChat()}>Send</button>
            </div>
            <div className="emoji-row">
              {emojiBar.map((emoji) => (
                <button key={emoji} className="emoji-button" type="button" onClick={() => sendChat(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
            <div className="chat-feed">
              {chatFeed.length ? chatFeed.map((entry) => <ChatEntry key={entry.id} entry={entry} />) : <p className="muted">No chat yet.</p>}
            </div>
            {replayUrl ? (
              <div className="replay-box">
                <span>Replay link</span>
                <a href={replayUrl} target="_blank" rel="noreferrer">{replayUrl}</a>
              </div>
            ) : null}
          </section>
        </aside>
      </main>
    </div>
  );
}

function CardChip({ card }) {
  return (
    <div className={`card-chip suit-${card.suit}`}>
      <span>{card.rank}</span>
      <small>{card.suit}</small>
    </div>
  );
}

function SeatAvatar({ avatarUrl, label }) {
  if (!avatarUrl) {
    return <div className="seat-placeholder">{label}</div>;
  }

  return <img className="seat-avatar" src={avatarUrl} alt={label} />;
}

function SeatPlaceholder() {
  return <div className="seat-placeholder">Awaiting deal</div>;
}

function ChatEntry({ entry }) {
  return (
    <article className="chat-entry">
      <strong>{entry.emoji} {entry.name}</strong>
      <p>{entry.message}</p>
    </article>
  );
}

function getDeviceClass() {
  if (window.innerWidth < 720) {
    return 'mobile';
  }

  if (window.innerWidth < 1100) {
    return 'tablet';
  }

  return 'desktop';
}

function readStoredProfile(profileStorageKey) {
  if (typeof window === 'undefined') {
    return { roomName: 'Dealer HQ', avatarUrl: '', joinRole: 'player' };
  }

  try {
    const stored = window.localStorage.getItem(profileStorageKey);

    if (!stored) {
      return { roomName: 'Dealer HQ', avatarUrl: '', joinRole: 'player' };
    }

    const parsed = JSON.parse(stored);
    return {
      roomName: typeof parsed.roomName === 'string' && parsed.roomName.trim() ? parsed.roomName : 'Dealer HQ',
      avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : '',
      joinRole: parsed.joinRole === 'spectator' ? 'spectator' : 'player',
    };
  } catch {
    return { roomName: 'Dealer HQ', avatarUrl: '', joinRole: 'player' };
  }
}