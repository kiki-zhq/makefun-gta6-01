// SOLMAR HEAT — world: procedural coastal city, player, cars, traffic,
// pedestrians, police + wanted system, a 5-mission story chain, combat,
// particles, and minimap data. All original: fictional Solmar City, no real
// place, person or brand is depicted.
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STREETS = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
const HALF = 185;
const MISSIONS = [
  { title: 'MISSION 1 — BORROWED WHEELS', text: 'Mara needs wheels. Press E near any parked car to borrow it, then drive to the yellow marker at her garage.', target: [120, -120], reward: 150 },
  { title: 'MISSION 2 — THE PACKAGE', text: 'Pick up the package at the north docks, then deliver it to the boardwalk cafe. You have 90 seconds.', target: [-120, 120], reward: 250 },
  { title: 'MISSION 3 — LAY LOW', text: 'The cops saw you. You have 2 stars — break line of sight and stay out of trouble until the heat dies down.', target: null, reward: 200 },
  { title: 'MISSION 4 — VIPER TROUBLE', text: 'Three Vipers are waiting in the alley. Take them down — click to shoot, R to reload. Watch your health.', target: [-40, 80], reward: 300 },
  { title: 'MISSION 5 — OCEAN DRIVE GETAWAY', text: 'Final job. Grab a car, shake the 3-star heat, and reach the beach marker. Then Solmar is yours.', target: [160, 0], reward: 400 },
];

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildingTexture(rng) {
  const base = ['#5a6b7d', '#7d6a5a', '#4d5a6b', '#6b5a7d', '#5d7d6a', '#8a7a5a'][Math.floor(rng() * 6)];
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, w, 10);
    for (let y = 22; y < h - 12; y += 26) {
      for (let x = 12; x < w - 12; x += 24) {
        g.fillStyle = rng() < 0.55 ? '#ffd98a' : (rng() < 0.5 ? '#9fd8ff' : '#2a3644');
        g.fillRect(x, y, 14, 16);
      }
    }
  });
}

function groundTexture() {
  return canvasTexture(1024, 1024, (g, w, h) => {
    const px = (v) => ((v + 210) / 420) * w;
    g.fillStyle = '#4a5058'; // asphalt base
    g.fillRect(0, 0, w, h);
    // sidewalk blocks between streets
    g.fillStyle = '#968d7f';
    for (let i = 0; i < STREETS.length - 1; i += 1) {
      for (let j = 0; j < STREETS.length - 1; j += 1) {
        g.fillRect(px(STREETS[i] + 5), px(STREETS[j] + 5), px(STREETS[i + 1] - 5) - px(STREETS[i] + 5), px(STREETS[j + 1] - 5) - px(STREETS[j] + 5));
      }
    }
    // beach strip + sea on the east edge
    g.fillStyle = '#e8d39a'; g.fillRect(px(168), 0, w - px(168), h);
    g.fillStyle = '#3f9fd8'; g.fillRect(px(196), 0, w - px(196), h);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (let y = 0; y < h; y += 46) g.fillRect(px(196), y, 14, 22);
    // road centre dashes
    g.fillStyle = '#e8c93f';
    for (const s of STREETS) {
      for (let v = -200; v < 200; v += 24) {
        g.fillRect(px(s) - 2, px(v), 4, 12);
        g.fillRect(px(v), px(s) - 2, 12, 4);
      }
    }
    // crosswalks at intersections
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (const sx of STREETS) for (const sz of STREETS) {
      for (let k = -3; k <= 3; k += 1) {
        g.fillRect(px(sx + k * 4) - 2, px(sz - 7), 3, 5);
        g.fillRect(px(sx + k * 4) - 2, px(sz + 3), 3, 5);
      }
    }
  });
}

function makeFigure(color, shirtColor) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.5), mat(shirtColor));
  torso.position.y = 1.35; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), mat(color));
  head.position.y = 2.2; head.castShadow = true; g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 0.4), mat(0x2a2f3a));
  legL.position.set(-0.24, 0.4, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.24; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.9, 0.32), mat(shirtColor));
  armL.position.set(-0.62, 1.35, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.62; g.add(armR);
  g.userData = { legL, legR, armL, armR, head, torso };
  return g;
}

function makeCarMesh(color, police) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 4.2), bodyMat);
  body.position.y = 0.65; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.0), new THREE.MeshLambertMaterial({ color: 0x1a2733 }));
  cabin.position.set(0, 1.25, -0.2); cabin.castShadow = true; g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); g.add(w); wheels.push(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const x of [-0.6, 0.6]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    l.position.set(x, 0.7, 2.12); g.add(l);
  }
  let lightBar = null;
  if (police) {
    const bar = new THREE.Group();
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    r.position.x = -0.35; bar.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    b.position.x = 0.35; bar.add(b);
    bar.position.y = 1.62; g.add(bar); lightBar = bar;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.22), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    stripe.position.y = 0.75; g.add(stripe);
  }
  g.userData.wheels = wheels;
  g.userData.lightBar = lightBar;
  return g;
}

