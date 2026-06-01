/* CryptCrawler — 2D top-down roguelike.
 *
 * The whole world is drawn with code on a canvas: rooms and tunnels are
 * generated procedurally, the player walks tile by tile, and every room's
 * prose (description, atmosphere, the monster + loot that inhabit it) is
 * fetched live from the Python server, which asks Gemini.
 *
 * A room is "gated": you cannot step into it until its narration has arrived,
 * so what you see is always what's really there.
 */

// ── tunables ──────────────────────────────────────────────────────────────
const TILE = 28;            // pixel size of one map cell
const MAP_W = 60;
const MAP_H = 40;
const VIEW_RADIUS = 4;      // how far you see down a dark corridor
const MOVE_SPEED = 14;      // higher = snappier tile-to-tile glide

const WALL = 0, FLOOR = 1, CORRIDOR = 2, STAIRS = 3;

const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");
const VIEW_W = Math.floor(canvas.width / TILE);
const VIEW_H = Math.floor(canvas.height / TILE);

// ── tiny helpers ────────────────────────────────────────────────────────────
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ── game state ──────────────────────────────────────────────────────────────
let map, roomOf, rooms, explored, player, monsters, loot, stairs, depth, busy, dead;
let effects = [];           // floating numbers
let flash = 0;              // red screen flash, decays to 0
let camX = 0, camY = 0;     // smoothed camera (tile units)

function newPlayer() {
  return { x: 0, y: 0, rx: 0, ry: 0, hp: 20, maxHp: 20, atk: 4, items: [] };
}

// ── dungeon generation ────────────────────────────────────────────────────────
function carveRoom(r) {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      map[y][x] = FLOOR;
      roomOf[y][x] = r.id;
    }
}

function carveCorridor(x1, y1, x2, y2) {
  const hline = (xa, xb, y) => {
    for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++)
      if (map[y][x] === WALL) map[y][x] = CORRIDOR;
  };
  const vline = (ya, yb, x) => {
    for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y++)
      if (map[y][x] === WALL) map[y][x] = CORRIDOR;
  };
  if (Math.random() < 0.5) { hline(x1, x2, y1); vline(y1, y2, x2); }
  else { vline(y1, y2, x1); hline(x1, x2, y2); }
}

function overlaps(a, b) {
  return a.x - 1 < b.x + b.w && a.x + a.w + 1 > b.x &&
         a.y - 1 < b.y + b.h && a.y + a.h + 1 > b.y;
}

const center = (r) => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) });

function generateLevel() {
  map = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(WALL));
  roomOf = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(-1));
  explored = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false));
  rooms = [];
  monsters = [];
  loot = [];
  effects = [];

  const target = 7 + Math.min(depth, 6);
  for (let attempt = 0; attempt < 80 && rooms.length < target; attempt++) {
    const w = randInt(5, 10), h = randInt(4, 8);
    const x = randInt(1, MAP_W - w - 2), y = randInt(1, MAP_H - h - 2);
    const r = { x, y, w, h, id: rooms.length, requested: false, ready: false };
    if (rooms.some((o) => overlaps(r, o))) continue;
    carveRoom(r);
    rooms.push(r);
  }

  for (let i = 1; i < rooms.length; i++) {
    const a = center(rooms[i - 1]), b = center(rooms[i]);
    carveCorridor(a.x, a.y, b.x, b.y);
  }

  const start = center(rooms[0]);
  player.x = player.rx = start.x;
  player.y = player.ry = start.y;
  camX = start.x; camY = start.y;

  const last = center(rooms[rooms.length - 1]);
  stairs = { x: last.x, y: last.y };
  map[last.y][last.x] = STAIRS;

  busy = false;
  revealAround();
  requestRoom(rooms[0].id, null);   // narrate the starting room (player already in it)
}

// ── visibility ──────────────────────────────────────────────────────────────
const roomAt = (x, y) => (roomOf[y] ? roomOf[y][x] : -1);

function isVisible(x, y) {
  const pr = roomAt(player.x, player.y);
  if (pr !== -1 && roomAt(x, y) === pr && rooms[pr].ready) return true;
  return Math.max(Math.abs(x - player.x), Math.abs(y - player.y)) <= VIEW_RADIUS;
}

function revealAround() {
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++)
      if (isVisible(x, y)) explored[y][x] = true;
}

