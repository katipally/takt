
(function(){
"use strict";
var reduce=matchMedia("(prefers-reduced-motion:reduce)").matches;
var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var NS="http://www.w3.org/2000/svg";
function E(t,a,kids){var e=document.createElementNS(a&&a._svg?NS:null,t);}
function svg(t,a){var e=document.createElementNS(NS,t);for(var k in a)e.setAttribute(k,a[k]);return e}
function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim()}

/* ===== scroll progress + nav highlight ===== */
var prog=$("#prog");
addEventListener("scroll",function(){
  var h=document.documentElement,p=h.scrollTop/(h.scrollHeight-h.clientHeight||1);
  prog.style.width=(p*100)+"%";
},{passive:true});
var navA=$$("#topnav a"),secs=navA.map(function(a){return $(a.getAttribute("href"))});
var navIO=new IntersectionObserver(function(en){en.forEach(function(e){
  if(e.isIntersecting){var i=secs.indexOf(e.target);navA.forEach(function(a){a.classList.remove("on")});if(navA[i])navA[i].classList.add("on")}
})},{rootMargin:"-40% 0px -55% 0px"});
secs.forEach(function(s){if(s)navIO.observe(s)});

/* ===== theme ===== */
$("#themeBtn").addEventListener("click",function(){
  var d=document.documentElement.getAttribute("data-theme")==="dark";
  document.documentElement.setAttribute("data-theme",d?"light":"dark");
  redrawThemed();
});

/* ===== count-up ===== */
function countUp(el){
  var target=+el.getAttribute("data-count"),suf=el.getAttribute("data-suffix")||"",t0=null,dur=1100;
  if(reduce){el.textContent=target.toLocaleString()+suf;return}
  function step(t){if(!t0)t0=t;var k=Math.min((t-t0)/dur,1);var e=1-Math.pow(1-k,3);
    el.textContent=Math.round(target*e).toLocaleString()+suf;if(k<1)requestAnimationFrame(step)}
  requestAnimationFrame(step);
}
function runCounters(){$$("[data-count]").forEach(countUp)}
$("#recountBtn")&&$("#recountBtn").addEventListener("click",runCounters);

/* ============================================================
   DIAGRAMS (hand-built SVG, mermaid grammar)
   ============================================================ */
function nodeBox(g,x,y,w,h,label,acc,rx){
  g.appendChild(svg("rect",{x:x,y:y,width:w,height:h,rx:rx==null?8:rx,class:"dg-node"+(acc?" acc":"")}));
  var t=svg("text",{x:x+w/2,y:y+h/2+4,"text-anchor":"middle",class:"dg-t"});t.textContent=label;g.appendChild(t);
}
function edge(g,x1,y1,x2,y2,label){
  g.appendChild(svg("path",{d:"M"+x1+" "+y1+" L"+x2+" "+y2,class:"dg-edge","marker-end":"url(#arw)"}));
  if(label){var t=svg("text",{x:(x1+x2)/2+6,y:(y1+y2)/2-3,class:"dg-lbl"});t.textContent=label;g.appendChild(t)}
}
function defsArrow(s){var d=svg("defs",{});var m=svg("marker",{id:"arw",viewBox:"0 0 10 10",refX:9,refY:5,markerWidth:7,markerHeight:7,orient:"auto-start-reverse"});
  var p=svg("path",{d:"M0 0 L10 5 L0 10 z",fill:css("--muted")});m.appendChild(p);d.appendChild(m);s.appendChild(d)}

function drawFlow(){
  var host=$("#dgFlow");host.innerHTML="";var s=svg("svg",{viewBox:"0 0 420 250"});defsArrow(s);
  nodeBox(s,150,10,120,38,"User request",false,18);
  nodeBox(s,150,80,120,38,"Authenticated?");
  nodeBox(s,20,150,120,38,"Serve page",true);
  nodeBox(s,270,150,130,38,"Redirect → login");
  nodeBox(s,150,210,120,36,"Log event",false,18);
  edge(s,210,48,210,80);
  edge(s,180,118,90,150,"yes");
  edge(s,240,118,320,150,"no");
  edge(s,80,188,190,210);
  edge(s,335,188,230,210);
  host.appendChild(s);
}
function drawSeq(){
  var host=$("#dgSeq");host.innerHTML="";var s=svg("svg",{viewBox:"0 0 420 250"});defsArrow(s);
  var actors=[["Client",60],["API",210],["DB",360]];
  actors.forEach(function(a){
    var r=svg("rect",{x:a[1]-46,y:8,width:92,height:30,rx:7,class:"dg-node acc"});s.appendChild(r);
    var t=svg("text",{x:a[1],y:28,"text-anchor":"middle",class:"dg-t"});t.textContent=a[0];s.appendChild(t);
    s.appendChild(svg("line",{x1:a[1],y1:38,x2:a[1],y2:238,stroke:css("--line"),"stroke-dasharray":"3 4","stroke-width":1}));
  });
  function msg(y,x1,x2,label,dash){
    s.appendChild(svg("path",{d:"M"+x1+" "+y+" L"+x2+" "+y,class:"dg-edge","marker-end":"url(#arw)","stroke-dasharray":dash?"4 3":"0"}));
    var t=svg("text",{x:(x1+x2)/2,y:y-6,"text-anchor":"middle",class:"dg-lbl"});t.textContent=label;s.appendChild(t);
  }
  msg(70,60,210,"POST /login");
  msg(110,210,360,"SELECT user");
  msg(150,360,210,"row",true);
  msg(190,210,60,"200 · token",true);
  host.appendChild(s);
}
function drawState(){
  var host=$("#dgState");host.innerHTML="";var s=svg("svg",{viewBox:"0 0 420 220"});defsArrow(s);
  s.appendChild(svg("circle",{cx:40,cy:40,r:8,fill:css("--ink")}));
  nodeBox(s,110,22,90,36,"Idle",false,18);
  nodeBox(s,260,22,110,36,"Loading",true,18);
  nodeBox(s,110,130,90,36,"Success",false,18);
  nodeBox(s,260,130,110,36,"Error",false,18);
  edge(s,48,40,110,40);
  edge(s,200,40,260,40,"fetch");
  edge(s,300,58,180,130,"ok");
  edge(s,320,58,320,130,"fail");
  edge(s,155,130,150,58,"retry");
  host.appendChild(s);
}
function drawGantt(){
  var host=$("#dgGantt");host.innerHTML="";var s=svg("svg",{viewBox:"0 0 420 220"});
  var rows=[["Research",0,3,"--blue"],["Design",2,4,"--accent"],["Build",5,7,"--blue"],["Test",10,3,"--accent"],["Ship",12,2,"--good"]];
  var x0=90,unit=(420-x0-14)/14,y=14,rh=32;
  for(var w=0;w<=14;w+=2){var gx=x0+w*unit;s.appendChild(svg("line",{x1:gx,y1:8,x2:gx,y2:200,stroke:css("--line"),"stroke-width":1}));
    var tt=svg("text",{x:gx,y:214,"text-anchor":"middle",class:"dg-lbl"});tt.textContent="w"+w;s.appendChild(tt)}
  rows.forEach(function(r,i){
    var yy=y+i*rh;
    var lb=svg("text",{x:8,y:yy+rh/2+3,class:"dg-t sm"});lb.textContent=r[0];s.appendChild(lb);
    s.appendChild(svg("rect",{x:x0+r[1]*unit,y:yy+6,width:r[2]*unit,height:rh-16,rx:5,fill:css(r[3]),opacity:.85}));
  });
  host.appendChild(s);
}

/* ============================================================
   CHARTS
   ============================================================ */
function drawDonut(){
  var host=$("#chDonut");host.innerHTML="";
  var data=[["Canvas",34,"--accent"],["SVG",41,"--blue"],["CSS",18,"--good"],["Audio",7,"--warn"]];
  var s=svg("svg",{viewBox:"0 0 200 200"});var cx=100,cy=100,r=72,rin=44,total=100,a0=-Math.PI/2;
  data.forEach(function(d){
    var ang=d[1]/total*Math.PI*2,a1=a0+ang;
    var large=ang>Math.PI?1:0;
    var x0=cx+r*Math.cos(a0),y0=cy+r*Math.sin(a0),x1=cx+r*Math.cos(a1),y1=cy+r*Math.sin(a1);
    var xi0=cx+rin*Math.cos(a1),yi0=cy+rin*Math.sin(a1),xi1=cx+rin*Math.cos(a0),yi1=cy+rin*Math.sin(a0);
    var p=svg("path",{d:"M"+x0+" "+y0+" A"+r+" "+r+" 0 "+large+" 1 "+x1+" "+y1+" L"+xi0+" "+yi0+" A"+rin+" "+rin+" 0 "+large+" 0 "+xi1+" "+yi1+" Z",
      fill:css(d[2]),stroke:css("--card"),"stroke-width":2,style:"transition:opacity .15s;cursor:pointer"});
    p.addEventListener("mouseenter",function(e){p.setAttribute("opacity",.8);showTip(d[0]+": "+d[1]+"%",e)});
    p.addEventListener("mousemove",moveTip);
    p.addEventListener("mouseleave",function(){p.setAttribute("opacity",1);hideTip()});
    s.appendChild(p);a0=a1;
  });
  var c=svg("text",{x:100,y:96,"text-anchor":"middle",fill:css("--ink"),"font-size":"26","font-weight":"700","font-family":"var(--mono)"});c.textContent="100%";s.appendChild(c);
  var c2=svg("text",{x:100,y:116,"text-anchor":"middle",fill:css("--muted"),"font-size":"9","font-family":"var(--mono)","letter-spacing":"1.5"});c2.textContent="RENDER MIX";s.appendChild(c2);
  host.appendChild(s);
  var leg=$("#donutLeg");leg.innerHTML="";data.forEach(function(d){var b=document.createElement("b");b.style.setProperty("--c",css(d[2]));b.textContent=d[0]+" "+d[1]+"%";leg.appendChild(b)});
}
function drawRadar(){
  var host=$("#chRadar");host.innerHTML="";
  var ax=["Speed","Weight","A11y","Motion","Sound","Reach"],vals=[.9,.95,.85,.8,.7,.6];
  var s=svg("svg",{viewBox:"0 0 220 200"});var cx=110,cy=100,R=72,n=ax.length;
  for(var ring=1;ring<=3;ring++){var pts=[];for(var i=0;i<n;i++){var a=-Math.PI/2+i/n*Math.PI*2;pts.push((cx+R*ring/3*Math.cos(a))+","+(cy+R*ring/3*Math.sin(a)))}
    s.appendChild(svg("polygon",{points:pts.join(" "),fill:"none",stroke:css("--line"),"stroke-width":1}))}
  for(var i=0;i<n;i++){var a=-Math.PI/2+i/n*Math.PI*2;s.appendChild(svg("line",{x1:cx,y1:cy,x2:cx+R*Math.cos(a),y2:cy+R*Math.sin(a),stroke:css("--line"),"stroke-width":1}));
    var lx=cx+(R+16)*Math.cos(a),ly=cy+(R+16)*Math.sin(a);var t=svg("text",{x:lx,y:ly+3,"text-anchor":"middle",fill:css("--muted"),"font-size":"9","font-family":"var(--mono)"});t.textContent=ax[i];s.appendChild(t)}
  var pp=[];for(var i=0;i<n;i++){var a=-Math.PI/2+i/n*Math.PI*2;pp.push((cx+R*vals[i]*Math.cos(a))+","+(cy+R*vals[i]*Math.sin(a)))}
  s.appendChild(svg("polygon",{points:pp.join(" "),fill:css("--accent"),"fill-opacity":".18",stroke:css("--accent"),"stroke-width":2}));
  pp.forEach(function(p){var xy=p.split(",");s.appendChild(svg("circle",{cx:xy[0],cy:xy[1],r:3,fill:css("--accent")}))});
  host.appendChild(s);
}
var gaugeVal=72;
function drawGauge(){
  var host=$("#chGauge");host.innerHTML="";
  var s=svg("svg",{viewBox:"0 0 200 130"});var cx=100,cy=110,r=78;
  function arc(a0,a1,color,w){var x0=cx+r*Math.cos(a0),y0=cy+r*Math.sin(a0),x1=cx+r*Math.cos(a1),y1=cy+r*Math.sin(a1),large=(a1-a0)>Math.PI?1:0;
    return svg("path",{d:"M"+x0+" "+y0+" A"+r+" "+r+" 0 "+large+" 1 "+x1+" "+y1,fill:"none",stroke:color,"stroke-width":w,"stroke-linecap":"round"})}
  s.appendChild(arc(Math.PI,Math.PI*2,css("--line"),13));
  var frac=gaugeVal/100;var col=gaugeVal>80?css("--crit"):gaugeVal>55?css("--warn"):css("--good");
  s.appendChild(arc(Math.PI,Math.PI+Math.PI*frac,col,13));
  var vt=svg("text",{x:100,y:96,"text-anchor":"middle",fill:css("--ink"),"font-size":"30","font-weight":"700","font-family":"var(--mono)"});vt.textContent=gaugeVal;s.appendChild(vt);
  var lt=svg("text",{x:100,y:116,"text-anchor":"middle",fill:css("--muted"),"font-size":"9","font-family":"var(--mono)","letter-spacing":"1.5"});lt.textContent="LOAD %";s.appendChild(lt);
  host.appendChild(s);
}
$("#gaugeR").addEventListener("input",function(){gaugeVal=+this.value;drawGauge()});

function drawHeat(){
  var host=$("#chHeat");host.innerHTML="";var cols=12,rowsN=6;host.style.gridTemplateColumns="repeat("+cols+",1fr)";
  var acc=css("--accent");
  for(var r=0;r<rowsN;r++)for(var c=0;c<cols;c++){
    var v=Math.round((Math.sin(r*0.9)*0.5+0.5)*(Math.cos(c*0.5)*0.4+0.6)*100);
    var cell=document.createElement("div");cell.className="cell";
    cell.style.background="color-mix(in srgb, "+acc+" "+v+"%, var(--card2))";
    cell.setAttribute("data-v",v);cell.setAttribute("tabindex","0");
    cell.setAttribute("aria-label","row "+(r+1)+" col "+(c+1)+": "+v);
    cell.addEventListener("mouseenter",function(e){showTip("value "+e.target.getAttribute("data-v"),e)});
    cell.addEventListener("mousemove",moveTip);
    cell.addEventListener("mouseleave",hideTip);
    host.appendChild(cell);
  }
}

/* live streaming line */
var liveData=[],liveTimer=null,livePaused=false;
function drawLive(){
  var host=$("#chLive");host.innerHTML="";
  var W=440,H=170,m=10;var s=svg("svg",{viewBox:"0 0 "+W+" "+H});
  var max=Math.max.apply(null,liveData.concat([1])),min=Math.min.apply(null,liveData.concat([0]));
  var X=function(i){return m+i/(liveData.length-1||1)*(W-2*m)};
  var Y=function(v){return H-m-(v-min)/((max-min)||1)*(H-2*m)};
  for(var i=1;i<4;i++)s.appendChild(svg("line",{x1:m,y1:H*i/4,x2:W-m,y2:H*i/4,stroke:css("--line"),"stroke-dasharray":"2 4","stroke-width":1}));
  if(liveData.length>1){
    var d=liveData.map(function(v,i){return (i?"L":"M")+X(i)+" "+Y(v)}).join(" ");
    var uid="lg"+Date.now?"":"";
    var defs=svg("defs",{});var lg=svg("linearGradient",{id:"liveg",x1:0,y1:0,x2:0,y2:1});
    lg.appendChild(svg("stop",{offset:"0%","stop-color":css("--accent"),"stop-opacity":".3"}));
    lg.appendChild(svg("stop",{offset:"100%","stop-color":css("--accent"),"stop-opacity":"0"}));defs.appendChild(lg);s.appendChild(defs);
    s.appendChild(svg("path",{d:d+" L"+X(liveData.length-1)+" "+(H-m)+" L"+X(0)+" "+(H-m)+" Z",fill:"url(#liveg)"}));
    s.appendChild(svg("path",{d:d,fill:"none",stroke:css("--accent"),"stroke-width":2,"stroke-linejoin":"round"}));
    s.appendChild(svg("circle",{cx:X(liveData.length-1),cy:Y(liveData[liveData.length-1]),r:4,fill:css("--accent"),stroke:css("--card"),"stroke-width":2}));
  }
  host.appendChild(s);
}
function livePush(){
  var last=liveData.length?liveData[liveData.length-1]:50;
  var nv=Math.max(5,Math.min(95,last+(Math.sin(liveData.length*0.7)*8)+(( (liveData.length*37)%17)-8)));
  liveData.push(Math.round(nv));if(liveData.length>32)liveData.shift();
  $("#liveVal").textContent="now "+liveData[liveData.length-1];drawLive();
}
function startLive(){for(var i=0;i<20;i++)livePush();if(!reduce)liveTimer=setInterval(function(){if(!livePaused)livePush()},900)}
$("#liveToggle").addEventListener("click",function(){livePaused=!livePaused;this.textContent=livePaused?"▶ Resume":"⏸ Pause"});

/* sparklines + stat tiles */
function sparkline(vals,color){
  var W=90,H=26;var max=Math.max.apply(null,vals),min=Math.min.apply(null,vals);
  var s=svg("svg",{viewBox:"0 0 "+W+" "+H,width:W,height:H,class:"spark"});
  var d=vals.map(function(v,i){return (i?"L":"M")+(i/(vals.length-1)*W)+" "+(H-2-(v-min)/((max-min)||1)*(H-4))}).join(" ");
  s.appendChild(svg("path",{d:d,fill:"none",stroke:color,"stroke-width":1.6,"stroke-linecap":"round","stroke-linejoin":"round"}));
  var lx=W,ly=H-2-(vals[vals.length-1]-min)/((max-min)||1)*(H-4);
  s.appendChild(svg("circle",{cx:lx,cy:ly,r:2.2,fill:color}));
  return s;
}
function buildStats(){
  var host=$("#statRow");host.innerHTML="";
  var stats=[["Sessions","12.4k","+8%","--good"],["Latency","112ms","-4%","--good"],["Errors","0.3%","+0.1%","--warn"],["Uptime","99.98%","stable","--blue"]];
  stats.forEach(function(st,i){
    var d=document.createElement("div");d.className="stat";
    d.innerHTML='<div class="l">'+st[0]+'</div><div class="n">'+st[1]+'</div><div style="font-size:.7rem;color:'+css(st[3])+';font-family:var(--mono)">'+st[2]+'</div>';
    var vals=[];for(var k=0;k<12;k++)vals.push(50+Math.sin(k*0.6+i)*20+((k*i*13)%15));
    var sp=sparkline(vals,css(st[3]));sp.classList.add("spark");d.appendChild(sp);host.appendChild(d);
  });
}

/* ===== chart tooltip ===== */
var ctip;
function ensureTip(){if(!ctip){ctip=document.createElement("div");ctip.style.cssText="position:fixed;z-index:70;pointer-events:none;opacity:0;transition:opacity .1s;font-family:var(--mono);font-size:.72rem;background:"+css("--ink")+";color:"+css("--bg")+";padding:6px 9px;border-radius:7px;box-shadow:0 6px 20px rgba(0,0,0,.3)";document.body.appendChild(ctip)}}
function showTip(txt,e){ensureTip();ctip.textContent=txt;ctip.style.opacity="1";moveTip(e)}
function moveTip(e){if(!ctip)return;ctip.style.left=Math.min(e.clientX+12,innerWidth-ctip.offsetWidth-8)+"px";ctip.style.top=(e.clientY-30)+"px"}
function hideTip(){if(ctip)ctip.style.opacity="0"}

function redrawThemed(){drawFlow();drawSeq();drawState();drawGantt();drawDonut();drawRadar();drawGauge();drawHeat();drawLive();buildStats();if(ctip){ctip.style.background=css("--ink");ctip.style.color=css("--bg")}}

/* ============================================================
   CONTROLS
   ============================================================ */
/* tabs */
(function(){
  var tabs=$$("#tabs [role=tab]"),panels=$$("#tabs [role=tabpanel]");
  function sel(i){tabs.forEach(function(t,k){t.setAttribute("aria-selected",k===i);panels[k].hidden=k!==i;if(k===i)t.focus()})}
  tabs.forEach(function(t,i){t.addEventListener("click",function(){sel(i)});
    t.addEventListener("keydown",function(e){if(e.key==="ArrowRight")sel((i+1)%tabs.length);if(e.key==="ArrowLeft")sel((i-1+tabs.length)%tabs.length)})});
})();
/* segmented (generic) */
$$(".seg").forEach(function(seg){seg.addEventListener("click",function(e){if(e.target.tagName!=="BUTTON")return;
  $$("button",seg).forEach(function(b){b.setAttribute("aria-pressed","false")});e.target.setAttribute("aria-pressed","true");
  if(seg.id==="waveSeg")currentWave=e.target.textContent})});
/* range outputs */
$("#vol").addEventListener("input",function(){$("#volOut").textContent=this.value});
/* rating */
(function(){
  var host=$("#stars"),val=3;
  for(var i=1;i<=5;i++){(function(i){var b=document.createElement("button");b.textContent="★";b.setAttribute("role","radio");b.setAttribute("aria-label",i+" stars");
    b.addEventListener("click",function(){val=i;paint()});b.addEventListener("mouseenter",function(){paint(i)});host.appendChild(b)})(i)}
  host.addEventListener("mouseleave",function(){paint()});
  function paint(h){$$("button",host).forEach(function(b,k){b.classList.toggle("lit",k<(h||val));b.setAttribute("aria-checked",k===val-1)})}
  paint();
})();
/* dropdown menu */
(function(){var m=$("#menu"),b=$("#menuBtn");
  b.addEventListener("click",function(e){e.stopPropagation();m.classList.toggle("open");b.setAttribute("aria-expanded",m.classList.contains("open"))});
  document.addEventListener("click",function(){m.classList.remove("open");b.setAttribute("aria-expanded","false")});
  $$("#menu [role=menuitem]").forEach(function(it){it.addEventListener("click",function(){toast(it.textContent.trim().split(" ")[0]+" clicked","good")})});
})();
/* wizard */
(function(){
  var step=0,texts=["Step 1 — create your account.","Step 2 — set up your profile.","All set — you're ready to deploy. 🚀"];
  var els=$$("#steps .s"),prev=$("#prevStep"),next=$("#nextStep"),body=$("#stepBody");
  function render(){els.forEach(function(el,i){el.classList.toggle("active",i===step);el.classList.toggle("done",i<step)});
    body.textContent=texts[step];prev.disabled=step===0;next.textContent=step===2?"Finish":"Next"}
  next.addEventListener("click",function(){if(step<2)step++;else{toast("Wizard complete","good");step=0}render()});
  prev.addEventListener("click",function(){if(step>0)step--;render()});render();
})();
/* dialog */
var dlg=$("#dlg");
$("#openDlg").addEventListener("click",function(){dlg.showModal()});
$("#dlgCancel").addEventListener("click",function(){dlg.close()});
$("#dlgOk").addEventListener("click",function(){dlg.close();toast("Deployment started","good")});
dlg.addEventListener("click",function(e){var r=dlg.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dlg.close()});
/* toasts */
function toast(msg,kind){
  var wrap=$("#toasts");var t=document.createElement("div");t.className="toast"+(kind==="warn"?" warn":kind==="crit"?" crit":"");
  t.innerHTML='<span>'+(kind==="warn"?"⚠":kind==="crit"?"✕":"✓")+'</span><span>'+msg+'</span><button class="x" aria-label="dismiss">×</button>';
  t.querySelector(".x").addEventListener("click",function(){t.remove()});
  wrap.appendChild(t);setTimeout(function(){t.style.opacity="0";t.style.transition="opacity .3s";setTimeout(function(){t.remove()},300)},3200);
}
$("#toastGood").addEventListener("click",function(){toast("Saved to your workspace","good")});
$("#toastWarn").addEventListener("click",function(){toast("Storage almost full","warn")});
/* copy */
$("#copyBtn").addEventListener("click",function(){var txt=this.getAttribute("data-copy");
  if(navigator.clipboard)navigator.clipboard.writeText(txt).then(function(){toast("Copied: "+txt,"good")},function(){toast("Copy blocked","crit")});
  else toast("Clipboard unavailable","warn")});

/* ============================================================
   DATA — table + kanban
   ============================================================ */
(function(){
  var rows=[
    {name:"Trieste",year:1960,depth:10916,status:"crewed"},
    {name:"Kaikō",year:1995,depth:10911,status:"robotic"},
    {name:"Nereus",year:2009,depth:10902,status:"lost"},
    {name:"Deepsea Challenger",year:2012,depth:10908,status:"crewed"},
    {name:"Limiting Factor",year:2019,depth:10925,status:"crewed"},
    {name:"Fendouzhe",year:2020,depth:10909,status:"crewed"}
  ];
  var tbody=$("#tbl tbody"),sortK="year",sortDir=1,q="";
  function statusPill(s){var c=s==="crewed"?"g":s==="robotic"?"w":"c";return '<span class="pill '+c+'">'+s+'</span>'}
  function render(){
    var r=rows.filter(function(x){return x.name.toLowerCase().indexOf(q)>=0||x.status.indexOf(q)>=0});
    r.sort(function(a,b){var av=a[sortK],bv=b[sortK];return (av<bv?-1:av>bv?1:0)*sortDir});
    tbody.innerHTML=r.map(function(x){return '<tr><td>'+x.name+'</td><td>'+x.year+'</td><td>'+x.depth.toLocaleString()+'</td><td>'+statusPill(x.status)+'</td></tr>'}).join("");
    $$("#tbl thead th").forEach(function(th){th.classList.toggle("sorted",th.getAttribute("data-k")===sortK);
      var ar=th.querySelector(".ar");ar.textContent=th.getAttribute("data-k")===sortK?(sortDir>0?"↑":"↓"):"↕"});
  }
  $$("#tbl thead th").forEach(function(th){th.addEventListener("click",function(){var k=th.getAttribute("data-k");if(k===sortK)sortDir*=-1;else{sortK=k;sortDir=1}render()})});
  $("#tblSearch").addEventListener("input",function(){q=this.value.toLowerCase();render()});
  render();
})();

(function(){
  var cols=[["Backlog",["Map hadal trenches","Refit sub lights","Sensor calibration"]],["Active",["Descent rehearsal","Ballast test"]],["Done",["Hull pressure cert"]]];
  var kb=$("#kanban");var dragEl=null;
  function count(col){var h=col.querySelector("h4 span");h.textContent=col.querySelectorAll(".kcard").length}
  cols.forEach(function(c){
    var col=document.createElement("div");col.className="kcol";
    col.innerHTML='<h4>'+c[0]+' <span></span></h4>';
    c[1].forEach(function(txt){col.appendChild(mkCard(txt))});
    col.addEventListener("dragover",function(e){e.preventDefault();col.classList.add("over")});
    col.addEventListener("dragleave",function(){col.classList.remove("over")});
    col.addEventListener("drop",function(e){e.preventDefault();col.classList.remove("over");if(dragEl){col.appendChild(dragEl);kb.querySelectorAll(".kcol").forEach(count)}});
    kb.appendChild(col);count(col);
  });
  function mkCard(txt){var c=document.createElement("div");c.className="kcard";c.textContent=txt;c.setAttribute("draggable","true");
    c.addEventListener("dragstart",function(){dragEl=c;setTimeout(function(){c.classList.add("drag")},0)});
    c.addEventListener("dragend",function(){c.classList.remove("drag");dragEl=null});return c}
})();

/* ============================================================
   FORMS
   ============================================================ */
(function(){
  var f=$("#form"),em=$("#fEmail"),pw=$("#fPw");
  function setState(field,ok,msg){var fld=field.closest(".field");fld.classList.toggle("err",ok===false);fld.classList.toggle("ok",ok===true);fld.querySelector(".msg").textContent=msg||""}
  em.addEventListener("input",function(){var v=em.value;if(!v){setState(em,null,"")}else if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))setState(em,true,"Looks good");else setState(em,false,"Enter a valid email")});
  pw.addEventListener("input",function(){var v=pw.value,score=0;if(v.length>=8)score++;if(/[A-Z]/.test(v))score++;if(/[0-9]/.test(v))score++;if(/[^A-Za-z0-9]/.test(v))score++;
    var bar=$("#strBar"),pct=[0,25,55,80,100][score],col=[css("--crit"),css("--crit"),css("--warn"),css("--good"),css("--good")][score];
    bar.style.width=pct+"%";bar.style.background=col;
    if(!v)setState(pw,null,"");else setState(pw,score>=3?true:null,["","Too weak","Weak","Good","Strong"][score])});
  f.addEventListener("submit",function(e){e.preventDefault();
    var okE=/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em.value),okP=pw.value.length>=8;
    if(!okE)setState(em,false,"Enter a valid email");if(!okP)setState(pw,false,"At least 8 characters");
    if(okE&&okP)toast("Account created","good")});
})();
(function(){
  var bar=$("#upBar"),pct=$("#upPct"),sk=$("#skeleton"),busy=false;
  $("#upStart").addEventListener("click",function(){if(busy)return;busy=true;sk.style.display="block";var p=0;
    var t=setInterval(function(){p+=Math.random()*18;if(p>=100){p=100;clearInterval(t);busy=false;setTimeout(function(){sk.style.display="none";toast("Upload complete","good")},400)}
      bar.style.width=p+"%";pct.textContent=Math.round(p)+"%"},220)})
})();

