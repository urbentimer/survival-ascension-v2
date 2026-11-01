import { Room } from "@colyseus/core";
import { MapSchema } from "@colyseus/schema";
import { GameState, PlayerState, ZombieState } from "./schema.js";

const ARENA = { width: 1200, height: 760 };
const COLORS = ["#68d5e8", "#e8bd68", "#c58be8", "#82d49a", "#e88787", "#8eabed", "#e5a36b", "#d2d879"];
const UPGRADES = {
  damage: p => { p.damage += 5; },
  fireRate: p => { p.fireRate = Math.min(5, p.fireRate * 1.2); },
  health: p => { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 35); },
  defence: p => { p.defence += 2; },
  speed: p => { p.speed = Math.min(300, p.speed * 1.1); }
};
const rand = (a, b) => a + Math.random() * (b - a);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class SurvivalRoom extends Room {
  maxClients = 8;
  patchRate = 50;

  onCreate() {
    this.autoDispose = true;
    this.setState(new GameState());
    this.state.players = new MapSchema();
    this.state.zombies = new MapSchema();
    this.state.stage = 1;
    this.state.elapsed = 0;
    this.state.stageDuration = 90;
    this.state.bossSpawned = false;
    this.state.bossDead = false;
    this.state.phase = "lobby";
    this.state.roomCode = this.roomId;
    this.state.hostId = "";
    this.state.message = "Waiting for survivors. Host can start when ready.";
    this.state.totalKills = 0;
    this.spawnClock = 0;
    this.zombieSequence = 0;
    this.lastInputs = new Map();
    this.lastTick = Date.now();
    this.setSimulationInterval(() => this.tick(), 50);

    this.onMessage("start", (client) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== "lobby") return;
      if (this.state.players.size < 1) return;
      this.state.phase = "playing";
      this.state.elapsed = 0;
      this.state.message = "Stage 1: survive the horde. The boss arrives after 60 seconds.";
    });

    this.onMessage("input", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !p.alive || this.state.phase !== "playing") return;
      const dx = Math.max(-1, Math.min(1, Number(data?.dx) || 0));
      const dy = Math.max(-1, Math.min(1, Number(data?.dy) || 0));
      const mag = Math.hypot(dx, dy) || 1;
      const now = Date.now();
      const previous = this.lastInputs.get(client.sessionId) || (now - 50);
      const dt = Math.min(0.1, Math.max(0, (now - previous) / 1000));
      this.lastInputs.set(client.sessionId, now);
      p.x = clamp(p.x + dx / mag * p.speed * dt, 18, ARENA.width - 18);
      p.y = clamp(p.y + dy / mag * p.speed * dt, 18, ARENA.height - 18);
    });

    this.onMessage("shoot", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !p.alive || this.state.phase !== "playing") return;
      const now = Date.now();
      if (now - p.lastShot < 1000 / p.fireRate) return;
      p.lastShot = now;
      const target = [...this.state.zombies.values()].filter(z => distance(p, z) < 520)
        .sort((a, b) => distance(p, a) - distance(p, b))[0];
      if (!target) return;
      target.hp -= p.damage;
      p.damageDealt += p.damage;
      if (target.boss) p.bossDamage += p.damage;
      if (target.hp <= 0) this.killZombie(target, p);
    });

    this.onMessage("upgrade", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !p.alive || !UPGRADES[data?.id] || p.xp < p.xpNext) return;
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = Math.floor(p.xpNext * 1.35 + 8);
      UPGRADES[data.id](p);
      this.state.message = `${p.name} upgraded: ${String(data.id)}.`;
    });

    this.onMessage("revive", (client, data) => {
      const rescuer = this.state.players.get(client.sessionId);
      const target = this.state.players.get(String(data?.targetId || ""));
      if (!rescuer?.alive || !target || target.alive || distance(rescuer, target) > 85) return;
      target.alive = true;
      rescuer.revives += 1;
      target.hp = Math.max(30, Math.round(target.maxHp * 0.35));
      target.x = clamp(target.x + rand(-25, 25), 18, ARENA.width - 18);
      target.y = clamp(target.y + rand(-25, 25), 18, ARENA.height - 18);
      this.state.message = `${rescuer.name} revived ${target.name}!`;
    });

    this.onMessage("nextStage", client => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== "cleared") return;
      this.state.stage++;
      this.state.elapsed = 0;
      this.state.bossSpawned = false;
      this.state.bossDead = false;
      this.state.zombies.clear();
      this.state.phase = "playing";
      for (const p of this.state.players.values()) { p.hp = p.maxHp; p.alive = true; }
      this.state.message = `Stage ${this.state.stage}: the infected are getting stronger!`;
    });
  }

  onJoin(client, options = {}) {
    if (this.state.players.size >= 8) throw new Error("This room is full (8/8).");
    const p = new PlayerState();
    p.sessionId = client.sessionId;
    p.name = cleanName(options.name) || `Survivor ${this.state.players.size + 1}`;
    p.x = rand(430, 770); p.y = rand(280, 480);
    p.hp = 100; p.maxHp = 100; p.level = 1; p.xp = 0; p.xpNext = 30;
    p.kills = 0; p.killLeadSince = 0; p.bossDamage = 0; p.revives = 0; p.damageDealt = 0; p.damageTaken = 0; p.structuresBuilt = 0; p.headshots = 0; p.damage = 15; p.fireRate = 1; p.speed = 190; p.defence = 0;
    p.alive = true; p.ready = true; p.isHost = this.state.players.size === 0;
    p.color = COLORS[this.state.players.size % COLORS.length]; p.lastShot = 0; p.reviveProgress = 0;
    this.state.players.set(client.sessionId, p);
    if (!this.state.hostId) this.state.hostId = client.sessionId;
    this.state.message = `${p.name} joined (${this.state.players.size}/8).`;
  }

  onLeave(client) {
    const p = this.state.players.get(client.sessionId);
    if (p) this.state.message = `${p.name} left the room.`;
    this.state.players.delete(client.sessionId);
    this.lastInputs.delete(client.sessionId);
    if (this.state.hostId === client.sessionId) {
      const next = this.state.players.values().next();
      this.state.hostId = next.done ? "" : next.value.sessionId;
      if (next.value) next.value.isHost = true;
    }
    if (this.state.players.size === 0) this.state.phase = "lobby";
  }

  spawnZombie(boss = false) {
    const edge = Math.floor(Math.random() * 4);
    const x = edge === 0 ? 8 : edge === 1 ? ARENA.width - 8 : rand(20, ARENA.width - 20);
    const y = edge === 2 ? 8 : edge === 3 ? ARENA.height - 8 : rand(20, ARENA.height - 20);
    const roll = Math.random();
    const kind = boss ? "undeadKing" : roll < 0.13 ? "brute" : roll < 0.32 ? "runner" : roll < 0.47 ? "spitter" : "walker";
    const scale = 1 + (this.state.stage - 1) * 0.3;
    const base = { walker: 38, runner: 25, brute: 105, spitter: 42, undeadKing: 900 }[kind];
    const z = new ZombieState();
    z.id = `z${++this.zombieSequence}`; z.kind = kind; z.x = x; z.y = y;
    z.maxHp = base * scale * (boss ? Math.max(1, this.state.players.size * 0.65) : 1);
    z.hp = z.maxHp; z.speed = { walker: 57, runner: 125, brute: 34, spitter: 28, undeadKing: 48 }[kind];
    z.damage = { walker: 8, runner: 7, brute: 18, spitter: 6, undeadKing: 24 }[kind] * scale;
    z.radius = boss ? 39 : kind === "brute" ? 22 : 14; z.attackCooldown = 0;
    z.targetId = ""; z.boss = boss;
    this.state.zombies.set(z.id, z);
  }

  killZombie(z, killer) {
    this.state.zombies.delete(z.id);
    killer.kills++;
    killer.killLeadSince = Date.now();
    killer.xp += z.boss ? 35 : z.kind === "brute" ? 9 : 5;
    killer.hp = Math.min(killer.maxHp, killer.hp + (z.boss ? 25 : 1));
    this.state.totalKills++;
    if (z.boss) {
      this.state.bossDead = true;
      this.state.phase = "cleared";
      this.state.message = `The Undead King has fallen! Host can launch stage ${this.state.stage + 1}.`;
    }
  }

  tick() {
    if (this.state.phase !== "playing") return;
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.state.elapsed += dt;
    this.spawnClock -= dt;
    if (this.spawnClock <= 0 && this.state.elapsed < 90) {
      this.spawnZombie();
      if (this.state.stage > 1 && Math.random() < 0.35) this.spawnZombie();
      this.spawnClock = Math.max(0.28, 1.1 - this.state.stage * 0.055);
    }
    if (this.state.elapsed >= 60 && !this.state.bossSpawned) {
      this.state.bossSpawned = true; this.spawnZombie(true);
      this.state.message = "WARNING: THE UNDEAD KING HAS ARRIVED!";
    }

    const players = [...this.state.players.values()].filter(p => p.alive);
    for (const z of [...this.state.zombies.values()]) {
      if (!players.length) break;
      const target = players.reduce((a, b) => distance(z, a) < distance(z, b) ? a : b);
      z.targetId = target.sessionId;
      const d = distance(z, target);
      const a = Math.atan2(target.y - z.y, target.x - z.x);
      if (z.kind === "spitter" && d < 210) {
        // Spitters hold their distance and deal periodic ranged damage.
        if (d < 115) { z.x -= Math.cos(a) * z.speed * dt; z.y -= Math.sin(a) * z.speed * dt; }
      } else if (d > z.radius + 18) {
        z.x = clamp(z.x + Math.cos(a) * z.speed * dt, 5, ARENA.width - 5);
        z.y = clamp(z.y + Math.sin(a) * z.speed * dt, 5, ARENA.height - 5);
      }
      z.attackCooldown -= dt;
      if (d < z.radius + 20 && z.attackCooldown <= 0) {
        const dealt = Math.max(1, z.damage - target.defence); target.hp -= dealt; target.damageTaken += dealt;
        z.attackCooldown = z.boss ? 0.8 : 1.0;
        if (target.hp <= 0) { target.hp = 0; target.alive = false; this.state.message = `${target.name} is down! A teammate can revive them.`; }
      }
      if (z.kind === "spitter" && d >= 115 && d < 330 && z.attackCooldown <= 0) {
        const dealt = Math.max(1, z.damage - target.defence); target.hp -= dealt; target.damageTaken += dealt;
        z.attackCooldown = 2.4;
        if (target.hp <= 0) { target.hp = 0; target.alive = false; this.state.message = `${target.name} is down! A teammate can revive them.`; }
      }
    }
    if (this.state.elapsed >= 90 && this.state.bossDead) {
      this.state.phase = "cleared";
      this.state.message = `Stage ${this.state.stage} cleared! Host can launch the next stage.`;
    }
  }
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function cleanName(v) { return String(v || "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 18); }
