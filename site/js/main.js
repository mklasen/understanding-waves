import { Ocean } from './ocean-gl.js';
import { visibleLoop } from './util.js';

// ---- hero: a mixed sea — local wind waves + a long swell from a distant storm
try {
  const hero = new Ocean(document.getElementById('hero-ocean'), { seed: 5 });
  hero.setSea({ Hs: 0.9, Tp: 5.2, U: 7, swell: { Hs: 1.3, Tp: 12.5, dir: -Math.PI / 2 + 0.35 } }, true);
  visibleLoop(document.getElementById('hero-ocean'), () => {}, { onShow: () => hero.start(), onHide: () => hero.stop() });
  window.__hero = hero;
} catch (e) {
  console.warn('WebGL hero failed', e);
}

// ---- chapters (each isolated so one failure can't take down the page)
const chapters = [
  ['crowd.js', 'initCrowd'],
  ['wind.js', 'initWind'],
  ['energy.js', 'initEnergy'],
  ['swell.js', 'initSwell'],
  ['tides.js', 'initTides'],
  ['beach.js', 'initBeach'],
  ['ripples.js', 'initRipples'],
];
for (const [file, fn] of chapters) {
  import(`./${file}`).then((m) => m[fn]()).catch((e) => console.warn(`chapter ${file} failed:`, e));
}

// ---- highlight the chapter in view
const links = [...document.querySelectorAll('.toc a')];
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${e.target.id}`));
  }
}, { rootMargin: '-45% 0px -50% 0px' });
document.querySelectorAll('main > section').forEach((s) => io.observe(s));