/* ============================================================
   MOTION / CANVAS
   ============================================================ */
/* particle constellation */
(function(){
  var cv=$("#particles"),ctx=cv.getContext("2d"),DPR=Math.min(devicePixelRatio||1,2),W,H,ps=[],mouse={x:-999,y:-999};
  function size(){var w=cv.parentElement.clientWidth;cv.width=w*DPR;cv.height=220*DPR;cv.style.height="220px";W=cv.width;H=cv.height;
    ps=[];var n=Math.round(w/22);for(var i=0;i<n;i++)ps.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.4*DPR,vy:(Math.random()-.5)*.4*DPR})}
  size();
  cv.addEventListener("pointermove",function(e){var r=cv.getBoundingClientRect();mouse.x=(e.clientX-r.left)*DPR;mouse.y=(e.clientY-r.top)*DPR});
  cv.addEventListener("pointerleave",function(){mouse.x=mouse.y=-999});
  function frame(){
    ctx.clearRect(0,0,W,H);var acc=css("--accent"),ink=css("--muted");
    for(var i=0;i<ps.length;i++){var p=ps[i];p.x+=p.vx;p.y+=p.vy;
      if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;
      var dx=p.x-mouse.x,dy=p.y-mouse.y,dd=Math.sqrt(dx*dx+dy*dy);
      if(dd<90*DPR){p.x+=dx/dd*1.4;p.y+=dy/dd*1.4}
      ctx.beginPath();ctx.arc(p.x,p.y,2*DPR,0,6.28);ctx.fillStyle=acc;ctx.fill();
    }
    for(var i=0;i<ps.length;i++)for(var j=i+1;j<ps.length;j++){var a=ps[i],b=ps[j],dx=a.x-b.x,dy=a.y-b.y,d=Math.sqrt(dx*dx+dy*dy);
      if(d<80*DPR){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=ink;ctx.globalAlpha=(1-d/(80*DPR))*.4;ctx.lineWidth=DPR;ctx.stroke();ctx.globalAlpha=1}}
    raf=requestAnimationFrame(frame);
  }
  var raf,running=false;
  var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting&&!reduce){if(!running){running=true;frame()}}else{running=false;cancelAnimationFrame(raf)}})},{threshold:.05});
  io.observe(cv);if(reduce)frame();
  addEventListener("resize",size);
})();
/* drawing pad */
(function(){
  var cv=$("#draw"),ctx=cv.getContext("2d"),DPR=Math.min(devicePixelRatio||1,2),drawing=false,last=null;
  function size(){var w=cv.parentElement.clientWidth;var img=cv.width?ctx.getImageData(0,0,cv.width,cv.height):null;
    cv.width=w*DPR;cv.height=220*DPR;cv.style.height="220px";ctx.fillStyle=css("--card2");ctx.fillRect(0,0,cv.width,cv.height);if(img)ctx.putImageData(img,0,0)}
  size();
  function pos(e){var r=cv.getBoundingClientRect();return{x:(e.clientX-r.left)*DPR,y:(e.clientY-r.top)*DPR}}
  cv.addEventListener("pointerdown",function(e){drawing=true;last=pos(e);cv.setPointerCapture(e.pointerId)});
  cv.addEventListener("pointermove",function(e){if(!drawing)return;var p=pos(e);
    ctx.strokeStyle=$("#penColor").value;ctx.lineWidth=3*DPR;ctx.lineCap="round";ctx.lineJoin="round";
    ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p});
  cv.addEventListener("pointerup",function(){drawing=false});
  cv.addEventListener("pointerleave",function(){drawing=false});
  $("#clearDraw").addEventListener("click",function(){ctx.fillStyle=css("--card2");ctx.fillRect(0,0,cv.width,cv.height)});
  addEventListener("resize",size);
})();
/* typewriter */
(function(){
  var el=$("#typer"),phrases=["diagrams.","live charts.","drag & drop.","synthesized sound.","zero dependencies."],pi=0,ci=0,del=false;
  if(reduce){el.textContent=phrases[0];return}
  function tick(){var p=phrases[pi];el.textContent=p.slice(0,ci);
    if(!del){ci++;if(ci>p.length){del=true;return setTimeout(tick,1200)}}else{ci--;if(ci<0){del=false;pi=(pi+1)%phrases.length;ci=0}}
    setTimeout(tick,del?38:70)}
  tick();
})();
/* confetti */
(function(){
  var cv=$("#confetti"),ctx=cv.getContext("2d"),parts=[];
  function burst(){
    cv.style.display="block";cv.width=innerWidth;cv.height=innerHeight;
    var cols=[css("--accent"),css("--blue"),css("--good"),css("--warn")];
    for(var i=0;i<140;i++)parts.push({x:innerWidth/2,y:innerHeight/2,vx:(Math.random()-.5)*14,vy:(Math.random()-.5)*14-4,
      c:cols[i%cols.length],r:3+Math.random()*4,rot:Math.random()*6,vr:(Math.random()-.5)*.3,life:1});
    if(!raf)loop();
  }
  var raf=null;
  function loop(){ctx.clearRect(0,0,cv.width,cv.height);var alive=false;
    parts.forEach(function(p){if(p.life<=0)return;alive=true;p.vy+=.28;p.x+=p.vx;p.y+=p.vy;p.rot+=p.vr;p.life-=.009;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.globalAlpha=Math.max(p.life,0);ctx.fillStyle=p.c;ctx.fillRect(-p.r,-p.r,p.r*2,p.r*2.4);ctx.restore()});
    if(alive)raf=requestAnimationFrame(loop);else{raf=null;parts=[];cv.style.display="none"}}
  $("#confettiBtn").addEventListener("click",function(){if(reduce){toast("🎉 Celebrate!","good");return}burst();sfx("coin")});
})();

