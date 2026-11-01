// Pip's Sky Run — a 3D side-scrolling platformer (three.js).
// Gameplay runs on a 2D tile grid (x right, y up, 1 unit = 1 tile); everything is rendered in real 3D.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const V3 = THREE.Vector3;
const $ = id => document.getElementById(id);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};

// ============================================================ Renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const LOW = /[?&]low\b/.test(location.search);
renderer.setPixelRatio(LOW ? 0.5 : Math.min(window.devicePixelRatio || 1, 3));   // native pixels → true 4K on 4K screens
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 400);
let camDist = 15;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // keep at least ~24 tiles visible horizontally (important on portrait phones)
  const hf = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  camDist = Math.max(10, 8.5 / Math.tan(hf));
}
addEventListener('resize', resize); resize();

const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x5d7f3a, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 1024 : 4096, LOW ? 1024 : 4096);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 16, bottom: -12, near: 1, far: 90 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// gradient sky dome
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
    void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h*2.2,0.0,1.0), 0.8)) : mix(mid, bot, clamp(-h*4.0,0.0,1.0));
    gl_FragColor = vec4(c, 1.0); }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat);
sky.renderOrder = -1;
scene.add(sky);
scene.fog = new THREE.Fog(0xcfeaff, 40, 140);

const THEMES = [
  { name: 'Sunny Meadow', top: 0x2f7bff, mid: 0xbfe6ff, bot: 0x9fd0ff, fog: 0xcde8ff, sun: 0xfff1d6, sunI: 2.6, hemiS: 0xbfe3ff, hemiG: 0x5d7f3a, hemiI: 1.1, hill: [0x6fcf5a, 0x4fae4f, 0x8fdc77], field: 0x5cc24a, exp: 1.05 },
  { name: 'Golden Hills', top: 0x4a5fd0, mid: 0xffc38a, bot: 0xffa070, fog: 0xffcfa6, sun: 0xffc18a, sunI: 2.8, hemiS: 0xffd2b0, hemiG: 0x6a5a30, hemiI: 1.0, hill: [0xb8c95a, 0x8fb04a, 0xd9b860], field: 0x7fb84a, exp: 1.0 },
  { name: 'Twilight Peaks', top: 0x101540, mid: 0x7a5fb0, bot: 0x4a3f80, fog: 0x544a8a, sun: 0xb8c4ff, sunI: 1.9, hemiS: 0x8a8aff, hemiG: 0x30305a, hemiI: 1.0, hill: [0x4a6aa0, 0x3a5590, 0x6a7ab8], field: 0x3f7a62, exp: 1.15 },
];
function applyTheme(t) {
  skyMat.uniforms.top.value.set(t.top); skyMat.uniforms.mid.value.set(t.mid); skyMat.uniforms.bot.value.set(t.bot);
  scene.fog.color.set(t.fog);
  sun.color.set(t.sun); sun.intensity = t.sunI;
  hemi.color.set(t.hemiS); hemi.groundColor.set(t.hemiG); hemi.intensity = t.hemiI;
  renderer.toneMappingExposure = t.exp;
}

// ============================================================ Assets
function b64ToBuf(uri) {
  const s = atob(uri.slice(uri.indexOf(',') + 1)), a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a.buffer;
}
const manager = new THREE.LoadingManager();
manager.setURLModifier(u => /colormap\.png$/.test(u) ? window.ASSETS['colormap.png'] : u);
const loader = new GLTFLoader(manager);
function loadGLTF(name) {
  const uri = window.ASSETS[name];
  const data = name.endsWith('.gltf') ? atob(uri.slice(uri.indexOf(',') + 1)) : b64ToBuf(uri);
  return new Promise((res, rej) => loader.parse(data, '', res, rej));
}
function shadowize(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }
// wrap a model so it is `size` tall/wide, centered on x/z, standing on y=0
function normalize(obj, size, by = 'height') {
  const g = new THREE.Group(); g.add(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, true), s = box.getSize(new V3());
  obj.scale.multiplyScalar(size / (by === 'height' ? s.y : by === 'width' ? s.x : Math.max(s.x, s.z)));
  obj.updateMatrixWorld(true);
  box.setFromObject(obj, true);
  const c = box.getCenter(new V3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y;
  return shadowize(g);
}
const M = {};       // static model templates
const RIG = {};     // skinned gltfs
async function loadAll() {
  const k = n => loadGLTF('k-' + n + '.glb').then(g => g.scene);
  const [grass, brick, crateItem, crate, coin, flag, tree, pine, rocks, flowers, grassTuft, mushrooms, heart, star, spike, platform, fence] =
    await Promise.all(['block-grass', 'brick', 'crate-item', 'crate', 'coin-gold', 'flag', 'tree', 'tree-pine', 'rocks', 'flowers', 'grass', 'mushrooms', 'heart', 'star', 'spike-block', 'platform', 'fence-straight'].map(k));
  Object.assign(M, {
    grass: normalize(grass, 1, 'width'), brick: normalize(brick, 1, 'width'), box: normalize(crateItem, 1, 'width'),
    used: normalize(crate, 1, 'width'), coin: normalize(coin, 0.75), flag: normalize(flag, 6), cpFlag: normalize(flag.clone(), 2.2),
    tree: normalize(tree, 3.4), pine: normalize(pine, 4.2), rocks: normalize(rocks, 0.8), flowers: normalize(flowers, 0.32),
    tuft: normalize(grassTuft, 0.35), mushrooms: normalize(mushrooms, 0.6), heart: normalize(heart, 0.8), star: normalize(star, 0.9),
    spike: normalize(spike, 1, 'width'), platform: normalize(platform, 1, 'width'), fence: normalize(fence, 0.8),
  });
  const [knight, gen, mov, mush, blob, pblob, spiky, birb] = await Promise.all(
    ['Knight.glb', 'Rig_Medium_General.glb', 'Rig_Medium_MovementBasic.glb', 'Mushnub.gltf', 'GreenBlob.gltf', 'PinkBlob.gltf', 'GreenSpikyBlob.gltf', 'Birb.gltf'].map(loadGLTF));
  RIG.knight = knight;
  RIG.clips = [...gen.animations, ...mov.animations];
  Object.assign(RIG, { mush, blob, pblob, spiky, birb });
}

// instanced copies of a template at many transforms (ground, decor) — keeps draw calls low
function instanced(template, mats) {
  const out = new THREE.Group();
  if (!mats.length) return out;
  template.updateMatrixWorld(true);
  const t = new THREE.Matrix4();
  template.traverse(m => {
    if (!m.isMesh) return;
    const im = new THREE.InstancedMesh(m.geometry, m.material, mats.length);
    mats.forEach((Mx, i) => { t.multiplyMatrices(Mx, m.matrixWorld); im.setMatrixAt(i, t); });
    im.castShadow = im.receiveShadow = true; im.frustumCulled = false;
    out.add(im);
  });
  return out;
}
const mat4 = (x, y, z, s = 1, ry = 0) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new V3(s, s, s));

