"""
Wowhead Forever Ingestion and Drop Extractor.
Extracts candidate farming mobs and their complete drop tables.
"""

import requests
import re
import json
import time
from pathlib import Path
from typing import List, Dict, Any, Optional

CACHE_DIR = Path(__file__).resolve().parent / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

ZONE_NAMES = {
    14: "Durotar",
    215: "Mulgore",
    85: "Tirisfal Glades",
    17: "The Barrens",
    130: "Silverpine Forest",
    331: "Ashenvale",
    406: "Stonetalon Mountains",
    400: "Thousand Needles",
    267: "Hillsbrad Foothills",
    36: "Alterac Mountains",
    45: "Arathi Highlands",
    33: "Stranglethorn Vale",
    405: "Desolace",
    4: "Blasted Lands",
    3: "Badlands",
    8: "Swamp of Sorrows",
    440: "Tanaris",
    357: "Feralas",
    47: "The Hinterlands",
    51: "Searing Gorge",
    361: "Felwood",
    618: "Winterspring",
    28: "Western Plaguelands",
    139: "Eastern Plaguelands",
    1377: "Silithus",
    46: "Burning Steppes",
    41: "Deadwind Pass"
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
}

def get_zone_name(loc_list: List[int]) -> str:
    if not loc_list:
        return "Unknown Location"
    first_id = loc_list[0]
    return ZONE_NAMES.get(first_id, f"Zone {first_id}")

def fetch_farmable_npcs_by_level(min_lvl: int, max_lvl: int) -> List[Dict[str, Any]]:
    """
    Fetches candidate farmable NPCs for Horde within [min_lvl, max_lvl].
    """
    cache_path = CACHE_DIR / f"npcs_lvl_{min_lvl}_{max_lvl}.json"
    if cache_path.exists():
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)

    url = f"https://www.wowhead.com/forever/npcs?filter=minle={min_lvl};maxle={max_lvl}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=12)
        if r.status_code != 200:
            print(f"Failed to fetch NPCs for lvl {min_lvl}-{max_lvl}: Status {r.status_code}")
            return []

        m = re.search(r'"data":(\[\{.*?"name":.*?\}\])\s*,\s*"extraCols"', r.text)
        if not m:
            print(f"No listview data found for lvl {min_lvl}-{max_lvl}")
            return []

        all_npcs = json.loads(m.group(1))
        farmable = []
        for npc in all_npcs:
            # 1. Normal classification (0), boss=0, no vendor/trainer tag
            if npc.get("classification") != 0 or npc.get("boss") != 0 or npc.get("tag"):
                continue
            # 2. Hostile to Horde: react[1] <= 0
            react = npc.get("react")
            if not react or len(react) < 2 or react[1] is None or react[1] > 0:
                continue
            # 3. Must have world spawn location
            locs = npc.get("location", [])
            if not locs:
                continue
            
            npc["zone_name"] = get_zone_name(locs)
            farmable.append(npc)

        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(farmable, f, indent=2)

        return farmable
    except Exception as e:
        print(f"Error fetching NPCs {min_lvl}-{max_lvl}: {e}")
        return []

def fetch_npc_drops(npc_id: int) -> List[Dict[str, Any]]:
    """
    Fetches drop table for an individual NPC with caching.
    """
    cache_path = CACHE_DIR / f"drops_{npc_id}.json"
    if cache_path.exists():
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    url = f"https://www.wowhead.com/forever/npc={npc_id}"
    try:
        time.sleep(0.3)  # Gentle rate limit delay
        r = requests.get(url, headers=HEADERS, timeout=12)
        if r.status_code != 200:
            return []

        # Find drops listview
        m = re.search(r'id:\s*[\'"]drops[\'"].*?data:\s*(\[\{.*?\}\])\s*(?:,\s*\w+:|\}\);)', r.text, re.DOTALL)
        if not m:
            return []

        drops = json.loads(m.group(1))
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(drops, f, indent=2)
        return drops
    except Exception as e:
        print(f"Error fetching drops for NPC {npc_id}: {e}")
        return []
