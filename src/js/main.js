import { initReveal } from './reveal.js';
import { initHero } from './hero.js';
import { startMarket } from './market.js';
import { $, initCopy, initProgress, initSpotlight, initChrome, initDemos, initTrace, initSheet } from './ui.js';

const reg = JSON.parse($('#register').textContent).records;
const data = JSON.parse($('#sockets-data').textContent);

initChrome();
initProgress();
initCopy();
initSpotlight();
initReveal();
initHero(data);
initDemos(data.demos);
initTrace();
initSheet();

// The market board reads the market-source record and no other record.
const feed = reg['market-source'];
if (feed && feed.state === 'stated') startMarket(feed);

window.__loordReady = true;
