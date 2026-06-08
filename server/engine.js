import { randomInt } from 'node:crypto';

const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const rankValue = new Map([
  ['2', 2],
  ['3', 3],
  ['4', 4],
  ['5', 5],
  ['6', 6],
  ['7', 7],
  ['8', 8],
  ['9', 9],
  ['10', 10],
  ['J', 11],
  ['Q', 12],
  ['K', 13],
  ['A', 14],
]);

export function createDeck(deckCount = 1) {
  const deck = [];

  for (let deckIndex = 0; deckIndex < deckCount; deckIndex += 1) {
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({
          id: `${deckIndex}-${rank}-${suit}`,
          rank,
          suit,
          label: `${rank}${suit[0].toUpperCase()}`,
        });
      }
    }
  }

  return deck;
}

export function shuffleDeck(deck) {
  const cards = [...deck];

  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }

  return cards;
}

export function createActiveSeats(players, startingChips, maxPlayers) {
  return [...players]
    .sort((left, right) => (left.seatIndex ?? Number.MAX_SAFE_INTEGER) - (right.seatIndex ?? Number.MAX_SAFE_INTEGER))
    .slice(0, maxPlayers)
    .map((player, seatIndex) => ({
    id: player.id,
    socketId: player.id,
    name: player.name,
    seatIndex: Number.isInteger(player.seatIndex) ? player.seatIndex : seatIndex,
    chips: startingChips,
    hand: [],
    folded: false,
    stood: false,
    busted: false,
    contribution: 0,
    lastAction: null,
    total: 0,
    avatarUrl: player.avatarUrl ?? null,
  }));
}

export function initializeGame(table) {
  const deck = shuffleDeck(createDeck(table.deckCount));
  const seats = createActiveSeats(table.players, table.startingChips, table.maxPlayers);
  const state = {
    modeId: table.modeId,
    deck,
    seats,
    dealerHand: [],
    communityCards: [],
    pot: 0,
    currentBet: 0,
    currentSeatIndex: 0,
    remainingToAct: seats.filter((seat) => !seat.folded).length,
    stage: 'deal',
    winners: [],
    result: null,
    finished: false,
    replayId: null,
  };

  if (table.modeId === 'blackjack') {
    dealCards(state, seats.length > 0 ? 2 : 0, seats);
    state.dealerHand = [drawCard(state), drawCard(state)].filter(Boolean);
    state.stage = 'player-turn';
    state.currentSeatIndex = findNextSeatIndex(state, -1);
    state.remainingToAct = 0;
    state.pot = seats.reduce((sum, seat) => sum + takeAnte(seat, 10), 0);
    state.seats.forEach((seat) => {
      seat.total = blackjackTotal(seat.hand);
    });
    return state;
  }

  if (table.modeId === 'classic-poker') {
    dealCards(state, 5, seats);
    state.stage = 'draw';
    state.currentSeatIndex = findNextSeatIndex(state, -1);
    state.remainingToAct = state.seats.filter((seat) => !seat.folded).length;
    state.pot = seats.reduce((sum, seat) => sum + takeAnte(seat, 10), 0);
    return state;
  }

  dealCards(state, 2, seats);
  state.stage = 'preflop';
  state.currentSeatIndex = findNextSeatIndex(state, -1);
  state.remainingToAct = state.seats.filter((seat) => !seat.folded).length;
  state.pot = seats.reduce((sum, seat) => sum + takeAnte(seat, 10), 0);
  return state;
}

export function applyAction(table, socketId, action, amount) {
  const state = table.gameState;

  if (!state || state.finished) {
    return { ok: false, error: 'Game is not active' };
  }

  const seatIndex = state.seats.findIndex((seat) => seat.socketId === socketId);

  if (seatIndex < 0) {
    return { ok: false, error: 'You are not seated at this table' };
  }

  if (state.modeId === 'blackjack') {
    return applyBlackjackAction(state, seatIndex, action);
  }

  return applyPokerAction(state, seatIndex, action, amount);
}

