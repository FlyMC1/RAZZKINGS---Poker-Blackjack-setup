import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import QRCode from 'qrcode';
import logoUrl from '../472547406_9085022924947210_4288262986662297431_n.jpg';
import { buildPreviewHands, gameModes, getMode } from '../shared/game.js';

const apiBase = getApiBaseUrl();
const socket = io(apiBase, { autoConnect: false });

const initialConfig = {
  modeId: 'texas-holdem',
  deckCount: 2,
  startingChips: 1000,
  maxPlayers: 6,
  tableName: 'RAZZKINGS Night Table',
  publicBaseUrl: '',
};

const emojiBar = ['⭐', '🔥', '🎯', '🎲', '🃏', '💎'];
const modeRules = {
  blackjack: [
    'Try to finish closer to 21 than the dealer without going over.',
    'Use Hit for another card, Stand to lock your hand, Double to add a stronger wager and draw one final card.',
    'Winning hands gain tokens and busted hands lose the round tokens.',
  ],
  'texas-holdem': [
    'Each player gets 2 private cards and shares 5 community cards.',
    'Use Fold, Check, Call, and Raise during each street until showdown.',
    'Best 5-card hand wins the pot and token stacks carry into the next round.',
  ],
  'classic-poker': [
    'Each player is dealt 5 cards and can choose draw or hold actions.',
    'Betting actions use your visible token stack.',
    'Best hand wins the pot, and rounds continue until one token winner remains.',
  ],
};

