// Chapter 6 — the beach. Linear shoaling (energy flux conserved: H ∝ 1/√cg),
// depth-limited breaking (H ≤ 0.78 h), breaker type from the Iribarren number,
// and a tide that raises/lowers the whole water level underneath the waves.
import { TAU, g, waveNumber, phaseSpeed, groupSpeed, deepGroupSpeed, BREAK_GAMMA, breakerType, clamp } from './physics.js';
import { fitCanvas, visibleLoop, bindRange, setRange, $, fmtLen } from './util.js';

const XM = 500, N = 500, DX = XM / N;
const BEDS = {
  gentle: (x) => -9 + (x / XM) * 12,
  steep: (x) => (x < 300 ? -12 + x * 0.004 : -10.8 + (x - 300) * 0.075),
  bar: (x) => -9 + (x / XM) * 12 + 1.9 * Math.exp(-(((x - 230) / 32) ** 2)),
  reef: (x) => {
    if (x < 200) return -14;
    if (x < 216) return -14 + ((x - 200) / 16) * 13;
    if (x < 290) return -1.0 + 0.15 * Math.sin(x * 0.7);
    if (x < 320) return -1.0 - ((x - 290) / 30) * 1.6;
    if (x < 420) return -2.6;
    return -2.6 + ((x - 420) / 80) * 5.6;
  },
};
const BED_NOTES = {
  gentle: 'A long, gentle slope: waves feel the bottom early and break gradually.',
  steep: 'Deep water right up to the shore: waves arrive almost full-size and dump hard.',
  bar: 'A sandbar offshore trips the big waves first; they re-form in the trough and break again at the shore.',
  reef: 'A reef rises abruptly from deep water: waves have no time to adjust and pitch violently.',
};

