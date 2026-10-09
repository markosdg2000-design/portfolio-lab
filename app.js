/* Portfolio Lab v5 — static browser client; no synthetic securities or market quotes. */
"use strict";
const APP={managers:[],data:{meta:{},filings:[],holdings:[]},periods:[],period:"",model:null,route:"dashboard",loaded:false,symbols:{}};
const $=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const usd=x=>new Intl.NumberFormat("es-ES",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:2}).format(Number(x)||0);
const eur=x=>new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(Number(x)||0);
const number=x=>new Intl.NumberFormat("es-ES",{maximumFractionDigits:0}).format(Number(x)||0);
const percent=x=>(100*x).toLocaleString("es-ES",{maximumFractionDigits:1,minimumFractionDigits:1})+" %";
const safeURL=u=>/^https:\/\/[a-z0-9.-]+(?:\/|$)/i.test(String(u||""))?u:"#sources";
const managerName=id=>APP.managers.find(m=>m.id===id)?.name||id;
const key=h=>String(h.cusip||h.identifier||"").toUpperCase();
const label=h=>String(h.ticker||h.cusip||"—");
const periodRows=(p=APP.period)=>APP.data.holdings.filter(h=>h.quarter===p);
function instrumentType(h){
 const manual=APP.symbols[key(h)]?.instrumentType;
 if(manual==="debt")return "debt";
 if(h.putCall)return "option";
 if(h.shareType==="PRN"||Number(h.principal)>0||/\b(NOTE|BOND|DEBENTURE|DEBT|CONV)\b/i.test(String(h.titleOfClass||"")))return "debt";
 if(/\bWARRANT\b|\bW EXP\b/i.test(String(h.titleOfClass||"")))return "warrant";
 return "equity";
}
const isEquity=h=>instrumentType(h)==="equity";
function typeLabel(type){return ({debt:"Deuda / nota",option:"Opción",warrant:"Warrant",equity:"Acción / participación"})[type]||"Otro"}
function reportedQuantity(h){return instrumentType(h)==="debt"?(Number(h.principal)||Number(h.shares)||0):Number(h.shares)||0}
function reportedUnit(h){return instrumentType(h)==="debt"?"Nominal PRN":"Acciones / unidades"}
function referenceSymbol(x){
 const known=APP.symbols[x.id||x.cusip||key(x)];if(known)return {ticker:known.referenceTicker,symbol:known.referenceSymbol,source:known.equitySource,relation:"issuer"};
 const type=x.rows?.length?instrumentType(x.rows[0]):instrumentType(x);
 const t=String(x.ticker||"").trim().toUpperCase();
 if(type!=="equity"||!t||!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t))return null;
 return {ticker:t,symbol:tvSymbol(t),source:"",relation:"reported"};
}
function assetPill(h){const kind=instrumentType(h);return pill(typeLabel(kind),kind==="debt"?"gold":kind==="option"?"blue":kind==="warrant"?"red":"green")}
const managerRows=(id,p=APP.period)=>periodRows(p).filter(h=>h.managerId===id);
const managerAvailable=(p=APP.period)=>new Set(periodRows(p).map(h=>h.managerId));
function groupHoldings(rows){
  const map=new Map();
  for(const h of rows){
    const id=key(h);if(!id)continue;
    if(!map.has(id))map.set(id,{id,cusip:id,ticker:String(h.ticker||""),issuer:h.issuer||id,holders:new Set(),value:0,rows:[],equityRows:[]});
    const x=map.get(id);x.rows.push(h);x.holders.add(h.managerId);x.value+=Number(h.value)||0;if(isEquity(h))x.equityRows.push(h);
    if(!x.ticker&&h.ticker)x.ticker=String(h.ticker);
  }
  return [...map.values()];
}
function aggregate(p=APP.period,eq=false){
  const base=periodRows(p),arr=groupHoldings(eq?base.filter(isEquity):base);
  const reporting=managerAvailable(p).size;
  return arr.map(x=>({...x,holderCount:x.holders.size,consensus:reporting?x.holders.size/reporting:0}))
    .sort((a,b)=>b.holderCount-a.holderCount||b.value-a.value);
}
function otherPeriods(){const i=APP.periods.indexOf(APP.period);return i>0?APP.periods[i-1]:null}
function linkCompany(x,cls="company-link"){const k=x.id||x.cusip||x.identifier;const ref=referenceSymbol(x);return '<a class="'+cls+'" href="#company/'+encodeURIComponent(k)+'">'+esc(isEquity(x)&&x.ticker?x.ticker:(x.rows?.length&&x.rows.every(isEquity)&&x.ticker?x.ticker:k))+'</a>'}
function linkManager(id){return '<a href="#manager/'+encodeURIComponent(id)+'">'+esc(managerName(id))+'</a>'}
function pill(str,kind="neutral"){return '<span class="pill '+kind+'">'+esc(str)+'</span>'}
function tdEmpty(text){return '<div class="empty">'+esc(text)+'</div>'}
function panelTable(head,rows){return '<table><thead><tr>'+head.map(x=>'<th>'+x+'</th>').join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table>'}
function kpi(lbl,val,help){return '<div class="kpi"><div class="lbl">'+esc(lbl)+'</div><div class="val">'+esc(val)+'</div><div class="help">'+esc(help)+'</div></div>'}
function stat(label,val){return '<div class="stat-card"><strong>'+esc(val)+'</strong><span>'+esc(label)+'</span></div>'}
function external(href,label){return '<a target="_blank" rel="noopener noreferrer" href="'+esc(safeURL(href))+'">'+esc(label)+' ↗</a>'}
function parseRoute(){const parts=decodeURIComponent((location.hash||"#dashboard").slice(1)).split("/");return {name:parts[0]||"dashboard",id:parts.slice(1).join("/")}}
function navigate(){
  if(!APP.loaded)return;
  const route=parseRoute();const known=["dashboard","institutions","manager","securities","company","overlap","changes","portfolio","sources"];
  const name=known.includes(route.name)?route.name:"dashboard";APP.route=name;
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id==="view-"+name));
  document.querySelectorAll("#navigation a").forEach(a=>a.classList.toggle("active",a.dataset.route===name||(name==="company"&&a.dataset.route==="securities")||(name==="manager"&&a.dataset.route==="institutions")));
  const titles={dashboard:"Dashboard",institutions:"Gestores",manager:"Ficha de gestor",securities:"Empresas",company:"Ficha de empresa",overlap:"Cruces institucionales",changes:"Cambios trimestrales",portfolio:"Cartera modelo",sources:"Metodología"};
  $("topTitle").textContent=titles[name];$("crumb").textContent=name==="company"?"Empresas":name==="manager"?"Gestores":"Portfolio Lab";
  if(name==="company")renderCompany(route.id);
  if(name==="manager")renderManagerDetail(route.id);
  if(name==="overlap")renderOverlap();
  if(name==="changes")renderChanges();
  if(name==="portfolio")renderPortfolio();
  window.scrollTo(0,0);
}
function refreshAll(){
  renderDashboard();renderInstitutions();renderSecurities();renderOverlap();renderChanges();renderPortfolio();renderSources();
  if(APP.route==="company")renderCompany(parseRoute().id);
  if(APP.route==="manager")renderManagerDetail(parseRoute().id);
}
async function boot(){
  try{
    const [m,d,t]=await Promise.all([fetch("managers.json",{cache:"no-store"}),fetch("data/latest.json",{cache:"no-store"}),fetch("company_symbols.json",{cache:"no-store"})]);
    if(!m.ok||!d.ok)throw new Error("La fuente ha devuelto HTTP "+m.status+" / "+d.status);
    const mm=await m.json(),dd=await d.json(),tt=t.ok?await t.json():{entries:{}};
    if(!Array.isArray(mm.managers)||!Array.isArray(dd.holdings))throw new Error("Estructura JSON incorrecta");
    APP.managers=mm.managers;APP.data=dd;APP.symbols=tt.entries||{};APP.periods=[...new Set(dd.holdings.map(h=>h.quarter).filter(Boolean))].sort();APP.period=APP.periods.at(-1)||"";
    $("period").innerHTML=APP.periods.map(p=>'<option value="'+esc(p)+'">'+esc(p)+'</option>').join("")||"<option>Sin periodos</option>";
    $("period").value=APP.period;
    $("feedTag").textContent=dd.holdings.length?"● DATOS 13F PUBLICADOS":"○ SIN POSICIONES";
    $("feedTag").className="tag "+(dd.holdings.length?"live":"warn");
    const when=dd.meta?.generatedAt?new Date(dd.meta.generatedAt).toLocaleString("es-ES",{dateStyle:"medium",timeStyle:"short"}):"Fecha desconocida";
    $("sideUpdate").textContent="Última sincronización: "+when;
    APP.loaded=true;
    fillManagerOptions();
    bindControls();
    refreshAll();navigate();
  }catch(e){$("feedTag").className="tag warn";$("feedTag").textContent="Error del feed";$("view-dashboard").classList.add("active");$("dashboardKpis").innerHTML='<div class="error-msg">No se pudieron cargar los datos reales: '+esc(e.message)+'. <a href="data/latest.json">Comprobar JSON</a>.</div>'}
}
function bindControls(){
  $("period").addEventListener("change",e=>{APP.period=e.target.value;APP.model=null;refreshAll();if(APP.route==="portfolio")renderPortfolio()});
  for(const id of ["institutionMarket","institutionSearch"])$(id).addEventListener(id==="institutionSearch"?"input":"change",renderInstitutions);
  for(const id of ["securitySearch","securityMinManagers","securitySort"])$(id).addEventListener(id==="securitySearch"?"input":"change",renderSecurities);
  for(const id of ["changeManager","changeType","changeThreshold","changeSearch"])$(id).addEventListener(id==="changeSearch"?"input":"change",renderChanges);
  for(const id of ["overlapA","overlapB"])$(id).addEventListener("change",renderOverlap);
  $("buildPortfolio").addEventListener("click",buildPortfolio);
  $("portfolioExport").addEventListener("click",exportPortfolio);
  window.addEventListener("hashchange",navigate);
}
function renderDashboard(){
  const a=aggregate(),us=[...managerAvailable()].length,meta=APP.data.meta||{},errs=meta.errors||[];
  $("dashboardKpis").innerHTML=kpi("Instituciones en directorio",number(APP.managers.length),"EE. UU. + enlaces China/HK")+kpi("Registros 13F disponibles",number(APP.data.holdings.length),"Todos los periodos almacenados")+kpi("Último trimestre",APP.period||"—","Fecha de corte, no de compra")+kpi("Gestores con posiciones",number(us),"Con registros en este trimestre");
  $("dashboardConsensus").innerHTML=a.length?panelTable(["Valor","Empresa","Gestores","Consenso"],a.slice(0,12).map(x=>'<tr><td>'+linkCompany(x,"id-cell")+'</td><td><a class="company-link" href="#company/'+encodeURIComponent(x.id)+'">'+esc(x.issuer)+'</a></td><td>'+x.holderCount+'</td><td><b>'+percent(x.consensus)+'</b><div class="bar"><i style="width:'+(x.consensus*100).toFixed(1)+'%"></i></div></td></tr>')):tdEmpty("No hay datos en este trimestre");
  $("datasetHealth").innerHTML='<div class="panel-meta">'+
    '<div class="meta-row"><span>Fuente 13F</span><strong>SEC vía 13f.info</strong></div>'+
    '<div class="meta-row"><span>Última sincronización</span><strong>'+esc(meta.generatedAt||"—")+'</strong></div>'+
    '<div class="meta-row"><span>Periodos conservados</span><strong>'+esc((meta.periods||[]).join(", ")||"—")+'</strong></div>'+
    '<div class="meta-row"><span>Gestores sincronizados</span><strong>'+number(meta.managerCount||0)+' / '+number(meta.configuredManagers||10)+'</strong></div>'+
    '<div class="meta-row"><span>Errores declarados</span><strong>'+errs.length+'</strong></div>'+
    '</div><div class="muted-box">El <b>consenso</b> es la proporción de gestores con posiciones en el periodo seleccionado que declaran el mismo CUSIP. No indica una probabilidad de éxito.</div>';
}
function fillManagerOptions(){
  const us=APP.managers.filter(m=>m.market==="US"&&m.auto_sync);
  $("changeManager").innerHTML='<option value="ALL">Todos los gestores</option>'+us.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+'</option>').join("");
  const opts=us.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+'</option>').join("");
  $("overlapA").innerHTML=opts;$("overlapB").innerHTML=opts;
  if(us.length>1)$("overlapB").value=us[1].id;
}
function renderInstitutions(){
  const market=$("institutionMarket").value,term=$("institutionSearch").value.trim().toLowerCase();
  const ms=APP.managers.filter(m=>(market==="ALL"||m.market===market)&&(!term||m.name.toLowerCase().includes(term)));
  $("managerGrid").innerHTML=ms.map(m=>{
    const hs=managerRows(m.id),sum=hs.reduce((s,h)=>s+(Number(h.value)||0),0),active=hs.length>0;
    return '<div class="manager-card"><div><div class="name">'+esc(m.name)+'</div><div class="small muted">'+esc(m.market)+' · '+esc(m.source||"")+" · "+(m.cik?"CIK "+esc(m.cik):"Sin ingesta automatizada")+'</div></div>'+
      '<div class="manager-stat">'+(active?number(hs.length)+" registros · "+usd(sum):"Sin posiciones importadas para este periodo")+'</div>'+
      '<div class="foot"><span class="chip">'+(active?"Cartera 13F disponible":"Directorio / enlaces")+'</span><div class="small">'+(active?'<a href="#manager/'+encodeURIComponent(m.id)+'">Ver posiciones ↗</a>':external(m.official_url,"Fuente oficial"))+'</div></div></div>';
  }).join("")||tdEmpty("No se encontraron gestores");
}
function renderManagerDetail(id){
  const m=APP.managers.find(x=>x.id===id);
  if(!m){$("managerDetail").innerHTML=tdEmpty("Gestor no disponible");return}
  const hs=managerRows(id).slice().sort((a,b)=>Number(b.value||0)-Number(a.value||0)),total=hs.reduce((s,h)=>s+Number(h.value||0),0);
  const dates=[...new Set(hs.map(h=>h.filingDate).filter(Boolean))].sort(),filing=APP.data.filings?.find(f=>f.managerId===id&&f.quarter===APP.period);
  $("managerDetail").innerHTML='<div class="page-title"><div><div class="eyebrow">INSTITUTIONAL PROFILE · '+esc(m.market)+'</div><h1>'+esc(m.name)+'</h1><p>Posiciones reportadas en '+esc(APP.period)+' · CIK '+esc(m.cik||"—")+'</p></div><div class="hero-actions">'+external(m.official_url,"Registro oficial")+'</div></div>'+
    '<div class="stat-strip">'+stat("Posiciones declaradas",number(hs.length))+stat("Valor 13F declarado",usd(total))+stat("Fecha de publicación",dates.at(-1)||"—")+'</div>'+
    '<div class="panel"><div class="panel-head"><h2>Valores de este gestor</h2>'+(filing?.filingUrl?external(filing.filingUrl,"Filing SEC"):"")+'</div>'+
    '<div class="table-wrap">'+(hs.length?panelTable(["Ticker / CUSIP","Emisor","Acciones declaradas","Valor 13F","Peso en 13F","Fuente"],hs.map(h=>
      '<tr><td>'+linkCompany(h,"id-cell")+'</td><td>'+esc(h.issuer)+'</td><td>'+number(h.shares)+'</td><td>'+usd(h.value)+'</td><td>'+percent(total?Number(h.value||0)/total:0)+'</td><td>'+external(h.filingUrl,"SEC")+'</td></tr>'
    )):tdEmpty("Este gestor no tiene posiciones automáticas en el periodo seleccionado"))+'</div></div>'+
    '<div class="footnote">El peso es valor declarado / suma de valores 13F de este gestor en el periodo. No representa necesariamente el peso en su patrimonio total.</div>';
}
function renderSecurities(){
  let a=aggregate(),term=$("securitySearch").value.trim().toLowerCase(),min=Number($("securityMinManagers").value),sort=$("securitySort").value;
  a=a.filter(x=>x.holderCount>=min&&(!term||x.issuer.toLowerCase().includes(term)||x.cusip.toLowerCase().includes(term)||x.ticker.toLowerCase().includes(term)));
  if(sort==="value")a.sort((x,y)=>y.value-x.value);if(sort==="name")a.sort((x,y)=>x.issuer.localeCompare(y.issuer));
  const visible=a.slice(0,250);
  $("securityCount").textContent=number(a.length)+" valores coincidentes · mostrando "+number(visible.length)+" · clic en una empresa para abrir ficha";
  $("securitiesTable").innerHTML=a.length?panelTable(["Valor","Emisor","Gestores","Consenso","Valor conjunto 13F","Análisis"],visible.map(x=>
    '<tr><td>'+linkCompany(x,"id-cell")+'</td><td><a href="#company/'+encodeURIComponent(x.id)+'" class="company-link">'+esc(x.issuer)+'</a><div class="small muted">'+esc(x.cusip)+'</div></td>'+
    '<td>'+x.holderCount+'</td><td>'+percent(x.consensus)+'</td><td>'+usd(x.value)+'</td><td><a href="#company/'+encodeURIComponent(x.id)+'">Abrir ficha ↗</a></td></tr>'
  )):tdEmpty("No hay valores con esos filtros");
}
function computeChanges(period=APP.period,previous=otherPeriods()){
  if(!previous)return [];
  const a=periodRows(previous),b=periodRows(period);
  const managersA=new Set(a.map(h=>h.managerId)),managersB=new Set(b.map(h=>h.managerId));
  const covered=new Set([...managersA].filter(id=>managersB.has(id)));
  const signature=h=>h.managerId+"|"+key(h)+"|"+String(h.putCall||"")+"|"+String(h.shareType||"SH");
  const makeMap=arr=>{
    const m=new Map();
    for(const h of arr){if(!covered.has(h.managerId)||!key(h))continue;const k=signature(h),o=m.get(k);if(o){o.shares+=Number(h.shares||0);o.value+=Number(h.value||0)}else m.set(k,{...h,shares:Number(h.shares||0),value:Number(h.value||0)})}
    return m;
  };
  const old=makeMap(a),cur=makeMap(b),out=[];
  for(const k of new Set([...old.keys(),...cur.keys()])){
    const before=old.get(k),after=cur.get(k),h=after||before;
    const prevShares=before?.shares??0,curShares=after?.shares??0;
    if(!before&&!after)continue;
    let type,delta=null;
    if(!before)type="NEW";
    else if(!after)type="SOLD";
    else{delta=prevShares!==0?(curShares-prevShares)/Math.abs(prevShares):null;type=curShares>prevShares?"INCREASE":curShares<prevShares?"REDUCE":"UNCHANGED"}
    if(type==="UNCHANGED")continue;
    out.push({managerId:h.managerId,cusip:key(h),ticker:h.ticker||"",issuer:h.issuer||"",type,previous:prevShares,current:curShares,change:delta,filingDate:after?.filingDate||"",filingUrl:after?.filingUrl||before?.filingUrl||"",option:h.putCall||"",shareType:h.shareType||"SH"});
  }
  const severity=x=>x.type==="NEW"||x.type==="SOLD"?Number.POSITIVE_INFINITY:Math.abs(x.change??0);
  out.sort((x,y)=>severity(y)-severity(x));
  return out;
}
function renderChanges(){
  const prev=otherPeriods();if(!prev){$("changeCount").textContent="";$("changesTable").innerHTML=tdEmpty("Se necesitan al menos dos trimestres");return}
  const manager=$("changeManager").value,kind=$("changeType").value,th=Number($("changeThreshold").value)/100,term=$("changeSearch").value.trim().toLowerCase();
  const all=computeChanges(),a=all.filter(x=>(manager==="ALL"||x.managerId===manager)&&(kind==="ALL"||x.type===kind)&&(["NEW","SOLD"].includes(x.type)||Math.abs(x.change??0)>=th)&&(!term||x.issuer.toLowerCase().includes(term)||x.ticker.toLowerCase().includes(term)||x.cusip.toLowerCase().includes(term)));
  const displayType={NEW:"NUEVA",SOLD:"NO REPORTADA",INCREASE:"AUMENTO",REDUCE:"REDUCCIÓN"};
  $("changeCount").textContent=prev+" → "+APP.period+" · "+number(a.length)+" cambios · top "+number(Math.min(a.length,350))+" mostrados";
  $("changesTable").innerHTML=a.length?panelTable(["Gestor","Empresa","Acciones anteriores","Acciones actuales","Variación acciones","Estado","Filing"],a.slice(0,350).map(x=>
    '<tr><td class="small">'+linkManager(x.managerId)+'</td><td>'+linkCompany(x,"id-cell")+'<div class="small muted">'+esc(x.issuer)+'</div></td><td>'+number(x.previous)+'</td><td>'+number(x.current)+'</td>'+
    '<td><strong>'+([ "NEW","SOLD"].includes(x.type)?"—":(x.change>=0?"+":"")+percent(x.change))+'</strong></td><td>'+pill(displayType[x.type],x.type==="NEW"?"blue":x.type==="SOLD"?"red":x.type==="INCREASE"?"green":"gold")+'</td><td>'+external(x.filingUrl,"SEC")+'</td></tr>'
  )):tdEmpty("No hay movimientos para estos filtros");
}
function renderOverlap(){
  const a=$("overlapA").value,b=$("overlapB").value;
  if(!a||!b){$("overlapBody").innerHTML=tdEmpty("Selecciona dos gestores");return}
  const aa=new Map(groupHoldings(managerRows(a)).map(x=>[x.id,x])),bb=new Map(groupHoldings(managerRows(b)).map(x=>[x.id,x]));
  const overlap=[...aa.keys()].filter(k=>bb.has(k)).map(k=>{const v=aa.get(k),w=bb.get(k);return {...v,combined:v.value+w.value,otherValue:w.value,other:w}}).sort((x,y)=>y.combined-x.combined);
  $("overlapBody").innerHTML='<div class="stat-strip">'+stat("Coincidencias en CUSIP",number(overlap.length))+stat("Solo "+managerName(a).split(" ")[0],number([...aa.keys()].filter(k=>!bb.has(k)).length))+stat("Solo "+managerName(b).split(" ")[0],number([...bb.keys()].filter(k=>!aa.has(k)).length))+'</div>'+
    '<div class="table-wrap">'+(overlap.length?panelTable(["Valor","Empresa","Valor 13F primer gestor","Valor 13F segundo gestor"],overlap.slice(0,200).map(x=>
      '<tr><td>'+linkCompany(x,"id-cell")+'</td><td>'+esc(x.issuer)+'</td><td>'+usd(x.value)+'</td><td>'+usd(x.otherValue)+'</td></tr>'
    )):tdEmpty("Sin valores compartidos en este trimestre"))+'</div><div class="footnote">Coincidir en el mismo CUSIP no implica que ambos gestores tengan el mismo precio de compra o la misma tesis.</div>';
}
function allocateCapped(scores,cap){
  const vals=scores.map(s=>Number.isFinite(s)&&s>0?s:1),n=vals.length;
  if(!n)return {weights:[],cash:1};
  const ceiling=Math.max(0,Math.min(1,Number(cap)||0));
  const weights=Array(n).fill(0);let free=Array.from({length:n},(_,i)=>i),remaining=1;
  for(let iter=0;iter<=n+1&&free.length&&remaining>1e-10;iter++){
    const total=free.reduce((s,i)=>s+vals[i],0),over=free.filter(i=>remaining*vals[i]/total>ceiling+1e-10);
    if(over.length===0){for(const i of free)weights[i]=remaining*vals[i]/total;remaining=0;break}
    for(const i of over)weights[i]=ceiling;
    free=free.filter(i=>!over.includes(i));
    remaining=Math.max(0,1-weights.reduce((s,x)=>s+x,0));
  }
  const sum=weights.reduce((s,x)=>s+x,0);
  return {weights,cash:Math.max(0,1-sum)};
}
function modelCandidates(){
  const equityOnly=$("portfolioWatchOnly").checked;
  return aggregate(APP.period,equityOnly).filter(x=>x.ticker&&x.holderCount>=Number($("portfolioMin").value));
}
function buildPortfolio(){
  const capital=Number($("portfolioCapital").value),n=Math.floor(Number($("portfolioCount").value)),cap=Number($("portfolioCap").value)/100;
  if(!Number.isFinite(capital)||capital<=0||!Number.isInteger(n)||n<1||n>50||!Number.isFinite(cap)||cap<=0||cap>1){
    $("portfolioSummary").innerHTML='<div class="error-msg">Introduce capital positivo, 1–50 posiciones y un peso máximo entre 1 % y 100 %.</div>';return}
  const candidates=modelCandidates().slice(0,n);
  if(!candidates.length){$("portfolioSummary").innerHTML=tdEmpty("No hay acciones elegibles en el periodo con esos filtros.");return}
  const scores=candidates.map(x=>x.holderCount*10+Math.log10(Math.max(10,x.value)));
  const allocation=allocateCapped(scores,cap);
  APP.model={capital,period:APP.period,rows:candidates.map((x,i)=>({...x,weight:allocation.weights[i],amount:allocation.weights[i]*capital,score:scores[i]})),cash:allocation.cash};
  renderPortfolio();
}
function renderPortfolio(){
  if(!APP.model||APP.model.period!==APP.period){$("portfolioSummary").innerHTML=tdEmpty("Genera una cartera modelo con los parámetros de la izquierda.");$("portfolioTablePanel").style.display="none";return}
  const m=APP.model,invested=m.rows.reduce((s,x)=>s+x.weight,0),cash=m.cash;
  $("portfolioSummary").innerHTML='<div class="portfolio-total"><div><strong>'+percent(invested)+'</strong><span>Asignación invertida</span></div><div><strong>'+percent(cash)+'</strong><span>Liquidez residual</span></div><div><strong>'+number(m.rows.length)+'</strong><span>Valores elegidos</span></div></div>'+
    '<div class="allocation-bar" aria-label="Asignación de cartera">'+m.rows.map(x=>'<i style="width:'+(x.weight*100).toFixed(3)+'%"></i>').join("")+'</div>'+
    '<div class="muted-box">'+(cash>0.0001?"El modelo conserva "+eur(cash*m.capital)+" en efectivo porque los límites impiden asignarlo sin exceder el máximo por valor.":"La asignación se ajusta a las restricciones seleccionadas.")+'</div>'+
    '<div class="stat-inline">Score heurístico = 10 × número de gestores + log₁₀(valor 13F USD). Ponderaciones proporcionales sujetas a techo. Sin rentabilidades proyectadas.</div>';
  $("portfolioTablePanel").style.display="block";
  $("portfolioTable").innerHTML=panelTable(["Empresa","Gestores","Score heurístico","Peso objetivo","Importe objetivo (€)","Análisis"],m.rows.map(x=>
    '<tr><td>'+linkCompany(x,"id-cell")+'<div class="small muted">'+esc(x.issuer)+'</div></td><td>'+x.holderCount+'</td><td>'+x.score.toFixed(1)+'</td><td>'+percent(x.weight)+'</td><td>'+eur(x.amount)+'</td><td><a href="#company/'+encodeURIComponent(x.id)+'">Ver ficha ↗</a></td></tr>'
  ).concat(cash>0.0001?['<tr><td><b>Efectivo no asignado</b></td><td>—</td><td>—</td><td>'+percent(cash)+'</td><td>'+eur(cash*m.capital)+'</td><td>—</td></tr>']:[]));
}
function exportPortfolio(){
  const m=APP.model;if(!m)return;
  const rows=[["periodo","cusip","ticker","empresa","gestores","score_heuristico","peso","importe_eur"],...m.rows.map(x=>[m.period,x.cusip,x.ticker,x.issuer,x.holderCount,x.score.toFixed(4),x.weight.toFixed(8),x.amount.toFixed(2)]),[m.period,"CASH","","Efectivo no asignado","",0,m.cash.toFixed(8),(m.cash*m.capital).toFixed(2)]];
  const csv="\ufeff"+rows.map(r=>r.map(x=>'"'+String(x??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download="portfolio-lab-"+m.period+".csv";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
}
const PROFILES={
 AAPL:{business:"Apple desarrolla dispositivos electrónicos, sistemas operativos y un ecosistema de servicios digitales. Sus ingresos proceden de hardware y servicios asociados.",segments:["iPhone","Mac y iPad","Wearables y accesorios","Servicios digitales"],ir:"https://investor.apple.com/"},
 MSFT:{business:"Microsoft suministra software empresarial, infraestructura de nube, productividad, videojuegos y herramientas de inteligencia artificial.",segments:["Productivity and Business Processes","Intelligent Cloud","More Personal Computing"],ir:"https://www.microsoft.com/en-us/Investor"},
 AMZN:{business:"Amazon opera plataformas de comercio electrónico, servicios de vendedores, suscripciones y la infraestructura de nube Amazon Web Services (AWS). También comercializa publicidad.",segments:["North America","International","Amazon Web Services (AWS)"],ir:"https://ir.aboutamazon.com/"},
 NVDA:{business:"NVIDIA desarrolla plataformas de computación acelerada basadas en GPU, sistemas y software destinados principalmente a centros de datos, gaming y otros mercados.",segments:["Compute & Networking","Graphics"],ir:"https://investor.nvidia.com/"},
 GOOGL:{business:"Alphabet agrupa negocios de búsqueda, publicidad online, vídeo, sistemas operativos, nube y proyectos tecnológicos de largo plazo.",segments:["Google Services","Google Cloud","Other Bets"],ir:"https://abc.xyz/investor/" },
 GOOG:{business:"Alphabet agrupa negocios de búsqueda, publicidad online, vídeo, sistemas operativos, nube y proyectos tecnológicos de largo plazo. GOOG corresponde a otra clase de acciones de Alphabet.",segments:["Google Services","Google Cloud","Other Bets"],ir:"https://abc.xyz/investor/"},
 META:{business:"Meta opera plataformas de redes sociales, mensajería y publicidad digital, además de proyectos de realidad virtual y aumentada.",segments:["Family of Apps","Reality Labs"],ir:"https://investor.atmeta.com/"},
 TSM:{business:"Taiwan Semiconductor Manufacturing Company presta servicios de fabricación de semiconductores por encargo para empresas que diseñan chips.",segments:["Fabricación avanzada de semiconductores","Tecnologías especializadas","Empaquetado avanzado"],ir:"https://investor.tsmc.com/"},
 AVGO:{business:"Broadcom suministra soluciones de semiconductores y software de infraestructura para clientes empresariales y centros de datos.",segments:["Semiconductor Solutions","Infrastructure Software"],ir:"https://investors.broadcom.com/"},
 UBER:{business:"Uber facilita movilidad urbana, entregas a domicilio y servicios logísticos mediante una plataforma tecnológica.",segments:["Mobility","Delivery","Freight"],ir:"https://investor.uber.com/"},
 NFLX:{business:"Netflix distribuye entretenimiento audiovisual por suscripción y ofrece modalidades apoyadas en publicidad en determinados mercados.",segments:["Suscripciones de entretenimiento","Publicidad y monetización complementaria"],ir:"https://ir.netflix.net/"},
 QSR:{business:"Restaurant Brands International es un grupo de restauración con marcas franquiciadas y operadas en distintos mercados.",segments:["Tim Hortons","Burger King","Popeyes","Firehouse Subs"],ir:"https://www.rbi.com/investors"},
 BRK:{business:"Berkshire Hathaway controla participaciones en seguros, ferrocarril, energía, industria, distribución y otros negocios.",segments:["Insurance","Railroad","Utilities and Energy","Manufacturing and Services"],ir:"https://www.berkshirehathaway.com/"},
 AMD:{business:"AMD diseña procesadores, GPU y semiconductores destinados a centros de datos, dispositivos personales y sistemas integrados.",segments:["Data Center","Client and Gaming","Embedded"],ir:"https://ir.amd.com/"},
 ORCL:{business:"Oracle suministra software empresarial, bases de datos, aplicaciones de gestión y servicios de infraestructura cloud.",segments:["Cloud Services and License Support","Cloud and On-Premise License","Hardware and Services"],ir:"https://www.oracle.com/investor/"},
 BABA:{business:"Alibaba desarrolla comercio digital, servicios cloud y otras actividades tecnológicas y de consumo.",segments:["Comercio digital","Cloud Intelligence","Negocios internacionales"],ir:"https://www.alibabagroup.com/en-US/ir-home"},
 TSLA:{business:"Tesla diseña y vende vehículos eléctricos, soluciones de almacenamiento energético y servicios relacionados.",segments:["Automotive","Energy Generation and Storage","Services and Other"],ir:"https://ir.tesla.com/"}
};
const TV_EXCH={AAPL:"NASDAQ",MSFT:"NASDAQ",AMZN:"NASDAQ",NVDA:"NASDAQ",GOOGL:"NASDAQ",GOOG:"NASDAQ",META:"NASDAQ",TSM:"NYSE",AVGO:"NASDAQ",UBER:"NYSE",NFLX:"NASDAQ",QSR:"NYSE",BRK:"NYSE","BRK.B":"NYSE",AMD:"NASDAQ",ORCL:"NYSE",BABA:"NYSE",TSLA:"NASDAQ",V:"NYSE",MA:"NYSE",COST:"NASDAQ",WMT:"NYSE",PDD:"NASDAQ",ADBE:"NASDAQ",CRM:"NYSE",SNOW:"NYSE",COIN:"NASDAQ",PLTR:"NASDAQ",SPOT:"NYSE"};
function tvSymbol(ticker){
  const t=String(ticker||"").toUpperCase().replace(/[^A-Z0-9.:-]/g,"");
  if(!t)return "";
  const normalized=t==="BRK.B"?"BRK.B":t;
  return (TV_EXCH[t]||"")+ (TV_EXCH[t]?":":"")+normalized;
}
function tvEmbed(id,kind,symbol,extra={}){
  const box=$(id);if(!box)return;
  box.replaceChildren();
  const div=document.createElement("div");div.className="tradingview-widget-container";div.style.cssText="height:100%;width:100%";
  const widget=document.createElement("div");widget.className="tradingview-widget-container__widget";widget.style.cssText="height:100%;width:100%";div.appendChild(widget);
  const script=document.createElement("script");
  script.type="text/javascript";script.async=true;script.src="https://s3.tradingview.com/external-embedding/embed-widget-"+kind+".js";
  script.textContent=JSON.stringify({symbol,colorTheme:"dark",theme:"dark",locale:"es",isTransparent:true,width:"100%",height:"100%",...extra});
  div.appendChild(script);box.appendChild(div);
}
function renderCompany(id){
  const present=aggregate().find(x=>x.id===id),archive=APP.data.holdings.filter(h=>key(h)===id);
  const shownPeriod=present?APP.period:[...new Set(archive.map(h=>h.quarter))].sort().at(-1);
  const x=present||groupHoldings(archive.filter(h=>h.quarter===shownPeriod))[0];
  if(!x){$("companyDetail").innerHTML=tdEmpty("No encontramos ese CUSIP. Vuelve al explorador y selecciona una empresa del periodo.");return}
  const ticker=String(x.ticker||"").toUpperCase(),profile=PROFILES[ticker]||null,TV=tvSymbol(ticker);
  const held=x.rows||[],holderSet=x.holders||new Set(held.map(h=>h.managerId));
  const issuer=x.issuer||id,sec=held.find(h=>h.filingUrl)?.filingUrl||"https://www.sec.gov/edgar/search/";
  const reportedManagers=managerAvailable(shownPeriod).size,consensus=reportedManagers?holderSet.size/reportedManagers:0;
  const holdings=held.slice().sort((a,b)=>Number(b.value||0)-Number(a.value||0));
  const title=esc(issuer);
  const chosen=APP.model?.rows.find(r=>r.cusip===id);
  $("companyDetail").innerHTML=
    '<div class="page-title"><div class="eyebrow">COMPANY RESEARCH · '+esc(shownPeriod)+'</div><div class="hero-symbol"><div class="ticker-mark">'+esc(ticker||"13F")+'</div><div><h1 class="company-name">'+title+'</h1><div class="company-sub">Ticker auxiliar: '+esc(ticker||"No disponible")+' · CUSIP: '+esc(id)+'</div></div></div><div class="hero-actions">'+external(sec,"Filing SEC")+(profile?.ir?external(profile.ir,"Relación con inversores"):"")+'</div></div>'+
    (shownPeriod!==APP.period?'<div class="note" style="margin-bottom:15px">Esta empresa no figura en el periodo seleccionado ('+esc(APP.period)+'). Se muestran sus últimas posiciones históricas disponibles ('+esc(shownPeriod)+').</div>':'')+
    '<div class="stat-strip">'+stat("Gestores que la declaran",number(holderSet.size)+"/"+number(reportedManagers))+stat("Consenso de la muestra",percent(consensus))+stat("Valor declarado conjunto",usd(x.value||0))+(chosen?stat("Peso en tu cartera modelo",percent(chosen.weight)):"")+'</div>'+
    '<div class="layout-50"><div class="panel"><div class="panel-head"><div><h2>Qué es y cómo gana dinero</h2><p>Perfil de negocio, no recomendación de inversión</p></div></div>'+
      (profile?'<p class="limit-text">'+esc(profile.business)+'</p><h3 style="margin-top:22px">Principales líneas de negocio</h3><div class="profile-grid">'+profile.segments.map(seg=>'<div class="business-card"><b>'+esc(seg)+'</b><p>Segmento o actividad; consulta informes oficiales para el peso en ventas y los márgenes.</p></div>').join("")+'</div><div class="footnote">Resumen editorial cualitativo · revisa la fecha y segmentación de los informes corporativos. '+external(profile.ir,"Fuente corporativa")+'</div>':
        '<div class="note">No hay perfil editorial verificado para este ticker. Debajo se carga la descripción de un proveedor bursátil independiente cuando el símbolo es reconocido. No se genera texto financiero sintético.</div>')+
      '<h3 style="margin-top:20px">Perfil de proveedor bursátil</h3>'+(TV?'<div id="tvProfile" class="widget-pane" style="height:270px"></div>':tdEmpty("Ticker no disponible; consulta los documentos del emisor"))+
    '</div><div class="panel"><div class="panel-head"><div><h2>Fundamentales y valoración</h2><p>PER, ingresos, márgenes, EBITDA y otros indicadores, cuando estén disponibles</p></div></div>'+
      '<div class="widget-note">Los datos de este panel los sirve <b>TradingView</b>; son independientes de la base 13F y pueden tener retrasos, diferencias metodológicas o métricas no disponibles. No inventamos ratios.</div>'+
      (TV?'<div id="tvInfo" class="widget-pane" style="min-height:140px"></div><div id="tvFinancials" class="widget-pane" style="height:480px;margin-top:12px"></div><div class="tv-footer">'+external("https://www.tradingview.com/symbols/"+encodeURIComponent(TV.replace(":","-"))+"/financials-overview/","Revisar financieros en TradingView")+'</div>':tdEmpty("Sin símbolo bursátil contrastado: los ratios no están disponibles"))+'</div></div>'+
    '<div class="panel" style="margin-top:16px"><div class="panel-head"><div><h2>Evolución de la acción en bolsa</h2><p>Gráfico interactivo externo con histórico, zoom e indicadores del proveedor</p></div></div>'+
      '<div class="widget-note">El gráfico procede de TradingView (mercado y cotización posiblemente diferidos). No está calculado a partir de los filings 13F.</div>'+
      (TV?'<div id="tvChart" class="widget-pane" style="height:500px"></div>':tdEmpty("No se puede asignar un gráfico fiable sin ticker"))+'</div>'+
    '<div class="panel" style="margin-top:16px"><div class="panel-head"><div><h2>Presencia institucional en nuestra muestra</h2><p>Registros de '+esc(shownPeriod)+'; referencia SEC disponible por posición</p></div></div>'+
      '<div class="table-wrap">'+panelTable(["Gestor","Acciones declaradas","Valor declarado","Peso dentro del 13F del gestor","Fuente"],holdings.map(h=>{
         const mgr=managerRows(h.managerId,shownPeriod),total=mgr.reduce((s,z)=>s+Number(z.value||0),0);
         return '<tr><td>'+linkManager(h.managerId)+'</td><td>'+number(h.shares)+'</td><td>'+usd(h.value)+'</td><td>'+percent(total?Number(h.value||0)/total:0)+'</td><td>'+external(h.filingUrl,"SEC")+'</td></tr>'}))+'</div>'+
      '<div class="footnote">CUSIP distingue clases de acciones. Los importes son valor declarado al cierre trimestral; los cambios en acciones no reflejan necesariamente transacciones netas ajustadas por splits.</div></div>';
  if(TV){
    tvEmbed("tvProfile","symbol-profile",TV,{height:270});
    tvEmbed("tvInfo","symbol-info",TV,{height:140});
    tvEmbed("tvFinancials","financials",TV,{height:480,displayMode:"adaptive"});
    tvEmbed("tvChart","advanced-chart",TV,{autosize:true,interval:"D",style:"1",allow_symbol_change:false,hide_top_toolbar:false,support_host:"https://www.tradingview.com"});
  }
}
function renderSources(){
  const meta=APP.data.meta||{};
  $("sourcesMeta").innerHTML='<div class="panel-meta">'+
    '<div class="meta-row"><span>Generado (UTC)</span><strong>'+esc(meta.generatedAt||"—")+'</strong></div>'+
    '<div class="meta-row"><span>Identificadores oficiales</span><strong>CIK / CUSIP / accession</strong></div>'+
    '<div class="meta-row"><span>Filings estructurados</span><strong>'+number(APP.data.filings?.length||0)+'</strong></div>'+
    '<div class="meta-row"><span>Filas publicadas</span><strong>'+number(APP.data.holdings.length)+'</strong></div>'+
    '<div class="meta-row"><span>Errores registrados</span><strong>'+number(meta.errors?.length||0)+'</strong></div>'+
    '</div><div class="footnote">'+esc(meta.note||"Los resultados son divulgaciones históricas sujetas a retrasos y cobertura regulatoria.")+'</div>';
}
if(typeof module!=="undefined"&&module.exports)module.exports={allocateCapped,groupHoldings,panelTable,computeChanges,APP,renderPortfolio};
if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",boot);