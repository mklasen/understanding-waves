// Physics core for "Understanding Waves".
// Everything here is plain linear wave theory + well-known empirical growth laws.
// See DECISIONS.md for the reasoning behind each simplification.

export const g = 9.81;          // m/s²
export const RHO = 1025;        // seawater density, kg/m³
export const SIGMA = 0.074;     // surface tension of seawater, N/m
export const TAU = Math.PI * 2;

// ---------- Dispersion -------------------------------------------------------
// ω² = g k tanh(k h)   — solved for k by Newton iteration.
export function waveNumber(omega, h = Infinity) {
  const k0 = (omega * omega) / g;
  if (!isFinite(h) || k0 * h > 20) return k0;
  let k = k0 / Math.sqrt(Math.tanh(k0 * h)); // good first guess
  for (let i = 0; i < 30; i++) {
    const t = Math.tanh(k * h);
    const f = g * k * t - omega * omega;
    const df = g * t + g * k * h * (1 - t * t);
    const dk = f / df;
    k -= dk;
    if (Math.abs(dk) < 1e-10 * k) break;
  }
  return k;
}
export const phaseSpeed = (k, h = Infinity) => Math.sqrt((g / k) * (isFinite(h) ? Math.tanh(k * h) : 1));
export function groupSpeed(k, h = Infinity) {
  const kh = k * h;
  const n = !isFinite(kh) || kh > 20 ? 0.5 : 0.5 * (1 + (2 * kh) / Math.sinh(2 * kh));
  return n * phaseSpeed(k, h);
}
export const deepLength = (T) => (g * T * T) / TAU;     // L0 = gT²/2π
export const deepSpeed = (T) => (g * T) / TAU;          // c0 = gT/2π
export const deepGroupSpeed = (T) => (g * T) / (2 * TAU);

// Capillary-gravity phase speed (deep water) for a wavelength in metres.
export function capGravSpeed(L) {
  const k = TAU / L;
  return Math.sqrt(g / k + (SIGMA * k) / RHO);
}

// ---------- Wind-wave growth -------------------------------------------------
// JONSWAP fetch laws (Hasselmann et al. 1973) capped by Pierson–Moskowitz full
// development; duration-limited growth via the equivalent-fetch method
// (SPM/CEM). All in terms of U10 (wind speed 10 m above the sea).
//   g·Hs/U²  = 1.6e-3 · (gX/U²)^½        → cap 0.243  (fully developed)
//   g·Tp/U   = 0.286  · (gX/U²)^⅓        → cap 7.7
//   g·t/U    = 68.8   · (gX/U²)^⅔        (time needed to "fill" a fetch)
export function windSea(U10, fetchKm, durationH) {
  const U = Math.max(U10, 0.3);
  const X = Math.max(fetchKm, 0.01) * 1000;
  const t = Math.max(durationH, 0.01) * 3600;
  const Xhat = (g * X) / (U * U);
  const that = (g * t) / U;
  const XeqHat = Math.pow(that / 68.8, 1.5);     // fetch the wind could "fill" in time t
  let Xe = Math.min(Xhat, XeqHat);
  let limit = XeqHat < Xhat ? 'duration' : 'fetch';
  const XFD = Math.pow(0.243 / 1.6e-3, 2);       // ≈ 23 000
  if (Xe >= XFD) { Xe = XFD; limit = 'full'; }
  const Hs = (1.6e-3 * Math.sqrt(Xe) * U * U) / g;
  const Tp = Math.min(0.286 * Math.cbrt(Xe), 7.7) * U / g;
  // extra numbers for the readout
  const tFull = (68.8 * Math.pow(XFD, 2 / 3) * U) / g / 3600;        // h to full development
  const xFull = (XFD * U * U) / g / 1000;                            // km to full development
  const progress = Math.sqrt(Xe / XFD);                              // 0…1 of max height
  return { Hs, Tp, L: deepLength(Tp), c: deepSpeed(Tp), limit, tFull, xFull, progress, U };
}

export function beaufort(U) {
  const scale = [
    [0.5, 0, 'Calm', 'Sea like a mirror'],
    [1.6, 1, 'Light air', 'Ripples like scales, no crests'],
    [3.4, 2, 'Light breeze', 'Small wavelets, glassy crests'],
    [5.5, 3, 'Gentle breeze', 'Large wavelets, crests begin to break'],
    [8.0, 4, 'Moderate breeze', 'Small waves, frequent white horses'],
    [10.8, 5, 'Fresh breeze', 'Moderate waves, many white horses'],
    [13.9, 6, 'Strong breeze', 'Large waves, white foam crests everywhere'],
    [17.2, 7, 'Near gale', 'Sea heaps up, foam blown in streaks'],
    [20.8, 8, 'Gale', 'Moderately high waves, crests break into spindrift'],
    [24.5, 9, 'Strong gale', 'High waves, dense foam, crests topple'],
    [28.5, 10, 'Storm', 'Very high waves, sea looks white'],
    [32.7, 11, 'Violent storm', 'Exceptionally high waves'],
    [Infinity, 12, 'Hurricane force', 'Air filled with foam and spray'],
  ];
  const row = scale.find((r) => U < r[0]);
  return { force: row[1], name: row[2], sea: row[3] };
}