// ── narration: the live Gemini bridge + room gating ──────────────────────────
async function requestRoom(id, enterTile) {
  const r = rooms[id];
  if (r.ready) { if (enterTile) stepInto(enterTile.x, enterTile.y); return; }
  if (r.requested) return;
  r.requested = true;

  busy = true;
  setRoomText("…", "you pause at the threshold; the dark ahead takes shape", true);

  let room;
  try {
    const res = await fetch("/api/narrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hp: player.hp, max_hp: player.maxHp, items: player.items.slice(-3), depth,
      }),
    });
    room = await res.json();
  } catch (e) {
    room = { description: "A silent stone chamber, its history lost to the dark.", atmosphere: "" };
  }

  r.ready = true;
  busy = false;
  setRoomText(room.description || "", room.atmosphere || "", false);
  spawnFromNarration(r, room);
  revealAround();

  // If the player was waiting to step in, carry them through now.
  if (enterTile && !monsterAt(enterTile.x, enterTile.y)) stepInto(enterTile.x, enterTile.y);
}

function spawnFromNarration(r, room) {
  const free = [];
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++)
      if (map[y][x] === FLOOR && !(x === player.x && y === player.y)) free.push({ x, y });

  // The starting room (id 0) stays safe — no ambush on spawn.
  if (room.monster && r.id !== 0 && free.length) {
    const s = free.splice(randInt(0, free.length - 1), 1)[0];
    monsters.push({
      x: s.x, y: s.y, rx: s.x, ry: s.y,
      name: room.monster.name || "creature",
      hp: room.monster.hp || 6, dmg: room.monster.damage || 2,
      glyph: (room.monster.name || "m")[0], roomId: r.id,
      bob: Math.random() * 6,
    });
    log(`A ${room.monster.name} lurks here.`, "sys");
  }
  for (const name of (room.loot || [])) {
    if (!free.length) break;
    const s = free.splice(randInt(0, free.length - 1), 1)[0];
    loot.push({ x: s.x, y: s.y, name, phase: Math.random() * 6 });
  }
}

// ── turns: movement, combat, AI ──────────────────────────────────────────────
function passable(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
  return map[y][x] !== WALL;
}
const monsterAt = (x, y) => monsters.find((m) => m.x === x && m.y === y);

function tryMove(dx, dy) {
  if (busy || dead) return;
  const nx = player.x + dx, ny = player.y + dy;
  if (!passable(nx, ny)) return;

  const target = monsterAt(nx, ny);
  if (target) { playerAttack(target); monstersTurn(); afterTurn(); return; }

  // Gate: stepping into a new room that hasn't been generated yet — wait here.
  const dest = roomAt(nx, ny);
  if (dest !== -1 && dest !== roomAt(player.x, player.y) && !rooms[dest].ready) {
    requestRoom(dest, { x: nx, y: ny });
    return;
  }

  stepInto(nx, ny);
}

function stepInto(nx, ny) {
  player.x = nx; player.y = ny;
  pickupAt(nx, ny);
  if (map[ny][nx] === STAIRS) { descend(); return; }
  monstersTurn();
  afterTurn();
}

function playerAttack(m) {
  const dmg = randInt(1, player.atk);
  m.hp -= dmg;
  floater(m.x, m.y, `-${dmg}`, "#f0c060");
  if (m.hp <= 0) {
    monsters = monsters.filter((x) => x !== m);
    log(`You strike the ${m.name} down. (${dmg} dmg)`, "hit");
  } else {
    log(`You hit the ${m.name} for ${dmg}. (${m.hp} HP left)`, "hit");
  }
}

function monstersTurn() {
  const pr = roomAt(player.x, player.y);
  for (const m of monsters) {
    const adjacent = Math.max(Math.abs(m.x - player.x), Math.abs(m.y - player.y)) === 1;
    if (m.roomId !== pr && !adjacent) continue;
    if (adjacent) {
      const dmg = randInt(1, m.dmg);
      player.hp = Math.max(0, player.hp - dmg);
      floater(player.x, player.y, `-${dmg}`, "#e85d4e");
      flash = Math.min(1, flash + 0.55);
      log(`${m.name} hits you for ${dmg}.`, "hurt");
    } else {
      stepToward(m);
    }
  }
}

function stepToward(m) {
  const dx = Math.sign(player.x - m.x), dy = Math.sign(player.y - m.y);
  const tries = Math.abs(player.x - m.x) > Math.abs(player.y - m.y)
    ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
  for (const [mx, my] of tries) {
    const nx = m.x + mx, ny = m.y + my;
    if (passable(nx, ny) && !monsterAt(nx, ny) && !(nx === player.x && ny === player.y)) {
      m.x = nx; m.y = ny; return;
    }
  }
}