// ============================================================ Audio
let AC;
function beep(f, d = 0.08, type = 'square', slide = 0, vol = 0.06, delay = 0) {
  try {
    AC = AC || new AudioContext();
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + 0.02);
  } catch (e) {}
}
const seq = (notes, step, len = 0.12, type = 'square', vol = 0.06) => notes.forEach((f, i) => beep(f, len, type, 0, vol, i * step));
const SFX = {
  jump: () => beep(320, 0.16, 'square', 760, 0.05),
  coin: () => { beep(988, 0.07, 'square', 0, 0.05); beep(1319, 0.22, 'square', 0, 0.05, 0.07); },
  stomp: () => beep(420, 0.12, 'triangle', 110, 0.12),
  bump: () => beep(150, 0.09, 'triangle', 90, 0.12),
  brk: () => beep(220, 0.18, 'sawtooth', 60, 0.06),
  sprout: () => seq([392, 523, 659, 784], 0.06, 0.09),
  power: () => seq([523, 659, 784, 1047, 1319], 0.07, 0.1),
  hurt: () => beep(520, 0.45, 'square', 70, 0.07),
  one: () => seq([660, 880, 1320, 1760], 0.08, 0.1),
  cp: () => seq([784, 988, 1175], 0.08, 0.12, 'triangle', 0.09),
  clear: () => seq([523, 659, 784, 1047, 784, 1047, 1319], 0.13, 0.18, 'square', 0.06),
  over: () => seq([392, 330, 262, 196], 0.25, 0.3, 'triangle', 0.1),
  pause: () => beep(660, 0.08),
};
let muted = store.get('pipMute') === '1', mStep = 0;
const MEL = [
  [76, 0, 79, 81, 0, 79, 76, 74, 72, 0, 74, 76, 79, 0, 76, 0, 74, 0, 76, 79, 81, 0, 84, 83, 81, 79, 76, 0, 74, 72, 74, 0],
  [69, 72, 76, 0, 74, 72, 69, 0, 67, 69, 72, 0, 71, 0, 67, 0, 69, 72, 76, 79, 77, 76, 74, 0, 72, 74, 71, 0, 69, 0, 0, 0],
  [64, 0, 67, 71, 0, 72, 71, 67, 64, 0, 62, 64, 66, 0, 67, 0, 71, 0, 72, 74, 76, 0, 74, 72, 71, 0, 67, 0, 64, 0, 0, 0],
];
const BASS = [[48, 55, 52, 55, 45, 52, 48, 52, 41, 48, 45, 48, 43, 50, 47, 50], [45, 52, 48, 52, 41, 48, 45, 48, 43, 50, 47, 50, 40, 47, 44, 47], [40, 47, 43, 47, 36, 43, 40, 43, 38, 45, 42, 45, 35, 42, 39, 42]];
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
let musicOn = false;
function startMusic() {
  if (musicOn) return; musicOn = true;
  const tick = () => {
    const fast = player && player.star > 0;
    if (!muted && (state === 'play' || state === 'title' || state === 'banner')) {
      const li = state === 'title' ? 0 : levelIdx, mel = MEL[li], m = mel[mStep % mel.length];
      if (m) beep(midi(m + (fast ? 12 : 0)), 0.11, 'square', 0, 0.022);
      if (mStep % 2 === 0) beep(midi(BASS[li][(mStep >> 1) % 16]), 0.2, 'triangle', 0, 0.08);
      if (mStep % 4 === 2) beep(2400, 0.03, 'square', 500, 0.01);
      mStep++;
    }
    setTimeout(tick, fast ? 95 : 135);
  };
  tick();
}

// ============================================================ Input
const K = { left: 0, right: 0, jump: 0, run: 0 };
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump', KeyK: 'jump', ShiftLeft: 'run', ShiftRight: 'run', KeyX: 'run', KeyJ: 'run' };
addEventListener('keydown', e => {
  if (KEYMAP[e.code]) { K[KEYMAP[e.code]] = 1; e.preventDefault(); }
  if (e.repeat) return;
  if (e.code === 'Enter' || e.code === 'Space') press();
  if (e.code === 'KeyF') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); }
  if (e.code === 'KeyM') { muted = !muted; store.set('pipMute', muted ? '1' : '0'); }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});
addEventListener('keyup', e => { if (KEYMAP[e.code]) K[KEYMAP[e.code]] = 0; });
addEventListener('blur', () => { for (const k in K) K[k] = 0; if (state === 'play') togglePause(); });
document.querySelectorAll('.tc button').forEach(b => {
  const k = b.dataset.k;
  b.addEventListener('touchstart', e => { K[k] = 1; press(); e.preventDefault(); }, { passive: false });
  b.addEventListener('touchend', e => { K[k] = 0; e.preventDefault(); }, { passive: false });
});
renderer.domElement.addEventListener('pointerdown', press);