export function createGame() {
  const rng = mulberry32(1337);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87c5e8);
  scene.fog = new THREE.Fog(0x9fc8e8, 120, 420);
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 900);
  camera.position.set(0, 8, 18);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1c8, 1.9);
  sun.position.set(90, 140, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -200; sun.shadow.camera.right = 200;
  sun.shadow.camera.top = 200; sun.shadow.camera.bottom = -200;
  sun.shadow.camera.far = 420;
  scene.add(sun);

  // ---- ground + city ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), new THREE.MeshLambertMaterial({ map: groundTexture() }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);

  const colliders = []; // {x0,z0,x1,z1}
  const winTexs = [buildingTexture(rng), buildingTexture(rng), buildingTexture(rng)];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < STREETS.length - 1; i += 1) {
    for (let j = 0; j < STREETS.length - 1; j += 1) {
      const x0 = STREETS[i] + 6, x1 = STREETS[i + 1] - 6;
      const z0 = STREETS[j] + 6, z1 = STREETS[j + 1] - 6;
      const downtown = Math.abs((x0 + x1) / 2) < 60 && Math.abs((z0 + z1) / 2) < 60;
      const n = downtown ? 1 : (rng() < 0.6 ? 2 : 1);
      for (let k = 0; k < n; k += 1) {
        const w = (x1 - x0) / (n === 1 ? 1 : 2) - 4;
        const d = (z1 - z0) - 4;
        const h = downtown ? 26 + rng() * 42 : 6 + rng() * 18;
        const mat = new THREE.MeshLambertMaterial({ map: winTexs[Math.floor(rng() * 3)] });
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(x0 + w / 2 + 2 + (n === 2 ? k * (w + 4) : 0), h / 2, (z0 + z1) / 2);
        b.castShadow = true; b.receiveShadow = true;
        scene.add(b);
        colliders.push({ x0: b.position.x - w / 2, x1: b.position.x + w / 2, z0: b.position.z - d / 2, z1: b.position.z + d / 2 });
      }
    }
  }
  // palms along the streets
  const palmMat = new THREE.MeshLambertMaterial({ color: 0x7a5a34 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
  for (let i = 0; i < 90; i += 1) {
    const sx = STREETS[Math.floor(rng() * STREETS.length)];
    const sz = -170 + rng() * 340;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 5.5, 6), palmMat);
    trunk.position.set(sx + 7.5, 2.75, sz); trunk.castShadow = true; scene.add(trunk);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(1.9, 8, 6), leafMat);
    leaves.scale.y = 0.45; leaves.position.set(sx + 7.5, 5.8, sz); scene.add(leaves);
  }
  // street lamps
  for (const sx of STREETS) for (const sz of [-140, -60, 20, 100]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6, 6), new THREE.MeshLambertMaterial({ color: 0x333a42 }));
    pole.position.set(sx + 5.6, 3, sz); scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    lamp.position.set(sx + 5.6, 6.1, sz); scene.add(lamp);
  }
  // beach umbrellas on the east edge
  for (let z = -150; z < 170; z += 40) {
    const um = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.1, 8), new THREE.MeshLambertMaterial({ color: 0xff7a5a }));
    um.position.set(182, 2.4, z); scene.add(um);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6), palmMat);
    pole.position.set(182, 1.1, z); scene.add(pole);
  }

  // ---- state ----
  const state = {
    screen: 'title',
    time: 0,
    money: 0,
    health: 100,
    ammo: 12,
    reloading: 0,
    wanted: 0,
    wantedFloat: 0,
    crimeTimer: 99,
    decayTimer: 0,
    missionIndex: 0,
    missionStage: 0,
    missionTimer: 0,
    missionDone: false,
    allDone: false,
    driving: null,
    speed: 0,
    camYaw: Math.PI,
    camPitch: 0.32,
    shake: 0,
    toast: '',
    toastTimer: 0,
    muted: false,
    kills: 0,
    busted: false,
    shotMode: false,
  };

  // ---- player ----
  const player = makeFigure(0xd9a066, 0xff7a1a);
  player.position.set(0, 0, 12);
  scene.add(player);
  const pvel = { x: 0, z: 0, y: 0 };
  let playerHeading = Math.PI;
  let onGround = true;

  // ---- mission marker beacon ----
  const marker = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 30, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 15; marker.add(beam);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.22, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; marker.add(ring);
  marker.visible = false;
  scene.add(marker);

  // ---- health packs ----
  const packs = [];
  for (const [x, z] of [[-60, -60], [60, 60], [-100, -20]]) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x2aff66 }));
    box.position.y = 0.9; g.add(box);
    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.1), new THREE.MeshBasicMaterial({ color: 0x00c853 }));
    cross1.position.set(0, 0.9, 0.58); g.add(cross1);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.1), new THREE.MeshBasicMaterial({ color: 0x00c853 }));
    cross2.position.set(0, 0.9, 0.58); g.add(cross2);
    g.position.set(x, 0, z);
    scene.add(g);
    packs.push({ mesh: g, x, z, taken: false, respawn: 0 });
  }

  // ---- cars ----
  const CAR_COLORS = [0xd83a2e, 0x2e7dd8, 0xe8c93f, 0x37b24d, 0x8a5fd0, 0xe8e8e8, 0x222831, 0xff8c42];
  const cars = [];
  function addCar(x, z, heading, color, opts) {
    const mesh = makeCarMesh(color, opts && opts.police);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = {
      mesh, x, z, heading, speed: 0, steer: 0, color,
      police: !!(opts && opts.police), traffic: !!(opts && opts.traffic),
      parked: !!(opts && opts.parked), axis: (opts && opts.axis) || 'x',
      dir: (opts && opts.dir) || 1, cruise: (opts && opts.cruise) || 8,
      ai: !!(opts && opts.traffic), flash: 0, stuck: 0,
      wait: 0, stopAt: null, // intersection pause state (round-2 traffic fix)
    };
    cars.push(car);
    return car;
  }
  // parked cars (stealable) near the player start
  addCar(6, 20, Math.PI / 2, 0xd83a2e, { parked: true });
  addCar(-8, 30, 0, 0x2e7dd8, { parked: true });
  addCar(30, -6, Math.PI, 0xe8c93f, { parked: true });
  addCar(-30, 6, -Math.PI / 2, 0x37b24d, { parked: true });
  addCar(90, 84, Math.PI / 2, 0x8a5fd0, { parked: true });
  addCar(-90, -84, 0, 0xe8e8e8, { parked: true });
  // traffic
  for (let i = 0; i < 12; i += 1) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const street = STREETS[1 + Math.floor(rng() * (STREETS.length - 2))];
    const along = -160 + rng() * 320;
    const car = addCar(
      axis === 'x' ? along : street + (rng() < 0.5 ? 2.2 : -2.2),
      axis === 'x' ? street + (rng() < 0.5 ? 2.2 : -2.2) : along,
      axis === 'x' ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI),
      CAR_COLORS[i % CAR_COLORS.length],
      { traffic: true, axis, dir: rng() < 0.5 ? 1 : -1, cruise: 6 + rng() * 5 });
    car.speed = car.cruise;
  }
  const policeCars = [];
  function spawnPolice() {
    while (policeCars.length < 3) {
      const a = rng() * Math.PI * 2;
      const px = player.position.x + Math.cos(a) * 55;
      const pz = player.position.z + Math.sin(a) * 55;
      const car = addCar(px, pz, 0, 0x111418, { police: true });
      policeCars.push(car);
    }
  }
  function despawnPolice() {
    for (const c of policeCars) { scene.remove(c.mesh); cars.splice(cars.indexOf(c), 1); }
    policeCars.length = 0;
  }

  // ---- pedestrians ----
  const peds = [];
  const PED_SHIRTS = [0x3fa7d6, 0xd66a9e, 0x7bc47f, 0xe0a458, 0x9b7ede, 0x5a6b7d];
  for (let i = 0; i < 16; i += 1) {
    const fig = makeFigure(0xc98d5f + Math.floor(rng() * 0x302010), PED_SHIRTS[i % PED_SHIRTS.length]);
    const street = STREETS[Math.floor(rng() * STREETS.length)];
    const along = -160 + rng() * 320;
    fig.position.set(street + 4.6, 0, along);
    scene.add(fig);
    peds.push({ mesh: fig, x: fig.position.x, z: fig.position.z, heading: rng() * Math.PI * 2, speed: 1.2 + rng() * 0.8, flee: 0, walkPhase: rng() * 6, street, axis: rng() < 0.5 ? 'x' : 'z' });
  }

  // ---- enemies (missions 4/5) ----
  const enemies = [];
  function spawnEnemies(x, z, n) {
    for (let i = 0; i < n; i += 1) {
      const fig = makeFigure(0x8a5a3a, 0x7a1f2b);
      fig.position.set(x + (rng() - 0.5) * 14, 0, z + (rng() - 0.5) * 14);
      scene.add(fig);
      // strafeDir / strafeTimer / burst: round-2 smarter enemy AI
      enemies.push({ mesh: fig, x: fig.position.x, z: fig.position.z, hp: 3, shootTimer: 1 + rng(), walkPhase: rng() * 6, alive: true, strafeDir: rng() < 0.5 ? 1 : -1, strafeTimer: 1 + rng() * 2, burstLeft: 0 });
    }
  }
  function clearEnemies() {
    for (const e of enemies) scene.remove(e.mesh);
    enemies.length = 0;
  }

  // ---- particles (sparks / smoke) ----
  const P_COUNT = 240;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(P_COUNT * 3);
  const pCol = new Float32Array(P_COUNT * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, opacity: 0.95 }));
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < P_COUNT; i += 1) parts.push({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1 });
  function burst(x, y, z, n, color, spread, up) {
    let made = 0;
    for (const p of parts) {
      if (p.life > 0) continue;
      p.life = 0.5 + rng() * 0.5; p.x = x; p.y = y; p.z = z;
      p.vx = (rng() - 0.5) * spread; p.vy = rng() * up; p.vz = (rng() - 0.5) * spread;
      p.r = ((color >> 16) & 255) / 255; p.g = ((color >> 8) & 255) / 255; p.b = (color & 255) / 255;
      if (++made >= n) break;
    }
  }
  // tracer lines for gunfire — in screenshot mode they linger so the staged
  // mission shot still shows the tracer after the scene settles (round-2 fix).
  const tracers = [];
  function tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 }));
    scene.add(line);
    tracers.push({ line, life: state.shotMode ? 2.5 : 0.09 });
  }

  // ---- collision helpers ----
  function collideCircle(x, z, r) {
    for (const c of colliders) {
      const cx = Math.max(c.x0, Math.min(x, c.x1));
      const cz = Math.max(c.z0, Math.min(z, c.z1));
      const dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.001;
        const push = (r - d) / d;
        return { x: x + dx * push, z: z + dz * push, hit: true };
      }
    }
    return { x, z, hit: false };
  }
  function clampCity(x, z) {
    return { x: Math.max(-HALF, Math.min(HALF, x)), z: Math.max(-HALF, Math.min(HALF, z)) };
  }

  // ---- wanted ----
  function setToast(text) {
    state.toast = text; state.toastTimer = 3.2;
  }
  function addWanted(n, reason) {
    state.wantedFloat = Math.min(5, state.wantedFloat + n);
    state.wanted = Math.ceil(state.wantedFloat);
    state.crimeTimer = 0;
    state.decayTimer = 0;
    if (state.wanted >= 1 && policeCars.length === 0) spawnPolice();
    if (reason) setToast(reason);
  }

  // ---- missions ----
  function missionTarget() {
    const m = MISSIONS[state.missionIndex];
    if (!m) return null;
    if (state.missionIndex === 1) return state.missionStage === 0 ? [-120, 120] : [120, 120];
    return m.target;
  }
  function updateMarker() {
    const t = missionTarget();
    if (t && !state.allDone && state.screen === 'play') {
      marker.visible = true;
      marker.position.set(t[0], 0, t[1]);
    } else marker.visible = false;
  }
  function completeMission() {
    const m = MISSIONS[state.missionIndex];
    state.money += m.reward;
    setToast('MISSION COMPLETE  +$' + m.reward);
    state.missionIndex += 1;
    state.missionStage = 0;
    state.missionTimer = 0;
    if (state.missionIndex >= MISSIONS.length) {
      state.allDone = true;
      setToast('YOU OWN SOLMAR. All missions complete — $' + state.money + ' earned. Free roam!');
    } else if (state.missionIndex === 2) {
      addWanted(2, 'WANTED ★★ — the cops saw the handoff!');
    } else if (state.missionIndex === 4) {
      addWanted(3, 'WANTED ★★★ — getaway time!');
      spawnEnemies(150, -20, 2);
    }
    updateMarker();
  }
  function startMission(idx) {
    state.missionIndex = idx; state.missionStage = 0; state.missionTimer = 0;
    clearEnemies();
    if (idx === 3) spawnEnemies(-40, 80, 3);
    if (idx === 2) addWanted(2);
    updateMarker();
  }

  // ---- shooting ----
  function shoot(audio) {
    if (state.ammo <= 0) { setToast('CLICK — press R to reload'); return; }
    if (state.reloading > 0) return;
    state.ammo -= 1;
    if (audio) audio.gunshot();
    const origin = new THREE.Vector3(player.position.x, player.position.y + 1.6, player.position.z);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    let end = origin.clone().add(dir.clone().multiplyScalar(60));
    let hitEnemy = null;
    for (const e of enemies) {
      if (!e.alive) continue;
      const to = new THREE.Vector3(e.x - origin.x, 0, e.z - origin.z);
      const dist = to.length();
      if (dist > 60) continue;
      to.normalize();
      if (to.dot(dir) > 0.985) { hitEnemy = e; end = new THREE.Vector3(e.x, 1.4, e.z); break; }
    }
    tracer(origin, end);
    burst(end.x, end.y, end.z, 8, 0xffd23f, 4, 3);
    if (hitEnemy) {
      hitEnemy.hp -= 1;
      if (hitEnemy.hp <= 0) {
        hitEnemy.alive = false;
        scene.remove(hitEnemy.mesh);
        state.kills += 1;
        state.money += 25;
        burst(hitEnemy.x, 1.2, hitEnemy.z, 20, 0xff4444, 6, 4);
        setToast('Viper down! +$25');
      }
    }
    addWanted(0.4);
    state.shake = Math.max(state.shake, 0.25);
  }

  // ---- save / load ----
  const SAVE_KEY = 'solmar-heat-save-v1';
  function save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: state.money, missionIndex: state.missionIndex, health: state.health,
        x: player.position.x, z: player.position.z, wanted: state.wantedFloat,
      }));
      setToast('Game saved.');
    } catch { setToast('Save failed — storage blocked.'); }
  }
  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      state.money = s.money || 0;
      state.health = s.health || 100;
      player.position.set(s.x || 0, 0, s.z || 12);
      state.wantedFloat = s.wanted || 0;
      state.wanted = Math.ceil(state.wantedFloat);
      startMission(Math.min(s.missionIndex || 0, MISSIONS.length - 1));
      return true;
    } catch { return false; }
  }
  function hasSave() {
    try { return !!window.localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  // ---- per-frame update ----
  function update(dt, input, audio) {
    state.time += dt;
    if (state.toastTimer > 0) state.toastTimer -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.4);
    if (marker.visible) {
      beam.material.opacity = 0.28 + Math.sin(state.time * 3) * 0.12;
      ring.scale.setScalar(1 + Math.sin(state.time * 3) * 0.12);
    }
    for (const p of packs) {
      if (p.taken) { p.respawn -= dt; if (p.respawn <= 0) { p.taken = false; p.mesh.visible = true; } continue; }
      p.mesh.rotation.y += dt;
      const dx = player.position.x - p.x, dz = player.position.z - p.z;
      if (dx * dx + dz * dz < 4.5 && state.health < 100) {
        state.health = Math.min(100, state.health + 40);
        p.taken = true; p.mesh.visible = false; p.respawn = 45;
        if (audio) audio.chime();
        setToast('+40 HEALTH');
      }
    }
    const driving = state.driving;
    if (!driving) {
      const run = input.shift ? 1 : 0;
      const speed = run ? 10 : 6;
      let mx = 0, mz = 0;
      if (input.forward) mz -= 1;
      if (input.back) mz += 1;
      if (input.left) mx -= 1;
      if (input.right) mx += 1;
      const len = Math.hypot(mx, mz) || 1;
      const sin = Math.sin(state.camYaw), cos = Math.cos(state.camYaw);
      // Camera-relative: W walks away from the camera, D strafes to the
      // camera's right. Forward is (sin yaw, cos yaw); right is (-cos yaw, sin yaw).
      const wx = (-mx * cos - mz * sin) / len * (mx || mz ? 1 : 0);
      const wz = (mx * sin - mz * cos) / len * (mx || mz ? 1 : 0);
      pvel.x += (wx * speed - pvel.x) * Math.min(1, dt * 10);
      pvel.z += (wz * speed - pvel.z) * Math.min(1, dt * 10);
      let nx = player.position.x + pvel.x * dt;
      let nz = player.position.z + pvel.z * dt;
      const col = collideCircle(nx, nz, 0.7);
      nx = col.x; nz = col.z;
      const cl = clampCity(nx, nz);
      player.position.x = cl.x; player.position.z = cl.z;
      if (Math.hypot(pvel.x, pvel.z) > 0.5) playerHeading = Math.atan2(pvel.x, pvel.z);
      player.rotation.y = playerHeading;
      const ph = state.time * (run ? 11 : 8) * (Math.hypot(pvel.x, pvel.z) / speed || 0);
      const u = player.userData;
      u.legL.rotation.x = Math.sin(ph) * 0.7;
      u.legR.rotation.x = -Math.sin(ph) * 0.7;
      u.armL.rotation.x = -Math.sin(ph) * 0.5;
      u.armR.rotation.x = Math.sin(ph) * 0.5;
      player.position.y = Math.abs(Math.sin(ph)) * 0.08 + (onGround ? 0 : player.position.y);
      if (input.jump && onGround) { pvel.y = 8; onGround = false; }
      if (!onGround) {
        pvel.y -= 22 * dt;
        player.position.y += pvel.y * dt;
        if (player.position.y <= 0) { player.position.y = 0; pvel.y = 0; onGround = true; }
      }
      if (input.shoot) shoot(audio);
      if (input.reload && state.ammo < 12 && state.reloading <= 0) { state.reloading = 1.0; }
    } else {
      const car = driving;
      const accel = input.forward ? 16 : (input.back ? -11 : 0);
      if (accel !== 0) car.speed += accel * dt;
      else car.speed += (0 - car.speed) * Math.min(1, dt * 1.2);
      car.speed = Math.max(-9, Math.min(27, car.speed));
      if (Math.abs(car.speed) > 0.5) {
        const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
        car.steer += (steerTarget * 0.55 - car.steer) * Math.min(1, dt * 8);
        car.heading += car.steer * (car.speed / 12) * dt * (car.speed < 0 ? -1 : 1);
      }
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const col = collideCircle(nx, nz, 1.9);
      if (col.hit && Math.abs(car.speed) > 4) {
        burst(car.x, 0.8, car.z, 14, 0xffc23f, 6, 4);
        if (audio) audio.crash();
        state.shake = Math.max(state.shake, 0.5);
        car.speed *= -0.3;
        addWanted(0.2);
      }
      car.x = clampCity(col.x, col.z).x; car.z = clampCity(col.x, col.z).z;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2.4;
      player.position.set(car.x, 0, car.z);
      player.visible = false;
      player.rotation.y = car.heading;
      state.speed = Math.abs(car.speed) * 3.6;
      for (const p of peds) {
        const dx = p.x - car.x, dz = p.z - car.z;
        if (dx * dx + dz * dz < 6 && Math.abs(car.speed) > 3) {
          p.flee = 3;
          addWanted(0.8, 'You hit a pedestrian! ★');
        }
      }
    }
    if (state.reloading > 0) {
      state.reloading -= dt;
      if (state.reloading <= 0) { state.ammo = 12; setToast('Reloaded.'); }
    }
    // ---- traffic AI (round-2: cars pause at intersections) ----
    for (const car of cars) {
      if (!car.traffic) continue;
      const alongPos = car.axis === 'x' ? car.x : car.z;
      // Decide whether to stop at the next intersection: when the car is
      // closing on a cross street, sometimes yield for 1–2.5 s.
      if (car.wait > 0) {
        car.wait -= dt;
      } else {
        for (const s of STREETS) {
          const gap = (s - alongPos) * car.dir;
          if (gap > 2 && gap < 9) {
            if (car.stopAt !== s && rng() < 0.02) { car.wait = 1 + rng() * 1.5; car.stopAt = s; }
            break;
          }
          if (gap <= -6) car.stopAt = null; // passed it; free to stop at the next one
        }
      }
      let slow = car.wait > 0;
      for (const o of cars) {
        if (o === car || !o.traffic) continue;
        if (o.axis !== car.axis) continue;
        const along = car.axis === 'x' ? o.x - car.x : o.z - car.z;
        const side = car.axis === 'x' ? Math.abs(o.z - car.z) : Math.abs(o.x - car.x);
        if (along * car.dir > 0 && along * car.dir < 9 && side < 4) { slow = true; break; }
      }
      const want = slow ? 0 : car.cruise;
      car.speed += (want - car.speed) * Math.min(1, dt * 2);
      if (car.axis === 'x') car.x += car.dir * car.speed * dt;
      else car.z += car.dir * car.speed * dt;
      const pos = car.axis === 'x' ? car.x : car.z;
      if (pos > 175 || pos < -175) {
        car.axis = car.axis === 'x' ? 'z' : 'x';
        car.dir = rng() < 0.5 ? 1 : -1;
        const st = STREETS[1 + Math.floor(rng() * (STREETS.length - 2))];
        if (car.axis === 'x') { car.z = st + 2.2; car.x = car.dir > 0 ? -170 : 170; car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
        else { car.x = st + 2.2; car.z = car.dir > 0 ? -170 : 170; car.heading = car.dir > 0 ? 0 : Math.PI; }
        car.stopAt = null;
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2.4;
    }
    // ---- pedestrians ----
    for (const p of peds) {
      const dxp = player.position.x - p.x, dzp = player.position.z - p.z;
      const d2p = dxp * dxp + dzp * dzp;
      if (d2p < 100 && (state.driving || state.wanted > 0)) p.flee = 2;
      if (p.flee > 0) {
        p.flee -= dt;
        const away = Math.atan2(dxp, dzp) + Math.PI;
        p.x += Math.sin(away) * 5 * dt;
        p.z += Math.cos(away) * 5 * dt;
        p.heading = away;
      } else {
        p.x += Math.sin(p.heading) * p.speed * dt;
        p.z += Math.cos(p.heading) * p.speed * dt;
        if (Math.abs(p.x) > 175 || Math.abs(p.z) > 175 || rng() < 0.002) {
          p.heading = rng() * Math.PI * 2;
        }
      }
      const c = clampCity(p.x, p.z); p.x = c.x; p.z = c.z;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      p.walkPhase += dt * 7;
      p.mesh.userData.legL.rotation.x = Math.sin(p.walkPhase) * 0.5;
      p.mesh.userData.legR.rotation.x = -Math.sin(p.walkPhase) * 0.5;
    }
    // ---- police ----
    if (state.wanted >= 1 && policeCars.length === 0) spawnPolice();
    if (state.wanted === 0 && policeCars.length > 0) despawnPolice();
    let anySiren = false;
    for (const pc of policeCars) {
      anySiren = true;
      const dx = player.position.x - pc.x, dz = player.position.z - pc.z;
      const dist = Math.hypot(dx, dz) || 1;
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - pc.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      // In screenshot mode the cruisers hold their staged line instead of converging.
      if (!state.shotMode) pc.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, dh));
      pc.speed = Math.min(24, pc.speed + 10 * dt);
      const nx = pc.x + Math.sin(pc.heading) * pc.speed * dt;
      const nz = pc.z + Math.cos(pc.heading) * pc.speed * dt;
      const col = collideCircle(nx, nz, 1.9);
      pc.x = clampCity(col.x, col.z).x; pc.z = clampCity(col.x, col.z).z;
      if (col.hit) pc.speed *= 0.5;
      pc.mesh.position.set(pc.x, 0, pc.z);
      pc.mesh.rotation.y = pc.heading;
      pc.flash += dt * 8;
      if (pc.mesh.userData.lightBar) pc.mesh.userData.lightBar.visible = Math.sin(pc.flash) > 0;
      if (dist < 3.2) {
        if (state.driving) {
          state.driving.speed *= 0.6;
          state.shake = Math.max(state.shake, 0.6);
          burst(pc.x, 1, pc.z, 10, 0xffc23f, 5, 3);
          if (audio) audio.crash();
        } else if (state.wanted >= 3) {
          state.busted = true;
        } else {
          state.health -= 12 * dt;
        }
      }
    }
    if (audio) audio.siren(anySiren);
    // ---- wanted decay ----
    state.crimeTimer += dt;
    if (state.wantedFloat > 0 && state.crimeTimer > 18) {
      state.decayTimer += dt;
      if (state.decayTimer > 6) {
        state.decayTimer = 0;
        state.wantedFloat = Math.max(0, state.wantedFloat - 1);
        state.wanted = Math.ceil(state.wantedFloat);
        if (state.wanted === 0) setToast('You lost the cops. Heat is off.');
      }
    }
    // ---- enemies AI (round-2: range-keeping, strafing, burst fire) ----
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = player.position.x - e.x, dz = player.position.z - e.z;
      const dist = Math.hypot(dx, dz) || 1;
      const heading = Math.atan2(dx, dz);
      e.mesh.rotation.y = heading;
      // Hold a fighting range of 10–16: close in when far, back off when
      // crowded, and strafe sideways so the player cannot just stand still.
      let mx = 0, mz = 0;
      if (dist > 16) { mx = Math.sin(heading); mz = Math.cos(heading); }
      else if (dist < 9) { mx = -Math.sin(heading); mz = -Math.cos(heading); }
      e.strafeTimer -= dt;
      if (e.strafeTimer <= 0) { e.strafeDir *= -1; e.strafeTimer = 0.8 + rng() * 1.6; }
      mx += Math.cos(heading) * e.strafeDir * 0.7;
      mz += -Math.sin(heading) * e.strafeDir * 0.7;
      const ml = Math.hypot(mx, mz) || 1;
      const step = (dist > 8 ? 3.4 : 2.2) * dt;
      e.x += (mx / ml) * step;
      e.z += (mz / ml) * step;
      e.walkPhase += dt * 8;
      e.mesh.userData.legL.rotation.x = Math.sin(e.walkPhase) * 0.5;
      e.mesh.userData.legR.rotation.x = -Math.sin(e.walkPhase) * 0.5;
      // Fire in bursts of 2–3 with a variable pause between bursts.
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        if (e.burstLeft <= 0) { e.burstLeft = 2 + Math.floor(rng() * 2); e.shootTimer = 0.9 + rng() * 0.9; }
        else {
          e.burstLeft -= 1;
          e.shootTimer = 0.22;
          tracer(new THREE.Vector3(e.x, 1.5, e.z), new THREE.Vector3(player.position.x, 1.4, player.position.z));
          const hitChance = dist < 26 ? (dist < 12 ? 0.75 : 0.55) : 0.25;
          if (rng() < hitChance) {
            state.health -= 6;
            state.shake = Math.max(state.shake, 0.3);
            burst(player.position.x, 1.4, player.position.z, 6, 0xff5555, 4, 3);
            if (audio) audio.crash();
          }
        }
      }
      e.mesh.position.set(e.x, 0, e.z);
    }
    // ---- mission logic ----
    if (!state.allDone && state.screen === 'play') {
      const m = state.missionIndex;
      const t = missionTarget();
      if (m === 0 && state.driving && t) {
        const dx = player.position.x - t[0], dz = player.position.z - t[1];
        if (dx * dx + dz * dz < 64) completeMission();
      } else if (m === 1) {
        if (state.missionStage === 0) {
          if (state.missionTimer === 0) state.missionTimer = 90;
          const dx = player.position.x - t[0], dz = player.position.z - t[1];
          if (dx * dx + dz * dz < 64) {
            state.missionStage = 1;
            setToast('Package picked up! Deliver to the boardwalk cafe — fast!');
            if (audio) audio.chime();
          }
        } else {
          const dx = player.position.x - t[0], dz = player.position.z - t[1];
          if (dx * dx + dz * dz < 64) completeMission();
        }
        state.missionTimer -= dt;
        if (state.missionTimer <= 0 && state.missionIndex === 1) {
          setToast('Too slow — the package went cold. Try again from the pause menu.');
          startMission(1);
        }
      } else if (m === 2) {
        if (state.wanted === 0) completeMission();
      } else if (m === 3) {
        if (enemies.length > 0 && enemies.every((e) => !e.alive)) completeMission();
        else if (t) {
          const dx = player.position.x - t[0], dz = player.position.z - t[1];
          if (dx * dx + dz * dz < 900 && enemies.length === 0) startMission(3);
        }
      } else if (m === 4) {
        if (t) {
          const dx = player.position.x - t[0], dz = player.position.z - t[1];
          if (dx * dx + dz * dz < 64 && state.driving) completeMission();
        }
      }
    }
    if (state.health <= 0) { state.health = 0; state.busted = true; }
    // ---- particles ----
    for (let i = 0; i < P_COUNT; i += 1) {
      const p = parts[i];
      if (p.life > 0) {
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy -= 6 * dt;
      } else { p.y = -99; }
      pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
      pCol[i * 3] = p.r; pCol[i * 3 + 1] = p.g; pCol[i * 3 + 2] = p.b;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) {
        tracers[i].line.material.opacity = 0;
        scene.remove(tracers[i].line);
        tracers.splice(i, 1);
      }
    }
    updateCamera(dt);
    sun.position.set(player.position.x + 90, 140, player.position.z + 60);
    sun.target.position.set(player.position.x, 0, player.position.z);
    sun.target.updateMatrixWorld();
  }

  function updateCamera(dt) {
    const target = new THREE.Vector3(player.position.x, player.position.y + 2.2, player.position.z);
    const dist = state.driving ? 13 : 9;
    const h = state.driving ? 5 : 3.6;
    const cx = target.x - Math.sin(state.camYaw) * Math.cos(state.camPitch) * dist;
    const cz = target.z - Math.cos(state.camYaw) * Math.cos(state.camPitch) * dist;
    const cy = target.y + Math.sin(state.camPitch) * dist + h * 0.4;
    const k = Math.min(1, dt * 7);
    camera.position.x += (cx - camera.position.x) * k;
    camera.position.y += (cy - camera.position.y) * k;
    camera.position.z += (cz - camera.position.z) * k;
    if (state.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * state.shake * 0.7;
      camera.position.y += (Math.random() - 0.5) * state.shake * 0.7;
    }
    camera.lookAt(target);
    const targetFov = state.driving ? 62 + Math.min(8, Math.abs(state.speed) * 0.2) : 62;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    }
  }

  // ---- car enter / exit ----
  function nearestCar(maxDist) {
    let best = null, bestD = maxDist;
    for (const car of cars) {
      if (car.traffic || car.police) continue;
      const dx = car.x - player.position.x, dz = car.z - player.position.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }
  function enterCar(audio) {
    const car = nearestCar(5);
    if (!car) return false;
    state.driving = car;
    car.parked = false;
    car.speed = 0;
    player.visible = false;
    if (audio) audio.chime();
    if (state.missionIndex === 0) setToast('Borrowed! Now drive to the yellow marker.');
    else setToast('You took the car.');
    addWanted(0.6, 'Car theft — ★');
    return true;
  }
  function exitCar() {
    if (!state.driving) return;
    const car = state.driving;
    car.speed = 0;
    state.driving = null;
    player.visible = true;
    player.position.set(car.x + Math.sin(car.heading + Math.PI / 2) * 2.5, 0, car.z + Math.cos(car.heading + Math.PI / 2) * 2.5);
    state.speed = 0;
  }

  // ---- minimap ----
  function drawMinimap(canvas) {
    const g = canvas.getContext('2d');
    const S = canvas.width;
    const toMap = (v) => ((v + HALF) / (HALF * 2)) * S;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#0d2b40'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#e8d39a'; g.fillRect(toMap(168), 0, S - toMap(168), S);
    g.fillStyle = '#3f9fd8'; g.fillRect(toMap(196), 0, S - toMap(196), S);
    g.strokeStyle = '#5a6672'; g.lineWidth = 5;
    for (const s of STREETS) {
      g.beginPath(); g.moveTo(toMap(s), 0); g.lineTo(toMap(s), S); g.stroke();
      g.beginPath(); g.moveTo(0, toMap(s)); g.lineTo(S, toMap(s)); g.stroke();
    }
    g.strokeStyle = '#e8c93f'; g.lineWidth = 1;
    for (const s of STREETS) {
      g.beginPath(); g.moveTo(toMap(s), 0); g.lineTo(toMap(s), S); g.stroke();
      g.beginPath(); g.moveTo(0, toMap(s)); g.lineTo(S, toMap(s)); g.stroke();
    }
    const t = missionTarget();
    if (t && !state.allDone) {
      g.fillStyle = '#ffd23f';
      g.beginPath(); g.arc(toMap(t[0]), toMap(t[1]), 7, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke();
    }
    for (const car of cars) {
      if (car.police) { g.fillStyle = '#3b82f6'; }
      else if (car.traffic) { g.fillStyle = '#cbd5e1'; }
      else { g.fillStyle = '#f59e0b'; }
      g.beginPath(); g.arc(toMap(car.x), toMap(car.z), car.police ? 4 : 2.5, 0, Math.PI * 2); g.fill();
    }
    for (const p of peds) {
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(toMap(p.x) - 1, toMap(p.z) - 1, 2, 2);
    }
    const px = toMap(player.position.x), pz = toMap(player.position.z);
    g.save();
    g.translate(px, pz);
    g.rotate(Math.atan2(Math.sin(playerHeading), Math.cos(playerHeading)) + Math.PI);
    g.fillStyle = '#ff5a3c';
    g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = '#fff'; g.font = 'bold 11px sans-serif';
    g.fillText('N', S / 2 - 4, 12);
  }

  function reset() {
    state.money = 0; state.health = 100; state.ammo = 12; state.reloading = 0;
    state.wanted = 0; state.wantedFloat = 0; state.crimeTimer = 99; state.decayTimer = 0;
    state.missionIndex = 0; state.missionStage = 0; state.missionTimer = 0;
    state.missionDone = false; state.allDone = false; state.driving = null; state.speed = 0;
    state.busted = false; state.kills = 0;
    player.position.set(0, 0, 12);
    player.visible = true;
    playerHeading = Math.PI;
    pvel.x = 0; pvel.z = 0; pvel.y = 0; onGround = true;
    despawnPolice();
    clearEnemies();
    updateMarker();
  }

  return {
    scene, camera, state, player, cars, peds, enemies, policeCars,
    MISSIONS, update, drawMinimap, enterCar, exitCar, nearestCar,
    addWanted, setToast, completeMission, startMission, missionTarget,
    save, load, hasSave, reset, burst, shoot,
    get objective() {
      if (state.allDone) return { title: 'FREE ROAM', text: 'All missions complete. Explore Solmar, steal cars, dodge the cops.' };
      const m = MISSIONS[state.missionIndex];
      let text = m.text;
      if (state.missionIndex === 1 && state.missionStage === 1) text = 'Package in hand — deliver it to the boardwalk cafe (yellow marker). ' + Math.ceil(state.missionTimer) + 's left!';
      if (state.missionIndex === 1 && state.missionStage === 0 && state.missionTimer > 0) text += ' ' + Math.ceil(state.missionTimer) + 's left!';
      if (state.missionIndex === 3) text += ' Vipers left: ' + enemies.filter((e) => e.alive).length + '.';
      return { title: m.title, text };
    },
  };
}
