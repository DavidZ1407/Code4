const SERVER = "http://localhost:3000";

let playerId = Number(localStorage.getItem("playerId")) || null;
let monsters = [];
let pollTimer = null;

const $ = (id) => document.getElementById(id);

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
  $("message").textContent = text;
}

async function act(path, body = {}) {
  const state = await api(path, "POST", { playerId, ...body });
  if (state) render(state);
}

function setBar(barId, current, max) {
  $(barId).style.width = `${(current / max) * 100}%`;
}

async function loginAs(name) {
  const state = await api("/login", "POST", { name });
  if (!state) return;
  playerId = state.player.id;
  localStorage.setItem("playerId", playerId);
  $("playerName").value = "";
  render(state);
}

function logout() {
  localStorage.removeItem("playerId");
  playerId = null;
  render(null);
}

async function loadPlayer() {
  if (!playerId) return render(null);
  const state = await api(`/player?id=${playerId}`);
  if (state) render(state);
  else logout();
}

async function renderPlayerList() {
  const players = (await api("/players")) || [];
  const container = $("playerList");
  container.innerHTML = "";
  $("noPlayers").hidden = players.length > 0;

  for (const p of players) {
    const card = document.createElement("button");
    card.className = "card";

    const title = document.createElement("strong");
    title.textContent = p.name;

    const stats = document.createElement("span");
    stats.textContent = `${p.hp}/${p.maxHp} HP | ${p.gold} gold | ${p.wins} wins`;

    card.append(title, stats);
    card.addEventListener("click", () => loginAs(p.name));
    container.appendChild(card);
  }
}

function renderWeapons(state) {
  const container = $("weaponList");
  container.innerHTML = "";
  const equippedId = state.player.equippedWeaponId;

  for (const w of state.weapons) {
    const card = document.createElement("div");
    card.className = "card" + (w.id === equippedId ? " selected" : "");

    const title = document.createElement("strong");
    title.textContent = `${w.name} +${w.upgradeLevel}`;

    const stats = document.createElement("span");
    stats.textContent = `Damage: ${w.minDamage}-${w.maxDamage}`;

    const equipBtn = document.createElement("button");
    equipBtn.textContent = w.id === equippedId ? "Equipped" : "Equip";
    equipBtn.disabled = w.id === equippedId;
    equipBtn.addEventListener("click", () => act("/equip", { weaponId: w.id }));

    const upgradeBtn = document.createElement("button");
    upgradeBtn.textContent = w.upgradeCost === null ? "Max level" : `Upgrade (${w.upgradeCost} gold)`;
    upgradeBtn.disabled = w.upgradeCost === null || state.player.gold < w.upgradeCost;
    upgradeBtn.addEventListener("click", () => act("/upgrade", { weaponId: w.id }));

    card.append(title, stats, equipBtn, upgradeBtn);
    container.appendChild(card);
  }
}

function renderMonsters(state) {
  const container = $("monsterList");
  container.innerHTML = "";

  for (const m of monsters) {
    const card = document.createElement("button");
    card.className = "card";
    card.disabled = state.player.hp <= 0;

    const title = document.createElement("strong");
    title.textContent = m.name;

    const stats = document.createElement("span");
    stats.textContent = `HP: ${m.hp} | Attack: ${m.attack}`;

    const rewards = document.createElement("span");
    rewards.textContent = `Reward: ${m.goldMin}-${m.goldMax} gold, ${m.potionChance}% potion`;

    card.append(title, stats, rewards);
    card.addEventListener("click", () => act("/start", { monsterId: m.id }));
    container.appendChild(card);
  }
}

function render(state) {
  const loggedIn = Boolean(state);
  $("login").hidden = loggedIn;
  $("game").hidden = !loggedIn;

  if (!loggedIn) {
    stopPolling();
    renderPlayerList();
    return;
  }

  const { player, fight, weapons, log, config, auto, result } = state;
  const fighting = Boolean(fight);

  $("playerLabel").textContent = player.name;
  $("playerHp").textContent = `${player.hp} / ${player.maxHp} HP`;
  setBar("playerBar", player.hp, player.maxHp);
  $("stats").textContent =
    `Gold: ${player.gold} | Potions: ${player.potions} | Wins: ${player.wins} | Losses: ${player.losses}`;
  $("healBtn").textContent = `Drink potion (+${config.potionHeal} HP)`;
  $("healBtn").disabled = fighting || player.potions < 1 || player.hp >= player.maxHp;
  $("buyPotionBtn").textContent = `Buy potion (${config.potionPrice} gold)`;
  $("buyPotionBtn").disabled = fighting || player.gold < config.potionPrice;

  $("banner").textContent = result;

  $("hub").hidden = fighting;
  $("fight").hidden = !fighting;

  if (fighting) {
    const weapon = weapons.find((w) => w.id === player.equippedWeaponId);
    $("monsterName").textContent = fight.name;
    $("monsterHp").textContent = `${fight.hp} / ${fight.maxHp} HP`;
    $("monsterAttack").textContent = `Attack: ${fight.attack}`;
    setBar("monsterBar", fight.hp, fight.maxHp);
    $("currentWeapon").textContent =
      `Weapon: ${weapon.name} +${weapon.upgradeLevel} (${weapon.minDamage}-${weapon.maxDamage} damage)`;
  } else {
    renderWeapons(state);
    renderMonsters(state);
  }

  $("attackBtn").disabled = !fighting || auto;
  $("attackBtn").textContent = auto ? "Fighting..." : "Attack!";
  $("fleeBtn").disabled = !fighting;

  if (fighting) startPolling();
  else stopPolling();

  const list = $("log");
  list.innerHTML = "";
  for (const entry of log) {
    const li = document.createElement("li");
    li.textContent = entry;
    list.appendChild(li);
  }
}

function startPolling() {
  if (!pollTimer) pollTimer = setInterval(loadPlayer, 1000);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

$("loginBtn").addEventListener("click", () => loginAs($("playerName").value));
$("playerName").addEventListener("keydown", (e) => { if (e.key === "Enter") loginAs($("playerName").value); });
$("logoutBtn").addEventListener("click", logout);
$("healBtn").addEventListener("click", () => act("/potion"));
$("buyPotionBtn").addEventListener("click", () => act("/buy-potion"));
$("attackBtn").addEventListener("click", () => act("/attack"));
$("fleeBtn").addEventListener("click", () => act("/flee"));

async function init() {
  monsters = (await api("/monsters")) || [];
  await loadPlayer();
}
init();