function pickupAt(x, y) {
  const idx = loot.findIndex((it) => it.x === x && it.y === y);
  if (idx < 0) return;
  const item = loot.splice(idx, 1)[0];
  player.items.push(item.name);
  const low = item.name.toLowerCase();
  if (["sword", "axe", "dagger", "blade", "spear", "bow"].some((w) => low.includes(w))) {
    player.atk += 2;
    floater(x, y, "+2 ATK", "#d9a441");
    log(`Picked up ${item.name}  (+2 ATK)`, "pick");
  } else if (["potion", "elixir", "vial", "flask"].some((w) => low.includes(w))) {
    const heal = randInt(4, 8);
    player.hp = Math.min(player.maxHp, player.hp + heal);
    floater(x, y, `+${heal} HP`, "#4e9a51");
    log(`Drank ${item.name}  (+${heal} HP)`, "pick");
  } else {
    floater(x, y, "+1", "#d9a441");
    log(`Picked up ${item.name}`, "pick");
  }
}

function descend() {
  depth += 1;
  log(`You descend to depth ${depth + 1}…`, "sys");
  generateLevel();
  updateHud();
}

function afterTurn() {
  revealAround();
  updateHud();
  if (player.hp <= 0) gameOver(false);
}

// ── effects ──────────────────────────────────────────────────────────────────
function floater(x, y, text, color) {
  effects.push({ x, y, text, color, t: 0 });
}

// ── animation loop + rendering ────────────────────────────────────────────────
let lastTs = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  if (map) { update(dt); render(ts / 1000); }
  requestAnimationFrame(frame);
}

function update(dt) {
  const k = Math.min(1, dt * MOVE_SPEED);
  player.rx = lerp(player.rx, player.x, k);
  player.ry = lerp(player.ry, player.y, k);
  for (const m of monsters) { m.rx = lerp(m.rx, m.x, k); m.ry = lerp(m.ry, m.y, k); }
  camX = lerp(camX, player.x, Math.min(1, dt * 6));
  camY = lerp(camY, player.y, Math.min(1, dt * 6));
  flash = Math.max(0, flash - dt * 1.6);
  effects = effects.filter((e) => (e.t += dt) < 0.9);
}