export default function App() {
  const profileStorageKey = 'razzkings-profile';
  const storedProfile = readStoredProfile(profileStorageKey);
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);

  const [config, setConfig] = useState(initialConfig);
  const [table, setTable] = useState(null);
  const [roomName, setRoomName] = useState(storedProfile.roomName);
  const [avatarUrl, setAvatarUrl] = useState(storedProfile.avatarUrl);
  const [avatarPreview, setAvatarPreview] = useState(storedProfile.avatarUrl);
  const [chatText, setChatText] = useState('');
  const [chatFeed, setChatFeed] = useState([]);
  const [isJoined, setIsJoined] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [mediaEnabled, setMediaEnabled] = useState(false);
  const [replayData, setReplayData] = useState(null);
  const [playerQrCode, setPlayerQrCode] = useState('');
  const [spectatorQrCode, setSpectatorQrCode] = useState('');
  const [showPlayerQr, setShowPlayerQr] = useState(false);
  const [showSpectatorQr, setShowSpectatorQr] = useState(false);
  const [betAmount, setBetAmount] = useState(10);
  const [showRules, setShowRules] = useState(false);

  const queryTableId = urlParams.get('table');
  const queryReplayId = urlParams.get('replay');
  const queryRole = normalizeRole(urlParams.get('role'));
  const queryToken = urlParams.get('token') ?? '';

  const isLinkSession = Boolean(queryTableId && queryRole && queryToken);
  const isHostView = !isLinkSession && !queryReplayId;

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);

  const mode = useMemo(() => getMode(table?.modeId ?? config.modeId), [config.modeId, table?.modeId]);
  const preview = useMemo(
    () => buildPreviewHands(config.modeId, config.maxPlayers, config.deckCount),
    [config.deckCount, config.maxPlayers, config.modeId],
  );

  const seatCount = table?.maxPlayers ?? config.maxPlayers;
  const stageState = table?.gameState ?? null;
  const livePreview = table?.preview ?? preview;
  const mySeat = stageState?.seats?.find((seat) => seat.socketId === socket.id) ?? null;
  const isMyTurn = Boolean(stageState?.seats?.[stageState.currentSeatIndex]?.socketId === socket.id);

  const playerJoinUrl = table
    ? `${table.baseUrl ?? apiBase}/?table=${table.id}&role=player&token=${table.playerJoinToken}`
    : 'Create a table to generate links';
  const spectatorJoinUrl = table
    ? `${table.baseUrl ?? apiBase}/?table=${table.id}&role=spectator&token=${table.spectatorJoinToken}`
    : 'Create a table to generate links';
  const replayUrl = table?.replayId ? `${table.baseUrl ?? apiBase}/?replay=${table.replayId}` : null;

  const waitingLabel = queryRole === 'spectator' ? 'Watching table. Waiting for host to start.' : 'You are seated. Waiting for host to start.';
  const showJoinPanel = !isHostView && !isJoined;
  const ruleSet = modeRules[mode.id] ?? [];
  const chipStandings = useMemo(
    () => [...(table?.players ?? [])].sort((left, right) => Number(right.chips ?? 0) - Number(left.chips ?? 0)),
    [table?.players],
  );

  const displaySeats = useMemo(() => {
    if (!seatCount) {
      return [];
    }

    const arranged = Array.from({ length: seatCount }, (_, seatIndex) => ({
      seatIndex,
      name: `Seat ${seatIndex + 1}`,
      avatarUrl: '',
      hand: [],
      occupied: false,
    }));

    if (stageState?.seats?.length) {
      for (const seat of stageState.seats) {
        const index = Number.isInteger(seat.seatIndex) ? seat.seatIndex : arranged.findIndex((entry) => !entry.occupied);
        if (index < 0 || index >= arranged.length) {
          continue;
        }

        arranged[index] = {
          seatIndex: index,
          name: seat.name ?? `Seat ${index + 1}`,
          avatarUrl: seat.avatarUrl ?? '',
          hand: seat.hand ?? [],
          occupied: true,
        };
      }

      return arranged;
    }

    for (const player of table?.players ?? []) {
      const index = Number.isInteger(player.seatIndex) ? player.seatIndex : arranged.findIndex((entry) => !entry.occupied);
      if (index < 0 || index >= arranged.length) {
        continue;
      }

      arranged[index] = {
        seatIndex: index,
        name: player.name ?? `Seat ${index + 1}`,
        avatarUrl: player.avatarUrl ?? '',
        hand: livePreview.playerHands?.[index] ?? [],
        occupied: true,
      };
    }

    return arranged;
  }, [livePreview.playerHands, seatCount, stageState?.seats, table?.players]);

  useEffect(() => {
    if (storedProfile.roomName !== roomName || storedProfile.avatarUrl !== avatarUrl) {
      window.localStorage.setItem(profileStorageKey, JSON.stringify({ roomName, avatarUrl }));
    }
  }, [avatarUrl, profileStorageKey, roomName, storedProfile.avatarUrl, storedProfile.roomName]);

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
    if (!table?.id || !isJoined) {
      return undefined;
    }

    if (!socket.connected) {
      socket.connect();
    }

    const handleUpdate = (nextTable) => setTable(nextTable);
    const handleMessage = (entry) => setChatFeed((current) => [entry, ...current].slice(0, 30));
    const handleError = (message) => setJoinError(String(message ?? 'Unable to join table.'));

    socket.on('table:update', handleUpdate);
    socket.on('chat:message', handleMessage);
    socket.on('table:error', handleError);

    return () => {
      socket.off('table:update', handleUpdate);
      socket.off('chat:message', handleMessage);
      socket.off('table:error', handleError);
    };
  }, [isJoined, table?.id]);

  useEffect(() => {
    let active = true;

    if (!table?.id) {
      setPlayerQrCode('');
      setSpectatorQrCode('');
      return undefined;
    }

    Promise.all([
      QRCode.toDataURL(playerJoinUrl, { width: 200, margin: 1 }),
      QRCode.toDataURL(spectatorJoinUrl, { width: 200, margin: 1 }),
    ])
      .then(([playerCode, spectatorCode]) => {
        if (active) {
          setPlayerQrCode(playerCode);
          setSpectatorQrCode(spectatorCode);
        }
      })
      .catch(() => {
        if (active) {
          setPlayerQrCode('');
          setSpectatorQrCode('');
        }
      });

    return () => {
      active = false;
    };
  }, [playerJoinUrl, spectatorJoinUrl, table?.id]);

  async function createTable() {
    const payload = {
      ...config,
      publicBaseUrl: config.publicBaseUrl.trim(),
    };

    const response = await fetch(`${apiBase}/api/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const nextTable = await response.json();
    setTable({ ...nextTable, preview: buildPreviewHands(nextTable.modeId, nextTable.maxPlayers, nextTable.deckCount) });
    setChatFeed([]);

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit('table:join', {
      tableId: nextTable.id,
      name: roomName,
      role: 'player',
      avatarUrl,
      token: nextTable.playerJoinToken,
    });

    setIsJoined(true);
  }

  async function startTable() {
    if (!table?.id) {
      return;
    }

    setJoinError('');
    const response = await fetch(`${apiBase}/api/tables/${table.id}/start`, { method: 'POST' });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({ error: 'Unable to start table.' }));
      setJoinError(errorPayload.error ?? 'Unable to start table.');
      return;
    }

    const nextTable = await response.json();
    setTable(nextTable);
  }

  function joinTable() {
    if (!table?.id) {
      return;
    }

    setJoinError('');

    if (!socket.connected) {
      socket.connect();
    }

    const role = isLinkSession ? queryRole : 'player';
    const token = isLinkSession
      ? queryToken
      : role === 'spectator'
        ? table.spectatorJoinToken
        : table.playerJoinToken;

    socket.emit('table:join', {
      tableId: table.id,
      name: roomName,
      role,
      avatarUrl,
      token,
    });

    setIsJoined(true);
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

  function triggerAction(action) {
    if (!table?.id || !isJoined) {
      return;
    }

    socket.emit('table:action', {
      tableId: table.id,
      action,
      amount: Number(betAmount) || 10,
    });
  }

  function sendChat(emoji = '⭐') {
    if (!table?.id || !isJoined) {
      return;
    }

    const message = chatText.trim() || 'reacted';

    socket.emit('chat:message', {
      tableId: table.id,
      message,
      emoji,
    });

    if (chatText.trim()) {
      setChatText('');
    }
  }

  if (queryReplayId && replayData) {
    const replayState = replayData.finalGameState ?? replayData.gameState;
    return (
      <div className="app-shell replay-screen">
        <section className="host-sidebar">
          <div className="hero-top">
            <img className="brand-logo" src={logoUrl} alt="RAZZKINGS logo" />
            <div>
              <p className="eyebrow">Replay mode</p>
              <h1 className="brand-title">{replayData.tableName}</h1>
              <p className="subtitle">Finished {new Date(replayData.finishedAt).toLocaleString()}</p>
            </div>
          </div>
          <div className="link-box">
            <span>Replay link</span>
            <strong>{`${apiBase}/?replay=${queryReplayId}`}</strong>
            <span className="muted">Rounds captured: {replayData.rounds?.length ?? 1}</span>
          </div>
        </section>
        <section className="table-stage">
          <header className="table-head">
            <h2>Replay Table</h2>
            <div className="status-pill">finished</div>
          </header>
          <div className="table-felt">
            <SeatCards label="Dealer" cards={replayState?.dealerHand ?? []} />
            <SeatCards label="Board" cards={replayState?.communityCards ?? []} isBoard />
            {(replayState?.seats ?? []).map((seat, index) => (
              <SeatCards key={`replay-seat-${seat.id ?? index}`} label={seat.name ?? `Seat ${index + 1}`} cards={seat.hand ?? []} />
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className={`app-layout ${isHostView ? 'host-mode' : 'join-mode'}`}>
        {isHostView ? (
          <section className="host-sidebar">
            <div className="hero-top">
              <img className="brand-logo" src={logoUrl} alt="RAZZKINGS logo" />
              <div>
                <p className="eyebrow">Host control</p>
                <h1 className="brand-title">RAZZKINGS</h1>
                <p className="subtitle">Host from this PC with separate player and spectator links.</p>
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
                  min="1"
                  max={mode.seats}
                  value={config.maxPlayers}
                  onChange={(event) => setConfig((current) => ({ ...current, maxPlayers: Number(event.target.value) }))}
                />
              </label>
              <label className="wide">
                Table name
                <input value={config.tableName} onChange={(event) => setConfig((current) => ({ ...current, tableName: event.target.value }))} />
              </label>
              <label className="wide">
                Public URL override (optional)
                <input
                  value={config.publicBaseUrl}
                  placeholder="https://your-public-host.example"
                  onChange={(event) => setConfig((current) => ({ ...current, publicBaseUrl: event.target.value }))}
                />
              </label>
              <p className="muted wide">
                Use this only when sharing outside your local network, such as a router-forwarded domain or tunnel URL.
              </p>
              <label className="wide">
                Host picture
                <input type="file" accept="image/*" onChange={handleAvatarUpload} />
              </label>
              {avatarPreview ? (
                <div className="avatar-preview wide">
                  <img src={avatarPreview} alt="Host avatar preview" />
                  <span>Used for your own seat only.</span>
                </div>
              ) : null}
            </div>

            <div className="action-row">
              <button className="primary" onClick={createTable}>Create table</button>
              <button className="secondary" onClick={startTable} disabled={!table}>Start game</button>
              <button className="ghost" onClick={joinTable} disabled={!table || isJoined}>Join dealer seat</button>
            </div>
            {joinError ? <p className="error-text">{joinError}</p> : null}

            <div className="link-box">
              <span>Player join link</span>
              <strong>{playerJoinUrl}</strong>
              <div className="link-tools">
                <button className="ghost" type="button" onClick={() => setShowPlayerQr((current) => !current)} disabled={!playerQrCode}>
                  {showPlayerQr ? 'Hide QR' : 'Show QR'}
                </button>
              </div>
              {showPlayerQr && playerQrCode ? (
                <img className="qr-image" src={playerQrCode} alt="Player join QR code" />
              ) : null}
            </div>
            <div className="link-box">
              <span>Spectator watch link</span>
              <strong>{spectatorJoinUrl}</strong>
              <div className="link-tools">
                <button className="ghost" type="button" onClick={() => setShowSpectatorQr((current) => !current)} disabled={!spectatorQrCode}>
                  {showSpectatorQr ? 'Hide QR' : 'Show QR'}
                </button>
              </div>
              {showSpectatorQr && spectatorQrCode ? (
                <img className="qr-image" src={spectatorQrCode} alt="Spectator join QR code" />
              ) : null}
            </div>
          </section>
        ) : showJoinPanel ? (
          <section className="join-panel join-panel-desktop">
            <div className="hero-top">
              <img className="brand-logo" src={logoUrl} alt="RAZZKINGS logo" />
              <div>
                <p className="eyebrow">{queryRole === 'spectator' ? 'Spectator entry' : 'Player entry'}</p>
                <h1 className="brand-title">Join Table</h1>
                <p className="subtitle">Enter your name and optional picture, then take your seat.</p>
              </div>
            </div>
            <div className="form-grid">
              <label className="wide">
                Display name
                <input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Your name" />
              </label>
              <label className="wide">
                Picture (optional)
                <input type="file" accept="image/*" onChange={handleAvatarUpload} />
              </label>
              {avatarPreview ? (
                <div className="avatar-preview wide">
                  <img src={avatarPreview} alt="Player avatar preview" />
                  <span>This image will only appear on your own seat.</span>
                </div>
              ) : null}
            </div>
            <button className="primary" type="button" onClick={joinTable} disabled={!table || isJoined}>
              {queryRole === 'spectator' ? 'Join as spectator' : 'Join and take seat'}
            </button>
            {joinError ? <p className="error-text">{joinError}</p> : null}
          </section>
        ) : null}

        <section className="table-stage">
          <header className="table-head">
            <div>
              <p className="eyebrow">{mode.label}</p>
              <h2>{table?.tableName ?? config.tableName}</h2>
            </div>
            <div className="table-head-actions">
              <button className="ghost" type="button" onClick={() => setShowRules((current) => !current)}>
                {showRules ? 'Hide Rules' : 'Rules'}
              </button>
              <div className="status-pill">{table?.phase ?? 'draft'}</div>
            </div>
          </header>

          {showRules ? (
            <section className="rules-panel">
              <h3>How To Play {mode.label}</h3>
              <ul>
                {ruleSet.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="host-feed-strip">
            <div className="host-feed-text">
              <strong>Host feed</strong>
              <span>Top-center feed for all viewers</span>
            </div>
            <video className="media-preview" ref={localVideoRef} autoPlay playsInline muted />
            {isHostView ? (
              <div className="media-actions">
                <button className="secondary" type="button" onClick={enableMedia} disabled={mediaEnabled}>Start feed</button>
                <button className="secondary" type="button" onClick={disableMedia} disabled={!mediaEnabled}>Stop feed</button>
              </div>
            ) : null}
          </div>

          {showJoinPanel ? (
            <section className="join-panel join-panel-mobile">
              <div className="hero-top">
                <img className="brand-logo" src={logoUrl} alt="RAZZKINGS logo" />
                <div>
                  <p className="eyebrow">{queryRole === 'spectator' ? 'Spectator entry' : 'Player entry'}</p>
                  <h1 className="brand-title">Join Table</h1>
                  <p className="subtitle">Enter your name and optional picture, then take your seat.</p>
                </div>
              </div>
              <div className="form-grid">
                <label className="wide">
                  Display name
                  <input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Your name" />
                </label>
                <label className="wide">
                  Picture (optional)
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} />
                </label>
                {avatarPreview ? (
                  <div className="avatar-preview wide">
                    <img src={avatarPreview} alt="Player avatar preview" />
                    <span>This image will only appear on your own seat.</span>
                  </div>
                ) : null}
              </div>
              <button className="primary" type="button" onClick={joinTable} disabled={!table || isJoined}>
                {queryRole === 'spectator' ? 'Join as spectator' : 'Join and take seat'}
              </button>
              {joinError ? <p className="error-text">{joinError}</p> : null}
            </section>
          ) : null}

          <div className="table-felt">
            <SeatCards label="Dealer" cards={stageState?.dealerHand ?? livePreview.dealerHand ?? []} avatarUrl={isHostView ? avatarPreview : ''} />
            <SeatCards label="Community" cards={stageState?.communityCards ?? livePreview.communityCards ?? []} isBoard />

            <div className="seat-ring">
              {displaySeats.map((seat) => (
                <article className={`seat ${seat.occupied ? 'occupied' : ''}`} key={`seat-${seat.seatIndex}`}>
                  <span>{seat.name}</span>
                  <SeatAvatar avatarUrl={seat.avatarUrl} label={seat.name} />
                  <div className="card-stack">
                    {seat.hand.length ? seat.hand.map((card, index) => <CardView key={card.id} card={card} index={index} />) : <SeatPlaceholder />}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <footer className="player-hand-bar">
            <div>
              <strong>{mySeat?.name ?? 'Your hand'}</strong>
              <p className="muted">Your tokens: {Number(mySeat?.chips ?? 0)}</p>
              <p className="muted">Pot: {Number(stageState?.pot ?? 0)} | Round: {table?.roundNumber ?? 0}</p>
              <p className="muted">{isJoined ? (isMyTurn ? 'Your turn now.' : 'Waiting for your turn.') : 'Join table to take actions.'}</p>
            </div>
            <div className="card-stack hand-stack">
              {(mySeat?.hand ?? []).length
                ? mySeat.hand.map((card, index) => <CardView key={`my-${card.id}`} card={card} index={index} />)
                : <SeatPlaceholder text="Your cards appear here" />}
            </div>
            <div className="button-stack hand-actions">
              <label className="bet-input">
                Bet / Raise Tokens
                <input
                  type="number"
                  min="1"
                  max={Math.max(1, Number(mySeat?.chips ?? 1))}
                  value={betAmount}
                  onChange={(event) => setBetAmount(Number(event.target.value) || 1)}
                />
              </label>
              {mode.actionSet.map((action) => (
                <button key={action} className="ghost" type="button" onClick={() => triggerAction(action)} disabled={!isJoined || !isMyTurn || table?.phase !== 'live'}>
                  {action}
                </button>
              ))}
              {isHostView ? (
                <button className="secondary" type="button" onClick={() => triggerAction('finish')} disabled={!isJoined || table?.phase !== 'live'}>
                  Finish & save replay
                </button>
              ) : null}
            </div>
          </footer>

          <section className="token-board">
            <h3>Token Standings</h3>
            <div className="token-list">
              {chipStandings.length
                ? chipStandings.map((player) => (
                  <div key={player.id} className="token-item">
                    <span>{player.name}</span>
                    <strong>{Number(player.chips ?? 0)} tokens</strong>
                  </div>
                ))
                : <p className="muted">No players seated yet.</p>}
            </div>
          </section>
        </section>

        <aside className="chat-lane">
          <section className="panel-card chat-panel">
            <h3>Table chat</h3>
            <div className="chat-input-row">
              <input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Type a message" />
              <button className="primary" type="button" onClick={() => sendChat()} disabled={!isJoined}>Send</button>
            </div>
            <div className="emoji-row">
              {emojiBar.map((emoji) => (
                <button key={emoji} className="emoji-button" type="button" onClick={() => sendChat(emoji)} disabled={!isJoined}>
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

function SeatCards({ label, cards, avatarUrl = '', isBoard = false }) {
  return (
    <article className={`table-row ${isBoard ? 'table-board' : ''}`}>
      <span>{label}</span>
      {avatarUrl ? <SeatAvatar avatarUrl={avatarUrl} label={label} /> : null}
      <div className="card-stack center-stack">
        {cards.length ? cards.map((card, index) => <CardView key={card.id} card={card} index={index} />) : <SeatPlaceholder />}
      </div>
    </article>
  );
}

function CardView({ card, index }) {
  const suitMap = {
    spades: '♠',
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
  };

  return (
    <div className={`card-face suit-${card.suit}`} style={{ '--deal-delay': `${index * 90}ms` }}>
      <span className="card-corner">{card.rank}{suitMap[card.suit] ?? '?'}</span>
      <strong>{suitMap[card.suit] ?? '?'}</strong>
      <span className="card-corner inverted">{card.rank}{suitMap[card.suit] ?? '?'}</span>
    </div>
  );
}

function SeatAvatar({ avatarUrl, label }) {
  if (!avatarUrl) {
    return <div className="seat-placeholder tiny">No image</div>;
  }

  return <img className="seat-avatar" src={avatarUrl} alt={label} />;
}

function SeatPlaceholder({ text = 'Awaiting deal' }) {
  return <div className="seat-placeholder">{text}</div>;
}

function ChatEntry({ entry }) {
  return (
    <article className="chat-entry">
      <strong>{entry.emoji} {entry.name}</strong>
      <p>{entry.message}</p>
    </article>
  );
}

function readStoredProfile(profileStorageKey) {
  if (typeof window === 'undefined') {
    return { roomName: 'Player', avatarUrl: '' };
  }

  try {
    const stored = window.localStorage.getItem(profileStorageKey);

    if (!stored) {
      return { roomName: 'Player', avatarUrl: '' };
    }

    const parsed = JSON.parse(stored);
    return {
      roomName: typeof parsed.roomName === 'string' && parsed.roomName.trim() ? parsed.roomName : 'Player',
      avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : '',
    };
  } catch {
    return { roomName: 'Player', avatarUrl: '' };
  }
}

function normalizeRole(role) {
  if (role === 'spectator') {
    return 'spectator';
  }

  if (role === 'player') {
    return 'player';
  }

  return '';
}

function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return window.location.origin;
  }

  return 'http://localhost:3001';
}
