// Chapter 5 — tides (equilibrium theory). Top-down view from above the North Pole:
// Sun far to the left, Moon orbiting, Earth spinning under a two-bulged ocean.
import { TAU, SYNODIC_DAYS, MOON_AMP, SUN_AMP, moonAngle, observerAngle, moonDistanceFactor, tideHeight } from './physics.js';
import { fitCanvas, visibleLoop, $ } from './util.js';

const MONTH_H = SYNODIC_DAYS * 24;
export const tideBus = new EventTarget();   // lets the beach chapter follow along

export function initTides() {
  const canvas = $('tide-canvas'), chart = $('tide-chart');
  const timeIn = $('td-time');
  let hours = 12, playing = false, moonOn = true, sunOn = true, forces = false;
  const opts = () => ({ moon: moonOn ? 1 : 0, sun: sunOn ? 1 : 0 });

  // precompute the month's curve for the chart (recomputed on toggle)
  let curve = [];
  const buildCurve = () => {
    curve = [];
    for (let h = 0; h <= MONTH_H; h += 0.25) curve.push(tideHeight(h, opts()));
  };
  buildCurve();

  function phaseName(th) {
    const a = ((th % TAU) + TAU) % TAU;
    const names = ['New moon', 'Waxing crescent', 'First quarter (half moon)', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter (half moon)', 'Waning crescent'];
    return names[Math.round(a / (TAU / 8)) % 8];
  }

  function readout() {
    const d = Math.floor(hours / 24), hh = hours % 24;
    $('td-time-out').textContent = `Day ${d + 1}, ${String(Math.floor(hh)).padStart(2, '0')}:${String(Math.floor((hh % 1) * 60)).padStart(2, '0')}`;
    const th = moonAngle(hours);
    const align = Math.cos(2 * th);
    let kind;
    if (!moonOn && !sunOn) kind = 'No Moon, no Sun: no tides at all. The sea would sit still — though the wind would still make waves.';
    else if (!moonOn) kind = 'Sun only: tides still happen, but less than half as big — high water at the same clock time every day.';
    else if (!sunOn) kind = 'Moon only: steady tides, about 2/3 of the usual spring range, with no spring–neap rhythm.';
    else if (align > 0.75) kind = '<b>Spring tides</b> — Sun and Moon pull in line, their bulges add up: highest highs, lowest lows.';
    else if (align < -0.75) kind = '<b>Neap tides</b> — Sun and Moon pull at right angles and partly cancel: a small tidal range.';
    else kind = align > 0 ? 'Heading between spring and neap — the Sun is helping the Moon.' : 'Between neap and spring — the Sun is partly working against the Moon.';
    // next high water
    let nextHigh = null;
    for (let dh = 0.05; dh < 14; dh += 0.05) {
      const a = tideHeight(hours + dh - 0.05, opts()), b = tideHeight(hours + dh, opts()), c = tideHeight(hours + dh + 0.05, opts());
      if (b > a && b >= c && (moonOn || sunOn)) { nextHigh = dh; break; }
    }
    const now = tideHeight(hours, opts());
    const rising = tideHeight(hours + 0.1, opts()) > now;
    $('td-phase').textContent = phaseName(th);
    $('td-now').innerHTML = `${kind}${nextHigh != null ? ` Right now the tide is <b>${rising ? 'rising' : 'falling'}</b>; next high water in ${nextHigh < 1 ? '' : Math.floor(nextHigh) + ' h '}${Math.round((nextHigh % 1) * 60)} min.` : ''}`;
    tideBus.dispatchEvent(new CustomEvent('tide', { detail: { hours, level: now / ((MOON_AMP * 1.18 + SUN_AMP)) } }));
  }

  timeIn.addEventListener('input', () => { hours = parseFloat(timeIn.value); paint(); readout(); });
  const paint = () => timeIn.style.setProperty('--fill', `${(hours / MONTH_H) * 100}%`);
  $('td-play').addEventListener('click', (e) => { playing = !playing; e.currentTarget.textContent = playing ? '❚❚' : '▶'; });
  $('td-moon').addEventListener('change', (e) => { moonOn = e.target.checked; buildCurve(); readout(); });
  $('td-sun').addEventListener('change', (e) => { sunOn = e.target.checked; buildCurve(); readout(); });
  $('td-force').addEventListener('change', (e) => { forces = e.target.checked; });
  timeIn.value = hours; paint(); readout();

  // stars for the backdrop
  const stars = Array.from({ length: 90 }, () => [Math.random(), Math.random(), Math.random()]);

  visibleLoop(canvas, (dt) => {
    if (playing) {
      hours = (hours + dt * 9) % MONTH_H;   // ~2.7 s per day
      timeIn.value = hours; paint(); readout();
    }
    drawSystem();
    drawChart();
  });

  function drawSystem() {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#040d16'; ctx.fillRect(0, 0, w, h);
    for (const [x, y, b] of stars) { ctx.fillStyle = `rgba(255,255,255,${0.15 + b * 0.4})`; ctx.fillRect(x * w, y * h, 1.2, 1.2); }
    const cx = w * 0.56, cy = h * 0.5;
    const S = Math.min(w, h);
    const R = S * 0.13;                  // Earth radius on screen
    const orbit = S * 0.38;
    // the Sun, off to the left
    const sunA = sunOn ? 1 : 0.25;
    const sg = ctx.createRadialGradient(-S * 0.1, cy, 0, -S * 0.1, cy, S * 0.55);
    sg.addColorStop(0, `rgba(255,220,140,${0.9 * sunA})`); sg.addColorStop(0.35, `rgba(255,190,90,${0.25 * sunA})`); sg.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = `rgba(255,230,170,${0.8 * sunA})`; ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(sunOn ? '☀ to the Sun' : '☀ Sun (switched off)', 10, 20);
    // screen position from Sun-frame angle (Sun at θ=0 → left; counter-clockwise)
    const P = (th, r) => [cx + r * Math.cos(Math.PI + th), cy - r * Math.sin(Math.PI + th)];
    const thM = moonAngle(hours), thO = observerAngle(hours);
    const dM = moonDistanceFactor(hours);
    // moon orbit
    ctx.strokeStyle = 'rgba(201,212,255,0.15)'; ctx.setLineDash([2, 6]);
    ctx.beginPath(); ctx.arc(cx, cy, orbit, 0, TAU); ctx.stroke(); ctx.setLineDash([]);

    // ocean envelope (exaggerated ~ R * 0.28 per metre)
    const ex = R * 1.35;
    const env = (th) => R * 1.08 + ex * (moonOn * MOON_AMP * dM * Math.cos(2 * (th - thM)) + sunOn * SUN_AMP * Math.cos(2 * th));
    ctx.beginPath();
    for (let i = 0; i <= 180; i++) {
      const th = (i / 180) * TAU;
      const [x, y] = P(th, env(th));
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    const og = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.6);
    og.addColorStop(0, 'rgba(63,179,201,0.95)'); og.addColorStop(1, 'rgba(63,179,201,0.5)');
    ctx.fillStyle = og; ctx.fill();
    ctx.strokeStyle = 'rgba(160,230,245,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();

    // Earth (land masses rotate with the observer)
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    ctx.fillStyle = '#1d5d7a'; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    ctx.fillStyle = '#5f8a4e';
    const blobs = [[0.0, 0.55, 0.42], [1.3, 0.6, 0.35], [2.4, 0.4, 0.5], [3.6, 0.65, 0.3], [4.8, 0.5, 0.45], [5.6, 0.2, 0.3]];
    for (const [a, rr, sz] of blobs) {
      const [x, y] = P(thO + a, R * rr);
      ctx.beginPath(); ctx.arc(x, y, R * sz * 0.55, 0, TAU); ctx.fill();
    }
    // night side (away from the Sun = right)
    const ng = ctx.createLinearGradient(cx - R * 0.2, 0, cx + R, 0);
    ng.addColorStop(0, 'rgba(0,0,10,0)'); ng.addColorStop(0.35, 'rgba(0,0,10,0.55)');
    ctx.fillStyle = ng; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    ctx.restore();

    // "you" marker on the coast
    const [ox, oy] = P(thO, R);
    const [lx, ly] = P(thO, env(thO));
    ctx.strokeStyle = '#f5c26b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(lx, ly); ctx.stroke();
    ctx.fillStyle = '#f5c26b';
    ctx.beginPath(); ctx.arc(ox, oy, 4.5, 0, TAU); ctx.fill();
    const [tx, ty] = P(thO, env(thO) + 14);
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('you', tx, ty + 4); ctx.textAlign = 'left';

    // tidal force arrows (differential gravity), drawn on Earth's limb
    if (forces && (moonOn || sunOn)) {
      for (let i = 0; i < 24; i++) {
        const th = (i / 24) * TAU;
        let fx = 0, fy = 0;
        const add = (thB, s) => {
          // a ∝ 3(r̂·b̂) b̂ − r̂ in Sun-frame coordinates
          const rx = Math.cos(th), ry = Math.sin(th), bx = Math.cos(thB), by = Math.sin(thB);
          const d = rx * bx + ry * by;
          fx += s * (3 * d * bx - rx); fy += s * (3 * d * by - ry);
        };
        if (moonOn) add(thM, dM);
        if (sunOn) add(0, 0.46);
        const [x0, y0] = P(th, R * 1.02);
        // convert Sun-frame vector to screen (rotate by π, flip y)
        const sx = -fx, sy = fy;
        const len = R * 0.42;
        const x1 = x0 + sx * len, y1 = y0 + sy * len;
        ctx.strokeStyle = 'rgba(255,154,122,0.95)'; ctx.fillStyle = 'rgba(255,154,122,0.95)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        const ang = Math.atan2(y1 - y0, x1 - x0);
        ctx.beginPath(); ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - 6 * Math.cos(ang - 0.4), y1 - 6 * Math.sin(ang - 0.4));
        ctx.lineTo(x1 - 6 * Math.cos(ang + 0.4), y1 - 6 * Math.sin(ang + 0.4)); ctx.fill();
      }
    }

    // the Moon with its phase (lit side faces the Sun = left)
    const [mx, my] = P(thM, orbit);
    const mr = R * 0.32;
    ctx.globalAlpha = moonOn ? 1 : 0.25;
    ctx.fillStyle = '#2a2f3a'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.clip();
    ctx.fillStyle = '#dfe5f5'; ctx.fillRect(mx - mr, my - mr, mr, 2 * mr);
    ctx.restore();
    ctx.strokeStyle = 'rgba(201,212,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(201,212,255,0.85)'; ctx.font = '12px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(moonOn ? 'Moon' : 'Moon (off)', mx, my + mr + 15); ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    // the line of pull
    if (moonOn) {
      ctx.strokeStyle = 'rgba(201,212,255,0.18)'; ctx.setLineDash([4, 6]);
      const [ax, ay] = P(thM + Math.PI, orbit * 0.6);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(mx, my); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('Seen from above the North Pole · bulges hugely exaggerated · not to scale', 10, h - 10);
  }

  function drawChart() {
    const { ctx, w, h } = fitCanvas(chart);
    ctx.clearRect(0, 0, w, h);
    const left = 44, right = w - 10, top = 14, bot = h - 24;
    const maxA = (MOON_AMP * 1.2 + SUN_AMP) * 1.05;
    const y = (v) => (top + bot) / 2 - (v / maxA) * ((bot - top) / 2);
    const x = (hh) => left + (hh / MONTH_H) * (right - left);
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(233,241,245,0.5)';
    ctx.fillText('high', 6, y(maxA * 0.7) + 4); ctx.fillText('low', 6, y(-maxA * 0.7) + 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.moveTo(left, y(0)); ctx.lineTo(right, y(0)); ctx.stroke();
    // curve
    ctx.strokeStyle = 'rgba(181,156,255,0.85)'; ctx.lineWidth = 1;
    ctx.beginPath();
    curve.forEach((v, i) => { const X = x(i * 0.25), Y = y(v); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.stroke();
    // phase markers
    const marks = [[0, '● new'], [0.25, '◐ first qtr'], [0.5, '○ full'], [0.75, '◑ last qtr'], [1, '● new']];
    ctx.fillStyle = 'rgba(233,241,245,0.6)';
    for (const [f, lab] of marks) { const X = x(f * MONTH_H); ctx.textAlign = f === 1 ? 'right' : f === 0 ? 'left' : 'center'; ctx.fillText(lab, X, h - 6); }
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(181,156,255,0.6)';
    if (moonOn && sunOn) {
      ctx.fillText('spring', x(0.02 * MONTH_H), top + 4); ctx.fillText('neap', x(0.23 * MONTH_H), top + 4);
      ctx.fillText('spring', x(0.47 * MONTH_H), top + 4); ctx.fillText('neap', x(0.73 * MONTH_H), top + 4);
    }
    // cursor
    const X = x(hours), Y = y(tideHeight(hours, opts()));
    ctx.strokeStyle = 'rgba(245,194,107,0.7)'; ctx.beginPath(); ctx.moveTo(X, top); ctx.lineTo(X, bot); ctx.stroke();
    ctx.fillStyle = '#f5c26b'; ctx.beginPath(); ctx.arc(X, Y, 4.5, 0, TAU); ctx.fill();
  }
}
