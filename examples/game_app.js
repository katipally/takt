
(function(){
"use strict";
var reduce=matchMedia("(prefers-reduced-motion:reduce)").matches;
var $=function(s){return document.querySelector(s)};
var W=800,H=560;
var cv=$("#game"),ctx=cv.getContext("2d"),DPR=Math.min(devicePixelRatio||1,2);
function fit(){cv.width=W*DPR;cv.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0)}
fit();

/* ---------- audio ---------- */
var actx=null,muted=false;
function ac(){if(!actx)actx=new (window.AudioContext||window.webkitAudioContext)();if(actx.state==="suspended")actx.resume();return actx}
function beep(freq,dur,type,vol){if(muted)return;try{var c=ac();var o=c.createOscillator(),g=c.createGain();
  o.type=type||"square";o.frequency.value=freq;o.connect(g);g.connect(c.destination);var t=c.currentTime;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol||0.12,t+0.005);g.gain.exponentialRampToValueAtTime(0.0001,t+(dur||0.1));
  o.start(t);o.stop(t+(dur||0.1)+0.02)}catch(e){}}
function sBounce(){beep(300+Math.random()*60,0.06,"square",0.08)}
function sBrick(n){beep(420+n*40,0.08,"square",0.12)}
function sPow(){beep(700,0.09,"sine",0.15);setTimeout(function(){beep(1050,0.12,"sine",0.15)},70)}
function sLose(){beep(200,0.3,"sawtooth",0.15);setTimeout(function(){beep(120,0.4,"sawtooth",0.13)},120)}
function sWin(){[523,659,784,1047].forEach(function(f,i){setTimeout(function(){beep(f,0.14,"square",0.13)},i*110)})}

/* ---------- state ---------- */
var COLORS=["#FF2E88","#FF7A3D","#FFD23F","#3BF07E","#25E6FF","#9B6BFF"];
var state="menu",score=0,lives=3,level=1,combo=1,comboTimer=0,shake=0,slowmo=0;
var paddle={x:W/2,y:H-38,w:110,baseW:110,h:14,speed:9};
var balls=[],bricks=[],particles=[],powerups=[],stuck=true;
var keys={};

function makeBall(x,y,vx,vy){return {x:x,y:y,vx:vx,vy:vy,r:8,speed:Math.hypot(vx,vy)||5}}
function resetBall(){balls=[makeBall(paddle.x,paddle.y-16,0,0)];stuck=true}

function buildLevel(){
  bricks=[];var cols=11,rows=Math.min(4+level,8),pad=6,mx=40,top=70;
  var bw=(W-mx*2-pad*(cols-1))/cols,bh=24;
  for(var r=0;r<rows;r++)for(var c=0;c<cols;c++){
    if(level>2 && (r+c)%7===0) continue; // gaps on later levels
    var hp=r<2?1:r<4?2:2;
    bricks.push({x:mx+c*(bw+pad),y:top+r*(bh+pad),w:bw,h:bh,hp:hp,maxhp:hp,c:COLORS[r%COLORS.length]});
  }
  resetBall();
}

function startGame(){score=0;lives=3;level=1;combo=1;paddle.w=paddle.baseW;powerups=[];particles=[];buildLevel();
  state="play";hideOverlay();updateHUD()}
function nextLevel(){level++;paddle.w=paddle.baseW;powerups=[];buildLevel();state="play";sWin();updateHUD()}

/* ---------- particles ---------- */
function burst(x,y,color,n){for(var i=0;i<(n||10);i++){var a=Math.random()*6.28,sp=1+Math.random()*4;
  particles.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,c:color,r:1+Math.random()*3})}}

/* ---------- power-ups ---------- */
var POW=[{t:"wide",c:"#3BF07E"},{t:"multi",c:"#25E6FF"},{t:"life",c:"#FF2E88"},{t:"slow",c:"#FFD23F"}];
function maybeDrop(x,y){if(Math.random()<0.14){var p=POW[Math.floor(Math.random()*POW.length)];
  powerups.push({x:x,y:y,vy:2.4,t:p.t,c:p.c,r:11})}}
function applyPow(t){sPow();
  if(t==="wide")paddle.w=Math.min(paddle.w+46,220);
  else if(t==="life"){lives=Math.min(lives+1,6)}
  else if(t==="slow")slowmo=180;
  else if(t==="multi"){var add=[];balls.forEach(function(b){for(var k=0;k<2;k++){var a=(Math.random()-0.5)*1.2;
    add.push(makeBall(b.x,b.y,b.vx*Math.cos(a)-b.vy*Math.sin(a),b.vx*Math.sin(a)+b.vy*Math.cos(a)))}});
    balls=balls.concat(add);if(stuck){stuck=false;launch()}}
  updateHUD();
}

