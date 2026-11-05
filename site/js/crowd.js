// Chapter 1 — superposition. Individual sine waves (top) and their sum (bottom).
// Repeat time = LCM of the component periods (exact, BigInt) — or "never" when the
// periods are incommensurate, as in a real sea.
import { g, TAU, fmtDuration } from './physics.js';
import { fitCanvas, visibleLoop, bindRange, $ } from './util.js';

// periods in tenths of a second — chosen to be "nice" numbers, so a repeat exists
const BASE = [80, 63, 117, 51, 95, 142, 44, 72, 105, 58, 131, 67, 88, 39, 124];

export function initCrowd() {
  const canvas = $('crowd-canvas');
  let n = 1, t = 0, messy = false, seed = 1;
  let comps = [];

  function build() {
    let s = seed;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const order = BASE.slice();
    if (seed > 1) order.sort(() => r() - 0.5);
    comps = order.slice(0, 12).map((ds, i) => {
      const T = (messy ? ds * (1 + (r() - 0.5) * 0.0123 * Math.SQRT2) : ds) / 10;
      const omega = TAU / T;
      return {
        ds, T, omega, k: (omega * omega) / g,
        a: (0.35 + 0.65 * r()) * Math.pow(T / 10, 1.2),
        phase: r() * TAU, dir: r() < 0.25 ? -1 : 1, hue: 185 + i * 9,
      };
    });
    updateRepeat();
  }

  function updateRepeat() {
    const out = $('crowd-repeat');
    let text;
    if (messy && n > 1) text = 'never';
    else {
      text = fmtDuration(Number(lcmAll(comps.slice(0, n).map((c) => BigInt(c.ds)))) / 10);
    }
    out.innerHTML = text;
    out.classList.toggle('never', text === 'never' || text.includes('universe'));
    $('crowd-aha').classList.toggle('lit', n >= 4 || (messy && n > 1));
  }

  bindRange($('crowd-n'), (v) => { n = v; $('crowd-n-out').textContent = v; updateRepeat(); });
  $('crowd-shuffle').addEventListener('click', () => { seed = (seed * 48271 + 7) % 2147483647 || 3; build(); });
  $('crowd-real').addEventListener('click', (e) => { messy = !messy; e.currentTarget.classList.toggle('on', messy); build(); });
  build();

  visibleLoop(canvas, (dt) => {
    t += dt;
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const span = 420; // metres of sea shown
    const px = w / span;
    const stripTop = 14, stripH = Math.min(30, (h * 0.5) / 12);
    const sumTop = stripTop + stripH * 12 + 20;
    const sumMid = sumTop + (h - sumTop) * 0.48;
    const maxA = comps.reduce((s, c) => s + c.a, 0) * 0.55;
    const ampScale = ((h - sumTop) * 0.42) / Math.max(maxA, 0.6);
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    // component strips
    comps.forEach((c, i) => {
      const y0 = stripTop + i * stripH + stripH / 2;
      const on = i < n;
      ctx.globalAlpha = on ? 1 : 0.12;
      ctx.strokeStyle = `hsl(${c.hue} 70% ${on ? 65 : 50}%)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 46; x <= w; x += 3) {
        const X = (x - 46) / px;
        const y = y0 - Math.sin(c.dir * c.k * X - c.omega * t + c.phase) * c.a * (stripH * 0.42) / 1.0;
        x === 46 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = on ? `hsl(${c.hue} 60% 70%)` : 'rgba(255,255,255,0.2)';
      ctx.fillText(`${c.T.toFixed(messy ? 3 : 1)} s`, 4, y0 + 4);
    });
    ctx.globalAlpha = 1;
    // the sum
    const pts = [];
    for (let x = 0; x <= w; x += 2) {
      const X = x / px;
      let y = 0;
      for (let i = 0; i < n; i++) { const c = comps[i]; y += c.a * Math.sin(c.dir * c.k * X - c.omega * t + c.phase); }
      pts.push([x, sumMid - y * ampScale]);
    }
    const grad = ctx.createLinearGradient(0, sumMid - 60, 0, h);
    grad.addColorStop(0, 'rgba(63,179,201,0.55)');
    grad.addColorStop(1, 'rgba(10,40,60,0.2)');
    ctx.beginPath();
    ctx.moveTo(0, h);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(w, h);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = '#f4f8fa';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // labels
    ctx.fillStyle = 'rgba(233,241,245,0.75)';
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(n === 1 ? 'The sea = this one wave' : `The sea = all ${n} waves added together`, 12, sumTop + 4);
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.moveTo(0, sumMid); ctx.lineTo(w, sumMid); ctx.stroke();
    ctx.setLineDash([]);
  });
}

function lcmAll(list) {
  const g2 = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
  return list.reduce((l, b) => (l * b) / g2(l, b), 1n);
}
