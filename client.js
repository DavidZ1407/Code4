const SERVER = "http://localhost:3000";

let selectedMonsterId = null;
let selectedWeaponId = null;

async function api(path, method = "GET", body) {
  const options = { method };
  if (body) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${SERVER}${path}`, options);
  const data = await response.json();
  if (!response.ok) {
    showMessage(data.error || "Something went wrong.");
    return null;
  }
  showMessage("");
  return data;
}

function showMessage(text) {
  document.getElementById("message").textContent = text;
}

function getPlayerName() {
  return document.getElementById("playerName").value || "Hero";
}

function renderChoices(containerId, items, statsText, onSelect) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  for (const item of items) {
    const card = document.createElement("button");
    card.className = "card";

    const title = document.createElement("strong");
    title.textContent = item.name;

    const stats = document.createElement("span");
    stats.textContent = statsText(item);

    card.append(title, stats);
    card.addEventListener("click", () => {
      for (const other of container.children) other.classList.remove("selected");
      card.classList.add("selected");
      onSelect(item.id);
    });
    container.appendChild(card);
  }
}

async function loadChoices() {
  const monsters = await api("/monsters");
  const weapons = await api("/weapons");
  if (!monsters || !weapons) return;

  renderChoices(
    "monsterList",
    monsters,
    (m) => `HP: ${m.hp} | Attack: ${m.attack}`,
    (id) => { selectedMonsterId = id; },
  );
  renderChoices(
    "weaponList",
    weapons,
    (w) => `Damage: ${w.minDamage}-${w.maxDamage}`,
    (id) => { selectedWeaponId = id; },
  );
}

async function startFight() {
  const game = await api("/start", "POST", {
    monsterId: selectedMonsterId,
    weaponId: selectedWeaponId,
    player: getPlayerName(),
  });
  if (game) renderGame(game);
}

async function attack() {
  const game = await api("/attack", "POST");
  if (game) renderGame(game);
}

async function resetGame() {
  const game = await api("/reset", "POST");
  if (game) renderGame(game);
}

async function loadGame() {
  const game = await api("/game");
  if (game) renderGame(game);
}

function setBar(barId, current, max) {
  document.getElementById(barId).style.width = `${(current / max) * 100}%`;
}

function renderGame(game) {
  const idle = game.status === "idle";
  const fighting = game.status === "fighting";

  document.getElementById("selection").hidden = !idle;
  document.getElementById("fight").hidden = idle;

  if (!idle) {
    const { monster, player, weapon } = game;

    document.getElementById("monsterName").textContent = monster.name;
    document.getElementById("monsterHp").textContent = `${monster.hp} / ${monster.maxHp} HP`;
    document.getElementById("monsterAttack").textContent = `Attack: ${monster.attack}`;
    setBar("monsterBar", monster.hp, monster.maxHp);

    document.getElementById("playerLabel").textContent = player.name;
    document.getElementById("playerHp").textContent = `${player.hp} / ${player.maxHp} HP`;
    document.getElementById("currentWeapon").textContent =
      `Weapon: ${weapon.name} (${weapon.minDamage}-${weapon.maxDamage} damage)`;
    setBar("playerBar", player.hp, player.maxHp);

    const result = document.getElementById("result");
    result.textContent = game.status === "won" ? "Victory!" : game.status === "lost" ? "Defeat!" : "";
  }

  const attackBtn = document.getElementById("attackBtn");
  attackBtn.disabled = !fighting || game.auto;
  attackBtn.textContent = game.auto ? "Fighting..." : "Attack!";
  document.getElementById("newFightBtn").hidden = fighting;

  const list = document.getElementById("log");
  list.innerHTML = "";
  for (const entry of game.log) {
    const li = document.createElement("li");
    li.textContent = entry;
    list.appendChild(li);
  }
}

document.getElementById("startBtn").addEventListener("click", startFight);
document.getElementById("attackBtn").addEventListener("click", attack);
document.getElementById("newFightBtn").addEventListener("click", resetGame);

loadChoices();
loadGame();
setInterval(loadGame, 1000);