// ============================================================ Levels
// Tile chars: # ground, B brick, ? coin box, H heart box (grow), * star box (invincible), U used box, S crate (solid), x spike block
const SOLID = new Set(['#', 'B', '?', 'H', '*', 'U', 'S', 'x']);
class LevelData {
  constructor(w) { this.w = w; this.g = new Map(); this.coins = []; this.enemies = []; this.plats = []; this.cps = []; }
  set(x, y, c) { if (c === ' ') this.g.delete(x + ',' + y); else this.g.set(x + ',' + y, c); }
  get(x, y) { return this.g.get(x + ',' + y); }
  ground(a, b, h = 0) { for (let x = a; x <= b; x++) for (let y = -4; y < h; y++) this.set(x, y, '#'); }
  row(x, y, s) { [...s].forEach((c, i) => c !== '.' && this.set(x + i, y, c)); }
  stairs(x, h, dir, base = 0) { for (let i = 0; i < h; i++) for (let j = 0; j <= i; j++) this.set(dir > 0 ? x + i : x + h - 1 - i, base + j, '#'); }
  coinRow(x, y, n) { for (let i = 0; i < n; i++) this.coins.push([x + i, y]); }
  coinArc(x, y, n) { for (let i = 0; i < n; i++) this.coins.push([x + i, y + Math.round(Math.sin(i / (n - 1) * Math.PI) * 2)]); }
  en(type, x, y = 0) { this.enemies.push({ type, x, y }); }
  plat(x, y, len, dx, dy, speed = 1) { this.plats.push({ x, y, len, dx, dy, speed }); }
}
function level1() {
  const L = new LevelData(178);
  L.ground(-12, 34); L.ground(38, 62); L.ground(66, 96); L.ground(100, 125); L.ground(128, 190);
  L.row(9, 3, '?'); L.row(14, 3, 'B?BHB'); L.row(16, 7, '?');
  L.en('mush', 20); L.ground(23, 24, 2); L.en('mush', 27); L.ground(30, 31, 3); L.en('mush', 33);
  L.coinArc(34, 4, 5);
  L.row(42, 3, 'BB?BB'); L.coinRow(42, 6, 5); L.en('blob', 46); L.en('mush', 52); L.en('mush', 54);
  L.ground(57, 58, 2); L.row(60, 6, '*');
  L.coinArc(62, 3, 5);
  L.row(70, 3, 'B?B'); L.row(73, 6, 'BBBBBB'); L.row(78, 6, 'B?B'); L.coinRow(73, 7, 6);
  L.en('mush', 75); L.en('mush', 77); L.en('blob', 84);
  L.row(88, 3, '?'); L.row(91, 3, '?'); L.row(94, 3, '?'); L.row(91, 7, 'H');
  L.coinArc(96, 3, 5);
  L.en('mush', 104); L.en('mush', 106); L.row(108, 3, 'BB'); L.cps.push(112);
  L.stairs(116, 4, 1); L.stairs(121, 4, -1);
  L.en('blob', 130); L.row(133, 3, 'B?BB'); L.en('mush', 138);
  L.stairs(146, 6, 1); L.ground(152, 152, 6);
  L.coinRow(141, 2, 3);
  L.flagX = 162;
  return L;
}
function level2() {
  const L = new LevelData(196);
  L.ground(-12, 22); L.ground(27, 40); L.ground(48, 70, 0); L.ground(76, 92); L.ground(102, 128); L.ground(134, 150); L.ground(156, 210);
  L.row(8, 3, '?B?'); L.en('mush', 14); L.en('blob', 18);
  L.plat(23, 2, 3, 0, 0); L.coinRow(23, 4, 3);
  L.ground(30, 31, 2); L.ground(34, 35, 3); L.en('spiky', 37);
  L.plat(42, 3, 3, 3, 0, 0.9); L.coinArc(41, 5, 6);
  L.row(51, 3, 'B?B?B'); L.row(53, 7, 'H'); L.en('mush', 55); L.en('mush', 57); L.en('blob', 62);
  L.en('birb', 66, 4); L.ground(68, 70, 2);
  L.plat(72, 2, 2, 0, 2.5, 0.8); L.coinRow(72, 6, 2);
  L.row(80, 3, 'BBBB'); L.row(81, 7, '?.?'); L.en('spiky', 84); L.en('mush', 88); L.en('birb', 90, 5);
  L.plat(94, 2, 3, 3, 0, 1.1); L.coinArc(94, 4, 7);
  L.cps.push(104); L.en('blob', 108); L.en('blob', 110); L.row(112, 3, 'B*B'); L.ground(116, 117, 3); L.ground(120, 121, 4);
  L.en('mush', 124); L.en('mush', 126);
  L.plat(130, 4, 2, 0, 0); L.coinRow(130, 6, 2);
  L.row(138, 4, 'BBB?BBB'); L.en('spiky', 140); L.en('birb', 145, 5); L.coinRow(139, 7, 5);
  L.plat(151, 2, 3, 2, 0, 1.2);
  L.en('mush', 160); L.en('blob', 164); L.stairs(166, 7, 1); L.ground(173, 173, 7);
  L.flagX = 180;
  return L;
}
function level3() {
  const L = new LevelData(206);
  L.ground(-12, 18); L.ground(22, 30); L.ground(36, 52); L.ground(60, 74); L.ground(82, 100); L.ground(106, 124); L.ground(132, 146); L.ground(152, 220);
  L.row(8, 3, '?H?'); L.en('blob', 13); L.en('spiky', 16);
  L.plat(19, 2, 2, 0, 0); L.row(25, 0, 'xx'); L.coinArc(24, 2, 4);
  L.plat(31, 2, 3, 3, 0, 1.2); L.en('birb', 34, 5);
  L.row(39, 3, 'B?B'); L.row(44, 1, 'x'); L.ground(46, 47, 2); L.en('mush', 49); L.en('spiky', 51);
  L.plat(54, 2, 2, 0, 3, 1); L.plat(57, 5, 2, 0, -2.5, 1); L.coinRow(54, 8, 5);
  L.row(63, 4, 'BBB*BBB'); L.en('mush', 64); L.en('mush', 66); L.en('blob', 70); L.row(72, 0, 'x');
  L.plat(76, 3, 3, 3, 0, 1.4); L.en('birb', 78, 6); L.en('birb', 81, 3);
  L.cps.push(86); L.ground(88, 89, 2); L.row(92, 0, 'xx'); L.ground(95, 96, 3); L.en('spiky', 98);
  L.plat(102, 3, 2, 0, 0); L.coinArc(101, 5, 5);
  L.row(109, 3, '?B?B?'); L.row(111, 7, 'H'); L.en('mush', 112); L.en('blob', 116); L.en('spiky', 120); L.en('birb', 118, 5);
  L.plat(126, 2, 3, 3, 0, 1.5); L.coinRow(126, 4, 5);
  L.en('blob', 136); L.row(138, 0, 'x'); L.en('mush', 142); L.en('birb', 144, 4);
  L.plat(148, 3, 2, 0, 0);
  L.en('spiky', 158); L.en('mush', 162); L.stairs(165, 8, 1); L.ground(173, 173, 8);
  L.flagX = 182;
  return L;
}
const LEVELS = [level1, level2, level3];

// ============================================================ World state
let state = 'loading', levelIdx = 0, LV, world, player, ents = [], items = [], parts = [], plats = [], coins = new Map(), blocks = new Map(), bumpAnims = [];
let score = 0, coinCount = 0, lives = 3, time = 300, stateT = 0, checkpoint = null, best = +(store.get('pipBest3d') || 0);
let camX = 0, camY = 4, shake = 0, flagObj, cpObjs = [];
const tile = (x, y) => LV.get(x, y);
const solidAt = (x, y) => SOLID.has(LV.get(x, y));

