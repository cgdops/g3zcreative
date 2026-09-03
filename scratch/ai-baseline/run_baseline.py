#!/usr/bin/env python3
"""
AI citation baseline runner. Reusable for any client.
Usage: python run_baseline.py prompts-<client>.json
Writes: raw/<promptid>-r<n>.json  and  baseline-<client>.json
"""
import base64, json, os, sys, time, pathlib, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).parent
CFG  = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))

# creds from .env
env = {}
for line in (ROOT/"../../.env").resolve().read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k,v = line.split("=",1); env[k.strip()] = v.strip()
AUTH = base64.b64encode(f"{env['DATAFORSEO_LOGIN']}:{env['DATAFORSEO_PASSWORD']}".encode()).decode()
BASE = "https://api.dataforseo.com/v3"

def call(path, payload=None, method="POST"):
    req = urllib.request.Request(
        BASE+path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Authorization": f"Basic {AUTH}", "Content-Type": "application/json"},
        method=method)
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode())

def balance():
    d = call("/appendix/user_data", method="GET")
    return d["tasks"][0]["result"][0]["money"]["balance"]

def scrape(prompt_text):
    return call("/ai_optimization/chat_gpt/llm_scraper/live/advanced", [{
        "keyword": prompt_text,
        "location_code": CFG["location_code"],
        "language_code": CFG["language_code"],
        "force_web_search": True,
    }])

DOMAIN  = CFG["domain"].lower()
ALIASES = [a.lower() for a in CFG["brand_aliases"]]
RAW = ROOT/"raw"; RAW.mkdir(exist_ok=True)

def analyze(resp):
    """Return one run record: citation/mention status + competitor set."""
    task = resp["tasks"][0]
    res  = (task.get("result") or [{}])[0]
    items = res.get("items") or []
    sources, brands = [], []
    for it in items:
        sources += it.get("sources") or []
        brands  += it.get("brand_entities") or []
    sources += res.get("sources") or []
    text = " ".join((it.get("markdown") or "") for it in items)
    tl = text.lower()

    cited_urls = sorted({s.get("url","").split("?")[0] for s in sources
                         if DOMAIN in (s.get("domain","") or "").lower()})
    src_domains = sorted({(s.get("domain","") or "").lower().replace("www.","")
                          for s in sources if s.get("domain")})
    brand_names = [b.get("title","") for b in brands]
    return {
        "cost": task.get("cost", 0),
        "cited":     bool(cited_urls),                                  # linked as a source
        "mentioned": any(a in tl for a in ALIASES),                     # named in the answer text
        "in_brand_entities": any(any(a in b.lower() for a in ALIASES) for b in brand_names),
        "cited_urls": cited_urls,
        "source_domains": src_domains,
        "brands_listed": brand_names,
        "total_sources": len(sources),
        "answer_chars": len(text),
    }

def job(args):
    p, run = args
    key = f"{p['id']}-r{run}"
    try:
        resp = scrape(p["text"])
        (RAW/f"{key}.json").write_text(json.dumps(resp), encoding="utf-8")
        rec = analyze(resp)
    except Exception as e:
        rec = {"error": str(e), "cost": 0, "cited": False, "mentioned": False,
               "in_brand_entities": False, "cited_urls": [], "source_domains": [],
               "brands_listed": [], "total_sources": 0, "answer_chars": 0}
    rec.update({"id": p["id"], "bucket": p["bucket"], "prompt": p["text"], "run": run})
    print(f"  {key:8} cited={str(rec['cited']):5} mentioned={str(rec['mentioned']):5} "
          f"sources={rec['total_sources']}", flush=True)
    return rec

if __name__ == "__main__":
    b0 = balance()
    print(f"Balance before: ${b0:.4f}")
    jobs = [(p, r) for p in CFG["prompts"] for r in range(1, CFG["runs_per_prompt"]+1)]
    print(f"Running {len(jobs)} calls ({len(CFG['prompts'])} prompts x {CFG['runs_per_prompt']} runs)...")
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=8) as ex:
        records = list(ex.map(job, jobs))
    b1 = balance()
    out = {"client": CFG["client"], "domain": CFG["domain"],
           "run_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
           "prompts": len(CFG["prompts"]), "runs_per_prompt": CFG["runs_per_prompt"],
           "calls": len(jobs), "elapsed_sec": round(time.time()-t0,1),
           "balance_before": b0, "balance_after": b1,
           "spend": round(b0-b1, 4), "records": records}
    (ROOT/f"baseline-{CFG['domain'].split('.')[0]}.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"\nDone in {out['elapsed_sec']}s. Spend: ${out['spend']:.4f}  (${out['spend']/len(jobs):.5f}/call)")
