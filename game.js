// Velocity Circuit — a 3D arcade racing game built on Three.js.
// Everything (track, cars, scenery, textures) is generated procedurally at load.

import * as THREE from 'three';

// ---------------------------------------------------------------- constants
const LAPS = 3;
const ROAD_HALF = 8;          // half-width of the asphalt, metres
const N = 800;                // track centerline sample count
const AI_COUNT = 4;
const PLAYER_MAX_SPEED = 53;  // m/s (~190 km/h)

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc1e8);
scene.fog = new THREE.Fog(0x9fc8ea, 260, 1100);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 2500);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- lighting
scene.add(new THREE.HemisphereLight(0xcfe5ff, 0x4a6a3a, 0.85));

const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 400;
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

// ---------------------------------------------------------------- helpers
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function noise(ctx, w, h, count, alpha) {
  for (let i = 0; i < count; i++) {
    const g = Math.random() * 255 | 0;
    ctx.fillStyle = `rgba(${g},${g},${g},${alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

// ---------------------------------------------------------------- track
const controlPoints = [
  [0, 0], [70, -14], [135, 6], [185, 55], [205, 125], [160, 175],
  [95, 160], [55, 105], [0, 120], [-45, 175], [-120, 185], [-175, 130],
  [-185, 55], [-140, 10], [-90, 35], [-45, -5],
].map(([x, z]) => new THREE.Vector3(x * 2.1, 0, z * 2.1));

const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.45);
const trackLen = curve.getLength();

const samples = [];   // centerline points
const tangents = [];  // unit tangents (direction of travel)
const lefts = [];     // unit left vectors
for (let i = 0; i < N; i++) {
  const u = i / N;
  const p = curve.getPointAt(u);
  const t = curve.getTangentAt(u);
  t.y = 0; t.normalize();
  samples.push(p);
  tangents.push(t);
  lefts.push(new THREE.Vector3(t.z, 0, -t.x));
}

// Road ribbon geometry.
{
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const j = i % N;
    const L = samples[j].clone().addScaledVector(lefts[j], ROAD_HALF);
    const R = samples[j].clone().addScaledVector(lefts[j], -ROAD_HALF);
    pos.push(L.x, 0.01, L.z, R.x, 0.01, R.z);
    const v = (i / N) * trackLen / 14;   // texture repeats every 14 m
    uv.push(0, v, 1, v);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const roadTex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3a3a40'; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 1200, 0.05);
    // red/white rumble strips on both edges
    for (let y = 0; y < h; y += 64) {
      ctx.fillStyle = (y / 64) % 2 ? '#c83232' : '#e8e8e8';
      ctx.fillRect(0, y, 10, 64);
      ctx.fillStyle = (y / 64) % 2 ? '#e8e8e8' : '#c83232';
      ctx.fillRect(w - 10, y, 10, 64);
    }
    // solid white edge lines
    ctx.fillStyle = '#ddd';
    ctx.fillRect(14, 0, 5, h);
    ctx.fillRect(w - 19, 0, 5, h);
    // dashed center line
    ctx.fillStyle = '#d8c84a';
    ctx.fillRect(w / 2 - 3, 0, 6, h / 2);
  });
  const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: roadTex, roughness: 0.95, metalness: 0,
  }));
  road.receiveShadow = true;
  scene.add(road);
}

// Start/finish line (the grid sits just past it, so the first crossing = lap 1 done).
{
  const tex = canvasTexture(128, 32, (ctx, w, h) => {
    const s = 16;
    for (let x = 0; x < w; x += s) for (let y = 0; y < h; y += s) {
      ctx.fillStyle = ((x + y) / s) % 2 ? '#111' : '#eee';
      ctx.fillRect(x, y, s, s);
    }
  });
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF * 2, 4),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })
  );
  line.rotation.x = -Math.PI / 2;
  line.position.copy(samples[0]).setY(0.03);
  line.rotation.z = -Math.atan2(tangents[0].x, tangents[0].z);
  scene.add(line);
}

// AI target-speed table: slow into corners, fast on straights.
const aiSpeedTable = new Float32Array(N);
{
  const ds = trackLen / N;
  for (let i = 0; i < N; i++) {
    const a = tangents[i], b = tangents[(i + 6) % N];
    const angle = Math.acos(clamp(a.dot(b), -1, 1));
    const curvature = angle / (6 * ds);
    // v = sqrt(latGrip / curvature), capped
    aiSpeedTable[i] = clamp(Math.sqrt(11 / Math.max(curvature, 1e-4)), 15, 50);
  }
  // backwards passes so the AI brakes *before* corners (decel ~14 m/s^2)
  for (let pass = 0; pass < 3; pass++) {
    for (let i = N - 1; i >= 0; i--) {
      const next = aiSpeedTable[(i + 1) % N];
      aiSpeedTable[i] = Math.min(aiSpeedTable[i], Math.sqrt(next * next + 2 * 14 * ds));
    }
  }
}

// ---------------------------------------------------------------- scenery
{
  const grassTex = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#4e8a3c'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(60,120,45,.5)' : 'rgba(90,150,60,.5)';
      ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
  });
  grassTex.repeat.set(90, 90);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(1500, 48),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

// Trees (instanced), kept clear of the road.
{
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 5, 6);
  const leafGeo = new THREE.ConeGeometry(4, 11, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d6b2d, roughness: 1 });
  const COUNT = 260;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, COUNT);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, COUNT);
  trunks.castShadow = leaves.castShadow = true;
  const m = new THREE.Matrix4();
  let placed = 0, guard = 0;
  while (placed < COUNT && guard++ < 8000) {
    const x = (Math.random() - 0.5) * 1700;
    const z = (Math.random() - 0.5) * 1700;
    let minD = Infinity;
    for (let i = 0; i < N; i += 5) {
      const dx = samples[i].x - x, dz = samples[i].z - z;
      minD = Math.min(minD, dx * dx + dz * dz);
    }
    if (minD < 26 * 26) continue;
    const s = 0.7 + Math.random() * 0.9;
    m.makeScale(s, s, s).setPosition(x, 2.5 * s, z);
    trunks.setMatrixAt(placed, m);
    m.makeScale(s, s, s).setPosition(x, 9.5 * s, z);
    leaves.setMatrixAt(placed, m);
    placed++;
  }
  trunks.count = leaves.count = placed;
  scene.add(trunks, leaves);
}

// Distant mountains + a few clouds.
{
  const mat = new THREE.MeshStandardMaterial({ color: 0x7e8ba0, roughness: 1, flatShading: true });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
    const r = 1150 + Math.random() * 250;
    const hgt = 120 + Math.random() * 220;
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(90 + Math.random() * 130, hgt, 5), mat);
    mtn.position.set(Math.cos(a) * r, hgt / 2 - 12, Math.sin(a) * r);
    mtn.rotation.y = Math.random() * Math.PI;
    scene.add(mtn);
  }
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 12; i++) {
    const cl = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(14 + Math.random() * 14, 10, 8), cloudMat);
      puff.position.set(k * 20 - 20 + Math.random() * 8, Math.random() * 6, Math.random() * 10);
      puff.scale.y = 0.45;
      cl.add(puff);
    }
    cl.position.set((Math.random() - 0.5) * 1800, 170 + Math.random() * 120, (Math.random() - 0.5) * 1800);
    scene.add(cl);
  }
}

// Grandstand by the start line.
{
  const side = samples[0].clone().addScaledVector(lefts[0], ROAD_HALF + 16);
  const stand = new THREE.Group();
  for (let row = 0; row < 4; row++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(34, 1.6, 4),
      new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.8 })
    );
    step.position.set(0, 0.8 + row * 1.6, row * 4);
    step.castShadow = step.receiveShadow = true;
    stand.add(step);
    for (let s = 0; s < 16; s++) {  // crowd
      const fan = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 1.1, 0.7),
        new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.7, 0.55) })
      );
      fan.position.set(-15.5 + s * 2.07, 2.1 + row * 1.6, row * 4);
      stand.add(fan);
    }
  }
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(36, 0.5, 20),
    new THREE.MeshStandardMaterial({ color: 0xc8453a, roughness: 0.6 })
  );
  roof.position.set(0, 9.5, 6);
  stand.add(roof);
  for (const px of [-16, 16]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 9, 8),
      new THREE.MeshStandardMaterial({ color: 0x666666 }));
    pole.position.set(px, 4.7, 14);
    stand.add(pole);
  }
  stand.position.copy(side);
  stand.rotation.y = Math.atan2(tangents[0].x, tangents[0].z) + Math.PI / 2;
  scene.add(stand);
}

// ---------------------------------------------------------------- cars
function buildCar(bodyColor) {
  const group = new THREE.Group();
  const body = new THREE.Group();   // separate so it can roll in corners
  group.add(body);

  const paint = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.45, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14181f, metalness: 0.2, roughness: 0.5 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.3), paint);
  chassis.position.y = 0.55;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.35, 0.9), paint);
  nose.position.set(0, 0.45, 2.4);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.5, 1.9), dark);
  cabin.position.set(0, 1.05, -0.25);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.5), paint);
  spoiler.position.set(0, 1.15, -2.0);
  const spoilerLegL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.1), dark);
  spoilerLegL.position.set(-0.7, 0.95, -2.0);
  const spoilerLegR = spoilerLegL.clone();
  spoilerLegR.position.x = 0.7;
  body.add(chassis, nose, cabin, spoiler, spoilerLegL, spoilerLegR);

  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6cc, emissive: 0xfff0aa, emissiveIntensity: 1.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff3322, emissive: 0xcc1100, emissiveIntensity: 0.9 });
  for (const sx of [-0.6, 0.6]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.06), lightMat);
    head.position.set(sx, 0.55, 2.86);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.06), tailMat);
    tail.position.set(sx, 0.62, -2.18);
    body.add(head, tail);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.36, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.38, 8);
  hubGeo.rotateZ(Math.PI / 2);
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.8, roughness: 0.3 });

  const wheels = [], frontPivots = [];
  for (const [x, z, front] of [[-0.95, 1.45, 1], [0.95, 1.45, 1], [-0.95, -1.45, 0], [0.95, -1.45, 0]]) {
    const wheel = new THREE.Group();
    wheel.add(new THREE.Mesh(wheelGeo, wheelMat), new THREE.Mesh(hubGeo, hubMat));
    wheels.push(wheel);
    if (front) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.42, z);
      pivot.add(wheel);
      frontPivots.push(pivot);
      group.add(pivot);
    } else {
      wheel.position.set(x, 0.42, z);
      group.add(wheel);
    }
  }

  group.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group, body, wheels, frontPivots };
}

// Heading convention: h = 0 faces +Z, forward = (sin h, 0, cos h).
const headingAt = i => Math.atan2(tangents[i].x, tangents[i].z);

// Grid slots are placed just *past* the start line.
const gridIndex = s => (10 + s * 9) % N;
const gridLateral = s => (s % 2 === 0 ? -2.9 : 2.9);

const player = {
  name: 'You', color: 0xd5212e, isPlayer: true,
  ...buildCar(0xd5212e),
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), heading: 0,
  trackIdx: 0, lateral: 0, crossings: 0, passedHalf: false,
  progress: 0, lap: 1, finished: false, finishTime: 0,
  lapStart: 0, lastLap: 0, bestLap: 0, wheelSpin: 0, steerVis: 0,
};
scene.add(player.group);

const aiColors = [0x2266dd, 0xeeaa22, 0x33aa55, 0x9944cc];
const aiNames = ['Blaze', 'Vex', 'Nitro', 'Echo'];
const ais = [];
for (let i = 0; i < AI_COUNT; i++) {
  const car = {
    name: aiNames[i], color: aiColors[i], isPlayer: false,
    ...buildCar(aiColors[i]),
    u0: 0, traveled: 0, speed: 0, lane: 0, lanePhase: Math.random() * 6.28,
    skill: 0.88 + i * 0.035,            // back of grid = fastest, for drama
    progress: 0, lap: 1, finished: false, finishTime: 0, wheelSpin: 0,
  };
  ais.push(car);
  scene.add(car.group);
}
const entrants = [player, ...ais];

function placeOnGrid() {
  // Player starts at the back (slot 4); AI fill slots 0-3.
  const order = [...ais, player];
  order.forEach((car, s) => {
    const slot = order.length - 1 - s;          // slot 0 is furthest ahead
    const i = gridIndex(slot);
    const lat = gridLateral(slot);
    const p = samples[i].clone().addScaledVector(lefts[i], lat);
    car.group.position.copy(p);
    car.group.rotation.set(0, headingAt(i), 0);
    if (car.isPlayer) {
      car.pos.copy(p);
      car.vel.set(0, 0, 0);
      car.heading = headingAt(i);
      car.trackIdx = i;
      car._prevIdx = i;
      car.crossings = 0;
      car.passedHalf = false;
      car.lastLap = 0; car.bestLap = 0;
    } else {
      car.u0 = i / N;
      car.traveled = 0;
      car.speed = 0;
      car.lane = lat;
    }
    car.lap = 1; car.finished = false; car.finishTime = 0; car.progress = 0;
  });
}

// Find the nearest centerline sample, searching a window around the last hit.
function nearestIndex(pos, lastIdx) {
  let best = lastIdx, bestD = Infinity;
  for (let k = -25; k <= 35; k++) {
    const i = (lastIdx + k + N) % N;
    const dx = samples[i].x - pos.x, dz = samples[i].z - pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ---------------------------------------------------------------- input
const keys = {};
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  initAudio();
  if (e.code === 'KeyC') cameraMode = (cameraMode + 1) % 3;
  if (e.code === 'KeyM') muted = !muted;
  if (e.code === 'KeyR' && state === 'racing') resetPlayer();
  if (e.code === 'Enter' && state === 'finished') startRace();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

function resetPlayer() {
  const i = player.trackIdx;
  player.pos.copy(samples[i]);
  player.vel.set(0, 0, 0);
  player.heading = headingAt(i);
}

// ---------------------------------------------------------------- audio
let audioCtx = null, engineOsc = null, engineOsc2 = null, engineGain = null, muted = false;
function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    engineGain = audioCtx.createGain();
    engineGain.gain.value = 0;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    engineOsc = audioCtx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc2 = audioCtx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc.connect(filter);
    engineOsc2.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    engineOsc.start();
    engineOsc2.start();
  } catch { /* audio unavailable; play silently */ }
}
function updateAudio(speed, throttle) {
  if (!audioCtx || !engineOsc) return;
  const ratio = clamp(speed / PLAYER_MAX_SPEED, 0, 1);
  const rpm = 55 + ratio * 195 + (throttle ? 12 : 0);
  engineOsc.frequency.setTargetAtTime(rpm, audioCtx.currentTime, 0.05);
  engineOsc2.frequency.setTargetAtTime(rpm * 0.5, audioCtx.currentTime, 0.05);
  const vol = muted || state === 'finished' ? 0 : 0.025 + ratio * 0.04 + (throttle ? 0.015 : 0);
  engineGain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.08);
}

// ---------------------------------------------------------------- race state
let state = 'countdown';   // countdown | racing | finished
let countdownT = 0;
let raceStart = 0;
let finishOrder = [];
let cameraMode = 0;        // 0 chase, 1 hood, 2 overhead
let now = 0;               // race clock, seconds

const ui = {
  lap: document.getElementById('lap'),
  pos: document.getElementById('pos'),
  time: document.getElementById('time'),
  last: document.getElementById('last'),
  best: document.getElementById('best'),
  speed: document.getElementById('speed'),
  count: document.getElementById('count'),
  results: document.getElementById('results'),
  resTitle: document.getElementById('resTitle'),
  resTable: document.getElementById('resTable'),
  wrong: document.getElementById('wrong'),
};

function fmtTime(t) {
  if (!t || t < 0) return '--:--.---';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

function startRace() {
  placeOnGrid();
  finishOrder = [];
  state = 'countdown';
  countdownT = 4.2;        // brief pause, then 3-2-1-GO
  ui.results.style.display = 'none';
  ui.count.textContent = '';
}

function finishCar(car) {
  car.finished = true;
  car.finishTime = now;
  finishOrder.push(car);
  if (car.isPlayer) showResults();
}

const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || 'th');

function showResults() {
  state = 'finished';
  const place = finishOrder.indexOf(player) + 1;
  ui.resTitle.textContent = place === 1 ? '🏆 YOU WIN!' : `${ordinal(place).toUpperCase()} PLACE`;
  // Unfinished AI get projected times based on remaining distance.
  const rows = entrants
    .map(c => ({ c, t: c.finished ? c.finishTime : now + (LAPS - c.progress) * trackLen / 40 }))
    .sort((a, b) => a.t - b.t);
  ui.resTable.innerHTML = rows.map((r, i) =>
    `<tr style="color:${r.c.isPlayer ? '#ffd34d' : '#fff'}">
       <td>${i + 1}.</td><td>${r.c.name}</td>
       <td>${r.c.finished ? fmtTime(r.t) : 'est. ' + fmtTime(r.t)}</td>
     </tr>`).join('');
  const best = document.createElement('tr');
  best.innerHTML = `<td></td><td>Best lap</td><td>${fmtTime(player.bestLap)}</td>`;
  best.style.opacity = '0.8';
  ui.resTable.appendChild(best);
  ui.results.style.display = 'block';
}

// ---------------------------------------------------------------- player physics
const _fwd = new THREE.Vector3();
const _lat = new THREE.Vector3();
const _tmp = new THREE.Vector3();

function updatePlayer(dt) {
  const p = player;
  _fwd.set(Math.sin(p.heading), 0, Math.cos(p.heading));

  const accelerate = keys.KeyW || keys.ArrowUp;
  const brake = keys.KeyS || keys.ArrowDown;
  const handbrake = keys.Space;
  const steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);

  let fwdSpeed = p.vel.dot(_fwd);
  _lat.copy(p.vel).addScaledVector(_fwd, -fwdSpeed);

  // where are we relative to the track?
  p.trackIdx = nearestIndex(p.pos, p.trackIdx);
  const i = p.trackIdx;
  _tmp.copy(p.pos).sub(samples[i]);
  p.lateral = _tmp.dot(lefts[i]);
  const onTrack = Math.abs(p.lateral) < ROAD_HALF + 0.8;

  // steering: stronger at low speed, eased off near top speed
  const speedFactor = clamp(Math.abs(fwdSpeed) / 11, 0, 1);
  const steerRate = 2.5 / (1 + Math.abs(fwdSpeed) * 0.018);
  p.heading += steer * steerRate * speedFactor * Math.sign(fwdSpeed || 1) * dt;
  _fwd.set(Math.sin(p.heading), 0, Math.cos(p.heading));

  // drivetrain
  let accel = 0;
  if (state === 'racing' && !p.finished) {
    if (accelerate) {
      const headroom = clamp(1 - Math.max(fwdSpeed, 0) / PLAYER_MAX_SPEED, 0, 1);
      accel = (onTrack ? 17 : 7) * headroom;
    }
    if (brake) accel = fwdSpeed > 0.8 ? -30 : (fwdSpeed > -13 ? -9 : 0);   // brake, then reverse
  }
  fwdSpeed += accel * dt;

  // resistance: rolling + aero drag, plus heavy grass drag off-track
  fwdSpeed -= fwdSpeed * (0.10 + (onTrack ? 0 : 1.4)) * dt;
  fwdSpeed -= Math.sign(fwdSpeed) * Math.min(Math.abs(fwdSpeed), 0.9 * dt);

  // lateral grip (low while handbraking → drift)
  const grip = handbrake ? 1.6 : (onTrack ? 7.5 : 3.2);
  _lat.multiplyScalar(Math.exp(-grip * dt));

  p.vel.copy(_fwd).multiplyScalar(fwdSpeed).add(_lat);

  // soft barrier: way off the road, get nudged back toward the centerline
  if (Math.abs(p.lateral) > ROAD_HALF + 14) {
    _tmp.copy(lefts[i]).multiplyScalar(-Math.sign(p.lateral));
    p.vel.addScaledVector(_tmp, 26 * dt);
  }

  p.pos.addScaledVector(p.vel, dt);

  // collisions with AI cars: simple sphere push (AI stay on their racing line)
  for (const ai of ais) {
    _tmp.copy(p.pos).sub(ai.group.position);
    _tmp.y = 0;
    const d = _tmp.length();
    if (d > 0.01 && d < 3.1) {
      _tmp.normalize();
      p.pos.addScaledVector(_tmp, 3.1 - d);
      p.vel.addScaledVector(_tmp, 4);
      p.vel.multiplyScalar(0.97);
    }
  }

  // lap counting via start-line crossings (must pass mid-track first)
  if (i > N * 0.45 && i < N * 0.75) p.passedHalf = true;
  const di = i - p._prevIdx;
  if (p._prevIdx !== undefined && di < -N / 2 && p.passedHalf) {   // wrapped forward past line
    p.passedHalf = false;
    p.crossings++;
    p.lastLap = now - p.lapStart;
    p.bestLap = p.bestLap ? Math.min(p.bestLap, p.lastLap) : p.lastLap;
    p.lapStart = now;
    if (p.crossings >= LAPS && !p.finished) finishCar(p);
    else p.lap = p.crossings + 1;
  }
  p._prevIdx = i;
  p.progress = p.crossings + i / N;

  // wrong-way warning
  const movingBackward = p.vel.dot(tangents[i]) < -4;
  ui.wrong.style.display = movingBackward ? 'block' : 'none';

  // visuals
  p.group.position.copy(p.pos);
  p.group.rotation.y = p.heading;
  p.steerVis = lerp(p.steerVis, steer * 0.45, 1 - Math.exp(-10 * dt));
  for (const piv of p.frontPivots) piv.rotation.y = p.steerVis;
  p.wheelSpin += fwdSpeed * dt / 0.42;
  for (const w of p.wheels) w.children.forEach(c => c.rotation.x = p.wheelSpin);
  const latAccel = steer * speedFactor * Math.abs(fwdSpeed) * 0.012;
  p.body.rotation.z = lerp(p.body.rotation.z, -latAccel, 1 - Math.exp(-6 * dt));
  p.body.rotation.x = lerp(p.body.rotation.x, -accel * 0.0035, 1 - Math.exp(-6 * dt));

  updateAudio(Math.abs(fwdSpeed), accelerate && state === 'racing');
  return fwdSpeed;
}

// ---------------------------------------------------------------- AI
function updateAI(ai, dt) {
  const i = Math.floor(((ai.u0 + ai.traveled / trackLen) % 1) * N);

  if (state !== 'countdown') {
    // rubber-banding keeps the pack interesting (finished cars cruise on)
    const gap = player.progress - ai.progress;
    const rubber = ai.finished ? 0.8 : clamp(1 + gap * 0.10, 0.92, 1.12);
    const target = aiSpeedTable[i] * ai.skill * rubber;
    const rate = target > ai.speed ? 11 : 18;
    ai.speed += clamp(target - ai.speed, -rate * dt, rate * dt);
    ai.traveled += ai.speed * dt;
  }

  const P = ai.u0 + ai.traveled / trackLen;
  ai.progress = P;
  if (P >= LAPS && !ai.finished) finishCar(ai);
  ai.lap = Math.min(Math.floor(P) + 1, LAPS);

  const u = P % 1;
  const pos = curve.getPointAt(u);
  const tan = curve.getTangentAt(u);
  tan.y = 0; tan.normalize();
  // gentle lane weaving so the AI don't ride a single rail
  ai.lane = lerp(ai.lane, Math.sin(P * Math.PI * 2 * 3 + ai.lanePhase) * 2.6, 0.02);
  pos.addScaledVector(new THREE.Vector3(tan.z, 0, -tan.x), ai.lane);

  ai.group.position.copy(pos);
  ai.group.rotation.y = Math.atan2(tan.x, tan.z);
  ai.wheelSpin += ai.speed * dt / 0.42;
  for (const w of ai.wheels) w.children.forEach(c => c.rotation.x = ai.wheelSpin);
}

// ---------------------------------------------------------------- camera
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();

function updateCamera(dt, fwdSpeed) {
  const p = player;
  _fwd.set(Math.sin(p.heading), 0, Math.cos(p.heading));
  let desired, look;
  if (cameraMode === 0) {          // chase
    desired = _tmp.copy(p.pos).addScaledVector(_fwd, -9).add(new THREE.Vector3(0, 4, 0));
    look = camLook.copy(p.pos).addScaledVector(_fwd, 7).add(new THREE.Vector3(0, 1.2, 0));
  } else if (cameraMode === 1) {   // hood
    desired = _tmp.copy(p.pos).addScaledVector(_fwd, 0.6).add(new THREE.Vector3(0, 1.55, 0));
    look = camLook.copy(p.pos).addScaledVector(_fwd, 25).add(new THREE.Vector3(0, 1.0, 0));
  } else {                         // overhead
    desired = _tmp.copy(p.pos).add(new THREE.Vector3(0, 60, 0)).addScaledVector(_fwd, -12);
    look = camLook.copy(p.pos);
  }
  const k = cameraMode === 1 ? 1 : 1 - Math.exp(-5.5 * dt);
  camPos.lerp(desired, k);
  camera.position.copy(camPos);
  camera.lookAt(look);
  camera.fov = lerp(camera.fov, 68 + clamp(Math.abs(fwdSpeed) / PLAYER_MAX_SPEED, 0, 1) * 14, 1 - Math.exp(-4 * dt));
  camera.updateProjectionMatrix();

  sun.position.copy(p.pos).add(new THREE.Vector3(70, 110, 40));
  sun.target.position.copy(p.pos);
}

// ---------------------------------------------------------------- minimap
const mapCanvas = document.getElementById('minimap');
const mapCtx = mapCanvas.getContext('2d');
const mapPts = (() => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of samples) {
    minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
    minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
  }
  const pad = 14, W = mapCanvas.width;
  const sc = (W - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  const ox = (W - (maxX - minX) * sc) / 2, oz = (W - (maxZ - minZ) * sc) / 2;
  const toMap = v => [(v.x - minX) * sc + ox, (v.z - minZ) * sc + oz];
  return { toMap, pts: samples.map(toMap) };
})();

function drawMinimap() {
  const ctx = mapCtx, W = mapCanvas.width;
  ctx.clearRect(0, 0, W, W);
  ctx.strokeStyle = 'rgba(255,255,255,.75)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  mapPts.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.stroke();
  for (const car of entrants) {
    const [x, y] = mapPts.toMap(car.isPlayer ? car.pos : car.group.position);
    ctx.fillStyle = '#' + new THREE.Color(car.color).getHexString();
    ctx.beginPath();
    ctx.arc(x, y, car.isPlayer ? 5 : 4, 0, 7);
    ctx.fill();
    if (car.isPlayer) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
  }
}

// ---------------------------------------------------------------- HUD
function updateHUD(fwdSpeed) {
  ui.speed.textContent = Math.round(Math.abs(fwdSpeed) * 3.6);
  ui.lap.textContent = player.finished ? 'FINISHED' : `LAP ${player.lap}/${LAPS}`;
  const ranked = [...entrants].sort((a, b) =>
    (b.finished ? 1e6 - b.finishTime : b.progress) - (a.finished ? 1e6 - a.finishTime : a.progress));
  ui.pos.textContent = `POS ${ranked.indexOf(player) + 1}/${entrants.length}`;
  ui.time.textContent = 'TIME ' + fmtTime(state === 'countdown' ? 0 : now - player.lapStart);
  ui.last.textContent = 'LAST ' + fmtTime(player.lastLap);
  ui.best.textContent = 'BEST ' + fmtTime(player.bestLap);
}

// ---------------------------------------------------------------- adaptive quality
// If the machine can't keep up (weak GPU, software rendering), shed load
// instead of letting the game feel frozen.
let qualityLevel = 0, fpsFrames = 0, fpsTime = 0;
function checkPerformance(rawDt) {
  fpsFrames++;
  fpsTime += rawDt;
  if (fpsTime < 3) return;
  const fps = fpsFrames / fpsTime;
  fpsFrames = 0; fpsTime = 0;
  if (fps >= 28 || qualityLevel >= 2) return;
  qualityLevel++;
  if (qualityLevel === 1) {
    renderer.setPixelRatio(1);
  } else {
    renderer.shadowMap.enabled = false;
    sun.castShadow = false;
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }
  console.warn(`velocity-circuit: low FPS (${fps.toFixed(0)}), reduced quality to level ${qualityLevel}`);
}

// ---------------------------------------------------------------- main loop
let prevT = performance.now();

function frame(t) {
  requestAnimationFrame(frame);
  const rawDt = (t - prevT) / 1000;
  const dt = Math.min(rawDt, 0.05);
  prevT = t;
  checkPerformance(rawDt);

  if (state === 'countdown') {
    countdownT -= dt;
    const n = Math.ceil(countdownT - 0.7);
    ui.count.textContent = countdownT <= 0.7 ? 'GO!' : (n <= 3 ? String(n) : '');
    if (countdownT <= 0) {
      state = 'racing';
      raceStart = performance.now() / 1000;
      now = 0;
      player.lapStart = 0;
      setTimeout(() => { ui.count.textContent = ''; }, 600);
    }
  } else {
    now = performance.now() / 1000 - raceStart;
  }

  const fwdSpeed = updatePlayer(dt);
  for (const ai of ais) updateAI(ai, dt);
  updateCamera(dt, fwdSpeed);
  updateHUD(fwdSpeed);
  drawMinimap();
  renderer.render(scene, camera);
}

startRace();
requestAnimationFrame(frame);

// Test/debug handle (used by the headless smoke test; harmless in normal play).
window.__vc = {
  player, ais, entrants, samples, keys, N, trackLen,
  get state() { return state; },
};
