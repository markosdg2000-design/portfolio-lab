#!/usr/bin/env python3
import html, json, re, time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]
CFG=ROOT/"managers.json"; DATA=ROOT/"data"; HIST=DATA/"history"
BASE="https://13f.info"
UA="Mozilla/5.0 PortfolioLab/1.0 (+https://github.com/markosdg2000-design/portfolio-lab)"

def now(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z")
def get(url):
    with urlopen(Request(url,headers={"User-Agent":UA,"Accept":"text/html,application/json,*/*"}),timeout=60) as r:
        b=r.read()
    time.sleep(0.15); return b
def accession_hyphen(a):
    a=re.sub(r"\D","",a); return f"{a[:10]}-{a[10:12]}-{a[12:]}" if len(a)>=18 else a
def quarter(d):
    y,m,_=map(int,d.split("-")); return f"{y}-Q{(m-1)//3+1}"
def manager_filings(m):
    # 13f.info resolves a bare CIK to its canonical manager URL.
    text=get(f"{BASE}/manager/{m['cik']}").decode("utf-8","replace")
    found=[]
    for tr in re.findall(r"<tr\b[^>]*>.*?</tr>",text,re.S|re.I):
        mm=re.search(r'href="/13f/([0-9]{18}[^"]*)">\s*(Q[1-4]\s+20\d\d)\s*</a>',tr,re.S|re.I)
        if not mm: continue
        path=mm.group(1); acc=path[:18]; dates=re.findall(r'data-order="(20\d\d-\d\d-\d\d)"',tr)
        if not dates: continue
        report=dates[0]; filed=dates[-1] if len(dates)>1 else ""
        formm=re.search(r'title="(13F-[^"]+)"',tr,re.I)
        found.append({"path":path,"accessionCompact":acc,"accession":accession_hyphen(acc),
                      "reportDate":report,"filingDate":filed,"quarter":quarter(report),
                      "form":formm.group(1) if formm else "13F-HR"})
        if len(found)>=4: break
    if not found: raise RuntimeError(f"No 13F filing rows parsed for {m['name']}")
    return found
def fetch_holdings(m,f):
    payload=json.loads(get(f"{BASE}/data/13f/{f['accessionCompact']}").decode("utf-8"))
    arr=payload.get("data") if isinstance(payload,dict) else payload
    if not isinstance(arr,list): raise RuntimeError("Unexpected holdings JSON")
    sec=f"https://www.sec.gov/Archives/edgar/data/{int(m['cik'])}/{f['accessionCompact']}/{f['accession']}-index.html"
    out=[]
    for x in arr:
        if not isinstance(x,list) or len(x)<9: continue
        ticker,issuer,cls,cusip,value000,pct,shares,principal,opt=x[:9]
        if not cusip or not issuer: continue
        out.append({"managerId":m["id"],"manager":m["name"],"market":"US",
          "source":"13f.info mirror of SEC Form 13F","disclosureType":"13F","currency":"USD",
          "quarter":f["quarter"],"reportDate":f["reportDate"],"filingDate":f["filingDate"],
          "form":f["form"],"accession":f["accession"],"ticker":ticker or "","issuer":issuer or "",
          "titleOfClass":cls or "","cusip":str(cusip).upper(),"identifier":str(cusip).upper(),
          "entityKey":str(cusip).upper(),"value":int(round(float(value000 or 0)*1000)),
          "shares":int(round(float(shares or 0))),"principal":int(round(float(principal or 0))),
          "shareType":"PRN" if principal else "SH","putCall":opt or "",
          "weightPct":float(pct or 0),"filingUrl":sec,
          "sourceUrl":f"{BASE}/13f/{f['path']}","sourceConfidence":1.0,"needsReview":False})
    return out
def add_changes(rows):
    by=defaultdict(list)
    for r in rows: by[(r["managerId"],r["cusip"],r.get("putCall",""))].append(r)
    for arr in by.values():
        arr.sort(key=lambda x:x["reportDate"]); prev=None
        for r in arr:
            if prev is None:
                r["changeStatus"]="BASE"; r["sharesChange"]=None; r["sharesChangePct"]=None
            else:
                d=r["shares"]-prev["shares"]; r["sharesChange"]=d
                r["sharesChangePct"]=(d/prev["shares"]*100) if prev["shares"] else None
                r["changeStatus"]="NEW" if prev["shares"]==0 and r["shares"]>0 else ("INCREASED" if d>0 else "REDUCED" if d<0 else "UNCHANGED")
            prev=r
def main():
    cfg=json.loads(CFG.read_text(encoding="utf-8"))
    managers=[m for m in cfg["managers"] if m.get("auto_sync") and m.get("cik")]
    holdings=[]; filings=[]; errors=[]
    for m in managers:
        print("Sync",m["name"],flush=True)
        try:
            fs=manager_filings(m)
            for f in fs:
                hs=fetch_holdings(m,f); holdings.extend(hs)
                filings.append({"managerId":m["id"],"manager":m["name"],**{k:f[k] for k in ("reportDate","quarter","filingDate","accession","form")},"holdingCount":len(hs),
                  "filingUrl":hs[0]["filingUrl"] if hs else "","sourceUrl":f"{BASE}/13f/{f['path']}"})
                print(" ",f["quarter"],len(hs),"holdings",flush=True)
        except Exception as e:
            errors.append({"managerId":m["id"],"name":m["name"],"error":repr(e)})
            print(" ERROR",repr(e),flush=True)
    if not holdings: raise RuntimeError(f"No holdings collected: {errors}")
    add_changes(holdings)
    holdings.sort(key=lambda r:(r["quarter"],r["managerId"],r["cusip"],r["putCall"]))
    periods=sorted({r["quarter"] for r in holdings})
    counts={m["id"]:sum(1 for r in holdings if r["managerId"]==m["id"]) for m in managers}
    meta={"generatedAt":now(),"source":"SEC Form 13F via 13f.info structured mirror",
      "configuredManagers":len(managers),"managerCount":sum(v>0 for v in counts.values()),
      "holdingCount":len(holdings),"periods":periods,"managerHoldingCounts":counts,
      "errors":errors,"syntheticData":False,
      "note":"13f.info transports and structures public SEC 13F data because SEC blocks GitHub-hosted runners. Every filing keeps a direct primary SEC URL. 13f.info values labelled $000 are normalized to USD. CUSIP is authoritative."}
    DATA.mkdir(exist_ok=True); HIST.mkdir(parents=True,exist_ok=True)
    (DATA/"latest.json").write_text(json.dumps({"meta":meta,"filings":filings,"holdings":holdings},ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    (DATA/"sync-status.json").write_text(json.dumps({"generatedAt":meta["generatedAt"],"ok":True,"holdingCount":len(holdings),"managerCount":meta["managerCount"],"errors":errors},ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    for q in periods:
        qr=[r for r in holdings if r["quarter"]==q]
        (HIST/f"{q}.json").write_text(json.dumps({"meta":{"generatedAt":meta["generatedAt"],"period":q,"holdingCount":len(qr)},"holdings":qr},ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("PUBLISHED",len(holdings),"REAL 13F HOLDINGS FOR",meta["managerCount"],"MANAGERS",flush=True)

if __name__=="__main__":
    try: main()
    except Exception as e:
        DATA.mkdir(exist_ok=True)
        (DATA/"sync-status.json").write_text(json.dumps({"generatedAt":now(),"ok":False,"fatal":repr(e)},ensure_ascii=False,separators=(",",":")),encoding="utf-8")
        print("FATAL",repr(e),flush=True); raise
