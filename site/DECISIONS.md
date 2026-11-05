# Understanding Waves — design & physics decisions

A record of the model behind each interactive, what was simplified, and why.
Guiding rule: **accurate enough to teach, simple enough to feel.** Where we cheat for
legibility (exaggeration, time-lapse), the canvas says so on screen.

## Architecture
- **Static site, no build step.** Vanilla ES modules + raw WebGL/Canvas2D, served by
  `nginx:alpine` with `./site` bind-mounted (edits are live). No dependencies, no CDN —
  works offline inside the VPN.
- One module per chapter (`site/js/*.js`), each loaded in isolation so one failure can't
  take the page down. Animations run **only while on screen** (`visibleLoop`,
  IntersectionObserver), so the page idles cheaply.
- `physics.js` holds all the science in one place; chapters only visualise it.

## The ocean renderer (hero + wind lab) — `ocean-gl.js`, `ocean-2d.js`
- **Sum of 48 Gerstner (trochoidal) waves.** Linear superposition is literally the answer to
  "why is every wave unique", so the hero is the explanation, not decoration.
- **Fixed frequency bank, weather re-weights amplitudes.** Frequencies are log-spaced with
  random jitter from 0.045–2.4 Hz (22 s swell → 27 cm wavelets) with fixed random phases and
  directions. Changing the wind recomputes a JONSWAP spectrum and each component's amplitude
  *eases* toward its target (short waves respond in ~1 s, long ones slower). Regenerating
  frequencies instead would make phases jump. This also mirrors reality: wind pumps energy
  into existing scales, short ones first.
- Jittered (incommensurate) periods → the surface genuinely never repeats.
- Horizontal Gerstner steepness `Q` is normalised so Σ Q·k·a ≤ 0.85 (no surface self-intersection).
- Phases are advanced on the CPU in double precision and passed as uniforms (avoids float32
  drift in `ω·t` after long sessions).
- Shading: Fresnel (Schlick, F0 = 0.02) mix of a procedural sky and a body colour with
  crest "subsurface" brightening; whitecaps where the Gerstner Jacobian folds near crests,
  gated by wind (whitecaps start ≈ Beaufort 3–4); analytic capillary-ripple normals scaled by
  wind; distance fog; sky greys and clouds thicken with storminess.
- LOD: waves shorter than a few grid cells / pixel footprints fade out (anti-aliasing).
- Camera height rises with Hs (a person on a deck) so big seas stay readable.
- **No-WebGL fallback** (`ocean-2d.js`): same wave bank, same camera/shading, ray-cast per
  pixel on the CPU at ~240 px width and upscaled, with one parallax step (re-intersect at the
  local height) so crests keep silhouettes. Exists because the test browser has no GPU; also
  protects real visitors with WebGL disabled. *Note: the WebGL path could not be exercised in
  the GPU-less test browser — GLSL was reviewed by hand; verify on a real GPU.*

## Chapter 1 — superposition ("every wave is a crowd")
- Up to 12 deep-water sine waves with "tidy" periods in 0.1 s units. The exact repeat time is
  the **LCM of the periods** (computed with BigInt), shown live: 8 s → 24 days (5 waves) →
  multiples of the age of the universe.
- "Messy periods" adds a ~1% irrational jitter → no common multiple → **never**.
  That's the real reason no two waves are alike, made countable.

## Chapter 2 — wind-wave growth
- **JONSWAP fetch laws** (Hasselmann et al. 1973), in terms of U10:
  `gHs/U² = 1.6e-3·(gX/U²)^½`, `gTp/U = 0.286·(gX/U²)^⅓`
