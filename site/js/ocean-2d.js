// Canvas2D fallback for the ocean (when WebGL is unavailable). Same wave bank,
// same camera and shading model as the WebGL shader, but ray-cast per pixel on
// the CPU at low resolution and smoothly upscaled. One parallax-refinement step
// re-intersects the ray at the local wave height so crests keep their silhouettes.
import { clamp } from './physics.js';

const mix = (a, b, t) => a + (b - a) * t;
const mixv = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

export function render2D(o) {
  const canvas = o.canvas;
  const cw = canvas.clientWidth || 300, ch = canvas.clientHeight || 150;
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  const ctx = o.ctx2d || (o.ctx2d = canvas.getContext('2d'));
  const lw = o.lowRes || Math.max(80, Math.min(240, Math.round(cw * 0.2)));
  const lh = Math.max(40, Math.round((lw * ch) / cw));
  if (!o.low || o.low.width !== lw || o.low.height !== lh) {
    o.low = document.createElement('canvas');
    o.low.width = lw; o.low.height = lh;
    o.lowCtx = o.low.getContext('2d');
    o.img = o.lowCtx.createImageData(lw, lh);
    o.pix = new Uint32Array(o.img.data.buffer);
  }
  const pix = o.pix;
  const Hs = o.cur.Hs, U = o.cur.U;
  const storm = clamp((U - 9) / 14, 0, 1);

  const camH = 2.2 + Hs * 1.15;
  const tanY = Math.tan((52 * Math.PI) / 360), tanX = (tanY * lw) / lh;
  const pitch = -0.07 - Math.min(Hs, 8) * 0.004;
  const sp = Math.sin(pitch), cp = Math.cos(pitch);

  const zenith = mixv([0.13, 0.36, 0.68], [0.22, 0.26, 0.31], storm);
  const horizon = mixv([0.78, 0.86, 0.92], [0.52, 0.56, 0.59], storm);
  const sunCol = mixv([1.0, 0.86, 0.66], [0.6, 0.62, 0.64], storm);
  const sunPow = 1 - storm * 0.85;
  const sl = Math.hypot(-0.38, 0.09, 1);
  const s0 = -0.38 / sl, s1 = 0.09 / sl, s2 = 1 / sl;
  const deep = mixv([0.005, 0.05, 0.10], [0.02, 0.06, 0.08], storm);
  const shallow = mixv([0.05, 0.38, 0.42], [0.10, 0.30, 0.30], storm);
  const foamAmt = clamp((U - 4.5) / 9, 0, 1) * 1.1;
  const fogK = 0.00035 + storm * 0.0012;
  let sr = 0, sg = 0, sb = 0;
  const sky = (dx, dy, dz) => {
    const il = 1 / Math.hypot(dx, dy, dz);
    dx *= il; dy *= il; dz *= il;
    const t = Math.pow(clamp(dy, 0, 1), 0.45);
    const s = Math.max(dx * s0 + dy * s1 + dz * s2, 0);
    const glow = (Math.pow(s, 400) * 12 + Math.pow(s, 12) * 0.35 + s * s * s * 0.08) * sunPow;
    sr = mix(horizon[0], zenith[0], t) + sunCol[0] * glow;
    sg = mix(horizon[1], zenith[1], t) + sunCol[1] * glow;
    sb = mix(horizon[2], zenith[2], t) + sunCol[2] * glow;
  };

  const ws = [];
  for (const w of o.waves) {
    if (w.a < 0.002 * Math.max(Hs, 0.05)) continue;
    ws.push({ dx: Math.cos(w.dir), dz: Math.sin(w.dir), k: w.k, a: w.a, L: 6.2831853 / w.k, ph0: w.phase0 - w.omega * o.t });
  }
  let steep = 0;
  for (const w of ws) steep += w.k * w.a;
  const Q = Math.min(1, 0.85 / Math.max(steep, 1e-4));
  const nW = ws.length;
  const pixAng = (2 * tanY) / lh;

  let p = 0;
  for (let py = 0; py < lh; py++) {
    const ny = 1 - ((py + 0.5) / lh) * 2;
    for (let px = 0; px < lw; px++, p++) {
      const nx = ((px + 0.5) / lw) * 2 - 1;
      // ray dir = f + r*nx*tanX + u*ny*tanY ; f=(0,sp,cp) r=(-1,0,0) u=(0,cp,-sp)
      const dx = -nx * tanX;
      const dy = sp + cp * ny * tanY;
      const dz = cp - sp * ny * tanY;
      let r, gC, b;
      if (dy > -0.004) {
        sky(dx, dy, dz);
        r = sr; gC = sg; b = sb;
      } else {
        let t = -camH / dy;
        let x = dx * t, z = dz * t;
        const dist = t * Math.hypot(dx, dy, dz);
        const foot = dist * pixAng;
        // pass 1: height at flat-plane hit → re-intersect at that height
        let y = 0;
        for (let i = 0; i < nW; i++) {
          const w = ws[i];
          if (w.L < 2 * foot) continue;
          y += w.a * Math.sin(w.k * (w.dx * x + w.dz * z) + w.ph0);
        }
        t = (y - camH) / dy;
        x = dx * t; z = dz * t;
        // pass 2: height, slope, Jacobian at refined point
        y = 0;
        let gx = 0, gz = 0, jac = 1;
        for (let i = 0; i < nW; i++) {
          const w = ws[i];
          if (w.L < 2 * foot) continue;
          const fade = w.L < 6 * foot ? (w.L - 2 * foot) / (4 * foot) : 1;
          const a = w.a * fade;
          const ph = w.k * (w.dx * x + w.dz * z) + w.ph0;
          const sn = Math.sin(ph), cs = Math.cos(ph);
          y += a * sn;
          const ka = w.k * a;
          gx += w.dx * ka * cs; gz += w.dz * ka * cs;
          jac -= Q * ka * sn;
        }
        const nl = 1 / Math.hypot(gx, 1, gz);
        const Nx = -gx * nl, Ny = nl, Nz = -gz * nl;
        let vx = -x, vy = camH - y, vz = -z;
        const vl = Math.hypot(vx, vy, vz);
        vx /= vl; vy /= vl; vz /= vl;
        const ndv = Math.max(Nx * vx + Ny * vy + Nz * vz, 0);
        const F = 0.02 + 0.98 * Math.pow(1 - ndv, 5);
        sky(2 * ndv * Nx - vx, Math.abs(2 * ndv * Ny - vy), 2 * ndv * Nz - vz);
        const crest = clamp((y / Math.max(Hs, 0.05)) * 0.9 + 0.35, 0, 1.2) * 0.22;
        const diff = 0.75 + 0.35 * Math.max(Nx * s0 + Ny * s1 + Nz * s2, 0);
        r = mix((deep[0] + shallow[0] * crest) * diff, sr, F);
        gC = mix((deep[1] + shallow[1] * crest) * diff, sg, F);
        b = mix((deep[2] + shallow[2] * crest) * diff, sb, F);
        if (foamAmt > 0) {
          const fold = clamp((0.55 - jac) / 0.5, 0, 1);
          const hi = clamp((y / Math.max(Hs, 0.05) - 0.15) / 0.55, 0, 1);
          const nz = 0.5 + 0.5 * Math.sin(x * 1.3 + Math.sin(z * 0.9 + x * 0.4) * 2.5) * Math.sin(z * 1.1 - x * 0.3);
          const f = clamp((fold * 1.1 + hi * 0.4) * foamAmt * clamp((nz - 0.45) / 0.35, 0, 1), 0, 1);
          r = mix(r, 0.93 * diff, f); gC = mix(gC, 0.96 * diff, f); b = mix(b, 0.98 * diff, f);
        }
        const fog = 1 - Math.exp(-vl * fogK);
        r = mix(r, horizon[0], fog); gC = mix(gC, horizon[1], fog); b = mix(b, horizon[2], fog);
      }
      const R = Math.min(255, Math.pow(Math.max(r, 0), 0.87) * 255) | 0;
      const G = Math.min(255, Math.pow(Math.max(gC, 0), 0.87) * 255) | 0;
      const B = Math.min(255, Math.pow(Math.max(b, 0), 0.87) * 255) | 0;
      pix[p] = 0xff000000 | (B << 16) | (G << 8) | R;
    }
  }
  o.lowCtx.putImageData(o.img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(o.low, 0, 0, cw, ch);
}
