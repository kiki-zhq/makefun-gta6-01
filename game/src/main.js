// SOLMAR HEAT — bootstrap, game loop, input, camera, save/load.
// Written fresh for this game.
import * as THREE from 'three';
import { buildCity } from './city.js';
import { AudioSys } from './audio.js';
import { Entities } from './entities.js';
import { MissionSys, MISSIONS, shootFromCamera } from './missions.js';
import { HUD } from './hud.js';
import { applyShot } from './shots.js';
import { mulberry32, hashSeed, clamp, damp, angleLerp } from './util.js';

const SAVE_KEY = 'solmar-heat-save-v1';

export class Game {
  constructor() {
    const params = new URLSearchParams(location.search);
    this.shot = params.get('shot') || null;
    this.seed = params.get('seed') ? hashSeed(params.get('seed')) : 20261118;
    this.rng = mulberry32(this.seed);
    this.mode = 'title'; // title | playing | paused
    this.time = 0;
    this.camYaw = 0.6;
    this.camPitch = 0.35;
    this.camDist = 8;
    this.shake = 0;
    this.shootCd = 0;
    this._shotFired = false;
    this._wanted = 0;
    this._crimeTimer = 0;
    this.input = { forward: false, back: false, left: false, right: false, run: false, jump: false };
    this.dragging = false;
    this.lastX = 0; this.lastY = 0;
  }

  // Proxies to the entities module (which owns wanted/cars/enemies).
  get wanted() { return this.ent ? this.ent.wanted : this._wanted; }
  set wanted(v) { if (this.ent) this.ent.wanted = v; else this._wanted = v; }
  get crimeTimer() { return this.ent ? this.ent.crimeTimer : this._crimeTimer; }
  set crimeTimer(v) { if (this.ent) this.ent.crimeTimer = v; else this._crimeTimer = v; }
  get bustedTimer() { return this.ent ? this.ent.bustedTimer : 0; }
  get cars() { return this.ent ? this.ent.cars : []; }
  get enemies() { return this.ent ? this.ent.enemies : []; }

