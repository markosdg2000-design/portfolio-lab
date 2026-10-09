"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {allocateCapped,groupHoldings}=require("../app.js");

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
console.log("PASS: allocation cap, residual cash, CUSIP aggregation, all app views, widgets, responsive CSS");
