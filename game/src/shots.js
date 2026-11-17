// SOLMAR HEAT — deterministic screenshot staging via ?shot=<name>&seed=1.
// Each shot places the player/camera and sets game state so the render is reproducible.
import { STREETS } from './city.js';

export function applyShot(name, g) {
  const p = g.player;
  if (!p) return false;
  // All shots run in 'playing' mode with the HUD on.
  g.mode = 'playing';
  g.hideTitle();
  const placeOnFoot = (x, z, heading, camYaw) => {
    if (p.car) { p.car = null; p.onFoot = true; p.mesh.visible = true; }
    p.x = x; p.z = z; p.y = 0; p.heading = heading;
    p.mesh.position.set(x, 0, z);
    p.mesh.rotation.y = heading;
    g.camYaw = camYaw; g.camPitch = 0.32;
  };
  const placeInCar = (car, heading, camYaw) => {
    p.car = car; p.onFoot = false; p.mesh.visible = false;
    car.speed = 14;
    car.heading = heading;
    car.mesh.rotation.y = heading;
    p.x = car.x; p.z = car.z; p.heading = heading;
    g.camYaw = camYaw; g.camPitch = 0.28;
  };

  if (name === 'title' || name === 'start') {
    // Street level on foot, city + traffic + HUD. Mission 1 active, marker visible.
    placeOnFoot(8, 60, 0.4, 0.4);
    g.missions.startMission(0);
    g.camPitch = 0.22;
    return true;
  }
  if (name === 'driving' || name === 'play') {
    // Driving fast down a main avenue with traffic around.
    const car = g.nearestDriveable(0, 52);
    if (!car) return false;
    placeInCar(car, 0, 0);
    car.speed = 22;
    car.cruise = 22;
    g.missions.objective = 'Cruise the avenue — Solmar is yours to explore';
    return true;
  }
  if (name === 'police' || name === 'end') {
    // Wanted chase: 3 stars, two police cars closing in, sirens on.
    const car = g.nearestDriveable(-52, 0);
    if (!car) return false;
    placeInCar(car, Math.PI / 2, Math.PI / 2);
    car.speed = 18;
    car.cruise = 18;
    g.missions.objective = 'Lose the cops — 3 stars on your tail!';
    g.wanted = 3;
    g.crimeTimer = 0;
    const pc1 = g.spawnPoliceBehind(18, -8);
    const pc2 = g.spawnPoliceBehind(-14, 10);
    if (pc1) { pc1.speed = 24; }
    if (pc2) { pc2.speed = 24; }
    g.audio.setSiren(true);
    return true;
  }
  if (name === 'mission') {
    // On-foot mission moment: Vipers corner, objective marker, armed.
    placeOnFoot(-46, 44, 2.2, 2.2);
    g.missions.startMission(3);
    return true;
  }
  return false;
}
