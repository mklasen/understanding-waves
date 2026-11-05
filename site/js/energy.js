// Chapter 3 — "a wave is energy, not water". Linear (Airy) particle orbits:
// circles in deep water shrinking as e^{kz}, flattened ellipses in shallow water.
// A duck rides the surface and slowly creeps forward by Stokes drift.
import { TAU, waveNumber, phaseSpeed, deepLength } from './physics.js';
import { fitCanvas, visibleLoop, bindRange, $, fmtLen } from './util.js';

export function initEnergy() {
  const canvas = $('energy-canvas');
  let H = 2, T = 7, dv = 1, t = 0, duckX = 0;

  const state = () => {
    const L0 = deepLength(T);
    const h = L0 * 0.035 * Math.pow(1 / 0.035, dv);   // 3.5% … 100% of L0
    const omega = TAU / T;
    const k = waveNumber(omega, h);
    const L = TAU / k;
    const c = phaseSpeed(k, h);
    const a = H / 2;
    // Stokes drift at the surface (finite depth): ω k a² cosh(2kh) / (2 sinh²(kh))
    const us = (omega * k * a * a * Math.cosh(2 * k * h)) / (2 * Math.sinh(k * h) ** 2);
    return { L0, h, omega, k, L, c, a, us, kh: k * h };
  };

  function readout() {
    const s = state();
    $('en-h-out').textContent = `${H.toFixed(1)} m`;
    $('en-t-out').textContent = `${T.toFixed(1)} s`;
    const regime = s.kh > Math.PI ? 'deep' : s.kh < Math.PI / 10 ? 'shallow' : 'in between';
    $('en-d-out').textContent = `${fmtLen(s.h)} · ${regime}`;
    $('en-c').textContent = `${Math.round(s.c * 3.6)} km/h`;
    $('en-drift').textContent = `${fmtLen(s.us * T)} per wave`;
    $('en-depth').textContent = s.kh > Math.PI ? `${fmtLen(s.L / 2)} down` : 'reaches the seabed';
  }
  bindRange($('en-h'), (v) => { H = v; readout(); });
  bindRange($('en-t'), (v) => { T = v; readout(); });
  bindRange($('en-d'), (v) => { dv = v; readout(); });

  visibleLoop(canvas, (dt) => {
    t += dt;
    const s = state();
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    // geometry: show 2 wavelengths across; depth shown down to min(h, 0.6 L)
    const span = s.L * 2;
    const px = w / span;
    const showDepth = Math.min(s.h, s.L * 0.62);
    const top = h * 0.2;
    const vScale = Math.min(px, (h - top - 26) / showDepth);
    const E = Math.max(1, Math.min(8, (h * 0.07) / (s.a * vScale)));   // motion exaggeration
    const surfY = top;
    const bedY = surfY + s.h * vScale;
    const eta = (x) => s.a * Math.cos(s.k * x - s.omega * t);

    // water body
    const grad = ctx.createLinearGradient(0, surfY - 20, 0, h);
    grad.addColorStop(0, 'rgba(44,143,176,0.85)'); grad.addColorStop(1, 'rgba(6,30,48,0.9)');
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 3) ctx.lineTo(x, surfY - eta(x / px) * vScale * E);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = 'rgba(244,248,250,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 3) { const y = surfY - eta(x / px) * vScale * E; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();

    // seabed (if visible)
    if (bedY < h - 2) {
      const sg = ctx.createLinearGradient(0, bedY, 0, h);
      sg.addColorStop(0, '#c9a46a'); sg.addColorStop(1, '#6d5536');
      ctx.fillStyle = sg; ctx.fillRect(0, bedY, w, h - bedY);
    }

    // particles + orbits
    const cols = 18, rows = 6;
    const sh = Math.sinh(s.k * s.h);
    for (let r = 0; r < rows; r++) {
      const z = -(r / (rows - 0.3)) * showDepth * 0.96;          // depth below surface (m, negative)
      const A = (s.a * Math.cosh(s.k * (z + s.h))) / sh;         // horizontal semi-axis
      const B = (s.a * Math.sinh(s.k * (z + s.h))) / sh;         // vertical semi-axis
      for (let i = 0; i < cols; i++) {
        const x0 = ((i + 0.5) / cols) * span;
        const cx = x0 * px, cy = surfY - z * vScale;
        const ph = s.k * x0 - s.omega * t;
        ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(A * vScale * E, 0.3), Math.max(B * vScale * E, 0.3), 0, 0, TAU); ctx.stroke();
        const x = cx - A * Math.sin(ph) * vScale * E;
        const y = cy - B * Math.cos(ph) * vScale * E;
        ctx.fillStyle = r === 0 ? '#f4f8fa' : `rgba(200,235,245,${0.85 - r * 0.1})`;
        ctx.beginPath(); ctx.arc(x, y, r === 0 ? 3.2 : 2.6, 0, TAU); ctx.fill();
      }
    }

    // the duck: rides the surface orbit + Stokes drift
    duckX = (duckX + s.us * dt) % span;
    const dx0 = span * 0.5 + duckX - span * 0.25;
    const dph = s.k * dx0 - s.omega * t;
    const A0 = (s.a * Math.cosh(s.k * s.h)) / sh;
    const ddx = (dx0 - A0 * Math.sin(dph) * E) * px;
    const ddy = surfY - s.a * Math.cos(dph) * vScale * E;
    const slope = Math.atan(s.a * s.k * Math.sin(dph) * E * (vScale / px)) * 0.8;
    drawDuck(ctx, ddx, ddy, slope);

    // a crest flag racing along
    const crestX = (((s.omega * t) / s.k) % s.L + s.L) % s.L;
    for (const cxm of [crestX, crestX + s.L]) {
      const X = cxm * px;
      if (X > w) continue;
      ctx.strokeStyle = 'rgba(245,194,107,0.85)'; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(X, surfY - s.a * vScale * E - 6); ctx.lineTo(X, surfY - s.a * vScale * E - 34); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#f5c26b'; ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('crest →', X + 4, surfY - s.a * vScale * E - 26);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`${fmtLen(s.L * 2)} of sea shown${E > 1.05 ? ` · motion exaggerated ×${E.toFixed(1)} so you can see it` : ''}`, 10, h - 10);
    if (bedY < h - 2) { ctx.fillStyle = 'rgba(30,20,10,0.8)'; ctx.fillText('seabed', w - 56, Math.min(h - 10, bedY + 16)); }
  });
  readout();
}

function drawDuck(ctx, x, y, ang) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-ang);
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath(); ctx.ellipse(0, -6, 13, 7, 0, 0, Math.PI * 2); ctx.fill();          // body
  ctx.beginPath(); ctx.arc(9, -15, 6, 0, Math.PI * 2); ctx.fill();                   // head
  ctx.fillStyle = '#ff8a3d';
  ctx.beginPath(); ctx.moveTo(14, -16); ctx.lineTo(21, -14); ctx.lineTo(14, -12); ctx.fill(); // beak
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(10.5, -16.5, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
