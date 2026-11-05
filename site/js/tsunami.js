// Chapter 5 — tsunamis. A megathrust earthquake lifts (and drops) the seafloor; the
// whole water column moves with it. We solve the linear shallow-water equations
//   ∂η/∂t + ∂(h u)/∂x = 0,   ∂u/∂t + g ∂η/∂x = 0
// on a 600 km ocean cross-section (staggered grid, 1 km cells). Long waves like
// tsunamis are non-dispersive, so this is the right physics — speed √(g h),
// shoaling (Green's law emerges by itself), reflection, and the drawdown.
import { g, clamp } from './physics.js';
import { fitCanvas, visibleLoop, bindRange, $ } from './util.js';

const L = 600;            // km
const N = 600;            // cells
const DX = (L * 1000) / N;
const FAULT = 425;        // km

function depthAt(x) {
  if (x < 380) return 4000;
  if (x < 410) return 4000 + 1500 * Math.sin(((x - 380) / 30) * Math.PI);   // trench
  if (x < 520) return 4000 - ((x - 410) / 110) * 3800;                       // continental slope
  if (x < 585) return 200 - ((x - 520) / 65) * 160;                          // shelf
  return 40 - ((x - 585) / 15) * 32;                                         // nearshore → 8 m
}

export function initTsunami() {
  const canvas = $('ts-canvas');
  const hf = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) hf[i] = depthAt((i * DX) / 1000);
  const hMax = Math.max(...hf);
  const DT = (0.8 * DX) / Math.sqrt(g * hMax);
  let eta, u, maxEnv, simT, M = 9.0, gauge, arrival, firstSign, drawdown, peakCoast, flash, running;

  function quake() {
    eta = new Float64Array(N); u = new Float64Array(N + 1); maxEnv = new Float64Array(N);
    const A = 0.5 * Math.pow(10, 0.5 * (M - 7));        // peak seafloor uplift, m
    const W = 40 * Math.pow(10, 0.35 * (M - 7));        // rupture width, km
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * DX / 1000;
      // uplift seaward of the fault, subsidence landward — typical megathrust
      const up = A * Math.exp(-(((x - FAULT) / Math.min(W * 0.3, 55)) ** 2));
      const down = -0.45 * A * Math.exp(-(((x - (FAULT + Math.min(W * 0.5, 70))) / Math.min(W * 0.25, 35)) ** 2));
      eta[i] = up + down;
    }
    simT = 0; gauge = []; arrival = null; firstSign = 0; drawdown = 0; peakCoast = 0; flash = 1; running = true;
  }

  function step() {
    for (let i = 1; i < N; i++) u[i] -= (DT * g * (eta[i] - eta[i - 1])) / DX;
    u[0] = -Math.sqrt(g / hf[0]) * eta[0];             // open ocean: let waves leave
    u[N] = 0;                                          // the coast: a wall
    for (let i = 0; i < N; i++) {
      eta[i] -= (DT * (hf[i + 1] * u[i + 1] - hf[i] * u[i])) / DX;
      if (eta[i] > maxEnv[i]) maxEnv[i] = eta[i];
    }
    simT += DT;
    const c = eta[N - 1];
    if (arrival == null && Math.abs(c) > 0.05) { arrival = simT; firstSign = Math.sign(c); }
    if (c < drawdown) drawdown = c;
    if (c > peakCoast) peakCoast = c;
  }

  bindRange($('ts-m'), (v) => {
    M = v;
    const A = 0.5 * Math.pow(10, 0.5 * (M - 7)), W = 40 * Math.pow(10, 0.35 * (M - 7));
    $('ts-m-out').textContent = `M ${v.toFixed(1)}`;
    $('ts-m-note').textContent = `Seafloor jumps up to ${A < 1 ? A.toFixed(1) : Math.round(A)} m along a ${Math.round(W)} km wide strip`;
  });
  $('ts-go').addEventListener('click', quake);
  quake();
  window.__tsunami = { advance(sec) { const t = simT + sec; while (simT < t) step(); readout(); draw(); } };

  function readout() {
    const deep = Math.max(...maxEnv.slice(0, 330));
    $('ts-speed').textContent = `${Math.round(Math.sqrt(g * 4000) * 3.6)} km/h`;
    $('ts-sea').textContent = deep > 0.01 ? `${deep < 1 ? Math.round(deep * 100) + ' cm' : deep.toFixed(1) + ' m'}` : '–';
    $('ts-coast').textContent = arrival ? `${peakCoast.toFixed(1)} m` : 'not yet';
    const min = Math.floor(simT / 60);
    let msg;
    if (!arrival) msg = `${min} min after the earthquake. Out at sea the wave is racing along at airliner speed, but it's so low and so long that a ship would never notice it pass.`;
    else {
      const am = Math.round(arrival / 60);
      msg = `${min} min after the earthquake. The tsunami reached the coast after <b>${am} minutes</b>. `;
      if (firstSign < 0) msg += `<b>The sea drew back first</b> — by ${Math.abs(drawdown).toFixed(1)} m — before the first crest arrived. That retreat is nature's warning: when the sea suddenly empties, run for high ground. `;
      msg += `It doesn't come as one curling wave but as a fast-rising flood, and <b>it keeps coming</b>: crests minutes apart, for hours.`;
    }
    $('ts-now').innerHTML = msg;
  }

  visibleLoop(canvas, (dt) => {
    if (running) {
      const target = simT + dt * 75;                    // 75× real time
      while (simT < target) step();
      if (simT > 95 * 60) running = false;
      readout();
    }
    draw();
  });

  function draw() {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const left = 10, right = w - 70;
    const X = (km) => left + (km / L) * (right - left);
    const y0 = h * 0.3;                                 // sea level on screen
    const dScale = (h - y0 - 46) / 5600;                // px per metre of depth
    const eScale = Math.min(14, (y0 - 30) / 8);         // px per metre of wave height
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, y0);
    sky.addColorStop(0, '#0d2a40'); sky.addColorStop(1, '#3d6d8c');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, y0 + 2);
    // water body with the live surface
    ctx.beginPath(); ctx.moveTo(X(0), h);
    for (let i = 0; i < N; i++) ctx.lineTo(X((i + 0.5) * L / N), y0 - clamp(eta[i], -12, 18) * eScale);
    ctx.lineTo(X(L), h); ctx.closePath();
    const wg = ctx.createLinearGradient(0, y0, 0, h);
    wg.addColorStop(0, '#2a8fb0'); wg.addColorStop(0.25, '#155a7e'); wg.addColorStop(1, '#061e30');
    ctx.fillStyle = wg; ctx.fill();
    // max-height envelope
    ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(255,154,122,0.7)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < N; i++) { const xx = X((i + 0.5) * L / N), yy = y0 - clamp(maxEnv[i], 0, 18) * eScale; i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(240,250,255,0.95)'; ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < N; i++) { const xx = X((i + 0.5) * L / N), yy = y0 - clamp(eta[i], -12, 18) * eScale; i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
    ctx.stroke();
    // seabed
    ctx.beginPath(); ctx.moveTo(X(0), h);
    for (let x = 0; x <= L; x += 2) ctx.lineTo(X(x), y0 + depthAt(x) * dScale);
    ctx.lineTo(X(L), y0 + 10 * dScale); ctx.lineTo(w, y0 - 26); ctx.lineTo(w, h); ctx.closePath();
    const bg = ctx.createLinearGradient(0, y0, 0, h);
    bg.addColorStop(0, '#9c7b4c'); bg.addColorStop(1, '#3d2c18');
    ctx.fillStyle = bg; ctx.fill();
    // land + town
    ctx.fillStyle = '#5f8a4e'; ctx.fillRect(X(L), y0 - 26, w - X(L), 4);
    ctx.fillStyle = 'rgba(233,241,245,0.85)';
    for (let k = 0; k < 4; k++) ctx.fillRect(X(L) + 10 + k * 13, y0 - 26 - 10 - (k % 2) * 6, 9, 10 + (k % 2) * 6);
    // fault + flash
    flash *= 0.96;
    const fy = y0 + depthAt(FAULT) * dScale;
    ctx.strokeStyle = `rgba(255,120,90,${0.5 + flash * 0.5})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(FAULT) - 14, fy + 26); ctx.lineTo(X(FAULT) + 10, fy - 6); ctx.stroke();
    if (flash > 0.05) { ctx.fillStyle = `rgba(255,154,122,${flash * 0.5})`; ctx.beginPath(); ctx.arc(X(FAULT), fy, 10 + (1 - flash) * 40, 0, Math.PI * 2); ctx.fill(); }
    // ship far out at sea, riding the surface
    const si = 120, sy = y0 - eta[si] * eScale;
    ctx.fillStyle = '#f4f8fa';
    ctx.beginPath(); ctx.moveTo(X(si * L / N) - 14, sy - 2); ctx.lineTo(X(si * L / N) + 14, sy - 2); ctx.lineTo(X(si * L / N) + 9, sy + 4); ctx.lineTo(X(si * L / N) - 9, sy + 4); ctx.fill();
    ctx.fillRect(X(si * L / N) - 3, sy - 10, 7, 8);
    // labels
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(233,241,245,0.8)';
    ctx.fillText('open ocean · 4 km deep', X(20), y0 + 60);
    ctx.fillText('trench', X(372), y0 + 5500 * dScale - 8);
    ctx.fillText('shelf · 40–200 m', X(505), y0 + 200 * dScale + 30);
    ctx.fillStyle = '#ff9a7a'; ctx.fillText('earthquake', X(FAULT) + 14, fy + 4);
    ctx.fillStyle = 'rgba(233,241,245,0.8)'; ctx.textAlign = 'right';
    ctx.fillText('coast', w - 8, y0 - 44); ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`${L} km of ocean · wave heights exaggerated ~${Math.round(eScale / dScale)}× compared with depth · dashed: highest the sea has reached`, 10, h - 10);
    ctx.fillStyle = 'rgba(233,241,245,0.9)'; ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`${Math.floor(simT / 60)} min after the earthquake`, 10, 20);

    // tide-gauge inset at the coast
    gauge.push([simT, eta[N - 1]]);
    if (gauge.length > 4000) gauge.shift();
    const gw = 170, gh = 58, gx = w - gw - 10, gyT = 8;
    ctx.fillStyle = 'rgba(6,21,33,0.7)'; ctx.fillRect(gx, gyT, gw, gh);
    ctx.fillStyle = 'rgba(233,241,245,0.7)'; ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('sea level at the coast', gx + 6, gyT + 12);
    const tMax = 95 * 60, gMid = gyT + 36, gS = 20 / Math.max(2, peakCoast, -drawdown);
    ctx.setLineDash([2, 3]); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(gx + 4, gMid); ctx.lineTo(gx + gw - 4, gMid); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#3fb3c9'; ctx.lineWidth = 1.3; ctx.beginPath();
    gauge.forEach(([t, v], k) => { const xx = gx + (t / tMax) * gw, yy = gMid - v * gS; k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); });
    ctx.stroke();
  }
}
