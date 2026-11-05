// Chapter 2 — the wind lab. Wind speed × duration × fetch → sea state (JONSWAP/PM),
// rendered as a live 3D sea plus a to-scale side profile with a person.
import { windSea, beaufort, clamp } from './physics.js';
import { Ocean } from './ocean-gl.js';
import { fitCanvas, visibleLoop, bindRange, setRange, $, fmtLen } from './util.js';

const T_MIN = 0.25, T_MAX = 72;    // hours (log slider)
const X_MIN = 0.5, X_MAX = 3000;   // km    (log slider)
const logMap = (v, a, b) => a * Math.pow(b / a, v);
const logInv = (x, a, b) => Math.log(x / a) / Math.log(b / a);

function heightWords(H) {
  if (H < 0.08) return 'barely a ripple';
  if (H < 0.3) return 'ankle-high';
  if (H < 0.6) return 'knee-high';
  if (H < 1.1) return 'waist-high';
  if (H < 1.6) return 'chest-high';
  if (H < 2.3) return 'head-high';
  if (H < 3.5) return 'a single-storey house';
  if (H < 6.5) return 'a two-storey house';
  if (H < 10) return 'a three-storey building';
  return 'a five-storey building';
}

export function initWind() {
  const oceanCanvas = $('wind-ocean');
  const profile = $('wind-profile');
  let ocean = null;
  try { ocean = new Ocean(oceanCanvas, { seed: 11 }); } catch (e) { console.warn(e); oceanCanvas.replaceWith(Object.assign(document.createElement('div'), { className: 'panel-canvas tall', textContent: 'WebGL is not available in this browser.' })); }
  let U = 8, durH = 10, fetchKm = 100, sea = null;

  function update() {
    sea = windSea(U, fetchKm, durH);
    const bf = beaufort(U);
    $('wind-u-out').textContent = `${U.toFixed(U < 10 ? 1 : 0)} m/s · ${Math.round(U * 1.944)} kn`;
    $('wind-t-out').textContent = durH < 1 ? `${Math.round(durH * 60)} min` : durH < 48 ? `${durH.toFixed(durH < 10 ? 1 : 0)} h` : `${(durH / 24).toFixed(1)} days`;
    $('wind-x-out').textContent = fetchKm < 10 ? `${fetchKm.toFixed(1)} km` : `${Math.round(fetchKm).toLocaleString('en')} km`;
    $('wind-badge').textContent = `Force ${bf.force} · ${bf.name} — ${bf.sea.toLowerCase()}`;
    const calm = U < 1;
    $('wind-hs').textContent = calm ? '0 m' : fmtLen(sea.Hs);
    $('wind-tp').textContent = calm ? '–' : `${sea.Tp.toFixed(1)} s`;
    $('wind-l').textContent = calm ? '–' : fmtLen(sea.L);
    $('wind-c').textContent = calm ? '–' : `${Math.round(sea.c * 3.6)} km/h`;
    $('wind-progress').style.width = `${calm ? 0 : clamp(sea.progress, 0.02, 1) * 100}%`;
    let why;
    if (calm) why = '<span class="tag">No wind</span> No wind, no new waves. (Any waves you see on a calm day came from somewhere else — see chapter 4.)';
    else if (sea.limit === 'fetch') {
      why = `<span class="tag">Fetch-limited</span> The wind has <b>run out of water</b>: waves reach the far shore before they can grow bigger. More time won't help — only more open sea would. This wind needs about <b>${Math.round(sea.xFull).toLocaleString('en')} km</b> to build its biggest waves.`;
    } else if (sea.limit === 'duration') {
      why = `<span class="tag">Duration-limited</span> The wind <b>hasn't blown long enough</b>. Keep it going and the waves keep growing — they'd max out after about <b>${sea.tFull < 48 ? Math.round(sea.tFull) + ' hours' : (sea.tFull / 24).toFixed(1) + ' days'}</b>.`;
    } else {
      why = `<span class="tag">Fully developed</span> The sea has taken <b>all the energy this wind can give</b>: whitecaps now throw energy away as fast as the wind adds it. Only a stronger wind makes bigger waves.`;
    }
    if (!calm) why += ` <br>Typical wave: <b>${heightWords(sea.Hs)}</b>. Every so often the crowd lines up — about 1 wave in 1,000 is nearly <b>twice</b> as tall.`;
    $('wind-why').innerHTML = why;
    if (ocean) ocean.setSea({ Hs: calm ? 0.005 : sea.Hs, Tp: calm ? 1.5 : Math.max(sea.Tp, 0.8), U, gamma: sea.limit === 'full' ? 1.5 : 3.3 });
  }

  const uIn = $('wind-u'), tIn = $('wind-t'), xIn = $('wind-x');
  bindRange(uIn, (v) => { U = v; update(); });
  bindRange(tIn, (v) => { durH = logMap(v, T_MIN, T_MAX); update(); });
  bindRange(xIn, (v) => { fetchKm = logMap(v, X_MIN, X_MAX); update(); });

  const presets = {
    lake: { U: 20, t: 12, x: 4 },
    squall: { U: 22, t: 0.75, x: 2000 },
    southern: { U: 24, t: 60, x: 2800 },
  };
  document.querySelectorAll('#wind [data-preset]').forEach((b) => b.addEventListener('click', () => {
    const p = presets[b.dataset.preset];
    setRange(uIn, p.U); setRange(tIn, logInv(p.t, T_MIN, T_MAX)); setRange(xIn, logInv(p.x, X_MIN, X_MAX));
  }));

  if (ocean) visibleLoop(oceanCanvas, () => {}, { onShow: () => ocean.start(), onHide: () => ocean.stop() });

  // ---- to-scale side profile ----
  let shownH = 2.5;
  visibleLoop(profile, (dt) => {
    const { ctx, w, h } = fitCanvas(profile);
    ctx.clearRect(0, 0, w, h);
    const Hs = ocean ? ocean.cur.Hs : sea.Hs;
    const targetH = Math.max(Hs * 1.25, 2.4);
    shownH += (targetH - shownH) * (1 - Math.exp(-dt * 1.5));
    const left = 70, mid = h * 0.55;
    const vs = (h * 0.42) / shownH;           // px per metre (vertical)
    const L = sea ? sea.L : 50;
    const spanTrue = (w - left) / vs;          // metres if 1:1
    const wantSpan = clamp(L * 2.6, 12, 4000);
    const squash = Math.max(1, wantSpan / spanTrue);
    const hs = vs / squash;                    // px per metre (horizontal)
    // sky / water
    const pts = [];
    for (let x = left; x <= w; x += 2) {
      const X = (x - left) / hs;
      const y = ocean ? ocean.elevation(0, -X) : 0;
      pts.push([x, mid - y * vs]);
    }
    const grad = ctx.createLinearGradient(0, mid - shownH * vs * 0.5, 0, h);
    grad.addColorStop(0, '#2c8fb0'); grad.addColorStop(1, '#06283a');
    ctx.beginPath(); ctx.moveTo(left, h); pts.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(w, h); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = 'rgba(244,248,250,0.9)'; ctx.lineWidth = 1.6; ctx.stroke();
    // significant-height band
    ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(245,194,107,0.7)'; ctx.lineWidth = 1;
    [Hs / 2, -Hs / 2].forEach((yy) => { ctx.beginPath(); ctx.moveTo(left, mid - yy * vs); ctx.lineTo(w, mid - yy * vs); ctx.stroke(); });
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(245,194,107,0.9)'; ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`typical wave height ${fmtLen(Hs)}`, w - 150, mid - (Hs / 2) * vs - 6);
    // ruler
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.moveTo(left - 8, 6); ctx.lineTo(left - 8, h - 6); ctx.stroke();
    const step = shownH > 12 ? 5 : shownH > 5 ? 2 : 1;
    for (let m = -Math.floor(shownH / step) * step; m <= shownH; m += step) {
      const y = mid - m * vs;
      if (y < 8 || y > h - 4) continue;
      ctx.beginPath(); ctx.moveTo(left - 13, y); ctx.lineTo(left - 8, y); ctx.stroke();
      ctx.fillText(`${m > 0 ? '+' : ''}${m} m`, 8, y + 4);
    }
    // a 1.8 m person, standing in the trough, for scale
    const px = left + 18, base = mid + (Hs / 2) * vs, ph = 1.8 * vs;
    ctx.fillStyle = '#f5c26b';
    ctx.beginPath(); ctx.arc(px, base - ph + ph * 0.07, ph * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(px - ph * 0.06, base - ph * 0.86, ph * 0.12, ph * 0.46);
    ctx.fillRect(px - ph * 0.05, base - ph * 0.42, ph * 0.04, ph * 0.42);
    ctx.fillRect(px + ph * 0.01, base - ph * 0.42, ph * 0.04, ph * 0.42);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    if (squash > 1.05) ctx.fillText(`side view · horizontal squeezed ×${squash < 10 ? squash.toFixed(1) : Math.round(squash)} to fit`, left + 40, h - 10);
    else ctx.fillText('side view · true proportions', left + 40, h - 10);
  });

  update();
  window.__wind = ocean;
  return { ocean };
}
