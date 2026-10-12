import { db } from "./db.js";

const hostname = "127.0.0.1";
const port = 3000;

const PLAYER_MAX_HP = 100;
const POTION_HEAL = 40;
const POTION_PRICE = 15;
const MAX_UPGRADE = 10;
const UPGRADE_BONUS = 2;
const DUPLICATE_DROP_GOLD = 25;
const DEFEAT_GOLD_LOSS = 0.2;
const DEFEAT_HP_FACTOR = 0.25;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chance(percent) {
  return randomInt(1, 100) <= percent;
}

function tx(fn) {
  let result;
  db.transaction(() => {
    result = fn();
  })();
  return result;
}

function addLog(playerId, text) {
  db.prepare("INSERT INTO fightLog (playerId, text) VALUES (?, ?)").run(playerId, text);
}

const ROUND_INTERVAL_MS = 2000;
const timers = new Map();

function stopAuto(playerId) {
  clearInterval(timers.get(playerId));
  timers.delete(playerId);
}

function saveResult(playerId, text) {
  db.prepare("INSERT OR REPLACE INTO lastResult (playerId, text) VALUES (?, ?)").run(playerId, text);
}

function getPlayer(playerId) {
  const player = db.prepare("SELECT * FROM player WHERE id = ?").get(playerId);
  if (!player) fail(404, "Player not found.");
  return player;
}

function withUpgrade(row) {
  const lvl = row.upgradeLevel;
  return {
    id: row.id,
    name: row.name,
    upgradeLevel: lvl,
    minDamage: row.minDamage + lvl * UPGRADE_BONUS,
    maxDamage: row.maxDamage + lvl * UPGRADE_BONUS,
    upgradeCost: lvl >= MAX_UPGRADE ? null : 25 * (lvl + 1),
  };
}

function getOwnedWeapon(playerId, weaponId) {
  const row = db.prepare(
    `SELECT w.id, w.name, w.minDamage, w.maxDamage, pw.upgradeLevel
     FROM playerWeapon pw JOIN weapon w ON w.id = pw.weaponId
     WHERE pw.playerId = ? AND pw.weaponId = ?`,
  ).get(playerId, weaponId);
  return row ? withUpgrade(row) : null;
}

