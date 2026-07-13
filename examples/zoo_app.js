
(function(){
"use strict";
var $=function(s){return document.querySelector(s)};
var NS="http://www.w3.org/2000/svg";
var DPR=Math.min(devicePixelRatio||1,2);
function svg(t,a){var e=document.createElementNS(NS,t);for(var k in a)e.setAttribute(k,a[k]);return e}
function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim()}
var CAT=[css("--c1"),css("--c2"),css("--c3"),css("--c4"),css("--c5"),css("--c6")];
function hex2rgb(h){h=h.replace("#","");return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)]}
function mix(a,b,t){var A=hex2rgb(a),B=hex2rgb(b);return "rgb("+Math.round(A[0]+(B[0]-A[0])*t)+","+Math.round(A[1]+(B[1]-A[1])*t)+","+Math.round(A[2]+(B[2]-A[2])*t)+")"}
/* seeded pseudo-random so layout is stable (no Math.random at build) */
var _s=1234567;function rnd(){_s=(_s*1103515245+12345)&0x7fffffff;return _s/0x7fffffff}

/* shared tooltip */
var tip=$("#tip");
function showTip(html,e){tip.innerHTML=html;tip.style.opacity="1";moveTip(e)}
function moveTip(e){tip.style.left=Math.min(e.clientX+12,innerWidth-tip.offsetWidth-8)+"px";tip.style.top=(e.clientY-38)+"px"}
function hideTip(){tip.style.opacity="0"}

/* ============ SCATTER (canvas, pan/zoom) ============ */
(function(){
  var cv=$("#scatter"),ctx=cv.getContext("2d"),W,H=300;
  var pts=[];for(var i=0;i<180;i++){var cat=i%3;var cx=[25,55,80][cat],cy=[70,40,55][cat];
    pts.push({x:cx+(rnd()-0.5)*34,y:cy+(rnd()-0.5)*34,c:cat})}
  var view={s:1,ox:0,oy:0},drag=false,px,py,moved=false;
  function size(){W=cv.clientWidth;cv.width=W*DPR;cv.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0)}
  function wx(x){return (x/100*(W-50)+30)*view.s+view.ox}
  function wy(y){return ((1-y/100)*(H-40)+8)*view.s+view.oy}
  function draw(){
    size();ctx.clearRect(0,0,W,H);
    // grid
    ctx.strokeStyle=css("--edge");ctx.lineWidth=1;ctx.fillStyle=css("--muted");ctx.font="10px "+css("--mono");
    for(var g=0;g<=100;g+=25){var gx=wx(g),gy=wy(g);
      ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke();}
    pts.forEach(function(p){var x=wx(p.x),y=wy(p.y);if(x<-10||x>W+10||y<-10||y>H+10)return;
      ctx.beginPath();ctx.arc(x,y,4.2*Math.min(view.s,2),0,6.28);ctx.fillStyle=CAT[p.c];ctx.globalAlpha=.82;ctx.fill();ctx.globalAlpha=1})
  }
  cv.addEventListener("wheel",function(e){e.preventDefault();var r=cv.getBoundingClientRect();var mx=e.clientX-r.left,my=e.clientY-r.top;
    var f=e.deltaY<0?1.12:1/1.12;var ns=Math.max(1,Math.min(view.s*f,8));var k=ns/view.s;
    view.ox=mx-(mx-view.ox)*k;view.oy=my-(my-view.oy)*k;view.s=ns;$("#scatterZoom").textContent="zoom ×"+view.s.toFixed(1);draw()},{passive:false});
  cv.addEventListener("pointerdown",function(e){drag=true;moved=false;px=e.clientX;py=e.clientY;cv.setPointerCapture(e.pointerId)});
  cv.addEventListener("pointermove",function(e){
    if(drag){view.ox+=e.clientX-px;view.oy+=e.clientY-py;px=e.clientX;py=e.clientY;moved=true;draw();return}
    var r=cv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top,best=null,bd=99;
    pts.forEach(function(p){var d=Math.hypot(wx(p.x)-mx,wy(p.y)-my);if(d<bd){bd=d;best=p}});
    if(best&&bd<9){showTip("Sensor "+["A","B","C"][best.c]+"<br><b>"+best.x.toFixed(1)+", "+best.y.toFixed(1)+"</b>",e)}else hideTip()});
  cv.addEventListener("pointerup",function(){drag=false});
  cv.addEventListener("pointerleave",function(){drag=false;hideTip()});
  $("#scatterReset").addEventListener("click",function(){view={s:1,ox:0,oy:0};$("#scatterZoom").textContent="zoom ×1.0";draw()});
  addEventListener("resize",draw);draw();
})();