function buildWorld(idx) {
  if (world) scene.remove(world);
  world = new THREE.Group(); scene.add(world);
  LV = LEVELS[idx]();
  const theme = THEMES[idx]; applyTheme(theme);
  ents = []; items = []; parts = []; plats = []; coins = new Map(); blocks = new Map(); bumpAnims = []; cpObjs = [];

  // terrain: grass-topped columns 3 deep in z, dirt below
  const topM = [], dirtM = [];
  for (const [k, c] of LV.g) {
    if (c !== '#') continue;
    const [x, y] = k.split(',').map(Number);
    const exposed = tile(x, y + 1) !== '#';
    for (let z = 0; z < 3; z++) (exposed ? topM : dirtM).push(mat4(x + 0.5, y, -z, 1));
  }
  world.add(instanced(M.grass, topM));
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0x9a6a46, roughness: 0.95 });
  const dirt = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), dirtMat, Math.max(1, dirtM.length));
  dirtM.forEach((m, i) => dirt.setMatrixAt(i, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.5, 0))));
  dirt.count = dirtM.length; dirt.receiveShadow = true; dirt.frustumCulled = false; world.add(dirt);

  // interactive blocks (individual meshes so they can bump/break)
  for (const [k, c] of LV.g) {
    if (c === '#') continue;
    const [x, y] = k.split(',').map(Number);
    const tpl = c === 'B' ? M.brick : c === 'S' ? M.used : c === 'x' ? M.spike : M.box;
    const o = tpl.clone(); o.position.set(x + 0.5, y, 0); world.add(o);
    if ('?H*'.includes(c)) { const q = new THREE.Sprite(qMat()); q.scale.set(0.62, 0.62, 1); q.position.set(0, 0.5, 0.56); o.add(q); }
    blocks.set(k, o);
  }
  // coins
  for (const [x, y] of LV.coins) {
    const o = M.coin.clone(); o.position.set(x + 0.5, y + 0.12, 0); world.add(o);
    coins.set(x + ',' + y, o);
  }
  // moving platforms (one-way, 3D wooden)
  for (const p of LV.plats) {
    const g = new THREE.Group();
    for (let i = 0; i < p.len; i++) { const o = M.platform.clone(); o.position.set(i + 0.5, -0.5, 0); o.scale.set(1, 0.5, 1); g.add(o); }
    g.position.set(p.x, p.y, 0); world.add(g);
    plats.push({ ...p, ox: p.x, oy: p.y, t: 0, obj: g, px: p.x, py: p.y, vx: 0, vy: 0 });
  }
  // goal flag + checkpoints
  flagObj = M.flag.clone(); flagObj.position.set(LV.flagX + 0.5, 0, -0.3); flagObj.rotation.y = 0; world.add(flagObj);
  for (const x of LV.cps) { const o = M.cpFlag.clone(); o.position.set(x + 0.5, 0, -0.6); o.rotation.y = -Math.PI / 2; world.add(o); cpObjs.push({ x, obj: o, hit: checkpoint === x }); }
  // enemies
  for (const e of LV.enemies) spawnEnemy(e.type, e.x, e.y);

  // ---- scenery: field, decor, hills, clouds
  const field = new THREE.Mesh(new THREE.PlaneGeometry(LV.w + 400, 120), new THREE.MeshStandardMaterial({ color: theme.field, roughness: 1 }));
  field.rotation.x = -Math.PI / 2; field.position.set(LV.w / 2, -0.06, -61.2); field.receiveShadow = true; world.add(field);
  const rnd = mulberry(idx * 99 + 7);
  const deco = { tree: [], pine: [], rocks: [], flowers: [], tuft: [], mushrooms: [], fence: [] };
  for (let x = -20; x < LV.w + 30; x += 1) {
    if (rnd() < 0.18) deco[idx === 2 || rnd() < 0.35 ? 'pine' : 'tree'].push(mat4(x + rnd(), 0, -7 - rnd() * 12, 0.8 + rnd() * 0.6, rnd() * 6));
    if (rnd() < 0.12) deco.rocks.push(mat4(x + rnd(), 0, -4 - rnd() * 8, 0.7 + rnd(), rnd() * 6));
    if (rnd() < 0.15) deco.flowers.push(mat4(x + rnd(), 0, -2.6 - rnd() * 5, 0.8 + rnd() * 0.5, rnd() * 6));
    if (rnd() < 0.5) deco.tuft.push(mat4(x + rnd(), 0, -2.6 - rnd() * 6, 0.8 + rnd(), rnd() * 6));
    if (rnd() < 0.06) deco.mushrooms.push(mat4(x + rnd(), 0, -2.8 - rnd() * 3, 1, rnd() * 6));
  }
  // decor on top of ground columns (front row)
  for (const [k, c] of LV.g) {
    if (c !== '#') continue;
    const [x, y] = k.split(',').map(Number);
    if (tile(x, y + 1) || y < -1) continue;
    if (rnd() < 0.3) deco.tuft.push(mat4(x + 0.2 + rnd() * 0.6, y + 1, -1.6 - rnd() * 0.6, 0.8, rnd() * 6));
    else if (rnd() < 0.1) deco.flowers.push(mat4(x + 0.5, y + 1, -1.7, 0.8, rnd() * 6));
  }
  for (const n in deco) world.add(instanced(M[n], deco[n]));
  // rolling hills / mountains
  const hillMats = theme.hill.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: idx === 2 }));
  for (let x = -60; x < LV.w + 80; x += 14 + rnd() * 10) {
    const r = 10 + rnd() * 14, z = -30 - rnd() * 40;
    const geo = idx === 2 ? new THREE.ConeGeometry(r, r * 2.2, 7) : new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const h = new THREE.Mesh(geo, hillMats[Math.floor(rnd() * 3)]);
    h.position.set(x, idx === 2 ? r * 1.1 - 2 : -1, z); h.scale.y = idx === 2 ? 1 : 0.55 + rnd() * 0.4;
    h.receiveShadow = true; world.add(h);
    if (idx === 2) { const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.32, r * 0.7, 7), new THREE.MeshStandardMaterial({ color: 0xeef2ff, flatShading: true })); cap.position.set(x, r * 1.1 - 2 + r * 1.1 - r * 0.35, z); world.add(cap); }
  }
  // clouds
  const cloudMat = new THREE.MeshStandardMaterial({ color: idx === 2 ? 0x9a90d0 : 0xffffff, roughness: 1, emissive: idx === 2 ? 0x221a44 : 0x334466, emissiveIntensity: 0.25 });
  const sph = new THREE.SphereGeometry(1, 20, 14);
  for (let x = -40; x < LV.w + 60; x += 18 + rnd() * 16) {
    const c = new THREE.Group();
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(sph, cloudMat); s.position.set(i * 1.3 - 2.6, Math.sin(i / 4 * Math.PI) * 1.1, rnd()); s.scale.setScalar(1.1 + Math.sin(i / 4 * Math.PI) * 0.9); c.add(s); }
    c.position.set(x, 11 + rnd() * 8, -18 - rnd() * 26); c.scale.set(1.2, 0.8, 0.8); c.userData.drift = 0.2 + rnd() * 0.3;
    world.add(c); parts.push({ cloud: c });
  }
  if (idx === 2) { // stars in the night sky
    const g = new THREE.BufferGeometry(), pts = [];
    for (let i = 0; i < 600; i++) { const a = rnd() * Math.PI, b = rnd() * 0.5 + 0.12; pts.push(Math.cos(a) * 250, Math.sin(b) * 250, -Math.sin(a) * 250); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const st = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, fog: false })); world.add(st);
  }
  time = 300;
}
let _qMat;
function qMat() {
  if (_qMat) return _qMat;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.font = '700 110px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 14; g.strokeStyle = '#5a2a00'; g.strokeText('?', 64, 70); g.fillStyle = '#fff6c8'; g.fillText('?', 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (_qMat = new THREE.SpriteMaterial({ map: t, transparent: true }));
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ============================================================ Characters
function animated(gltf, height) {
  const root = SkeletonUtils.clone(gltf.scene);
  const g = normalize(root, height);
  const mixer = new THREE.AnimationMixer(root);
  const acts = {};
  for (const c of gltf.animations) acts[c.name] = mixer.clipAction(c);
  return { obj: g, mixer, acts, cur: null };
}
function play(a, name, fade = 0.15, once = false, speed = 1) {
  const next = a.acts[name];
  if (!next) return;
  next.timeScale = speed;
  if (a.cur === name) return;
  const prev = a.acts[a.cur];
  next.reset(); next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); next.clampWhenFinished = once;
  next.play(); if (prev) next.crossFadeFrom(prev, fade, false);
  a.cur = name;
}
const ENEMY = {
  mush: { rig: 'mush', h: 0.95, w: 0.8, bh: 0.8, speed: 1.6, stomp: true, pts: 100 },
  blob: { rig: 'blob', h: 0.85, w: 0.8, bh: 0.75, speed: 1.3, stomp: true, pts: 100, edge: true, hop: true },
  pblob: { rig: 'pblob', h: 0.85, w: 0.8, bh: 0.75, speed: 1.8, stomp: true, pts: 150, edge: true },
  spiky: { rig: 'spiky', h: 1.0, w: 0.85, bh: 0.85, speed: 1.2, stomp: false, pts: 200, edge: true },
  birb: { rig: 'birb', h: 0.9, w: 0.8, bh: 0.8, speed: 1.8, stomp: true, pts: 200, fly: true },
};
function spawnEnemy(type, x, y) {
  const d = ENEMY[type], a = animated(RIG[d.rig], d.h);
  world.add(a.obj);
  play(a, 'Walk', 0, false, d.fly ? 1.4 : 1);
  ents.push({ kind: 'enemy', type, d, a, x: x + 0.1, y, by: y, w: d.w, h: d.bh, vx: -d.speed, vy: 0, dir: -1, alive: true, active: false, t: Math.random() * 6, hopT: 1 + Math.random() * 2 });
}

