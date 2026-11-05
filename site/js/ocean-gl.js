// Real-time ocean: a sum of NW Gerstner (trochoidal) waves rendered in raw WebGL.
// The frequency bank is FIXED; changing the weather only re-weights amplitudes
// (via a JONSWAP spectrum), which ease toward their targets — so the sea grows
// and calms smoothly, like a real one, instead of jumping.
import { g, TAU, jonswap, rng, clamp, lerp } from './physics.js';
import { render2D } from './ocean-2d.js';

const NW = 48;
const F_MIN = 0.045, F_MAX = 2.4; // Hz  (22 s swell … 0.27 m wavelets)

const VERT = `
precision highp float;
attribute vec2 aPos;
uniform mat4 uViewProj;
uniform vec4 uW[${NW}];   // dir.x, dir.z, k, amp
uniform vec4 uP[${NW}];   // phase(t), Q, -, -
uniform float uCell;
varying vec3 vWorld;
varying vec2 vXZ;
varying float vH;
void main(){
  vec2 p = aPos;
  float dist = length(p);
  float cell = max(dist * uCell, 0.05);
  vec3 d = vec3(0.0);
  for (int i = 0; i < ${NW}; i++) {
    vec4 w = uW[i];
    float L = 6.2831853 / w.z;
    float fade = smoothstep(2.5 * cell, 6.0 * cell, L);
    float a = w.w * fade;
    float ph = w.z * dot(w.xy, p) + uP[i].x;
    float c = cos(ph), s = sin(ph);
    d.xz += uP[i].y * a * w.xy * c;
    d.y += a * s;
  }
  vH = d.y;
  vXZ = p;
  vWorld = vec3(p.x + d.x, d.y, p.y + d.z);
  gl_Position = uViewProj * vec4(vWorld, 1.0);
}`;

const COMMON = `
precision highp float;
uniform vec3 uZenith, uHorizon, uSunCol, uSunDir;
uniform float uSunPow;
vec3 sky(vec3 d){
  float t = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.45));
  float s = max(dot(normalize(d), uSunDir), 0.0);
  col += uSunCol * (pow(s, 900.0) * 30.0 * uSunPow + pow(s, 12.0) * 0.35 * uSunPow + pow(s,3.0)*0.08);
  return col;
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
`;

const FRAG = COMMON + `
uniform vec4 uW[${NW}];
uniform vec4 uP[${NW}];
uniform vec3 uCamPos;
uniform float uPix, uHs, uFoam, uRipple, uTime, uFog;
uniform vec3 uDeep, uShallow;
uniform vec2 uWindDir;
varying vec3 vWorld;
varying vec2 vXZ;
varying float vH;
void main(){
  vec2 p = vXZ;
  float dist = length(vWorld - uCamPos);
  float foot = dist * uPix;              // metres per pixel at this distance
  vec3 n = vec3(0.0, 1.0, 0.0);
  float jac = 1.0;
  for (int i = 0; i < ${NW}; i++) {
    vec4 w = uW[i];
    float L = 6.2831853 / w.z;
    float fade = smoothstep(2.0 * foot, 8.0 * foot, L);
    float wa = w.z * w.w * fade;
    float ph = w.z * dot(w.xy, p) + uP[i].x;
    float c = cos(ph), s = sin(ph);
    n.x -= w.x * wa * c;
    n.z -= w.y * wa * c;
    n.y -= uP[i].y * wa * s;
    jac -= uP[i].y * wa * s;
  }
  // capillary / short-wave texture: the wind roughens the surface on scales
  // far smaller than our wave bank (cat's paws). Cheap analytic ripples.
  float rf = smoothstep(0.6, 0.02, foot) * uRipple;
  if (rf > 0.001) {
    vec2 wd = uWindDir;
    for (int j = 0; j < 6; j++) {
      float fj = float(j);
      float ang = (hash(vec2(fj, 3.1)) - 0.5) * 1.6;
      vec2 dir = vec2(wd.x*cos(ang) - wd.y*sin(ang), wd.x*sin(ang) + wd.y*cos(ang));
      float k = 6.2831853 / (0.18 + 0.55 * hash(vec2(fj, 7.7)));
      float om = sqrt(9.81 * k + 0.074 / 1025.0 * k*k*k);
      float ph = k * dot(dir, p) - om * uTime + fj * 2.1;
      float sl = 0.10 * rf * cos(ph);
      n.x -= dir.x * sl; n.z -= dir.y * sl;
    }
  }
  n = normalize(n);
  vec3 V = normalize(uCamPos - vWorld);
  vec3 R = reflect(-V, n);
  R.y = abs(R.y);
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 refl = sky(R);
  // body colour: light scattering inside crests facing the sun
  float crest = clamp(vH / max(uHs, 0.05) * 0.9 + 0.35, 0.0, 1.2);
  float back = pow(max(dot(-V, uSunDir) * 0.5 + 0.5, 0.0), 3.0);
  vec3 body = uDeep + uShallow * crest * (0.25 + 0.75 * back) * 0.55;
  float diff = max(dot(n, uSunDir), 0.0);
  body *= 0.75 + 0.35 * diff;
  vec3 col = mix(body, refl, F);
  // whitecaps: where the surface folds (Jacobian small) near crests
  float fold = smoothstep(0.55, 0.05, jac);
  float hi = smoothstep(0.15, 0.7, vH / max(uHs, 0.05));
  float nz = vnoise(p * 0.35 + uTime * 0.05) * 0.6 + vnoise(p * 1.7 - uTime * 0.1) * 0.4;
  float foam = clamp((fold * 1.1 + hi * 0.55) * uFoam * smoothstep(0.35, 0.75, nz), 0.0, 1.0);
  col = mix(col, vec3(0.93, 0.96, 0.98) * (0.75 + 0.25 * diff), foam);
  // aerial perspective
  float fog = 1.0 - exp(-dist * uFog);
  col = mix(col, sky(normalize(vec3(V.x * -1.0, 0.02, -V.z))), fog);
  gl_FragColor = vec4(pow(col, vec3(1.0/1.15)), 1.0);
}`;