/* ============ TREEMAP (svg, binary split) ============ */
(function(){
  var host=$("#treemap");
  var data=[{n:"Video",v:340,c:0},{n:"Images",v:220,c:1},{n:"Backups",v:180,c:2},
    {n:"Logs",v:120,c:3},{n:"Docs",v:90,c:4},{n:"Cache",v:70,c:5}];
  var W=520,H=300;
  function layout(items,x,y,w,h,out){
    if(items.length===1){out.push({d:items[0],x:x,y:y,w:w,h:h});return}
    var tot=items.reduce(function(s,d){return s+d.v},0),half=tot/2,acc=0,i=0;
    for(;i<items.length;i++){if(acc+items[i].v>half&&i>0)break;acc+=items[i].v}
    var a=items.slice(0,i),b=items.slice(i),af=acc/tot;
    if(w>=h){layout(a,x,y,w*af,h,out);layout(b,x+w*af,y,w*(1-af),h,out)}
    else{layout(a,x,y,w,h*af,out);layout(b,x,y+h*af,w,h*(1-af),out)}
  }
  var rects=[];layout(data.slice().sort(function(a,b){return b.v-a.v}),0,0,W,H,rects);
  var s=svg("svg",{viewBox:"0 0 "+W+" "+H});
  rects.forEach(function(r){
    var g=svg("g",{});
    var rect=svg("rect",{x:r.x+1.5,y:r.y+1.5,width:Math.max(r.w-3,0),height:Math.max(r.h-3,0),rx:6,fill:CAT[r.d.c],style:"cursor:pointer;transition:opacity .15s"});
    rect.addEventListener("mouseenter",function(e){rect.setAttribute("opacity",.8);showTip(r.d.n+"<br><b>"+r.d.v+" GB</b>",e)});
    rect.addEventListener("mousemove",moveTip);rect.addEventListener("mouseleave",function(){rect.setAttribute("opacity",1);hideTip()});
    g.appendChild(rect);
    if(r.w>54&&r.h>34){
      var t1=svg("text",{x:r.x+11,y:r.y+24,fill:"#fff","font-size":"13","font-weight":"600","font-family":css("--sans")});t1.textContent=r.d.n;g.appendChild(t1);
      var t2=svg("text",{x:r.x+11,y:r.y+40,fill:"rgba(255,255,255,.8)","font-size":"11","font-family":css("--mono")});t2.textContent=r.d.v+" GB";g.appendChild(t2);
    }
    s.appendChild(g);
  });
  host.appendChild(s);
})();

