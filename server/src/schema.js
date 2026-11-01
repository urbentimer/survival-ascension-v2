import { Schema, MapSchema, defineTypes } from "@colyseus/schema";

export class PlayerState extends Schema {}
defineTypes(PlayerState, {
  sessionId: "string", name: "string", x: "number", y: "number",
  hp: "number", maxHp: "number", level: "number", xp: "number",
  xpNext: "number", kills: "number", damage: "number", fireRate: "number",
  speed: "number", defence: "number", alive: "boolean", ready: "boolean",
  killLeadSince: "number", bossDamage: "number", revives: "number", damageDealt: "number", damageTaken: "number", structuresBuilt: "number", headshots: "number",
  isHost: "boolean", color: "string", lastShot: "number", reviveProgress: "number"
});

export class ZombieState extends Schema {}
defineTypes(ZombieState, {
  id: "string", kind: "string", x: "number", y: "number", hp: "number",
  maxHp: "number", speed: "number", damage: "number", radius: "number",
  attackCooldown: "number", targetId: "string", boss: "boolean"
});

export class GameState extends Schema {}
defineTypes(GameState, {
  players: { map: PlayerState }, zombies: { map: ZombieState },
  stage: "number", elapsed: "number", stageDuration: "number",
  bossSpawned: "boolean", bossDead: "boolean", phase: "string",
  roomCode: "string", hostId: "string", message: "string", totalKills: "number"
});
