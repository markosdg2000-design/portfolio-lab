"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {allocateCapped,groupHoldings,APP,renderPortfolio,computeChanges,instrumentType,reportedQuantity,referenceSymbol,isEquity,renderCompany}=require("../app.js");

function assertAllocation(scores,cap){
  const a=allocateCapped(scores,cap);
  assert.equal(a.weights.length,scores.length);
  assert.ok(a.weights.every(x=>Number.isFinite(x)&&x>=-1e-10&&x<=cap+1e-8),"one position exceeds cap");
  assert.ok(a.cash>=-1e-8,"negative cash");
  assert.ok(Math.abs(a.weights.reduce((s,x)=>s+x,0)+a.cash-1)<1e-8,"weights and cash do not add to 100%");
  return a;
}
let a=assertAllocation([40,35,25],.12);
assert.ok(Math.abs(a.cash-.64)<1e-8,"when 3 positions are capped at 12%, cash must be 64%");
a=assertAllocation(Array.from({length:12},(_,i)=>i+1),.12);
assert.ok(a.cash<1e-8,"enough eligible positions should invest 100%");
a=assertAllocation([100000,1,1,1,1],.30);
assert.ok(a.weights[0]<=.30000001);
a=assertAllocation([],.15);
assert.equal(a.cash,1);
a=assertAllocation([2,3],.5);
assert.ok(Math.abs(a.weights[0]-.5)<1e-8&&Math.abs(a.weights[1]-.5)<1e-8);

const g=groupHoldings([
  {cusip:"037833100",managerId:"m1",value:100,ticker:"AAPL",issuer:"Apple",putCall:""},
  {cusip:"037833100",managerId:"m2",value:200,ticker:"AAPL",issuer:"Apple",putCall:""},
  {cusip:"594918104",managerId:"m1",value:300,ticker:"MSFT",issuer:"Microsoft",putCall:""}
]);
assert.equal(g.length,2);
assert.equal(g.find(x=>x.id==="037833100").holders.size,2);
assert.equal(g.find(x=>x.id==="037833100").value,300);
const html=fs.readFileSync("index.html","utf8");
for(const id of ["dashboard","institutions","manager","securities","company","overlap","changes","portfolio","sources"]){
  assert.ok(html.includes('id="view-'+id+'"'),"Missing view "+id);
}
for(const id of ["tvProfile","tvFinancials","tvChart"]){assert.ok(fs.readFileSync("app.js","utf8").includes(id))}
const css=fs.readFileSync("styles.css","utf8");
assert.ok(css.includes("@media(max-width:550px)"));

const nodes=new Map();
global.document={getElementById:id=>{
  if(!nodes.has(id))nodes.set(id,{innerHTML:"",style:{display:""}});
  return nodes.get(id);
}};
APP.period="2026-Q2";
APP.periods=["2026-Q1","2026-Q2"];
APP.managers=[{id:"m1",name:"Bridgewater"},{id:"m2",name:"Berkshire"}];
APP.data={holdings:[
 {quarter:"2026-Q1",managerId:"m1",cusip:"037833100",ticker:"AAPL",issuer:"Apple",shares:100,value:1000},
 {quarter:"2026-Q2",managerId:"m1",cusip:"037833100",ticker:"AAPL",issuer:"Apple",shares:150,value:1500},
 {quarter:"2026-Q2",managerId:"m1",cusip:"594918104",ticker:"MSFT",issuer:"Microsoft",shares:75,value:1000},
 {quarter:"2026-Q1",managerId:"m2",cusip:"037833100",ticker:"AAPL",issuer:"Apple",shares:10,value:100},
 {quarter:"2026-Q2",managerId:"m2",cusip:"037833100",ticker:"AAPL",issuer:"Apple",shares:10,value:120}
]};
const ch=computeChanges();
assert.ok(ch.some(x=>x.cusip==="037833100"&&x.managerId==="m1"&&x.type==="INCREASE"&&Math.abs(x.change-.5)<1e-10),"Q/Q share percentage");
assert.ok(ch.some(x=>x.cusip==="594918104"&&x.managerId==="m1"&&x.type==="NEW"),"new disclosure");
APP.model={capital:10000,period:"2026-Q2",cash:.64,rows:[
 {id:"037833100",cusip:"037833100",ticker:"AAPL",issuer:"Apple",holderCount:1,score:11,weight:.12,amount:1200},
 {id:"594918104",cusip:"594918104",ticker:"MSFT",issuer:"Microsoft",holderCount:1,score:10,weight:.12,amount:1200},
 {id:"000000001",cusip:"000000001",ticker:"OTHER",issuer:"Other",holderCount:1,score:9,weight:.12,amount:1200}
]};
renderPortfolio();
assert.ok(nodes.get("portfolioTable").innerHTML.includes("Efectivo no asignado"),"cash line must render");
assert.ok(nodes.get("portfolioTable").innerHTML.includes("company/037833100"),"company detail links must work");
assert.ok(nodes.get("portfolioSummary").innerHTML.includes("64,0"),"correct residual cash share shown");
assert.equal(nodes.get("portfolioTablePanel").style.display,"block");


