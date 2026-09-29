#!/usr/bin/env python3
import json, os, time, xml.etree.ElementTree as ET
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[1]
CFG=ROOT/"managers.json"; DATA=ROOT/"data"; MGR=DATA/"managers"; HIST=DATA/"history"
UA=os.getenv("SEC_USER_AGENT","PortfolioLab/1.0 markosdg2000-design@users.noreply.github.com")
PAUSE=float(os.getenv("SEC_REQUEST_PAUSE","0.4")); PERIODS=int(os.getenv("SEC_PERIODS_PER_MANAGER","4"))
HEAD={"User-Agent":UA,"Accept":"application/json, application/xml, text/xml, */*"}

def now(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z")
def get(url,retries=2):
    last=None
    for i in range(retries):
        try:
            with urlopen(Request(url,headers=HEAD),timeout=30) as r: b=r.read()
            time.sleep(PAUSE); return b
        except Exception as e:
            last=e; time.sleep(2**i)
    raise RuntimeError(f"GET failed {url}: {last}")
def jget(url): return json.loads(get(url).decode())
def save(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
def lname(tag): return tag.rsplit("}",1)[-1]
def txt(node,name):
    for e in node.iter():
        if lname(e.tag)==name: return (e.text or "").strip()
    return ""
def quarter(d):
    y,m,_=map(int,d.split("-")); return f"{y}-Q{(m-1)//3+1}"

def filings(cik):
    s=jget(f"https://data.sec.gov/submissions/CIK{cik}.json")["filings"]["recent"]
    out=[]
    for i,f in enumerate(s.get("form",[])):
        if f not in ("13F-HR","13F-HR/A"): continue
        rd=s["reportDate"][i]; acc=s["accessionNumber"][i]; fd=s["filingDate"][i]
        if rd and acc: out.append({"form":f,"reportDate":rd,"accession":acc,"filingDate":fd})
    by={}
    for x in out:
        old=by.get(x["reportDate"])
        if old is None or (x["filingDate"],x["form"]=="13F-HR/A")>(old["filingDate"],old["form"]=="13F-HR/A"):
            by[x["reportDate"]]=x
    return sorted(by.values(),key=lambda x:x["reportDate"],reverse=True)[:PERIODS]

def parse_table(b):
    root=ET.fromstring(b); rows=[]
    for n in root.iter():
        if lname(n.tag)!="infoTable": continue
        issuer=txt(n,"nameOfIssuer"); cusip=txt(n,"cusip").upper()
        if not issuer or not cusip: continue
        try: value=int(float(txt(n,"value").replace(",","")))*1000
        except: value=0
        try: shares=int(float(txt(n,"sshPrnamt").replace(",","")))
        except: shares=0
        rows.append({"ticker":"","issuer":issuer,"titleOfClass":txt(n,"titleOfClass"),"cusip":cusip,
                     "value":value,"shares":shares,"shareType":txt(n,"sshPrnamtType"),
                     "putCall":txt(n,"putCall"),"investmentDiscretion":txt(n,"investmentDiscretion")})
    return rows

def fetch_filing(m,f):
    cik=m["cik"]; acc=f["accession"]; accn=acc.replace("-","")
    base=f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accn}"
    idx=jget(base+"/index.json")
    names=[x.get("name","") for x in idx.get("directory",{}).get("item",[]) if x.get("name","").lower().endswith(".xml")]
    names=[n for n in names if "primary" not in n.lower()]
    names.sort(key=lambda n:(-("info" in n.lower())*10-("13f" in n.lower())*5-("table" in n.lower())*3,n))
    rows=[]; chosen=""
    for n in names:
        try:
            r=parse_table(get(base+"/"+n))
            if r: rows=r; chosen=n; break
        except Exception: pass
    if not rows: raise RuntimeError("No INFORMATION TABLE XML found")
    q=quarter(f["reportDate"])
    for r in rows:
        r.update({"managerId":m["id"],"manager":m["name"],"market":"US","source":"SEC 13F",
                  "disclosureType":"13F","confidence":0.90,"currency":"USD","quarter":q,
                  "reportDate":f["reportDate"],"filingDate":f["filingDate"],"form":f["form"],
                  "accession":acc,"filingUrl":base+"/"+acc+"-index.html","sourceUrl":base+"/"+chosen})
    return rows

def cached(mid):
    p=MGR/f"{mid}.json"
    if p.exists():
        try: return json.loads(p.read_text())
        except: pass

def sync_manager(m):
    hs=[]; meta=[]
    for f in sorted(filings(m["cik"]),key=lambda x:x["reportDate"]):
        r=fetch_filing(m,f); hs+=r
        meta.append({**f,"quarter":quarter(f["reportDate"]),"holdingCount":len(r)})
    p={"manager":m,"generatedAt":now(),"filings":meta,"holdings":hs}
    save(MGR/f'{m["id"]}.json',p); return p

def main():
    cfg=json.loads(CFG.read_text()); ms=[m for m in cfg["managers"] if m.get("auto_sync") and m.get("cik")]
    DATA.mkdir(exist_ok=True); MGR.mkdir(parents=True,exist_ok=True); HIST.mkdir(parents=True,exist_ok=True)
    payloads=[]; errs=[]; ok=0
    for m in ms:
        print("Sync",m["name"])
        try: p=sync_manager(m); ok+=1
        except Exception as e:
            print("ERROR",m["name"],e)
            errs.append({"managerId":m["id"],"name":m["name"],"error":str(e)})
            p=cached(m["id"])
            if not p: continue
        payloads.append(p)
    if not payloads:
        save(DATA/"sync-status.json",{"generatedAt":now(),"ok":False,"errors":errs,"note":"No manager data available; published holdings were not overwritten."})
        print("No manager data available; diagnostic status written")
        return
    hs=[]; fs=[]
    for p in payloads:
        hs += p.get("holdings",[])
        mm=p.get("manager",{})
        fs += [{"managerId":mm.get("id"),"manager":mm.get("name"),**f} for f in p.get("filings",[])]
    hs.sort(key=lambda h:(h.get("quarter",""),h.get("managerId",""),h.get("cusip",""),h.get("putCall","")))
    periods=sorted({h["quarter"] for h in hs if h.get("quarter")})
    meta={"generatedAt":now(),"source":"SEC EDGAR","managerCount":len(payloads),"successfulManagers":ok,
          "configuredManagers":len(ms),"holdingCount":len(hs),"periods":periods,"errors":errs,
          "note":"13F values normalized from reported thousands of USD to USD. CUSIP is the authoritative SEC-filed security identifier."}
    save(DATA/"latest.json",{"meta":meta,"filings":fs,"holdings":hs})
    for q in periods:
        rows=[h for h in hs if h["quarter"]==q]
        save(HIST/f"{q}.json",{"meta":{**meta,"period":q,"holdingCount":len(rows)},"holdings":rows})
    save(DATA/"sync-status.json",{"generatedAt":now(),"ok":True,"errors":errs,"holdingCount":len(hs),"managerCount":len(payloads)})\n    print("Published",len(hs),"holdings from",len(payloads),"managers")

if __name__=="__main__": main()
