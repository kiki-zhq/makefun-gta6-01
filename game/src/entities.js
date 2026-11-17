// SOLMAR HEAT — entities: player, cars, traffic, pedestrians, police, combat.
// Written fresh for this game.
import * as THREE from 'three';
import { clamp, lerp, angleLerp, angleDiff, collideCircleAABB, dist2, mulberry32 } from './util.js';
import { STREETS, HALF } from './city.js';

const CAR_COLORS = [0xc0392b, 0x2471a3, 0xf1c40f, 0x7d3c98, 0x16a085, 0xe67e22, 0x95a5a6, 0x2c3e50, 0xecf0f1, 0x1abc9c];

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function makePersonMesh(shirt, pants, skin = 0xc68642) {
  const g = new THREE.Group();
  const body = box(0.62, 0.72, 0.36, shirt, 0, 1.12, 0); g.add(body);
  const head = box(0.36, 0.36, 0.36, skin, 0, 1.66, 0); g.add(head);
  const hair = box(0.38, 0.12, 0.38, 0x1c1c1c, 0, 1.86, 0); g.add(hair);
  const legL = box(0.24, 0.72, 0.28, pants, -0.16, 0.36, 0); g.add(legL);
  const legR = box(0.24, 0.72, 0.28, pants, 0.16, 0.36, 0); g.add(legR);
  const armL = box(0.18, 0.62, 0.22, shirt, -0.42, 1.12, 0); g.add(armL);
  const armR = box(0.18, 0.62, 0.22, shirt, 0.42, 1.12, 0); g.add(armR);
  g.userData = { legL, legR, armL, armR, body };
  return g;
}

export function makeCarMesh(color, police = false) {
  const g = new THREE.Group();
  const bodyColor = police ? 0xf2f2f2 : color;
  const body = box(1.9, 0.55, 4.3, bodyColor, 0, 0.55, 0); g.add(body);
  const cabin = box(1.65, 0.5, 2.1, police ? 0x1a1a1a : 0x22303c, 0, 1.05, -0.2); g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [x, z] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.36, z);
    w.castShadow = true;
    g.add(w); wheels.push(w);
  }
  const hl = box(0.32, 0.14, 0.06, 0xfff6c8, -0.6, 0.62, 2.16); g.add(hl);
  const hr = box(0.32, 0.14, 0.06, 0xfff6c8, 0.6, 0.62, 2.16); g.add(hr);
  const tl = box(0.3, 0.14, 0.06, 0xc0392b, -0.6, 0.62, -2.16); g.add(tl);
  const tr = box(0.3, 0.14, 0.06, 0xc0392b, 0.6, 0.62, -2.16); g.add(tr);
  let barR = null, barB = null;
  if (police) {
    barR = box(0.5, 0.16, 0.5, 0xff2222, -0.35, 1.38, -0.2); g.add(barR);
    barB = box(0.5, 0.16, 0.5, 0x2244ff, 0.35, 1.38, -0.2); g.add(barB);
    const door = box(0.02, 0.4, 1.6, 0x1a1a1a, -0.96, 0.6, 0); g.add(door);
    const door2 = box(0.02, 0.4, 1.6, 0x1a1a1a, 0.96, 0.6, 0); g.add(door2);
  }
  g.userData = { wheels, barR, barB };
  return g;
}

export class Entities {
  constructor(scene, city, audio, rng) {
    this.scene = scene;
    this.city = city;
    this.audio = audio;
    this.rng = rng;
    this.colliders = city.colliders;
    this.cars = [];
    this.peds = [];
    this.policeCars = [];
    this.officers = [];
    this.enemies = [];
    this.particles = [];
    this.player = null;
    this.wanted = 0;
    this.wantedTimer = 0;
    this.crimeTimer = 0;
    this.bustedTimer = 0;
    this.spawnPoliceTimer = 0;
  }

  spawnPlayer(x, z) {
    const mesh = makePersonMesh(0x1f8a70, 0x2c3e50);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.player = {
      mesh, x, z, y: 0, vy: 0, heading: 0, speed: 0,
      health: 100, money: 250, ammo: 12, reloading: 0, onFoot: true,
      car: null, lastDamage: -99, walkPhase: 0, grounded: true,
    };
    return this.player;
  }