export function finishGame(table) {
  if (!table.gameState) {
    return { ok: false, error: 'No game in progress' };
  }

  if (!table.gameState.finished) {
    if (table.modeId === 'blackjack') {
      settleBlackjack(table.gameState);
    } else {
      settlePoker(table.gameState);
    }
  }

  table.phase = 'finished';
  table.updatedAt = new Date().toISOString();
  return { ok: true, table };
}

function applyBlackjackAction(state, seatIndex, action) {
  if (seatIndex !== state.currentSeatIndex) {
    return { ok: false, error: 'It is not your turn' };
  }

  const seat = state.seats[seatIndex];

  if (seat.stood || seat.busted) {
    return { ok: false, error: 'Seat already finished' };
  }

  if (action === 'hit') {
    seat.hand.push(drawCard(state));
    seat.total = blackjackTotal(seat.hand);
    seat.lastAction = 'hit';

    if (seat.total >= 21) {
      seat.stood = true;
      if (seat.total > 21) {
        seat.busted = true;
      }
      moveToNextBlackjackSeat(state);
    }

    recordStreetAction(state, seat, 'hit');
    return { ok: true };
  }

  if (action === 'stand') {
    seat.stood = true;
    seat.lastAction = 'stand';
    recordStreetAction(state, seat, 'stand');
    moveToNextBlackjackSeat(state);
    return { ok: true };
  }

  if (action === 'double') {
    const wager = Math.min(10, seat.chips);
    seat.chips -= wager;
    seat.contribution += wager;
    state.pot += wager;
    seat.hand.push(drawCard(state));
    seat.total = blackjackTotal(seat.hand);
    seat.stood = true;
    seat.lastAction = 'double';
    recordStreetAction(state, seat, 'double');
    moveToNextBlackjackSeat(state);
    return { ok: true };
  }

  return { ok: false, error: 'Unsupported blackjack action' };
}

function applyPokerAction(state, seatIndex, action, amount = 10) {
  if (seatIndex !== state.currentSeatIndex) {
    return { ok: false, error: 'It is not your turn' };
  }

  const seat = state.seats[seatIndex];

  if (seat.folded) {
    return { ok: false, error: 'Seat already folded' };
  }

  const wager = Math.min(Math.max(10, Number(amount) || 10), seat.chips);

  if (action === 'fold') {
    seat.folded = true;
    seat.lastAction = 'fold';
  } else if (action === 'check') {
    seat.lastAction = 'check';
  } else if (action === 'call') {
    seat.chips -= wager;
    seat.contribution += wager;
    state.pot += wager;
    seat.lastAction = 'call';
  } else if (action === 'raise') {
    const raiseAmount = Math.min(wager + 10, seat.chips);
    seat.chips -= raiseAmount;
    seat.contribution += raiseAmount;
    state.pot += raiseAmount;
    state.currentBet = raiseAmount;
    seat.lastAction = 'raise';
  } else if (action === 'draw') {
    drawPokerCards(state, seat, 2);
    seat.lastAction = 'draw';
  } else if (action === 'hold') {
    seat.lastAction = 'hold';
  } else {
    return { ok: false, error: 'Unsupported poker action' };
  }

  recordStreetAction(state, seat, action);
  state.remainingToAct -= 1;

  if (state.remainingToAct <= 0) {
    advancePokerStreet(state);
  } else {
    state.currentSeatIndex = findNextSeatIndex(state, state.currentSeatIndex);
  }

  return { ok: true };
}

function advancePokerStreet(state) {
  const activeSeats = state.seats.filter((seat) => !seat.folded);

  if (state.modeId === 'classic-poker') {
    settlePoker(state);
    return;
  }

  if (state.stage === 'preflop') {
    state.communityCards.push(...drawCards(state, 3));
    state.stage = 'flop';
  } else if (state.stage === 'flop') {
    state.communityCards.push(...drawCards(state, 1));
    state.stage = 'turn';
  } else if (state.stage === 'turn') {
    state.communityCards.push(...drawCards(state, 1));
    state.stage = 'river';
  } else {
    settlePoker(state);
    return;
  }

  state.remainingToAct = activeSeats.length;
  state.currentSeatIndex = findNextSeatIndex(state, -1);
}