  init() {
    // Renderer / scene / camera.
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
    this.camera.position.set(10, 6, 20);

    this.city = buildCity(this.scene, this.seed);
    this.audio = new AudioSys();
    this.ent = new Entities(this.scene, this.city, this.audio, this.rng);
    this.player = this.ent.spawnPlayer(0, 60);
    this.ent.spawnParked();
    this.ent.spawnTraffic(10);
    this.ent.spawnPeds(16);
    this.missions = new MissionSys(this.scene, this.ent, this.audio);
    this.hud = new HUD();
    this.missions.objective = 'Press ENTER or click New Game to start';
    this.wanted = 0;

    this.bindInput();
    this.buildMenus();
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    // Screenshot staging: deterministic scene, HUD on.
    if (this.shot) {
      this.audio.ensure();
      const ok = applyShot(this.shot, this);
      if (!ok) this.mode = 'playing';
      // settle a few frames then freeze the moment for the screenshot
      this.settleFrames = 90;
    }
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---- helpers used by shots.js ----
  nearestDriveable(x, z) {
    let best = this.ent.nearestCar(x, z, 40);
    if (!best) {
      best = this.ent.spawnCar(x, z, 0, 0xc0392b, 'parked');
    }
    return best;
  }

  spawnPoliceBehind(dx, dz) {
    const p = this.player;
    return this.ent.spawnPoliceCar(p.x + dx, p.z + dz);
  }

  hideTitle() {
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
  }

  showTitle() {
    document.getElementById('title-screen').style.display = 'flex';
    document.getElementById('hud').style.display = 'none';
  }

  // ---- menus ----
  buildMenus() {
    const save = this.loadSave();
    document.getElementById('btn-continue').style.display = save ? 'inline-block' : 'none';
    document.getElementById('btn-new').onclick = () => {
      this.audio.ensure(); this.audio.startMusic(); this.audio.click();
      this.hideTitle();
      this.mode = 'playing';
      this.missions.startMission(0);
      this.hud.showToast('Welcome to Solmar. Mara is waiting — check the yellow marker.', 5);
    };
    document.getElementById('btn-continue').onclick = () => {
      this.audio.ensure(); this.audio.startMusic(); this.audio.click();
      this.applySave(save);
      this.hideTitle();
      this.mode = 'playing';
      this.missions.startMission(save.mission || 0);
      this.hud.showToast('Welcome back to Solmar.', 4);
    };
    document.getElementById('btn-resume').onclick = () => this.togglePause(false);
    document.getElementById('btn-save').onclick = () => {
      this.saveGame();
      this.audio.click();
      this.hud.showToast('Progress saved.', 3);
    };
    document.getElementById('btn-mute').onclick = () => {
      const m = this.audio.toggleMute();
      document.getElementById('btn-mute').textContent = m ? 'Unmute (M)' : 'Mute (M)';
    };
    document.getElementById('btn-restart-mission').onclick = () => {
      this.togglePause(false);
      this.missions.startMission(this.missions.index);
    };
    // mission select buttons
    const list = document.getElementById('mission-list');
    list.innerHTML = '';
    MISSIONS.forEach((m, i) => {
      const b = document.createElement('button');
      b.textContent = `${i + 1}. ${m.name} — $${m.reward}`;
      b.onclick = () => {
        this.togglePause(false);
        this.audio.ensure(); this.audio.click();
        this.missions.startMission(i);
      };
      list.appendChild(b);
    });
  }

  togglePause(force) {
    if (this.mode === 'title') return;
    const toPause = force !== undefined ? force : this.mode === 'playing';
    this.mode = toPause ? 'paused' : 'playing';
    document.getElementById('pause-menu').style.display = toPause ? 'flex' : 'none';
    if (toPause) this.saveGame();
  }

  saveGame() {
    const p = this.player;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: p.money, mission: this.missions.index,
        x: p.x, z: p.z, wanted: this.ent.wanted,
      }));
    } catch { /* storage unavailable */ }
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  applySave(save) {
    const p = this.player;
    p.money = save.money ?? 250;
    p.x = save.x ?? 0; p.z = save.z ?? 60;
    p.mesh.position.set(p.x, 0, p.z);
    this.ent.wanted = save.wanted ?? 0;
  }

  // ---- input ----
  bindInput() {
    const key = (code) => {
      switch (code) {
        case 'KeyW': case 'ArrowUp': return 'forward';
        case 'KeyS': case 'ArrowDown': return 'back';
        case 'KeyA': case 'ArrowLeft': return 'left';
        case 'KeyD': case 'ArrowRight': return 'right';
        case 'ShiftLeft': case 'ShiftRight': return 'run';
        case 'Space': return 'jump';
        default: return null;
      }
    };
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { this.togglePause(); return; }
      if (e.code === 'KeyM') { this.audio.toggleMute(); return; }
      if (e.code === 'KeyR') { if (this.player.ammo === 0) this.player.reloading = 1.4; return; }
      if (e.code === 'KeyE') { this.tryEnterExitCar(); return; }
      if (e.code === 'KeyF') { this.tryShoot(); return; }
      if (e.code === 'Enter' && this.mode === 'title') { document.getElementById('btn-new').click(); return; }
      const k = key(e.code);
      if (k) { this.input[k] = true; if (e.code === 'Space') e.preventDefault(); }
    });
    addEventListener('keyup', (e) => {
      const k = key(e.code);
      if (k) this.input[k] = false;
    });
    const cv = this.renderer.domElement;
    cv.addEventListener('mousedown', (e) => {
      this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY;
      if (this.mode === 'playing') this.tryShoot();
    });
    addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.camYaw -= (e.clientX - this.lastX) * 0.005;
      this.camPitch = clamp(this.camPitch + (e.clientY - this.lastY) * 0.004, -0.1, 1.1);
      this.lastX = e.clientX; this.lastY = e.clientY;
    });
    addEventListener('mouseup', () => { this.dragging = false; });
    cv.addEventListener('wheel', (e) => {
      this.camDist = clamp(this.camDist + e.deltaY * 0.01, 5, 16);
      e.preventDefault();
    }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  tryEnterExitCar() {
    if (this.mode !== 'playing') return;
    const p = this.player;
    if (p.onFoot) {
      const car = this.ent.nearestCar(p.x, p.z, 4);
      if (!car) return;
      p.car = car; p.onFoot = false; p.mesh.visible = false;
      car.kind = 'player';
      car.cruise = undefined;
      if (car.ai) { car.ai = null; }
      if (!car.stolen) {
        car.stolen = true;
        this.ent.addWanted(1);
        this.hud.showToast('Car stolen! +1 wanted star', 3);
        this.audio.horn();
      }
      this.audio.click();
    } else if (p.car) {
      const car = p.car;
      const sx = car.x + Math.sin(car.heading + Math.PI / 2) * 2.5;
      const sz = car.z + Math.cos(car.heading + Math.PI / 2) * 2.5;
      const c = this.ent.collideMove(sx, sz, 0.5);
      p.x = c.x; p.z = c.z; p.y = 0;
      p.car = null; p.onFoot = true; p.mesh.visible = true;
      p.mesh.position.set(p.x, 0, p.z);
      p.heading = car.heading;
      this.audio.click();
    }
  }

  tryShoot() {
    if (this.mode !== 'playing') return;
    const p = this.player;
    if (!p.onFoot || this.shootCd > 0) return;
    this.shootCd = 0.28;
    this._shotFired = true;
    const hit = shootFromCamera(this.camera, this.ent, this.audio);
    if (hit) this.ent.updateEnemies(0, hit);
    this.shake = Math.max(this.shake, 0.12);
  }

  // ---- camera ----
  updateCamera(dt) {
    const p = this.player;
    let tx, tz, ty, lookX, lookZ, lookY;
    if (p.car) {
      const car = p.car;
      const back = 10;
      tx = car.x - Math.sin(car.heading) * back;
      tz = car.z - Math.cos(car.heading) * back;
      ty = 4.2;
      lookX = car.x + Math.sin(car.heading) * 6;
      lookZ = car.z + Math.cos(car.heading) * 6;
      lookY = 1.4;
      // keep the camera heading aligned with the car when driving
      this.camYaw = angleLerp(this.camYaw, car.heading + Math.PI, Math.min(1, dt * 1.2));
    } else {
      const dist = this.camDist;
      tx = p.x + Math.sin(this.camYaw) * dist * Math.cos(this.camPitch);
      tz = p.z + Math.cos(this.camYaw) * dist * Math.cos(this.camPitch);
      ty = 1.6 + Math.sin(this.camPitch) * dist;
      lookX = p.x; lookZ = p.z; lookY = 1.5;
    }
    // keep camera out of buildings (simple: lift it)
    for (const b of this.city.colliders) {
      if (tx > b.minX - 0.5 && tx < b.maxX + 0.5 && tz > b.minZ - 0.5 && tz < b.maxZ + 0.5) {
        ty = Math.max(ty, 8);
      }
    }
    ty = Math.max(ty, 0.8);
    const k = 1 - Math.exp(-dt * 7);
    this.camera.position.x += (tx - this.camera.position.x) * k;
    this.camera.position.y += (ty - this.camera.position.y) * k;
    this.camera.position.z += (tz - this.camera.position.z) * k;
    if (this.shake > 0) {
      this.shake -= dt;
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.camera.lookAt(lookX, lookY, lookZ);
    // speed FOV kick
    const speed = p.car ? Math.abs(p.car.speed) : 0;
    const targetFov = 62 + clamp(speed / 30, 0, 1) * 10;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = damp(this.camera.fov, targetFov, 4, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  // ---- main loop ----
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    this.shootCd = Math.max(0, this.shootCd - dt);
    if (this.mode === 'playing') {
      const p = this.player;
      this.ent.updatePlayer(dt, this.input, this.camYaw);
      this.ent.updateTraffic(dt);
      const threat = { x: p.x, z: p.z, active: (p.car && Math.abs(p.car.speed) > 8) || this._shotFired };
      this._shotFired = false;
      this.ent.updatePeds(dt, threat);
      this.ent.updatePolice(dt);
      this.ent.updateEnemies(dt, null);
      this.ent.updateParticles(dt);
      this.missions.update(dt, this.time);
      this.audio.update(dt);
      const speed01 = p.car ? clamp(Math.abs(p.car.speed) / 30, 0, 1) : 0;
      this.audio.setEngine(speed01, !!p.car);
      this.hud.update(dt, this);
      if (this.settleFrames !== undefined) {
        if (this.settleFrames > 0) this.settleFrames--;
      }
    }
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

new Game().init();
