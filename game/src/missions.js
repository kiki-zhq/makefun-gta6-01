// SOLMAR HEAT — mission chain, story, objectives, and shooting.
// Written fresh for this game.
import * as THREE from 'three';
import { clamp, dist2 } from './util.js';

// Five missions. Each: id, name, briefing lines, objective text, target position,
// kind: 'drive' | 'reach' | 'lose' | 'shoot' | 'escape', reward $.
export const MISSIONS = [
  {
    id: 1, name: 'Borrowed Wheels', reward: 150,
    brief: ['Mara: "Rico needs wheels. Borrow that sedan by the pier and bring it to me."', '"Borrow" means take it. Don\'t scratch it. Much.'],
    objective: 'Steal a car and drive to the yellow marker',
    target: { x: 52, z: -52 }, kind: 'drive',
  },
  {
    id: 2, name: 'Hot Delivery', reward: 250,
    brief: ['Mara: "Package in the trunk. The buyer waits at the north marina. 90 seconds."', '"Drive fast. The cops are bored tonight."'],
    objective: 'Deliver the package to the marina in 90 seconds',
    target: { x: -104, z: -156 }, kind: 'drive', timer: 90,
  },
  {
    id: 3, name: 'Heat Check', reward: 300,
    brief: ['Rico: "You made noise. Lose the heat — get to 2 stars, then shake them."', '"Then meet me at the boardwalk. Bring the car."'],
    objective: 'Reach 2 wanted stars, then lose the cops',
    target: { x: 0, z: 156 }, kind: 'lose',
  },
  {
    id: 4, name: 'Turf War', reward: 400,
    brief: ['Mara: "The Vipers took our corner. Clear them out — all four."', '"Watch your health. There is a pack by the alley."'],
    objective: 'Take out the 4 Vipers on the corner',
    target: { x: -52, z: 52 }, kind: 'shoot', enemies: 4,
  },
  {
    id: 5, name: 'The Getaway', reward: 600,
    brief: ['Rico: "Last job. Grab the cash at the tower, then lose a 3-star tail."', '"Do this and Solmar is ours, kid."'],
    objective: 'Grab the cash, then escape the 3-star chase',
    target: { x: 104, z: -104 }, kind: 'escape',
  },
];

export class MissionSys {
  constructor(scene, entities, audio) {
    this.scene = scene;
    this.ent = entities;
    this.audio = audio;
    this.index = 0; // current mission (0-based)
    this.state = 'idle'; // idle | active | done
    this.timer = 0;
    this.stage = 0; // sub-stage within a mission
    this.marker = null;
    this.markerRing = null;
    this.dialogue = [];
    this.dialogueTimer = 0;
    this.objective = '';
    this.cash = null;
    this.healthPack = null;
    this.buildMarker();
  }

