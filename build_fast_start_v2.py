#!/usr/bin/env python3
"""
Auto-detect manifest and build fast-start files.

This version is more forgiving:
- Accepts either of these manifest names inside ./data:
    - traits_0001_1000.index.json
    - traits_manifest.json
    - *.index.json (first match)
- Base path can be given as argv[1] or defaults to the current folder.
- Prints exactly which manifest and chunks it's using.

Usage (from your site root that contains /data):
    python build_fast_start_v2.py
or pass an absolute/relative path:
    python build_fast_start_v2.py "C:\path\to\site\root"
"""
import json, sys, glob
from pathlib import Path
from math import log

def load_json(p: Path):
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)

def find_manifest(data_dir: Path) -> Path:
    # Preferred exact file
    exact = data_dir / "traits_0001_1000.index.json"
    if exact.exists():
        return exact
    # Common alternative from earlier versions
    alt = data_dir / "traits_manifest.json"
    if alt.exists():
        return alt
    # Any *.index.json (like traits_0001_1000.index.json)
    idx = list(data_dir.glob("*.index.json"))
    if idx:
        return idx[0]
    raise FileNotFoundError(f"No manifest found in {data_dir}. Expected traits_0001_1000.index.json or traits_manifest.json.")

def main():
    base = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    base = base.resolve()
    data_dir = base / "data"
    chunks_dir = data_dir / "traits_chunks"
    out_dir = data_dir / "fast"
    out_dir.mkdir(parents=True, exist_ok=True)

    if not data_dir.exists():
        raise SystemExit(f"Folder not found: {data_dir}")
    manifest_path = find_manifest(data_dir)
    print(f"Using manifest: {manifest_path}")

    M = load_json(manifest_path)
    files = M.get("files") or []
    if not files:
        raise SystemExit("Manifest has empty files[].")

    # Key name may be 'file' or 'name'
    def file_name(meta):
        return meta.get("file") or meta.get("name")

    # Sanity check chunks
    missing = []
    for meta in files:
        fname = file_name(meta)
        if not fname or not (chunks_dir / fname).exists():
            missing.append(fname or str(meta))
    if missing:
        raise SystemExit("These chunk files are missing under data/traits_chunks:\n  - " + "\n  - ".join(missing))

    # Stats accumulators
    trait_freq = {}   # {trait: {value: count}}
    trait_domain = {} # {trait: set(values)}
    buckets = {}      # {trait_count: number_of_tokens}
    scores = {}       # {token_id: score}
    token_total = int(files[-1].get("end", 0) or 0)

    def keep_entries(row):
        t = (row or {}).get("traits", {})
        out = []
        for k, v in t.items():
            if v is None:
                continue
            sv = str(v).strip()
            if not sv:
                continue
            out.append((k, sv))
        return out

    # Pass 1: frequency & buckets
    for i, meta in enumerate(files, 1):
        fname = file_name(meta)
        p = chunks_dir / fname
        chunk = load_json(p)
        for sid, row in chunk.items():
            traits = keep_entries(row)
            n = len(traits)
            buckets[n] = buckets.get(n, 0) + 1
            for k, v in traits:
                trait_domain.setdefault(k, set()).add(v)
                d = trait_freq.setdefault(k, {})
                d[v] = d.get(v, 0) + 1
        print(f"[{i}/{len(files)}] counted {fname}")

    # Pass 2: scores (observed rarity)
    for i, meta in enumerate(files, 1):
        fname = file_name(meta)
        p = chunks_dir / fname
        chunk = load_json(p)
        for sid, row in chunk.items():
            tid = int(sid)
            traits = keep_entries(row)
            s = 0.0
            for k, v in traits:
                c = trait_freq.get(k, {}).get(v, 1)
                p = c / max(1, token_total)
                if p <= 0: p = 1e-12
                s += -log(p)
            scores[tid] = s
        print(f"[{i}/{len(files)}] scored {fname}")

    # Rank
    rank_list = sorted(scores.items(), key=lambda x: (-x[1], x[0]))
    rank_pairs = [[tid, float(s)] for tid, s in rank_list]

    # Domain as lists
    domain_out = {k: sorted(list(v)) for k, v in trait_domain.items()}

    # Save split + bundle
    import json
    (out_dir / "buckets.json").write_text(json.dumps({str(k): v for k, v in sorted(buckets.items())}, separators=(",", ":")), encoding="utf-8")
    (out_dir / "domain.json").write_text(json.dumps(domain_out, separators=(",", ":")), encoding="utf-8")
    (out_dir / "rank_observed.json").write_text(json.dumps(rank_pairs, separators=(",", ":")), encoding="utf-8")
    (out_dir / "traits_fast.json").write_text(json.dumps({"buckets": {str(k): v for k, v in sorted(buckets.items())}, "domain": domain_out, "rank": rank_pairs}, separators=(",", ":")), encoding="utf-8")

    print("Fast-start files written to:", out_dir)

if __name__ == "__main__":
    main()
