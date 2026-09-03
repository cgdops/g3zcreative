#!/usr/bin/env python3
import json, sys, collections, pathlib
d = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
recs = d["records"]; N = len(recs)
print(f"=== {d['client']} — AI CITATION BASELINE — {d['run_at']} ===")
print(f"Platform: ChatGPT (web search forced) | US/en | {d['prompts']} prompts x {d['runs_per_prompt']} runs = {N} calls")
print(f"Cost: ${d['spend']:.4f}\n")
cited = sum(r["cited"] for r in recs); ment = sum(r["mentioned"] for r in recs)
print(f"OVERALL citation rate (linked as source): {cited}/{N} = {cited/N*100:.1f}%")
print(f"OVERALL mention rate  (named in answer) : {ment}/{N} = {ment/N*100:.1f}%\n")
print("BY BUCKET                cited/runs   rate")
for b in ["discovery","comparison","problem","vertical","branded"]:
    rs = [r for r in recs if r["bucket"]==b]
    if rs: print(f"  {b:12} {sum(r['cited'] for r in rs):>8}/{len(rs):<8} {sum(r['cited'] for r in rs)/len(rs)*100:5.1f}%")
print("\nBY PROMPT (cited runs / 3)")
byid = collections.OrderedDict()
for r in recs: byid.setdefault(r["id"], []).append(r)
for pid, rs in byid.items():
    c = sum(r["cited"] for r in rs); m = sum(r["mentioned"] for r in rs)
    flag = "FLICKER" if 0 < c < len(rs) else ("HIT    " if c else "       ")
    print(f"  {flag} {pid:4} {c}/{len(rs)} cited  {m}/{len(rs)} ment   {rs[0]['prompt'][:56]}")
nb = [r for r in recs if r["bucket"] != "branded"]
dom = collections.Counter()
for r in nb: dom.update(set(r["source_domains"]))
print(f"\nSHARE OF VOICE — non-branded prompts only ({len(nb)} runs)")
for dm, c in dom.most_common(20): print(f"  {dm:38} {c:>4} runs   {c/len(nb)*100:5.1f}%")
brands = collections.Counter()
for r in nb: brands.update(set(r["brands_listed"]))
print("\nTOP BRANDS NAMED IN ANSWERS (non-branded prompts)")
for b, c in brands.most_common(12): print(f"  {b:42} {c}")
urls = collections.Counter()
for r in recs: urls.update(r["cited_urls"])
print("\nOUR PAGES CITED (all prompts)")
for u, c in urls.most_common(): print(f"  {c:>3}x  {u}")
