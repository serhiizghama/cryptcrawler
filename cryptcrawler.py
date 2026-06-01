#!/usr/bin/env python3
"""
CryptCrawler — a terminal roguelike where every room is narrated live.
"""

import sys
import random
from dungeon import DungeonMaster

# ── ANSI colours ──────────────────────────────────────────────────────────────

R = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
WHITE = "\033[97m"
DARK_RED = "\033[31m"
DARK_YELLOW = "\033[33m"
DARK_CYAN = "\033[36m"

# ── ASCII art ─────────────────────────────────────────────────────────────────

LOGO = f"""{DARK_RED}
  ██████╗██████╗ ██╗   ██╗██████╗ ████████╗
 ██╔════╝██╔══██╗╚██╗ ██╔╝██╔══██╗╚══██╔══╝
 ██║     ██████╔╝ ╚████╔╝ ██████╔╝   ██║
 ██║     ██╔══██╗  ╚██╔╝  ██╔═══╝    ██║
 ╚██████╗██║  ██║   ██║   ██║        ██║
  ╚═════╝╚═╝  ╚═╝   ╚═╝   ╚═╝        ╚═╝
{R}{DARK_YELLOW}
  ██████╗██████╗  █████╗ ██╗    ██╗██╗     ███████╗██████╗
 ██╔════╝██╔══██╗██╔══██╗██║    ██║██║     ██╔════╝██╔══██╗
 ██║     ██████╔╝███████║██║ █╗ ██║██║     █████╗  ██████╔╝
 ██║     ██╔══██╗██╔══██║██║███╗██║██║     ██╔══╝  ██╔══██╗
 ╚██████╗██║  ██║██║  ██║╚███╔███╔╝███████╗███████╗██║  ██║
  ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚══════╝╚══════╝╚═╝  ╚═╝
{R}"""


# ── Player ────────────────────────────────────────────────────────────────────

class Player:
    def __init__(self):
        self.max_hp = 20
        self.hp = 20
        self.attack = 4
        self.items = []
        self.rooms_visited = 0

    @property
    def alive(self):
        return self.hp > 0

    def absorb(self, item: str):
        self.items.append(item)
        low = item.lower()
        if any(w in low for w in ("sword", "axe", "dagger", "blade", "spear", "bow")):
            self.attack += 2
            return f"+2 ATK from {item}"
        if any(w in low for w in ("potion", "elixir", "vial", "flask")):
            heal = random.randint(4, 8)
            self.hp = min(self.max_hp, self.hp + heal)
            return f"+{heal} HP from {item}"
        return f"Picked up {item}"

    def context(self):
        return {"hp": self.hp, "max_hp": self.max_hp, "items": self.items[-3:]}

    def strike(self, monster: dict) -> int:
        dmg = random.randint(1, self.attack)
        monster["hp"] -= dmg
        if monster["hp"] <= 0:
            monster["alive"] = False
        return dmg


# ── Renderer ──────────────────────────────────────────────────────────────────

def divider(char="─", width=58):
    print(f"\n{DIM}{char * width}{R}")


def hp_bar(hp, max_hp):
    filled = round((hp / max_hp) * 12)
    bar = "█" * filled + "░" * (12 - filled)
    col = GREEN if hp > max_hp * 0.5 else YELLOW if hp > max_hp * 0.25 else RED
    return f"{col}♥ [{bar}] {hp}/{max_hp}{R}"


def render_room(room: dict, player: Player):
    divider("═")
    depth_label = f"DEPTH {player.rooms_visited + 1}"
    print(f"\n  {CYAN}{BOLD}▓ {depth_label}{R}")
    print(f"\n  {WHITE}{room['description']}{R}")

    if room.get("atmosphere"):
        print(f"\n  {DIM}╰─ {room['atmosphere']}{R}")

    if room.get("monster") and room["monster"].get("alive"):
        m = room["monster"]
        print(f"\n  {RED}{BOLD}⚔  A {m['name']} stands before you!{R}  {DIM}[{m['hp']} HP]{R}")

    if room.get("loot"):
        for item in room["loot"]:
            print(f"  {YELLOW}◆  You spot: {item}{R}")

    exits = room.get("exits", ["north"])
    print(f"\n  {GREEN}Exits:{R} {' │ '.join(e.upper() for e in exits)}")
    print(f"  {hp_bar(player.hp, player.max_hp)}  {DIM}ATK:{player.attack}  Items:{len(player.items)}{R}")