  spawnCar(x, z, heading, color, kind = 'parked') {
    const mesh = makeCarMesh(color, kind === 'police');
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    this.scene.add(mesh);
    const car = {
      mesh, x, z, heading, speed: 0, steer: 0, color, kind,
      stolen: false, ai: null, hp: 100, wheelSpin: 0,
    };
    if (kind === 'traffic') {
      car.ai = { axis: this.rng() < 0.5 ? 'x' : 'z', dir: this.rng() < 0.5 ? 1 : -1, cruise: 9 + this.rng() * 5, pause: 0 };
      // snap onto nearest street line
      if (car.ai.axis === 'x') { car.z = STREETS[Math.floor(this.rng() * STREETS.length)] + (this.rng() < 0.5 ? 3 : -3); }
      else { car.x = STREETS[Math.floor(this.rng() * STREETS.length)] + (this.rng() < 0.5 ? 3 : -3); }
      mesh.position.set(car.x, 0, car.z);
    }
    this.cars.push(car);
    return car;
  }

  spawnTraffic(n) {
    for (let i = 0; i < n; i++) {
      const s = STREETS[Math.floor(this.rng() * STREETS.length)];
      const t = (this.rng() * 2 - 1) * 150;
      const axisX = this.rng() < 0.5;
      const car = this.spawnCar(axisX ? t : s, axisX ? s : t, axisX ? (this.rng() < 0.5 ? 0 : Math.PI) : (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2), CAR_COLORS[Math.floor(this.rng() * CAR_COLORS.length)], 'traffic');
      car.ai.axis = axisX ? 'x' : 'z';
    }
  }

  spawnParked() {
    for (const spot of this.city.parkSpots) {
      this.spawnCar(spot.x, spot.z, spot.heading, CAR_COLORS[Math.floor(this.rng() * CAR_COLORS.length)], 'parked');
    }
  }

  spawnPed(x, z) {
    const shirts = [0xd35400, 0x8e44ad, 0x2e86c1, 0xca6f1e, 0x7d6608, 0x922b21];
    const mesh = makePersonMesh(shirts[Math.floor(this.rng() * shirts.length)], 0x333333);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const ped = { mesh, x, z, heading: this.rng() * Math.PI * 2, speed: 1.2 + this.rng() * 0.8, tx: x, tz: z, state: 'walk', phase: this.rng() * 6, down: 0 };
    this.peds.push(ped);
    return ped;
  }

  spawnPeds(n) {
    for (let i = 0; i < n; i++) {
      const s = STREETS[Math.floor(this.rng() * STREETS.length)];
      const t = (this.rng() * 2 - 1) * 150;
      const side = this.rng() < 0.5 ? 9 : -9;
      this.spawnPed(t, s + side);
    }
  }

  spawnPoliceCar(x, z) {
    const car = this.spawnCar(x, z, 0, 0xffffff, 'police');
    car.ai = { mode: 'chase' };
    this.policeCars.push(car);
    return car;
  }

  spawnOfficer(x, z) {
    const mesh = makePersonMesh(0x1a2a6c, 0x1a1a1a, 0xc68642);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const o = { mesh, x, z, heading: 0, speed: 6.5, phase: 0 };
    this.officers.push(o);
    return o;
  }

  spawnEnemy(x, z) {
    const mesh = makePersonMesh(0xa93226, 0x1a1a1a, 0xc68642);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const e = { mesh, x, z, heading: 0, hp: 60, shootCd: 1 + this.rng(), phase: this.rng() * 6, dead: false };
    this.enemies.push(e);
    return e;
  }

  addWanted(n) {
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.crimeTimer = 0;
  }