/* ============ SANKEY (svg) ============ */
(function(){
  var host=$("#sankey");var W=520,H=300,pad=18,nodeW=13;
  var cols=[
    [{id:"search",n:"Search",v:230,c:0},{id:"social",n:"Social",v:150,c:3},{id:"direct",n:"Direct",v:120,c:5}],
    [{id:"land",n:"Landing",v:500,c:1}],
    [{id:"signup",n:"Sign-up",v:180,c:2},{id:"browse",n:"Browsed",v:150,c:4},{id:"bounce",n:"Bounced",v:170,c:1}]
  ];
  var links=[
    ["search","land",230],["social","land",150],["direct","land",120],
    ["land","signup",180],["land","browse",150],["land","bounce",170]
  ];
  var colX=[pad,W/2-nodeW/2,W-pad-nodeW];
  var pos={};
  cols.forEach(function(col,ci){var tot=col.reduce(function(s,d){return s+d.v},0);var gap=10;
    var avail=H-2*pad-gap*(col.length-1);var y=pad;
    col.forEach(function(nd){var h=nd.v/tot*avail;pos[nd.id]={x:colX[ci],y:y,h:h,c:nd.c,n:nd.n,v:nd.v,ci:ci};y+=h+gap})});
  var s=svg("svg",{viewBox:"0 0 "+W+" "+H});
  // links (track offsets per node)
  var offOut={},offIn={};
  links.forEach(function(l){var a=pos[l[0]],b=pos[l[1]];
    var srcTot=links.filter(function(x){return x[0]===l[0]}).reduce(function(s,x){return s+x[2]},0);
    var dstTot=links.filter(function(x){return x[1]===l[1]}).reduce(function(s,x){return s+x[2]},0);
    var wA=l[2]/srcTot*a.h,wB=l[2]/dstTot*b.h;
    var oA=offOut[l[0]]||0,oB=offIn[l[1]]||0;offOut[l[0]]=oA+wA;offIn[l[1]]=oB+wB;
    var x1=a.x+nodeW,y1=a.y+oA+wA/2,x2=b.x,y2=b.y+oB+wB/2,mx=(x1+x2)/2;
    var path=svg("path",{d:"M"+x1+" "+y1+" C"+mx+" "+y1+" "+mx+" "+y2+" "+x2+" "+y2,
      fill:"none",stroke:CAT[a.c],"stroke-width":Math.max((wA+wB)/2,1.5),"stroke-opacity":.34,style:"transition:stroke-opacity .15s"});
    path.addEventListener("mouseenter",function(e){path.setAttribute("stroke-opacity",.7);showTip(a.n+" → "+b.n+"<br><b>"+l[2]+"</b>",e)});
    path.addEventListener("mousemove",moveTip);path.addEventListener("mouseleave",function(){path.setAttribute("stroke-opacity",.34);hideTip()});
    s.appendChild(path);
  });
  // nodes
  for(var id in pos){(function(nd){
    s.appendChild(svg("rect",{x:nd.x,y:nd.y,width:nodeW,height:Math.max(nd.h,2),rx:3,fill:CAT[nd.c]}));
    var anchor=nd.ci===2?"end":"start",tx=nd.ci===2?nd.x-6:nd.x+nodeW+6;
    var t=svg("text",{x:tx,y:nd.y+nd.h/2+4,"text-anchor":anchor,"font-size":"11","font-family":css("--sans"),fill:css("--ink")});
    t.textContent=nd.n+" ("+nd.v+")";s.appendChild(t);
  })(pos[id])}
  host.appendChild(s);
})();

