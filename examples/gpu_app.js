
(function(){
"use strict";
var reduce=matchMedia("(prefers-reduced-motion:reduce)").matches;
var $=function(s){return document.querySelector(s)};

/* ---------- mat4 (column-major) ---------- */
function m4mul(a,b){var o=new Float32Array(16);
  for(var c=0;c<4;c++)for(var r=0;r<4;r++){var s=0;for(var k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s}return o}
function m4persp(fov,asp,n,f){var t=1/Math.tan(fov/2);var o=new Float32Array(16);
  o[0]=t/asp;o[5]=t;o[10]=(f+n)/(n-f);o[11]=-1;o[14]=2*f*n/(n-f);return o}
function m4ident(){var o=new Float32Array(16);o[0]=o[5]=o[10]=o[15]=1;return o}
function m4trans(x,y,z){var o=m4ident();o[12]=x;o[13]=y;o[14]=z;return o}
function m4rotX(a){var c=Math.cos(a),s=Math.sin(a),o=m4ident();o[5]=c;o[6]=s;o[9]=-s;o[10]=c;return o}
function m4rotY(a){var c=Math.cos(a),s=Math.sin(a),o=m4ident();o[0]=c;o[2]=-s;o[8]=s;o[10]=c;return o}

/* ---------- gl helpers ---------- */
function compile(gl,type,src){var sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);
  if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh)+"\n"+src);return sh}
function program(gl,vs,fs){var p=gl.createProgram();gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,vs));
  gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p}

/* ---------- geometry (expanded, non-indexed, with barycentric) ---------- */
function pushTri(arr,verts){ // verts = [[pos,nrm],[..],[..]]
  var bary=[[1,0,0],[0,1,0],[0,0,1]];
  for(var i=0;i<3;i++){var p=verts[i][0],n=verts[i][1];
    arr.push(p[0],p[1],p[2],n[0],n[1],n[2],bary[i][0],bary[i][1],bary[i][2])}
}
function genSphere(seg,ring){
  var a=[];
  function v(u,vv){var th=u*Math.PI*2,ph=vv*Math.PI;var x=Math.sin(ph)*Math.cos(th),y=Math.cos(ph),z=Math.sin(ph)*Math.sin(th);return [[x,y,z],[x,y,z]]}
  for(var i=0;i<seg;i++)for(var j=0;j<ring;j++){
    var u0=i/seg,u1=(i+1)/seg,v0=j/ring,v1=(j+1)/ring;
    var A=v(u0,v0),B=v(u1,v0),C=v(u1,v1),D=v(u0,v1);
    pushTri(a,[A,B,C]);pushTri(a,[A,C,D]);
  }
  return new Float32Array(a);
}
function genTorus(seg,ring,R,r){
  var a=[];
  function v(u,vv){var th=u*Math.PI*2,ph=vv*Math.PI*2;
    var cx=Math.cos(th)*R,cz=Math.sin(th)*R;
    var x=Math.cos(th)*(R+r*Math.cos(ph)),y=r*Math.sin(ph),z=Math.sin(th)*(R+r*Math.cos(ph));
    var nx=x-cx,ny=y,nz=z-cz;var l=Math.hypot(nx,ny,nz)||1;return [[x,y,z],[nx/l,ny/l,nz/l]]}
  for(var i=0;i<seg;i++)for(var j=0;j<ring;j++){
    var A=v(i/seg,j/ring),B=v((i+1)/seg,j/ring),C=v((i+1)/seg,(j+1)/ring),D=v(i/seg,(j+1)/ring);
    pushTri(a,[A,B,C]);pushTri(a,[A,C,D]);
  }
  return new Float32Array(a);
}

var SNOISE=[
"vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}",
"vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}",
"vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}",
"vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}",
"float snoise(vec3 v){",
" const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);",
" vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);",
" vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);",
" vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;",
" i=mod289(i);",
" vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));",
" float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;",
" vec4 j=p-49.0*floor(p*ns.z*ns.z);",
" vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);",
" vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);",
" vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);",
" vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));",
" vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;",
" vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);",
" vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));",
" p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;",
" vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;",
" return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}"
].join("\n");

