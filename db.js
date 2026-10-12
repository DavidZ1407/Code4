import { Database } from "jsr:@db/sqlite";

export const db = new Database("game.db");

const schema = [
  `CREATE TABLE IF NOT EXISTS weapon (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    minDamage INTEGER NOT NULL,
    maxDamage INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS monster (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    hp INTEGER NOT NULL,
    attack INTEGER NOT NULL,
    goldMin INTEGER NOT NULL,
    goldMax INTEGER NOT NULL,
    potionChance INTEGER NOT NULL,
    weaponDropId TEXT REFERENCES weapon(id),
    weaponDropChance INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS player (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    hp INTEGER NOT NULL,
    maxHp INTEGER NOT NULL,
    gold INTEGER NOT NULL DEFAULT 0,
    potions INTEGER NOT NULL DEFAULT 0,
    equippedWeaponId TEXT REFERENCES weapon(id),
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS playerWeapon (
    playerId INTEGER NOT NULL REFERENCES player(id),
    weaponId TEXT NOT NULL REFERENCES weapon(id),
    upgradeLevel INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (playerId, weaponId)
  )`,

  `CREATE TABLE IF NOT EXISTS fight (
    playerId INTEGER PRIMARY KEY REFERENCES player(id),
    monsterId TEXT NOT NULL REFERENCES monster(id),
    monsterHp INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS fightLog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playerId INTEGER NOT NULL REFERENCES player(id),
    text TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS lastResult (
    playerId INTEGER PRIMARY KEY REFERENCES player(id),
    text TEXT NOT NULL
  )`,
];

for (const sql of schema) db.prepare(sql).run();

const weapons = [
  ["dagger", "Dagger",      4,  8],
  ["sword",  "Iron Sword",  8,  14],
  ["axe",    "Battle Axe",  10, 20],
  ["staff",  "Magic Staff", 6,  18],
];

const monsters = [
  ["slime",    "Slime",    30,  3,  5,   10,  15, null,    0],
  ["goblin",   "Goblin",   50,  6,  12,  25,  25, "sword", 15],
  ["skeleton", "Skeleton", 70,  8,  25,  50,  35, "axe",   20],
  ["dragon",   "Dragon",   120, 15, 80,  160, 60, "staff", 35],
];

const insertWeapon = db.prepare(
  "INSERT OR IGNORE INTO weapon (id, name, minDamage, maxDamage) VALUES (?, ?, ?, ?)",
);
for (const w of weapons) insertWeapon.run(...w);

const insertMonster = db.prepare(
  `INSERT OR IGNORE INTO monster
   (id, name, hp, attack, goldMin, goldMax, potionChance, weaponDropId, weaponDropChance)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
for (const m of monsters) insertMonster.run(...m);