function getState(playerId) {
  const player = getPlayer(playerId);

  const weapons = db.prepare(
    `SELECT w.id, w.name, w.minDamage, w.maxDamage, pw.upgradeLevel
     FROM playerWeapon pw JOIN weapon w ON w.id = pw.weaponId
     WHERE pw.playerId = ? ORDER BY w.id`,
  ).all(playerId).map(withUpgrade);

  const fight = db.prepare(
    `SELECT m.id, m.name, m.attack, m.hp AS maxHp, f.monsterHp AS hp
     FROM fight f JOIN monster m ON m.id = f.monsterId
     WHERE f.playerId = ?`,
  ).get(playerId) ?? null;

  const log = db.prepare(
    "SELECT text FROM fightLog WHERE playerId = ? ORDER BY id DESC LIMIT 20",
  ).all(playerId).map((r) => r.text);

  const result = db.prepare("SELECT text FROM lastResult WHERE playerId = ?").get(playerId)?.text ?? "";

  return {
    player,
    weapons,
    fight,
    auto: timers.has(playerId),
    result,
    log,
    config: { potionPrice: POTION_PRICE, potionHeal: POTION_HEAL },
  };
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function login(name) {
  name = String(name ?? "").trim();
  if (name.length < 1 || name.length > 20) {
    fail(400, "Please enter a name (1-20 characters).");
  }
  return tx(() => {
    db.prepare(
      `INSERT OR IGNORE INTO player (name, hp, maxHp, gold, potions, equippedWeaponId)
       VALUES (?, ?, ?, 0, 1, 'dagger')`,
    ).run(name, PLAYER_MAX_HP, PLAYER_MAX_HP);

    const player = db.prepare("SELECT * FROM player WHERE name = ?").get(name);
    db.prepare(
      "INSERT OR IGNORE INTO playerWeapon (playerId, weaponId) VALUES (?, 'dagger')",
    ).run(player.id);
    return getState(player.id);
  });
}

function equip(playerId, weaponId) {
  return tx(() => {
    getPlayer(playerId);
    if (getState(playerId).fight) fail(400, "You cannot change weapons during a fight.");
    if (!getOwnedWeapon(playerId, weaponId)) fail(400, "You don't own this weapon.");
    db.prepare("UPDATE player SET equippedWeaponId = ? WHERE id = ?").run(weaponId, playerId);
    return getState(playerId);
  });
}

function upgrade(playerId, weaponId) {
  return tx(() => {
    const player = getPlayer(playerId);
    if (getState(playerId).fight) fail(400, "You cannot upgrade during a fight.");
    const weapon = getOwnedWeapon(playerId, weaponId);
    if (!weapon) fail(400, "You don't own this weapon.");
    if (weapon.upgradeCost === null) fail(400, "This weapon is already at max level.");
    if (player.gold < weapon.upgradeCost) fail(400, "Not enough gold.");

    db.prepare("UPDATE player SET gold = gold - ? WHERE id = ?").run(weapon.upgradeCost, playerId);
    db.prepare(
      "UPDATE playerWeapon SET upgradeLevel = upgradeLevel + 1 WHERE playerId = ? AND weaponId = ?",
    ).run(playerId, weaponId);
    addLog(playerId, `${weapon.name} upgraded to +${weapon.upgradeLevel + 1}.`);
    return getState(playerId);
  });
}

function usePotion(playerId) {
  return tx(() => {
    const player = getPlayer(playerId);
    if (getState(playerId).fight) fail(400, "You cannot drink a potion during a fight.");
    if (player.potions < 1) fail(400, "You have no potions.");
    if (player.hp >= player.maxHp) fail(400, "You are already at full health.");

    const newHp = Math.min(player.maxHp, player.hp + POTION_HEAL);
    db.prepare("UPDATE player SET hp = ?, potions = potions - 1 WHERE id = ?").run(newHp, playerId);
    addLog(playerId, `${player.name} drinks a potion and heals ${newHp - player.hp} HP.`);
    return getState(playerId);
  });
}

function buyPotion(playerId) {
  return tx(() => {
    const player = getPlayer(playerId);
    if (getState(playerId).fight) fail(400, "You cannot shop during a fight.");
    if (player.gold < POTION_PRICE) fail(400, "Not enough gold.");
    db.prepare(
      "UPDATE player SET gold = gold - ?, potions = potions + 1 WHERE id = ?",
    ).run(POTION_PRICE, playerId);
    addLog(playerId, `${player.name} buys a potion for ${POTION_PRICE} gold.`);
    return getState(playerId);
  });
}

function startFight(playerId, monsterId) {
  return tx(() => {
    const player = getPlayer(playerId);
    if (getState(playerId).fight) fail(400, "You are already in a fight.");
    if (player.hp <= 0) fail(400, "You are too weak. Heal first.");
    if (!player.equippedWeaponId) fail(400, "Please choose a weapon first.");
    const monster = db.prepare("SELECT * FROM monster WHERE id = ?").get(monsterId);
    if (!monster) fail(400, "Please choose a monster.");

    stopAuto(playerId);
    db.prepare("DELETE FROM lastResult WHERE playerId = ?").run(playerId);
    db.prepare(
      "INSERT INTO fight (playerId, monsterId, monsterHp) VALUES (?, ?, ?)",
    ).run(playerId, monster.id, monster.hp);
    addLog(playerId, `${player.name} enters the fight against the ${monster.name}!`);
    return getState(playerId);
  });
}

function flee(playerId) {
  return tx(() => {
    const player = getPlayer(playerId);
    if (!getState(playerId).fight) fail(400, "There is no active fight.");
    stopAuto(playerId);
    db.prepare("DELETE FROM fight WHERE playerId = ?").run(playerId);
    addLog(playerId, `${player.name} flees from the fight.`);
    return getState(playerId);
  });
}

function giveRewards(player, monster) {
  const rewards = { gold: randomInt(monster.goldMin, monster.goldMax), potion: false, weapon: null };

  if (chance(monster.potionChance)) rewards.potion = true;

  if (monster.weaponDropId && chance(monster.weaponDropChance)) {
    const owned = getOwnedWeapon(player.id, monster.weaponDropId);
    const dropped = db.prepare("SELECT * FROM weapon WHERE id = ?").get(monster.weaponDropId);
    if (owned) {
      rewards.gold += DUPLICATE_DROP_GOLD;
    } else {
      db.prepare(
        "INSERT INTO playerWeapon (playerId, weaponId) VALUES (?, ?)",
      ).run(player.id, dropped.id);
      rewards.weapon = dropped.name;
    }
  }

  db.prepare(
    "UPDATE player SET gold = gold + ?, potions = potions + ?, wins = wins + 1 WHERE id = ?",
  ).run(rewards.gold, rewards.potion ? 1 : 0, player.id);
  return rewards;
}

function playRound(playerId) {
  return tx(() => {
    const player = getPlayer(playerId);
    const fight = db.prepare("SELECT * FROM fight WHERE playerId = ?").get(playerId);
    if (!fight) fail(400, "There is no active fight.");

    const monster = db.prepare("SELECT * FROM monster WHERE id = ?").get(fight.monsterId);
    const weapon = getOwnedWeapon(playerId, player.equippedWeaponId);

    const playerDamage = randomInt(weapon.minDamage, weapon.maxDamage);
    const monsterHp = Math.max(0, fight.monsterHp - playerDamage);
    addLog(playerId, `${player.name} hits the ${monster.name} for ${playerDamage} damage.`);

    if (monsterHp === 0) {
      db.prepare("DELETE FROM fight WHERE playerId = ?").run(playerId);
      addLog(playerId, `The ${monster.name} was defeated!`);
      const r = giveRewards(player, monster);
      const parts = [`${r.gold} gold`];
      if (r.potion) parts.push("1 potion");
      if (r.weapon) parts.push(`new weapon: ${r.weapon}!`);
      saveResult(playerId, `Victory against the ${monster.name}! Rewards: ${parts.join(", ")}`);
      return true;
    }
    db.prepare("UPDATE fight SET monsterHp = ? WHERE playerId = ?").run(monsterHp, playerId);

    const monsterDamage = randomInt(Math.ceil(monster.attack / 2), monster.attack);
    const playerHp = Math.max(0, player.hp - monsterDamage);
    db.prepare("UPDATE player SET hp = ? WHERE id = ?").run(playerHp, playerId);
    addLog(playerId, `The ${monster.name} hits ${player.name} for ${monsterDamage} damage.`);

    if (playerHp === 0) {
      const goldLost = Math.floor(player.gold * DEFEAT_GOLD_LOSS);
      const respawnHp = Math.ceil(player.maxHp * DEFEAT_HP_FACTOR);
      db.prepare("DELETE FROM fight WHERE playerId = ?").run(playerId);
      db.prepare(
        "UPDATE player SET hp = ?, gold = gold - ?, losses = losses + 1 WHERE id = ?",
      ).run(respawnHp, goldLost, playerId);
      addLog(playerId, `${player.name} was defeated... (lost ${goldLost} gold)`);
      saveResult(playerId, `Defeat against the ${monster.name}! You lost ${goldLost} gold.`);
      return true;
    }
    return false;
  });
}

function startAuto(playerId) {
  getPlayer(playerId);
  if (timers.has(playerId)) return getState(playerId);
  if (!getState(playerId).fight) fail(400, "There is no active fight.");

  addLog(playerId, "Auto-battle started.");
  const finished = playRound(playerId);
  if (!finished) {
    timers.set(playerId, setInterval(() => {
      try {
        if (playRound(playerId)) stopAuto(playerId);
      } catch (error) {
        console.error(error);
        stopAuto(playerId);
      }
    }, ROUND_INTERVAL_MS));
  }
  return getState(playerId);
}

Deno.serve({ hostname, port }, async (request) => {
  const url = new URL(request.url);

  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });

  const reply = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const route = `${request.method} ${url.pathname}`;

  try {
    switch (route) {
      case "GET /monsters":
        return reply(db.prepare("SELECT * FROM monster ORDER BY hp").all());

      case "GET /weapons":
        return reply(db.prepare("SELECT * FROM weapon").all());

      case "GET /players":
        return reply(db.prepare(
          "SELECT id, name, hp, maxHp, gold, wins, losses FROM player ORDER BY name",
        ).all());

      case "GET /player":
        return reply(getState(Number(url.searchParams.get("id"))));

      case "POST /login": {
        const { name } = await readBody(request);
        return reply(login(name));
      }

      case "POST /equip": {
        const { playerId, weaponId } = await readBody(request);
        return reply(equip(playerId, weaponId));
      }

      case "POST /upgrade": {
        const { playerId, weaponId } = await readBody(request);
        return reply(upgrade(playerId, weaponId));
      }

      case "POST /potion": {
        const { playerId } = await readBody(request);
        return reply(usePotion(playerId));
      }

      case "POST /buy-potion": {
        const { playerId } = await readBody(request);
        return reply(buyPotion(playerId));
      }

      case "POST /start": {
        const { playerId, monsterId } = await readBody(request);
        return reply(startFight(playerId, monsterId));
      }

      case "POST /attack": {
        const { playerId } = await readBody(request);
        return reply(startAuto(playerId));
      }

      case "POST /flee": {
        const { playerId } = await readBody(request);
        return reply(flee(playerId));
      }

      default:
        return reply({ error: "Not Found" }, 404);
    }
  } catch (error) {
    if (error instanceof HttpError) {
      return reply({ error: error.message }, error.status);
    }
    console.error(error);
    return reply({ error: "Server error." }, 500);
  }
});

console.log(`Server running on http://${hostname}:${port}/`);