const SKY_VERT = `
attribute vec2 aPos;
varying vec2 vNdc;
void main(){ vNdc = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;
const SKY_FRAG = COMMON + `
uniform vec3 uF, uR, uU;
uniform vec2 uTan;
uniform float uTime, uCloud;
varying vec2 vNdc;
void main(){
  vec3 d = normalize(uF + uR * vNdc.x * uTan.x + uU * vNdc.y * uTan.y);
  vec3 col = sky(d);
  // soft drifting cloud bands, denser in storms
  if (d.y > 0.0) {
    vec2 q = d.xz / (d.y + 0.08) * 1.3 + vec2(uTime * 0.01, 0.0);
    float c = vnoise(q) * 0.55 + vnoise(q * 2.3) * 0.3 + vnoise(q * 5.1) * 0.15;
    c = smoothstep(0.62 - uCloud * 0.4, 0.95, c) * smoothstep(0.0, 0.18, d.y);
    col = mix(col, mix(vec3(1.0), uHorizon * 0.8, uCloud), c * (0.35 + 0.5 * uCloud));
  }
  gl_FragColor = vec4(pow(col, vec3(1.0/1.15)), 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace('[0]', '');
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

export class Ocean {
  constructor(canvas, { seed = 3, windDir = -Math.PI / 2, onFrame = null } = {}) {
    this.canvas = canvas;
    let gl = null;
    try { gl = canvas.getContext('webgl', { antialias: true, alpha: false }); } catch (e) { gl = null; }
    this.gl = gl;
    this.mode = gl ? 'webgl' : '2d';
    this.onFrame = onFrame;
    this.t = 0;
    this.running = false;
    this.speed = 1;
    this.windDir = windDir;

    // fixed frequency bank with random (but fixed) directions & phases
    const rand = rng(seed);
    this.waves = [];
    for (let i = 0; i < NW; i++) {
      const u = (i + 0.15 + 0.7 * rand()) / NW;
      const f = F_MIN * Math.pow(F_MAX / F_MIN, u);
      const omega = TAU * f;
      const k = (omega * omega) / g;
      this.waves.push({ f, omega, k, phase0: rand() * TAU, spreadR: rand() + rand() + rand() - 1.5, a: 0, target: 0, dir: windDir });
    }
    this.uW = new Float32Array(NW * 4);
    this.uP = new Float32Array(NW * 4);
    this.state = { Hs: 0.5, U: 5 };
    this.cur = { Hs: 0.5, U: 5, cam: 3 };

    if (gl) {
      try { this._initGL(gl); } catch (e) { console.warn('WebGL init failed, using 2D fallback', e); this.gl = null; this.mode = '2d'; }
    }

    this.setSea({ Hs: 0.6, Tp: 4.5, U: 6 }, true);
    this._loop = this._loop.bind(this);
  }

  _initGL(gl) {
    this.water = program(gl, VERT, FRAG);
    this.skyP = program(gl, SKY_VERT, SKY_FRAG);
    // projected-ish grid: rows exponentially spaced toward horizon
    const R = 230, C = 240, near = 0.4, far = 4000;
    const pos = new Float32Array((R + 1) * (C + 1) * 2);
    let o = 0;
    for (let j = 0; j <= R; j++) {
      const z = near * Math.pow(far / near, j / R);
      const half = z * 1.9 + 30;
      for (let i = 0; i <= C; i++) {
        const s = (i / C) * 2 - 1;
        pos[o++] = Math.sign(s) * Math.pow(Math.abs(s), 1.6) * half;
        pos[o++] = z;
      }
    }
    const idx = new Uint16Array(R * C * 6);
    o = 0;
    for (let j = 0; j < R; j++)
      for (let i = 0; i < C; i++) {
        const a = j * (C + 1) + i, b = a + 1, c = a + C + 1, d = c + 1;
        idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
      }
    this.nIdx = idx.length;
    this.gridBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    this.idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST);
  }

  // Set sea state. `swell` optionally adds a narrow long-period swell system.
  setSea({ Hs, Tp, U, swell = null, gamma = 3.3, spread = 0.55 }, instant = false) {
    this.state = { Hs, Tp, U };
    const fp = 1 / Tp;
    const S = this.waves.map((w) => (w.f > fp * 0.55 ? jonswap(w.f, fp, gamma) : 0));
    // width of each bin in frequency (log spacing)
    const ratio = Math.pow(F_MAX / F_MIN, 1 / NW);
    const df = this.waves.map((w) => w.f * (ratio - 1 / ratio) / 2);
    let m0 = 0;
    S.forEach((s, i) => (m0 += s * df[i]));
    const target = (Hs / 4) ** 2;
    this.waves.forEach((w, i) => {
      let a = m0 > 0 ? Math.sqrt((2 * S[i] * df[i] * target) / m0) : 0;
      w.windA = a;
      w.dir = this.windDir + w.spreadR * spread * (0.5 + 0.5 * Math.min(w.f / fp, 3) / 3) * 1.5;
    });
    if (swell) {
      // a narrow, long-crested spectrum from a distant storm
      const fs = 1 / swell.Tp;
      const Ss = this.waves.map((w) => jonswap(w.f, fs, 7) * (w.f > fs * 0.75 && w.f < fs * 1.5 ? 1 : 0));
      let ms = 0;
      Ss.forEach((s, i) => (ms += s * df[i]));
      const ts = (swell.Hs / 4) ** 2;
      this.waves.forEach((w, i) => {
        const as = ms > 0 ? Math.sqrt((2 * Ss[i] * df[i] * ts) / ms) : 0;
        if (as > w.windA) w.dir = (swell.dir ?? this.windDir) + w.spreadR * 0.12;
        w.windA = Math.sqrt(w.windA ** 2 + as ** 2);
      });
    }
    this.waves.forEach((w) => {
      w.target = w.windA;
      if (instant) w.a = w.target;
    });
    if (instant) { this.cur.Hs = Hs; this.cur.U = U; }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._loop);
  }
  stop() { this.running = false; }

  _loop(now) {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 0.15);
    this.last = now;
    this.step(dt);
    this.render();
    if (this.onFrame) this.onFrame(this);
    requestAnimationFrame(this._loop);
  }

  step(dt) {
    this.t += dt * this.speed;
    // energy "pumped in" or decays: amplitudes approach targets; long waves react slower
    for (const w of this.waves) {
      const rate = 0.25 + 1.6 * Math.min(w.f / 0.4, 1);
      w.a += (w.target - w.a) * (1 - Math.exp(-dt * rate));
    }
    this.cur.Hs = lerp(this.cur.Hs, this.state.Hs, 1 - Math.exp(-dt * 0.8));
    this.cur.U = lerp(this.cur.U, this.state.U, 1 - Math.exp(-dt * 1.5));
  }

  render() {
    if (!this.gl) return render2D(this);
    const gl = this.gl;
    this.resize();
    const W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    const Hs = this.cur.Hs, U = this.cur.U;
    const storm = clamp((U - 9) / 14, 0, 1);

    // camera: a person standing on a small boat deck — rises with the sea
    const camH = 2.2 + Hs * 1.15;
    const fovY = (52 * Math.PI) / 180;
    const aspect = W / H;
    const pitch = -0.07 - Math.min(Hs, 8) * 0.004;
    const f = [0, Math.sin(pitch), Math.cos(pitch)];
    const r = [-1, 0, 0];
    const u = [0, Math.cos(pitch), -Math.sin(pitch)];
    const eye = [0, camH, 0];
    const tanY = Math.tan(fovY / 2), tanX = tanY * aspect;
    const near = 0.2, far = 6000;
    const P = perspective(fovY, aspect, near, far);
    const V = [
      r[0], u[0], -f[0], 0,
      r[1], u[1], -f[1], 0,
      r[2], u[2], -f[2], 0,
      -dot(r, eye), -dot(u, eye), dot(f, eye), 1,
    ];
    const VP = mul(P, V);

    // sky palette
    const zenith = mixv([0.13, 0.36, 0.68], [0.22, 0.26, 0.31], storm);
    const horizon = mixv([0.78, 0.86, 0.92], [0.52, 0.56, 0.59], storm);
    const sunCol = mixv([1.0, 0.86, 0.66], [0.6, 0.62, 0.64], storm);
    const sunDir = normalize([-0.38, 0.09, 1.0]);
    const sunPow = 1 - storm * 0.85;
    const deep = mixv([0.005, 0.05, 0.10], [0.02, 0.06, 0.08], storm);
    const shallow = mixv([0.05, 0.38, 0.42], [0.10, 0.30, 0.30], storm);

    // pack wave uniforms (phase computed in double precision on CPU)
    let steep = 0;
    for (const w of this.waves) steep += w.k * w.a;
    const Q = Math.min(1, 0.85 / Math.max(steep, 1e-4));
    this.waves.forEach((w, i) => {
      this.uW[i * 4] = Math.cos(w.dir); this.uW[i * 4 + 1] = Math.sin(w.dir);
      this.uW[i * 4 + 2] = w.k; this.uW[i * 4 + 3] = w.a;
      this.uP[i * 4] = ((w.phase0 - w.omega * this.t) % TAU + TAU) % TAU;
      this.uP[i * 4 + 1] = Q;
    });

    const setSkyU = (u2) => {
      gl.uniform3fv(u2.uZenith, zenith); gl.uniform3fv(u2.uHorizon, horizon);
      gl.uniform3fv(u2.uSunCol, sunCol); gl.uniform3fv(u2.uSunDir, sunDir);
      gl.uniform1f(u2.uSunPow, sunPow);
    };

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // sky
    const s = this.skyP;
    gl.useProgram(s.p);
    setSkyU(s.u);
    gl.uniform3fv(s.u.uF, f); gl.uniform3fv(s.u.uR, r); gl.uniform3fv(s.u.uU, u);
    gl.uniform2f(s.u.uTan, tanX, tanY);
    gl.uniform1f(s.u.uTime, this.t); gl.uniform1f(s.u.uCloud, storm);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    const la = gl.getAttribLocation(s.p, 'aPos');
    gl.enableVertexAttribArray(la);
    gl.vertexAttribPointer(la, 2, gl.FLOAT, false, 0, 0);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);

    // water
    const w = this.water;
    gl.useProgram(w.p);
    setSkyU(w.u);
    gl.uniformMatrix4fv(w.u.uViewProj, false, VP);
    gl.uniform4fv(w.u.uW, this.uW); gl.uniform4fv(w.u.uP, this.uP);
    gl.uniform1f(w.u.uCell, 0.012);
    gl.uniform3fv(w.u.uCamPos, eye);
    gl.uniform1f(w.u.uPix, (2 * tanY) / H);
    gl.uniform1f(w.u.uHs, Math.max(Hs, 0.05));
    gl.uniform1f(w.u.uFoam, clamp((U - 4.5) / 9, 0, 1) * 1.1);
    gl.uniform1f(w.u.uRipple, clamp(U / 4, 0, 1) * (0.6 + 0.4 * clamp(U / 12, 0, 1)));
    gl.uniform1f(w.u.uTime, this.t);
    gl.uniform1f(w.u.uFog, 0.00035 + storm * 0.0012);
    gl.uniform3fv(w.u.uDeep, deep); gl.uniform3fv(w.u.uShallow, shallow);
    gl.uniform2f(w.u.uWindDir, Math.cos(this.windDir), Math.sin(this.windDir));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuf);
    const pa = gl.getAttribLocation(w.p, 'aPos');
    gl.enableVertexAttribArray(pa);
    gl.vertexAttribPointer(pa, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
    gl.drawElements(gl.TRIANGLES, this.nIdx, gl.UNSIGNED_SHORT, 0);
  }

  // surface elevation along a line (for 2D profiles that share this exact sea)
  elevation(x, z) {
    let y = 0;
    for (const w of this.waves) {
      const ph = w.k * (Math.cos(w.dir) * x + Math.sin(w.dir) * z) + w.phase0 - w.omega * this.t;
      y += w.a * Math.sin(ph);
    }
    return y;
  }
}

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const mixv = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
