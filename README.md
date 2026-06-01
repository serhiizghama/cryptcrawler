<div align="center">

```
  ██████╗██████╗ ██╗   ██╗██████╗ ████████╗
 ██╔════╝██╔══██╗╚██╗ ██╔╝██╔══██╗╚══██╔══╝
 ██║     ██████╔╝ ╚████╔╝ ██████╔╝   ██║
 ██║     ██╔══██╗  ╚██╔╝  ██╔═══╝    ██║
 ╚██████╗██║  ██║   ██║   ██║        ██║
  ╚═════╝╚═╝  ╚═╝   ╚═╝   ╚═╝        ╚═╝

  ██████╗██████╗  █████╗ ██╗    ██╗██╗     ███████╗██████╗
 ██╔════╝██╔══██╗██╔══██╗██║    ██║██║     ██╔════╝██╔══██╗
 ██║     ██████╔╝███████║██║ █╗ ██║██║     █████╗  ██████╔╝
 ██║     ██╔══██╗██╔══██║██║███╗██║██║     ██╔══╝  ██╔══██╗
 ╚██████╗██║  ██║██║  ██║╚███╔███╔╝███████╗███████╗██║  ██║
  ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚══════╝╚══════╝╚═╝  ╚═╝
```

**A terminal roguelike where every room is narrated live.**  
No two runs are ever the same.

![Python](https://img.shields.io/badge/python-3.8%2B-blue?style=flat-square&logo=python&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey?style=flat-square)
![Gemini](https://img.shields.io/badge/powered%20by-Gemini%20CLI-4285F4?style=flat-square&logo=google&logoColor=white)

</div>

---

## What is this?

CryptCrawler is a text roguelike where the dungeon is **generated in real time** — rooms, monsters, atmosphere, and loot are all narrated on the fly by Gemini. Every playthrough is unique. No prewritten templates, no repeated descriptions.

Think [Zork](https://en.wikipedia.org/wiki/Zork), but the dungeon master never sleeps and never runs out of ideas.

```
  ▓ DEPTH 4

  A former library, its shelves long since collapsed. Tomes lie
  scattered across the floor, their pages turned to black mulch.
  Something has nested in the far corner — recently.

  ╰─ You hear the rustle of pages turning, though there is no wind.

  ⚔  A Shadow Wraith stands before you!  [9 HP]
  ◆  You spot: silver dagger

  Exits: NORTH │ EAST
  ♥ [████████░░░░] 12/20  ATK:6  Items:3

  [north / east]  [i] inventory  [q] quit
  › 
```

---

## Features

- **Live narration** — each room description is generated fresh, shaped by your depth, HP, and inventory
- **Contextual generation** — the dungeon master remembers recent rooms and avoids repetition
- **Scaling danger** — monsters grow stronger the deeper you go
- **Loot that matters** — weapons boost your attack, potions restore health
- **Graceful fallback** — if Gemini is unavailable, hand-crafted rooms keep the game running
- **Zero dependencies** — pure Python stdlib, no packages to install

---

## Requirements

- Python 3.8+
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) installed and authenticated

```bash
# verify Gemini CLI is ready
gemini -p "say hello"
```

---

## Install & Run

```bash
git clone https://github.com/serhiizghama/cryptcrawler.git
cd cryptcrawler
python cryptcrawler.py
```

That's it. No `pip install`, no setup, no config files.

---

## How to Play

| Input | Action |
|-------|--------|
| `north` / `n` | Move north |
| `south` / `s` | Move south |
| `east` / `e` | Move east |
| `west` / `w` | Move west |
| `i` | Open inventory |
| `q` | Quit |
| `ENTER` | Advance combat round |

**Combat** is turn-based — you and the monster trade blows each round until one falls. Weapons found in rooms increase your damage permanently.

---

## Architecture

```
cryptcrawler.py   — game loop, combat, terminal renderer
dungeon.py        — Gemini integration, room parsing, fallback logic
```

Gemini receives the current game state (HP, depth, recent rooms, inventory) and returns a JSON room object. The game parses it and renders the result. If the call fails or times out, a hand-written fallback room is used instead — the game never breaks.

---

## Roadmap

- [ ] Save / load runs
- [ ] Boss encounters at depth milestones
- [ ] Named artifacts with lore
- [ ] ASCII map of explored rooms
- [ ] Multiple dungeon themes (catacombs, ruins, abyssal deep)

---

## License

MIT — do whatever you want with it.
