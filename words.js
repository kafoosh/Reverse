// ============================================================
// WORD LIST — edit this file to tune the trick.
// Each card's phrase is: [suit word] [of word] [value word]
// (spoken in that order; reversed it plays value-of-suit).
// Special cases: sevens are [suit word] + "Button Vest",
// fours are [suit word] + "Oar Off" ("Oar" is reserved for fours).
// Multiple options per slot are picked at random each time.
// ============================================================

const WORDS = {
  suits: {
    S: ['Snips', 'Sneaks', 'Slips', 'Sleeps', 'Steaks'], // Spades
    H: ['Snot', 'Star', 'Staff'],                        // Hearts
    C: ['Bulk'],                                         // Clubs
    D: ['Nomad'],                                        // Diamonds
  },

  values: {
    A:  ['Said'],
    2:  ['Hoot'],
    3:  ['Youth'],
    5:  ['Fear'],
    6:  ['Kiss'],
    8:  ['Tea'],
    9:  ['Neon'],
    10: ['Net'],
    J:  ['Cash', 'Catch'],
    Q:  ['Anew', 'Nuke'],
    K:  ['Nick'],
  },

  of: ['Far', 'Frogs', 'Flops', 'Vox', 'Woke', 'Fork'],

  // Special cases: "value + of" is always this fixed word pair.
  sevenOf: ['Button', 'Vest'],
  fourOf: ['Oar', 'Off'],

  // Decoy words shown for the non-trick recordings. Plain, short
  // dictionary words — nothing that appears in the card phrases.
  decoys: [
    'Apple', 'Autumn', 'Bagel', 'Basil', 'Beach', 'Bloom', 'Brave', 'Brick',
    'Cabin', 'Cactus', 'Candle', 'Canoe', 'Cedar', 'Chalk', 'Cherry', 'Chess',
    'Cider', 'Cliff', 'Cloud', 'Clover', 'Cobalt', 'Comet', 'Coral', 'Crane',
    'Crisp', 'Denim', 'Drift', 'Dune', 'Ember', 'Fable', 'Falcon', 'Fern',
    'Flint', 'Frost', 'Gala', 'Gecko', 'Ginger', 'Glide', 'Grove', 'Harbor',
    'Hazel', 'Hedge', 'Igloo', 'Ivory', 'Jungle', 'Kayak', 'Lagoon', 'Lantern',
    'Lemon', 'Linen', 'Lunar', 'Mango', 'Maple', 'Marble', 'Meadow', 'Mellow',
    'Mint', 'Mosaic', 'Motel', 'Mural', 'Nectar', 'Noble', 'Oasis', 'Ocean',
    'Olive', 'Onion', 'Orbit', 'Otter', 'Panda', 'Pebble', 'Pepper', 'Piano',
    'Pillow', 'Pine', 'Plaza', 'Pond', 'Prism', 'Quartz', 'Raft', 'Rain',
    'Ripple', 'River', 'Rustic', 'Saddle', 'Sage', 'Salsa', 'Squid', 'Stone',
    'Sunset', 'Syrup', 'Tango', 'Tiger', 'Timber', 'Tulip', 'Turnip', 'Velvet',
    'Violet', 'Wafer', 'Walnut', 'Wander', 'Willow', 'Zebra', 'Zesty', 'Zigzag',
  ],
};
