// SOLMAR HEAT — boot, loop, input, HUD and screens.
// ?shot=title|driving|police|mission&seed=1 stages a deterministic scene instead of
// running the loop, renders it, and sets window.__shotReady for screenshots.
import * as THREE from 'three';
import { createGame } from './world.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const hud = document.getElementById('hud');
const titleEl = document.getElementById('title');
const pauseEl = document.getElementById('pause');
const deadEl = document.getElementById('dead');
const starsEl = document.getElementById('stars');
const healthFill = document.getElementById('healthfill');
const hpText = document.getElementById('hptext');
const ammoEl = document.getElementById('ammo');
const moneyEl = document.getElementById('money');
const minimap = document.getElementById('minimap');
const objectiveEl = document.getElementById('objective');
const objTitle = document.getElementById('objtitle');
const objText = document.getElementById('objtext');
const speedEl = document.getElementById('speed');
const toastEl = document.getElementById('toast');
const hintEl = document.getElementById('hint');
const crosshairEl = document.getElementById('crosshair');
const vignetteEl = document.getElementById('vignette');

const audio = createAudio();
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  window.__shotError = 'WebGL unavailable: ' + e.message;
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const game = createGame();
const state = game.state;
window.__game = game; // debug handle (camera/player inspection)

const input = {
  forward: false, back: false, left: false, right: false,
  shift: false, jump: false, shoot: false, reload: false,
};
const keys = {};
let dragging = false;
let lastPX = 0, lastPY = 0;

function announce(msg) { status.textContent = msg; }

function setScreen(name) {
  state.screen = name;
  titleEl.classList.toggle('hidden', name !== 'title');
  pauseEl.classList.toggle('hidden', name !== 'paused');
  deadEl.classList.toggle('hidden', name !== 'dead');
  hud.classList.toggle('hidden', name === 'title' && !shot);
}

function startNewGame() {
  game.reset();
  game.startMission(0);
  audio.unlock();
  audio.startMusic();
  setScreen('play');
  announce('Playing SOLMAR HEAT. Mission 1: borrow a car.');
  audio.click();
}
function continueGame() {
  game.reset();
  if (game.load()) {
    audio.unlock();
    audio.startMusic();
    setScreen('play');
    announce('Continued your saved game.');
  } else {
    startNewGame();
  }
  audio.click();
}