function makePlayer() {
  if (player) world.remove(player.a.obj);
  const a = animated({ scene: RIG.knight.scene, animations: RIG.clips }, 1);
  // own materials so we can flash / glow without touching other instances
  const mats = [];
  a.obj.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); mats.push(m.material); } });
  a.obj.traverse(m => { if (m.name === 'Knight_HelmetVisor') m.visible = false; }); // show Pip's face
  const p = { a, mats, x: 2, y: 0, w: 0.6, h: 1.15, vx: 0, vy: 0, face: 1, ground: false, big: false, inv: 0, star: 0, coyote: 0, buf: 0, jumpHeld: false, dead: false, rotY: Math.PI / 2, scale: 1, carry: null, sq: 0 };
  world.add(a.obj);
  play(a, 'Idle_A', 0);
  return p;
}
function setBig(b) {
  if (player.big === b) return;
  player.big = b;
  if (b) { player.h = 1.6; if (hitsCeiling(player)) { player.h = 1.15; player.big = false; return; } }
  else player.h = 1.15;
}
function hitsCeiling(b) {
  for (let x = Math.floor(b.x + 1e-3); x <= Math.floor(b.x + b.w - 1e-3); x++) if (solidAt(x, Math.floor(b.y + b.h - 1e-3))) return true;
  return false;
}

// ============================================================ Physics
function moveBody(b, dt, onHead) {
  let hitX = false; b.spiked = false;
  b.x += b.vx * dt;
  const y0 = Math.floor(b.y + 1e-3), y1 = Math.floor(b.y + b.h - 1e-3);
  if (b.vx > 0) {
    const tx = Math.floor(b.x + b.w - 1e-4);
    for (let y = y0; y <= y1; y++) if (solidAt(tx, y)) { if (tile(tx, y) === 'x') b.spiked = true; b.x = tx - b.w; hitX = true; }
  } else if (b.vx < 0) {
    const tx = Math.floor(b.x + 1e-4);
    for (let y = y0; y <= y1; y++) if (solidAt(tx, y)) { if (tile(tx, y) === 'x') b.spiked = true; b.x = tx + 1; hitX = true; }
  }
  const prevBottom = b.y;
  b.y += b.vy * dt; b.ground = false;
  const x0 = Math.floor(b.x + 1e-3), x1 = Math.floor(b.x + b.w - 1e-3);
  if (b.vy <= 0) {
    const ty = Math.floor(b.y - 1e-4);
    for (let x = x0; x <= x1; x++) if (solidAt(x, ty)) { if (tile(x, ty) === 'x') b.spiked = true; b.y = ty + 1; b.vy = 0; b.ground = true; break; }
    // one-way moving platforms
    b.carry = null;
    if (!b.ground) for (const p of plats) {
      if (b.x + b.w > p.px + 0.05 && b.x < p.px + p.len - 0.05 && prevBottom >= p.py - 0.12 && b.y <= p.py + 0.02) {
        b.y = p.py; b.vy = 0; b.ground = true; b.carry = p; break;
      }
    }
  } else {
    const ty = Math.floor(b.y + b.h);
    const hits = [];
    for (let x = x0; x <= x1; x++) if (solidAt(x, ty)) hits.push(x);
    if (hits.length) {
      b.y = ty - b.h; b.vy = Math.min(b.vy, 0) - 0.5;
      if (onHead) { const cx = b.x + b.w / 2; hits.sort((a, c) => Math.abs(a + 0.5 - cx) - Math.abs(c + 0.5 - cx)); onHead(hits[0], ty); }
    }
  }
  return hitX;
}
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ============================================================ Effects
const fx = {
  dust: new THREE.MeshStandardMaterial({ color: 0xfff6e8, roughness: 1, transparent: true }),
  spark: new THREE.MeshBasicMaterial({ color: 0xfff1a0 }),
  brick: new THREE.MeshStandardMaterial({ color: 0xc8643c, roughness: 0.8 }),
  sphere: new THREE.SphereGeometry(1, 10, 8), cube: new THREE.BoxGeometry(1, 1, 1), oct: new THREE.OctahedronGeometry(1),
};
const CONF = [0xff5f86, 0xffd23a, 0x4fd1ff, 0x7cf05a, 0xb486ff].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
function particle(geo, mat, pos, vel, life, s0, s1 = 0, grav = 0, spin = 0) {
  const m = new THREE.Mesh(geo, mat.transparent ? mat.clone() : mat); m.position.copy(pos); m.scale.setScalar(s0);
  if (geo === fx.cube) m.castShadow = true;
  world.add(m); parts.push({ m, vel, life, max: life, s0, s1, grav, spin });
}
function dust(x, y, n, spread = 0.6) {
  for (let i = 0; i < n; i++) particle(fx.sphere, fx.dust, new V3(x + (Math.random() - 0.5) * spread, y + 0.1, (Math.random() - 0.5) * 0.6),
    new V3((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5)), 0.45 + Math.random() * 0.2, 0.12 + Math.random() * 0.08, 0.32);
}
function sparkle(x, y, n = 10, z = 0) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3;
    particle(fx.oct, fx.spark, new V3(x, y, z), new V3(Math.cos(a) * s, Math.sin(a) * s, (Math.random() - 0.5) * 2), 0.5 + Math.random() * 0.3, 0.09, 0, 0, 8); }
}
function confetti(x, y, n = 60) {
  for (let i = 0; i < n; i++) particle(fx.cube, CONF[i % 5], new V3(x, y, 0), new V3((Math.random() - 0.5) * 10, 6 + Math.random() * 8, (Math.random() - 0.5) * 6), 2.5, 0.12, 0.12, -14, 10);
}
const popCache = {};
function popText(txt, x, y) {
  if (!popCache[txt]) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const g = c.getContext('2d'); g.font = '700 64px Fredoka, Arial Rounded MT Bold, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = '#1d1236'; g.strokeText(txt, 128, 50); g.fillStyle = '#fff'; g.fillText(txt, 128, 48);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    popCache[txt] = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false });
  }
  const s = new THREE.Sprite(popCache[txt].clone()); s.scale.set(1.6, 0.6, 1); s.position.set(x, y, 0.8); s.renderOrder = 10;
  world.add(s); parts.push({ sprite: s, life: 0.9, max: 0.9 });
}
function updateParts(dt) {
  for (const p of parts) {
    if (p.cloud) { p.cloud.position.x += p.cloud.userData.drift * dt; continue; }
    p.life -= dt;
    if (p.sprite) { p.sprite.position.y += dt * 1.6; p.sprite.material.opacity = Math.min(1, p.life / 0.3); if (p.life <= 0) world.remove(p.sprite); continue; }
    p.vel.y += p.grav * dt; p.m.position.addScaledVector(p.vel, dt); p.vel.multiplyScalar(p.grav ? 1 : 0.92);
    const k = 1 - p.life / p.max; p.m.scale.setScalar(lerp(p.s0, p.s1 || p.s0, k));
    if (p.spin) { p.m.rotation.x += p.spin * dt; p.m.rotation.y += p.spin * dt * 0.7; }
    if (p.m.material?.transparent) p.m.material.opacity = Math.max(0, p.life / p.max) * 0.85;
    if (p.life <= 0) world.remove(p.m);
  }
  parts = parts.filter(p => p.cloud || p.life > 0);
}