export function initBeach() {
  const canvas = $('beach-canvas');
  let bed = 'gentle', H0 = 1.4, T = 11, tide = 0, t = 0, running = false, tideClock = 0;
  let model = null;

  function compute() {
    const zb = BEDS[bed];
    const omega = TAU / T, omega2 = TAU / (T * 1.075);
    const cg0 = deepGroupSpeed(T);
    const cols = [];
    let phi = 0, phi2 = 0, f = 1, xb = null, shore = XM, broken = false, foamAge = 99;
    for (let i = 0; i <= N; i++) {
      const x = i * DX;
      const z = zb(x);
      const h = tide - z;
      if (h <= 0.04) { shore = x; cols.push({ x, z, h, dry: true }); for (let j = i + 1; j <= N; j++) cols.push({ x: j * DX, z: zb(j * DX), h: tide - zb(j * DX), dry: true }); break; }
      const k = waveNumber(omega, h), k2 = waveNumber(omega2, h);
      const cg = groupSpeed(k, h);
      const Hsh = H0 * Math.sqrt(cg0 / cg);
      const cap = (BREAK_GAMMA * h) / Hsh;
      let breaking = false;
      if (cap < f) { f = cap; breaking = true; if (xb == null) xb = x; broken = true; foamAge = 0; }
      else foamAge += DX;
      const H = Hsh * f;
      phi += k * DX; phi2 += k2 * DX;
      cols.push({ x, z, h, k, H, phi, phi2, breaking, broken, foamAge, c: phaseSpeed(k, h), ratio: H / (BREAK_GAMMA * h) });
    }
    // breaker type at the (first) break point, from the local bed slope
    let info = null;
    if (xb != null) {
      const s = Math.abs((zb(xb + 12) - zb(xb - 12)) / 24);
      const bt = breakerType(Math.max(s, 0.005), H0, T);
      const col = cols[Math.round(xb / DX)];
      info = { xb, hb: col.h, Hb: col.H, slope: s, ...bt, cb: col.c };
    }
    model = { cols, xb, shore, info, omega, omega2, c0: cols[0].c ?? 0, zb };
    readout();
  }

  function readout() {
    $('bc-h-out').textContent = `${H0.toFixed(1)} m`;
    $('bc-t-out').textContent = `${T.toFixed(1)} s`;
    $('bc-tide-out').textContent = `${tide >= 0 ? '+' : '−'}${Math.abs(tide).toFixed(1)} m ${tide > 0.5 ? '(high)' : tide < -0.5 ? '(low)' : '(mid)'}`;
    const i = model.info;
    if (i) {
      $('bc-depth').textContent = `${fmtLen(i.hb)} of water`;
      $('bc-type').textContent = i.type[0].toUpperCase() + i.type.slice(1);
      $('bc-speed').textContent = `${Math.round(model.c0 * 3.6)} → ${Math.round(i.cb * 3.6)} km/h`;
    } else {
      $('bc-depth').textContent = 'at the shoreline';
      $('bc-type').textContent = 'Surging';
      $('bc-speed').textContent = `${Math.round(model.c0 * 3.6)} km/h → shore`;
    }
  }

  document.querySelectorAll('#bc-bed button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#bc-bed button').forEach((o) => o.classList.toggle('on', o === b));
    bed = b.dataset.bed; compute();
  }));
  bindRange($('bc-h'), (v) => { H0 = v; compute(); });
  bindRange($('bc-t'), (v) => { T = v; compute(); });
  const tideIn = $('bc-tide');
  bindRange(tideIn, (v) => { tide = v; compute(); });
  const runBtn = $('bc-run');
  runBtn.addEventListener('click', () => {
    running = !running;
    runBtn.textContent = running ? 'Pause the tide ❚❚' : 'Run the tide ▶';
    if (running) tideClock = Math.asin(clamp(tide / 1.5, -1, 1)) / TAU * 12.42;
  });

  const foamSeeds = Array.from({ length: 220 }, () => [Math.random(), Math.random(), Math.random()]);

  visibleLoop(canvas, (dt) => {
    t += dt;
    if (running) {
      tideClock += dt * 0.55;                         // 0.55 tidal hours per real second
      setRange(tideIn, (1.5 * Math.sin((TAU * tideClock) / 12.42)).toFixed(2));
    }
    draw();
  });

  function draw() {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const m = model;
    const zTop = 5.5, zBot = -11.5;
    const vpx = h / (zTop - zBot);
    const hpx = w / XM;
    const X = (x) => x * hpx;
    const Y = (z) => (zTop - z) * vpx;
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, Y(tide));
    sky.addColorStop(0, '#163a57'); sky.addColorStop(1, '#5f8fae');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, Y(0) + 40);

    // instantaneous surface
    const surf = new Float32Array(m.cols.length);
    const grp = [];
    for (let i = 0; i < m.cols.length; i++) {
      const c = m.cols[i];
      if (c.dry) { surf[i] = NaN; continue; }
      const th = c.phi - m.omega * t;
      const group = 0.8 + 0.2 * Math.cos(c.phi2 - c.phi - (m.omega2 - m.omega) * t);
      grp[i] = group;
      const p = clamp(c.ratio, 0, 1) ** 3;
      const stokes = Math.cos(th) + 0.28 * p * Math.cos(2 * th) + 0.38 * p * Math.sin(2 * th);
      let bore = 0;
      for (let n = 1; n <= 5; n++) bore -= Math.sin(n * th) / n;
      bore *= 2 / Math.PI;
      const q = c.broken ? clamp((c.x - m.xb) / 40, 0, 1) * 0.85 : 0;
      surf[i] = tide + (c.H / 2) * group * ((1 - q) * stokes + q * bore);
    }
    // swash: run-up on the beach face, driven by the wave phase at the shore
    const iS = Math.max(1, Math.round(m.shore / DX) - 1);
    const lastWet = m.cols[iS - 1] || m.cols[0];
    const thS = (lastWet.phi ?? 0) - m.omega * t;
    const runup = Math.max(0, 0.45 * Math.min(H0, (m.info ? m.info.Hb : H0)) * (0.5 + 0.5 * Math.cos(thS)) * (grp[iS - 1] || 1));
    // water polygon
    ctx.beginPath();
    ctx.moveTo(0, h);
    let lastX = 0;
    for (let i = 0; i < m.cols.length; i++) {
      const c = m.cols[i];
      if (isNaN(surf[i])) break;
      ctx.lineTo(X(c.x), Y(Math.max(surf[i], c.z)));
      lastX = c.x;
    }
    // swash sheet over the dry beach
    let swashX = lastX;
    for (let x = lastX; x < XM; x += DX) {
      if (m.zb(x) > tide + runup) break;
      ctx.lineTo(X(x), Y(m.zb(x) + 0.06 + 0.04 * (1 - (m.zb(x) - tide) / Math.max(runup, 0.01))));
      swashX = x;
    }
    ctx.lineTo(X(swashX), h); ctx.closePath();
    const wg = ctx.createLinearGradient(0, Y(tide + 1), 0, Y(-10));
    wg.addColorStop(0, '#3fb3c9'); wg.addColorStop(0.35, '#1d6f93'); wg.addColorStop(1, '#0a2b44');
    ctx.fillStyle = wg; ctx.fill();
    // surface line
    ctx.beginPath();
    for (let i = 0; i < m.cols.length && !isNaN(surf[i]); i++) {
      const xx = X(m.cols[i].x), yy = Y(Math.max(surf[i], m.cols[i].z));
      i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
    }
    ctx.strokeStyle = 'rgba(230,248,252,0.9)'; ctx.lineWidth = 1.6; ctx.stroke();

    // foam: on breaking faces and drifting in the surf zone
    if (m.xb != null) {
      for (const [a, b, s] of foamSeeds) {
        const x = m.xb + a * (m.shore - m.xb + 8);
        const i = Math.min(Math.round(x / DX), m.cols.length - 1);
        const c = m.cols[i];
        if (!c || c.dry || isNaN(surf[i])) continue;
        const th = c.phi - m.omega * t;
        const face = Math.cos(th - 0.9);                  // the front of each crest
        const amt = clamp((face - 0.2) * 1.4, 0, 1) * clamp(1 - (x - m.xb) / (m.shore - m.xb + 30) * 0.6, 0.2, 1);
        const lingering = 0.35 * (0.5 + 0.5 * Math.sin(s * 40 + t * 0.5));
        const al = Math.max(amt, lingering * 0.6);
        if (al < 0.05) continue;
        const yy = Y(surf[i]) + b * 7 * (1 - amt) - 1;
        ctx.fillStyle = `rgba(250,253,255,${al * 0.85})`;
        ctx.beginPath(); ctx.arc(X(x), yy, 1.5 + s * 3 * al, 0, TAU); ctx.fill();
      }
      // plunging lip at the break point
      if (m.info && m.info.type !== 'spilling') {
        const ib = Math.round(m.xb / DX);
        for (let i = ib; i < Math.min(ib + 30, m.cols.length); i++) {
          const c = m.cols[i];
          if (c.dry) break;
          const th = ((c.phi - m.omega * t) % TAU + TAU) % TAU;
          if (th < 0.08 || th > TAU - 0.08) {
            const cx = X(c.x), cy = Y(surf[i]);
            const sz = Math.max(4, c.H * vpx * 0.55 * (grp[i] || 1));
            ctx.strokeStyle = 'rgba(240,250,255,0.9)'; ctx.lineWidth = 2.2;
            ctx.beginPath(); ctx.moveTo(cx - sz * 0.2, cy); ctx.quadraticCurveTo(cx + sz * 0.9, cy - sz * 0.15, cx + sz * 0.75, cy + sz * 0.8); ctx.stroke();
            break;
          }
        }
      }
    }

    // seabed / beach
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= XM; x += DX) ctx.lineTo(X(x), Y(m.zb(x)));
    ctx.lineTo(w, h); ctx.closePath();
    const sg = ctx.createLinearGradient(0, Y(4), 0, h);
    sg.addColorStop(0, '#e2c58d'); sg.addColorStop(0.5, '#b8955e'); sg.addColorStop(1, '#5a4528');
    ctx.fillStyle = sg; ctx.fill();
    // wet-sand sheen above the water line
    ctx.strokeStyle = 'rgba(120,90,50,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, Y(m.zb(0)));
    for (let x = 0; x <= XM; x += DX) ctx.lineTo(X(x), Y(m.zb(x)));
    ctx.stroke();

    // tide markers: high & low water lines on the beach
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    [[1.5, 'high tide'], [-1.5, 'low tide']].forEach(([lv, lab]) => {
      ctx.strokeStyle = 'rgba(90,50,150,0.75)'; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(w - 70, Y(lv)); ctx.lineTo(w, Y(lv)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(70,35,120,0.95)'; ctx.fillText(lab, w - 64, Y(lv) - 4);
    });
    // zone labels
    const lab = (x, txt, col = 'rgba(233,241,245,0.8)') => { ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(txt, X(x), 18); ctx.textAlign = 'left'; };
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    if (m.xb != null) {
      lab(Math.max(m.xb * 0.45, 40), 'shoaling → slower, shorter, taller');
      ctx.strokeStyle = 'rgba(245,194,107,0.7)'; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(X(m.xb), 26); ctx.lineTo(X(m.xb), Y(tide) - 10); ctx.stroke(); ctx.setLineDash([]);
      lab(m.xb, 'breaks here', '#f5c26b');
      if (m.shore - m.xb > 60) lab((m.xb + m.shore) / 2 + 10, 'surf zone');
    } else lab(m.shore * 0.5, 'waves reach the shore unbroken');
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`${XM} m of coast · heights exaggerated ×${(vpx / hpx).toFixed(0)}`, 10, h - 10);
    if (running) {
      ctx.fillStyle = 'rgba(181,156,255,0.95)';
      ctx.fillText('tide sped up ~2000× · waves in real time', 10, h - 26);
    }
    ctx.fillStyle = 'rgba(233,241,245,0.7)';
    ctx.fillText(BED_NOTES[bed], 10, 38);
  }

  compute();
}