/* ============================================================
   SOUND — Web Audio synth
   ============================================================ */
var actx=null,currentWave="sine";
function ac(){if(!actx)actx=new (window.AudioContext||window.webkitAudioContext)();if(actx.state==="suspended")actx.resume();return actx}
function tone(freq,dur,wave,vol){
  var c=ac();var o=c.createOscillator(),g=c.createGain();o.type=wave||currentWave;o.frequency.value=freq;
  o.connect(g);g.connect(c.destination);var t=c.currentTime;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol||.22,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+(dur||.35));
  o.start(t);o.stop(t+(dur||.35)+.02);
}
function sfx(kind){if(kind==="pop"){tone(660,.09,"square",.2);setTimeout(function(){tone(880,.08,"square",.15)},60)}
  else{tone(988,.08,"square",.2);setTimeout(function(){tone(1319,.14,"square",.2)},70)}}
$("#sfxPop").addEventListener("click",function(){sfx("pop")});
$("#sfxCoin").addEventListener("click",function(){sfx("coin")});
(function(){
  var host=$("#keys");
  var notes=[["C",261.63],["D",293.66],["E",329.63],["F",349.23],["G",392],["A",440],["B",493.88],["C²",523.25]];
  var blacks=[["C#",277.18,0],["D#",311.13,1],null,["F#",369.99,3],["G#",415.3,4],["A#",466.16,5]];
  var keymap={a:0,s:1,d:2,f:3,g:4,h:5,j:6,k:7};
  notes.forEach(function(n,i){var w=document.createElement("div");w.className="wk";w.textContent=n[0];w.setAttribute("data-i",i);
    w.addEventListener("pointerdown",function(){play(i)});host.appendChild(w)});
  var wkw=100/notes.length;
  blacks.forEach(function(b){if(!b)return;var d=document.createElement("div");d.className="bk";
    d.style.left="calc("+((b[2]+1)*wkw)+"% - 4%)";d.addEventListener("pointerdown",function(e){e.stopPropagation();tone(b[1],.4);flashBlack(d)});host.appendChild(d)});
  function play(i){tone(notes[i][1],.5);var el=host.querySelector('.wk[data-i="'+i+'"]');if(el){el.classList.add("act");setTimeout(function(){el.classList.remove("act")},160)}}
  function flashBlack(d){d.classList.add("act");setTimeout(function(){d.classList.remove("act")},160)}
  addEventListener("keydown",function(e){if(e.repeat)return;var k=e.key.toLowerCase();if(k in keymap)play(keymap[k])});
})();