- **Full development cap** (Pierson–Moskowitz): `gHs/U² = 0.243`, `gTp/U = 7.7`.
  (CEM's u*-based caps give ~50% larger heights; PM matches the familiar tables better.)
- **Duration limit** via the SPM/CEM equivalent-fetch method: `gt/U = 68.8·(gX/U²)^⅔`.
  The effective fetch is min(actual, duration-equivalent) → readout names the limiting
  ingredient (fetch / duration / fully developed). This *is* the lesson: the weakest
  ingredient wins.
- Sanity: 10 m/s, 100 km → Hs 1.6 m, Tp 6.2 s. 20 m/s fully developed → 9.9 m, 15.7 s.
- "1 in 1,000 waves ≈ 2× Hs": Rayleigh distribution, H_max(N=1000) ≈ 1.86 Hs.
- The side profile is drawn at a true vertical scale with a 1.8 m person; horizontal is
  squeezed only when needed, with the factor printed.

## Chapter 3 — orbits (Airy linear theory)
- Particle paths: horizontal semi-axis `a·cosh k(z+h)/sinh kh`, vertical `a·sinh k(z+h)/sinh kh`
  — circles decaying as e^{kz} in deep water, flattening ellipses in shallow water.
- Duck drift = Stokes drift `ωka²·cosh 2kh / (2 sinh² kh)` — the honest "almost" in
  "the water comes back almost to where it started".
- Motion amplitude is exaggerated (factor shown on canvas) so the loops are visible.

## Chapter 4 — swell dispersion
- Storm sea from `windSea(U, 1500 km, D)` spread over 60 period bins (4–24 s, JONSWAP shape).
- Each bin occupies `[cg·(t−D), cg·t]` with **deep-water group speed `cg = gT/4π`** — this is
  why long-period forerunners arrive first.
- Dissipation is a teaching heuristic, not a fitted law: decay length ∝ T⁴ (short waves die
  quickly, long swell crosses oceans), plus mild 1/(1+x/1500 km) spreading.
- The beach strip synthesises the arriving components in real time, so you see the sea go
  from clean long lines to choppier stragglers.

## Chapter 5 — tsunamis
- **Linear shallow-water equations** `∂η/∂t + ∂(hu)/∂x = 0`, `∂u/∂t + g∂η/∂x = 0` on a 600 km
  cross-section (1 km staggered grid, CFL-limited Δt ≈ 4 s, run at 75× real time). Tsunamis are
  long waves (wavelength ≫ depth), so they're non-dispersive and this is the right physics:
  speed √(gh) ≈ 713 km/h at 4 km depth, Green's-law growth on the shelf and the drawdown all
  emerge from the equations rather than being scripted.
- Bathymetry: 4 km abyssal plain → trench → continental slope → 65 km shelf (200→40 m) →
  nearshore to 8 m. A first version had a 170 km shallow shelf, and the wave took over 90 min to
  cross it — real shelves vary, but that hid the lesson.
- Source: megathrust-style seafloor uplift seaward of the fault plus ~45% subsidence landward
  (which is what makes the sea draw back first at the coast). Uplift amplitude and rupture width
  scale with magnitude (M9 ≈ 5 m over ~200 km). The subsidence lobe is capped so it never reaches
  the coast at t = 0.
- Headless check: M9 → arrival ≈ 30 min, drawdown ≈ 3 m first, peak ≈ 19 m at the shoreline;
  M7.5 → ≈ 2.5 m. Same order as Tōhoku 2011 (10–40 m run-up).
- Open-ocean boundary radiates (Sommerfeld); the coast is a reflecting wall. **Simplified away:**
  inundation/run-up over land, nonlinear steepening into a bore, and 2-D spreading (a 1-D section
  has no geometric decay, so heights "near the quake" are shown; the text says far-field heights
  are below a metre).

## Chapter 6 — tides (equilibrium tide)
- Sun-fixed frame: Earth spins once per 24 h, Moon advances once per synodic month (29.53 d).
  `η = A_m·cos 2(θ−θ_moon) + A_s·cos 2θ`, with `A_s = 0.46·A_m` (Sun's tidal force ratio).
  This automatically produces two bulges, the ~24 h 50 min lunar day, and spring/neap.
- Moon distance varies with the anomalistic month (27.55 d), e = 0.055 → ±18% in tidal pull
  (1/d³) — this is why spring tides aren't all equal.
- Tidal-force arrows: `a ∝ 3(r̂·b̂)b̂ − r̂` — the stretch, not the pull.
- **Simplified away:** declination (diurnal inequality), real ocean basin dynamics (amphidromic
  systems, resonance — why Fundy has 16 m and the Mediterranean ~nothing), the lag between
  Moon transit and high water. The equilibrium tide is the right *mental model* for "is it
  really the Moon?"; it is not a tide predictor. Text says so.

## Chapter 7 — the beach
- Linear shoaling with energy-flux conservation: `H = H₀·√(cg₀/cg)`, k from the full
  dispersion relation at each of 500 columns. Local phase is `∫k dx`, so waves visibly shorten.
- **Depth-limited breaking:** `H ≤ γh`, γ = 0.78 (McCowan). Once broken, the energy factor
  never recovers — so on the sandbar profile waves break, re-form smaller in the trough, and
  break again at the shore.
- Wet/dry: dry ground blocks all wave energy; isolated pools (reef lagoon) stay as still water.
- **Breaker type from the Iribarren number** `ξ = tanβ/√(H₀/L₀)`: < 0.5 spilling, 0.5–3.3
  plunging, > 3.3 surging. Slope is averaged over ±40 m around the break point (the wave
  feels the bottom over a fraction of its wavelength; a ±12 m window misread reef faces as surging).
- Wave shape: Stokes-like 2nd harmonic (peaked, forward-leaning) grows as H→γh; after
  breaking it blends to a sawtooth bore. Two close periods (T and 1.075 T) give realistic **sets**.
- Tide raises/lowers the still-water level for everything; "Run the tide" time-lapses the
  tide (~2000×) while the waves keep running in real time — the core waves-vs-tides lesson.
- Vertical exaggeration ×19 (printed on canvas). Swash run-up ≈ 0.45·H_b, a visual heuristic.

## Chapter 8 — capillary–gravity waves
- Full dispersion in a 4 km ocean: `c² = (g/k + σk/ρ)·tanh kh`, σ = 0.074 N/m, ρ = 1025.
  Shows the 23 cm/s minimum at λ ≈ 1.7 cm and the √(gh) ≈ 198 m/s ceiling that tsunamis and
  the tide itself hit — closing the loop: the tide is "a wave", just one forced by gravity.

## Things deliberately not done (yet) / what I'd refine
- **Refraction** (waves bending to meet the shore, focusing on headlands) — a top-down
  ray-tracing view would be a great chapter 6b.
- Currents (wave–current interaction, rip currents in the surf zone).
- Rogue waves as a "the crowd lines up" moment inside chapter 1 (constructive focusing).
- Couple chapter 5's live tide to chapter 6's water level ("follow the Moon" mode).
- A proper non-hydrostatic/Boussinesq surf model would give real plunging geometry; out of
  scope for an in-browser explainer.
- fal.ai hero imagery: not used — the live sea carries the hero better than a still image.
