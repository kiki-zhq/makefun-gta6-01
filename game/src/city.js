// SOLMAR HEAT — procedural coastal city: streets, blocks, buildings, beach, props.
// Written fresh for this game. Grid: blocks 40, roads 12, pitch 52, streets at
// -156, -104, -52, 0, 52, 104, 156. City spans -162..162; beach south of z=162.
import * as THREE from 'three';
import { mulberry32, clamp } from './util.js';

export const STREETS = [-156, -104, -52, 0, 52, 104, 156];
export const HALF = 162;
export const PITCH = 52;

function facadeTexture(rng, base, lit) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  // subtle vertical shading
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.18)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.06)'); grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 256);
  // window grid: 4 cols x 8 rows
  for (let r = 0; r < 8; r++) {
    for (let col = 0; col < 4; col++) {
      const x = 10 + col * 28, y = 12 + r * 30;
      const on = rng() < lit;
      g.fillStyle = on ? '#ffd98a' : '#1d2733';
      g.fillRect(x, y, 20, 20);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x, y, 20, 3);
    }
  }
  // ground floor storefront
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 232, 128, 24);
  g.fillStyle = '#2b3a4a'; g.fillRect(8, 236, 112, 16);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, seed = 1337) {
  const rng = mulberry32(seed);
  const colliders = [];
  const parkSpots = [];
  const group = new THREE.Group();
  group.name = 'city';

  // Lighting: warm late-afternoon sun + sky.
  const sun = new THREE.DirectionalLight(0xffe3b3, 2.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -200; sun.shadow.camera.right = 200;
  sun.shadow.camera.top = 200; sun.shadow.camera.bottom = -200;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9fc8ff, 0x8a7a5a, 0.9));
  scene.fog = new THREE.Fog(0xcfe4f5, 260, 700);
  scene.background = new THREE.Color(0x9fc8e8);

  // Ground: grass/parks base.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshLambertMaterial({ color: 0x7d9b6a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Roads: dark asphalt strips along every street, both axes.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  for (const s of STREETS) {
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(340, 12), roadMat);
    rx.rotation.x = -Math.PI / 2; rx.position.set(0, 0.02, s); rx.receiveShadow = true;
    group.add(rx);
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(12, 340), roadMat);
    rz.rotation.x = -Math.PI / 2; rz.position.set(s, 0.02, 0); rz.receiveShadow = true;
    group.add(rz);
  }

  // Lane dashes + crosswalks (instanced small white boxes).
  const dashGeo = new THREE.BoxGeometry(0.5, 0.02, 3);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5e9c8 });
  const dashPositions = [];
  for (const s of STREETS) {
    for (let t = -156; t <= 156; t += 13) {
      if (Math.abs(t - s) < 8) continue; // skip intersections
      dashPositions.push([t, s, 0]);       // along x street
      dashPositions.push([s, t, 1]);       // along z street
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashPositions.length);
  const m4 = new THREE.Matrix4();
  dashPositions.forEach(([x, z, rot], i) => {
    m4.makeRotationY(rot ? Math.PI / 2 : 0);
    m4.setPosition(x, 0.045, z);
    dashes.setMatrixAt(i, m4);
  });
  dashes.instanceMatrix.needsUpdate = true;
  group.add(dashes);

  // Sidewalk blocks: light slabs covering each block.
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb9b3a4 });
  const blockCenters = [];
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      const cx = STREETS[i] + 26, cz = STREETS[j] + 26;
      blockCenters.push([cx, cz]);
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), walkMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(cx, 0.015, cz);
      slab.receiveShadow = true;
      group.add(slab);
    }
  }

  // Building facades: 4 variants.
  const variants = [
    facadeTexture(rng, '#8a6f5c', 0.35),
    facadeTexture(rng, '#5c6e7d', 0.4),
    facadeTexture(rng, '#7d7468', 0.3),
    facadeTexture(rng, '#96695a', 0.35),
  ];
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4440 });
  const facadeMats = variants.map((tex) => {
    const side = new THREE.MeshLambertMaterial({ map: tex });
    return [side, side, roofMat, roofMat, side, side];
  });

  // Buildings: 1-3 per block, downtown (center 2x2 blocks) taller.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const [cx, cz] of blockCenters) {
    const downtown = Math.abs(cx) <= 52 && Math.abs(cz) <= 52;
    const n = downtown ? (rng() < 0.5 ? 1 : 2) : (rng() < 0.4 ? 1 : rng() < 0.8 ? 2 : 3);
    for (let k = 0; k < n; k++) {
      const w = 10 + rng() * 14, d = 10 + rng() * 14;
      const ox = (rng() - 0.5) * (40 - w - 4), oz = (rng() - 0.5) * (40 - d - 4);
      const h = downtown ? 26 + rng() * 38 : 8 + rng() * 18;
      const bx = cx + ox, bz = cz + oz;
      const vi = Math.floor(rng() * variants.length);
      const tex = variants[vi].clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, Math.max(1, Math.round(h / 14)));
      const side = new THREE.MeshLambertMaterial({ map: tex });
      const mats = [side, side, roofMat, roofMat, side, side];
      const b = new THREE.Mesh(boxGeo, mats);
      b.scale.set(w, h, d);
      b.position.set(bx, h / 2, bz);
      b.castShadow = true; b.receiveShadow = true;
      group.add(b);
      colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
      // rooftop box (AC unit) for silhouette variety
      if (rng() < 0.6) {
        const ac = new THREE.Mesh(boxGeo, roofMat);
        ac.scale.set(3 + rng() * 3, 1.2, 3 + rng() * 3);
        ac.position.set(bx + (rng() - 0.5) * w * 0.4, h + 0.6, bz + (rng() - 0.5) * d * 0.4);
        group.add(ac);
      }
    }
    // Parked cars along the block edge (on the street side).
    if (rng() < 0.75) {
      const side = Math.floor(rng() * 4);
      const along = STREETS[Math.floor(rng() * STREETS.length)];
      let px, pz, heading;
      if (side === 0) { px = cx + (rng() - 0.5) * 30; pz = cz - 22; heading = rng() < 0.5 ? 0 : Math.PI; }
      else if (side === 1) { px = cx + (rng() - 0.5) * 30; pz = cz + 22; heading = rng() < 0.5 ? 0 : Math.PI; }
      else if (side === 2) { px = cx - 22; pz = cz + (rng() - 0.5) * 30; heading = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2; }
      else { px = cx + 22; pz = cz + (rng() - 0.5) * 30; heading = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2; }
      parkSpots.push({ x: px, z: pz, heading, street: along });
    }
  }

  // Street lamps along the roads.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30343a });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
  for (const s of STREETS) {
    for (let t = -150; t <= 150; t += 26) {
      if (Math.abs(t - s) < 9) continue;
      for (const [lx, lz] of [[t, s + 6.5], [t + 13, s - 6.5]]) {
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(lx, 3, lz);
        group.add(pole);
        const head = new THREE.Mesh(headGeo, lampMat);
        head.position.set(lx, 6.1, lz);
        group.add(head);
      }
    }
  }

  // Palm trees near the beach + a few in parks.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7d44, side: THREE.DoubleSide });
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 7, 6);
  const leafGeo = new THREE.PlaneGeometry(5, 1.6);
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.5; trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.y = 7;
      leaf.rotation.y = (i / 5) * Math.PI * 2;
      leaf.rotation.z = 0.5;
      leaf.translateX(1.8);
      leaf.castShadow = true;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    group.add(g);
  }
  for (let x = -150; x <= 150; x += 18) palm(x + (rng() - 0.5) * 6, 168 + rng() * 6);
  for (let i = 0; i < 10; i++) palm((rng() - 0.5) * 280, (rng() - 0.5) * 280);

  // Beach: sand strip south of the city + water.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 26),
    new THREE.MeshLambertMaterial({ color: 0xe0c98f })
  );
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.01, 175);
  sand.receiveShadow = true;
  group.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 220),
    new THREE.MeshLambertMaterial({ color: 0x2e7fa8 })
  );
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.005, 300);
  group.add(water);
  // Boardwalk edge.
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(340, 0.3, 4),
    new THREE.MeshLambertMaterial({ color: 0x9a7a52 })
  );
  board.position.set(0, 0.15, 163);
  board.receiveShadow = true;
  group.add(board);

  scene.add(group);
  return { colliders, parkSpots, group, sun };
}