/* ============================================================
   COMMAND PALETTE (⌘K)
   ============================================================ */
(function(){
  var dlg=$("#cmdk"),input=$("#cmdInput"),list=$("#cmdList"),sel=0;
  var cmds=[
    {ic:"◱",t:"Go to Diagrams",go:"#diagrams"},{ic:"◔",t:"Go to Charts",go:"#charts"},
    {ic:"⚙",t:"Go to Controls",go:"#controls"},{ic:"▦",t:"Go to Data",go:"#data"},
    {ic:"✦",t:"Go to Motion",go:"#motion"},{ic:"♪",t:"Go to Sound",go:"#sound"},
    {ic:"◐",t:"Toggle theme",fn:function(){$("#themeBtn").click()}},
    {ic:"🎉",t:"Fire confetti",fn:function(){$("#confettiBtn").click()}},
    {ic:"✓",t:"Show a toast",fn:function(){toast("Hello from the command palette","good")}}
  ];
  function open(){dlg.showModal();input.value="";render("");input.focus()}
  function render(q){q=q.toLowerCase();var r=cmds.filter(function(c){return c.t.toLowerCase().indexOf(q)>=0});sel=0;
    list.innerHTML=r.map(function(c,i){return '<li role="option" data-i="'+cmds.indexOf(c)+'" aria-selected="'+(i===0)+'"><span class="ic">'+c.ic+'</span>'+c.t+'<span class="hint">↵</span></li>'}).join("")||'<li style="color:var(--muted)">No matches</li>';
    bindItems();}
  function bindItems(){$$("#cmdList li[data-i]").forEach(function(li){li.addEventListener("click",function(){run(+li.getAttribute("data-i"))})})}
  function run(i){var c=cmds[i];dlg.close();if(c.go)location.hash=c.go;if(c.fn)c.fn()}
  input.addEventListener("input",function(){render(input.value)});
  input.addEventListener("keydown",function(e){
    var items=$$("#cmdList li[data-i]");if(!items.length)return;
    if(e.key==="ArrowDown"){e.preventDefault();sel=(sel+1)%items.length}
    else if(e.key==="ArrowUp"){e.preventDefault();sel=(sel-1+items.length)%items.length}
    else if(e.key==="Enter"){e.preventDefault();run(+items[sel].getAttribute("data-i"));return}
    items.forEach(function(li,k){li.setAttribute("aria-selected",k===sel)});
    if(items[sel])items[sel].scrollIntoView({block:"nearest"});
  });
  dlg.addEventListener("click",function(e){var r=dlg.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dlg.close()});
  $("#cmdBtn").addEventListener("click",open);
  addEventListener("keydown",function(e){if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();open()}});
})();

/* ============================================================
   INIT (build heavy things when scrolled into view)
   ============================================================ */
redrawThemed();
buildStats();
runCounters();
startLive();
})();
