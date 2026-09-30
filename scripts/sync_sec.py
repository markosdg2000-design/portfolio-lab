#!/usr/bin/env python3
import csv, io, json, zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]
CFG=ROOT/"managers.json"; DATA=ROOT/"data"; HIST=DATA/"history"
UA="PortfolioLab/1.0 (+https://github.com/markosdg2000-design/portfolio-lab)"
ARCHIVES=[
("2026-Q2","https://dcm.sec.gov/files/datastandardsinnovation/data/form-13f-data-sets/01jun2026-31aug2026_form13f.zip"),
("2026-Q1","https://dcm.sec.gov/files/structureddata/data/form-13f-data-sets/01mar2026-31may2026_form13f.zip"),
("2025-Q4","https://dcm.sec.gov/files/structureddata/data/form-13f-data-sets/01dec2025-28feb2026_form13f.zip"),
("2025-Q3","https://dcm.sec.gov/files/structureddata/data/form-13f-data-sets/01sep2025-30nov2025_form13f.zip"),
]

def now(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z")
def cik(v): return str(v or "").strip().lstrip("0").zfill(10)
def integer(v):
    try: return int(float(str(v or "0").replace(",","")))
    except: return 0
def iso_date(v):
    s=str(v or "").strip()
    if not s: return ""
    for fmt in ("%d-%b-%Y","%Y-%m-%d","%m/%d/%Y"):
        try: return datetime.strptime(s,fmt).date().isoformat()
        except ValueError: pass
    return s
def qtr(d):
    y,m,_=map(int,d.split("-")); return f"{y}-Q{(m-1)//3+1}"

def download(url):
    print("Download official SEC bulk dataset",url,flush=True)
    with urlopen(Request(url,headers={"User-Agent":UA}),timeout=180) as r: return r.read()

def rows(z,stem):
    name=next((n for n in z.namelist() if n.upper().endswith(stem+".TSV")),None)
    if not name: raise RuntimeError(f"{stem}.tsv missing; members={z.namelist()[:20]}")
    f=io.TextIOWrapper(z.open(name),encoding="utf-8-sig",errors="replace",newline="")
    yield from csv.DictReader(f,delimiter="\t")

def load_archive(label,url,managers):
    raw=download(url)
    z=zipfile.ZipFile(io.BytesIO(raw))
    targets={cik(m["cik"]):m for m in managers}
    subs=[]
    for r in rows(z,"SUBMISSION"):
        mc=cik(r.get("CIK"))
        if mc not in targets: continue
        acc=(r.get("ACCESSION_NUMBER") or "").strip()
        report=iso_date(r.get("PERIODOFREPORT"))
        filed=iso_date(r.get("FILING_DATE"))
        if acc and report:
            subs.append({"accession":acc,"manager":targets[mc],"reportDate":report,"filingDate":filed,
                         "form":(r.get("SUBMISSIONTYPE") or r.get("FORMTYPE") or "13F-HR").strip()})
    # One effective filing per manager/report period. Most tracked managers file a single HR;
    # if amendments exist, the latest filed accession is retained and visibly labelled.
    best={}
    for s in subs:
        k=(s["manager"]["id"],s["reportDate"])
        if k not in best or s["filingDate"]>best[k]["filingDate"]: best[k]=s
    access={s["accession"]:s for s in best.values()}
    out=[]
    for r in rows(z,"INFOTABLE"):
        acc=(r.get("ACCESSION_NUMBER") or "").strip()
        s=access.get(acc)
        if not s: continue
        cusip=(r.get("CUSIP") or "").strip().upper()
        issuer=(r.get("NAMEOFISSUER") or "").strip()
        if not cusip or not issuer: continue
        out.append({
          "managerId":s["manager"]["id"],"manager":s["manager"]["name"],"market":"US",
          "source":"SEC Form 13F Bulk Data Set","disclosureType":"13F","currency":"USD",
          "quarter":qtr(s["reportDate"]),"reportDate":s["reportDate"],"filingDate":s["filingDate"],
          "form":s["form"],"accession":acc,"ticker":"","issuer":issuer,
          "titleOfClass":(r.get("TITLEOFCLASS") or "").strip(),"cusip":cusip,
          "identifier":cusip,"entityKey":cusip,"value":integer(r.get("VALUE")),
          "shares":integer(r.get("SSHPRNAMT")),"shareType":(r.get("SSHPRNAMTTYPE") or "").strip(),
          "putCall":(r.get("PUTCALL") or "").strip(),"investmentDiscretion":(r.get("INVESTMENTDISCRETION") or "").strip(),
          "filingUrl":f"https://www.sec.gov/Archives/edgar/data/{int(s['manager']['cik'])}/{acc.replace('-','')}/{acc}-index.html",
          "sourceUrl":url,"sourceConfidence":1.0,"needsReview":False
        })
    print(label,"matched",len(best),"filings and",len(out),"holdings",flush=True)
    return out,list(best.values())

def add_changes(rows_):
    by=defaultdict(list)
    for r in rows_: by[(r["managerId"],r["cusip"],r.get("putCall",""))].append(r)
    for arr in by.values():
        arr.sort(key=lambda x:x["reportDate"]); prev=None
        for r in arr:
            if prev is None:
                r["changeStatus"]="BASE"; r["sharesChange"]=None; r["sharesChangePct"]=None
            else:
                d=r["shares"]-prev["shares"]; r["sharesChange"]=d
                r["sharesChangePct"]=(d/prev["shares"]*100) if prev["shares"] else None
                r["changeStatus"]="INCREASED" if d>0 else "REDUCED" if d<0 else "UNCHANGED"
            prev=r

def main():
    cfg=json.loads(CFG.read_text(encoding="utf-8"))
    managers=[m for m in cfg["managers"] if m.get("auto_sync") and m.get("cik")]
    holdings=[]; filing_meta=[]
    for label,url in ARCHIVES:
        h,ss=load_archive(label,url,managers); holdings+=h; filing_meta+=ss
    if not holdings: raise RuntimeError("Official SEC bulk archives downloaded but no configured holdings matched")
    add_changes(holdings)
    holdings.sort(key=lambda r:(r["quarter"],r["managerId"],r["cusip"],r["putCall"]))
    filings=[]
    for s in filing_meta:
        hs=[r for r in holdings if r["accession"]==s["accession"]]
        if hs: filings.append({"managerId":s["manager"]["id"],"manager":s["manager"]["name"],
          "reportDate":s["reportDate"],"quarter":qtr(s["reportDate"]),"filingDate":s["filingDate"],
          "accession":s["accession"],"form":s["form"],"holdingCount":len(hs),"filingUrl":hs[0]["filingUrl"]})
    periods=sorted({r["quarter"] for r in holdings})
    counts={m["id"]:sum(1 for r in holdings if r["managerId"]==m["id"]) for m in managers}
    meta={"generatedAt":now(),"source":"Official SEC Form 13F Data Sets","configuredManagers":len(managers),
      "managerCount":sum(v>0 for v in counts.values()),"holdingCount":len(holdings),"periods":periods,
      "managerHoldingCounts":counts,"syntheticData":False,
      "note":"Official SEC flattened as-filed data. Current Form 13F VALUE is reported to the nearest dollar. CUSIP is authoritative; ticker remains blank unless separately verified."}
    DATA.mkdir(exist_ok=True); HIST.mkdir(parents=True,exist_ok=True)
    (DATA/"latest.json").write_text(json.dumps({"meta":meta,"filings":filings,"holdings":holdings},ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    (DATA/"sync-status.json").write_text(json.dumps({"generatedAt":meta["generatedAt"],"ok":True,"holdingCount":len(holdings),"managerCount":meta["managerCount"],"errors":[]},separators=(",",":")),encoding="utf-8")
    for q in periods:
        qr=[r for r in holdings if r["quarter"]==q]
        (HIST/f"{q}.json").write_text(json.dumps({"meta":{"generatedAt":meta["generatedAt"],"period":q,"holdingCount":len(qr)},"holdings":qr},ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("PUBLISHED",len(holdings),"REAL HOLDINGS",meta["managerCount"],"MANAGERS",flush=True)

if __name__=="__main__":
    try: main()
    except Exception as e:
        DATA.mkdir(exist_ok=True)
        (DATA/"sync-status.json").write_text(json.dumps({"generatedAt":now(),"ok":False,"fatal":repr(e)},separators=(",",":")),encoding="utf-8")
        print("FATAL",repr(e),flush=True)
        raise