/* SEC 13F: Lumentum CUSIP 55024UAD1 is debt, NOT NASDAQ:LITE shares. */
APP.symbols=JSON.parse(fs.readFileSync("company_symbols.json","utf8")).entries;
const lumentum={cusip:"55024UAD1",ticker:"",issuer:"LUMENTUM HLDGS INC",titleOfClass:"NOTE 0.500%12/1",shares:0,principal:1250000,shareType:"PRN",putCall:"",value:88270000};
assert.equal(instrumentType(lumentum),"debt","NOTE/PRN must be classified as debt");
assert.equal(isEquity(lumentum),false,"bond must not enter equity portfolio");
assert.equal(reportedQuantity(lumentum),1250000,"PRN must display principal, not 0 shares");
const lRef=referenceSymbol({...lumentum,id:"55024UAD1",rows:[lumentum]});
assert.equal(lRef.symbol,"NASDAQ:LITE","Lumentum issuer shares resolved");
assert.equal(lRef.relation,"issuer","LITE is issuer equity, not the filed bond");
for(const [cusip,sym] of [["37940XAU6","NYSE:GPN"],["090043AF7","NYSE:BILL"],["76954AAB9","NASDAQ:RIVN"]]){
 const h={cusip,shareType:"PRN",principal:500,shares:0};
 assert.equal(instrumentType(h),"debt");
 assert.equal(referenceSymbol({id:cusip,cusip,rows:[h]}).symbol,sym);
}
const noteFallback={cusip:"999999AA1",titleOfClass:"NOTE 4.500%",shares:0,principal:0,shareType:"SH",ticker:""};
assert.equal(instrumentType(noteFallback),"debt","fallback to NOTE class when ambiguous share type");
assert.equal(referenceSymbol({...noteFallback,id:noteFallback.cusip,rows:[noteFallback]}),null,"do not invent a ticker for an unknown CUSIP");
const stock={cusip:"55024U109",titleOfClass:"COM",shares:450,principal:0,shareType:"SH",ticker:"LITE"};
assert.equal(instrumentType(stock),"equity");
assert.equal(reportedQuantity(stock),450);
APP.data={holdings:[
 {quarter:"2026-Q1",managerId:"m1",...lumentum,principal:1000},
 {quarter:"2026-Q2",managerId:"m1",...lumentum,principal:1500},
 {quarter:"2026-Q1",managerId:"m2",...stock,shares:100},
 {quarter:"2026-Q2",managerId:"m2",...stock,shares:100}
]};
const changesWithDebt=computeChanges();
assert.ok(changesWithDebt.some(x=>x.cusip==="55024UAD1"&&x.instrumentType==="debt"&&x.previous===1000&&x.current===1500&&Math.abs(x.change-.5)<1e-10),"debt principal Q/Q");
assert.ok(!changesWithDebt.some(x=>x.cusip==="55024U109"),"unchanged shares must not become a change");


/* Smoke-test the actual company detail view for PRN vs issuer listed stock. */
function fakeNode(){
 return {innerHTML:"",style:{},childNodes:[],replaceChildren(){this.childNodes=[]},appendChild(x){this.childNodes.push(x)}};
}
global.document.createElement=tag=>({...fakeNode(),tagName:tag.toUpperCase()});
for(const id of ["companyDetail","tvProfile","tvInfo","tvFinancials","tvChart"]){nodes.set(id,fakeNode())}
const bond={...lumentum,managerId:"m1",quarter:"2026-Q2",filingUrl:"https://www.sec.gov/edgar/search/"};
APP.data={holdings:[bond],filings:[]};
APP.managers=[{id:"m1",name:"Soros Fund Management LLC"}];
renderCompany("55024UAD1");
const detail=nodes.get("companyDetail").innerHTML;
assert.ok(detail.includes("NASDAQ:LITE"),"issuer's verifiable traded equity reference appears");
assert.ok(detail.includes("instrumento distinto")||detail.includes("Instrumento distinto"),"clear distinct-instrument warning");
assert.ok(detail.includes("1.250.000"),"PRN nominal visible and not zero shares");
assert.ok(detail.includes("NO al bono")||detail.includes("no el precio de este bono"),"stock widget must not be described as bond price");
assert.ok(detail.includes("55024UAD1"),"original filed CUSIP retained");

console.log("PASS: allocation cap, residual cash, CUSIP aggregation, all app views, widgets, responsive CSS");
