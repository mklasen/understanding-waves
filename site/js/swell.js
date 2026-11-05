// Chapter 4 — swell. A storm (wind U for D hours) sends out waves of many periods.
// Each period travels at its own deep-water group speed cg = gT/4π, so the sea
// "sorts itself": long waves outrun short ones. Short waves also die out sooner.
import { TAU, g, jonswap, windSea, deepGroupSpeed, rng } from './physics.js';
import { fitCanvas, visibleLoop, bindRange, $, fmtLen } from './util.js';

const T_LO = 4, T_HI = 24, NB = 60;
const MAX_DAYS = 14;

export function initSwell() {
  const canvas = $('swell-canvas');
  let U = 22, D = 30, X = 3500, day = 0, playing = false, tau = 0;
  const rand = rng(42);
  const bins = Array.from({ length: NB }, (_, i) => {
    const T = T_LO + ((T_HI - T_LO) * (i + 0.5)) / NB;
    return { T, cg: deepGroupSpeed(T), omega: TAU / T, k: (TAU / T) ** 2 / g, phase: rand() * TAU };
  });

  function storm() {
    const s = windSea(U, 1500, D);
    let m0 = 0;
    const E = bins.map((b) => jonswap(1 / b.T, 1 / s.Tp, 3.3) * (1 / b.T) * (1 / b.T)); // S(f) df with df ∝ f² dT
    E.forEach((e) => (m0 += e));
    const tgt = (s.Hs / 4) ** 2;
    return { ...s, E: E.map((e) => (e * tgt) / m0) };
  }
  let st = storm();

  // energy of bin b at distance x (km) and time t (h since storm began)
  function energyAt(b, i, xKm, tH) {
    const front = (b.cg * 3.6 * tH);               // km
    const back = (b.cg * 3.6 * (tH - D));
    if (xKm > front || xKm < back) return 0;
    // soft edges, spreading loss, and dissipation that hits short waves hardest
    const edge = Math.min(1, (front - xKm) / 150 + 0.15) * Math.min(1, (xKm - back) / 150 + 0.15);
    const spread = 1 / (1 + xKm / 1500);
    const decay = Math.exp(-xKm / (350 * Math.pow(b.T / 6, 4)));
    return st.E[i] * Math.max(0, Math.min(1, edge)) * spread * decay;
  }

  function update() {
    st = storm();
    $('sw-u-out').textContent = `${Math.round(U * 1.944)} kn`;
    $('sw-dur-out').textContent = D < 48 ? `${D} h` : `${(D / 24).toFixed(1)} days`;
    $('sw-x-out').textContent = `${Math.round(X).toLocaleString('en')} km`;
    $('sw-time-out').textContent = `Day ${day.toFixed(1)} after the storm began`;
    // what's arriving at the beach
    const tH = day * 24;
    let m0 = 0, best = -1, bestE = 0;
    bins.forEach((b, i) => {
      const e = energyAt(b, i, X, tH);
      m0 += e;
      if (e > bestE) { bestE = e; best = i; }
    });
    const Hs = 4 * Math.sqrt(m0);
    let msg;
    if (Hs < 0.05) {
      const firstT = X / (deepGroupSpeed(T_HI) * 3.6) / 24;
      msg = day < firstT ? `Flat calm. The first, fastest swell is still out at sea — it arrives on day ${firstT.toFixed(1)}.` : 'The swell has passed. The beach goes quiet — until the next storm, somewhere.';
    } else {
      const b = bins[best];
      const born = X / (b.cg * 3.6);
      msg = `<b>${fmtLen(Hs)}</b> waves with a <b>${b.T.toFixed(0)}-second</b> period are rolling in — born ${born < 48 ? Math.round(born) + ' hours' : (born / 24).toFixed(1) + ' days'} ago, ${Math.round(X).toLocaleString('en')} km away. ${b.T > 13 ? 'Long, clean, powerful lines: the forerunners.' : b.T > 9 ? 'Classic groundswell.' : 'Shorter, choppier stragglers now.'}`;
    }
    $('sw-now').innerHTML = msg;
  }

  bindRange($('sw-u'), (v) => { U = v; update(); });
  bindRange($('sw-dur'), (v) => { D = v; update(); });
  bindRange($('sw-x'), (v) => { X = v; update(); });
  const timeIn = $('sw-time');
  bindRange(timeIn, (v) => { day = v * MAX_DAYS; update(); });
  const playBtn = $('sw-play');
  playBtn.addEventListener('click', () => {
    playing = !playing;
    if (playing && day >= MAX_DAYS - 0.01) day = 0;
    playBtn.textContent = playing ? '❚❚' : '▶';
  });

  visibleLoop(canvas, (dt) => {
    tau += dt;
    if (playing) {
      day = Math.min(MAX_DAYS, day + dt * 0.55);
      timeIn.value = day / MAX_DAYS;
      timeIn.style.setProperty('--fill', `${(day / MAX_DAYS) * 100}%`);
      if (day >= MAX_DAYS) { playing = false; playBtn.textContent = '▶'; }
      update();
    }
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const tH = day * 24;
    const left = 64, right = w - 18;
    const xMaxKm = Math.max(X * 1.12, 2000);
    const kmPx = (right - left) / xMaxKm;
    const mapTop = 30, mapBot = h * 0.62;
    // axis labels
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(233,241,245,0.55)';
    ctx.save(); ctx.translate(14, (mapTop + mapBot) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center';
    ctx.fillText('wave period →  longer', 0, 0); ctx.restore();
    const yOfT = (T) => mapBot - ((T - T_LO) / (T_HI - T_LO)) * (mapBot - mapTop);
    [6, 10, 14, 18, 22].forEach((T) => {
      ctx.fillText(`${T} s`, left - 34, yOfT(T) + 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.beginPath(); ctx.moveTo(left, yOfT(T)); ctx.lineTo(right, yOfT(T)); ctx.stroke();
    });
    // energy bands
    const maxE = Math.max(...st.E) || 1;
    const bh = (mapBot - mapTop) / NB + 0.6;
    for (let i = 0; i < NB; i++) {
      const b = bins[i];
      const y = yOfT(b.T) - bh / 2;
      const step = 4;
      for (let px = left; px < right; px += step) {
        const xKm = (px - left) / kmPx;
        const e = energyAt(b, i, xKm, tH) / maxE;
        if (e <= 0.002) continue;
        const a = Math.min(1, Math.sqrt(e) * 1.4);
        const hue = 200 - (b.T - T_LO) * 4;
        ctx.fillStyle = `hsla(${hue},75%,${55 + a * 20}%,${a})`;
        ctx.fillRect(px, y, step + 0.5, bh);
      }
    }
    // storm & beach markers
    const stormOn = tH < D;
    ctx.fillStyle = stormOn ? 'rgba(255,154,122,0.95)' : 'rgba(255,154,122,0.4)';
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(stormOn ? '🌀 storm blowing' : '🌀 storm over', left, mapTop - 12);
    const bx = left + X * kmPx;
    ctx.strokeStyle = 'rgba(245,194,107,0.9)'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(bx, mapTop - 4); ctx.lineTo(bx, mapBot); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#f5c26b'; ctx.textAlign = 'right';
    ctx.fillText('your beach 🏖', bx - 4, mapTop - 12); ctx.textAlign = 'left';
    // distance axis
    ctx.fillStyle = 'rgba(233,241,245,0.55)'; ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    const stepKm = xMaxKm > 6000 ? 2000 : xMaxKm > 3000 ? 1000 : 500;
    for (let k = 0; k <= xMaxKm; k += stepKm) ctx.fillText(`${k.toLocaleString('en')} km`, left + k * kmPx - 10, mapBot + 16);

    // the sea surface arriving at the beach (real-time)
    const pTop = mapBot + 34, pH = h - pTop - 8, mid = pTop + pH * 0.5;
    ctx.fillStyle = 'rgba(233,241,245,0.7)';
    ctx.fillText('What the sea looks like at your beach right now', left, pTop - 4);
    const amps = bins.map((b, i) => Math.sqrt(2 * energyAt(b, i, X, tH)));
    const totalA = amps.reduce((s, a) => s + a, 0);
    const vs = (pH * 0.42) / Math.max(1.6, totalA * 0.6);
    const viewM = 600;
    ctx.beginPath(); ctx.moveTo(left, h);
    for (let px = left; px <= right; px += 3) {
      const xm = ((px - left) / (right - left)) * viewM;
      let y = 0;
      for (let i = 0; i < NB; i++) if (amps[i] > 1e-4) y += amps[i] * Math.sin(bins[i].k * xm - bins[i].omega * tau + bins[i].phase);
      ctx.lineTo(px, mid - y * vs);
    }
    ctx.lineTo(right, h); ctx.closePath();
    const surfPath = new Path2D();
    for (let px = left, first = true; px <= right; px += 3, first = false) {
      const xm = ((px - left) / (right - left)) * viewM;
      let y = 0;
      for (let i = 0; i < NB; i++) if (amps[i] > 1e-4) y += amps[i] * Math.sin(bins[i].k * xm - bins[i].omega * tau + bins[i].phase);
      first ? surfPath.moveTo(px, mid - y * vs) : surfPath.lineTo(px, mid - y * vs);
    }
    const gr = ctx.createLinearGradient(0, pTop, 0, h);
    gr.addColorStop(0, 'rgba(63,179,201,0.7)'); gr.addColorStop(1, 'rgba(10,40,60,0.3)');
    ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = '#f4f8fa'; ctx.lineWidth = 1.5; ctx.stroke(surfPath);
  });
  update();
}
