// Small shared helpers: HiDPI canvases, visibility-gated animation, slider binding.
export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

// Run `frame(dt)` every animation frame, but only while `el` is on screen.
export function visibleLoop(el, frame, { onShow, onHide } = {}) {
  let visible = false, raf = 0, last = 0;
  const tick = (now) => {
    if (!visible) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    frame(dt);
    raf = requestAnimationFrame(tick);
  };
  new IntersectionObserver((entries) => {
    const v = entries[0].isIntersecting;
    if (v && !visible) { visible = true; last = performance.now(); raf = requestAnimationFrame(tick); onShow && onShow(); }
    else if (!v && visible) { visible = false; cancelAnimationFrame(raf); onHide && onHide(); }
  }, { rootMargin: '80px' }).observe(el);
}

// Keep the filled part of a range track in sync (CSS var --fill).
export function paintRange(input) {
  const v = (input.value - input.min) / (input.max - input.min);
  input.style.setProperty('--fill', `${v * 100}%`);
}
export function bindRange(input, onInput) {
  const h = () => { paintRange(input); onInput(parseFloat(input.value)); };
  input.addEventListener('input', h);
  h();
  return h;
}
export function setRange(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}
export const $ = (id) => document.getElementById(id);
export const fmt = (x, d = 1) => (Math.abs(x) >= 100 ? Math.round(x).toLocaleString('en') : x.toFixed(d));
export function fmtLen(m) {
  if (m < 0.01) return `${(m * 1000).toFixed(1)} mm`;
  if (m < 1) return `${(m * 100).toFixed(m < 0.1 ? 1 : 0)} cm`;
  if (m < 1000) return `${m < 10 ? m.toFixed(1) : Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 1e4 ? 1 : 0)} km`;
}
// ease an animated value toward a target
export const approach = (cur, target, dt, rate) => cur + (target - cur) * (1 - Math.exp(-dt * rate));