def render_hud(player: Player):
    print(f"  {hp_bar(player.hp, player.max_hp)}  {DIM}ATK:{player.attack}{R}")


def show_inventory(player: Player):
    divider()
    print(f"\n  {YELLOW}{BOLD}── INVENTORY ──{R}")
    if not player.items:
        print(f"  {DIM}(empty){R}")
    else:
        for i, it in enumerate(player.items, 1):
            print(f"  {i:>2}. {it}")
    print()


def splash():
    print(LOGO)
    print(f"  {DIM}A dungeon narrated live. No two runs alike.{R}\n")
    input(f"  {YELLOW}Press ENTER to descend...{R} ")


def game_over(player: Player):
    divider("═")
    if player.hp <= 0:
        print(f"\n  {RED}{BOLD}⚰  YOU HAVE FALLEN{R}")
        print(f"\n  {DIM}The darkness claims you. Your torch gutters out.{R}")
    else:
        print(f"\n  {GREEN}{BOLD}☀  YOU ESCAPED{R}")
        print(f"\n  {DIM}Daylight burns your dungeon-adapted eyes.{R}")

    print(f"\n  Rooms explored : {YELLOW}{player.rooms_visited}{R}")
    print(f"  Items collected: {YELLOW}{len(player.items)}{R}")
    print(f"  Final HP       : {YELLOW}{player.hp}/{player.max_hp}{R}")
    print(f"  Attack power   : {YELLOW}{player.attack}{R}\n")
    divider()


def get_direction(exits: list) -> str:
    options = " / ".join(exits)
    print(f"\n  {DIM}[{options}]  [i] inventory  [q] quit{R}")
    while True:
        try:
            raw = input(f"  {CYAN}› {R}").strip().lower()
        except (EOFError, KeyboardInterrupt):
            return "quit"

        if raw in ("q", "quit"):
            return "quit"
        if raw in ("i", "inv", "inventory"):
            return "inventory"
        for ex in exits:
            if raw == ex or (raw and ex.startswith(raw)):
                return ex
        if raw:
            # accept any input as "move forward"
            return exits[0]


# ── Combat ────────────────────────────────────────────────────────────────────

def run_combat(monster: dict, player: Player):
    print(f"\n  {RED}{'─' * 48}{R}")
    print(f"  {RED}{BOLD}COMBAT: {monster['name']}{R}  {DIM}[{monster['hp']} HP  DMG {monster['damage']}]{R}")
    print(f"  {DIM}(press ENTER each round){R}\n")

    rnd = 1
    while monster["alive"] and player.alive:
        try:
            input(f"  {DIM}Round {rnd} ▸ {R}")
        except (EOFError, KeyboardInterrupt):
            break

        # player strikes
        dmg = player.strike(monster)
        if monster["alive"]:
            print(f"  {GREEN}You hit the {monster['name']} for {dmg} damage.{R}  {DIM}({monster['hp']} HP left){R}")
        else:
            print(f"  {GREEN}You deal {dmg} damage — {monster['name']} falls!{R}")
            break

        # monster strikes
        m_dmg = random.randint(1, monster["damage"])
        player.take_damage = lambda x: setattr(player, "hp", max(0, player.hp - x))  # inline
        player.hp = max(0, player.hp - m_dmg)
        print(f"  {RED}{monster['name']} strikes you for {m_dmg} damage!{R}  "
              f"{hp_bar(player.hp, player.max_hp)}")
        rnd += 1

    print(f"  {RED}{'─' * 48}{R}\n")


# ── Main loop ─────────────────────────────────────────────────────────────────

def main():
    splash()
    dm = DungeonMaster()
    player = Player()

    print(f"\n  {DIM}The iron door groans shut behind you.{R}\n")

    while player.alive:
        print(f"\n  {DIM}[ generating room… ]{R}", end="\r")
        room = dm.generate_room(player.context(), player.rooms_visited)

        render_room(room, player)

        # combat
        monster = room.get("monster")
        if monster and monster.get("alive"):
            run_combat(monster, player)
            if not player.alive:
                break

        # loot
        for item in room.get("loot", []):
            msg = player.absorb(item)
            print(f"  {YELLOW}  → {msg}{R}")

        player.rooms_visited += 1
        exits = room.get("exits", ["north"])

        while True:
            choice = get_direction(exits)
            if choice == "inventory":
                show_inventory(player)
            elif choice == "quit":
                print(f"\n  {DIM}You turn back toward the surface…{R}")
                game_over(player)
                return
            else:
                break

    game_over(player)


if __name__ == "__main__":
    main()