/* ============ FORCE-DIRECTED (canvas, live sim) ============ */
(function(){
  var cv=$("#force"),ctx=cv.getContext("2d"),W,H=320;
  var groups=[0,0,0,0,3,3,3,3,3,5,5,5,5,5,5,5]; // color index by node
  var N=groups.length,nodes=[],links=[];
  for(var i=0;i<N;i++)nodes.push({x:0,y:0,vx:0,vy:0,c:groups[i],r:groups[i]===0?11:7,fixed:false});
  // links: core cluster + services attach to core + clients attach to services
  [[0,1],[0,2],[0,3],[1,2],[2,3]].forEach(function(l){links.push(l)});
  for(var i=4;i<9;i++)links.push([i,i%4]);       // services -> core
  for(var i=9;i<16;i++)links.push([i,4+(i%5)]);   // clients -> services
  function size(){W=cv.clientWidth;cv.width=W*DPR;cv.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0)}
  size();
  nodes.forEach(function(n,i){var a=i/N*6.28;n.x=W/2+Math.cos(a)*90;n.y=H/2+Math.sin(a)*70});
  var drag=null;
  function tick(){
    // repulsion
    for(var i=0;i<N;i++)for(var j=i+1;j<N;j++){var a=nodes[i],b=nodes[j];var dx=a.x-b.x,dy=a.y-b.y,d2=dx*dx+dy*dy||1;var d=Math.sqrt(d2);
      var f=1400/d2;var fx=dx/d*f,fy=dy/d*f;a.vx+=fx;a.vy+=fy;b.vx-=fx;b.vy-=fy}
    // springs
    links.forEach(function(l){var a=nodes[l[0]],b=nodes[l[1]];var dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;var f=(d-70)*0.02;
      var fx=dx/d*f,fy=dy/d*f;a.vx+=fx;a.vy+=fy;b.vx-=fx;b.vy-=fy});
    // center gravity + integrate
    nodes.forEach(function(n){n.vx+=(W/2-n.x)*0.002;n.vy+=(H/2-n.y)*0.002;
      if(n.fixed){n.vx=n.vy=0;return}n.vx*=0.86;n.vy*=0.86;n.x+=n.vx;n.y+=n.vy;
      n.x=Math.max(n.r,Math.min(W-n.r,n.x));n.y=Math.max(n.r,Math.min(H-n.r,n.y))});
  }
  function draw(){
    size();ctx.clearRect(0,0,W,H);
    ctx.strokeStyle=css("--line");ctx.lineWidth=1.2;
    links.forEach(function(l){var a=nodes[l[0]],b=nodes[l[1]];ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()});
    nodes.forEach(function(n){ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,6.28);ctx.fillStyle=CAT[n.c];ctx.fill();
      ctx.lineWidth=2;ctx.strokeStyle=css("--card");ctx.stroke()});
  }
  function loop(){tick();draw();raf=requestAnimationFrame(loop)}
  var raf;
  function pick(e){var r=cv.getBoundingClientRect(),mx=(e.clientX-r.left),my=(e.clientY-r.top),best=null,bd=99;
    nodes.forEach(function(n){var d=Math.hypot(n.x-mx,n.y-my);if(d<bd){bd=d;best=n}});return bd<16?{n:best,mx:mx,my:my}:null}
  cv.addEventListener("pointerdown",function(e){var p=pick(e);if(p){drag=p.n;drag.fixed=true;cv.setPointerCapture(e.pointerId)}});
  cv.addEventListener("pointermove",function(e){var r=cv.getBoundingClientRect();if(drag){drag.x=e.clientX-r.left;drag.y=e.clientY-r.top;return}
    var p=pick(e);if(p){showTip(["Core","","","Service","Client"][p.n.c===0?0:p.n.c===3?3:4]+" node",e);cv.style.cursor="grab"}else{hideTip();cv.style.cursor="default"}});
  cv.addEventListener("pointerup",function(){if(drag){drag.fixed=false;drag=null}});
  cv.addEventListener("pointerleave",function(){hideTip();if(drag){drag.fixed=false;drag=null}});
  var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){if(!raf)loop()}else{cancelAnimationFrame(raf);raf=null}})},{threshold:.05});
  io.observe(cv);addEventListener("resize",size);
})();

/* ============ CALENDAR HEATMAP (svg) ============ */
(function(){
  var host=$("#calendar");var weeks=53,cell=13,gap=3,top=18,left=30;
  var months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var W=left+weeks*(cell+gap)+10,H=top+7*(cell+gap)+6;
  var s=svg("svg",{viewBox:"0 0 "+W+" "+H});
  var ramp=["--edge","--c1"];var lo=css("--edge"),hi=css("--c1");
  // day-of-week labels
  ["Mon","Wed","Fri"].forEach(function(d,i){var t=svg("text",{x:2,y:top+((i*2+1)*(cell+gap))+cell-2,"font-size":"9","font-family":css("--mono"),fill:css("--muted")});t.textContent=d;s.appendChild(t)});
  var day=0,lastMonth=-1;
  for(var w=0;w<weeks;w++)for(var d=0;d<7;d++){
    if(w*7+d>370)break;
    var v=Math.max(0,Math.min(1,0.5+0.4*Math.sin(day*0.14)+(rnd()-0.5)*0.5));
    if(rnd()<0.12)v=rnd()*0.15; // some quiet days
    var x=left+w*(cell+gap),y=top+d*(cell+gap);
    var rect=svg("rect",{x:x,y:y,width:cell,height:cell,rx:3,fill:mix(lo,hi,v),style:"cursor:pointer"});
    (function(vv,dd){rect.addEventListener("mouseenter",function(e){showTip("Day "+dd+"<br><b>"+Math.round(vv*180)+" events</b>",e)});
      rect.addEventListener("mousemove",moveTip);rect.addEventListener("mouseleave",hideTip)})(v,day+1);
    s.appendChild(rect);
    // month label at first week of month (approx every ~4.4 weeks)
    var mo=Math.floor(day/30.4);if(mo!==lastMonth&&d===0&&mo<12){var mt=svg("text",{x:x,y:12,"font-size":"9","font-family":css("--mono"),fill:css("--muted")});mt.textContent=months[mo];s.appendChild(mt);lastMonth=mo}
    day++;
  }
  host.appendChild(s);
  $("#calRamp").style.background="linear-gradient(90deg,"+mix(lo,hi,0.1)+","+hi+")";
})();

