import subprocess
import json
import random

FALLBACK_ROOMS = [
    {
        "description": "A damp stone corridor stretches before you, walls slick with moisture. Torches flicker in rusted iron sconces, their light barely holding back the dark.",
        "exits": ["north", "east"],
        "monster": None,
        "loot": [],
        "atmosphere": "Water drips somewhere unseen, steady as a heartbeat."
    },
    {
        "description": "A collapsed chamber, half its ceiling caved in. Moonlight filters through the rubble, illuminating dust motes drifting like lazy ghosts.",
        "exits": ["south", "west"],
        "monster": None,
        "loot": ["dusty scroll"],
        "atmosphere": "The air tastes of chalk and old fires."
    },
    {
        "description": "A wide circular room with a dried-up fountain at its center. Strange symbols are carved into the basin, worn smooth by centuries of hands.",
        "exits": ["north"],
        "monster": None,
        "loot": [],
        "atmosphere": "An inexplicable warmth radiates from the stone floor."
    },
    {
        "description": "Narrow shelves line the walls of this former storeroom, still holding cracked clay pots and rotted sacks. Something has been here recently — the dust is disturbed.",
        "exits": ["east", "west"],
        "monster": None,
        "loot": ["health potion"],
        "atmosphere": "The smell of mold and something metallic."
    },
    {
        "description": "A long hall with crumbling pillars, each carved with faces that seem to watch you pass. The far end is swallowed in shadow.",
        "exits": ["north", "south"],
        "monster": None,
        "loot": [],
        "atmosphere": "Your footsteps echo too long. Too many echoes."
    },
]

MONSTERS = [
    ("Giant Rat",        5,  1),
    ("Skeleton Archer",  7,  2),
    ("Goblin Scout",     6,  2),
    ("Cave Spider",      8,  2),
    ("Skeleton Warrior", 10, 3),
    ("Shadow Wraith",    9,  3),
    ("Stone Golem",      15, 4),
    ("Dungeon Troll",    13, 4),
    ("Cursed Knight",    14, 4),
    ("Lich Apprentice",  12, 5),
]


class DungeonMaster:
    def __init__(self):
        self.room_history = []

    def generate_room(self, player_context, depth):
        prompt = self._build_prompt(player_context, depth)
        output = self._call_gemini(prompt)

        if output:
            room = self._parse_room(output)
            if room:
                if room.get("monster"):
                    room["monster"]["alive"] = True
                    room["monster"].setdefault("damage", 2)
                self.room_history.append(room["description"][:60])
                return room

        return self._fallback_room(depth)

    def _call_gemini(self, prompt):
        try:
            result = subprocess.run(
                ["gemini", "-p", prompt],
                capture_output=True,
                text=True,
                timeout=25,
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout
        except subprocess.TimeoutExpired:
            pass
        except FileNotFoundError:
            pass
        # fallback: pipe via stdin
        try:
            result = subprocess.run(
                ["gemini"],
                input=prompt,
                capture_output=True,
                text=True,
                timeout=25,
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout
        except Exception:
            pass
        return None

    def _build_prompt(self, ctx, depth):
        history_note = ""
        if self.room_history:
            recent = " / ".join(self.room_history[-3:])
            history_note = f"Recent rooms (avoid repeating): {recent}"

        monster_chance = min(20 + depth * 8, 65)

        return f"""You are the dungeon master of a dark fantasy roguelike. Generate the next room.

Player: {ctx['hp']}/{ctx['max_hp']} HP | Depth {depth + 1} | Items: {ctx['items'] or 'none'}
{history_note}

Return ONLY a JSON object — no markdown fences, no extra text:
{{
  "description": "2-3 sentences, vivid and atmospheric",
  "exits": ["north"],
  "monster": {{"name": "creature", "hp": 8, "damage": 2, "alive": true}} or null,
  "loot": ["item name"] or [],
  "atmosphere": "one evocative sentence about sound, smell, or feeling"
}}

Rules:
- exits: 1-3 directions from [north, south, east, west]
- monster: {monster_chance}% chance; hp scales with depth; null if peaceful room
- monster damage: 1-{max(2, depth // 2 + 2)}
- loot: 0-2 items; weapons add +2 attack, potions heal; sometimes gold or strange artifacts
- depth {depth + 1}: {"early dungeon, relatively safe" if depth < 3 else "mid dungeon, danger rising" if depth < 7 else "deep dungeon, lethal encounters"}
- make it feel like a real place with history, not a random box"""

    def _parse_room(self, text):
        text = text.strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        if start < 0 or end <= start:
            return None
        try:
            room = json.loads(text[start:end])
            if "description" in room and "exits" in room:
                return room
        except (json.JSONDecodeError, ValueError):
            pass
        return None

    def _fallback_room(self, depth):
        room = random.choice(FALLBACK_ROOMS).copy()
        room["loot"] = list(room["loot"])
        if random.random() < 0.4:
            pool = MONSTERS[: min(len(MONSTERS), max(1, depth + 2))]
            name, base_hp, base_dmg = random.choice(pool)
            room["monster"] = {
                "name": name,
                "hp": base_hp + depth,
                "damage": base_dmg,
                "alive": True,
            }
        else:
            room["monster"] = None
        return room