  buildMarker() {
    const geo = new THREE.CylinderGeometry(2.2, 2.2, 0.15, 24);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.7 });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.visible = false;
    this.scene.add(this.marker);
    const ringGeo = new THREE.TorusGeometry(2.2, 0.12, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd400 });
    this.markerRing = new THREE.Mesh(ringGeo, ringMat);
    this.markerRing.rotation.x = Math.PI / 2;
    this.markerRing.visible = false;
    this.scene.add(this.markerRing);
    // light beam at the marker
    const beamGeo = new THREE.CylinderGeometry(0.35, 0.35, 40, 8, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.beam.visible = false;
    this.scene.add(this.beam);
  }

  setMarker(x, z, visible) {
    this.marker.position.set(x, 0.2, z);
    this.markerRing.position.set(x, 0.4, z);
    this.beam.position.set(x, 20, z);
    this.marker.visible = visible;
    this.markerRing.visible = visible;
    this.beam.visible = visible;
  }

  startMission(i) {
    const m = MISSIONS[i];
    if (!m) { this.state = 'idle'; this.objective = 'All missions complete — free roam!'; this.setMarker(0, 0, false); return; }
    this.index = i;
    this.state = 'active';
    this.stage = 0;
    this.timer = m.timer || 0;
    this.objective = m.objective;
    this.dialogue = [...m.brief];
    this.dialogueTimer = 0;
    const p = this.ent.player;
    if (m.kind === 'shoot') {
      // spawn the Vipers at the target corner
      for (let k = 0; k < m.enemies; k++) {
        this.ent.spawnEnemy(m.target.x + (k % 2) * 6 - 3, m.target.z + Math.floor(k / 2) * 6 - 3);
      }
      // health pack nearby
      this.spawnHealthPack(m.target.x + 14, m.target.z + 10);
    }
    if (m.kind === 'escape') {
      this.spawnCash(m.target.x, m.target.z);
    }
    this.setMarker(m.target.x, m.target.z, true);
    this.audio.pickup();
  }

  spawnHealthPack(x, z) {
    if (this.healthPack) this.scene.remove(this.healthPack);
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    box.castShadow = true;
    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.1), new THREE.MeshBasicMaterial({ color: 0xe74c3c }));
    cross1.position.z = 0.46;
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.1), new THREE.MeshBasicMaterial({ color: 0xe74c3c }));
    cross2.position.z = 0.46;
    g.add(box, cross1, cross2);
    g.position.set(x, 0.7, z);
    this.scene.add(g);
    this.healthPack = g;
  }

  spawnCash(x, z) {
    if (this.cash) this.scene.remove(this.cash);
    const g = new THREE.Group();
    const bag = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 0.7), new THREE.MeshLambertMaterial({ color: 0x2e7d32 }));
    bag.castShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.2, 0.72), new THREE.MeshBasicMaterial({ color: 0xffd400 }));
    g.add(bag, band);
    g.position.set(x, 0.6, z);
    this.scene.add(g);
    this.cash = g;
  }

  update(dt, time) {
    // marker pulse
    if (this.marker.visible) {
      const s = 1 + Math.sin(time * 3) * 0.12;
      this.marker.scale.set(s, 1, s);
      this.markerRing.position.y = 0.4 + Math.sin(time * 3) * 0.25;
    }
    // dialogue lines, one at a time
    if (this.dialogue.length) {
      this.dialogueTimer += dt;
      if (this.dialogueTimer > 4.5) { this.dialogue.shift(); this.dialogueTimer = 0; }
    }
    // health pack pickup
    const p = this.ent.player;
    if (!p) return;
    if (this.healthPack && dist2(p.x, p.z, this.healthPack.position.x, this.healthPack.position.z) < 4) {
      p.health = 100;
      this.audio.pickup();
      this.ent.burst(this.healthPack.position.x, 1, this.healthPack.position.z, 0x2ecc71, 10, 5);
      this.scene.remove(this.healthPack);
      this.healthPack = null;
    }
    if (this.state !== 'active') return;
    const m = MISSIONS[this.index];
    if (!m) return;
    if (m.timer) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.fail('Out of time.');
        return;
      }
    }
    const d2 = dist2(p.x, p.z, m.target.x, m.target.z);
    if (m.kind === 'drive' || m.kind === 'reach') {
      if (d2 < 36) this.complete();
    } else if (m.kind === 'lose') {
      if (this.stage === 0 && this.ent.wanted >= 2) {
        this.stage = 1;
        this.objective = 'Now lose the cops — stay hidden until stars clear';
      } else if (this.stage === 1 && this.ent.wanted === 0) {
        this.setMarker(m.target.x, m.target.z, true);
        this.objective = 'Heat is off — drive to the boardwalk';
        this.stage = 2;
      } else if (this.stage === 2 && d2 < 36) {
        this.complete();
      }
    } else if (m.kind === 'shoot') {
      const alive = this.ent.enemies.filter((e) => !e.dead).length;
      if (alive === 0) this.complete();
      else this.objective = `Take out the Vipers — ${alive} left`;
    } else if (m.kind === 'escape') {
      if (this.stage === 0 && this.cash && d2 < 9) {
        this.scene.remove(this.cash); this.cash = null;
        p.money += 200;
        this.ent.addWanted(3);
        this.stage = 1;
        this.objective = 'Cash grabbed! Lose the 3-star chase';
        this.audio.horn();
      } else if (this.stage === 1 && this.ent.wanted === 0) {
        this.complete();
      }
    }
  }

  complete() {
    const m = MISSIONS[this.index];
    const p = this.ent.player;
    p.money += m.reward;
    this.audio.pickup();
    this.ent.burst(p.x, 2, p.z, 0xffd400, 18, 8);
    this.dialogue = [`Mission complete: ${m.name} — +$${m.reward}`];
    this.dialogueTimer = 0;
    this.state = 'done';
    this.setMarker(0, 0, false);
    this.index++;
    // auto-start the next mission after a beat
    setTimeout(() => { if (this.state === 'done') this.startMission(this.index); }, 2500);
  }

  fail(reason) {
    const p = this.ent.player;
    this.dialogue = [`Mission failed: ${reason} — try again from the pause menu.`];
    this.dialogueTimer = 0;
    this.state = 'done';
    this.setMarker(0, 0, false);
    this.index = this.index; // retry same mission
    setTimeout(() => { if (this.state === 'done') this.startMission(this.index); }, 3000);
  }

  currentTarget() {
    if (this.state !== 'active') return null;
    const m = MISSIONS[this.index];
    return m ? m.target : null;
  }
}

// Shooting: hitscan pistol from the camera. Returns {enemy, dmg} when an enemy is hit.
export function shootFromCamera(camera, entities, audio) {
  const p = entities.player;
  if (!p || p.reloading > 0 || p.ammo <= 0) return null;
  p.ammo--;
  if (p.ammo === 0) p.reloading = 1.4;
  audio.gunshot();
  // find the enemy closest to the camera ray
  const origin = camera.position.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let best = null, bestT = 60;
  for (const e of entities.enemies) {
    if (e.dead) continue;
    const to = new THREE.Vector3(e.x - origin.x, 1.3 - origin.y, e.z - origin.z);
    const t = to.dot(dir);
    if (t < 1 || t > 60) continue;
    const closest = origin.clone().addScaledVector(dir, t);
    const perp = Math.hypot(closest.x - e.x, closest.y - 1.3, closest.z - e.z);
    if (perp < 1.6 && t < bestT) { best = e; bestT = t; }
  }
  // tracer + muzzle flash
  const end = origin.clone().addScaledVector(dir, best ? bestT : 40);
  entities.burst(end.x, end.y, end.z, 0xffe08a, 4, 2);
  if (best) return { enemy: best, dmg: 34 };
  return null;
}