// ============================================================ Game rules
function addScore(n, x, y) { score += n; if (x !== undefined) popText(String(n), x, y); }
function getCoin(x, y) { coinCount++; addScore(100); SFX.coin(); sparkle(x, y, 8); if (coinCount >= 100) { coinCount -= 100; lives++; SFX.one(); popText('1UP', x, y + 0.6); } }
function bump(tx, ty) {
  const k = tx + ',' + ty, c = tile(tx, ty), o = blocks.get(k);
  // knock out enemies standing on the block
  for (const e of ents) if (e.alive && e.kind === 'enemy' && overlap(e, { x: tx, y: ty + 1, w: 1, h: 0.3 })) killEnemy(e, true);
  for (const it of items) if (overlap(it, { x: tx, y: ty + 1, w: 1, h: 0.3 })) { it.vy = 7; }
  if (c === 'x') { hurtPlayer(); return; }
  if (c === '?' || c === 'H' || c === '*') {
    LV.set(tx, ty, 'U');
    if (o) { world.remove(o); const u = M.used.clone(); u.position.copy(o.position); world.add(u); blocks.set(k, u); bumpAnims.push({ o: u, t: 0, y: ty }); }
    if (c === '?') {
      getCoin(tx + 0.5, ty + 1.5);
      const cm = M.coin.clone(); cm.position.set(tx + 0.5, ty + 1, 0); world.add(cm);
      parts.push({ m: cm, vel: new V3(0, 9, 0), life: 0.55, max: 0.55, s0: 1, s1: 1, grav: -26, spin: 18 });
    } else {
      SFX.sprout();
      const isStar = c === '*';
      const tpl = isStar ? M.star : (player.big ? M.star : M.heart);
      const type = isStar ? 'star' : (player.big ? 'star' : 'heart');
      const m = tpl.clone(); m.position.set(tx + 0.5, ty + 0.2, 0); world.add(m);
      items.push({ type, m, x: tx + 0.1, y: ty + 0.2, w: 0.8, h: 0.8, vx: 0, vy: 0, rise: 0.8, t: 0 });
    }
  } else if (c === 'B') {
    if (player.big) {
      LV.set(tx, ty, ' '); if (o) world.remove(o); blocks.delete(k);
      SFX.brk(); addScore(50); shake = 0.25;
      for (let i = 0; i < 8; i++) particle(fx.cube, fx.brick, new V3(tx + 0.5, ty + 0.5, 0), new V3((Math.random() - 0.5) * 6, 5 + Math.random() * 5, (Math.random() - 0.5) * 4), 1.4, 0.3, 0.3, -26, 8);
    } else { SFX.bump(); if (o) bumpAnims.push({ o, t: 0, y: ty }); }
  } else SFX.bump();
}
function killEnemy(e, flip) {
  e.alive = false; SFX.stomp(); addScore(e.d.pts, e.x + 0.4, e.y + 1.2); sparkle(e.x + 0.4, e.y + 0.5, 6); shake = Math.max(shake, 0.12);
  e.deadT = 0; e.flip = flip;
  play(e.a, 'Death', 0.05, true, 1.6);
  if (flip) { e.vy = 7; e.vx = (Math.random() < 0.5 ? -1 : 1) * 2; }
}
function hurtPlayer() {
  if (player.inv > 0 || player.star > 0 || player.dead) return;
  if (player.big) { setBig(false); player.inv = 2; SFX.hurt(); shake = 0.3; }
  else killPlayer();
}
function killPlayer() {
  if (player.dead) return;
  player.dead = true; player.vy = 9; player.vx = 0; SFX.hurt(); shake = 0.45;
  play(player.a, 'Death_A', 0.1, true);
  setState('dying');
}

// ============================================================ State machine
function setState(s) { state = s; stateT = 0; refreshOverlays(); }
function refreshOverlays() {
  $('loading').classList.toggle('on', state === 'loading');
  $('title').classList.toggle('on', state === 'title');
  $('banner').classList.toggle('on', state === 'banner');
  $('hud').classList.toggle('on', !['loading', 'title'].includes(state));
  const msg = { pause: ['PAUSED', 'Press P to resume'], over: ['GAME OVER', 'Score ' + score + ' · press ENTER'], victory: ['YOU WIN!', 'Final score ' + score + ' · press ENTER'] }[state];
  $('msg').classList.toggle('on', !!msg);
  if (msg) { $('msgBig').textContent = msg[0]; $('msgSub').textContent = msg[1]; }
  $('best').textContent = best ? 'BEST ' + best : '';
}
function press() {
  startMusic();
  if (state === 'title') { score = 0; coinCount = 0; lives = 3; levelIdx = 0; checkpoint = null; startLevel(); }
  else if ((state === 'over' || state === 'victory') && stateT > 1) { buildWorld(0); player = makePlayer(); setState('title'); }
}
function togglePause() {
  if (state === 'play') { setState('pause'); SFX.pause(); }
  else if (state === 'pause') { setState('play'); SFX.pause(); }
}
function startLevel(keepCheckpoint = false) {
  if (!keepCheckpoint) checkpoint = null;
  buildWorld(levelIdx);
  player = makePlayer();
  const sx = checkpoint !== null ? checkpoint : 2;
  player.x = sx; player.y = 0;
  for (let y = 0; y < 12 && (solidAt(Math.floor(sx), y) || solidAt(Math.floor(sx + 0.5), y)); y++) player.y = y + 1;
  camX = player.x + 5; camY = 4;
  $('bannerTop').textContent = 'WORLD 1-' + (levelIdx + 1);
  $('bannerBig').textContent = THEMES[levelIdx].name;
  setState('banner');
}
function saveBest() { if (score > best) { best = score; store.set('pipBest3d', best); } }

// ============================================================ Update
const STEP = 1 / 120;
function update(dt) {
  stateT += dt;
  if (state === 'title') { titleUpdate(dt); return; }
  if (state === 'pause' || state === 'loading') return;
  if (state === 'banner') { if (stateT > 1.6) setState('play'); animatePlayer(); return; }
  if (state === 'over' || state === 'victory') return;

  for (const p of plats) { // moving platforms
    p.t += dt * p.speed;
    const nx = p.ox + Math.sin(p.t) * p.dx, ny = p.oy + Math.sin(p.t) * p.dy;
    p.vx = (nx - p.px) / dt; p.vy = (ny - p.py) / dt; p.px = nx; p.py = ny;
    p.obj.position.set(nx, ny, 0);
  }
  for (const b of bumpAnims) { b.t += dt; b.o.position.y = b.y + Math.sin(Math.min(1, b.t / 0.22) * Math.PI) * 0.35; }
  bumpAnims = bumpAnims.filter(b => b.t < 0.22);

  if (state === 'dying') {
    player.vy -= 30 * dt; player.y += player.vy * dt;
    if (stateT > 2.4) {
      lives--;
      if (lives <= 0) { saveBest(); SFX.over(); setState('over'); }
      else startLevel(true);
    }
    updateEnemies(dt); return;
  }
  if (state === 'clear') { clearUpdate(dt); updateEnemies(dt); return; }

  // timer
  time -= dt * 2.5;
  if (time <= 0) { time = 0; killPlayer(); return; }

  updatePlayer(dt);
  updateEnemies(dt);
  updateItems(dt);
}