/* ============ HEX CARTOGRAM MAP (svg) ============ */
(function(){
  var host=$("#hexmap");
  // stylised blob layout: [col,row] cells
  var cells=[[0,1],[0,2],[1,0],[1,1],[1,2],[1,3],[2,0],[2,1],[2,2],[2,3],[2,4],
    [3,0],[3,1],[3,2],[3,3],[3,4],[4,0],[4,1],[4,2],[4,3],[5,1],[5,2],[5,3],[6,1],[6,2]];
  var data=cells.map(function(c,i){return {c:c[0],r:c[1],code:"D"+(i+1<10?"0":"")+(i+1),
    revenue:20+rnd()*180,growth:-8+rnd()*40,accounts:50+rnd()*900}});
  var size=26,W=560,H=260,ox=40,oy=26;
  var sqrt3=Math.sqrt(3);
  function center(c,r){var x=ox+c*1.5*size;var y=oy+r*sqrt3*size+(c%2)*(sqrt3*size/2);return [x,y]}
  function hexPath(cx,cy){var p="";for(var i=0;i<6;i++){var a=Math.PI/180*(60*i);var x=cx+size*Math.cos(a),y=cy+size*Math.sin(a);p+=(i?"L":"M")+x.toFixed(1)+" "+y.toFixed(1)}return p+"Z"}
  var metric="revenue",metricLabel={revenue:"Revenue $k",growth:"Growth %",accounts:"Accounts"};
  var hi=css("--c2"),lo=css("--edge");
  $("#mapRamp").style.background="linear-gradient(90deg,"+mix(lo,hi,0.12)+","+hi+")";
  var s=svg("svg",{viewBox:"0 0 "+W+" "+H});
  var cellsEls=[];
  data.forEach(function(d){
    var ct=center(d.c,d.r);
    var path=svg("path",{d:hexPath(ct[0],ct[1]),stroke:css("--card"),"stroke-width":2,style:"cursor:pointer;transition:fill .3s"});
    var label=svg("text",{x:ct[0],y:ct[1]+3,"text-anchor":"middle","font-size":"9","font-family":css("--mono"),fill:"rgba(255,255,255,.85)","pointer-events":"none"});
    label.textContent=d.code;
    path.addEventListener("mouseenter",function(e){path.setAttribute("stroke",css("--ink"));showTip(d.code+"<br><b>"+fmtMetric(d)+"</b>",e)});
    path.addEventListener("mousemove",moveTip);
    path.addEventListener("mouseleave",function(){path.setAttribute("stroke",css("--card"));hideTip()});
    path.addEventListener("click",function(){$("#mapSel").textContent=d.code+" · Rev $"+Math.round(d.revenue)+"k · Growth "+d.growth.toFixed(1)+"% · "+Math.round(d.accounts)+" accounts"});
    s.appendChild(path);s.appendChild(label);cellsEls.push({d:d,path:path});
  });
  host.appendChild(s);
  function fmtMetric(d){return metric==="revenue"?"$"+Math.round(d.revenue)+"k":metric==="growth"?d.growth.toFixed(1)+"%":Math.round(d.accounts)+" acct"}
  function recolor(){
    var vals=data.map(function(d){return d[metric]});var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals);
    cellsEls.forEach(function(o){var t=(o.d[metric]-mn)/((mx-mn)||1);o.path.setAttribute("fill",mix(lo,hi,0.12+t*0.88))});
  }
  $("#mapMetric").addEventListener("click",function(e){if(e.target.tagName!=="BUTTON")return;
    [].forEach.call(this.children,function(b){b.setAttribute("aria-pressed","false")});e.target.setAttribute("aria-pressed","true");
    metric=["revenue","growth","accounts"][[].indexOf.call(this.children,e.target)];recolor()});
  recolor();
})();
})();