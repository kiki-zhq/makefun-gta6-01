// SOLMAR HEAT — HUD (DOM) + minimap (2D canvas). Written fresh for this game.
import { clamp } from './util.js';
import { STREETS, HALF } from './city.js';

export class HUD {
  constructor() {
    this.el = {
      health: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      stars: document.getElementById('stars'),
      money: document.getElementById('money'),
      speed: document.getElementById('speed'),
      speedLabel: document.getElementById('speed-label'),
      objective: document.getElementById('objective'),
      timer: document.getElementById('timer'),
      ammo: document.getElementById('ammo'),
      toast: document.getElementById('toast'),
      crosshair: document.getElementById('crosshair'),
      hint: document.getElementById('hint'),
      vignette: document.getElementById('vignette'),
      busted: document.getElementById('busted'),
      minimap: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = 0;
    this.lastDialogue = '';
  }

  showToast(text, seconds = 3) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    this.toastTimer = seconds;
  }

  update(dt, g) {
    const p = g.player;
    if (!p) return;
    // health
    this.el.health.style.width = `${clamp(p.health, 0, 100)}%`;
    this.el.healthText.textContent = `HP ${Math.ceil(p.health)}`;
    this.el.health.style.background = p.health > 50 ? '#2ecc71' : p.health > 25 ? '#f39c12' : '#e74c3c';
    // wanted stars
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < g.wanted ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.style.color = g.wanted > 0 ? '#ffd400' : '#888';
    // money / ammo / speed
    this.el.money.textContent = `$${p.money}`;
    const kmh = Math.round(Math.abs(p.car ? p.car.speed : 0) * 3.6);
    this.el.speed.textContent = p.car ? kmh : '';
    this.el.speedLabel.textContent = p.car ? 'km/h' : '';
    this.el.ammo.textContent = p.onFoot ? (p.reloading > 0 ? 'RELOADING…' : `AMMO ${p.ammo}/12`) : '';
    // objective + timer
    this.el.objective.textContent = g.missions.objective || '';
    this.el.timer.textContent = g.missions.timer > 0 ? `⏱ ${Math.ceil(g.missions.timer)}s` : '';
    // crosshair only on foot while playing
    this.el.crosshair.style.display = (p.onFoot && g.mode === 'playing') ? 'block' : 'none';
    // damage vignette
    this.el.vignette.style.opacity = p.health < 40 ? String((40 - p.health) / 40 * 0.7) : '0';
    // busted overlay
    this.el.busted.style.display = g.bustedTimer > 0 ? 'flex' : 'none';
    // toast fade
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.style.opacity = '0';
    }
    // dialogue: show the first pending line
    const line = g.missions.dialogue[0];
    if (line && line !== this.lastDialogue) {
      this.showToast(line, 4.5);
      this.lastDialogue = line;
    }
    this.drawMinimap(g);
  }

  drawMinimap(g) {
    const ctx = this.mapCtx;
    const S = 180; // canvas px
    const scale = S / (HALF * 2 + 60);
    const toMap = (x, z) => [S / 2 + x * scale, S / 2 + z * scale];
    ctx.clearRect(0, 0, S, S);
    // background: dark blue-grey
    ctx.fillStyle = '#10151d';
    ctx.fillRect(0, 0, S, S);
    // beach strip
    ctx.fillStyle = '#3a6a8a';
    ctx.fillRect(0, S / 2 + 162 * scale, S, S);
    // roads
    ctx.strokeStyle = '#3a4048';
    ctx.lineWidth = 12 * scale;
    for (const s of STREETS) {
      const [x1, y1] = toMap(-HALF - 10, s);
      const [x2, y2] = toMap(HALF + 10, s);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = toMap(s, -HALF - 10);
      const [x4, y4] = toMap(s, HALF + 10);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }
    // mission marker
    const target = g.missions.currentTarget();
    if (target && g.missions.state === 'active') {
      const [mx, my] = toMap(target.x, target.z);
      ctx.fillStyle = '#ffd400';
      ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.stroke();
    }
    // police (blue), traffic (grey), enemies (red)
    const dot = (x, z, color, r = 2.5) => {
      const [dx, dy] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill();
    };
    for (const car of g.cars) {
      if (car.kind === 'police') dot(car.x, car.z, '#3a86ff', 3);
      else if (car.kind === 'traffic') dot(car.x, car.z, '#9aa0a6', 2);
    }
    for (const e of g.enemies) if (!e.dead) dot(e.x, e.z, '#ff4444', 3);
    // player arrow
    const p = g.player;
    const [px, py] = toMap(p.x, p.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.sin(p.heading), Math.cos(p.heading)) + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // north indicator
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', S - 14, 14);
  }
}