function launch(){if(!stuck)return;stuck=false;balls.forEach(function(b){var ang=-Math.PI/2+(Math.random()-0.5)*0.5;
  var sp=5+level*0.35;b.vx=Math.cos(ang)*sp;b.vy=Math.sin(ang)*sp;b.speed=sp})}

/* ---------- input ---------- */
addEventListener("keydown",function(e){keys[e.key]=true;
  if(e.key===" "){e.preventDefault();if(state==="play"){if(stuck)launch();else togglePause()}else if(state==="menu"||state==="over"||state==="win")startGame()}
});
addEventListener("keyup",function(e){keys[e.key]=false});
cv.addEventListener("pointermove",function(e){var r=cv.getBoundingClientRect();var x=(e.clientX-r.left)/r.width*W;
  paddle.x=Math.max(paddle.w/2,Math.min(W-paddle.w/2,x))});
cv.addEventListener("pointerdown",function(e){ac();if(state==="play"){if(stuck)launch()}else if(state!=="pause")startGame()});
function togglePause(){if(state==="play"){state="pause";showOverlay("PAUSED","Press Space or click to resume.","Resume")}
  else if(state==="pause"){state="play";hideOverlay()}}
$("#startBtn").addEventListener("click",function(){ac();if(state==="pause"){state="play";hideOverlay()}else startGame()});
$("#restartBtn").addEventListener("click",function(){ac();startGame()});
$("#muteBtn").addEventListener("click",function(){muted=!muted;this.textContent=muted?"🔇 Sound: off":"🔊 Sound: on"});

/* ---------- overlay + hud ---------- */
var ov=$("#overlay");
function showOverlay(title,text,btn){ov.classList.remove("hidden");$("#ovTitle").textContent=title;$("#ovText").textContent=text;$("#startBtn").textContent="▶ "+(btn||"Start")}
function hideOverlay(){ov.classList.add("hidden")}
function updateHUD(){$("#hScore").textContent=score.toLocaleString();$("#hCombo").textContent="×"+combo;
  $("#hLevel").textContent=level;var lv="";for(var i=0;i<lives;i++)lv+="<i></i>";$("#hLives").innerHTML=lv}

/* ---------- physics ---------- */
function collideBrick(b){
  for(var i=0;i<bricks.length;i++){var br=bricks[i];if(br.hp<=0)continue;
    if(b.x+b.r>br.x&&b.x-b.r<br.x+br.w&&b.y+b.r>br.y&&b.y-b.r<br.y+br.h){
      // least-penetration axis
      var overL=(b.x+b.r)-br.x,overR=(br.x+br.w)-(b.x-b.r),overT=(b.y+b.r)-br.y,overB=(br.y+br.h)-(b.y-b.r);
      var m=Math.min(overL,overR,overT,overB);
      if(m===overL||m===overR)b.vx*=-1;else b.vy*=-1;
      br.hp--;
      combo++;comboTimer=90;
      var gain=10*combo;score+=gain;
      shake=Math.min(shake+3,10);
      if(br.hp<=0){burst(br.x+br.w/2,br.y+br.h/2,br.c,14);maybeDrop(br.x+br.w/2,br.y+br.h/2);sBrick(combo)}
      else {burst(b.x,b.y,br.c,4);sBrick(0)}
      updateHUD();
      return true;
    }
  }
  return false;
}