/* ================= MESH DEMO ================= */
(function(){
  var cv=$("#meshCv"),gl=cv.getContext("webgl")||cv.getContext("experimental-webgl");
  if(!gl){$("#meshCv").outerHTML='<div class="fallback">WebGL is unavailable in this browser/device.</div>';return}
  var DPR=Math.min(devicePixelRatio||1,2);
  var vs=[
    "attribute vec3 a_pos;attribute vec3 a_nrm;attribute vec3 a_bary;",
    "uniform mat4 u_proj,u_mv;uniform mat3 u_nm;uniform float u_time,u_disp,u_freq;",
    "varying vec3 v_nrm;varying vec3 v_pos;varying vec3 v_bary;varying float v_d;",
    SNOISE,
    "void main(){",
    " float n=snoise(a_pos*u_freq+vec3(0.0,0.0,u_time*0.25));",
    " vec3 p=a_pos+a_nrm*n*u_disp;",
    " v_d=n;v_bary=a_bary;v_nrm=normalize(u_nm*a_nrm);",
    " vec4 mv=u_mv*vec4(p,1.0);v_pos=mv.xyz;gl_Position=u_proj*mv;}"
  ].join("\n");
  var fs=[
    "precision highp float;",
    "varying vec3 v_nrm;varying vec3 v_pos;varying vec3 v_bary;varying float v_d;",
    "uniform vec3 u_col;uniform float u_wire;",
    "void main(){",
    " vec3 N=normalize(v_nrm);vec3 L=normalize(vec3(0.6,0.8,0.6));vec3 V=normalize(-v_pos);",
    " float diff=max(dot(N,L),0.0);",
    " vec3 H=normalize(L+V);float spec=pow(max(dot(N,H),0.0),48.0);",
    " float rim=pow(1.0-max(dot(N,V),0.0),3.0);",
    " vec3 base=mix(u_col*0.5,u_col,0.5+0.5*v_d);",
    " vec3 c=base*(0.18+0.82*diff)+spec*vec3(1.0)+rim*u_col*0.9;",
    " if(u_wire>0.5){float e=min(min(v_bary.x,v_bary.y),v_bary.z);",
    "   float w=1.0-smoothstep(0.0,0.035,e);",
    "   if(w<0.05)discard;c=mix(c*0.15,u_col*1.3,w);}",
    " gl_FragColor=vec4(c,1.0);}"
  ].join("\n");
  var prog=program(gl,vs,fs);
  var loc={pos:gl.getAttribLocation(prog,"a_pos"),nrm:gl.getAttribLocation(prog,"a_nrm"),bary:gl.getAttribLocation(prog,"a_bary"),
    proj:gl.getUniformLocation(prog,"u_proj"),mv:gl.getUniformLocation(prog,"u_mv"),nm:gl.getUniformLocation(prog,"u_nm"),
    time:gl.getUniformLocation(prog,"u_time"),disp:gl.getUniformLocation(prog,"u_disp"),freq:gl.getUniformLocation(prog,"u_freq"),
    col:gl.getUniformLocation(prog,"u_col"),wire:gl.getUniformLocation(prog,"u_wire")};
  var buf=gl.createBuffer();
  var geos={sphere:genSphere(72,48),torus:genTorus(80,40,1.0,0.42)};
  var curGeo="sphere",vertCount=0;
  function upload(name){var d=geos[name];gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,d,gl.STATIC_DRAW);
    vertCount=d.length/9;$("#triCount").textContent=(vertCount/3|0).toLocaleString()}
  upload(curGeo);
  gl.enable(gl.DEPTH_TEST);

  var state={disp:0.35,freq:1.8,spin:0.5,wire:0,col:[0.27,0.91,1.0]};
  var rotX=-0.3,rotY=0.4,drag=false,px,py,userSpin=0;
  function resize(){var w=cv.clientWidth;cv.width=w*DPR;cv.height=440*DPR;gl.viewport(0,0,cv.width,cv.height)}
  cv.addEventListener("pointerdown",function(e){drag=true;px=e.clientX;py=e.clientY;cv.setPointerCapture(e.pointerId)});
  cv.addEventListener("pointermove",function(e){if(!drag)return;rotY+=(e.clientX-px)*0.01;rotX+=(e.clientY-py)*0.01;px=e.clientX;py=e.clientY});
  cv.addEventListener("pointerup",function(){drag=false});

  $("#geoSeg").addEventListener("click",function(e){if(e.target.tagName!=="BUTTON")return;
    [].forEach.call(this.children,function(b){b.setAttribute("aria-pressed","false")});e.target.setAttribute("aria-pressed","true");
    curGeo=e.target.textContent.toLowerCase();upload(curGeo)});
  function bindRange(id,vid,key){var r=$(id);r.addEventListener("input",function(){state[key]=+r.value;$(vid).textContent=(+r.value).toFixed(2)})}
  bindRange("#disp","#dispV","disp");bindRange("#freq","#freqV","freq");bindRange("#spin","#spinV","spin");
  $("#wire").addEventListener("change",function(){state.wire=this.checked?1:0});
  $("#colw").addEventListener("click",function(e){if(e.target.tagName!=="BUTTON")return;
    [].forEach.call(this.children,function(b){b.setAttribute("aria-pressed","false")});e.target.setAttribute("aria-pressed","true");
    state.col=e.target.getAttribute("data-c").split(",").map(Number)});

  var t0=performance.now(),last=t0,frames=0,fpsT=t0;
  function frame(now){
    var dt=(now-last)/1000;last=now;
    if(!drag)rotY+=state.spin*dt;
    resize();
    gl.clearColor(0.02,0.024,0.04,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog);
    var proj=m4persp(Math.PI/4,cv.width/cv.height,0.1,100);
    var rot=m4mul(m4rotX(rotX),m4rotY(rotY));
    var mv=m4mul(m4trans(0,0,-3.4),rot);
    // normal matrix = upper-left 3x3 of rot (pure rotation)
    var nm=new Float32Array([rot[0],rot[1],rot[2],rot[4],rot[5],rot[6],rot[8],rot[9],rot[10]]);
    gl.uniformMatrix4fv(loc.proj,false,proj);gl.uniformMatrix4fv(loc.mv,false,mv);gl.uniformMatrix3fv(loc.nm,false,nm);
    gl.uniform1f(loc.time,(now-t0)/1000);gl.uniform1f(loc.disp,state.disp);gl.uniform1f(loc.freq,state.freq);
    gl.uniform3fv(loc.col,state.col);gl.uniform1f(loc.wire,state.wire);
    gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    gl.enableVertexAttribArray(loc.pos);gl.vertexAttribPointer(loc.pos,3,gl.FLOAT,false,36,0);
    gl.enableVertexAttribArray(loc.nrm);gl.vertexAttribPointer(loc.nrm,3,gl.FLOAT,false,36,12);
    gl.enableVertexAttribArray(loc.bary);gl.vertexAttribPointer(loc.bary,3,gl.FLOAT,false,36,24);
    gl.drawArrays(gl.TRIANGLES,0,vertCount);
    frames++;if(now-fpsT>500){$("#meshFps").textContent=Math.round(frames*1000/(now-fpsT))+" fps";frames=0;fpsT=now}
    raf=requestAnimationFrame(frame);
  }
  var raf=requestAnimationFrame(frame);
})();

