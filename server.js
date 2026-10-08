const hostname = "127.0.0.1";
const port = 3000;

const monsters = [
  { id: "slime",    name: "Slime",    hp: 30,  attack: 3 },
  { id: "goblin",   name: "Goblin",   hp: 50,  attack: 6 },
  { id: "skeleton", name: "Skeleton", hp: 70,  attack: 8 },
  { id: "dragon",   name: "Dragon",   hp: 120, attack: 15 },
];

const weapons = [
  { id: "dagger", name: "Dagger",      minDamage: 4,  maxDamage: 8 },
  { id: "sword",  name: "Iron Sword",  minDamage: 8,  maxDamage: 14 },
  { id: "axe",    name: "Battle Axe",  minDamage: 10, maxDamage: 20 },
  { id: "staff",  name: "Magic Staff", minDamage: 6,  maxDamage: 18 },
];

const PLAYER_MAX_HP = 100;
const ROUND_INTERVAL_MS = 2000;

const game = {
  status: "idle",
  auto: false,
  player: null,
  monster: null,
  weapon: null,
  log: [],
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addLog(text) {
  game.log.unshift(text);
}

let timer = null;

function stopAuto() {
  clearInterval(timer);
  timer = null;
  game.auto = false;
}

function playRound() {
  const { player, monster, weapon } = game;

  const playerDamage = randomInt(weapon.minDamage, weapon.maxDamage);
  monster.hp = Math.max(0, monster.hp - playerDamage);
  addLog(`${player.name} hits the ${monster.name} for ${playerDamage} damage.`);

  if (monster.hp === 0) {
    game.status = "won";
    addLog(`The ${monster.name} was defeated!`);
    stopAuto();
    return;
  }

  const monsterDamage = randomInt(Math.ceil(monster.attack / 2), monster.attack);
  player.hp = Math.max(0, player.hp - monsterDamage);
  addLog(`The ${monster.name} hits ${player.name} for ${monsterDamage} damage.`);

  if (player.hp === 0) {
    game.status = "lost";
    addLog(`${player.name} was defeated...`);
    stopAuto();
  }
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

  switch (route) {
    case "GET /monsters":
      return reply(monsters);

    case "GET /weapons":
      return reply(weapons);

    case "GET /game":
      return reply(game);

    case "POST /start": {
      const { monsterId, weaponId, player } = await request.json();
      const monster = monsters.find((m) => m.id === monsterId);
      const weapon = weapons.find((w) => w.id === weaponId);

      if (!monster || !weapon) {
        return reply({ error: "Please choose a monster and a weapon." }, 400);
      }

      stopAuto();
      game.status = "fighting";
      game.player = { name: player || "Hero", hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP };
      game.monster = { ...monster, maxHp: monster.hp };
      game.weapon = { ...weapon };
      game.log = [];
      addLog(`${game.player.name} enters the fight against the ${monster.name}!`);
      return reply(game);
    }

    case "POST /attack": {
      if (game.status !== "fighting") {
        return reply({ error: "There is no active fight." }, 400);
      }
      if (game.auto) {
        return reply(game);
      }

      game.auto = true;
      addLog("Auto-battle started.");
      playRound();
      if (game.auto) {
        timer = setInterval(playRound, ROUND_INTERVAL_MS);
      }
      return reply(game);
    }

    case "POST /reset":
      stopAuto();
      game.status = "idle";
      game.player = null;
      game.monster = null;
      game.weapon = null;
      game.log = [];
      return reply(game);

    default:
      return reply({ error: "Not Found" }, 404);
  }
});

console.log(`Server running on http://${hostname}:${port}/`);