document.getElementById('btnNew').addEventListener('click', startNewGame);
document.getElementById('btnContinue').addEventListener('click', continueGame);
document.getElementById('btnResume').addEventListener('click', () => { setScreen('play'); audio.click(); });
document.getElementById('btnRestart').addEventListener('click', () => {
  game.startMission(state.missionIndex);
  state.health = 100; state.wantedFloat = 0; state.wanted = 0;
  setScreen('play'); audio.click();
});
document.getElementById('btnSave').addEventListener('click', () => { game.save(); audio.click(); });
document.getElementById('btnTitle').addEventListener('click', () => { setScreen('title'); audio.click(); });
document.getElementById('btnRespawn').addEventListener('click', () => {
  state.money = Math.max(0, state.money - 100);
  state.health = 100; state.wantedFloat = 0; state.wanted = 0; state.busted = false;
  game.player.position.set(0, 0, 12);
  if (state.driving) game.exitCar();
  setScreen('play'); audio.click();
});
document.getElementById('btnDeadTitle').addEventListener('click', () => { setScreen('title'); audio.click(); });
document.getElementById('btnContinue').disabled = !game.hasSave();

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  keys[event.code] = true;
  audio.unlock();
  if (event.code === 'Escape') {
    if (state.screen === 'play') {
      setScreen('paused');
      document.getElementById('missionlist').innerHTML = game.MISSIONS.map((m, i) =>
        `<div>${i === state.missionIndex ? '▶ ' : ''}${i < state.missionIndex ? '✓ ' : ''}${m.title} — $${m.reward}</div>`).join('');
    } else if (state.screen === 'paused') setScreen('play');
    return;
  }
  if (state.screen !== 'play') return;
  if (event.code === 'KeyE') {
    if (state.driving) game.exitCar();
    else game.enterCar(audio);
  } else if (event.code === 'KeyM') {
    state.muted = audio.toggleMute();
    game.setToast(state.muted ? 'Sound off (M to turn on)' : 'Sound on');
  } else if (event.code === 'KeyR') {
    input.reload = true;
  } else if (event.code === 'KeyF') {
    input.shoot = true;
  } else if (event.code === 'KeyH') {
    state.crimeTimer = 99;
    game.setToast('Laying low… stay out of sight and the heat fades.');
  }
});
window.addEventListener('keyup', (event) => { keys[event.code] = false; });
window.addEventListener('blur', () => {
  for (const k of Object.keys(keys)) keys[k] = false;
  input.forward = input.back = input.left = input.right = input.shift = false;
});
canvas.addEventListener('pointerdown', (event) => {
  audio.unlock();
  if (state.screen === 'play') {
    dragging = true; lastPX = event.clientX; lastPY = event.clientY;
    if (!state.driving) input.shoot = true;
  }
});
window.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  state.camYaw -= (event.clientX - lastPX) * 0.005;
  state.camPitch = Math.max(-0.1, Math.min(0.9, state.camPitch + (event.clientY - lastPY) * 0.004));
  lastPX = event.clientX; lastPY = event.clientY;
});
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('resize', () => {
  game.camera.aspect = window.innerWidth / window.innerHeight;
  game.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function readInput() {
  input.forward = !!(keys.KeyW || keys.ArrowUp);
  input.back = !!(keys.KeyS || keys.ArrowDown);
  input.left = !!(keys.KeyA || keys.ArrowLeft);
  input.right = !!(keys.KeyD || keys.ArrowRight);
  input.shift = !!keys.ShiftLeft || !!keys.ShiftRight;
  input.jump = !!keys.Space;
}

function updateHud() {
  let stars = '';
  for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '<span class="off">☆</span>';
  starsEl.innerHTML = stars;
  healthFill.style.width = state.health + '%';
  healthFill.style.background = state.health > 50 ? 'linear-gradient(90deg,#37d67a,#a8e063)' : (state.health > 25 ? 'linear-gradient(90deg,#e8a13f,#ffd23f)' : 'linear-gradient(90deg,#e5534b,#ff8a7a)');
  hpText.textContent = Math.ceil(state.health);
  ammoEl.textContent = state.reloading > 0 ? '…' : state.ammo;
  moneyEl.textContent = '$ ' + state.money.toLocaleString('en-US');
  const obj = game.objective;
  objectiveEl.classList.remove('hidden');
  objTitle.textContent = obj.title;
  objText.textContent = obj.text;
  if (state.driving) {
    speedEl.classList.remove('hidden');
    speedEl.innerHTML = Math.round(state.speed) + '<small>km/h</small>';
  } else {
    speedEl.classList.add('hidden');
  }
  toastEl.textContent = state.toastTimer > 0 ? state.toast : '';
  crosshairEl.style.display = state.screen === 'play' && !state.driving ? 'block' : 'none';
  vignetteEl.style.opacity = state.health < 35 ? String((35 - state.health) / 35 * 0.9) : '0';
  hintEl.style.opacity = state.driving ? '0.6' : '0.85';
  game.drawMinimap(minimap);
  if (audio && state.screen === 'play') audio.setEngine(state.driving ? Math.abs(state.speed) / 100 : 0, !!state.driving);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  if (state.screen === 'title') {
    state.camYaw += dt * 0.05;
    readInput();
    game.update(dt, { forward: false, back: false, left: false, right: false, shift: false, jump: false, shoot: false, reload: false }, null);
  } else if (state.screen === 'play') {
    readInput();
    game.update(dt, input, audio);
    input.shoot = false;
    input.reload = false;
    if (state.busted) {
      state.busted = false;
      document.getElementById('deadtext').textContent = state.health <= 0
        ? 'You got wasted in the streets of Solmar. Mara posts your bail — $100.'
        : 'The Solmar PD hauled you in. Mara posts your bail — $100.';
      setScreen('dead');
      announce('Busted. Try again.');
    }
    updateHud();
  }
  renderer.render(game.scene, game.camera);
}

let last = performance.now();

if (shot) {
  // Screenshot mode: stage the scene, render settled frames, then signal readiness.
  titleEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  deadEl.classList.add('hidden');
  hud.classList.remove('hidden');
  try {
    state.shotMode = true;
    const shotInput = stageShot(shot, game, audio);
    state.screen = 'play';
    updateHud();
    let frames = 0;
    (function paintShot() {
      game.update(STEP, shotInput || { forward: false, back: false, left: false, right: false, shift: false, jump: false, shoot: false, reload: false }, null);
      renderer.render(game.scene, game.camera);
      updateHud();
      frames += 1;
      if (frames < 40) requestAnimationFrame(paintShot);
      else window.__shotReady = true;
    })();
  } catch (e) {
    window.__shotError = String(e && e.stack || e);
  }
} else {
  setScreen('title');
  announce('SOLMAR HEAT. Press New Game to start.');
  requestAnimationFrame(frame);
}