  burst(x, y, z, color, n = 10, speed = 6) {
    const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const mat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vx: (this.rng() - 0.5) * speed, vy: this.rng() * speed * 0.8, vz: (this.rng() - 0.5) * speed,
        life: 0.5 + this.rng() * 0.3,
      });
    }
  }

  collideMove(x, z, r) {
    // returns corrected {x,z} after pushing out of building colliders + city bounds
    let px = clamp(x, -HALF - 20, HALF + 20);
    let pz = clamp(z, -HALF - 20, 195);
    for (const b of this.colliders) {
      if (px < b.minX - r || px > b.maxX + r || pz < b.minZ - r || pz > b.maxZ + r) continue;
      const c = collideCircleAABB(px, pz, r, b);
      if (c) { px = c.x; pz = c.z; }
    }
    return { x: px, z: pz };
  }

  updatePlayer(dt, input, camYaw) {
    const p = this.player;
    if (!p || this.bustedTimer > 0) return;
    p.lastDamage += dt;
    if (p.lastDamage > 5 && p.health < 100) p.health = Math.min(100, p.health + 6 * dt);
    if (p.reloading > 0) {
      p.reloading -= dt;
      if (p.reloading <= 0) p.ammo = 12;
    }

    if (p.onFoot) {
      let fx = 0, fz = 0;
      if (input.forward) { fx -= Math.sin(camYaw); fz -= Math.cos(camYaw); }
      if (input.back) { fx += Math.sin(camYaw); fz += Math.cos(camYaw); }
      if (input.left) { fx -= Math.cos(camYaw); fz += Math.sin(camYaw); }
      if (input.right) { fx += Math.cos(camYaw); fz -= Math.sin(camYaw); }
      const len = Math.hypot(fx, fz);
      const run = input.run ? 1.8 : 1;
      const speed = 5 * run;
      if (len > 0) {
        fx /= len; fz /= len;
        const nx = p.x + fx * speed * dt;
        const nz = p.z + fz * speed * dt;
        const c = this.collideMove(nx, nz, 0.5);
        p.x = c.x; p.z = c.z;
        p.heading = angleLerp(p.heading, Math.atan2(fx, fz), Math.min(1, dt * 12));
        p.walkPhase += dt * speed * 1.6;
      }
      // jump + gravity
      if (input.jump && p.grounded) { p.vy = 7; p.grounded = false; }
      if (!p.grounded) {
        p.vy -= 22 * dt;
        p.y += p.vy * dt;
        if (p.y <= 0) { p.y = 0; p.vy = 0; p.grounded = true; }
      }
      const u = p.mesh.userData;
      const sw = len > 0 ? Math.sin(p.walkPhase) * 0.55 : 0;
      u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
      u.armL.rotation.x = -sw * 0.8; u.armR.rotation.x = sw * 0.8;
      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.rotation.y = p.heading;
    } else if (p.car) {
      this.updateDrive(p.car, dt, input, true);
      p.x = p.car.x; p.z = p.car.z;
      p.heading = p.car.heading;
      p.mesh.visible = false;
      p.mesh.position.set(p.x, 0, p.z);
    }
  }

  updateDrive(car, dt, input, isPlayer) {
    const maxF = isPlayer ? 30 : 15;
    const maxR = 9;
    if (input.forward) car.speed += 20 * dt;
    if (input.back) car.speed -= car.speed > 0.5 ? 32 * dt : 14 * dt;
    if (car.cruise !== undefined) car.speed = lerp(car.speed, car.cruise, Math.min(1, dt * 1.5));
    else if (!input.forward && !input.back) car.speed = lerp(car.speed, 0, Math.min(1, dt * 1.2));
    if (car.speed > 0) car.speed = Math.min(car.speed, maxF);
    if (car.speed < 0) car.speed = Math.max(car.speed, -maxR);
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const steerMax = 0.55 * clamp(1 - Math.abs(car.speed) / 40, 0.35, 1);
    car.steer = lerp(car.steer, steerTarget * steerMax, Math.min(1, dt * 6));
    if (Math.abs(car.speed) > 0.1) {
      car.heading += (car.steer * car.speed * dt) / 3.2 * (car.speed < 0 ? -1 : 1);
    }
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const before = { x: car.x, z: car.z };
    const c = this.collideMove(nx, nz, 1.6);
    const hitWall = Math.abs(c.x - nx) > 0.01 || Math.abs(c.z - nz) > 0.01;
    car.x = c.x; car.z = c.z;
    if (hitWall) {
      if (Math.abs(car.speed) > 6 && isPlayer) {
        this.audio.crash();
        this.burst(car.x, 0.8, car.z, 0xffaa33, 12, 8);
      }
      car.speed *= 0.55;
    }
    // car-car collision (simple push)
    for (const o of this.cars) {
      if (o === car) continue;
      const d2 = dist2(car.x, car.z, o.x, o.z);
      if (d2 < 12.5 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (3.6 - d) / 2;
        const nx2 = (car.x - o.x) / d, nz2 = (car.z - o.z) / d;
        car.x += nx2 * push; car.z += nz2 * push;
        if (o.kind !== 'player') { o.x -= nx2 * push; o.z -= nz2 * push; o.speed *= 0.8; }
        if (Math.abs(car.speed) > 8 && isPlayer) { this.audio.crash(); this.burst(car.x, 0.8, car.z, 0xffcc66, 8, 6); }
        car.speed *= 0.85;
      }
    }
    // hitting pedestrians
    if (isPlayer && Math.abs(car.speed) > 3) {
      for (const ped of this.peds) {
        if (ped.down > 0) continue;
        if (dist2(car.x, car.z, ped.x, ped.z) < 4.5) {
          ped.down = 2.5;
          ped.mesh.rotation.x = -Math.PI / 2;
          this.addWanted(1);
          this.audio.crash();
          this.burst(ped.x, 1, ped.z, 0xff5555, 8, 5);
        }
      }
    }
    car.wheelSpin += car.speed * dt * 2;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    for (const w of car.mesh.userData.wheels) w.rotation.x = car.wheelSpin;
    const front = car.mesh.userData.wheels[0];
    if (front) front.rotation.y = car.steer * 0.5;
    const front2 = car.mesh.userData.wheels[1];
    if (front2) front2.rotation.y = car.steer * 0.5;
    return before;
  }

  updateTraffic(dt) {
    const p = this.player;
    for (const car of this.cars) {
      if (car.kind !== 'traffic') continue;
      const ai = car.ai;
      if (!ai) continue;
      if (ai.pause > 0) { ai.pause -= dt; car.speed = lerp(car.speed, 0, dt * 4); }
      else {
        // slow down if the player is right ahead
        let target = ai.cruise;
        if (p && dist2(car.x, car.z, p.x, p.z) < 100) {
          const dx = p.x - car.x, dz = p.z - car.z;
          const ahead = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
          const side = Math.abs(Math.cos(car.heading) * dx - Math.sin(car.heading) * dz);
          if (ahead > 0 && ahead < 14 && side < 3) target = 0;
        }
        car.speed = lerp(car.speed, target, Math.min(1, dt * 1.5));
        // move along current axis
        let nx = car.x, nz = car.z;
        if (ai.axis === 'x') nx += Math.sin(car.heading) * car.speed * dt;
        else nz += Math.cos(car.heading) * car.speed * dt;
        // heading should match axis+dir
        const wantHeading = ai.axis === 'x' ? (ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ai.dir > 0 ? 0 : Math.PI);
        car.heading = angleLerp(car.heading, wantHeading, Math.min(1, dt * 3));
        const c = this.collideMove(nx, nz, 1.6);
        car.x = c.x; car.z = c.z;
        // at an intersection, maybe turn or pause
        const along = ai.axis === 'x' ? car.x : car.z;
        const nearest = STREETS.reduce((a, b) => (Math.abs(b - along) < Math.abs(a - along) ? b : a));
        if (Math.abs(along - nearest) < 1.2 && this.rng() < dt * 0.9) {
          const roll = this.rng();
          if (roll < 0.3) {
            // turn onto the crossing street
            ai.axis = ai.axis === 'x' ? 'z' : 'x';
            ai.dir = this.rng() < 0.5 ? 1 : -1;
            if (ai.axis === 'x') car.z = nearest; else car.x = nearest;
          } else if (roll < 0.45) {
            ai.pause = 1 + this.rng() * 2;
          }
        }
        // keep inside the city: flip direction at the edge
        if (Math.abs(car.x) > HALF + 6 || Math.abs(car.z) > HALF + 6) ai.dir *= -1;
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    }
  }

  updatePeds(dt, threat) {
    for (const ped of this.peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        if (ped.down <= 0) { ped.mesh.rotation.x = 0; ped.state = 'walk'; }
        continue;
      }
      let tx = ped.tx, tz = ped.tz, sp = ped.speed;
      const dx = threat.x - ped.x, dz = threat.z - ped.z;
      const d2 = dx * dx + dz * dz;
      if (threat.active && d2 < 400) {
        // flee away from the threat
        const d = Math.sqrt(d2) || 1;
        tx = ped.x - (dx / d) * 30; tz = ped.z - (dz / d) * 30;
        sp = 4.5;
        ped.state = 'flee';
      } else if (ped.state === 'flee' && d2 > 900) {
        ped.state = 'walk';
      }
      const mx = tx - ped.x, mz = tz - ped.z;
      const md = Math.hypot(mx, mz);
      if (md < 2) {
        // pick a new sidewalk waypoint
        const s = STREETS[Math.floor(this.rng() * STREETS.length)];
        const t = (this.rng() * 2 - 1) * 150;
        const side = this.rng() < 0.5 ? 9 : -9;
        if (this.rng() < 0.5) { ped.tx = t; ped.tz = s + side; }
        else { ped.tx = s + side; ped.tz = t; }
      } else {
        ped.heading = angleLerp(ped.heading, Math.atan2(mx, mz), Math.min(1, dt * 6));
        const nx = ped.x + Math.sin(ped.heading) * sp * dt;
        const nz = ped.z + Math.cos(ped.heading) * sp * dt;
        const c = this.collideMove(nx, nz, 0.45);
        ped.x = c.x; ped.z = c.z;
        ped.phase += dt * sp * 2.2;
      }
      const u = ped.mesh.userData;
      const sw = Math.sin(ped.phase) * 0.5;
      u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
      u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
    }
  }

  updatePolice(dt) {
    const p = this.player;
    if (!p) return;
    // spawn police cars while wanted
    this.spawnPoliceTimer -= dt;
    if (this.wanted > 0 && this.policeCars.length < this.wanted + 1 && this.spawnPoliceTimer <= 0) {
      this.spawnPoliceTimer = 4;
      const ang = this.rng() * Math.PI * 2;
      const sx = clamp(p.x + Math.sin(ang) * 55, -HALF, HALF);
      const sz = clamp(p.z + Math.cos(ang) * 55, -HALF, HALF);
      this.spawnPoliceCar(sx, sz);
      this.audio.setSiren(true);
    }
    if (this.wanted === 0) {
      this.audio.setSiren(false);
      // police give up and drive off
      for (const car of this.policeCars) {
        car.ai = { mode: 'leave' };
      }
    }
    // wanted decay when no crime recently
    this.crimeTimer += dt;
    if (this.wanted > 0 && this.crimeTimer > 18) {
      this.wantedTimer += dt;
      if (this.wantedTimer > 6) { this.wanted--; this.wantedTimer = 0; this.crimeTimer = 0; }
    }
    // chase
    for (let i = this.policeCars.length - 1; i >= 0; i--) {
      const car = this.policeCars[i];
      const d2 = dist2(car.x, car.z, p.x, p.z);
      if (car.ai && car.ai.mode === 'leave') {
        if (d2 > 120 * 120) {
          this.scene.remove(car.mesh);
          this.cars.splice(this.cars.indexOf(car), 1);
          this.policeCars.splice(i, 1);
          continue;
        }
        // drive away from the player
        const away = Math.atan2(car.x - p.x, car.z - p.z);
        car.heading = angleLerp(car.heading, away, Math.min(1, dt * 2));
        car.speed = lerp(car.speed, 16, dt);
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
      } else {
        const want = Math.atan2(p.x - car.x, p.z - car.z);
        const diff = angleDiff(car.heading, want);
        car.heading += clamp(diff, -1.6 * dt, 1.6 * dt);
        const target = Math.abs(diff) < 0.5 ? 30 : 16;
        car.speed = lerp(car.speed, target, Math.min(1, dt * 0.8));
        const nx = car.x + Math.sin(car.heading) * car.speed * dt;
        const nz = car.z + Math.cos(car.heading) * car.speed * dt;
        const c = this.collideMove(nx, nz, 1.6);
        car.x = c.x; car.z = c.z;
        // ram the player
        if (d2 < 10) {
          if (p.onFoot) {
            p.health -= 25 * dt;
            p.lastDamage = 0;
            if (p.health <= 0) this.playerDown();
          } else if (p.car) {
            p.car.speed *= 0.9;
            p.health -= 4 * dt;
            p.lastDamage = 0;
            if (p.health <= 0) this.playerDown();
          }
        }
      }
      // flashing light bar
      const phase = Math.floor(performance.now() / 180) % 2;
      if (car.mesh.userData.barR) car.mesh.userData.barR.material.color.setHex(phase ? 0xff2222 : 0x550000);
      if (car.mesh.userData.barB) car.mesh.userData.barB.material.color.setHex(phase ? 0x000055 : 0x2244ff);
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    }
    // foot officers when wanted >= 2 and player on foot
    if (this.wanted >= 2 && p.onFoot && this.officers.length < 2 && this.rng() < dt * 0.25) {
      const ang = this.rng() * Math.PI * 2;
      this.spawnOfficer(clamp(p.x + Math.sin(ang) * 25, -HALF, HALF), clamp(p.z + Math.cos(ang) * 25, -HALF, HALF));
    }
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i];
      const d2 = dist2(o.x, o.z, p.x, p.z);
      if (this.wanted === 0 || !p.onFoot) {
        this.scene.remove(o.mesh);
        this.officers.splice(i, 1);
        continue;
      }
      o.heading = angleLerp(o.heading, Math.atan2(p.x - o.x, p.z - o.z), Math.min(1, dt * 5));
      const nx = o.x + Math.sin(o.heading) * o.speed * dt;
      const nz = o.z + Math.cos(o.heading) * o.speed * dt;
      const c = this.collideMove(nx, nz, 0.45);
      o.x = c.x; o.z = c.z;
      o.phase += dt * 9;
      const u = o.mesh.userData;
      u.legL.rotation.x = Math.sin(o.phase) * 0.6; u.legR.rotation.x = -Math.sin(o.phase) * 0.6;
      o.mesh.position.set(o.x, 0, o.z);
      o.mesh.rotation.y = o.heading;
      if (d2 < 2.2) {
        // busted
        this.bustedTimer = 2.5;
        p.money = Math.max(0, p.money - 120);
        this.wanted = 0;
        this.audio.horn();
      }
    }
    if (this.bustedTimer > 0) {
      this.bustedTimer -= dt;
      if (this.bustedTimer <= 0) {
        p.health = 100;
        p.x = 0; p.z = 120; p.y = 0;
        if (p.car) { p.car = null; p.onFoot = true; p.mesh.visible = true; }
        p.mesh.position.set(p.x, 0, p.z);
      }
    }
  }

  playerDown() {
    const p = this.player;
    p.health = 100;
    p.money = Math.max(0, p.money - 50);
    this.wanted = 0;
    p.x = 0; p.z = 140; p.y = 0;
    if (p.car) { p.car = null; p.onFoot = true; p.mesh.visible = true; }
    p.mesh.position.set(p.x, 0, p.z);
    this.burst(p.x, 1.5, p.z, 0xff3333, 16, 7);
  }

  updateEnemies(dt, shootAt) {
    const p = this.player;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) continue;
      e.shootCd -= dt;
      const d2 = dist2(e.x, e.z, p.x, p.z);
      if (d2 < 900 && e.shootCd <= 0) {
        e.shootCd = 1.4 + this.rng() * 1.2;
        // enemy fires: tracer + chance to hit
        this.audio.noiseBurst(0.1, 0.2, 1400);
        if (this.rng() < 0.4) {
          p.health -= 8;
          p.lastDamage = 0;
          this.burst(p.x, 1.4, p.z, 0xff5555, 6, 4);
          if (p.health <= 0) this.playerDown();
        }
      }
      // enemies hold position and face the player
      e.heading = angleLerp(e.heading, Math.atan2(p.x - e.x, p.z - e.z), Math.min(1, dt * 4));
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = e.heading;
      if (shootAt && shootAt.enemy === e) {
        e.hp -= shootAt.dmg;
        this.burst(e.x, 1.3, e.z, 0xffdd55, 8, 5);
        if (e.hp <= 0) {
          e.dead = true;
          e.mesh.rotation.x = -Math.PI / 2;
          e.mesh.position.y = 0.3;
          p.money += 40;
        }
      }
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.scene.remove(pt.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      pt.vy -= 12 * dt;
      pt.mesh.position.x += pt.vx * dt;
      pt.mesh.position.y += pt.vy * dt;
      pt.mesh.position.z += pt.vz * dt;
      if (pt.mesh.position.y < 0.05) pt.mesh.position.y = 0.05;
    }
  }

  nearestCar(x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const car of this.cars) {
      if (car.kind === 'police') continue;
      const d2 = dist2(x, z, car.x, car.z);
      if (d2 < bd) { bd = d2; best = car; }
    }
    return best;
  }
}
