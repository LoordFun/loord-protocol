# Loord

**Programmable pools for Solana.** Every pool answers to you.

[![Live site](https://img.shields.io/badge/site-loord.fun-0d0d0d?style=flat-square)](https://loord.fun)
![Chain](https://img.shields.io/badge/chain-Solana-0d0d0d?style=flat-square)

| | |
|---|---|
| Chain | Solana |
| Contract address | `pending` |

## Overview

Loord is a range-based exchange for Solana. Each pool carries a socket for small programs, so trades, deposits and fees follow the rules its creator wires in rather than one fixed template.

The site shows a live board of what Solana is trading, a walk through the path of a single trade, and a sandbox of ready-made sockets. Figures that belong to the protocol stay blank until real pools fill them.

## Features

- A socket in every pool, answering calls before and after trades and deposits
- Ready-made behaviours: an opening gate, a breathing fee, price memory and a maker cut
- Room for your own program, written against the socket interface
- A live Solana market board and ticker, refreshed on its own and paused while the tab is hidden
- Contract address slot at the top of the page, inert until an address is stated
- Reduced-motion support throughout

## Links

| | |
|---|---|
| Site | https://loord.fun |
| X | pending |
| GitHub | pending |
| Whitepaper | [docs/whitepaper.md](docs/whitepaper.md) |

## Build

```
npm install
npm run build     # writes dist/
npm run gates     # checks dist/ and both branches of every register record
```

The `dist/` folder is the deploy output.

## License

MIT, see [LICENSE](LICENSE).