function updatePlayer(dt) {
  const P = player;
  if (P.carry) { P.x += P.carry.vx * dt; P.y = P.carry.py; }
  const run = K.run, max = run ? 9 : 5.6;
  const acc = P.ground ? (run ? 34 : 28) : 18;
  const dir = (K.right ? 1 : 0) - (K.left ? 1 : 0);
  if (dir) {
    P.face = dir;
    if (Math.sign(P.vx) !== dir && P.ground) P.vx += dir * acc * 1.8 * dt; // skid / quick turn
    else P.vx += dir * acc * dt;
    if (Math.abs(P.vx) > max) P.vx = lerp(P.vx, dir * max, 0.12);
  } else {
    const f = P.ground ? 26 : 4;
    P.vx = Math.abs(P.vx) <= f * dt ? 0 : P.vx - Math.sign(P.vx) * f * dt;
  }
  // jump: buffer + coyote time + variable height
  if (K.jump && !P.jumpHeld) P.buf = 0.12; else P.buf -= dt;
  P.coyote = P.ground ? 0.1 : P.coyote - dt;
  if (P.buf > 0 && P.coyote > 0) {
    P.vy = 12.8 + Math.abs(P.vx) * 0.32; P.buf = 0; P.coyote = 0; P.ground = false; P.carry = null; P.sq = -0.25;
    SFX.jump(); dust(P.x + P.w / 2, P.y, 5);
  }
  P.jumpHeld = K.jump;
  const g = (K.jump && P.vy > 0) ? 26 : 52;
  P.vy = Math.max(P.vy - g * dt, -22);
  const wasGround = P.ground, fallV = P.vy;
  moveBody(P, dt, bump);
  if (P.spiked) hurtPlayer();
  if (P.ground && !wasGround && fallV < -8) { P.sq = Math.min(0.35, -fallV / 50); dust(P.x + P.w / 2, P.y, 6); }
  if (P.ground && Math.abs(P.vx) > 7 && Math.random() < dt * 14) dust(P.x + P.w / 2 - P.face * 0.3, P.y, 1, 0.2);
  P.sq = lerp(P.sq, 0, Math.min(1, dt * 12));
  const minX = camX - viewHalfW() + 0.2;
  if (P.x < minX) { P.x = minX; P.vx = Math.max(0, P.vx); }
  if (P.y < -5) killPlayer();
  if (P.inv > 0) P.inv -= dt;
  if (P.star > 0) { P.star -= dt; if (Math.random() < dt * 30) sparkle(P.x + P.w / 2, P.y + P.h / 2, 1); }

  // coins
  for (let x = Math.floor(P.x); x <= Math.floor(P.x + P.w); x++) for (let y = Math.floor(P.y); y <= Math.floor(P.y + P.h); y++) {
    const k = x + ',' + y, c = coins.get(k);
    if (c) { world.remove(c); coins.delete(k); getCoin(x + 0.5, y + 0.5); }
  }
  // checkpoints
  for (const cp of cpObjs) if (!cp.hit && P.x > cp.x) { cp.hit = true; checkpoint = cp.x; SFX.cp(); sparkle(cp.x + 0.5, 2, 16); popText('CHECKPOINT', cp.x + 0.5, 2.8); }
  // goal
  if (P.x + P.w >= LV.flagX + 0.35) {
    P.x = LV.flagX + 0.35 - P.w; P.vx = 0;
    const bonus = P.y > 4 ? 5000 : P.y > 2 ? 2000 : 1000;
    addScore(bonus, P.x, P.y + 2); SFX.clear(); confetti(LV.flagX + 0.5, 5);
    setState('clear');
  }
  animatePlayer();
}
function viewHalfW() { return Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * camDist; }

function animatePlayer() {
  const P = player, a = P.a;
  if (P.dead) {}
  else if (state === 'clear') play(a, stateT < 0.6 ? 'Jump_Idle' : 'Interact', 0.2);
  else if (!P.ground && state === 'play') play(a, 'Jump_Idle', 0.12);
  else {
    const sp = Math.abs(P.vx);
    if (sp > 6.5) play(a, 'Running_A', 0.15, false, 0.85 + sp / 14);
    else if (sp > 0.3) play(a, 'Walking_A', 0.15, false, 0.6 + sp / 5);
    else play(a, 'Idle_A', 0.2);
  }
  // facing: turn sideways, angled slightly toward the camera
  const target = state === 'clear' && stateT > 0.6 ? 0 : P.face > 0 ? Math.PI / 2 - 0.35 : -Math.PI / 2 + 0.35;
  P.rotY = lerp(P.rotY, target, 0.2);
  const base = P.big ? 1.7 : 1.25;
  P.scale = lerp(P.scale, base, 0.15);
  const o = a.obj;
  o.position.set(P.x + P.w / 2, P.y, 0.05);
  o.rotation.set(P.dead ? 0 : 0, P.dead ? 0 : P.rotY, 0);
  o.scale.set(P.scale * (1 + P.sq * 0.6), P.scale * (1 - P.sq), P.scale * (1 + P.sq * 0.6));
  o.visible = !(P.inv > 0 && Math.floor(P.inv * 16) % 2 === 0);
  // invincibility glow
  const t = performance.now() / 1000;
  const glow = P.star > 0 ? new THREE.Color().setHSL((t * 2) % 1, 1, 0.5) : null;
  for (const m of P.mats) { if (glow) { m.emissive.copy(glow); m.emissiveIntensity = 0.55; } else if (m.emissiveIntensity) { m.emissiveIntensity = 0; } }
}

