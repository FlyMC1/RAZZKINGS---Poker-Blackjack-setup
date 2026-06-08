const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const gameModes = [
  {
    id: 'blackjack',
    label: 'Blackjack',
    seats: 8,
    deckRange: [1, 3],
    actionSet: ['Hit', 'Stand', 'Double'],
  },
  {
    id: 'texas-holdem',
    label: "Texas Hold'em",
    seats: 9,
    deckRange: [1, 3],
    actionSet: ['Fold', 'Check', 'Call', 'Raise'],
  },
  {
    id: 'classic-poker',
    label: 'Classic Poker',
    seats: 8,
    deckRange: [1, 3],
    actionSet: ['Fold', 'Hold', 'Draw'],
  },
  {
    id: 'raffle-wheel',
    label: 'Raffle Wheel',
    seats: 100,
    deckRange: [1, 1],
    actionSet: [],
  },
  {
    id: 'duck-races',
    label: 'Duck Races',
    seats: 100,
    deckRange: [1, 1],
    actionSet: [],
  },
];

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

export function shuffleDeck(deck, randomSource = Math.random) {
  const cards = [...deck];

  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomSource() * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }

  return cards;
}

export function getMode(modeId) {
  return gameModes.find((mode) => mode.id === modeId) ?? gameModes[0];
}

export function buildPreviewHands(modeId, seatCount, deckCount) {
  const mode = getMode(modeId);
  const deck = shuffleDeck(createDeck(deckCount), () => cryptoRandom());
  const draw = () => deck.shift();

  const playerHands = Array.from({ length: seatCount }, () => {
    if (mode.id === 'blackjack') {
      return [draw(), draw()].filter(Boolean);
    }

    if (mode.id === 'texas-holdem') {
      return [draw(), draw()].filter(Boolean);
    }

    return [draw(), draw(), draw(), draw(), draw()].filter(Boolean);
  });

  const communityCards = mode.id === 'texas-holdem' ? [draw(), draw(), draw(), draw(), draw()].filter(Boolean) : [];
  const dealerHand = mode.id === 'blackjack' ? [draw(), draw()].filter(Boolean) : [];

  return {
    deck,
    dealerHand,
    communityCards,
    playerHands,
  };
}

function cryptoRandom() {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const buffer = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buffer);
    return buffer[0] / 0xffffffff;
  }

  return Math.random();
}

export function formatCard(card) {
  if (!card) {
    return '??';
  }

  return `${card.rank}${card.suit[0].toUpperCase()}`;
}