function step(dt){
  // paddle keys
  if(keys["ArrowLeft"])paddle.x=Math.max(paddle.w/2,paddle.x-paddle.speed);
  if(keys["ArrowRight"])paddle.x=Math.min(W-paddle.w/2,paddle.x+paddle.speed);
  var tf=slowmo>0?0.55:1;if(slowmo>0)slowmo--;
  if(comboTimer>0){comboTimer--;if(comboTimer===0){combo=1;updateHUD()}}

  for(var bi=balls.length-1;bi>=0;bi--){var b=balls[bi];
    if(stuck){b.x=paddle.x;b.y=paddle.y-16;continue}
    b.x+=b.vx*tf;b.y+=b.vy*tf;
    if(b.x-b.r<0){b.x=b.r;b.vx*=-1;sBounce()}
    if(b.x+b.r>W){b.x=W-b.r;b.vx*=-1;sBounce()}
    if(b.y-b.r<0){b.y=b.r;b.vy*=-1;sBounce()}
    // paddle
    if(b.vy>0&&b.y+b.r>=paddle.y-paddle.h/2&&b.y-b.r<paddle.y+paddle.h/2&&b.x>paddle.x-paddle.w/2&&b.x<paddle.x+paddle.w/2){
      var rel=(b.x-paddle.x)/(paddle.w/2);var ang=-Math.PI/2+rel*1.05;var sp=Math.max(b.speed,5+level*0.35);
      b.vx=Math.cos(ang)*sp;b.vy=Math.sin(ang)*sp;b.y=paddle.y-paddle.h/2-b.r;sBounce();
    }
    collideBrick(b);
    if(b.y-b.r>H){balls.splice(bi,1)}
  }
  // ball lost
  if(!stuck&&balls.length===0){lives--;combo=1;shake=14;sLose();updateHUD();
    if(lives<=0){state="over";showOverlay("GAME OVER","Final score "+score.toLocaleString()+" · reached level "+level+".","Play again")}
    else {resetBall()}}
  // win
  if(bricks.every(function(br){return br.hp<=0})&&state==="play"){nextLevel()}

  // powerups
  for(var pi=powerups.length-1;pi>=0;pi--){var p=powerups[pi];p.y+=p.vy*tf;
    if(p.y>paddle.y-20&&p.y<paddle.y+20&&p.x>paddle.x-paddle.w/2&&p.x<paddle.x+paddle.w/2){applyPow(p.t);powerups.splice(pi,1);continue}
    if(p.y>H+20)powerups.splice(pi,1)}
  // particles
  for(var qi=particles.length-1;qi>=0;qi--){var q=particles[qi];q.x+=q.vx;q.y+=q.vy;q.vy+=0.12;q.life-=0.02;if(q.life<=0)particles.splice(qi,1)}
  if(shake>0)shake*=0.86;
}

/* ---------- render ---------- */
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function draw(){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  var sx=(Math.random()-0.5)*shake,sy=(Math.random()-0.5)*shake;
  ctx.clearRect(0,0,W,H);
  ctx.save();ctx.translate(sx,sy);
  // subtle grid
  ctx.strokeStyle="rgba(120,140,255,0.05)";ctx.lineWidth=1;
  for(var gx=0;gx<W;gx+=40){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke()}
  for(var gy=0;gy<H;gy+=40){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke()}
  // bricks
  bricks.forEach(function(br){if(br.hp<=0)return;
    ctx.globalAlpha=br.hp<br.maxhp?0.6:1;ctx.fillStyle=br.c;ctx.shadowColor=br.c;ctx.shadowBlur=12;
    roundRect(br.x,br.y,br.w,br.h,5);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1;
    if(br.maxhp>1){ctx.fillStyle="rgba(255,255,255,0.85)";ctx.fillRect(br.x+4,br.y+4,br.w-8,2)}
  });
  // powerups
  powerups.forEach(function(p){ctx.fillStyle=p.c;ctx.shadowColor=p.c;ctx.shadowBlur=14;
    roundRect(p.x-p.r,p.y-p.r,p.r*2,p.r*2,4);ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle="#04040a";ctx.font="bold 13px "+"ui-monospace,monospace";ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText(p.t==="wide"?"W":p.t==="multi"?"+":p.t==="life"?"♥":"S",p.x,p.y+1)});
  // particles
  particles.forEach(function(q){ctx.globalAlpha=Math.max(q.life,0);ctx.fillStyle=q.c;
    ctx.beginPath();ctx.arc(q.x,q.y,q.r,0,6.28);ctx.fill()});ctx.globalAlpha=1;
  // paddle
  ctx.fillStyle="#EAF0FF";ctx.shadowColor="#25E6FF";ctx.shadowBlur=16;
  roundRect(paddle.x-paddle.w/2,paddle.y-paddle.h/2,paddle.w,paddle.h,7);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle="#25E6FF";roundRect(paddle.x-paddle.w/2+3,paddle.y-2,paddle.w-6,4,2);ctx.fill();
  // balls
  balls.forEach(function(b){ctx.fillStyle="#fff";ctx.shadowColor="#FF2E88";ctx.shadowBlur=18;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,6.28);ctx.fill();ctx.shadowBlur=0});
  // slowmo tint
  if(slowmo>0){ctx.fillStyle="rgba(255,210,63,0.06)";ctx.fillRect(0,0,W,H)}
  // launch hint
  if(stuck&&state==="play"){ctx.fillStyle="rgba(234,240,255,0.7)";ctx.font="13px ui-monospace,monospace";ctx.textAlign="center";
    ctx.fillText("press SPACE or click to launch",W/2,paddle.y-40)}
  ctx.restore();
}

/* ---------- loop ---------- */
var last=performance.now(),acc=0;
function loop(now){
  var dt=Math.min((now-last)/16.67,3);last=now;
  if(state==="play"){step(dt)}
  draw();
  requestAnimationFrame(loop);
}
resetBall();updateHUD();draw();
requestAnimationFrame(loop);
})();