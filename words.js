// ============================================================
// WORD LIST — edit this file to tune the trick.
// Each card's phrase is: [suit word] [of word] [value word]
// (spoken in that order; reversed it plays value-of-suit).
// Sevens are special: [suit word] + "Button Vest".
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
    4:  ['Off'],
    5:  ['Fear'],
    6:  ['Kiss'],
    8:  ['Tea'],
    9:  ['Neon'],
    10: ['Net'],
    J:  ['Cash', 'Catch'],
    Q:  ['Anew', 'Nuke'],
    K:  ['Nick'],
  },

  of: ['Far', 'Frogs', 'Flops', 'Oar', 'Vox', 'Woke', 'Fork'],

  // Seven is a special case: "seven of" is always these two words.
  sevenOf: ['Button', 'Vest'],
};
