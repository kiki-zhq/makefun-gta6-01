// Screenshot scenes behind ?shot=title|driving|police|mission (with &seed=1).
// Each one plays the real rules forward from a fresh world for a fixed number of
// steps with a scripted autopilot, so the frame is what real play looks like and
// the same seed always gives the same frame.
import * as THREE from 'three';

const STEP = 1 / 60;
const IDLE = { forward: false, back: false, left: false, right: false, shift: false, jump: false, shoot: false, reload: false };
const DRIVE = { forward: true, back: false, left: false, right: false, shift: false, jump: false, shoot: false, reload: false };

function runFor(game, seconds, input) {
  for (let i = 0; i < Math.round(seconds / STEP); i += 1) game.update(STEP, input, null);
}

function putPlayerOnStreet(game, x, z, camYaw) {
  game.player.position.set(x, 0, z);
  game.state.camYaw = camYaw;
  game.state.camPitch = 0.32;
}

function putCarOnStreet(game, car, x, z, heading, camYaw) {
  car.x = x; car.z = z; car.heading = heading; car.speed = 0;
  car.mesh.position.set(x, 0, z);
  car.mesh.rotation.y = heading;
  game.state.driving = car;
  game.player.visible = false;
  game.player.position.set(x, 0, z);
  game.state.camYaw = camYaw;
  game.state.camPitch = 0.3;
}

/** Stage `name` on the game and leave it rendered; main.js paints settled frames after. */
export function stageShot(name, game, audio) {
  const state = game.state;
  game.reset();
  state.screen = 'play';

  if (name === 'driving') {
    // Steal the red car, drive north up Ocean Avenue past traffic.
    const car = game.cars[0];
    game.startMission(0);
    putCarOnStreet(game, car, 0, -80, 0, 0);
    // pull a couple of traffic cars into view ahead
    const t1 = game.cars.find((c) => c.traffic);
    if (t1) { t1.x = 2.2; t1.z = -20; t1.axis = 'z'; t1.dir = 1; t1.heading = 0; t1.speed = t1.cruise; }
    const t2 = game.cars.filter((c) => c.traffic)[1];
    if (t2) { t2.x = -2.2; t2.z = -50; t2.axis = 'z'; t2.dir = 1; t2.heading = 0; t2.speed = t2.cruise; }
    runFor(game, 2.5, DRIVE);
    state.wantedFloat = 0; state.wanted = 0;
    return DRIVE;
  }

  if (name === 'police') {
    // 3-star chase: driving fast with two police cars closing in.
    const car = game.cars[0];
    game.startMission(4);
    putCarOnStreet(game, car, 40, -40, 0, 0);
    game.addWanted(3, '');
    // drag the police cars close behind the player
    for (let i = 0; i < game.policeCars.length; i += 1) {
      const pc = game.policeCars[i];
      pc.x = 40 + (i - 1) * 6; pc.z = -70 - i * 8;
      pc.heading = 0; pc.speed = 16;
      pc.mesh.position.set(pc.x, 0, pc.z);
    }
    runFor(game, 2.0, DRIVE);
    // Pull the chase into frame: cruisers flanking the player at the same depth,
    // so they read at full size beside the player's car instead of piling up
    // under the camera.
    const px = game.player.position.x, pz = game.player.position.z;
    for (let i = 0; i < game.policeCars.length; i += 1) {
      const pc = game.policeCars[i];
      pc.x = px + (i === 0 ? -5 : i === 1 ? 5 : 0);
      pc.z = pz + (i === 2 ? -3 : 1);
      pc.heading = 0; pc.speed = 24;
      pc.mesh.position.set(pc.x, 0, pc.z);
      pc.mesh.rotation.y = 0;
    }
    runFor(game, 0.4, DRIVE);
    return DRIVE;
  }

  if (name === 'mission') {
    // Mission 4: on foot in the alley, Vipers ahead, mid-firefight.
    game.startMission(3);
    putPlayerOnStreet(game, -40, 55, 0);
    game.player.rotation.y = 0;
    runFor(game, 1.2, IDLE);
    // Fire the aimed burst LAST, right before the settled frames paint, so
    // the tracer (long-lived in shot mode) is still bright in the final frame.
    const e = game.enemies.find((en) => en.alive);
    if (e) {
      const dir = new THREE.Vector3(e.x - game.player.position.x, 0, e.z - game.player.position.z).normalize();
      game.state.camYaw = Math.atan2(dir.x, dir.z);
      game.shoot(null);
    }
    runFor(game, 0.05, IDLE);
    return IDLE;
  }

  // title (default): street level on foot, looking down Ocean Avenue toward the
  // downtown towers, a parked car and a pedestrian in frame.
  game.startMission(0);
  putPlayerOnStreet(game, 0, 90, Math.PI);
  const ped = game.peds[0];
  if (ped) { ped.x = 4.6; ped.z = 82; ped.mesh.position.set(4.6, 0, 82); }
  runFor(game, 2.0, IDLE);
  return IDLE;
}
