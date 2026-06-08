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
const cardModeIds = new Set(['blackjack', 'texas-holdem', 'classic-poker']);
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
  const querySection = normalizeSection(urlParams.get('section'));
  const queryRole = normalizeRole(urlParams.get('role'));
  const queryToken = urlParams.get('token') ?? '';

  const isLinkSession = Boolean(queryTableId && queryRole && queryToken);
  const isHostView = !isLinkSession && !queryReplayId;

  const [hostSection, setHostSection] = useState(querySection);
  const [raffleEntriesText, setRaffleEntriesText] = useState('');
  const [raffleEntries, setRaffleEntries] = useState([]);
  const [raffleEvents, setRaffleEvents] = useState([]);
  const [raffleWinners, setRaffleWinners] = useState([]);
  const [duckEntriesText, setDuckEntriesText] = useState('');
  const [duckEntries, setDuckEntries] = useState([]);
  const [duckEvents, setDuckEvents] = useState([]);
  const [duckWinner, setDuckWinner] = useState('');
  const [duckRacing, setDuckRacing] = useState(false);

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
  const currentTurnSeatIndex = Number.isInteger(stageState?.seats?.[stageState.currentSeatIndex]?.seatIndex)
    ? stageState.seats[stageState.currentSeatIndex].seatIndex
    : -1;

  const activeSection = hostSection || 'card-games';
  const playerJoinUrl = table
    ? `${table.baseUrl ?? apiBase}/?table=${table.id}&section=${activeSection}&role=player&token=${table.playerJoinToken}`
    : 'Create a table to generate links';
  const spectatorJoinUrl = table
    ? `${table.baseUrl ?? apiBase}/?table=${table.id}&section=${activeSection}&role=spectator&token=${table.spectatorJoinToken}`
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
          hand: [],
        occupied: true,
      };
    }

    return arranged;
  }, [seatCount, stageState?.seats, table?.players]);

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
    if (!isHostView) {
      return;
    }

    setHostSection(querySection);
  }, [isHostView, querySection]);

  useEffect(() => {
    setRaffleEntries(extractEntries(raffleEntriesText));
  }, [raffleEntriesText]);

  useEffect(() => {
    setDuckEntries(extractEntries(duckEntriesText));
  }, [duckEntriesText]);

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

  async function createModuleSession(modeId, tableName) {
    const response = await fetch(`${apiBase}/api/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modeId,
        tableName,
        maxPlayers: 1,
        deckCount: 1,
        startingChips: 1000,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const nextTable = await response.json();
    setTable(nextTable);

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit('table:join', {
      tableId: nextTable.id,
      name: roomName,
      role: 'spectator',
      avatarUrl,
      token: nextTable.spectatorJoinToken,
    });

    setIsJoined(true);
    return nextTable;
  }

  async function pushRaffleEntries() {
    let targetTable = table;

    if (!table?.id || table.modeId !== 'raffle-wheel') {
      const created = await createModuleSession('raffle-wheel', 'RAZZKINGS Raffle Wheel');
      if (!created) {
        return;
      }

      targetTable = created;
    }

    await fetch(`${apiBase}/api/tables/${targetTable.id}/raffle/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: raffleEntriesText }),
    });
  }

  async function pushDuckEntries() {
    let targetTable = table;

    if (!table?.id || table.modeId !== 'duck-races') {
      const created = await createModuleSession('duck-races', 'RAZZKINGS Duck Races');
      if (!created) {
        return;
      }

      targetTable = created;
    }

    await fetch(`${apiBase}/api/tables/${targetTable.id}/duck/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: duckEntriesText }),
    });
  }

  async function hostJumbleRaffle() {
    if (!table?.id || table.modeId !== 'raffle-wheel') {
      return;
    }

    await fetch(`${apiBase}/api/tables/${table.id}/raffle/jumble`, { method: 'POST' });
  }

  async function hostSpinRaffle() {
    if (!table?.id || table.modeId !== 'raffle-wheel') {
      return;
    }

    await fetch(`${apiBase}/api/tables/${table.id}/raffle/spin`, { method: 'POST' });
  }

  async function hostJumbleDucks() {
    if (!table?.id || table.modeId !== 'duck-races') {
      return;
    }

    await fetch(`${apiBase}/api/tables/${table.id}/duck/jumble`, { method: 'POST' });
  }

  async function hostRaceDucks() {
    if (!table?.id || table.modeId !== 'duck-races' || duckRacing) {
      return;
    }

    setDuckRacing(true);
    await fetch(`${apiBase}/api/tables/${table.id}/duck/race`, { method: 'POST' });
    window.setTimeout(() => setDuckRacing(false), 900);
  }

  async function finishModuleSession() {
    if (!table?.id || (table.modeId !== 'raffle-wheel' && table.modeId !== 'duck-races')) {
      return;
    }

    await fetch(`${apiBase}/api/tables/${table.id}/module/finish`, { method: 'POST' });
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

  function navigateSection(sectionId) {
    if (!isHostView) {
      return;
    }

    const nextSection = normalizeSection(sectionId);
    setHostSection(nextSection);

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (nextSection) {
        params.set('section', nextSection);
      } else {
        params.delete('section');
      }

      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }

  function jumbleRaffleEntries() {
    if (!raffleEntries.length) {
      return;
    }

    const nextOrder = shuffleEntries(raffleEntries);
    setRaffleEntries(nextOrder);
    setRaffleEntriesText(nextOrder.join('\n'));
    setRaffleEvents((current) => [`Jumbled ${nextOrder.length} entries at ${new Date().toLocaleTimeString()}`, ...current].slice(0, 20));
  }

  function spinRaffleWheel() {
    if (!raffleEntries.length) {
      return;
    }

    const winnerIndex = Math.floor(Math.random() * raffleEntries.length);
    const winner = raffleEntries[winnerIndex];
    const remaining = raffleEntries.filter((_, index) => index !== winnerIndex);

    setRaffleWinners((current) => [winner, ...current]);
    setRaffleEntries(remaining);
    setRaffleEntriesText(remaining.join('\n'));
    setRaffleEvents((current) => [`Winner: ${winner}`, ...current].slice(0, 20));
  }

  function jumbleDuckEntries() {
    if (!duckEntries.length) {
      return;
    }

    const nextOrder = shuffleEntries(duckEntries);
    setDuckEntries(nextOrder);
    setDuckEntriesText(nextOrder.join('\n'));
    setDuckEvents((current) => [`Jumbled ${nextOrder.length} duck entries at ${new Date().toLocaleTimeString()}`, ...current].slice(0, 20));
  }

  function runDuckRace() {
    if (!duckEntries.length || duckRacing) {
      return;
    }

    setDuckRacing(true);
    setDuckWinner('');
    setDuckEvents((current) => ['Duck race started!', ...current].slice(0, 20));

    window.setTimeout(() => {
      const winner = duckEntries[Math.floor(Math.random() * duckEntries.length)];
      setDuckWinner(winner);
      setDuckRacing(false);
      setDuckEvents((current) => [`Race winner: ${winner}`, ...current].slice(0, 20));
    }, 2200);
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

  if (isHostView && !hostSection) {
    return (
      <div className="app-shell home-shell">
        <main className="home-layout">
          <section className="home-panel">
            <img className="home-logo" src={logoUrl} alt="RAZZKINGS logo" />
            <p className="eyebrow">Live Host Hub</p>
            <h1 className="home-title">RAZZ KINGS</h1>
            <p className="subtitle home-subtitle">Choose your live show format to launch the host controls.</p>
            <div className="home-action-grid">
              <button className="home-nav-button" type="button" onClick={() => navigateSection('raffle-wheel')}>
                <span className="home-nav-number">#1</span>
                <strong>Raffle Wheel</strong>
              </button>
              <button className="home-nav-button" type="button" onClick={() => navigateSection('card-games')}>
                <span className="home-nav-number">#2</span>
                <strong>Card Games</strong>
              </button>
              <button className="home-nav-button" type="button" onClick={() => navigateSection('duck-races')}>
                <span className="home-nav-number">#3</span>
                <strong>Duck Races</strong>
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (isHostView && hostSection === 'raffle-wheel') {
    const raffleEntriesLive = table?.modeId === 'raffle-wheel' ? (table.moduleState?.entries ?? []) : raffleEntries;
    const raffleWinnersLive = table?.modeId === 'raffle-wheel' ? (table.moduleState?.winners ?? []) : raffleWinners;
    const raffleLastSpin = table?.modeId === 'raffle-wheel' ? table.moduleState?.lastSpin : null;
    const raffleEventsLive = table?.modeId === 'raffle-wheel'
      ? (table.moduleState?.events ?? []).map((event) => event.text)
      : raffleEvents;
    const spectatorOnlyLink = table
      ? `${table.baseUrl ?? apiBase}/?section=raffle-wheel&table=${table.id}&role=spectator&token=${table.spectatorJoinToken}`
      : `${apiBase}/?section=raffle-wheel&role=spectator`;
    return (
      <div className="app-shell">
        <main className="module-layout">
          <section className="module-sidebar">
            <div className="hero-top">
              <img className="brand-logo" src={logoUrl} alt="RAZZKINGS logo" />
              <div>
                <p className="eyebrow">Raffle Wheel Host</p>
                <h1 className="brand-title">RAZZKINGS Raffle Wheel</h1>
                <p className="subtitle">Paste up to 100 entries, jumble as needed, then spin for winners.</p>
              </div>
            </div>
            <div className="action-row">
              <button className="ghost" type="button" onClick={() => navigateSection('')}>Back Home</button>
              <button className="secondary" type="button" onClick={() => navigateSection('card-games')}>Open Card Games</button>
              <button className="secondary" type="button" onClick={() => navigateSection('duck-races')}>Open Duck Races</button>
            </div>
            <div className="action-row">
              <button className="primary" type="button" onClick={() => createModuleSession('raffle-wheel', 'RAZZKINGS Raffle Wheel')}>Create Live Raffle Session</button>
            </div>
            <label className="entries-label">
              Entries (one per line, max 100)
              <textarea
                className="entries-box"
                value={raffleEntriesText}
                onChange={(event) => setRaffleEntriesText(event.target.value)}
                placeholder={'Name 1\nName 2\nName 3'}
              />
            </label>
            <p className="muted">Loaded entries: {raffleEntriesLive.length}/100</p>
            <div className="action-row">
              <button className="secondary" type="button" onClick={pushRaffleEntries}>Save Entries</button>
              <button className="secondary" type="button" onClick={hostJumbleRaffle} disabled={!raffleEntriesLive.length}>Jumble Order</button>
              <button className="primary" type="button" onClick={hostSpinRaffle} disabled={!raffleEntriesLive.length}>Spin Wheel</button>
              <button className="ghost" type="button" onClick={finishModuleSession} disabled={!table}>Finish Session</button>
            </div>
            <div className="link-box">
              <span>Spectator link</span>
              <strong>{spectatorOnlyLink}</strong>
              <span className="muted">Share this with spectators to watch live.</span>
            </div>
          </section>

          <section className="module-stage">
            <header className="table-head">
              <div>
                <p className="eyebrow">Live Panel</p>
                <h2>Raffle Wheel Stage</h2>
              </div>
              <div className="status-pill">raffle</div>
            </header>

            <div className="host-feed-strip">
              <div className="host-feed-text">
                <strong>Host feed</strong>
                <span>Start your camera and audio for live engagement</span>
              </div>
              <video className="media-preview" ref={localVideoRef} autoPlay playsInline muted />
              <div className="media-actions">
                <button className="secondary" type="button" onClick={enableMedia} disabled={mediaEnabled}>Start feed</button>
                <button className="secondary" type="button" onClick={disableMedia} disabled={!mediaEnabled}>Stop feed</button>
              </div>
            </div>

            <section className="wheel-panel">
              <RaffleWheelScene entries={raffleEntriesLive} winners={raffleWinnersLive} lastSpin={raffleLastSpin} />
            </section>

            <section className="winner-panel">
              <h3>Winners</h3>
              {raffleWinnersLive.length ? raffleWinnersLive.map((winner, index) => <p key={`${winner}-${index}`}>#{index + 1} {winner}</p>) : <p className="muted">No winners yet.</p>}
            </section>
          </section>

          <aside className="module-feed">
            <section className="panel-card">
              <h3>Raffle Timeline</h3>
              <div className="chat-feed">
                {raffleEventsLive.length ? raffleEventsLive.map((event, index) => <p key={`${event}-${index}`}>{event}</p>) : <p className="muted">No events yet.</p>}
              </div>
              <div className="replay-box">
                <span>Replay</span>
                {table?.replayId ? <a href={`${table.baseUrl ?? apiBase}/?replay=${table.replayId}`} target="_blank" rel="noreferrer">{`${table.baseUrl ?? apiBase}/?replay=${table.replayId}`}</a> : <p className="muted">Finish module session to generate replay.</p>}
              </div>
            </section>
          </aside>
        </main>
      </div>
    );
  }

  if (isHostView && hostSection === 'duck-races') {
    const duckEntriesLive = table?.modeId === 'duck-races' ? (table.moduleState?.entries ?? []) : duckEntries;
    const duckRaceLive = table?.modeId === 'duck-races' ? table.moduleState?.lastRace : null;
    const duckEventsLive = table?.modeId === 'duck-races'
      ? (table.moduleState?.events ?? []).map((event) => event.text)
      : duckEvents;
    const duckWinnerLive = table?.modeId === 'duck-races' ? (table.moduleState?.lastWinner ?? '') : duckWinner;
    const spectatorOnlyLink = table
      ? `${table.baseUrl ?? apiBase}/?section=duck-races&table=${table.id}&role=spectator&token=${table.spectatorJoinToken}`
      : `${apiBase}/?section=duck-races&role=spectator`;
    return (
      <div className="app-shell">
        <main className="module-layout">
          <section className="module-sidebar">
            <div className="hero-top">
              <img className="brand-logo" src={logoUrl} alt="RAZZKINGS logo" />
              <div>
                <p className="eyebrow">Duck Race Host</p>
                <h1 className="brand-title">RAZZKINGS Duck Races</h1>
                <p className="subtitle">Build the duck lineup, jumble racers, and launch a live race.</p>
              </div>
            </div>
            <div className="action-row">
              <button className="ghost" type="button" onClick={() => navigateSection('')}>Back Home</button>
              <button className="secondary" type="button" onClick={() => navigateSection('card-games')}>Open Card Games</button>
              <button className="secondary" type="button" onClick={() => navigateSection('raffle-wheel')}>Open Raffle Wheel</button>
            </div>
            <div className="action-row">
              <button className="primary" type="button" onClick={() => createModuleSession('duck-races', 'RAZZKINGS Duck Races')}>Create Live Duck Session</button>
            </div>
            <label className="entries-label">
              Duck Entries (one per line, max 100)
              <textarea
                className="entries-box"
                value={duckEntriesText}
                onChange={(event) => setDuckEntriesText(event.target.value)}
                placeholder={'Duck Team 1\nDuck Team 2\nDuck Team 3'}
              />
            </label>
            <p className="muted">Loaded entries: {duckEntriesLive.length}/100</p>
            <div className="action-row">
              <button className="secondary" type="button" onClick={pushDuckEntries}>Save Entries</button>
              <button className="secondary" type="button" onClick={hostJumbleDucks} disabled={!duckEntriesLive.length || duckRacing}>Jumble Order</button>
              <button className="primary" type="button" onClick={hostRaceDucks} disabled={!duckEntriesLive.length || duckRacing}>
                {duckRacing ? 'Racing...' : 'Start Race'}
              </button>
              <button className="ghost" type="button" onClick={finishModuleSession} disabled={!table}>Finish Session</button>
            </div>
            <div className="link-box">
              <span>Spectator link</span>
              <strong>{spectatorOnlyLink}</strong>
              <span className="muted">Share this with spectators to watch live.</span>
            </div>
          </section>

          <section className="module-stage">
            <header className="table-head">
              <div>
                <p className="eyebrow">Live Panel</p>
                <h2>Duck Waterpark Track</h2>
              </div>
              <div className="status-pill">duck race</div>
            </header>

            <div className="host-feed-strip">
              <div className="host-feed-text">
                <strong>Host feed</strong>
                <span>Start your camera and audio for race commentary</span>
              </div>
              <video className="media-preview" ref={localVideoRef} autoPlay playsInline muted />
              <div className="media-actions">
                <button className="secondary" type="button" onClick={enableMedia} disabled={mediaEnabled}>Start feed</button>
                <button className="secondary" type="button" onClick={disableMedia} disabled={!mediaEnabled}>Stop feed</button>
              </div>
            </div>

            <section className="duck-track">
              <DuckRaceScene entries={duckEntriesLive} race={duckRaceLive} isRacing={duckRacing} />
            </section>

            <section className="winner-panel">
              <h3>Race Result</h3>
              {duckWinnerLive ? <p className="duck-winner">Winner: {duckWinnerLive}</p> : <p className="muted">No winner yet.</p>}
            </section>
          </section>

          <aside className="module-feed">
            <section className="panel-card">
              <h3>Duck Race Timeline</h3>
              <div className="chat-feed">
                {duckEventsLive.length ? duckEventsLive.map((event, index) => <p key={`${event}-${index}`}>{event}</p>) : <p className="muted">No events yet.</p>}
              </div>
              <div className="replay-box">
                <span>Replay</span>
                {table?.replayId ? <a href={`${table.baseUrl ?? apiBase}/?replay=${table.replayId}`} target="_blank" rel="noreferrer">{`${table.baseUrl ?? apiBase}/?replay=${table.replayId}`}</a> : <p className="muted">Finish module session to generate replay.</p>}
              </div>
            </section>
          </aside>
        </main>
      </div>
    );
  }

  if (!isHostView && querySection === 'raffle-wheel') {
    const raffleEntriesLive = table?.moduleState?.entries ?? [];
    const raffleWinnersLive = table?.moduleState?.winners ?? [];
    const raffleLastSpin = table?.moduleState?.lastSpin ?? null;
    const raffleEventsLive = (table?.moduleState?.events ?? []).map((event) => event.text);

    return (
      <div className="app-shell">
        <main className="module-layout">
          {!isJoined ? (
            <section className="module-sidebar">
              <div className="hero-top">
                <img className="brand-logo" src={logoUrl} alt="RAZZKINGS logo" />
                <div>
                  <p className="eyebrow">Spectator entry</p>
                  <h1 className="brand-title">Raffle Wheel Live</h1>
                </div>
              </div>
              <button className="primary" type="button" onClick={joinTable} disabled={!table}>Join as spectator</button>
              {joinError ? <p className="error-text">{joinError}</p> : null}
            </section>
          ) : <section className="module-sidebar"><p className="muted">Connected as spectator.</p></section>}

          <section className="module-stage">
            <header className="table-head">
              <h2>Raffle Wheel Live</h2>
              <div className="status-pill">spectator</div>
            </header>
            <section className="wheel-panel">
              <RaffleWheelScene entries={raffleEntriesLive} winners={raffleWinnersLive} lastSpin={raffleLastSpin} />
            </section>
            <section className="winner-panel">
              <h3>Winners</h3>
              {raffleWinnersLive.length ? raffleWinnersLive.map((winner, index) => <p key={`${winner}-${index}`}>#{index + 1} {winner}</p>) : <p className="muted">No winners yet.</p>}
            </section>
          </section>

          <aside className="module-feed">
            <section className="panel-card">
              <h3>Timeline</h3>
              <div className="chat-feed">
                {raffleEventsLive.length ? raffleEventsLive.map((event, index) => <p key={`${event}-${index}`}>{event}</p>) : <p className="muted">No events yet.</p>}
              </div>
              <div className="replay-box">
                <span>Replay</span>
                {table?.replayId ? <a href={`${table.baseUrl ?? apiBase}/?replay=${table.replayId}`} target="_blank" rel="noreferrer">{`${table.baseUrl ?? apiBase}/?replay=${table.replayId}`}</a> : <p className="muted">Replay appears when host finishes.</p>}
              </div>
            </section>
          </aside>
        </main>
      </div>
    );
  }

  if (!isHostView && querySection === 'duck-races') {
    const duckEntriesLive = table?.moduleState?.entries ?? [];
    const duckWinnerLive = table?.moduleState?.lastWinner ?? '';
    const duckRaceLive = table?.moduleState?.lastRace ?? null;
    const duckEventsLive = (table?.moduleState?.events ?? []).map((event) => event.text);

    return (
      <div className="app-shell">
        <main className="module-layout">
          {!isJoined ? (
            <section className="module-sidebar">
              <div className="hero-top">
                <img className="brand-logo" src={logoUrl} alt="RAZZKINGS logo" />
                <div>
                  <p className="eyebrow">Spectator entry</p>
                  <h1 className="brand-title">Duck Race Live</h1>
                </div>
              </div>
              <button className="primary" type="button" onClick={joinTable} disabled={!table}>Join as spectator</button>
              {joinError ? <p className="error-text">{joinError}</p> : null}
            </section>
          ) : <section className="module-sidebar"><p className="muted">Connected as spectator.</p></section>}

          <section className="module-stage">
            <header className="table-head">
              <h2>Duck Race Live</h2>
              <div className="status-pill">spectator</div>
            </header>
            <section className="duck-track">
              <DuckRaceScene entries={duckEntriesLive} race={duckRaceLive} isRacing={Boolean(duckRaceLive)} />
            </section>
            <section className="winner-panel">
              <h3>Race Result</h3>
              {duckWinnerLive ? <p className="duck-winner">Winner: {duckWinnerLive}</p> : <p className="muted">No winner yet.</p>}
            </section>
          </section>

          <aside className="module-feed">
            <section className="panel-card">
              <h3>Timeline</h3>
              <div className="chat-feed">
                {duckEventsLive.length ? duckEventsLive.map((event, index) => <p key={`${event}-${index}`}>{event}</p>) : <p className="muted">No events yet.</p>}
              </div>
              <div className="replay-box">
                <span>Replay</span>
                {table?.replayId ? <a href={`${table.baseUrl ?? apiBase}/?replay=${table.replayId}`} target="_blank" rel="noreferrer">{`${table.baseUrl ?? apiBase}/?replay=${table.replayId}`}</a> : <p className="muted">Replay appears when host finishes.</p>}
              </div>
            </section>
          </aside>
        </main>
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

            <div className="section-switch-row">
              <button className="ghost" type="button" onClick={() => navigateSection('')}>Home</button>
              <button className="ghost" type="button" onClick={() => navigateSection('raffle-wheel')}>Raffle Wheel</button>
              <button className="ghost" type="button" onClick={() => navigateSection('duck-races')}>Duck Races</button>
            </div>

            <div className="form-grid">
              <label>
                Game
                <select
                  value={config.modeId}
                  onChange={(event) => setConfig((current) => ({ ...current, modeId: event.target.value }))}
                >
                  {gameModes.filter((gameMode) => cardModeIds.has(gameMode.id)).map((gameMode) => (
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
            <div className="table-arena">
              <div className="table-surface">
                <div className="dealer-lane">
                  <span>Dealer</span>
                  {isHostView ? <SeatAvatar avatarUrl={avatarPreview} label="Dealer" /> : null}
                  <div className="card-stack center-stack">
                    {(stageState?.dealerHand ?? livePreview.dealerHand ?? []).length
                      ? (stageState?.dealerHand ?? []).map((card, index) => (
                        <CardView key={`dealer-${card.id}`} card={card} index={index} />
                      ))
                      : <SeatPlaceholder />}
                  </div>
                </div>

                <div className="community-lane">
                  <span>Community</span>
                  <div className="card-stack center-stack">
                    {(stageState?.communityCards ?? livePreview.communityCards ?? []).length
                      ? (stageState?.communityCards ?? []).map((card, index) => (
                        <CardView key={`community-${card.id}`} card={card} index={index} />
                      ))
                      : <SeatPlaceholder />}
                  </div>
                </div>
              </div>

              {displaySeats.map((seat, seatOrderIndex) => (
                (() => {
                  const publicCards = getPublicSeatCards(mode.id, seat);
                  return (
                <article
                  className={`arena-seat ${seat.occupied ? 'occupied' : ''} ${seat.seatIndex === currentTurnSeatIndex ? 'is-active-turn' : ''}`}
                  key={`arena-seat-${seat.seatIndex}`}
                  style={getSeatOrbitStyle(seatOrderIndex, displaySeats.length)}
                >
                  {seat.seatIndex === currentTurnSeatIndex ? <div className="turn-arrow">➤</div> : null}
                  <span>{seat.name}</span>
                  <SeatAvatar avatarUrl={seat.avatarUrl} label={seat.name} />
                  <div className="card-stack">
                    {publicCards.length ? publicCards.map((card, index) => <CardView key={`seat-${seat.seatIndex}-${card.id}`} card={card} index={index} />) : <SeatPlaceholder text={seat.occupied ? 'Cards hidden' : 'Open seat'} />}
                  </div>
                </article>
                  );
                })()
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
                <button className="secondary" type="button" onClick={() => triggerAction('next-hand')} disabled={!isJoined || table?.phase !== 'round-finished'}>
                  Deal next hand
                </button>
              ) : null}
              {isHostView ? (
                <button className="secondary" type="button" onClick={() => triggerAction('finish')} disabled={!isJoined || table?.phase === 'finished'}>
                  End tournament & save replay
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

function getSeatOrbitStyle(index, total) {
  const count = Math.max(1, total);
  const angle = ((index / count) * Math.PI * 2) - (Math.PI / 2);
  const x = 50 + (40 * Math.cos(angle));
  const y = 50 + (35 * Math.sin(angle));

  return {
    left: `${x}%`,
    top: `${y}%`,
  };
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
    return <PlayerSilhouette label={label} />;
  }

  return <img className="seat-avatar" src={avatarUrl} alt={label} />;
}

function PlayerSilhouette({ label }) {
  return (
    <svg className="player-silhouette" viewBox="0 0 72 72" role="img" aria-label={`${label} silhouette`}>
      <defs>
        <linearGradient id="silhouette-fill" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#29483f" />
          <stop offset="100%" stopColor="#10251f" />
        </linearGradient>
      </defs>
      <circle cx="36" cy="22" r="13" fill="url(#silhouette-fill)" />
      <path d="M12 64c2-16 12-26 24-26s22 10 24 26" fill="url(#silhouette-fill)" />
      <path d="M20 64c3-10 9-15 16-15s13 5 16 15" fill="rgba(232,191,106,0.14)" />
    </svg>
  );
}

function RaffleWheelScene({ entries, winners, lastSpin }) {
  const wheelEntries = getWheelDisplayEntries(entries, lastSpin);
  const sliceAngle = 360 / wheelEntries.length;
  const rotation = lastSpin?.targetRotation ?? 0;
  const winner = lastSpin?.winner ?? winners[0] ?? '';

  return (
    <div className="raffle-scene">
      <ShowPresenter active={Boolean(lastSpin)} />
      <div className="wheel-wrap">
        <div className="wheel-pointer" />
        <svg
          className="raffle-wheel-svg"
          viewBox="0 0 240 240"
          style={{ '--wheel-rotation': `${rotation}deg`, '--wheel-duration': `${lastSpin?.spinDurationMs ?? 1200}ms` }}
        >
          <g transform="translate(120 120)">
            {wheelEntries.map((entry, index) => (
              <g key={`${entry}-${index}`}>
                <path d={describeWheelSlice(0, 0, 106, index * sliceAngle, (index + 1) * sliceAngle)} fill={wheelColor(index)} stroke="rgba(4,12,12,0.7)" strokeWidth="1" />
                <text
                  className="wheel-label"
                  transform={`rotate(${index * sliceAngle + sliceAngle / 2}) translate(62 0) rotate(90)`}
                  textAnchor="middle"
                >
                  {truncateLabel(entry, wheelEntries.length > 18 ? 7 : 12)}
                </text>
              </g>
            ))}
            <circle r="28" fill="#10241f" stroke="rgba(232,191,106,0.82)" strokeWidth="4" />
            <text className="wheel-center-text" textAnchor="middle" y="5">RAZZ</text>
          </g>
        </svg>
      </div>
      <div className="wheel-result-card">
        <span>{winner ? 'Winning slice' : 'Ready to spin'}</span>
        <strong>{winner || `${wheelEntries.length} entries loaded`}</strong>
      </div>
    </div>
  );
}

function getWheelDisplayEntries(entries, lastSpin) {
  if (!entries.length && !lastSpin?.winner) {
    return ['Waiting'];
  }

  if (!lastSpin?.winner || entries.includes(lastSpin.winner)) {
    return entries.length ? entries : [lastSpin.winner];
  }

  const next = [...entries];
  const insertIndex = Math.max(0, Math.min(Number(lastSpin.winnerSliceIndex) || 0, next.length));
  next.splice(insertIndex, 0, lastSpin.winner);
  return next;
}

function ShowPresenter({ active }) {
  return (
    <svg className={`show-presenter ${active ? 'is-spinning' : ''}`} viewBox="0 0 120 180" role="img" aria-label="show presenter">
      <path className="presenter-shadow" d="M20 170c18 8 62 8 80 0" />
      <circle cx="62" cy="34" r="18" className="presenter-skin" />
      <path d="M43 33c4-18 34-21 39-1-12-6-25-5-39 1z" className="presenter-hair" />
      <path d="M48 58h29l10 62H38z" className="presenter-jacket" />
      <path d="M52 60h20l-6 42h-8z" className="presenter-shirt" />
      <path className="presenter-arm presenter-arm-left" d="M45 66c-15 15-21 29-25 47" />
      <path className="presenter-arm presenter-arm-right" d="M78 68c18 8 28 18 34 34" />
      <path d="M48 120l-6 42" className="presenter-leg" />
      <path d="M76 120l8 42" className="presenter-leg" />
    </svg>
  );
}

function DuckRaceScene({ entries, race, isRacing }) {
  const racers = entries.length ? entries : ['Waiting'];
  const finishOrder = race?.finishOrder ?? racers;
  const raceEvents = race?.raceEvents ?? racers.map((entry, index) => ({ entrant: entry, rank: index + 1, durationMs: 5600 + index * 400 }));

  return (
    <div className="duck-race-scene">
      <svg className="duck-track-svg" viewBox="0 0 900 460" role="img" aria-label="figure eight duck race track">
        <defs>
          <path id="figure-eight-path" d="M120 230C120 70 380 70 450 230C520 390 780 390 780 230C780 70 520 70 450 230C380 390 120 390 120 230Z" />
          <filter id="water-wobble">
            <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" />
            <feDisplacementMap in="SourceGraphic" scale="4" />
          </filter>
        </defs>
        <rect width="900" height="460" rx="24" fill="#09242b" />
        <use href="#figure-eight-path" className="track-water-glow" />
        <use href="#figure-eight-path" className="track-water" />
        <use href="#figure-eight-path" className="track-foam" />
        {Array.from({ length: 18 }, (_, index) => (
          <circle key={`splash-${index}`} className="water-splash" cx={90 + ((index * 47) % 720)} cy={96 + ((index * 83) % 270)} r={3 + (index % 4)} style={{ '--splash-delay': `${index * 110}ms` }} />
        ))}
        {racers.slice(0, 16).map((entry, index) => {
          const event = raceEvents.find((item) => item.entrant === entry) ?? raceEvents[index] ?? {};
          const rank = finishOrder.indexOf(entry) + 1 || index + 1;
          return (
            <g key={`${entry}-${index}`} className={`duck-racer ${isRacing || race ? 'is-racing' : ''}`} style={{ '--race-duration': `${event.durationMs ?? 5600}ms`, '--race-delay': `${index * 130}ms` }}>
              <animateMotion dur={`${Math.max(2400, event.durationMs ?? 5600)}ms`} begin={`${index * 0.13}s`} repeatCount={race ? '1' : 'indefinite'} fill="freeze" rotate="auto">
                <mpath href="#figure-eight-path" />
              </animateMotion>
              <DuckSprite index={index} rank={rank} label={entry} />
            </g>
          );
        })}
      </svg>
      <div className="race-finish-list">
        {finishOrder.slice(0, 5).map((entry, index) => <span key={`${entry}-${index}`}>#{index + 1} {entry}</span>)}
      </div>
    </div>
  );
}

function DuckSprite({ index, rank, label }) {
  return (
    <g className="duck-sprite" transform="translate(-24 -16)">
      <ellipse cx="24" cy="30" rx="22" ry="13" fill={duckColor(index)} />
      <circle cx="41" cy="20" r="11" fill={duckColor(index)} />
      <path d="M50 20l15 5-15 6z" fill="#f0a33a" />
      <circle cx="45" cy="17" r="2" fill="#10241f" />
      <path d="M5 27c9-14 23-13 31-2-11-2-20 0-31 2z" fill="rgba(255,255,255,0.28)" />
      <text x="24" y="56" textAnchor="middle" className="duck-rank">#{rank}</text>
      <title>{label}</title>
    </g>
  );
}

function SeatPlaceholder({ text = 'Awaiting deal' }) {
  return <div className="seat-placeholder">{text}</div>;
}

function getPublicSeatCards(modeId, seat) {
  if (modeId === 'blackjack') {
    return seat.hand ?? [];
  }

  return [];
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

function describeWheelSlice(centerX, centerY, radius, startAngle, endAngle) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    `M ${centerX} ${centerY}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function wheelColor(index) {
  const colors = ['#f2c66f', '#70d6b3', '#e56f6f', '#6fb1e8', '#d48af0', '#f08f57', '#9ce37d', '#f3e37c'];
  return colors[index % colors.length];
}

function duckColor(index) {
  const colors = ['#ffd94a', '#f6a94a', '#87d37c', '#6eb8f5', '#f27fb1', '#d8ec5a', '#b992ff', '#f4785d'];
  return colors[index % colors.length];
}

function truncateLabel(label, maxLength) {
  const text = String(label ?? 'Entry');
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function normalizeSection(section) {
  if (section === 'card-games') {
    return 'card-games';
  }

  if (section === 'raffle-wheel') {
    return 'raffle-wheel';
  }

  if (section === 'duck-races') {
    return 'duck-races';
  }

  return '';
}

function extractEntries(text) {
  return String(text ?? '')
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 100);
}

function shuffleEntries(entries) {
  const next = [...entries];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}
