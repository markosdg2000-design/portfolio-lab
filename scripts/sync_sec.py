#!/usr/bin/env python3
import gzip, json, os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]
CFG=ROOT/"managers.json"
DATA=ROOT/"data"
HIST=DATA/"history"
UPSTREAM="https://raw.githubusercontent.com/LuxAlgo/market-trackers-data/main/thirteenf/holdings"
YEARS=(2025,2026)
UA="PortfolioLab/1.0 (+https://github.com/markosdg2000-design/portfolio-lab)"

def now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z")

def get_bytes(url):
    req=Request(url,headers={"User-Agent":UA,"Accept":"application/octet-stream,*/*"})
    with urlopen(req,timeout=120) as r:
        return r.read()

def quarter(d):
    y,m,_=map(int,d.split("-"))
    return f"{y}-Q{(m-1)//3+1}"

def load_upstream():
    rows=[]
    for y in YEARS:
        url=f"{UPSTREAM}/snapshot-{y}.json.gz"
        print("Download",url,flush=True)
        raw=gzip.decompress(get_bytes(url))
        part=json.loads(raw.decode("utf-8"))
        if not isinstance(part,list):
            raise RuntimeError(f"Unexpected upstream schema for {y}")
        rows.extend(part)
    return rows

def norm_cik(v):
    return str(v or "").lstrip("0").zfill(10)

def normalize(row, manager):
    prov=row.get("provenance") or {}
    period=row.get("periodEnd")
    filed=row.get("filedAt")
    acc=row.get("accessionNumber","")
    return {
        "managerId":manager["id"],"manager":manager["name"],"market":"US",
        "source":"SEC EDGAR via LuxAlgo CC0 mirror","disclosureType":"13F",
        "currency":"USD","quarter":quarter(period),"reportDate":period,
        "filingDate":filed,"form":"13F-HR","accession":acc,
        "ticker":row.get("ticker") or "","issuer":row.get("issuerName") or "",
        "titleOfClass":"","cusip":row.get("cusip") or "",
        "identifier":row.get("cusip") or "","entityKey":row.get("cusip") or "",
        "value":row.get("valueUsd") or 0,"shares":row.get("shares") or 0,
        "shareType":row.get("shareType") or "","putCall":row.get("putCall") or "",
        "filingUrl":prov.get("sourceUrl") or "","sourceUrl":prov.get("sourceUrl") or "",
        "sourceConfidence":prov.get("confidence"),"needsReview":bool(prov.get("needsReview",False))
    }

def add_changes(rows):
    grouped=defaultdict(list)
    for r in rows:
        grouped[(r["managerId"],r["cusip"],r.get("putCall",""))].append(r)
    for arr in grouped.values():
        arr.sort(key=lambda x:x["reportDate"])
        prev=None
        for r in arr:
            if prev is None:
                r["changeStatus"]="BASE"; r["sharesChange"]=None; r["sharesChangePct"]=None
            else:
                d=r["shares"]-prev["shares"]
                r["sharesChange"]=d
                r["sharesChangePct"]=(d/prev["shares"]*100) if prev["shares"] else None
                r["changeStatus"]="INCREASED" if d>0 else "REDUCED" if d<0 else "UNCHANGED"
            prev=r

def main():
    cfg=json.loads(CFG.read_text(encoding="utf-8"))
    managers=[m for m in cfg["managers"] if m.get("auto_sync") and m.get("cik")]
    by_cik={norm_cik(m["cik"]):m for m in managers}
    upstream=load_upstream()
    selected=[]
    for row in upstream:
        cik=norm_cik(row.get("managerCik"))
        m=by_cik.get(cik)
        if m and row.get("periodEnd") and row.get("cusip"):
            selected.append(normalize(row,m))
    if not selected:
        raise SystemExit("Mirror downloaded successfully but no configured manager holdings matched")
    # Keep the latest four report periods per manager.
    keep=[]
    filings=[]
    for m in managers:
        mr=[r for r in selected if r["managerId"]==m["id"]]
        periods=sorted({r["reportDate"] for r in mr},reverse=True)[:4]
        mr=[r for r in mr if r["reportDate"] in periods]
        keep.extend(mr)
        for p in periods:
            pr=[r for r in mr if r["reportDate"]==p]
            if pr:
                filings.append({"managerId":m["id"],"manager":m["name"],"reportDate":p,
                    "quarter":quarter(p),"filingDate":max(r["filingDate"] for r in pr),
                    "accession":pr[0]["accession"],"holdingCount":len(pr),
                    "filingUrl":pr[0]["filingUrl"]})
    add_changes(keep)
    keep.sort(key=lambda r:(r["quarter"],r["managerId"],r["cusip"],r.get("putCall","")))
    periods=sorted({r["quarter"] for r in keep})
    counts={m["id"]:sum(1 for r in keep if r["managerId"]==m["id"]) for m in managers}
    meta={"generatedAt":now(),"source":"SEC EDGAR public filings via LuxAlgo CC0 daily mirror",
          "configuredManagers":len(managers),"managerCount":sum(1 for v in counts.values() if v),
          "holdingCount":len(keep),"periods":periods,"managerHoldingCounts":counts,
          "upstream":"LuxAlgo/market-trackers-data","syntheticData":False,
          "note":"Every row retains the primary SEC filing URL. CUSIP is the authoritative identifier; ticker is left blank unless supplied by the source."}
    DATA.mkdir(exist_ok=True); HIST.mkdir(parents=True,exist_ok=True)
    (DATA/"latest.json").write_text(json.dumps({"meta":meta,"filings":filings,"holdings":keep},ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    (DATA/"sync-status.json").write_text(json.dumps({"generatedAt":meta["generatedAt"],"ok":True,"holdingCount":len(keep),"managerCount":meta["managerCount"],"errors":[]},separators=(",",":")),encoding="utf-8")
    for q in periods:
        qrows=[r for r in keep if r["quarter"]==q]
        (HIST/f"{q}.json").write_text(json.dumps({"meta":{"generatedAt":meta["generatedAt"],"period":q,"holdingCount":len(qrows)},"holdings":qrows},ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("Published",len(keep),"real SEC-derived holdings across",meta["managerCount"],"managers",flush=True)

if __name__=="__main__":
    try:
        main()
    except Exception as e:
        DATA.mkdir(exist_ok=True)
        (DATA/"sync-status.json").write_text(json.dumps({"generatedAt":now(),"ok":False,"fatal":repr(e)},separators=(",",":")),encoding="utf-8")
        print("FATAL",repr(e),flush=True)
        raise
