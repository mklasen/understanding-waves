// Chapter 7 — capillary vs gravity waves. Full dispersion relation in a 4 km deep ocean:
//   c² = (g/k + σk/ρ) · tanh(kh)
// Minimum phase speed ≈ 23 cm/s at λ ≈ 1.7 cm; long waves saturate at √(gh) ≈ 198 m/s.
import { TAU, g, SIGMA, RHO } from './physics.js';
import { fitCanvas, visibleLoop, bindRange, $, fmtLen } from './util.js';

const OCEAN = 4000;
const speed = (L) => { const k = TAU / L; return Math.sqrt((g / k + (SIGMA * k) / RHO) * Math.tanh(k * OCEAN)); };
const LMIN = -3, LMAX = 7;

function describe(L) {
  if (L < 0.005) return 'The shiver on a puddle when a raindrop lands';
  if (L < 0.04) return "Cat's paws — the first ripples of a gust";
  if (L < 0.5) return 'Wind ripples on a pond';
  if (L < 5) return 'Chop on a lake';
  if (L < 60) return 'Wind waves at sea';
  if (L < 1000) return 'Ocean swell';
  if (L < 1e6) return 'A tsunami (made by earthquakes, not wind)';
  return 'The tide itself — a wave half the planet long';
}
function fmtSpeed(c) {
  if (c < 1) return `${Math.round(c * 100)} cm/s`;
  return `${Math.round(c * 3.6).toLocaleString('en')} km/h`;
}

export function initRipples() {
  const canvas = $('ripple-canvas');
  let logL = -1.77, t = 0;
  bindRange($('rp-l'), (v) => {
    logL = v;
    const L = Math.pow(10, v);
    $('rp-l-out').textContent = L >= 1e6 ? `${Math.round(L / 1000).toLocaleString('en')} km` : fmtLen(L);
    $('rp-c').textContent = fmtSpeed(speed(L));
    $('rp-force').textContent = L < 0.012 ? 'Surface tension' : L < 0.03 ? 'Both, equally' : L < 0.1 ? 'Mostly gravity' : 'Gravity';
    $('rp-what').textContent = describe(L);
  });

  visibleLoop(canvas, (dt) => {
    t += dt;
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const left = 58, right = w - 18, top = 24, bot = h * 0.66;
    const cMin = Math.log10(0.1), cMax = Math.log10(400);
    const X = (lg) => left + ((lg - LMIN) / (LMAX - LMIN)) * (right - left);
    const Y = (c) => bot - ((Math.log10(c) - cMin) / (cMax - cMin)) * (bot - top);
    // regime shading
    ctx.fillStyle = 'rgba(181,156,255,0.08)'; ctx.fillRect(left, top, X(Math.log10(0.017)) - left, bot - top);
    ctx.fillStyle = 'rgba(255,154,122,0.07)'; ctx.fillRect(X(4.4), top, right - X(4.4), bot - top);
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(181,156,255,0.85)'; ctx.fillText('surface tension wins', left + 6, top + 14);
    ctx.fillStyle = 'rgba(63,179,201,0.9)'; ctx.fillText('gravity wins', X(0.2), top + 14);
    ctx.fillStyle = 'rgba(255,154,122,0.85)'; ctx.fillText('too long for the', X(4.5), bot - 34); ctx.fillText('ocean\'s depth: speed', X(4.5), bot - 20); ctx.fillText('set by depth', X(4.5), bot - 6);
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.fillStyle = 'rgba(233,241,245,0.5)';
    const lticks = [[-3, '1 mm'], [-2, '1 cm'], [-1, '10 cm'], [0, '1 m'], [1, '10 m'], [2, '100 m'], [3, '1 km'], [4, '10 km'], [5, '100 km'], [6, '1,000 km'], [7, '10,000 km']];
    ctx.textAlign = 'center';
    lticks.forEach(([lg, s], i) => { ctx.beginPath(); ctx.moveTo(X(lg), top); ctx.lineTo(X(lg), bot); ctx.stroke(); ctx.textAlign = i === lticks.length - 1 ? 'right' : 'center'; ctx.fillText(s, X(lg) + (i === lticks.length - 1 ? 4 : 0), bot + 15); });
    ctx.textAlign = 'center';
    ctx.fillText('wavelength →', (left + right) / 2, bot + 30);
    ctx.textAlign = 'right';
    [[0.1, '10 cm/s'], [1, '1 m/s'], [10, '36 km/h'], [100, '360 km/h']].forEach(([c, s]) => {
      ctx.beginPath(); ctx.moveTo(left, Y(c)); ctx.lineTo(right, Y(c)); ctx.stroke(); ctx.fillText(s, left - 6, Y(c) + 4);
    });
    ctx.textAlign = 'left';
    // curve
    ctx.strokeStyle = '#3fb3c9'; ctx.lineWidth = 2.4; ctx.beginPath();
    for (let lg = LMIN; lg <= LMAX; lg += 0.02) { const xx = X(lg), yy = Y(speed(10 ** lg)); lg === LMIN ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy); }
    ctx.stroke();
    // minimum
    const Lm = 0.0171;
    ctx.fillStyle = 'rgba(233,241,245,0.75)';
    ctx.beginPath(); ctx.arc(X(Math.log10(Lm)), Y(speed(Lm)), 3, 0, TAU); ctx.fill();
    ctx.fillText('slowest possible wave: 23 cm/s', X(Math.log10(Lm)) - 30, Y(speed(Lm)) + 18);
    // current point
    const L = 10 ** logL, c = speed(L);
    ctx.fillStyle = '#f5c26b';
    ctx.beginPath(); ctx.arc(X(logL), Y(c), 7, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(245,194,107,0.4)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(X(logL), Y(c), 11 + 2 * Math.sin(t * 3), 0, TAU); ctx.stroke();

    // a little live wave strip: three wavelengths, drawn at a fixed screen size
    const sTop = bot + 46, sMid = sTop + (h - sTop) * 0.5;
    const amp = (h - sTop) * 0.22;
    // visual crest speed: real period mapped into a watchable 0.4–4 s
    const Tp = L / c;
    const Tvis = Math.min(4, Math.max(0.6, 0.6 + Math.log10(Tp * 10 + 1) * 0.9));
    ctx.beginPath();
    for (let x = left; x <= right; x += 2) {
      const ph = ((x - left) / (right - left)) * 3 * TAU - (TAU * t) / Tvis;
      const y = sMid - amp * (Math.cos(ph) + (L < 0.012 ? -0.18 * Math.cos(2 * ph) : 0.12 * Math.cos(2 * ph)));
      x === left ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#f4f8fa'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(233,241,245,0.55)'; ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    const per = Tp < 1 ? `${(Tp * 1000).toFixed(0)} ms` : Tp < 120 ? `${Tp.toFixed(1)} s` : Tp < 7200 ? `${(Tp / 60).toFixed(0)} min` : `${(Tp / 3600).toFixed(1)} h`;
    ctx.fillText(`three wavelengths = ${L * 3 >= 1e6 ? Math.round((L * 3) / 1000).toLocaleString('en') + ' km' : fmtLen(L * 3)} · one crest passes every ${per}${L < 0.012 ? ' · capillary ripples have sharp troughs, not sharp crests' : ''}`, left, h - 8);
  });
}