function settleBlackjack(state) {
  state.dealerTotal = blackjackTotal(state.dealerHand);

  while (state.dealerTotal < 17) {
    state.dealerHand.push(drawCard(state));
    state.dealerTotal = blackjackTotal(state.dealerHand);
  }

  const results = state.seats.map((seat) => {
    const total = blackjackTotal(seat.hand);
    seat.total = total;
    let outcome = 'push';

    if (total > 21) {
      outcome = 'lose';
    } else if (state.dealerTotal > 21 || total > state.dealerTotal) {
      outcome = 'win';
      seat.chips += 20;
    } else if (total === state.dealerTotal) {
      seat.chips += 10;
    } else {
      outcome = 'lose';
    }

    return {
      name: seat.name,
      total,
      outcome,
    };
  });

  state.winners = results.filter((entry) => entry.outcome === 'win').map((entry) => entry.name);
  state.result = {
    label: 'Blackjack settled',
    dealerTotal: state.dealerTotal,
    results,
  };
  state.stage = 'finished';
  state.finished = true;
}

function settlePoker(state) {
  const contenders = state.seats.filter((seat) => !seat.folded);

  if (contenders.length === 0) {
    state.result = { label: 'No contenders left' };
    state.stage = 'finished';
    state.finished = true;
    return;
  }

  const scored = contenders.map((seat) => ({
    seat,
    score: state.modeId === 'texas-holdem'
      ? bestHand([...seat.hand, ...state.communityCards])
      : evaluateHand(seat.hand),
  }));

  scored.sort((left, right) => compareScores(right.score, left.score));

  const bestScore = scored[0].score;
  const winners = scored.filter(({ score }) => compareScores(score, bestScore) === 0).map(({ seat }) => seat);
  const payout = Math.floor(state.pot / winners.length);

  winners.forEach((seat) => {
    seat.chips += payout;
  });

  state.winners = winners.map((seat) => seat.name);
  state.result = {
    label: state.modeId === 'texas-holdem' ? "Texas Hold'em showdown" : 'Classic poker showdown',
    winners: state.winners,
    bestScore,
    payout,
  };
  state.stage = 'finished';
  state.finished = true;
}

function drawPokerCards(state, seat, count) {
  const drawn = drawCards(state, count);
  seat.hand = seat.hand.concat(drawn);
  return drawn;
}

function moveToNextBlackjackSeat(state) {
  const nextSeatIndex = findNextSeatIndex(state, state.currentSeatIndex);

  if (nextSeatIndex === -1 || state.seats.every((seat) => seat.stood || seat.busted)) {
    settleBlackjack(state);
    return;
  }

  state.currentSeatIndex = nextSeatIndex;
}

function findNextSeatIndex(state, fromIndex) {
  if (state.seats.length === 0) {
    return -1;
  }

  for (let offset = 1; offset <= state.seats.length; offset += 1) {
    const index = (fromIndex + offset + state.seats.length) % state.seats.length;
    const seat = state.seats[index];

    if (seat && !seat.folded && !seat.busted && !seat.stood) {
      return index;
    }
  }

  return -1;
}

function takeAnte(seat, ante) {
  const wager = Math.min(ante, seat.chips);
  seat.chips -= wager;
  seat.contribution += wager;
  return wager;
}

function dealCards(state, count, seats) {
  for (let round = 0; round < count; round += 1) {
    for (const seat of seats) {
      seat.hand.push(drawCard(state));
    }
  }
}

function drawCards(state, count) {
  const drawn = [];

  for (let index = 0; index < count; index += 1) {
    const card = drawCard(state);
    if (card) {
      drawn.push(card);
    }
  }

  return drawn;
}

