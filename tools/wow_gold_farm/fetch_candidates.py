import requests
import json
import time
import re
from pathlib import Path

CANDIDATES = [
    # (id, name, zone, minlvl, maxlvl, bracket)
    (3110, "Razormane Scout", "Durotar", 6, 8, "Level 1-10"),
    (3123, "Kolkar Drudge", "Durotar", 6, 8, "Level 1-10"),
    (1508, "Ragged Scavenger", "Tirisfal Glades", 7, 8, "Level 1-10"),
    (3241, "Razormane Geomancer", "The Barrens", 14, 15, "Level 11-18"),
    (3467, "Kolkar Wrangler", "The Barrens", 14, 15, "Level 11-18"),
    (2264, "Hillsbrad Miner", "Hillsbrad Foothills", 22, 23, "Level 19-26"),
    (2269, "Syndicate Footpad", "Hillsbrad Foothills", 20, 21, "Level 19-26"),
    (4120, "Saltstone Basilisk", "Thousand Needles", 30, 31, "Level 27-34"),
    (4130, "Scorpid Hunter", "Thousand Needles", 31, 32, "Level 27-34"),
    (2736, "Lesser Rock Elemental", "Badlands", 37, 38, "Level 35-40"),
    (2318, "Argus Shadow Mage", "Alterac Mountains", 35, 36, "Level 35-40"),
    (2762, "Thundering Exile", "Arathi Highlands", 38, 39, "Level 35-40"),
    (5616, "Wastewander Shadow Mage", "Tanaris", 43, 44, "Level 41-46"),
    (5615, "Wastewander Bandit", "Tanaris", 41, 42, "Level 41-46"),
    (1557, "Bloodsail Raider", "Stranglethorn Vale", 42, 43, "Level 41-46"),
    (5357, "Hatecrest Siren", "Feralas", 49, 50, "Level 47-52"),
    (7040, "Dark Iron Geologist", "Searing Gorge", 48, 49, "Level 47-52"),
    (7156, "Jadefire Felsworn", "Felwood", 51, 52, "Level 53-57"),
    (7440, "Winterfall Ursa", "Winterspring", 54, 55, "Level 53-57"),
    (1836, "Scarlet Spellbinder", "Western Plaguelands", 57, 58, "Level 58-60"),
    (11736, "Twilight Avenger", "Silithus", 58, 60, "Level 58-60"),
    (9464, "Scarlet Archmage", "Eastern Plaguelands", 59, 60, "Level 58-60"),
]

cache_dir = Path(__file__).resolve().parent / "cache"
cache_dir.mkdir(parents=True, exist_ok=True)

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"}

for cid, name, zone, minl, maxl, bracket in CANDIDATES:
    cfile = cache_dir / f"drops_{cid}.json"
    if cfile.exists():
        print(f"[CACHE] {name} (ID {cid})")
        continue
    print(f"[FETCH] {name} (ID {cid})...")
    try:
        r = requests.get(f"https://www.wowhead.com/forever/npc={cid}", headers=headers, timeout=10)
        if r.status_code == 200:
            m = re.search(r'id:\s*[\'"]drops[\'"].*?data:\s*(\[\{.*?\}\])\s*(?:,\s*\w+:|\}\);)', r.text, re.DOTALL)
            if m:
                drops = json.loads(m.group(1))
                with open(cfile, "w", encoding="utf-8") as f:
                    json.dump(drops, f, indent=2)
                print(f"  Saved {len(drops)} drops.")
            else:
                print("  No drops listview found.")
        else:
            print(f"  Status code: {r.status_code}")
    except Exception as e:
        print(f"  Error: {e}")
    time.sleep(0.8)