/* ================= RAYMARCH DEMO ================= */
(function(){
  var cv=$("#rayCv"),gl=cv.getContext("webgl")||cv.getContext("experimental-webgl");
  if(!gl){$("#rayCv").outerHTML='<div class="fallback">WebGL is unavailable in this browser/device.</div>';return}
  var DPR=Math.min(devicePixelRatio||1,1.5);
  var vs="attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}";
  var fs=[
    "precision highp float;",
    "uniform vec2 u_res;uniform float u_time,u_morph,u_blend,u_pal;uniform vec2 u_mouse;",
    "float smin(float a,float b,float k){float h=clamp(0.5+0.5*(b-a)/k,0.0,1.0);return mix(b,a,h)-k*h*(1.0-h);}",
    "float sdSphere(vec3 p,float r){return length(p)-r;}",
    "float sdTorus(vec3 p,vec2 t){vec2 q=vec2(length(p.xz)-t.x,p.y);return length(q)-t.y;}",
    "mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}",
    "float map(vec3 p){",
    " vec3 q=p;q.xz=rot(u_time*0.2)*q.xz;q.xy=rot(u_time*0.15)*q.xy;",
    " float s=sdSphere(q-vec3(sin(u_time*0.6)*0.6,0.0,0.0),0.7+0.25*u_morph);",
    " float t=sdTorus(q,vec2(0.95,0.28));",
    " float b=sdSphere(q+vec3(0.0,sin(u_time*0.5)*0.7,0.0),0.5);",
    " return smin(smin(s,t,u_blend),b,u_blend);}",
    "vec3 calcN(vec3 p){vec2 e=vec2(0.001,0.0);return normalize(vec3(",
    " map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}",
    "vec3 pal(float t){return 0.5+0.5*cos(6.2831*(vec3(1.0,1.0,1.0)*t+vec3(0.0,0.33,0.67)+u_pal));}",
    "void main(){",
    " vec2 uv=(gl_FragCoord.xy-0.5*u_res)/u_res.y;",
    " vec3 ro=vec3(0.0,0.0,3.6);",
    " vec2 m=(u_mouse-0.5)*3.14;",
    " vec3 rd=normalize(vec3(uv,-1.5));",
    " ro.yz=rot(m.y*0.5)*ro.yz;rd.yz=rot(m.y*0.5)*rd.yz;",
    " ro.xz=rot(m.x*0.5)*ro.xz;rd.xz=rot(m.x*0.5)*rd.xz;",
    " float d=0.0;float hit=0.0;vec3 p;",
    " for(int i=0;i<90;i++){p=ro+rd*d;float ds=map(p);if(ds<0.001){hit=1.0;break;}d+=ds;if(d>12.0)break;}",
    " vec3 col=vec3(0.02,0.025,0.04);",
    " if(hit>0.5){vec3 n=calcN(p);vec3 L=normalize(vec3(0.7,0.9,0.4));",
    "  float diff=max(dot(n,L),0.0);float fres=pow(1.0-max(dot(n,-rd),0.0),3.0);",
    "  vec3 base=pal(length(p)*0.18+u_time*0.03);",
    "  col=base*(0.15+0.85*diff)+fres*vec3(0.4,0.9,1.0);",
    "  col+=pow(max(dot(reflect(-L,n),-rd),0.0),32.0);}",
    " col=pow(col,vec3(0.4545));",
    " gl_FragColor=vec4(col,1.0);}"
  ].join("\n");
  var prog=program(gl,vs,fs);
  var quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  var aLoc=gl.getAttribLocation(prog,"a");
  var U={res:gl.getUniformLocation(prog,"u_res"),time:gl.getUniformLocation(prog,"u_time"),
    morph:gl.getUniformLocation(prog,"u_morph"),blend:gl.getUniformLocation(prog,"u_blend"),
    pal:gl.getUniformLocation(prog,"u_pal"),mouse:gl.getUniformLocation(prog,"u_mouse")};
  var st={morph:0.5,blend:0.5,pal:0.2,auto:true},mouse={x:0.5,y:0.5},autoT=0;
  function bindRange(id,vid,key){var r=$(id);r.addEventListener("input",function(){st[key]=+r.value;$(vid).textContent=(+r.value).toFixed(2)})}
  bindRange("#morph","#morphV","morph");bindRange("#blend","#blendV","blend");bindRange("#pal","#palV","pal");
  $("#rayAuto").addEventListener("change",function(){st.auto=this.checked});
  var drag=false;
  cv.addEventListener("pointerdown",function(e){drag=true;st.auto=false;$("#rayAuto").checked=false;setM(e)});
  cv.addEventListener("pointermove",function(e){if(drag)setM(e)});
  cv.addEventListener("pointerup",function(){drag=false});
  function setM(e){var r=cv.getBoundingClientRect();mouse.x=(e.clientX-r.left)/r.width;mouse.y=1-(e.clientY-r.top)/r.height}
  function resize(){var w=cv.clientWidth;cv.width=w*DPR;cv.height=440*DPR;gl.viewport(0,0,cv.width,cv.height)}
  var t0=performance.now(),frames=0,fpsT=t0;
  function frame(now){
    resize();if(st.auto){autoT+=0.005;mouse.x=0.5+Math.cos(autoT)*0.28;mouse.y=0.5+Math.sin(autoT*0.7)*0.18}
    gl.useProgram(prog);gl.bindBuffer(gl.ARRAY_BUFFER,quad);
    gl.enableVertexAttribArray(aLoc);gl.vertexAttribPointer(aLoc,2,gl.FLOAT,false,0,0);
    gl.uniform2f(U.res,cv.width,cv.height);gl.uniform1f(U.time,(now-t0)/1000);
    gl.uniform1f(U.morph,st.morph);gl.uniform1f(U.blend,st.blend);gl.uniform1f(U.pal,st.pal);
    gl.uniform2f(U.mouse,mouse.x,mouse.y);
    gl.drawArrays(gl.TRIANGLES,0,3);
    frames++;if(now-fpsT>500){$("#rayFps").textContent=Math.round(frames*1000/(now-fpsT))+" fps";frames=0;fpsT=now}
    raf=requestAnimationFrame(frame);
  }
  var raf=requestAnimationFrame(frame);
})();
})();