function updateEnemies(dt) {
  for (const e of ents) {
    if (!e.active) { if (e.x < camX + viewHalfW() + 3) e.active = true; else { syncEnemy(e); continue; } }
    e.t += dt;
    if (!e.alive) {
      e.deadT += dt;
      if (e.flip) { e.vy -= 30 * dt; e.y += e.vy * dt; e.x += e.vx * dt; e.a.obj.rotation.z += dt * 8; }
      else e.a.obj.scale.y = Math.max(0.25, 1 - e.deadT * 4);
      if (e.deadT > 1.1) { world.remove(e.a.obj); e.gone = true; }
      e.a.obj.position.set(e.x + e.w / 2, e.y, 0);
      continue;
    }
    if (e.d.fly) {
      e.x += e.vx * dt; e.y = e.by + Math.sin(e.t * 2.4) * 1.3;
      if (Math.abs(e.x - (e.homeX ?? (e.homeX = e.x))) > 4) { e.vx = -e.vx; e.x += e.vx * dt * 2; }
    } else {
      if (e.d.hop && e.ground) { e.hopT -= dt; if (e.hopT <= 0) { e.vy = 8; e.hopT = 1.5 + Math.random() * 2; } }
      e.vy = Math.max(e.vy - 40 * dt, -20);
      if (moveBody(e, dt)) e.vx = -e.vx;
      if (e.d.edge && e.ground) { // turn around at ledges
        const fx = e.vx > 0 ? Math.floor(e.x + e.w + 0.05) : Math.floor(e.x - 0.05);
        if (!solidAt(fx, Math.floor(e.y - 0.5)) && !plats.some(p => fx >= p.px && fx < p.px + p.len)) e.vx = -e.vx;
      }
      if (e.y < -6) { e.alive = false; e.deadT = 2; }
    }
    // collide with player
    const P = player;
    if (state === 'play' && !P.dead && overlap(e, P)) {
      if (P.star > 0) killEnemy(e, true);
      else if (e.d.stomp && P.vy < 0 && P.y > e.y + e.h * 0.35) { killEnemy(e, false); P.vy = K.jump ? 14 : 9; P.coyote = 0; }
      else hurtPlayer();
    }
    syncEnemy(e, dt);
  }
  // enemies bounce off each other
  for (let i = 0; i < ents.length; i++) for (let j = i + 1; j < ents.length; j++) {
    const a = ents[i], b = ents[j];
    if (a.alive && b.alive && a.active && b.active && !a.d.fly && !b.d.fly && overlap(a, b)) { const s = Math.sign(b.x - a.x) || 1; a.vx = -s * Math.abs(a.vx); b.vx = s * Math.abs(b.vx); }
  }
  ents = ents.filter(e => !e.gone);
}
function syncEnemy(e, dt = 0) {
  const o = e.a.obj;
  o.position.set(e.x + e.w / 2, e.y, 0);
  if (e.alive) { const tgt = e.vx > 0 ? Math.PI / 2 - 0.3 : -Math.PI / 2 + 0.3; o.rotation.y = lerp(o.rotation.y, tgt, Math.min(1, dt * 10)); }
}

function updateItems(dt) {
  for (const it of items) {
    it.t += dt;
    if (it.rise > 0) { const d = Math.min(it.rise, dt * 1.6); it.y += d; it.rise -= d; if (it.rise <= 0) it.vx = it.type === 'star' ? 3.4 : 2.6; }
    else {
      it.vy = Math.max(it.vy - 34 * dt, -18);
      if (moveBody(it, dt)) it.vx = -it.vx;
      if (it.type === 'star' && it.ground) it.vy = 10;
      if (it.y < -6) it.gone = true;
    }
    it.m.position.set(it.x + it.w / 2, it.y, 0);
    it.m.rotation.y += dt * 3;
    if (!it.gone && overlap(it, player)) {
      it.gone = true;
      if (it.type === 'heart') { setBig(true); SFX.power(); addScore(1000, it.x, it.y + 1); sparkle(player.x, player.y + 1, 18); }
      else { player.star = 10; SFX.power(); addScore(1000, it.x, it.y + 1); }
    }
    if (it.gone) world.remove(it.m);
  }
  items = items.filter(i => !i.gone);
}

function clearUpdate(dt) {
  const P = player;
  if (stateT < 0.6) { P.vy = Math.max(P.vy - 52 * dt, -10); moveBody(P, dt); }
  if (stateT > 0.6 && time > 0) { const d = Math.min(time, dt * 120); time -= d; score += Math.round(d) * 10; }
  if (stateT > 1.0 && Math.random() < dt * 3) confetti(P.x + (Math.random() - 0.5) * 6, P.y + 4, 12);
  animatePlayer();
  if (stateT > 4.2) {
    if (levelIdx < LEVELS.length - 1) { levelIdx++; startLevel(); }
    else { saveBest(); setState('victory'); confetti(P.x, P.y + 4, 120); }
  }
}

let titleT = 0;
function titleUpdate(dt) {
  titleT += dt;
  player.x = 4; player.y = 0; player.ground = true; player.vx = 0; player.face = 1;
  play(player.a, 'Idle_A', 0.2);
  player.a.obj.position.set(4.3, 0, 0.05);
  player.a.obj.rotation.y = Math.sin(titleT * 0.5) * 0.6;
  player.a.obj.scale.setScalar(1.42);
  camX = 4.3 + Math.sin(titleT * 0.15) * 2; camY = 2.6;
}

// ============================================================ Camera & HUD
function updateCamera(dt) {
  if (state !== 'title' && player) {
    const lead = clamp(player.vx * 0.35, -3, 3) + player.face * 1.5;
    const tx = clamp(player.x + lead, viewHalfW() - 2, LV.flagX + 10 - viewHalfW() + 2);
    camX = lerp(camX, Math.max(tx, camX - 0.02), 1 - Math.exp(-dt * 4));
    const ty = Math.max(2.9, player.y + 1.3);
    if (!player.dead) camY = lerp(camY, ty, 1 - Math.exp(-dt * 3));
  }
  shake = Math.max(0, shake - dt);
  const sx = (Math.random() - 0.5) * shake * 0.6, sy = (Math.random() - 0.5) * shake * 0.6;
  const dist = state === 'title' ? 9 : camDist;
  camera.position.set(camX + sx, camY + 3.2 + sy, dist);
  camera.lookAt(camX + sx * 0.5, camY - 0.2, 0);
  sky.position.copy(camera.position);
  sun.position.set(camX + 10, 22, 16); sun.target.position.set(camX, 0, -2);
}
let hudCache = '';
function updateHUD() {
  const s = [String(score).padStart(6, '0'), '× ' + String(coinCount).padStart(2, '0'), '1-' + (levelIdx + 1), String(Math.ceil(time)).padStart(3, '0'), lives].join('|');
  if (s === hudCache) return; hudCache = s;
  const [a, b, c, d, e] = s.split('|');
  $('score').textContent = a; $('coins').textContent = b; $('world').textContent = c; $('time').textContent = d; $('lives').textContent = e;
  $('time').style.color = time < 60 ? '#ff6b8b' : '';
}

// ============================================================ Main loop
const clock = new THREE.Clock();
let acc = 0;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  if (state !== 'loading') {
    acc += dt;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    if (state !== 'pause') {
      if (player) player.a.mixer.update(dt);
      for (const e of ents) if (e.active || state === 'title') e.a.mixer.update(dt);
      for (const c of coins.values()) c.rotation.y += dt * 3;
      for (const it of items) if (it.type === 'star') it.m.rotation.z = Math.sin(performance.now() / 150) * 0.3;
      if (_qMat) _qMat.opacity = 0.75 + Math.sin(performance.now() / 180) * 0.25;
      if (flagObj) flagObj.rotation.y = Math.sin(performance.now() / 600) * 0.08;
      updateParts(dt);
    }
    updateCamera(dt);
    updateHUD();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

loadAll().then(() => {
  buildWorld(0);
  player = makePlayer();
  setState('title');
  clock.getDelta();
  requestAnimationFrame(frame);
}).catch(err => { $('loading').textContent = 'Failed to load: ' + err.message; console.error(err); });
window.__game = { get state() { return state; }, get player() { return player; }, get score() { return score; }, get level() { return levelIdx; }, setLevel(i) { levelIdx = i; startLevel(); } };
