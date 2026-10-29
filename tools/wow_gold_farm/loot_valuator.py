"""
Loot Valuation Engine for Classic Era WoW.
Calculates deterministic Expected Value E[Copper] per kill for items and coins.
"""

from typing import Dict, Any, List

# Approximate baseline commodity values in Copper (1g = 10,000c, 1s = 100c)
AUCTION_COMMODITY_PRICES = {
    # Elemental & Trade Goods
    7067: 35000,    # Elemental Earth (~3.5g)
    7068: 40000,    # Elemental Fire (~4g)
    7069: 15000,    # Elemental Water (~1.5g)
    7070: 45000,    # Elemental Air (~4.5g)
    14342: 30000,   # Felcloth (~3g)
    13926: 380000,  # Golden Pearl (~38g)
    12820: 22000,   # Winterfall Firewater (~2.2g)
    12437: 10000,   # Winterfall E'ko (~1g)
    20404: 8000,    # Encrypted Twilight Text (~80s)
    16252: 2500000, # Formula: Enchant Weapon - Crusader (~250g)
    1057: 4500,     # Small Flame Sac (~45s)
    8499: 800000,   # Tiny Emerald Whelp (~80g)
    7912: 500,      # Solid Stone (~5s)
    2835: 300,      # Coarse Stone (~3s)
    2836: 400,      # Heavy Stone (~4s)
    12365: 2500,    # Dense Stone (~25s)

    # Cloth
    2589: 150,      # Linen Cloth (~1.5s)
    2592: 350,      # Wool Cloth (~3.5s)
    4306: 700,      # Silk Cloth (~7s)
    4338: 1600,     # Mageweave Cloth (~16s)
    14047: 2200,    # Runecloth (~22s)

    # Leather
    2318: 100,      # Light Leather (~1s)
    2319: 250,      # Medium Leather (~2.5s)
    4234: 600,      # Heavy Leather (~6s)
    4304: 1200,     # Thick Leather (~12s)
    8170: 2800,     # Rugged Leather (~28s)
}

def estimate_item_value(item: Dict[str, Any]) -> int:
    """Estimates single-item value in copper."""
    item_id = item.get("id", 0)
    if item_id in AUCTION_COMMODITY_PRICES:
        return AUCTION_COMMODITY_PRICES[item_id]

    quality = item.get("quality", 1)
    reqlevel = item.get("reqlevel", 1) or item.get("level", 1) or 1

    # Quality based baseline approximations
    if quality == 0:  # Poor / Grey junk
        # Low levels: 5-50 copper; mid levels: 1-5 silver; high levels: 5-15 silver
        return max(10, min(1500, int(reqlevel * 25)))
    elif quality == 1:  # Common / White
        return max(20, min(2500, int(reqlevel * 35)))
    elif quality == 2:  # Uncommon / Green
        # Greens scale heavily with level: ~20s at lvl 20, ~1g at lvl 40, ~2.5g at lvl 55
        return max(500, int((reqlevel ** 2.1) * 0.8))
    elif quality == 3:  # Rare / Blue
        return max(2000, int((reqlevel ** 2.3) * 2.0))
    elif quality >= 4:  # Epic / Purple
        return max(50000, int((reqlevel ** 2.5) * 8.0))

    return 50

def calculate_expected_copper_per_kill(npc: Dict[str, Any], drops: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Computes Expected Value E[Copper] per kill.
    E[Copper] = CoinDrop + sum(DropRate_i * ItemValue_i)
    """
    min_lvl = npc.get("minlevel", 1)
    max_lvl = npc.get("maxlevel", min_lvl)
    avg_lvl = (min_lvl + max_lvl) / 2.0
    npc_type = npc.get("type", 0)  # 7 = Humanoid, 1 = Beast, 4 = Elemental, etc.

    # 1. Base Coin Drops (Humanoids, Undead, Demons, Giants drop raw coin)
    expected_coin = 0
    if npc_type in (7, 6, 3, 5):  # Humanoid, Undead, Demon, Giant
        # Base coin curve: Level 1-10 -> ~25c; Level 20 -> ~2s (200c); Level 40 -> ~10s (1000c); Level 58 -> ~50s (5000c)
        expected_coin = int(max(5, (avg_lvl ** 2.2) * 0.6))

    # 2. Drop table expected value
    expected_loot_val = 0.0
    top_drops = []

    for d in drops:
        count = d.get("count", 0)
        outof = d.get("outof", 0)
        if outof <= 0 or count <= 0:
            continue
        
        drop_rate = count / outof
        item_val = estimate_item_value(d)
        val_contribution = drop_rate * item_val
        expected_loot_val += val_contribution

        if val_contribution >= 25 or item_val >= 20000:
            top_drops.append({
                "item_id": d.get("id"),
                "name": d.get("name", "Unknown"),
                "quality": d.get("quality", 1),
                "drop_rate_pct": round(drop_rate * 100, 2),
                "unit_value_copper": item_val,
                "ev_copper": round(val_contribution, 1)
            })

    total_expected_copper = int(expected_coin + expected_loot_val)
    top_drops.sort(key=lambda x: x["ev_copper"], reverse=True)

    return {
        "expected_coin_copper": expected_coin,
        "expected_loot_copper": int(expected_loot_val),
        "total_ev_copper": total_expected_copper,
        "total_ev_gold": round(total_expected_copper / 10000.0, 3),
        "top_drops": top_drops[:5]
    }