function drawCard(state) {
  return state.deck.shift() ?? null;
}

function recordStreetAction(state, seat, action) {
  state.lastAction = {
    seatIndex: seat.seatIndex,
    name: seat.name,
    action,
    timestamp: new Date().toISOString(),
  };
}

function blackjackTotal(hand) {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    if (!card) {
      continue;
    }

    if (card.rank === 'A') {
      aces += 1;
      total += 11;
    } else if (['K', 'Q', 'J'].includes(card.rank)) {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

function evaluateHand(cards) {
  const normalized = [...cards].filter(Boolean).slice(0, 5);
  const ranksDesc = normalized.map((card) => rankValue.get(card.rank)).sort((left, right) => right - left);
  const counts = countRanks(normalized);
  const isFlush = normalized.length === 5 && normalized.every((card) => card.suit === normalized[0].suit);
  const straightHigh = getStraightHigh(normalized);
  const groups = [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return rankValue.get(right[0]) - rankValue.get(left[0]);
  });

  if (straightHigh && isFlush) {
    return { rank: 8, tiebreakers: [straightHigh] };
  }

  if (groups[0]?.[1] === 4) {
    return { rank: 7, tiebreakers: [rankValue.get(groups[0][0]), rankValue.get(groups[1][0])] };
  }

  if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) {
    return { rank: 6, tiebreakers: [rankValue.get(groups[0][0]), rankValue.get(groups[1][0])] };
  }

  if (isFlush) {
    return { rank: 5, tiebreakers: ranksDesc };
  }

  if (straightHigh) {
    return { rank: 4, tiebreakers: [straightHigh] };
  }

  if (groups[0]?.[1] === 3) {
    return {
      rank: 3,
      tiebreakers: [rankValue.get(groups[0][0]), ...ranksDesc.filter((value) => value !== rankValue.get(groups[0][0]))],
    };
  }

  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) {
    const pairHigh = Math.max(rankValue.get(groups[0][0]), rankValue.get(groups[1][0]));
    const pairLow = Math.min(rankValue.get(groups[0][0]), rankValue.get(groups[1][0]));
    return { rank: 2, tiebreakers: [pairHigh, pairLow, ...ranksDesc.filter((value) => value !== pairHigh && value !== pairLow)] };
  }

  if (groups[0]?.[1] === 2) {
    const pairValue = rankValue.get(groups[0][0]);
    return { rank: 1, tiebreakers: [pairValue, ...ranksDesc.filter((value) => value !== pairValue)] };
  }

  return { rank: 0, tiebreakers: ranksDesc };
}

function bestHand(cards) {
  if (cards.length <= 5) {
    return evaluateHand(cards);
  }

  const combinations = fiveCardCombinations(cards);
  return combinations.reduce((best, combo) => {
    const score = evaluateHand(combo);
    return compareScores(score, best) > 0 ? score : best;
  }, evaluateHand(cards.slice(0, 5)));
}

function fiveCardCombinations(cards) {
  const results = [];

  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            results.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
          }
        }
      }
    }
  }

  return results;
}

function compareScores(left, right) {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }

  const length = Math.max(left.tiebreakers.length, right.tiebreakers.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = left.tiebreakers[index] ?? 0;
    const rightValue = right.tiebreakers[index] ?? 0;

    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

function countRanks(cards) {
  const counts = new Map();

  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }

  return counts;
}

function getStraightHigh(cards) {
  const values = [...new Set(cards.map((card) => rankValue.get(card.rank)))].sort((left, right) => left - right);

  if (values.length !== 5) {
    return null;
  }

  const wheel = [2, 3, 4, 5, 14];
  if (values.join(',') === wheel.join(',')) {
    return 5;
  }

  for (let index = 1; index < values.length; index += 1) {
    if (values[index] !== values[index - 1] + 1) {
      return null;
    }
  }

  return values[values.length - 1];
}