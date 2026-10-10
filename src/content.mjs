// All page copy lives here. Written fresh for Loord; the copy gate compares it against the reference corpus.

export const sockets = [
  {
    id: 'gate', name: 'Opening gate', colour: 'orange',
    text: 'Keeps a pool shut until you decide it is open, then lets early trading ease in rather than stampede.',
    calls: [1, 0, 0, 0]
  },
  {
    id: 'fee', name: 'Breathing fee', colour: 'cobalt',
    text: 'Raises the price of a trade when the market turns frantic and lets it sink back once things calm down.',
    calls: [1, 1, 0, 0]
  },
  {
    id: 'memory', name: 'Price memory', colour: 'green',
    text: 'Keeps a rolling average of the pool price, so other programs can read a figure that is hard to shove around.',
    calls: [0, 1, 0, 0]
  },
  {
    id: 'cut', name: 'Maker cut', colour: 'magenta',
    text: 'Sets a slice of each trade aside for whoever made the coin, ready to claim at their own pace.',
    calls: [1, 0, 0, 0]
  },
  {
    id: 'own', name: 'Your program', colour: 'yellow',
    text: 'Bring any program that speaks the socket interface and let it shape deposits, withdrawals and trades its own way.',
    calls: [1, 1, 1, 1]
  }
];

export const callPoints = ['Before a trade', 'After a trade', 'Before a deposit', 'After a deposit'];

export const stats = [
  { label: 'Pools opened' },
  { label: 'Liquidity held' },
  { label: 'Day volume' },
  { label: 'Programs wired' }
];

export const steps = [
  { title: 'A trade arrives', text: 'Someone sends a swap toward the pool. Before any price moves, the pool taps its socket on the shoulder.' },
  { title: 'The socket rules', text: 'Your program can wave the trade through, charge it more, or turn it away at the door.' },
  { title: 'The curve works', text: 'Range-based maths slides the price along, using only the liquidity sitting inside the active band.' },
  { title: 'The socket keeps notes', text: 'A second call lets your program log the move, split what was paid, or nudge its own state.' }
];

export const receipt = ['Fee requested', 'Fee ceiling', 'Verdict', 'Price shift', 'Left for the pool'];

export const demos = [
  {
    id: 'gate', name: 'Opening gate', colour: 'orange', states: ['Closed', 'Easing', 'Open'],
    meter: [4, 55, 100],
    lines: ['Every trade is turned back at the door.', 'Trades pass, but on a short leash.', 'The doors are wide and trading runs free.']
  },
  {
    id: 'fee', name: 'Breathing fee', colour: 'cobalt', states: ['Calm', 'Busy', 'Frantic'],
    meter: [14, 52, 94],
    lines: ['A quiet market pays the base rate.', 'Heavier flow nudges the rate upward.', 'Wild swings carry the steepest rate.']
  },
  {
    id: 'memory', name: 'Price memory', colour: 'green', states: ['Short', 'Middle', 'Long'],
    meter: [22, 56, 90],
    lines: ['A short window follows the price closely.', 'A middle window trades speed for steadiness.', 'A long window barely flinches at one trade.']
  },
  {
    id: 'cut', name: 'Maker cut', colour: 'magenta', states: ['Light', 'Even', 'Heavy'],
    meter: [16, 50, 88],
    lines: ['Only a sliver goes to the maker.', 'The maker and the pool split things evenly.', 'The maker keeps the larger share.']
  }
];

export const flow = [
  { title: 'Open a pool', text: 'Pick a pair and a price band, then name the socket you want sitting on top.' },
  { title: 'Wire a program', text: 'Attach one of the ready-made programs, or point at a program you wrote yourself.' },
  { title: 'Let it trade', text: 'Every swap and deposit passes through your rules before and after the curve.' },
  { title: 'Collect the result', text: 'Fees, records and whatever else your program tracks wait for you in one place.' }
];

export const path = [
  { title: 'Foundations', text: 'Core pool maths and the socket interface take shape in the open.' },
  { title: 'First sockets', text: 'A starter shelf of programs for gating, fees, price memory and maker cuts.' },
  { title: 'Open floor', text: 'Public pools, a program shelf and tooling for builders who want to wire their own.' },
  { title: 'Wider reach', text: 'Routing partners, integrations and sockets written by the community.' }
];

export const sketch = `// a socket program, in sketch form
fn before_trade(pool, trade) -> Verdict {
    if !pool.is_open() {
        return Verdict::Refuse;
    }
    Verdict::Pass
}

fn after_trade(pool, trade, fill) {
    pool.note(fill);
}`;