function render(time) {
  ctx.fillStyle = "#06070a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const ox = clamp(camX - VIEW_W / 2, 0, MAP_W - VIEW_W);
  const oy = clamp(camY - VIEW_H / 2, 0, MAP_H - VIEW_H);
  const sx = (x) => (x - ox) * TILE;
  const sy = (y) => (y - oy) * TILE;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let my = Math.floor(oy) - 1; my < oy + VIEW_H + 1; my++) {
    for (let mx = Math.floor(ox) - 1; mx < ox + VIEW_W + 1; mx++) {
      if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) continue;
      if (!explored[my][mx]) continue;
      drawTile(map[my][mx], sx(mx), sy(my), isVisible(mx, my));
    }
  }

  // loot — gentle pulse
  for (const it of loot) {
    if (!explored[it.y][it.x]) continue;
    const pulse = 0.6 + 0.4 * Math.sin(time * 3 + it.phase);
    drawGlyph("◆", sx(it.x), sy(it.y), `rgba(217,164,65,${isVisible(it.x, it.y) ? pulse : 0.25})`);
  }
  // monsters — subtle bob
  for (const m of monsters) {
    if (!isVisible(m.x, m.y)) continue;
    const bob = Math.sin(time * 4 + m.bob) * 2;
    drawGlyph(m.glyph, sx(m.rx), sy(m.ry) + bob, "#e0564a");
  }
  // player
  drawGlyph("@", sx(player.rx), sy(player.ry), "#e9c46a");

  // floating numbers
  for (const e of effects) {
    const a = 1 - e.t / 0.9;
    ctx.globalAlpha = a;
    ctx.fillStyle = e.color;
    ctx.font = "bold 14px monospace";
    ctx.fillText(e.text, sx(e.x) + TILE / 2, sy(e.y) + TILE / 2 - e.t * 26);
    ctx.globalAlpha = 1;
  }

  // torch-flicker vignette
  const flick = 0.5 + 0.04 * Math.sin(time * 9) + 0.03 * Math.sin(time * 23);
  const g = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, canvas.height / 3.2,
    canvas.width / 2, canvas.height / 2, canvas.height / 1.05);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${flick})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // damage flash
  if (flash > 0) {
    ctx.fillStyle = `rgba(150,20,20,${flash * 0.4})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawTile(t, px, py, vis) {
  let base;
  if (t === WALL) base = vis ? "#272b38" : "#15171f";
  else if (t === CORRIDOR) base = vis ? "#191c25" : "#0d0f15";
  else base = vis ? "#20242f" : "#101218";
  ctx.fillStyle = base;
  ctx.fillRect(px, py, TILE, TILE);

  if (t === WALL) {
    ctx.fillStyle = vis ? "#31374a" : "#1b1e29";
    ctx.fillRect(px + 1, py + 1, TILE - 2, 3);
  } else {
    ctx.strokeStyle = vis ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.015)";
    ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  }
  if (t === STAIRS) {
    ctx.fillStyle = vis ? "#4aa3c7" : "#244a59";
    ctx.font = `bold ${TILE - 6}px monospace`;
    ctx.fillText(">", px + TILE / 2, py + TILE / 2 + 1);
  }
}

function drawGlyph(ch, px, py, color) {
  ctx.fillStyle = color;
  ctx.font = `bold ${TILE - 6}px monospace`;
  ctx.fillText(ch, px + TILE / 2, py + TILE / 2 + 1);
}

// ── HUD + inventory + log + overlay ──────────────────────────────────────────
function updateHud() {
  document.getElementById("hud-depth").textContent = depth + 1;
  document.getElementById("hud-atk").textContent = player.atk;
  document.getElementById("hud-items").textContent = player.items.length;
  const pct = clamp((player.hp / player.maxHp) * 100, 0, 100);
  document.getElementById("hp-fill").style.width = pct + "%";
  document.getElementById("hp-text").textContent = `${player.hp} / ${player.maxHp}`;
  renderInventory();
}

function renderInventory() {
  const el = document.getElementById("inv");
  if (!player.items.length) { el.innerHTML = '<div class="inv-empty">(empty)</div>'; return; }
  const counts = {};
  for (const n of player.items) counts[n] = (counts[n] || 0) + 1;
  el.innerHTML = "";
  for (const name of Object.keys(counts)) {
    const low = name.toLowerCase();
    let icon = "◆", cls = "other";
    if (["sword", "axe", "dagger", "blade", "spear", "bow"].some((w) => low.includes(w))) { icon = "⚔"; cls = "wpn"; }
    else if (["potion", "elixir", "vial", "flask"].some((w) => low.includes(w))) { icon = "♥"; cls = "pot"; }
    const row = document.createElement("div");
    row.className = "inv-row " + cls;
    row.innerHTML = `<span class="inv-icon">${icon}</span><span class="inv-name">${name}</span>` +
      (counts[name] > 1 ? `<span class="inv-x">×${counts[name]}</span>` : "");
    el.appendChild(row);
  }
}

function setRoomText(desc, atmo, loading) {
  const d = document.getElementById("room-desc");
  d.textContent = desc;
  d.classList.toggle("loading", !!loading);
  document.getElementById("room-atmo").textContent = atmo || "";
  document.getElementById("room-name").textContent = loading ? "Generating…" : `Depth ${depth + 1}`;
}

function log(msg, cls) {
  const el = document.getElementById("log");
  const line = document.createElement("div");
  line.className = "e " + (cls || "");
  line.textContent = msg;
  el.prepend(line);
  while (el.children.length > 30) el.removeChild(el.lastChild);
}

const overlay = document.getElementById("overlay");

function gameOver(escaped) {
  dead = true;
  document.getElementById("overlay-title").textContent = escaped ? "☀ YOU ESCAPED" : "⚰ YOU HAVE FALLEN";
  document.getElementById("overlay-sub").textContent =
    `Reached depth ${depth + 1} · ${player.items.length} items · ATK ${player.atk}`;
  document.getElementById("overlay-btn").textContent = "▶ Crawl again";
  overlay.classList.remove("hidden");
}

function startGame() {
  overlay.classList.add("hidden");
  depth = 0;
  dead = false;
  player = newPlayer();
  document.getElementById("log").innerHTML = "";
  log("The iron door groans shut behind you.", "sys");
  generateLevel();
  updateHud();
}

// ── input ──────────────────────────────────────────────────────────────────────
const MOVES = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
};

window.addEventListener("keydown", (e) => {
  if (!overlay.classList.contains("hidden")) return;
  const mv = MOVES[e.key];
  if (mv) { e.preventDefault(); tryMove(mv[0], mv[1]); }
});

document.getElementById("overlay-btn").addEventListener("click", startGame);
if (location.hash === "#autostart") window.addEventListener("load", startGame);

document.getElementById("overlay-art").textContent =
`  ██████╗██████╗ ██╗   ██╗██████╗ ████████╗
 ██╔════╝██╔══██╗╚██╗ ██╔╝██╔══██╗╚══██╔══╝
 ██║     ██████╔╝ ╚████╔╝ ██████╔╝   ██║
 ╚██████╗██║  ██║   ██║   ██║        ██║`;

requestAnimationFrame(frame);