// ---------- Spectrum → individual sine waves -------------------------------
// Deterministic PRNG so a given "sea" is reproducible.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// JONSWAP spectral shape (unnormalised).
export function jonswap(f, fp, gamma = 3.3) {
  const sigma = f <= fp ? 0.07 : 0.09;
  const r = Math.exp(-((f - fp) ** 2) / (2 * sigma * sigma * fp * fp));
  return Math.pow(f, -5) * Math.exp(-1.25 * Math.pow(fp / f, 4)) * Math.pow(gamma, r);
}

// Build N component waves whose sum has significant height Hs and peak period Tp.
// Each component: { a (amplitude m), omega, k, dir (rad), phase, T, L }.
// `spread` = directional spreading (0 = all aligned, 1 = short-crested sea).
export function seaComponents({ Hs, Tp, N = 32, seed = 7, gamma = 3.3, spread = 0.6, dir = 0, h = Infinity, fMin = 0.65, fMax = 3.2 }) {
  const rand = rng(seed);
  const fp = 1 / Tp;
  const comps = [];
  // log-spaced bins with jitter → incommensurate periods (no exact repeat)
  for (let i = 0; i < N; i++) {
    const u = (i + 0.2 + 0.6 * rand()) / N;
    const f = fp * fMin * Math.pow(fMax / fMin, u);
    const u0 = i / N, u1 = (i + 1) / N;
    const df = fp * fMin * (Math.pow(fMax / fMin, u1) - Math.pow(fMax / fMin, u0));
    const S = jonswap(f, fp, gamma);
    const omega = TAU * f;
    // directional sample, roughly cos²-ish spreading, wider for short waves
    const width = spread * (0.6 + 0.6 * Math.min(f / fp, 2.5) / 2.5) * 1.2;
    const d = dir + (rand() + rand() + rand() - 1.5) * width * 1.4;
    const k = waveNumber(omega, h);
    comps.push({ S, df, omega, k, dir: d, phase: rand() * TAU, T: 1 / f, L: TAU / k });
  }
  const m0 = comps.reduce((s, c) => s + c.S * c.df, 0);
  const targetM0 = (Hs / 4) ** 2;
  for (const c of comps) c.a = Math.sqrt((2 * c.S * c.df * targetM0) / m0);
  return comps;
}

// ---------- Tides (equilibrium theory) -------------------------------------
// Sun-fixed frame. Earth spins once per solar day (24 h), the Moon goes round
// once per synodic month (29.53 d) in the same sense. Each body raises two
// bulges: η = A·cos(2(θ − θbody)). Sun's tidal pull ≈ 0.46 × Moon's.
export const SYNODIC_DAYS = 29.530589;
export const ANOMALISTIC_DAYS = 27.554550;
export const MOON_AMP = 0.27;   // m, equilibrium semidiurnal amplitude (scaled for display)
export const SUN_AMP = 0.46 * MOON_AMP;

export function moonAngle(hours, phase0 = 0) {
  return phase0 + (TAU * hours) / (SYNODIC_DAYS * 24);
}
// observer longitude in Sun-fixed frame: noon (facing Sun at angle 0) at hours=12
export function observerAngle(hours) {
  return (TAU * (hours - 12)) / 24;
}
// tidal strength scales with 1/d³ — Moon distance varies ~±5.5% → ±18% in pull
export function moonDistanceFactor(hours, useEccentric = true) {
  if (!useEccentric) return 1;
  const e = 0.0549;
  const M = (TAU * hours) / (ANOMALISTIC_DAYS * 24) + 1.3;
  const r = 1 - e * Math.cos(M);
  return 1 / (r * r * r);
}
export function tideHeight(hours, { moon = 1, sun = 1, amplify = 1, eccentric = true } = {}) {
  const th = observerAngle(hours);
  const tm = moonAngle(hours);
  const dm = moonDistanceFactor(hours, eccentric);
  return amplify * (moon * MOON_AMP * dm * Math.cos(2 * (th - tm)) + sun * SUN_AMP * Math.cos(2 * th));
}

// ---------- Breaking -------------------------------------------------------
// Depth-limited breaking (McCowan): H_b ≈ 0.78 h.
export const BREAK_GAMMA = 0.78;
// Iribarren (surf-similarity) number → breaker type
export function breakerType(slope, H0, T) {
  const L0 = deepLength(T);
  const xi = slope / Math.sqrt(Math.max(H0, 0.01) / L0);
  let type = 'spilling';
  if (xi > 3.3) type = 'surging';
  else if (xi > 0.5) type = 'plunging';
  return { xi, type };
}

// ---------- Formatting helpers ---------------------------------------------
export function fmtDuration(seconds) {
  if (!isFinite(seconds)) return 'never';
  const r = (v) => (v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en'));
  if (seconds < 120) return `${r(seconds)} seconds`;
  if (seconds < 7200) return `${r(seconds / 60)} minutes`;
  if (seconds < 172800) return `${r(seconds / 3600)} hours`;
  const days = seconds / 86400;
  if (days < 730) return `${r(days)} days`;
  const v = days / 365.25;
  if (v < 1e3) return `${r(v)} years`;
  if (v < 1e6) return `${Math.round(v / 1e3)} thousand years`;
  if (v < 1e9) return `${Math.round(v / 1e6)} million years`;
  const ages = v / 13.8e9;
  if (ages < 1) return `${(v / 1e9).toFixed(1)} billion years`;
  const exp = Math.floor(Math.log10(ages));
  if (exp < 3) return `${Math.round(ages).toLocaleString('en')}× the age of the universe`;
  return `10<sup>${exp}</sup> × the age of the universe`;
}
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
