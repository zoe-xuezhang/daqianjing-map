"use strict";
/* 大千境 v3.7 小程序端 · 纹理化生成（城市/大世界/地牢/村庄/迷宫） */

const track = function(){};  /* skill 版：不埋点 */
let APP_CTX=null, CANVAS=null, CV_SIZE=300, DPR=2;
let MODE="city";


"use strict";
/* ============================================================
 * 大千境 · 城市引擎 —— 道路优先的城市地图生成
 * 流程：种子 → 主次道路网 → 切块成街区 → 沿街排房 → POI/河流/标注
 * ============================================================ */

/* ---------- 随机数 ---------- */
function mulberry32(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
function hashStr(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; }
function pick(rnd,arr){ return arr[(rnd()*arr.length)|0]; }

/* ---------- 中文地名词库 ---------- */
/* 命名结构：专名(2字) + 通名(1~2字)。
 * pre 为单字时接 core 组成专名（临+风=临风）；pre 已为双字词时直接作专名（临江）。
 * 双字词后再硬接单字会产生"赤松笛/望北柳"这类三字专名，中文地名没有这种结构，禁止。
 * suf 按"风格 × 模式"分桶，避免武侠村庄冒出科幻通名、科幻城市出现"城城"叠字。 */
const LEX = {
  fantasy:{ pre:["临","落","云","青","望","渡","白","赤","孤","暮","寒","灰","雾","曙"],
            core:["风","月","潮","霜","剑","鹿","鹤","沙","松","雪","岚","星","桥","旗","岩","鸦"],
            suf:{ city:["城","港","镇","堡","关","邑"],
                  world:["域","洲","境","原","群岛"],
                  dungeon:["地宫","遗迹","陵","窟"],
                  village:["村","庄","寨","集"],
                  maze:["迷宫"] } },
  wuxia:{   pre:["临江","落马","云梦","青崖","望北","渡头","白沙","赤松","孤鸿","暮鼓","寒山","藏锋","归雁","卧龙",
                 "临","落","云","青","望","渡","白","赤","孤","暮","寒","藏","归","卧"],
            core:["风","月","潮","霜","剑","马","燕","柳","书","棋","镖","竹"],
            suf:{ city:["城","镇","堡","寨","集","楼"],
                  world:["域","洲","境","原","群岛"],
                  dungeon:["地宫","遗迹","陵","窟"],
                  village:["村","庄","寨","集","山庄","渡口"],
                  maze:["迷宫"] } },
  xianxia:{ pre:["九霄","云隐","青冥","望舒","渡厄","白露","赤霄","孤鸾","暮苍","寒星","藏月","归墟","卧云","扶摇",
                 "九","云","青","望","渡","白","赤","孤","暮","寒","藏","归","卧","扶"],
            core:["风","月","潮","霜","剑","灵","丹","符","鹤","岚","瑶","昙","烛","泉"],
            suf:{ city:["城","宫","宗","台","墟"],
                  world:["域","洲","境","原","仙洲","群岛"],
                  dungeon:["地宫","遗迹","陵","窟","洞天"],
                  village:["村","庄","寨","集","仙府"],
                  maze:["迷宫","迷阵"] } },
  scifi:{   pre:["新曙","艾泽","凛冬","熔核","翠微","绛云","雾森","铁壤","银心","澄海","磐石","赛德娜","泽塔"],
            core:[],
            suf:{ city:["站","港","环","基地","殖民城"],
                  world:["星","星系","星域","星云"],
                  dungeon:["废舰","深井站","地下设施","遗迹"],
                  village:["前哨","聚居点","营地"],
                  maze:["管道网","蜂巢","迷宫"] } }
};

/* 城市模式调色板：全部按风格换肤 */
const THEMES = {
  wuxia:  {paper:"#EFE7D2", old:"rgba(120,100,60,0.05)", grid:"rgba(90,80,55,0.08)",
           lot:"rgba(178,164,132,0.30)", lotEdge:"rgba(90,80,55,0.28)",
           green:"rgba(150,160,110,0.35)", tree:"rgba(90,110,70,0.55)",
           roadExt:"#B3A68A", river:"#A8B8B4", riverEdge:"#6E7F7A",
           bridge:"#EFE7D2", bridgeEdge:"#4A4437", wall:"#33302A",
           house:"#C9BFA0", houseEdge:"#4A4437", poi:"#8A4B2F",
           label:"#3A342A", title:"#3A342A", sub:"#6E6451",
           compass:"#4A4437", scale:"#33302A", font:"Kaiti", glow:false},
  xianxia:{paper:"#E9EDE6", old:"rgba(90,110,100,0.05)", grid:"rgba(80,100,90,0.09)",
           lot:"rgba(168,178,152,0.32)", lotEdge:"rgba(80,100,85,0.30)",
           green:"rgba(130,160,120,0.38)", tree:"rgba(80,110,80,0.55)",
           roadExt:"#A8B09A", river:"#9FC0C4", riverEdge:"#5E7F82",
           bridge:"#E9EDE6", bridgeEdge:"#41544A", wall:"#2E3833",
           house:"#CBD4C0", houseEdge:"#41544A", poi:"#6B4A2F",
           label:"#2E3833", title:"#2E3833", sub:"#6E7568",
           compass:"#41544A", scale:"#2E3833", font:"Kaiti", glow:false},
  fantasy:{paper:"#F2E7C8", old:"rgba(130,105,55,0.06)", grid:"rgba(100,85,45,0.09)",
           lot:"rgba(190,168,120,0.32)", lotEdge:"rgba(100,85,50,0.30)",
           green:"rgba(160,165,100,0.36)", tree:"rgba(105,110,55,0.55)",
           roadExt:"#BFAE86", river:"#A8C0BC", riverEdge:"#6E8280",
           bridge:"#F2E7C8", bridgeEdge:"#4A4437", wall:"#3A3226",
           house:"#DEC99B", houseEdge:"#4A4437", poi:"#8A5A2F",
           label:"#3A3226", title:"#3A3226", sub:"#7A6A4E",
           compass:"#4A4437", scale:"#3A3226", font:"Kaiti", glow:false},
  ink:    {paper:"#F4F4EF", old:"rgba(70,70,70,0.04)", grid:"rgba(70,70,70,0.06)",
           lot:"rgba(140,140,140,0.16)", lotEdge:"rgba(70,70,70,0.28)",
           green:"rgba(110,120,100,0.22)", tree:"rgba(80,90,70,0.45)",
           roadExt:"#A8A8A2", river:"#C9CBC6", riverEdge:"#7A7C78",
           bridge:"#F4F4EF", bridgeEdge:"#333333", wall:"#262626",
           house:"#DDDDD6", houseEdge:"#333333", poi:"#262626",
           label:"#262626", title:"#141414", sub:"#6A6A66",
           compass:"#333333", scale:"#262626", font:"Kaiti", glow:false},
  scifi:  {paper:"#0A1120", old:"rgba(87,240,228,0.03)", grid:"rgba(87,240,228,0.10)",
           lot:"rgba(87,240,228,0.08)", lotEdge:"rgba(87,240,228,0.35)",
           green:"rgba(120,220,160,0.14)", tree:"rgba(120,220,160,0.7)",
           roadExt:"rgba(87,240,228,0.55)", river:"rgba(64,140,255,0.30)", riverEdge:"rgba(120,190,255,0.85)",
           bridge:"#0A1120", bridgeEdge:"#8ADFFF", wall:"#57F0E4",
           house:"rgba(87,240,228,0.16)", houseEdge:"rgba(160,255,246,0.95)", poi:"#FF7AD9",
           label:"rgba(205,255,250,0.95)", title:"#57F0E4", sub:"rgba(140,205,205,0.75)",
           compass:"#57F0E4", scale:"#8ADFFF", font:"SciMono", glow:true}
};
const FONT_STACK={
  Kaiti:'"Kaiti SC","STKaiti","KaiTi","Songti SC",serif',
  SciMono:'ui-monospace,"SF Mono","Cascadia Mono",Consolas,monospace'
};

const POI_TYPES = ["市集","铁匠铺","酒馆","药铺","客栈","武馆","茶肆","当铺","书坊","码头"];
const ROAD_A = ["大道","长街","主街"];
const ROAD_B = ["街","巷","弄"];

/* 兜底通名表：风格词库缺该模式时才用 */
const NAME_SUF = {
  city:["城","镇"],
  world:["域","洲","境","原"],
  dungeon:["地宫","遗迹","窟"],
  village:["村","庄","寨"],
  maze:["迷宫"]
};
const BAD_CORE = new Set(["笛","扇","琴","鼓","铃","钟","磬","箫","瑟","筝","琵琶"]);
function cityName(rnd, style, mode){
  mode = mode || "city";
  const L = LEX[style] || LEX.fantasy;
  const sufList = (L.suf && L.suf[mode]) || NAME_SUF[mode] || NAME_SUF.city;
  const suf = sufList[(rnd()*sufList.length)|0];
  let core;
  const pre = L.pre[(rnd()*L.pre.length)|0];
  if(pre.length>=2 || !L.core.length){
    core = pre;                       // 双字前缀直接作专名，不再接字
  }else{
    let c = L.core[(rnd()*L.core.length)|0];
    let guard=0;
    while(BAD_CORE.has(c) && guard++<20) c = L.core[(rnd()*L.core.length)|0];
    core = pre + c;                   // 单字前缀 + 单字核心 = 两字专名
  }
  if(core.length>3) core = core.slice(0,3);
  if(mode==="core") return core;      // 只取专名：供"专名+节点类型"的场景（临风+山庄）
  if(!suf) return core;
  if(core.slice(-suf.length)===suf) return core;   // 防"赛德城城"这类通名叠字
  return core + suf;
}

/* ---------- 城市生成 ---------- */
const W=1400, H=1400;
let STATE=null;

/* 字号换算：世界坐标 1400 → 画布 CV_SIZE(≈363)。
   PX(12) = 手机上显示 12px 所需的画布字号。
   所有"需要读"的文字都必须过 PX()，否则缩到手机上只剩 4~5px。 */
function PX(n){ return Math.round(n * W / (CV_SIZE || 363)); }

/* 字号自动补偿：世界坐标 1400 → 画布 363，直接写的字号会缩成 1/4。
   这里拦截 ctx.font 赋值，凡是小于 24px 的字号自动放大到「手机可读」，
   大于等于 24px 的（本来按大字号设计的标题）保持不变。 */
function hookFontScale(ctx){
  if(!ctx || ctx.__fontHooked) return;
  let desc = null;
  try{ desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx),"font"); }catch(e){}
  if(!desc || !desc.set){ try{ desc = Object.getOwnPropertyDescriptor(ctx,"font"); }catch(e){} }
  if(!desc || !desc.set){ return; }
  try{
    Object.defineProperty(ctx,"font",{
      configurable:true,
      get(){ return desc.get ? desc.get.call(ctx) : ""; },
      set(v){
        try{
          v = String(v).replace(/(\d+(?:\.\d+)?)px/,function(m,n){
            var s=parseFloat(n);
            if(s>0 && s<24) s = s * W / (FONT_DIV || CV_SIZE || 363);
            return Math.round(s)+"px";
          });
        }catch(e){}
        desc.set.call(ctx,v);
      }
    });
    ctx.__fontHooked = true;
  }catch(e){}
}

/* 半平面切割凸多边形与面积 */
function clipHalfPlane(poly, x1,y1,x2,y2, sign){
  const dx=x2-x1, dy=y2-y1;
  const side=(px,py)=>sign*((px-x1)*dy-(py-y1)*dx);
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i], b=poly[(i+1)%poly.length];
    const sa=side(a.x,a.y), sb=side(b.x,b.y);
    if(sa>=0) out.push(a);
    if((sa>=0)!==(sb>=0)){
      const t=sa/(sa-sb);
      out.push({x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t});
    }
  }
  return out;
}
function polyArea(pts){
  let a=0;
  for(let i=0;i<pts.length;i++){
    const p=pts[i],q=pts[(i+1)%pts.length];
    a+=p.x*q.y-q.x*p.y;
  }
  return Math.abs(a/2);
}

function generate(seedNum, opts){
  const rnd = mulberry32(seedNum);
  const city = { seed:seedNum, opts, lots:[], roadsV:[], roadsH:[], bridges:[],
                 pois:[], labels:[], greens:[], river:null, name:"" };

  const M = 96;                                  // 图边距
  const area = { x:M, y:M+34, w:W-2*M, h:H-2*M-60 };
  /* 海岸：随机一侧为水域 */
  if(opts.coast){
    const side=pick(rnd,["left","right","top","bottom"]);
    city.coast={side, off:0.55+rnd()*0.2, amp:30+rnd()*40, phase:rnd()*6.28};
  }

  /* 1. 道路网：主干道把城市切块 */
  const vN = 2 + Math.round(opts.size/26);       // 竖向主路 2~5
  const hN = 2 + Math.round(opts.size/34);       // 横向主路 2~4
  for(let i=0;i<vN;i++){
    const x = area.x + area.w*((i+1)/(vN+1)) + (rnd()*90-45);
    city.roadsV.push({x, w:26+rnd()*10});
  }
  for(let i=0;i<hN;i++){
    const y = area.y + area.h*((i+1)/(hN+1)) + (rnd()*90-45);
    city.roadsH.push({y, w:26+rnd()*10});
  }
  city.roadsV.sort((a,b)=>a.x-b.x);
  city.roadsH.sort((a,b)=>a.y-b.y);

  /* 2. 河流：正弦带纵穿（或横穿） */
  if(opts.river){
    const vertical = rnd()<0.7;
    const rv = {
      vertical,
      cx: area.x+area.w*(0.3+rnd()*0.4),
      cy: area.y+area.h*(0.3+rnd()*0.4),
      amp: 50+rnd()*90,
      k: 1.5+rnd()*1.5,
      phase: rnd()*6.28,
      w: 42+rnd()*22
    };
    city.river = rv;
    if(rv.vertical){
      for(const r of city.roadsH){
        const rx=riverAt(rv,r.y);
        if(rx>area.x+30 && rx<area.x+area.w-30) city.bridges.push({x:rx,y:r.y,w:rv.w+14,h:r.w+10});
      }
    }else{
      for(const r of city.roadsV){
        const ry=riverAt(rv,r.x);
        if(ry>area.y+30 && ry<area.y+area.h-30) city.bridges.push({x:r.x,y:ry,w:r.w+10,h:rv.w+14});
      }
    }
  }

  /* 2.5 支流：Y形汇入 */
  if(city.river && rnd()<0.5){
    const rv=city.river;
    const joinT=0.3+rnd()*0.4;
    const jx=riverAt(rv, rv.vertical? H*joinT : W*joinT);
    const jy=rv.vertical? H*joinT : riverAt(rv,W*joinT);
    const t={ vertical:!rv.vertical, w:rv.w*0.5,
      cx: jx+(rv.vertical?(rnd()<0.5?-1:1)*(W*0.3):0),
      cy: jy+(rv.vertical?0:(rnd()<0.5?-1:1)*(H*0.3)),
      amp: 30+rnd()*40, k: 1+rnd(), phase: rnd()*6.28 };
    city.tributary=t;
  }

  /* 3. 切块：主路 → 大块；大块概率细分 */
  const vSeg=city.roadsV.map(r=>[r.x-r.w/2, r.x+r.w/2]).sort((a,b)=>a[0]-b[0]);
  const hSeg=city.roadsH.map(r=>[r.y-r.w/2, r.y+r.w/2]).sort((a,b)=>a[0]-b[0]);
  const xs=[area.x], xe=[];
  for(const s of vSeg){ xe.push(s[0]); xs.push(s[1]); }
  xe.push(area.x+area.w);
  const ys=[area.y], ye=[];
  for(const s of hSeg){ ye.push(s[0]); ys.push(s[1]); }
  ye.push(area.y+area.h);

  const blocks=[];
  for(let i=0;i<xs.length;i++) for(let j=0;j<ys.length;j++){
    const b={x:xs[i],y:ys[j],w:xe[i]-xs[i],h:ye[j]-ys[j]};
    if(b.w>40 && b.h>40) blocks.push(b);
  }

  /* 斜向主路：2~3 条 */
  const diagN=2+((rnd()*2)|0);
  for(let i=0;i<diagN;i++){
    const ang=(25+rnd()*40)*Math.PI/180 * (rnd()<0.5?1:-1);
    const cx=area.x+area.w*(0.3+rnd()*0.4), cy=area.y+area.h*(0.3+rnd()*0.4);
    const dx=Math.cos(ang), dy=Math.sin(ang);
    city.roadsD=city.roadsD||[];
    city.roadsD.push({x1:cx-dx*W, y1:cy-dy*W, x2:cx+dx*W, y2:cy+dy*W, w:24+rnd()*8});
  }

  const lots=[];
  function subdivide(b, depth){
    const canH=b.w>130, canV=b.h>130;
    if(depth>=3 || (!canH&&!canV) || rnd()>0.6){ lots.push(b); return; }
    if(canH && (!canV || rnd()<0.5)){
      const cut=b.x+b.w*(0.36+rnd()*0.28), lw=15;
      subdivide({x:b.x,y:b.y,w:cut-lw/2-b.x,h:b.h},depth+1);
      subdivide({x:cut+lw/2,y:b.y,w:b.x+b.w-(cut+lw/2),h:b.h},depth+1);
    }else{
      const cut=b.y+b.h*(0.36+rnd()*0.28), lw=15;
      subdivide({x:b.x,y:b.y,w:b.w,h:cut-lw/2-b.y},depth+1);
      subdivide({x:b.x,y:cut+lw/2,w:b.w,h:b.y+b.h-(cut+lw/2)},depth+1);
    }
  }
  for(const b of blocks) subdivide(b,0);
  city.blocks = blocks;

  /* 矩形 → poly（支持斜路切割） */
  const polys=lots.map(b=>[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}]);
  let polyLots=polys.map((poly,i)=>({poly, raw:lots[i]}));
  for(const rd of (city.roadsD||[])){
    const next=[];
    for(const item of polyLots){
      const p=item.poly;
      const a=clipHalfPlane(p, rd.x1,rd.y1,rd.x2,rd.y2, 1);
      const b=clipHalfPlane(p, rd.x1,rd.y1,rd.x2,rd.y2, -1);
      if(a.length>=3 && polyArea(a)>900) next.push({poly:a, raw:item.raw});
      if(b.length>=3 && polyArea(b)>900) next.push({poly:b, raw:item.raw});
    }
    polyLots=next;
  }

  /* 3.6 棚户区：城外散屋 */
  const shantyHouses=[];
  if(opts.shanty){
    const count=50+((rnd()*60)|0);
    for(let i=0;i<count;i++){
      const side=(rnd()*4)|0;
      let x,y;
      const d=18+rnd()*60;
      if(side===0){ x=area.x-d; y=area.y+rnd()*area.h; }
      else if(side===1){ x=area.x+area.w+d; y=area.y+rnd()*area.h; }
      else if(side===2){ y=area.y-d; x=area.x+rnd()*area.w; }
      else{ y=area.y+area.h+d; x=area.x+rnd()*area.w; }
      shantyHouses.push({x,y,w:6+rnd()*8,h:5+rnd()*7,rot:(rnd()*2-1)*0.6});
    }
  }
  city.shantyHouses=shantyHouses;

  /* 4. 过滤与用途分配 */
  const density = 0.3 + opts.density*0.0065;
  for(const item of polyLots){
    const poly=item.poly, b=item.raw;
    const cx=b.x+b.w/2, cy=b.y+b.h/2;
    if(city.river && inRiver(city.river,cx,cy)) continue;
    if(b.w<44||b.h<44) continue;
    // 密度随距中心衰减
    const dc={x:area.x+area.w/2, y:area.y+area.h/2};
    const dist=Math.hypot(cx-dc.x,cy-dc.y)/(W*0.35);
    const dLocal=density*(1-Math.min(0.45,dist*0.45));
    const lot={poly, x:b.x,y:b.y,w:b.w,h:b.h, green:false, houses:{n:[],s:[],e:[],w:[]}};
    if(rnd()<0.06){ lot.green=true; city.greens.push(lot); }
    else fillLotPoly(lot, rnd, dLocal);
    city.lots.push(lot);
  }

  /* 4.5 海岸剔除与海域 */
  if(city.coast){
    const cst=city.coast;
    city.lots=city.lots.filter(l=>{
      const cx=l.x+l.w/2, cy=l.y+l.h/2;
      const edge=coastEdge(cst,cx,cy);
      if(cst.side==="left") return cx>edge;
      if(cst.side==="right") return cx<edge;
      if(cst.side==="top") return cy>edge;
      return cy<edge;
    });
    // 码头自动加在岸边
    const coastLots=city.lots.filter(l=>l.w>50&&l.h>50);
    if(coastLots.length){
      const lot=coastLots[(rnd()*coastLots.length)|0];
      city.pois.push({x:lot.x+lot.w/2,y:lot.y+lot.h/2,type:"码头",label:"码头",lot});
    }
  }
  /* 4.55 内城城堡（citadel）：中心小城墙 + 大城堡 */
  if(opts.citadel && city.lots.length){
    const cc={x:area.x+area.w/2, y:area.y+area.h/2};
    let best=null,bd=1e9;
    for(const l of city.lots){
      const d=Math.hypot(l.x+l.w/2-cc.x,l.y+l.h/2-cc.y);
      if(l.w>70&&l.h>70&&d<bd){bd=d;best=l;}
    }
    if(best){
      best.special="citadel";
      best.houses={n:[],s:[],e:[],w:[]};
      best.green=false;
    }
  }

  /* 4.6 中心广场 / 神殿 */
  if(opts.center&&opts.center!=="none"&&city.lots.length){
    const cc={x:area.x+area.w/2, y:area.y+area.h/2};
    let best=null,bd=1e9;
    for(const l of city.lots){
      const d=Math.hypot(l.x+l.w/2-cc.x,l.y+l.h/2-cc.y);
      if(l.w>60&&l.h>60&&d<bd){bd=d;best=l;}
    }
    if(best){
      best.green=false; best.houses={n:[],s:[],e:[],w:[]};
      best.special=opts.center;                    // plaza | temple
      if(opts.center==="plaza") best.green=true;
    }
  }

  /* 5. POI：挑大地块放地标 */
  const big = city.lots.filter(l=>!l.green && l.w>70 && l.h>70);
  const nPoi = Math.min(big.length, 3+((rnd()*4)|0));
  const usedIdx=new Set();
  for(let i=0;i<nPoi;i++){
    let idx=(rnd()*big.length)|0, guard=0;
    while(usedIdx.has(idx)&&guard++<20) idx=(rnd()*big.length)|0;
    usedIdx.add(idx);
    const lot=big[idx];
    const type=pick(rnd,POI_TYPES);
    city.pois.push({x:lot.x+lot.w/2, y:lot.y+lot.h/2, type, label:type, lot});
  }

  /* 6. 路名 */
  city.roadName = opts.style==="scifi"
      ? pick(rnd,["星港","环轨","跃迁","曙光","银心","深空"])+"大道"
      : pick(rnd,["朱雀","玄武","青龙","白虎","长乐","永安","太平","迎福","仁和","德化"])+pick(rnd,ROAD_A);
  city.streetName = pick(rnd,["柳","槐","杏","桃","青石","白沙","铁匠","布市","米市","马市","灯","鼓","桥","盐","鱼"])
                  + pick(rnd,ROAD_B);

  if(city.river){
    city.riverName = opts.style==="scifi"
      ? pick(rnd,["蓝移","碎星","静默","霓虹","回流"])+"水道"
      : pick(rnd,["青","白","落","吟","沧","浣"])+pick(rnd,["龙江","水","川","河","溪"]);
  }
  city.name = cityName(rnd, opts.style, "city");
  if(opts.style==="scifi") city.name += " "+pick(rnd,["α","β","γ","K","X","Θ"])+"-"+(1+((rnd()*9)|0));
  return city;
}

/* Andrew monotone chain 凸包 */
function convexHull(points){
  const pts=[...points].sort((a,b)=>a.x===b.x?a.y-b.y:a.x-b.x);
  const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower=[],upper=[];
  for(const p of pts){
    while(lower.length>=2 && cross(lower[lower.length-2],lower[lower.length-1],p)<=0) lower.pop();
    lower.push(p);
  }
  for(let i=pts.length-1;i>=0;i--){
    const p=pts[i];
    while(upper.length>=2 && cross(upper[upper.length-2],upper[upper.length-1],p)<=0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}
function hullExpanded(hull, c, k){
  return hull.map(p=>({x:c.x+(p.x-c.x)*k, y:c.y+(p.y-c.y)*k}));
}
function coastEdge(cst,x,y){
  const W2=1400;
  const base=W2*cst.off;
  const wave=Math.sin((cst.side==="left"||cst.side==="right"?y:x)/W2*4+cst.phase)*cst.amp;
  return base+wave;
}
function riverAt(rv, t){
  const base = rv.vertical ? rv.cx : rv.cy;
  const s = Math.sin(t/H * rv.k * Math.PI*2 + rv.phase);
  return base + s*rv.amp;
}
function inRiver(rv, x, y){
  const d = rv.vertical ? Math.abs(x-riverAt(rv,y)) : Math.abs(y-riverAt(rv,x));
  return d < rv.w/2+14;
}

/* 多边形沿街排房（任意角度，支持斜街） */
function fillLotPoly(lot, rnd, density){
  const poly=lot.poly, n=poly.length;
  const lane=6, alley=9;
  /* 35% 围合院落：只沿相邻 2~3 边满排，形成 L/U 形围合 */
  const enclosed = rnd()<0.35;
  let edgeFilter=null;
  if(enclosed){
    const st=(rnd()*n)|0;
    edgeFilter = rnd()<0.5 ? [st,(st+1)%n] : [st,(st+1)%n,(st+2)%n];
  }
  for(let i=0;i<n;i++){
    if(edgeFilter && !edgeFilter.includes(i)) continue;
    const a=poly[i], b=poly[(i+1)%n];
    const ex=b.x-a.x, ey=b.y-a.y;
    const len=Math.hypot(ex,ey);
    if(len<40) continue;
    const tx=ex/len, ty=ey/len;
    // 内法线：poly 顺时针时内法线为 (-ty,tx)（面积符号决定）
    const areaSign = (()=>{ let v=0;
      for(let k=0;k<n;k++){const p=poly[k],q=poly[(k+1)%n]; v+=p.x*q.y-q.x*p.y;} return v; })();
    let nx=-ty, ny=tx;
    if(areaSign<0){ nx=ty; ny=-tx; }
    const depth0=7+rnd()*5;
    const rows=Math.min(3, Math.max(1, Math.floor((Math.min(lot.w,lot.h)/2-lane)/(depth0+alley))));
    for(let rI=0;rI<rows;rI++){
      if(rnd()>density) continue;
      const depth=depth0*(0.85+rnd()*0.3);
      let p=lane+rnd()*6;
      const end=len-lane;
      while(p<end-12){
        const w=9+rnd()*8;
        if(p+w>end) break;
        const d=depth;
        // 房屋中心：边点 + 沿边 p+w/2 + 内法线 (lane+rI*(depth0+alley)+d/2)
        const off=lane+rI*(depth0+alley)+d/2;
        const hx=a.x+tx*(p+w/2)+nx*off - w/2*tx;
        const hy=a.y+ty*(p+w/2)+ny*off - w/2*ty;
        if(city_river_hit(hx,hy)) { p+=w+2.5+rnd()*3.5; continue; }
        const rot=Math.atan2(ty,tx)+(rnd()*2-1)*0.06;
        lot.houses.n.push(hx,hy,w,d,rot);
        p+=w+3.5+rnd()*4.5;
      }
    }
  }
}
function city_river_hit(x,y){
  const rv=STATE&&STATE.river;
  if(rv){
    const d=rv.vertical? Math.abs(x-riverAt(rv,y)) : Math.abs(y-riverAt(rv,x));
    if(d < rv.w/2+6) return true;
  }
  const t=STATE&&STATE.tributary;
  if(t){
    const d2=t.vertical? Math.abs(x-riverAt(t,y)) : Math.abs(y-riverAt(t,x));
    if(d2 < t.w/2+6) return true;
  }
  return false;
}

function fillSide(lot, side, len, rows, depth0, alley, rnd, density, lane){
  const cap=Math.max(6, Math.floor((lot.w*lot.h)/110));
  if(len<46 || rows<1) return;
  for(let rI=0;rI<rows;rI++){
    if(rnd()>density) continue;                       // 整排跳过 → 院巷
    const depth=depth0*(0.85+rnd()*0.3);
    let p=lane+rnd()*6;
    const end=len-lane;
    while(p<end-12){
      const w=9+rnd()*8;
      if(p+w>end) break;
      const d=depth;
      let hx,hy,hw,hh;
      if(side==="n"){ hx=lot.x+p;           hy=lot.y+lane+rI*(depth0+alley);          hw=w; hh=d; }
      if(side==="s"){ hx=lot.x+p;           hy=lot.y+lot.h-lane-rI*(depth0+alley)-d;  hw=w; hh=d; }
      if(side==="w"){ hy=lot.y+p;           hx=lot.x+lane+rI*(depth0+alley);          hh=w; hw=d; }
      if(side==="e"){ hy=lot.y+p;           hx=lot.x+lot.w-lane-rI*(depth0+alley)-d;  hh=w; hw=d; }
      const rot=(rnd()*2-1)*0.07;
      if(lot.houses[side].length < cap) lot.houses[side].push(hx,hy,hw,hh,rot);
      p += w + 3.5 + rnd()*4.5;
    }
  }
}

/* ---------- 渲染：城市 ---------- */
function renderCityContent(city, transparent){
  const T=THEMES[city.opts.style]||THEMES.wuxia;
  const F=FONT_STACK[T.font];
  const rnd=mulberry32(city.seed^0x9E37);
  const LW=SHOW.thin?0.55:1;
  const ctx=APP_CTX;
  if(T.glow){ctx.shadowColor="rgba(87,240,228,0.75)";}

  /* 纸底 */
  if(!transparent){
    ctx.fillStyle=T.paper; ctx.fillRect(0,0,W,H);
    /* 纸底做旧是 800 个 1~2px 的小点，静止时是质感，拖动时是纯开销 —— 降级时跳过 */
    if(!FAST){
      ctx.fillStyle=T.old;
      for(let i=0;i<800;i++) ctx.fillRect(rnd()*W,rnd()*H,rnd()*1.6,rnd()*1.6);
    }
    ctx.strokeStyle=T.grid; ctx.lineWidth=1;
    for(let x=70;x<W;x+=120){ ctx.beginPath(); ctx.moveTo(x,40); ctx.lineTo(x,H-40); ctx.stroke(); }
    for(let y=70;y<H;y+=120){ ctx.beginPath(); ctx.moveTo(40,y); ctx.lineTo(W-40,y); ctx.stroke(); }
  }

  /* 建成区底色 */
  for(const l of city.lots){
    if(l.green&&!SHOW.green) continue;
    ctx.fillStyle = l.green? T.green : T.lot;
    ctx.beginPath();
    const poly=l.poly||[{x:l.x,y:l.y},{x:l.x+l.w,y:l.y},{x:l.x+l.w,y:l.y+l.h},{x:l.x,y:l.y+l.h}];
    poly.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle=T.lotEdge; ctx.lineWidth=1; ctx.stroke();
  }
  /* 绿地树点 */
  if(!FAST){
    ctx.fillStyle=T.tree;
    for(const g of city.greens){
      for(let i=0;i<Math.min(14,(g.w*g.h)/900);i++){
        ctx.beginPath(); ctx.arc(g.x+8+rnd()*(g.w-16), g.y+8+rnd()*(g.h-16), 2.2+rnd()*1.6, 0, 7); ctx.fill();
      }
    }
  }

  /* 海岸 */
  if(city.coast && SHOW.water){
    const cst=city.coast;
    ctx.fillStyle=T.river;
    ctx.beginPath();
    if(cst.side==="left"||cst.side==="right"){
      const left=cst.side==="left";
      ctx.moveTo(left?0:W,40);
      for(let y=40;y<=H-40;y+=20){ const e=coastEdge(cst,0,y); ctx.lineTo(left?e:W-e,y); }
      ctx.lineTo(left?0:W,H-40); ctx.closePath();
    }else{
      const top=cst.side==="top";
      ctx.moveTo(40,top?0:H);
      for(let x=40;x<=W-40;x+=20){ const e=coastEdge(cst,x,0); ctx.lineTo(x,top?e:H-e); }
      ctx.lineTo(W-40,top?0:H); ctx.closePath();
    }
    ctx.fill();
    ctx.strokeStyle=T.riverEdge; ctx.lineWidth=2;
    ctx.beginPath();
    if(cst.side==="left"||cst.side==="right"){
      const left=cst.side==="left";
      for(let y=40;y<=H-40;y+=20){ const e=coastEdge(cst,0,y); y===40?ctx.moveTo(left?e:W-e,y):ctx.lineTo(left?e:W-e,y); }
    }else{
      const top=cst.side==="top";
      for(let x=40;x<=W-40;x+=20){ const e=coastEdge(cst,x,0); x===40?ctx.moveTo(x,top?e:H-e):ctx.lineTo(x,top?e:H-e); }
    }
    ctx.stroke();
  }

  /* 河流 */
  if(city.river && SHOW.water){
    const rv=city.river;
    ctx.fillStyle=T.river;
    ctx.beginPath();
    if(rv.vertical){
      for(let y=40;y<=H-40;y+=20) ctx.lineTo(riverAt(rv,y)-rv.w/2,y);
      for(let y=H-40;y>=40;y-=20) ctx.lineTo(riverAt(rv,y)+rv.w/2,y);
    }else{
      for(let x=40;x<=W-40;x+=20) ctx.lineTo(x,riverAt(rv,x)-rv.w/2);
      for(let x=W-40;x>=40;x-=20) ctx.lineTo(x,riverAt(rv,x)+rv.w/2);
    }
    ctx.closePath(); ctx.fill();
    /* 岸线 */
    ctx.strokeStyle=T.riverEdge; ctx.lineWidth=1.6;
    for(const s of [-1,1]){
      ctx.beginPath();
      if(rv.vertical){ for(let y=40;y<=H-40;y+=20){ const x=riverAt(rv,y)+s*rv.w/2; y===40?ctx.moveTo(x,y):ctx.lineTo(x,y);} }
      else{ for(let x=40;x<=W-40;x+=20){ const y=riverAt(rv,x)+s*rv.w/2; x===40?ctx.moveTo(x,y):ctx.lineTo(x,y);} }
      ctx.stroke();
    }
  }

  /* 支流 */
  if(city.tributary && SHOW.water){
    const t=city.tributary;
    ctx.fillStyle=T.river;
    ctx.beginPath();
    if(t.vertical){
      for(let y=40;y<=H-40;y+=20) ctx.lineTo(riverAt(t,y)-t.w/2,y);
      for(let y=H-40;y>=40;y-=20) ctx.lineTo(riverAt(t,y)+t.w/2,y);
    }else{
      for(let x=40;x<=W-40;x+=20) ctx.lineTo(x,riverAt(t,x)-t.w/2);
      for(let x=W-40;x>=40;x-=20) ctx.lineTo(x,riverAt(t,x)+t.w/2);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle=T.riverEdge; ctx.lineWidth=1.4;
    for(const sd of [-1,1]){
      ctx.beginPath();
      if(t.vertical){ for(let y=40;y<=H-40;y+=20){ const x=riverAt(t,y)+sd*t.w/2; y===40?ctx.moveTo(x,y):ctx.lineTo(x,y);} }
      else{ for(let x=40;x<=W-40;x+=20){ const y=riverAt(t,x)+sd*t.w/2; x===40?ctx.moveTo(x,y):ctx.lineTo(x,y);} }
      ctx.stroke();
    }
  }

  /* 桥 */
  for(const b of city.bridges){
    ctx.fillStyle=T.paper; ctx.strokeStyle=T.houseEdge; ctx.lineWidth=1.6;
    ctx.fillRect(b.x-b.w/2, b.y-b.h/2, b.w, b.h);
    ctx.strokeRect(b.x-b.w/2, b.y-b.h/2, b.w, b.h);
    ctx.beginPath();
    ctx.moveTo(b.x-b.w/2, b.y-b.h/2); ctx.lineTo(b.x+b.w/2, b.y+b.h/2);
    ctx.moveTo(b.x-b.w/2, b.y+b.h/2); ctx.lineTo(b.x+b.w/2, b.y-b.h/2);
    ctx.lineWidth=1; ctx.stroke();
  }

  /* 主路延伸出城 */
  ctx.strokeStyle=T.roadExt; ctx.lineWidth=3; ctx.setLineDash([7,6]);
  const area={x:96,y:130,w:W-192,h:H-256};
  for(const r of city.roadsV){ ctx.beginPath(); ctx.moveTo(r.x,30); ctx.lineTo(r.x,area.y-4); ctx.moveTo(r.x,area.y+area.h+4); ctx.lineTo(r.x,H-30); ctx.stroke(); }
  for(const r of city.roadsH){ ctx.beginPath(); ctx.moveTo(30,r.y); ctx.lineTo(area.x-4,r.y); ctx.moveTo(area.x+area.w+4,r.y); ctx.lineTo(W-30,r.y); ctx.stroke(); }
  for(const rd of (city.roadsD||[])){
    ctx.beginPath(); ctx.moveTo(rd.x1,rd.y1); ctx.lineTo(rd.x2,rd.y2); ctx.stroke();
  }
  ctx.setLineDash([]);

  /* 城墙：沿 lots 凸包外扩（贴城市轮廓） */
  if(city.opts.wall && city.lots.length){
    const pts=[];
    for(const l of city.lots) for(const p of (l.poly||[])) pts.push(p);
    const hull=convexHull(pts);
    if(hull.length>=3){
      const cc={x:area.x+area.w/2, y:area.y+area.h/2};
      const hw=hullExpanded(hull, cc, 1.06);
      city.wallPath=hw;
      ctx.strokeStyle=T.wall; ctx.lineWidth=6; ctx.lineJoin="round";
      ctx.beginPath();
      hw.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
      ctx.closePath(); ctx.stroke();
      /* 城门：主路与城墙交点 */
      const gateNames=["东","南","西","北","迎晖","望舒","镇远","归云","朝阳","平朔"];
      const gi={n:0};
      for(const r of city.roadsV){
        for(let i=0;i<hw.length;i++){
          const a=hw[i],b=hw[(i+1)%hw.length];
          if((a.x-r.x)*(b.x-r.x)<=0 && Math.min(a.x,b.x)<=r.x && Math.max(a.x,b.x)>=r.x){
            const t=(r.x-a.x)/((b.x-a.x)||1e-9);
            const gy=a.y+(b.y-a.y)*t;
            if(gy<area.y-30||gy>area.y+area.h+30) continue;
            const nm=gateNames[gi.n++%gateNames.length]+"门";
            ctx.fillStyle=T.wall; ctx.beginPath(); ctx.arc(r.x,gy,5,0,Math.PI*2); ctx.fill();
            ctx.font=`${Math.round(15/UI)}px ${F}`; ctx.fillStyle=T.label; ctx.textAlign="center";
            ctx.fillText(nm, r.x+18, gy-8);
          }
        }
      }
      for(const r of city.roadsH){
        for(let i=0;i<hw.length;i++){
          const a=hw[i],b=hw[(i+1)%hw.length];
          if((a.y-r.y)*(b.y-r.y)<=0 && Math.min(a.y,b.y)<=r.y && Math.max(a.y,b.y)>=r.y){
            const t=(r.y-a.y)/((b.y-a.y)||1e-9);
            const gx=a.x+(b.x-a.x)*t;
            if(gx<area.x-30||gx>area.x+area.w+30) continue;
            const nm=gateNames[gi.n++%gateNames.length]+"门";
            ctx.fillStyle=T.wall; ctx.beginPath(); ctx.arc(gx,r.y,5,0,Math.PI*2); ctx.fill();
            ctx.font=`${Math.round(15/UI)}px ${F}`; ctx.fillStyle=T.label; ctx.textAlign="center";
            ctx.fillText(nm, gx+18, r.y-8);
          }
        }
      }
    }
  }

  /* 棚户区 */
  for(const h of city.shantyHouses||[]){
    ctx.save();
    ctx.translate(h.x+h.w/2,h.y+h.h/2); ctx.rotate(h.rot);
    ctx.fillStyle=T.house; ctx.strokeStyle=T.houseEdge; ctx.lineWidth=0.9;
    ctx.fillRect(-h.w/2,-h.h/2,h.w,h.h); ctx.strokeRect(-h.w/2,-h.h/2,h.w,h.h);
    ctx.restore();
  }

  /* 房屋
     原来每栋房独立 beginPath / fill / stroke —— 一座城 900~1300 栋，
     一帧就是两千多次独立填充，光栅化批次全耗在这儿。
     同色同边的不透明房屋可以把所有子路径攒进一条 path，一次 fill、一次 stroke，
     画出来一模一样，批次从 2000+ 降到 2。
     ⚠ 半透明填充不能这么干：nonzero 规则下重叠子路径只填一次，
     两个房子叠着的地方会比原来浅一半（科幻风的 house 就是 rgba）。所以那种走逐栋。 */
  const MERGE_HOUSE = /^#[0-9a-fA-F]{3,8}$/.test(String(T.house));
  ctx.strokeStyle=T.houseEdge; ctx.lineWidth=1;
  ctx.fillStyle=T.house;
  if(SHOW.buildings && MERGE_HOUSE){
    ctx.beginPath();
    for(const l of city.lots){
      if(l.green) continue;
      for(const side of ["n","s","e","w"]){
        const arr=l.houses[side];
        for(let i=0;i<arr.length;i+=5){
          const hw=arr[i+2], hh=arr[i+3], rot=arr[i+4]||0;
          const cx=arr[i]+hw/2, cy=arr[i+1]+hh/2;
          const hw2=hw/2, hh2=hh/2;
          if(rot){
            const cs=Math.cos(rot), sn=Math.sin(rot);
            ctx.moveTo(cx-hw2*cs+hh2*sn, cy-hw2*sn-hh2*cs);
            ctx.lineTo(cx+hw2*cs+hh2*sn, cy+hw2*sn-hh2*cs);
            ctx.lineTo(cx+hw2*cs-hh2*sn, cy+hw2*sn+hh2*cs);
            ctx.lineTo(cx-hw2*cs-hh2*sn, cy-hw2*sn+hh2*cs);
            ctx.closePath();
          }else{
            ctx.rect(cx-hw2, cy-hh2, hw, hh);
          }
        }
      }
      for(const h of (l.free||[])){
        const hw=h[2],hh=h[3],rot=h[4]||0;
        const cx=h[0]+hw/2,cy=h[1]+hh/2;
        if(rot){
          const cs=Math.cos(rot),sn=Math.sin(rot),w2=hw/2,h2=hh/2;
          ctx.moveTo(cx-w2*cs+h2*sn, cy-w2*sn-h2*cs);
          ctx.lineTo(cx+w2*cs+h2*sn, cy+w2*sn-h2*cs);
          ctx.lineTo(cx+w2*cs-h2*sn, cy+w2*sn+h2*cs);
          ctx.lineTo(cx-w2*cs-h2*sn, cy-w2*sn+h2*cs);
          ctx.closePath();
        }else{
          ctx.rect(h[0], h[1], hw, hh);
        }
      }
    }
    ctx.fill();
    /* 这一下只占 1 次调用（合并前是 900 多次）。
       千万别为了「省一点」把它跳掉：没有描边，房屋填充色和街区底色几乎同色，
       拖动时整片房子会糊在一起，看着像消失了。降级只降纸纹和树点。 */
    ctx.stroke();
  }else if(SHOW.buildings){
    /* 半透明填充：只能一栋一栋来，靠多次覆盖叠出深浅 */
    for(const l of city.lots){
      if(l.green) continue;
      for(const side of ["n","s","e","w"]){
        const arr=l.houses[side];
        for(let i=0;i<arr.length;i+=5){
          const hw=arr[i+2], hh=arr[i+3], rot=arr[i+4]||0;
          const cx=arr[i]+hw/2, cy=arr[i+1]+hh/2;
          const cs=Math.cos(rot), sn=Math.sin(rot), hw2=hw/2, hh2=hh/2;
          const x1=cx-hw2*cs+hh2*sn, y1=cy-hw2*sn-hh2*cs;
          const x2=cx+hw2*cs+hh2*sn, y2=cy+hw2*sn-hh2*cs;
          const x3=cx+hw2*cs-hh2*sn, y3=cy+hw2*sn+hh2*cs;
          const x4=cx-hw2*cs-hh2*sn, y4=cy-hw2*sn+hh2*cs;
          ctx.beginPath();
          ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.lineTo(x4,y4); ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      for(const h of (l.free||[])){
        const hw=h[2],hh=h[3],rot=h[4]||0;
        const cx=h[0]+hw/2,cy=h[1]+hh/2;
        const cs=Math.cos(rot),sn=Math.sin(rot),w2=hw/2,h2=hh/2;
        ctx.beginPath();
        ctx.moveTo(cx-w2*cs+h2*sn, cy-w2*sn-h2*cs);
        ctx.lineTo(cx+w2*cs+h2*sn, cy+w2*sn-h2*cs);
        ctx.lineTo(cx+w2*cs-h2*sn, cy+w2*sn+h2*cs);
        ctx.lineTo(cx-w2*cs-h2*sn, cy-w2*sn+h2*cs);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  /* 中心广场 / 神殿 */
  for(const l of city.lots){
    if(!l.special) continue;
    const cx=l.x+l.w/2, cy=l.y+l.h/2;
    if(l.special==="citadel"){
      const cx=l.x+l.w/2, cy=l.y+l.h/2;
      // 内城墙
      ctx.strokeStyle=T.wall; ctx.lineWidth=3.5;
      const iw=l.w*0.8, ih=l.h*0.8;
      ctx.strokeRect(cx-iw/2,cy-ih/2,iw,ih);
      // 大城堡主体
      const w=l.w*0.5,h=l.h*0.5;
      ctx.fillStyle=T.house; ctx.strokeStyle=T.wall; ctx.lineWidth=2.2;
      ctx.fillRect(cx-w/2,cy-h/2,w,h); ctx.strokeRect(cx-w/2,cy-h/2,w,h);
      // 四角塔楼
      for(const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
        ctx.beginPath(); ctx.arc(cx+dx*iw/2,cy+dy*ih/2,5.5,0,Math.PI*2); ctx.fill();
      }
      // 内廷小楼
      ctx.strokeRect(cx-w*0.18,cy-h*0.18,w*0.36,h*0.36);
      ctx.font=`${Math.round(16/UI)}px ${F}`; ctx.fillStyle=T.label; ctx.textAlign="center";
      ctx.fillText("内城",cx,cy+ih/2+20);
    }else if(l.special==="plaza"){
      ctx.strokeStyle=T.sub; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.arc(cx,cy,Math.min(l.w,l.h)*0.16,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle=T.poi; ctx.beginPath(); ctx.arc(cx,cy,4,0,Math.PI*2); ctx.fill();
      ctx.font=`${Math.round(16/UI)}px ${F}`; ctx.fillStyle=T.label; ctx.textAlign="center";
      ctx.fillText("中央广场",cx,cy+Math.min(l.w,l.h)*0.16+20);
    }else if(l.special==="temple"){
      const w=l.w*0.5,h=l.h*0.5;
      ctx.fillStyle=T.house; ctx.strokeStyle=T.wall; ctx.lineWidth=2;
      ctx.fillRect(cx-w/2,cy-h/2,w,h); ctx.strokeRect(cx-w/2,cy-h/2,w,h);
      for(const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
        ctx.beginPath(); ctx.arc(cx+dx*w/2,cy+dy*h/2,5,0,Math.PI*2); ctx.fill();
      }
      ctx.font=`${Math.round(16/UI)}px ${F}`; ctx.fillStyle=T.label; ctx.textAlign="center";
      ctx.fillText("神殿",cx,cy+h/2+20);
    }
  }

  /* POI 图标 + 名称（同名类型只标一个：满图「酒馆×12」是噪音不是信息） */
  if(!SHOW.poi) { /* 隐藏地标 */ } else {
    const labeled={}; let labelN=0;
    for(const p of city.pois){
      drawPOIIcon(ctx, p.type, p.x, p.y, T, p.rot);
      const key=p.label||p.type;
      if(labeled[key] || labelN>=10) continue;
      labeled[key]=1; labelN++;
      ctx.font=`${Math.round(14/UI)}px ${F}`;
      ctx.fillStyle=T.label;
      ctx.textAlign="center";
      ctx.fillText(p.label||p.type, p.x, p.y+Math.round(20/UI));
    }
  }

  /* 标签 */
  ctx.fillStyle=T.label; ctx.textAlign="center"; ctx.textBaseline="middle";
  for(const lb of city.labels){
    ctx.font=`${lb.size}px "Kaiti SC","STKaiti","KaiTi",serif`;
    ctx.fillText(lb.text, lb.x, lb.y);
  }
  // 主路名（横主路第一条）
  if(city.roadsH.length){
    const r=city.roadsH[(city.roadsH.length/2)|0];
    ctx.font=`16px ${F}`;
    ctx.fillStyle=T.sub;
    if(SHOW.names) ctx.fillText(city.roadName, area.x+area.w-90, r.y-8);
  }
  if(city.roadsV.length){
    const r=city.roadsV[0];
    ctx.save(); ctx.translate(r.x-26, area.y+300); ctx.rotate(-Math.PI/2);
    ctx.font=`15px ${F}`;
    ctx.fillStyle=T.sub;
    ctx.textAlign="center";
    ctx.fillText(city.streetName, 0, 0);
    ctx.restore();
  }

  /* 区域名（象限淡色大字） */
  {
    const cc={x:area.x+area.w/2, y:area.y+area.h/2};
    const regionNames = city.opts.style==="scifi" ? ["A区","B区","C区","D区"]
      : city.opts.style==="xianxia" ? ["东玄","西灵","南霄","北冥"]
      : ["东市","西市","南埠","北苑"];
    const centers=[{x:cc.x+area.w/4,y:cc.y-area.h/4},{x:cc.x-area.w/4,y:cc.y-area.h/4},
                   {x:cc.x+area.w/4,y:cc.y+area.h/4},{x:cc.x-area.w/4,y:cc.y+area.h/4}];
    ctx.font=`${Math.round(30/UI)}px ${F}`;
    for(let i=0;i<4;i++){
      ctx.fillStyle=T.sub; ctx.globalAlpha=0.35; ctx.textAlign="center";
      ctx.fillText(regionNames[i], centers[i].x, centers[i].y);
    }
    ctx.globalAlpha=1;
  }

  /* 城名 */
  drawTextSpacedWorld(ctx, city.name, W/2, 72, `46px ${F}`, 10, T.title);
  ctx.font=`${PX(9)}px ${F}`;
  ctx.fillStyle=T.sub;
  ctx.textAlign="right";
  ctx.fillText("种子 "+city.seed, W-70, H-72);

  /* 罗盘 + 比例尺 */
  const rx=W-110, ry=H-130;
  if(SHOW.compass){
  ctx.strokeStyle=T.houseEdge; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.arc(rx,ry,30,0,7); ctx.stroke();
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4, L=i%2?14:26;
    ctx.beginPath(); ctx.moveTo(rx+Math.cos(a)*5, ry+Math.sin(a)*5);
    ctx.lineTo(rx+Math.cos(a)*L, ry+Math.sin(a)*L); ctx.stroke();
  }
  ctx.font=`15px ${F}`; ctx.fillStyle=T.wall;
  ctx.fillText("北", rx, ry-38);
  ctx.strokeStyle=T.wall; ctx.lineWidth=2;
  const bx=80, by=H-90;
  ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx+120,by); ctx.stroke();
  ctx.lineWidth=1;
  for(const dx of [0,40,80,120]){ ctx.beginPath(); ctx.moveTo(bx+dx,by-4); ctx.lineTo(bx+dx,by+4); ctx.stroke(); }
  ctx.font='12px sans-serif'; ctx.textAlign="left";
  ctx.fillText("0        100       200 m", bx, by+16);
  }
  drawFrame(ctx,W,H,T.houseEdge,T.sub);
}


/* ============================================================
 * 大世界模式 —— FGO/崩铁式区域地图：大陆地形 + 据点节点 + 路径
 * ============================================================ */
let SELECTED=null, DRAG=null, PLACING=false;
/* 放置时「用户选了什么类型」存在 this._pendingType / this._pendingNodeType 上，
   这里的 pendingPoiType / pendingNodeType 两个同名变量从没被读过，删掉。 */
let dragSnap=null;
let GESTURING=false, PAN=false, lastCss=null;
/* FAST = 正在拖动/缩放/平移，画面上的东西正被手指带着走。
   这时候只画「看得出位置」的部分：不描房屋边、不撒纸底噪点、不画树点。
   手指一松就恢复完整渲染 —— 精细度只在静止时才有意义。 */
let FAST=false;
let UI=1;
let TOOL="select";
/* 字体换算基准：正常绘制时用 CV_SIZE（屏显 CSS 宽）。
   高清导出会把 CV_SIZE 换成输出边长，如果字号也按它换算，同一段 14px 字
   在 2600px 大图上只有 14px —— 相对缩小 3.5 倍，等于白导。导出期间把基准
   钉在屏幕宽度上，字号就按比例跟着放大。0 = 未接管，用 CV_SIZE。 */
let FONT_DIV=0;
/* 导出署名：屏幕上看不见，只在导出图右下角出现（图层面板可关） */
let BRAND_ON=true;
const SHOW={green:true,poi:true,names:true,buildings:true,water:true,compass:true,thin:false};
function viewScaleRef(){
  if(typeof VIEW!=="undefined") return VIEW.s||1;
  if(typeof getApp==="function"){ const app=getApp(); return (app&&app.vs)||1; }
  return 1;
}

const WORLD_LEX = {
  wuxia:  { realm:["大楚","大胤","北离","南诏","西凛","东黎","苍","沧","玄","云","荒","幽"],
            landSuf:["境","原","疆","域"], seaSuf:["海","洋"], mtnSuf:["山脉","山"],
            seaPre:["雾","碧落","碎星","无风","沉月","怒涛","镜","迷津"],
            mtn:["落霞","苍莽","断岳","龙脊","雪岭","青冥","赤炎","隐龙","铁马","白露"],
            riverPre:["沧","青","白","赤","落","吟","奔雷","九曲","临风"], riverSuf:["江","河","水"],
            place:LEX.wuxia },
  xianxia:{ realm:["九霄","云隐","青冥","归墟","扶摇","苍梧","玄黄","洪荒","幽都","灵墟"],
            landSuf:["洲","境","域","大陆"], seaSuf:["海","洋"], mtnSuf:["山脉","山系"],
            seaPre:["雾","碧落","碎星","无风","沉月","怒涛","镜","迷津"],
            mtn:["落霞","苍莽","断岳","龙脊","雪岭","青冥","赤炎","隐龙","昆仑","天柱"],
            riverPre:["沧","青","白","赤","落","吟","奔雷","九曲","浣星"], riverSuf:["江","河","川"],
            place:LEX.xianxia },
  fantasy:{ realmA:["艾","奥","维","洛","卡尔","塞","雷","诺","伊","阿"],
            realmB:["尔","文","兰","德","恩","斯","里安","格雷"],
            landSuf:["大陆","之地","领"], seaSuf:["海","洋"], mtnSuf:["山脉","山"],
            seaPre:["雾","碧落","碎星","无风","沉月","怒涛","镜"],
            mtn:["落霞","苍莽","断岳","龙脊","雪岭","青冥","赤炎","隐龙","灰岩","风嚎"],
            riverPre:["沧","青","白","赤","落","吟","奔雷","九曲","银"], riverSuf:["江","河","川"],
            place:LEX.fantasy }
};

const WORLD_THEMES = {
  wuxia:  {paper:"#EFE7D2", old:"rgba(120,100,60,0.05)", land:"#E6D9B6", landEdge:"#3A342A",
           wave:"rgba(110,140,150,0.35)", river:"#8FA8AC", riverName:"#5F7A7E", sea:"rgba(70,90,100,0.4)",
           mtn:"#4A4437", forest:"rgba(100,120,80,0.6)", link:"#8A7A5C",
           label:"#3A342A", title:"#3A342A", sub:"#6E6451", compass:"#4A4437", scale:"#33302A", font:"Kaiti"},
  xianxia:{paper:"#E9EDE6", old:"rgba(90,110,100,0.05)", land:"#DFE4D2", landEdge:"#2E3833",
           wave:"rgba(100,135,140,0.35)", river:"#8FB6BC", riverName:"#527578", sea:"rgba(60,90,95,0.4)",
           mtn:"#41544A", forest:"rgba(80,110,80,0.55)", link:"#7A8A72",
           label:"#2E3833", title:"#2E3833", sub:"#6E7568", compass:"#41544A", scale:"#2E3833", font:"Kaiti"},
  fantasy:{paper:"#F2E7C8", old:"rgba(130,105,55,0.06)", land:"#EBDCB0", landEdge:"#3A3226",
           wave:"rgba(110,140,145,0.35)", river:"#96B8B2", riverName:"#5E7A76", sea:"rgba(75,95,90,0.4)",
           mtn:"#4A4437", forest:"rgba(105,110,55,0.55)", link:"#9A865C",
           label:"#3A3226", title:"#3A3226", sub:"#7A6A4E", compass:"#4A4437", scale:"#3A3226", font:"Kaiti"},
  ink:    {paper:"#F4F4EF", old:"rgba(70,70,70,0.04)", land:"#E9E9E2", landEdge:"#262626",
           wave:"rgba(90,90,90,0.22)", river:"#B8BAB4", riverName:"#7A7C78", sea:"rgba(60,60,60,0.3)",
           mtn:"#333333", forest:"rgba(70,80,60,0.45)", link:"#8A8A84",
           label:"#262626", title:"#141414", sub:"#6A6A66", compass:"#333333", scale:"#262626", font:"Kaiti"}
};

const NODE_TYPES=[
  {t:"主城",icon:"capital"},{t:"古城",icon:"city"},{t:"关隘",icon:"pass"},
  {t:"港口",icon:"port"},{t:"渔村",icon:"village"},{t:"山庄",icon:"village"},
  {t:"寺观",icon:"temple"},{t:"遗迹",icon:"ruin"},{t:"矿场",icon:"mine"},
  {t:"驿站",icon:"post"},{t:"山寨",icon:"fort"},{t:"秘境",icon:"secret"}
];

function pointInPoly(x,y,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i].x,yi=poly[i].y,xj=poly[j].x,yj=poly[j].y;
    if(((yi>y)!==(yj>y)) && (x<(xj-xi)*(y-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}
function blobPts(cx,cy,R,rnd,harmN,rough,amp){
  /* 只叠正弦谐波画出来的是“土豆”：光滑、无海湾、无岬角。
     这里再叠几个局部高斯突起（正=半岛，负=海湾），海岸线才有海岸的样子。
     amp 是海岸起伏倍率：差异度低时压到 0.55（海岸更圆更规矩），
     差异度高时放到 1.5（岬角、海湾夸张）。不传 = 1，岛屿湖泊照旧。 */
  const A=(amp===undefined)?1:amp;
  const harm=[];
  harm.push({k:2+((rnd()*2)|0), a:(0.09+rnd()*0.10)*A, p:rnd()*6.28});
  for(let i=0;i<harmN;i++) harm.push({k:4+((rnd()*4)|0), a:(0.05+rnd()*0.10)*A, p:rnd()*6.28});
  harm.push({k:9+((rnd()*6)|0), a:(0.018+rnd()*0.025)*A, p:rnd()*6.28});
  const feats=[], fn=2+((rnd()*3)|0);
  for(let i=0;i<fn;i++){
    feats.push({th:rnd()*6.28, w:0.12+rnd()*0.20, a:(rnd()<0.55?-1:1)*(0.10+rnd()*0.16)*(rough?1.5:1)*A});
  }
  const pts=[];
  for(let i=0;i<160;i++){
    const th=i/160*Math.PI*2;
    let r=R;
    for(const h of harm) r*=1+h.a*Math.sin(h.k*th+h.p);
    for(const f of feats){
      const d=Math.abs(((th-f.th+Math.PI*3)%(Math.PI*2))-Math.PI);
      r*=1+f.a*Math.exp(-(d*d)/(2*f.w*f.w));
    }
    pts.push({x:cx+Math.cos(th)*r, y:cy+Math.sin(th)*r*0.88});
  }
  return pts;
}

function generateWorld(seedNum, opts){
  const rnd=mulberry32(seedNum);
  const L=WORLD_LEX[opts.style]||WORLD_LEX.wuxia;
  const terra=0.3+opts.terra*0.007;              // 0.3~1.0 山川丰富度
  /* 差异度（0~100）：决定「换一张之后新图跟上一张差多远」。
     它不改单张图的精细度，只改结构随机量的摆幅 ——
       0   大陆总是靠中间、大小接近、海岸圆润，换图只在细节上变；
       100 位置、大小、海岸走向全放开，每张都像另一个世界。
     数量类系数在 55 这一档正好还原成原来的固定值（山川 3 条、河流 2 条、
     据点 8 个、岛 4 座），只有大陆中心偏移从一开始就比原来大 ——
     原版是 ±60，这里 55 档就有 ±102，这正是这次要的「差异」。
     半径浮动同理：默认 ±9%，看起来不再是同一块大陆换个花纹。 */
  const dv=Math.max(0,Math.min(100, opts.diff===undefined?55:opts.diff))/100;
  const jC=20+dv*150;          // 大陆中心可偏移量 20~170
  const jR=0.008+dv*0.035;     // 半径浮动 0.008~0.043 → 大陆直径 0.51~0.69 个画布
  const shapeK=0.55+dv*0.95;   // 海岸起伏倍率 0.55~1.5
  const w={seed:seedNum, opts, lands:[], islands:[], ranges:[], rivers:[],
           forests:[], nodes:[], links:[], seas:[], name:""};

  /* 大陆与岛屿：中心只按「据点不许跑出画布」来夹，不按大陆外沿夹。
     据点最远摆到 R*0.85，再留一成给标签 → 夹在 0.95R 以内就够点了。
     大陆本身允许骑到画布边上被裁掉，那是真实地图本来的样子；
     硬要把整块大陆塞进画布，半径一大就只能永远居中，反而没了差异。 */
  const R=W*(0.30+(rnd()*2-1)*jR);
  const cl=R*0.95;
  const cx=Math.max(cl, Math.min(W-cl, W/2+(rnd()*2-1)*jC));
  const cy=Math.max(cl, Math.min(H-cl, H/2+50+(rnd()*2-1)*jC*0.65));
  const main=blobPts(cx,cy,R,rnd,2+Math.round(dv*4),false,shapeK);
  w.lands.push(main); w.main=main;
  const isleN=1+Math.round(terra*4*(0.5+dv*0.95));
  for(let i=0;i<isleN;i++){
    const a=rnd()*6.28, d=R*1.25+rnd()*W*0.12;
    w.islands.push(blobPts(cx+Math.cos(a)*d, cy+Math.sin(a)*d*0.8, 26+rnd()*46, rnd, 3, true, shapeK));
  }
  const inLand=(x,y)=>pointInPoly(x,y,main);

  /* 山脉链 */
  const rangeN=2+Math.round(terra*(2+dv*2));       // 差异度低 3 条、高 5 条
  for(let i=0;i<rangeN;i++){
    let x=cx+(rnd()*2-1)*R*0.4, y=cy+(rnd()*2-1)*R*0.4;
    let ang=rnd()*6.28;
    const chain=[{x,y}];
    const steps=5+((rnd()*4)|0);
    for(let s=0;s<steps;s++){
      ang+=(rnd()*1.2-0.6);
      const nx=x+Math.cos(ang)*(60+rnd()*70), ny=y+Math.sin(ang)*(60+rnd()*70);
      if(!inLand(nx,ny)) break;
      x=nx; y=ny; chain.push({x,y});
    }
    if(chain.length>=3) w.ranges.push({pts:chain, name:pick(rnd,L.mtn)+pick(rnd,L.mtnSuf)});
  }

  /* 河流：从山脉流向海 */
  const riverN=Math.round(terra*(1.5+dv*2.7));     // 差异度低 1 条、高 3 条
  for(let i=0;i<riverN && w.ranges.length;i++){
    const rg=w.ranges[(rnd()*w.ranges.length)|0];
    const p0=rg.pts[(rnd()*rg.pts.length)|0];
    // 朝远离大陆中心方向走到海
    let dx=p0.x-cx, dy=p0.y-cy; const dl=Math.hypot(dx,dy)||1; dx/=dl; dy/=dl;
    const pts=[{x:p0.x,y:p0.y}];
    let x=p0.x, y=p0.y;
    for(let s=0;s<24;s++){
      const nx=x+dx*38+(rnd()*2-1)*26, ny=y+dy*38+(rnd()*2-1)*26;
      if(!inLand(nx,ny)) break;
      x=nx; y=ny; pts.push({x,y});
    }
    // 末端略伸向海岸，视觉上"流入大海"
    pts.push({x:x+dx*16, y:y+dy*16});
    w.rivers.push({pts, name:pick(rnd,L.riverPre)+pick(rnd,L.riverSuf)});
  }
  const riverDist=(x,y)=>{
    let m=1e9;
    for(const rv of w.rivers) for(const p of rv.pts) m=Math.min(m,Math.hypot(p.x-x,p.y-y));
    return m;
  };

  /* 内陆湖泊 1~2 个 */
  const lakeN=1+((rnd()*2)|0);
  for(let i=0;i<lakeN;i++){
    let x,y,g=0;
    do{ x=cx+(rnd()*2-1)*R*0.6; y=cy+(rnd()*2-1)*R*0.55; }while(!inLand(x,y)&&g++<30);
    if(!inLand(x,y)) continue;
    const lr=26+rnd()*40;
    w.lakes=w.lakes||[];
    w.lakes.push(blobPts(x,y,lr,rnd,3));
  }

  /* 森林簇：独立于山川——山多不代表树多 */
  const forestN=Math.max(1, 1+Math.round((opts.forest===undefined?55:opts.forest)*0.06));
  for(let i=0;i<forestN;i++){
    let x,y,g=0;
    do{ x=cx+(rnd()*2-1)*R*0.75; y=cy+(rnd()*2-1)*R*0.7; }while(!inLand(x,y)&&g++<40);
    if(!inLand(x,y)) continue;
    const n=18+((rnd()*22)|0), rad=30+rnd()*50, trees=[];
    for(let t=0;t<n;t++){
      const a=rnd()*6.28, r=Math.sqrt(rnd())*rad;
      const tx=x+Math.cos(a)*r, ty=y+Math.sin(a)*r;
      if(inLand(tx,ty)) trees.push({x:tx,y:ty});
    }
    w.forests.push({trees});
  }

  /* 地点节点：拒绝采样 */
  const nodeN=5+Math.round(terra*5*(0.55+dv*0.8)); // 差异度低 7 个、高 10 个
  const nodes=[];
  let guard=0;
  while(nodes.length<nodeN && guard++<900){
    const x=cx+(rnd()*2-1)*R*0.85, y=cy+(rnd()*2-1)*R*0.8;
    if(!inLand(x,y)) continue;
    if(riverDist(x,y)<40) continue;
    if((w.lakes||[]).some(lk=>lk.some(p=>Math.hypot(p.x-x,p.y-y)<50))) continue;
    // 避开山脉链，防止山名与据点挤在一起
    let nearM=false;
    for(const rg of w.ranges) for(const p of rg.pts) if(Math.hypot(p.x-x,p.y-y)<70){ nearM=true; break; }
    if(nearM) continue;
    let ok=true;
    for(const n of nodes) if(Math.hypot(n.x-x,n.y-y)<175){ ok=false; break; }
    if(!ok) continue;
    // 距海岸：用于港口判定
    let sea=1e9;
    for(const p of main) sea=Math.min(sea,Math.hypot(p.x-x,p.y-y));
    const nearSea=sea>70 && sea<210;
    nodes.push({x,y,nearSea});
  }
  // 类型分配：先放 1~2 个主城，其余按地形（近海→港渔、近山→庄寨矿、近河→渔村驿站）
  const usedTypes=[];
  const capN=1+((rnd()*2)|0);
  for(let i=0;i<nodes.length;i++){
    let type;
    const nearM = w.ranges.some(rg=>rg.pts.some(p=>Math.hypot(p.x-nodes[i].x,p.y-nodes[i].y)<100));
    const nearR = riverDist(nodes[i].x,nodes[i].y)<60;
    if(i<capN) type=NODE_TYPES[0];
    else if(nodes[i].nearSea && rnd()<0.75) type=pick(rnd,NODE_TYPES.filter(n=>n.icon==="port"||n.t==="渔村"));
    else if(nearM && rnd()<0.7) type=pick(rnd,NODE_TYPES.filter(n=>["山庄","山寨","矿场"].includes(n.t)));
    else if(nearR && rnd()<0.6) type=pick(rnd,NODE_TYPES.filter(n=>["渔村","驿站"].includes(n.t)));
    else{
      let g2=0;
      do{ type=pick(rnd,NODE_TYPES); g2++; }
      while(g2<20 && (type.icon==="capital" || usedTypes.filter(u=>u===type.t).length>=2));
    }
    usedTypes.push(type.t);
    const isCap = type.icon==="capital";
    const nm=cityName(rnd, opts.style, isCap ? "city" : "core");
    nodes[i].type=type.t; nodes[i].icon=type.icon;
    nodes[i].label = isCap ? nm : nm+type.t;
  }
  w.nodes=nodes;

  /* 路径：每点连最近 2 点 */
  const seen=new Set();
  for(const a of nodes){
    const near=nodes.filter(n=>n!==a)
      .sort((p,q)=>Math.hypot(p.x-a.x,p.y-a.y)-Math.hypot(q.x-a.x,q.y-a.y));
    for(const b of near.slice(0,2)){
      const key=[Math.min(a.x,b.x),Math.min(a.y,b.y),Math.max(a.x,b.x),Math.max(a.y,b.y)].join(",");
      if(seen.has(key)) continue;
      seen.add(key);
      const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
      const dx=b.x-a.x, dy=b.y-a.y, dl=Math.hypot(dx,dy)||1;
      const off=(rnd()*2-1)*Math.min(50,dl*0.25);
      w.links.push({a,b,c:{x:mx-dy/dl*off, y:my+dx/dl*off}});
    }
  }

  /* 命名 */
  w.name = cityName(rnd, opts.style, "world");
  const seaN=1+((rnd()*2)|0);
  for(let i=0;i<seaN;i++) w.seas.push({name:pick(rnd,L.seaPre)+pick(rnd,L.seaSuf),
    x:cx+(rnd()*2-1)*W*0.32, y:cy-R*1.15+rnd()*60, rot:-0.26});
  return w;
}

/* ---------- 渲染：大世界 ---------- */
function drawIcon(ctx, icon, x, y, s){
  ctx.save(); ctx.translate(x,y);
  ctx.strokeStyle="#3A342A"; ctx.fillStyle="#CDBFA0"; ctx.lineWidth=1.6;
  switch(icon){
    case "capital":
      ctx.fillRect(-s*0.2,-s*1.1,s*0.4,s*1.1); ctx.strokeRect(-s*0.2,-s*1.1,s*0.4,s*1.1);
      ctx.fillRect(-s*0.85,-s*0.5,s*0.45,s*0.5); ctx.strokeRect(-s*0.85,-s*0.5,s*0.45,s*0.5);
      ctx.fillRect(s*0.4,-s*0.5,s*0.45,s*0.5); ctx.strokeRect(s*0.4,-s*0.5,s*0.45,s*0.5);
      break;
    case "city":
      ctx.fillRect(-s*0.8,-s*0.55,s*0.55,s*0.55); ctx.strokeRect(-s*0.8,-s*0.55,s*0.55,s*0.55);
      ctx.fillRect(-s*0.1,-s*0.75,s*0.5,s*0.75); ctx.strokeRect(-s*0.1,-s*0.75,s*0.5,s*0.75);
      break;
    case "pass":
      ctx.beginPath(); ctx.moveTo(-s*0.6,0); ctx.lineTo(-s*0.6,-s*0.9);
      ctx.moveTo(s*0.6,0); ctx.lineTo(s*0.6,-s*0.9); ctx.moveTo(-s*0.75,-s*0.75); ctx.lineTo(s*0.75,-s*0.75); ctx.stroke();
      break;
    case "port":
      ctx.beginPath(); ctx.arc(0,-s*0.2,s*0.5,Math.PI*0.15,Math.PI*0.85,true); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-s*0.75); ctx.lineTo(0,0); ctx.moveTo(-s*0.28,-s*0.5); ctx.lineTo(s*0.28,-s*0.5); ctx.stroke();
      break;
    case "village":
      ctx.fillRect(-s*0.45,-s*0.35,s*0.7,s*0.35); ctx.strokeRect(-s*0.45,-s*0.35,s*0.7,s*0.35);
      ctx.beginPath(); ctx.moveTo(-s*0.55,-s*0.35); ctx.lineTo(-s*0.1,-s*0.75); ctx.lineTo(s*0.35,-s*0.35); ctx.stroke();
      break;
    case "temple":
      ctx.beginPath(); ctx.moveTo(-s*0.6,0); ctx.lineTo(0,-s*0.85); ctx.lineTo(s*0.6,0); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s*0.4,-s*0.32); ctx.lineTo(s*0.4,-s*0.32); ctx.stroke();
      break;
    case "ruin":
      ctx.beginPath(); ctx.moveTo(0,-s*0.7); ctx.lineTo(s*0.5,-s*0.1); ctx.lineTo(0,s*0.25); ctx.lineTo(-s*0.5,-s*0.1); ctx.closePath(); ctx.stroke();
      break;
    case "mine":
      ctx.beginPath(); ctx.moveTo(-s*0.5,-s*0.6); ctx.lineTo(s*0.5,0);
      ctx.moveTo(s*0.5,-s*0.6); ctx.lineTo(-s*0.5,0); ctx.stroke();
      break;
    case "post":
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-s*0.9);
      ctx.moveTo(0,-s*0.9); ctx.lineTo(s*0.55,-s*0.72); ctx.lineTo(0,-s*0.55); ctx.stroke();
      break;
    case "fort":
      ctx.beginPath(); ctx.moveTo(-s*0.5,0); ctx.lineTo(0,-s*0.7); ctx.lineTo(s*0.5,0); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-s*0.7); ctx.lineTo(0,-s*1.0); ctx.lineTo(s*0.3,-s*0.92); ctx.lineTo(0,-s*0.84); ctx.stroke();
      break;
    case "secret":
      ctx.beginPath();
      for(let i=0;i<6;i++){ const a=i/6*Math.PI*2-Math.PI/2;
        i?ctx.lineTo(Math.cos(a)*s*0.55,Math.sin(a)*s*0.55-s*0.2):ctx.moveTo(Math.cos(a)*s*0.55,Math.sin(a)*s*0.2); }
      ctx.closePath(); ctx.stroke();
      break;
    default:
      ctx.beginPath(); ctx.arc(0,-s*0.3,s*0.3,0,7); ctx.stroke();
  }
  ctx.restore();
}

function renderWorldContent(w, transparent){
  const WT=WORLD_THEMES[w.opts.style]||WORLD_THEMES.wuxia;
  const F=FONT_STACK[WT.font];
  const ctx=APP_CTX;
  const fs=W/1400, TAU=Math.PI*2;
  const rnd=mulberry32(w.seed^0x5DEE);

  if(!transparent){
    ctx.fillStyle=WT.paper; ctx.fillRect(0,0,W,H);
    if(!FAST){ ctx.fillStyle=WT.old;
      for(let i=0;i<800;i++) ctx.fillRect(rnd()*W,rnd()*H,rnd()*1.6,rnd()*1.6); }
  }

  /* 海波纹 */
  ctx.strokeStyle=WT.wave; ctx.lineWidth=1.3;
  for(let i=0;i<90;i++){
    const x=60+rnd()*(W-120), y=60+rnd()*(H-120);
    ctx.beginPath(); ctx.arc(x,y,5+rnd()*7,Math.PI*0.15,Math.PI*0.55); ctx.stroke();
  }

  /* 陆地 */
  for(const land of [...w.lands, ...w.islands]){
    ctx.beginPath();
    land.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.closePath();
    /* 先画一圈浅滩光晕：海与陆同色系时，没有这道光晕分不清哪是岸 */
    ctx.strokeStyle="rgba(120,150,162,0.28)"; ctx.lineWidth=22; ctx.lineJoin="round"; ctx.stroke();
    ctx.fillStyle=WT.land; ctx.fill();
    ctx.strokeStyle=WT.landEdge; ctx.lineWidth=3; ctx.stroke();
  }

  /* 湖泊 */
  for(const lk of (w.lakes||[])){
    ctx.beginPath();
    lk.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.closePath();
    ctx.fillStyle=WT.river; ctx.globalAlpha=0.75; ctx.fill(); ctx.globalAlpha=1;
    ctx.strokeStyle=WT.riverName; ctx.lineWidth=1.6; ctx.stroke();
  }

  /* 河流（4.5 世界单位在手机上不到 1.5px，等于没有河） */
  for(const rv of w.rivers){
    ctx.strokeStyle=WT.river; ctx.lineWidth=11; ctx.lineCap="round"; ctx.lineJoin="round";
    ctx.beginPath();
    rv.pts.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.stroke();
    ctx.font=`italic ${PX(9)}px ${F}`;
    ctx.fillStyle=WT.riverName; ctx.textAlign="center";
    const mid=rv.pts[(rv.pts.length/2)|0];
    ctx.save(); ctx.translate(mid.x,mid.y); ctx.rotate(-0.2);
    ctx.fillText(rv.name,0,-22); ctx.restore();
  }

  /* 山脉链：连续脊线 + 沿走向排列的峰（原来只是散落的碎三角，没有走向） */
  for(const rg of w.ranges){
    const P=rg.pts;
    const ridge=[];
    for(let i=0;i<P.length-1;i++){
      const a=P[i], b=P[i+1], len=Math.hypot(b.x-a.x,b.y-a.y);
      const n=Math.max(2,Math.round(len/26));
      for(let k=0;k<n;k++){
        const t=k/n;
        ridge.push({x:a.x+(b.x-a.x)*t+(rnd()-0.5)*7, y:a.y+(b.y-a.y)*t+(rnd()-0.5)*7});
      }
    }
    ridge.push(P[P.length-1]);
    /* 脊线本体：连续一线，先把“走向”给出来 */
    ctx.strokeStyle=WT.mtn; ctx.lineWidth=2.2;
    ctx.beginPath();
    ridge.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.stroke();
    /* 沿脊线放峰：峰尖朝法线，高度中间大两端小 */
    for(let i=0;i<ridge.length;i+=2){
      const p=ridge[i];
      const q=ridge[Math.min(i+2,ridge.length-1)], o=ridge[Math.max(i-2,0)];
      const ax=q.x-o.x, ay=q.y-o.y, al=Math.hypot(ax,ay)||1;
      const vx=ax/al, vy=ay/al;                 /* 沿脊方向 */
      const env=0.5+0.5*Math.sin((i/Math.max(1,ridge.length-1))*Math.PI);
      const s=(26+rnd()*12)*env;                /* 山必须画大：世界坐标 1400 缩到 363，小三角在手机上等于没有 */
      const side=(i%4===0)?1:-1;                /* 峰交替分列脊线两侧，像褶皱 */
      const bxp=p.x-vx*s, byp=p.y-vy*s, bxn=p.x+vx*s, byn=p.y+vy*s;
      const tipx=p.x-vy*s*1.25*side, tipy=p.y+vx*s*1.25*side;
      ctx.beginPath();
      ctx.moveTo(bxp,byp); ctx.lineTo(tipx,tipy); ctx.lineTo(bxn,byn);
      ctx.closePath();
      ctx.globalAlpha=0.20; ctx.fillStyle=WT.mtn; ctx.fill(); ctx.globalAlpha=1;
      ctx.strokeStyle=WT.mtn; ctx.lineWidth=2.4; ctx.stroke();
    }
    // 山名
    const mid=rg.pts[(rg.pts.length/2)|0];
    ctx.font=`${PX(9)}px ${F}`; ctx.fillStyle=WT.sub;
    ctx.save(); ctx.translate(mid.x,mid.y-46); ctx.rotate(0.12);
    ctx.textAlign="center"; ctx.fillText(rg.name,0,0); ctx.restore();
  }

  /* 森林（树冠 + 树干，原来 2.6 半径在屏幕上不到 1px，等于没画） */
  for(const f of w.forests) for(const t of f.trees){
    ctx.fillStyle=WT.forest;
    ctx.beginPath(); ctx.arc(t.x,t.y,7+rnd()*3,0,TAU); ctx.fill();
    ctx.strokeStyle=WT.forest; ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.moveTo(t.x,t.y+8); ctx.lineTo(t.x,t.y+15); ctx.stroke();
  }

  /* 路径（虚线贝塞尔） */
  ctx.strokeStyle=WT.link; ctx.lineWidth=1.6; ctx.setLineDash([8,6]);
  for(const lk of w.links){
    ctx.beginPath(); ctx.moveTo(lk.a.x,lk.a.y);
    ctx.quadraticCurveTo(lk.c.x,lk.c.y,lk.b.x,lk.b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  /* 节点与标注 */
  for(const n of w.nodes){
    /* 只传 5 参：drawIcon(ctx, icon, x, y, s)。旧代码在第 5 位多塞了配色对象 WT，
       于是 s 变成对象、-s*0.2 = NaN，Canvas 静默丢弃全部命令 —— 据点图标一个都画不出来。 */
    drawIcon(ctx, n.icon, n.x, n.y, n.icon==="capital"?16:12);
    ctx.font=`${Math.round((n.icon==="capital"?17*fs:14*fs)/UI)}px ${F}`;
    ctx.fillStyle=WT.landEdge; ctx.textAlign="center";
    ctx.fillText(n.label, n.x, n.y+Math.round(16/UI));
  }

  /* 批注 */
  for(const lb of (w.notes||[])){
    ctx.font=`${Math.round(16/UI)}px ${F}`;
    ctx.fillStyle=WT.landEdge; ctx.textAlign="center";
    ctx.fillText(lb.text, lb.x, lb.y);
  }

  /* 海域名 */
  for(const s of w.seas){
    ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(s.rot);
    ctx.font=`italic ${Math.round(30*fs)}px ${F}`;
    ctx.fillStyle=WT.sea; ctx.textAlign="center";
    ctx.fillText(s.name,0,0);
    ctx.restore();
  }

  /* 图名 */
  drawTextSpacedWorld(ctx, w.name, W/2, 70, `${Math.round(44*fs)}px ${F}`, 10*fs, WT.landEdge);
  ctx.font=`${PX(9)}px ${F}`; ctx.fillStyle=WT.sub; ctx.textAlign="center";
  ctx.fillText("种子 "+w.seed, W/2, 168);

  /* 罗盘 + 比例尺（里） */
  const rx=W-110, ry=H-130;
  ctx.strokeStyle=WT.mtn; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.arc(rx,ry,30,0,TAU); ctx.stroke();
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4, L=i%2?14:26;
    ctx.beginPath(); ctx.moveTo(rx+Math.cos(a)*5, ry+Math.sin(a)*5);
    ctx.lineTo(rx+Math.cos(a)*L, ry+Math.sin(a)*L); ctx.stroke();
  }
  ctx.font=`15px ${F}`; ctx.fillStyle=WT.scale;
  ctx.fillText("北", rx, ry-38);
  ctx.strokeStyle=WT.scale; ctx.lineWidth=2;
  const bx=80, by=H-90;
  ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx+120,by); ctx.stroke();
  ctx.lineWidth=1;
  for(const dx of [0,40,80,120]){ ctx.beginPath(); ctx.moveTo(bx+dx,by-4); ctx.lineTo(bx+dx,by+4); ctx.stroke(); }
  ctx.font='12px sans-serif'; ctx.textAlign="left";
  ctx.fillText("0        100       200 里", bx, by+16);
  drawFrame(ctx,W,H,WT.landEdge,WT.sub);
}

/* 导出署名：只画在导出图里，屏显不画。故意做得克制 —— 12px、半透明、
   贴着下边框居中，不抢画面，但有人存图转出去时能看见出处。 */
function drawBrand(ctx, T){
  if(!BRAND_ON) return;
  try{
    ctx.save();
    ctx.globalAlpha=0.42;
    ctx.fillStyle=(T&&(T.sub||T.label))||"#6E6451";
    ctx.textAlign="center"; ctx.textBaseline="alphabetic";
    ctx.font=`12px ${FONT_STACK[(T&&T.font)||"Kaiti"]||FONT_STACK.Kaiti}`;
    ctx.fillText("大千境 · 微信小程序", W/2, H-32);
    ctx.restore();
  }catch(e){}
}

function drawFrame(ctx, W, H, colMain, colSub){
  ctx.save();
  ctx.strokeStyle=colSub; ctx.lineWidth=1;
  ctx.strokeRect(16.5,16.5,W-33,H-33);
  ctx.strokeRect(22.5,22.5,W-45,H-45);
  /* 角花 */
  ctx.strokeStyle=colMain; ctx.lineWidth=1.4;
  const L=30;
  for(const [x,y,dx,dy] of [[18,18,1,1],[W-18,18,-1,1],[18,H-18,1,-1],[W-18,H-18,-1,-1]]){
    ctx.beginPath();
    ctx.moveTo(x+dx*L,y); ctx.lineTo(x,y); ctx.lineTo(x,y+dy*L);
    ctx.moveTo(x+dx*(L-6),y+dy*7); ctx.lineTo(x+dx*(L-6),y+dy*(L-6)); ctx.lineTo(x+dx*7,y+dy*(L-6));
    ctx.stroke();
  }
  ctx.restore();
}


function drawPOIIcon(ctx, type, x, y, T, rot){
  if(rot){ ctx.save(); ctx.translate(x,y); ctx.rotate(rot); ctx.translate(-x,-y); }
  ctx.save(); ctx.translate(x,y);
  ctx.strokeStyle=T.wall; ctx.fillStyle=T.poi; ctx.lineWidth=1.2;
  const t=type||"";
  if(t==="市集"){
    ctx.beginPath(); ctx.moveTo(-6,1); ctx.lineTo(0,-5); ctx.lineTo(6,1); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4,1); ctx.lineTo(-4,6); ctx.moveTo(4,1); ctx.lineTo(4,6); ctx.stroke();
  }else if(t==="铁匠铺"||t==="机修铺"){
    ctx.strokeRect(-5,-5,5,4);
    ctx.beginPath(); ctx.moveTo(0,-1); ctx.lineTo(4,5); ctx.stroke();
  }else if(t==="酒馆"){
    ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(0,5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(6,-4); ctx.lineTo(0,-2); ctx.closePath(); ctx.fill();
  }else if(t==="客栈"){
    ctx.strokeRect(-5,0,10,5);
    ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(0,-5); ctx.lineTo(6,0); ctx.stroke();
  }else if(t==="药铺"||t==="医疗站"){
    ctx.beginPath(); ctx.moveTo(0,-5); ctx.lineTo(0,5); ctx.moveTo(-5,0); ctx.lineTo(5,0); ctx.stroke();
  }else if(t==="码头"){
    ctx.beginPath(); ctx.arc(0,-3,2.4,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-0.5); ctx.lineTo(0,5); ctx.moveTo(-4,1.5);
    ctx.quadraticCurveTo(0,7,4,1.5); ctx.stroke();
  }else if(t==="武馆"){
    ctx.beginPath(); ctx.moveTo(-5,-5); ctx.lineTo(5,5); ctx.moveTo(5,-5); ctx.lineTo(-5,5); ctx.stroke();
  }else if(t==="书坊"){
    ctx.strokeRect(-5,-4,4,8); ctx.strokeRect(1,-4,4,8);
    ctx.beginPath(); ctx.moveTo(-1,-4); ctx.lineTo(-1,4); ctx.stroke();
  }else{
    ctx.fillRect(-4,-4,8,8); ctx.strokeRect(-4,-4,8,8);
  }
  ctx.restore();
  if(rot) ctx.restore();
}

function drawTextSpacedWorld(ctx, text, cx, y, font, spacing, color){
  ctx.font=font; ctx.fillStyle=color; ctx.textAlign="left"; ctx.textBaseline="middle";
  const chars=[...text];
  const widths=chars.map(ch=>ctx.measureText(ch).width);
  const total=widths.reduce((a,b)=>a+b,0)+spacing*(chars.length-1);
  let x=cx-total/2;
  chars.forEach((ch,i)=>{ ctx.fillText(ch,x,y); x+=widths[i]+spacing; });
}


/* ============================================================
 * 地牢生成器 —— 网格房间 + L形走廊 + 中文房间描述（跑团向）
 * ============================================================ */
const ROOM_THEMES=[
  {t:"卧房",d:["床榻凌乱，被褥间似有余温。","一柄断剑倚在墙角，主人去向成谜。","柜中衣物被翻得乱七八糟。"]},
  {t:"书库",d:["烛台倾倒，书页散落一地。","书架上有一本被撕去封皮的册子。","空气里全是旧纸和墨的味道。"]},
  {t:"祭坛",d:["祭坛上的烛泪堆成了小山。","石台上刻着无人能懂的祷文。","一缕青烟从香炉里笔直升起。"]},
  {t:"宝库",d:["铁箱的锁已被撬开，箱底还剩几枚铜板。","墙角堆着几袋发霉的粮食。","布袋破了个洞，露出里面的绸缎。"]},
  {t:"囚室",d:["墙上的抓痕还新鲜。","铁链一端空空荡荡。","角落里有一只没喝完的水碗。"]},
  {t:"工坊",d:["熔炉早已熄灭，铁砧上留着半成品的剑胚。","工具散了一地，匠人走得匆忙。","墙上挂着未完工的铠甲。"]},
  {t:"陷阱",d:["地板有一块砖微微下陷。","墙缝里藏着一支早已失效的弩箭。","头顶的绳索静静垂着，像在等待什么。"]},
  {t:"大厅",d:["穹顶的壁画已斑驳难辨。","回声在这里格外漫长。","石柱后似乎有人刚刚离开。"]},
  {t:"哨所",d:["瞭望口正对着来路。","值夜簿停在三天前的那一页。","一张折凳倒在门边。"]},
  {t:"密藏",d:["暗门半掩，门后隐约有光。","这里不像有人来过。","桌上的物件蒙着厚厚一层灰。"]}
];

function generateDungeon(seedNum, opts){
  const rnd=mulberry32(seedNum);
  const GW=34, GH=34;                       // 网格 34×34（44 太稀，房间像散落的方块）
  const grid=Array.from({length:GH},()=>new Array(GW).fill(0)); // 0墙 1地 2廊
  const rooms=[];
  /* 房间数：滑块定基调，再抖一下 —— 否则每张地牢都一样密 */
  const target=Math.max(4, Math.min(20, Math.round((opts.rooms===undefined?55:opts.rooms)*0.2)+1 + (((rnd()*4)|0)-1)));
  let guard=0;
  while(rooms.length<target && guard++<220){
    const w=4+((rnd()*4)|0), h=4+((rnd()*4)|0);
    const x=2+((rnd()*(GW-w-4))|0), y=2+((rnd()*(GH-h-4))|0);
    const round = rnd()<0.18;
    let ok=true;
    for(const r of rooms){
      if(Math.abs(r.cx-(x+w/2))<(r.w+w)/2+1 && Math.abs(r.cy-(y+h/2))<(r.h+h)/2+1){ ok=false; break; }
    }
    if(!ok) continue;
    rooms.push({x,y,w,h,cx:x+w/2,cy:y+h/2,round,id:rooms.length+1});
  }
  for(const r of rooms){
    for(let j=r.y;j<r.y+r.h;j++) for(let i=r.x;i<r.x+r.w;i++) grid[j][i]=1;
  }
  /* 最近邻 L 形连接（MST 近似） */
  const connected=[rooms[0]], rest=rooms.slice(1);
  const corridors=[];
  const carveConn=(a,b)=>{
    const x1=Math.round(a.cx),y1=Math.round(a.cy),x2=Math.round(b.cx),y2=Math.round(b.cy);
    const horizFirst=rnd()<0.5;
    const offs=[0,1];                       // 走廊 2 格宽：1 格太细像电线，3 格会把房间边界吃掉
    const carve=(x,y)=>{ if(x>=0&&y>=0&&x<GW&&y<GH) grid[y][x]=2; };
    if(horizFirst){
      for(let x=Math.min(x1,x2);x<=Math.max(x1,x2);x++) for(const k of offs) carve(x,y1+k);
      for(let y=Math.min(y1,y2);y<=Math.max(y1,y2);y++) for(const k of offs) carve(x2+k,y);
    }else{
      for(let y=Math.min(y1,y2);y<=Math.max(y1,y2);y++) for(const k of offs) carve(x1+k,y);
      for(let x=Math.min(x1,x2);x<=Math.max(x1,x2);x++) for(const k of offs) carve(x,y2+k);
    }
  };
  while(rest.length){
    let best=null,bd=1e9;
    for(const a of connected) for(const b of rest){
      const d=Math.hypot(a.cx-b.cx,a.cy-b.cy);
      if(d<bd){bd=d;best=[a,b];}
    }
    const [a,b]=best;
    corridors.push([a,b]);
    connected.push(b); rest.splice(rest.indexOf(b),1);
    carveConn(a,b);
  }
  /* 额外走廊：MST 只有 n-1 条，地图像一条链；加 1~2 条形成环路，跑团才有“绕后”的可能 */
  const extraN=1+((rnd()*2)|0);
  for(let k=0;k<extraN;k++){
    const a=rooms[(rnd()*rooms.length)|0], b=rooms[(rnd()*rooms.length)|0];
    if(!a||!b||a===b) continue;
    if(corridors.some(([x,y])=> (x===a&&y===b)||(x===b&&y===a))) continue;
    corridors.push([a,b]);
    carveConn(a,b);
  }
  /* 高级参数：密室/水位/BOSS */
  const secrets=new Set();
  if(opts.secret){
    const n=1+((rnd()*2)|0);
    for(let k=0;k<n;k++) secrets.add(rooms[(rnd()*rooms.length)|0].id);
  }
  const bossRoom = opts.boss ? rooms[rooms.length-1] : null;
  const waterLv = opts.water||0;

  /* 房间描述与楼梯 */
  const descs=rooms.map((r,i)=>{
    const th=ROOM_THEMES[(rnd()*ROOM_THEMES.length)|0];
    let text=th.d[(rnd()*th.d.length)|0];
    if(waterLv>=2 && i%3===0) text="此处积水没过脚面，火把的光在水面上晃动。";
    if(bossRoom && r.id===bossRoom.id) text="深处的低吼越来越近，空气中弥漫着威压。";
    return {id:r.id, type:th.t, text, secret:secrets.has(r.id), boss:bossRoom&&r.id===bossRoom.id, hidden:false};
  });
  const entry=rooms[0];
  /* 出口房 = 离入口最远的那间（跑团最常问的就是“最里面怎么走”） */
  let exitRoom=rooms[0], far=-1;
  for(const r of rooms){
    const dd=Math.hypot(r.cx-entry.cx,r.cy-entry.cy);
    if(dd>far){ far=dd; exitRoom=r; }
  }
  return {seed:seedNum,opts,grid,rooms,corridors,descs,
    stairs:{x:entry.cx,y:entry.cy},entryRoom:entry,exitRoom,
    name:cityName(rnd,opts.style,"dungeon"),
    waterLv,bossRoom,w:GW,h:GH};
}

function renderDungeonContent(d, transparent){
  const ctx=APP_CTX;
  const T=THEMES[d.opts.style]||THEMES.wuxia;
  const F=FONT_STACK[T.font];
  const rnd=mulberry32(d.seed^0x77);
  const GW=d.w, GH=d.h;
  /* 地图区固定为 170~H-330，底部留给图例；cell 由可用高度决定 */
  const mapTop=140, mapBot=H-240;
  const cell=Math.floor(Math.min((W-200)/GW,(mapBot-mapTop)/GH));
  const ox=(W-GW*cell)/2, oy=mapTop+Math.floor((mapBot-mapTop-GH*cell)/2);

  if(!transparent){
    ctx.fillStyle=T.paper; ctx.fillRect(0,0,W,H);
    if(!FAST){ ctx.fillStyle=T.old;
      for(let i=0;i<600;i++) ctx.fillRect(rnd()*W,rnd()*H,rnd()*1.4,rnd()*1.4); }
    ctx.strokeStyle=T.grid; ctx.lineWidth=1;
  }
  for(let x=60;x<W;x+=120){ ctx.beginPath(); ctx.moveTo(x,40); ctx.lineTo(x,H-40); ctx.stroke(); }
  for(let y=60;y<H;y+=120){ ctx.beginPath(); ctx.moveTo(40,y); ctx.lineTo(W-40,y); ctx.stroke(); }

  const X=i=>ox+i*cell, Y=j=>oy+j*cell;
  /* 岩体底：未开凿区域不能是空白方格纸，否则整张图像纸上摆了几个方块。
     先铺一层实体岩色，只有通道是浅色，地牢才“像地牢”。 */
  ctx.save();
  ctx.globalAlpha=0.24; ctx.fillStyle=T.houseEdge;
  ctx.fillRect(X(0),Y(0),GW*cell,GH*cell);
  ctx.restore();
  /* 通道填充 / 墙线 / 方格线
     原来三样都是逐格逐段画：每格一次 fillRect、每段墙一次 beginPath+stroke、
     每格又一次 strokeRect。一张地牢图两千多次调用，全耗在这儿。
     同色同线宽的部分各攒一条 path，各画一次。 */
  ctx.fillStyle=T.lot;
  ctx.beginPath();
  for(let j=0;j<GH;j++) for(let i=0;i<GW;i++){
    if(d.grid[j][i]!==0) ctx.rect(X(i),Y(j),cell,cell);
  }
  ctx.fill();
  ctx.strokeStyle=T.houseEdge; ctx.lineWidth=Math.max(1.4,cell*0.12);
  ctx.beginPath();
  for(let j=0;j<GH;j++) for(let i=0;i<GW;i++){
    if(d.grid[j][i]===0) continue;
    const up    = j===0    || d.grid[j-1][i]===0;
    const down  = j===GH-1 || d.grid[j+1][i]===0;
    const left  = i===0    || d.grid[j][i-1]===0;
    const right = i===GW-1 || d.grid[j][i+1]===0;
    const px=X(i), py=Y(j);
    if(up){ ctx.moveTo(px,py); ctx.lineTo(px+cell,py); }
    if(down){ ctx.moveTo(px,py+cell); ctx.lineTo(px+cell,py+cell); }
    if(left){ ctx.moveTo(px,py); ctx.lineTo(px,py+cell); }
    if(right){ ctx.moveTo(px+cell,py); ctx.lineTo(px+cell,py+cell); }
  }
  ctx.stroke();
  /* 方格线只画在通道内（画满整幅就成了练习本） */
  ctx.strokeStyle=T.lotEdge; ctx.lineWidth=1; ctx.globalAlpha=0.35;
  ctx.beginPath();
  for(let j=0;j<GH;j++) for(let i=0;i<GW;i++){
    if(d.grid[j][i]===0) continue;
    ctx.rect(X(i)+0.6,Y(j)+0.6,cell-1.2,cell-1.2);
  }
  ctx.stroke();
  ctx.globalAlpha=1;

  /* 水位：低位房淡蓝淹水 */
  if(d.waterLv>=2){
    for(const r of d.rooms){
      if(r.id%3===0){
        ctx.fillStyle="rgba(110,150,170,0.35)";
        ctx.fillRect(X(r.x),Y(r.y),r.w*cell,r.h*cell);
      }
    }
  }
  /* 门：画在房间墙边（不是房间中心），先用地面色挖掉一段墙，再补两道门框 */
  for(const [a,b] of d.corridors){
    const dx=b.cx-a.cx, dy=b.cy-a.cy;
    if(!dx && !dy) continue;
    const hw=b.w/2, hh=b.h/2;
    const tx = dx ? hw/Math.abs(dx) : Infinity;
    const ty = dy ? hh/Math.abs(dy) : Infinity;
    const t = Math.min(tx,ty);
    const ex=b.cx-dx*t, ey=b.cy-dy*t;          // 走廊穿进房间墙面的那一点
    const onV = Math.abs(ex-b.x)<0.6 || Math.abs(ex-(b.x+b.w))<0.6;  // 交点在左右墙
    const px=X(ex), py=Y(ey), gap=cell*1.0;
    ctx.strokeStyle=T.lot; ctx.lineWidth=Math.max(3,cell*0.22);
    ctx.beginPath();
    if(onV){ ctx.moveTo(px,py-gap/2); ctx.lineTo(px,py+gap/2); }
    else   { ctx.moveTo(px-gap/2,py); ctx.lineTo(px+gap/2,py); }
    ctx.stroke();
    ctx.strokeStyle=T.poi; ctx.lineWidth=Math.max(2.5,cell*0.13);
    ctx.beginPath();
    if(onV){
      ctx.moveTo(px-cell*0.12,py-gap/2); ctx.lineTo(px+cell*0.12,py-gap/2);
      ctx.moveTo(px-cell*0.12,py+gap/2); ctx.lineTo(px+cell*0.12,py+gap/2);
    }else{
      ctx.moveTo(px-gap/2,py-cell*0.12); ctx.lineTo(px-gap/2,py+cell*0.12);
      ctx.moveTo(px+gap/2,py-cell*0.12); ctx.lineTo(px+gap/2,py+cell*0.12);
    }
    ctx.stroke();
  }
  /* 密室暗门 */
  for(const ds of d.descs){
    if(!ds.secret) continue;
    const r=d.rooms.find(rr=>rr.id===ds.id);
    if(!r) continue;
    ctx.fillStyle=T.poi;
    ctx.font=`bold ${Math.round(cell*0.5)}px ${F}`;
    ctx.textAlign="center";
    ctx.fillText("密",X(r.x)+r.w*cell/2,Y(r.y)+r.h*cell/2-cell*0.6);
  }
  /* BOSS 星标 */
  if(d.bossRoom){
    ctx.fillStyle=T.poi;
    ctx.font=`${Math.round(cell*0.7)}px ${F}`; ctx.textAlign="center";
    ctx.fillText("★",X(d.bossRoom.x)+d.bossRoom.w*cell/2,Y(d.bossRoom.y)+d.bossRoom.h*cell/2-cell*0.6);
  }
  /* 楼梯（入口房） */
  const sx=X(d.stairs.x), sy=Y(d.stairs.y);
  ctx.strokeStyle=T.poi; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(sx-cell*0.35,sy); ctx.lineTo(sx+cell*0.35,sy);
  ctx.moveTo(sx,sy-cell*0.35); ctx.lineTo(sx,sy+cell*0.35); ctx.stroke();
  ctx.font=`${Math.round(cell*0.42)}px ${F}`; ctx.fillStyle=T.poi; ctx.textAlign="center";
  ctx.fillText("上",sx,sy-cell*0.6);

  /* 房间形态差异：round 房画椭圆/八边形，不规则房加锯齿边 */
  for(const r of d.rooms){
    if(r.round){
      const cx0=X(r.x)+r.w*cell/2, cy0=Y(r.y)+r.h*cell/2;
      ctx.fillStyle=T.lot;
      ctx.beginPath(); ctx.ellipse(cx0,cy0,r.w*cell*0.55,r.h*cell*0.55,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=T.houseEdge; ctx.lineWidth=Math.max(1.4,cell*0.12); ctx.stroke();
    }
  }

  /* 房间陈设：箱子/石柱/石台/水洼，避开中心编号区 */
  const decoRnd=mulberry32(d.seed^0x3C);
  for(const r of d.rooms){
    const ds=d.descs.find(dd=>dd.id===r.id);
    if(ds&&ds.hidden) continue;
    const cx0=X(r.x)+r.w*cell/2, cy0=Y(r.y)+r.h*cell/2;
    const pw=r.w*cell, ph=r.h*cell;
    const n=1+((decoRnd()*3)|0);
    for(let k=0;k<n;k++){
      const ux = (k%2) ? 1 : -1, uy = (k<2) ? -1 : 1;
      const px = cx0 + ux*pw*0.27 + (decoRnd()-0.5)*pw*0.05;
      const py = cy0 + uy*ph*0.27 + (decoRnd()-0.5)*ph*0.05;
      if(Math.hypot(px-cx0,py-cy0) < cell*1.05) continue;
      const kind=(decoRnd()*4)|0;
      ctx.lineWidth=Math.max(1.1,cell*0.07);
      ctx.strokeStyle=T.houseEdge; ctx.fillStyle=T.lotEdge;
      if(kind===0){                       /* 箱子 */
        const s=cell*0.44;
        ctx.fillRect(px-s/2,py-s/2,s,s); ctx.strokeRect(px-s/2,py-s/2,s,s);
        ctx.beginPath(); ctx.moveTo(px-s/2,py); ctx.lineTo(px+s/2,py); ctx.stroke();
      }else if(kind===1){                 /* 石柱 */
        const rr2=cell*0.24;
        ctx.beginPath(); ctx.arc(px,py,rr2,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(px,py,rr2*0.42,0,Math.PI*2); ctx.stroke();
      }else if(kind===2){                 /* 石台 */
        const s=cell*0.52;
        ctx.strokeRect(px-s/2,py-s/2,s,s);
        ctx.beginPath();
        ctx.moveTo(px-s*0.28,py); ctx.lineTo(px+s*0.28,py);
        ctx.moveTo(px,py-s*0.28); ctx.lineTo(px,py+s*0.28); ctx.stroke();
      }else{                              /* 水洼 */
        ctx.fillStyle="rgba(110,150,170,0.45)";
        ctx.beginPath(); ctx.ellipse(px,py,cell*0.30,cell*0.20,decoRnd()*3,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle="rgba(70,100,120,0.75)"; ctx.stroke();
      }
    }
  }
  /* 入口 / 出口标注（房间中心下方；文字过长会溢出小房间，用单字） */
  for(const mk of [{r:d.entryRoom,t:"入"},{r:d.exitRoom,t:"出"}]){
    if(!mk.r) continue;
    const px=X(mk.r.x)+mk.r.w*cell/2, py=Y(mk.r.y)+mk.r.h*cell/2;
    ctx.fillStyle=T.poi; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.font=`bold ${Math.round(cell*0.46)}px ${F}`;
    ctx.fillText(mk.t, px, py+cell*1.15);
  }

  /* 房间编号与隐藏遮盖 */
  ctx.fillStyle=T.label; ctx.textAlign="center"; ctx.textBaseline="middle";
  for(const r of d.rooms){
    const ds=d.descs.find(dd=>dd.id===r.id);
    if(ds&&ds.hidden){
      ctx.fillStyle=T.paper;
      ctx.fillRect(X(r.x),Y(r.y),r.w*cell,r.h*cell);
      ctx.font=`bold ${Math.round(cell*0.75)}px ${F}`;
      ctx.fillText("?",X(r.x)+r.w*cell/2,Y(r.y)+r.h*cell/2);
      continue;
    }
    ctx.font=`bold ${Math.round(cell*0.75)}px ${F}`;
    ctx.fillText(r.id, X(r.x)+r.w*cell/2, Y(r.y)+r.h*cell/2);
  }
  /* 图名与描述列表（底部两栏） */
  drawTextSpacedWorld(ctx,d.name,W/2,66,`42px ${F}`,10,T.title);
  ctx.font=`${PX(9)}px ${F}`; ctx.fillStyle=T.sub; ctx.textAlign="center";
  ctx.fillText("种子 "+d.seed,W/2,168);

  /* 房间图例：编号 + 类型（长描述放点击弹窗，不铺在图上，手机根本读不了） */
  const listY=H-206;
  ctx.strokeStyle=T.houseEdge; ctx.lineWidth=2; ctx.globalAlpha=0.45;
  ctx.beginPath(); ctx.moveTo(70,listY-58); ctx.lineTo(W-70,listY-58); ctx.stroke();
  ctx.globalAlpha=1;
  ctx.font=`${PX(10)}px ${F}`; ctx.textAlign="left"; ctx.textBaseline="alphabetic";
  const cols=4, colW=(W-160)/cols;
  d.descs.forEach((ds,i)=>{
    const cx0=80+(i%cols)*colW, cy0=listY+Math.floor(i/cols)*64;
    if(cy0>H-56) return;
    ctx.fillStyle=T.title;
    ctx.fillText(ds.id+" "+(ds.type||"房间")+(ds.secret?"·密":"")+(ds.boss?"·主":""), cx0, cy0);
  });

  drawFrame(ctx,W,H,T.houseEdge,T.sub);
}


/* ============================================================
 * 村庄生成器 —— 沿主路疏朗村落 + 田地/水井/大树
 * ============================================================ */
function generateVillage(seedNum, opts){
  const rnd=mulberry32(seedNum);
  const v={seed:seedNum,opts,houses:[],fields:[],trees:[],well:null,name:""};
  const cx=W/2, cy=H/2+40;
  /* 主路：弯折穿过村中心（横跨画布 8%~92%，之前只到 ±420 导致两端大片空白） */
  const ang=(rnd()*1.2-0.6)+Math.PI/2*(rnd()<0.5?0:1);
  const pts=[{x:cx-620,y:cy+300},{x:cx-210,y:cy-150},{x:cx+110,y:cy+70},{x:cx+620,y:cy-280}];
  v.road=pts;
  /* 院落式布局：一院 = 主屋（朝路）+ 两侧厢房 + 院墙 + 院门 + 院内小径
     散点房屋看不出村子，院墙和院子才是村落的辨识特征 */
  const toWorld=(ox,oy,rot,u,vv)=>({
    x: ox+u*Math.cos(rot)-vv*Math.sin(rot),
    y: oy+u*Math.sin(rot)+vv*Math.cos(rot)
  });
  v.courtyards=[];
  /* 院落数：默认 55 档 ≈ 老版本的 6~9 院；太多塞不下，封顶 12 */
  const nYard=Math.max(2, Math.min(12, Math.round((opts.yards===undefined?55:opts.yards)*0.1)+2 + ((rnd()*2)|0)));
  for(let k=0;k<nYard;k++){
    let done=false;
    for(let tryN=0;tryN<10 && !done;tryN++){
      const seg=(rnd()*(pts.length-1))|0;
      const t=0.10+rnd()*0.80;
      const a=pts[seg],b=pts[seg+1];
      const px=a.x+(b.x-a.x)*t, py=a.y+(b.y-a.y)*t;
      const dx=b.x-a.x,dy=b.y-a.y;
      const rot=Math.atan2(dy,dx);
      const side=rnd()<0.5?1:-1;
      const yw=205+rnd()*75, yh=185+rnd()*75;   /* 院外框：yw 沿路，yh 进深 */
      const c=toWorld(px,py,rot,0,side*(52+yh/2));
      let tooClose=false;
      for(const q of v.courtyards){ if(Math.hypot(q.x-c.x,q.y-c.y)<(yw+yh)*0.58){ tooClose=true; break; } }
      if(tooClose) continue;
      const yard={x:c.x,y:c.y,w:yw,h:yh,rot,side};
      const addHouse=(u,vv,hw,hh,rr,kind,sd)=>{
        const p=toWorld(c.x,c.y,rot,u,vv);
        const hs={x:p.x-hw/2,y:p.y-hh/2,w:hw,h:hh,rot:rr,kind,side:sd};
        v.houses.push(hs);
      };
      /* 主屋：院最里侧，正面朝路 */
      addHouse(0, side*(yh/2-40), 112+rnd()*46, 60+rnd()*14, rot, "main", side);
      /* 左右厢房：长边垂直道路 */
      const nSide=2;
      for(let s=0;s<nSide;s++){
        const uu=(s?1:-1)*(yw/2-38);
        if(rnd()<0.22) continue;               /* 偶尔缺一间，不至于每个院长得一样 */
        addHouse(uu, side*(yh*0.14), 58+rnd()*26, 92+rnd()*34, rot+Math.PI/2, "side");
      }
      /* 柴房/偏屋：院内靠外侧一角 */
      if(rnd()<0.6) addHouse(-(yw/2-34), side*(-yh*0.22), 54+rnd()*18, 50+rnd()*18, rot, "shed");
      v.courtyards.push(yard);
      done=true;
    }
  }
  /* 散屋（远离主路少量，避让已有房屋） */
  for(let i=0;i<10;i++){
    for(let tryN=0;tryN<6;tryN++){
      const x=cx+(rnd()*2-1)*W*0.44, y=cy+(rnd()*2-1)*H*0.40;
      let tooClose=false;
      for(const q of v.houses){ if(Math.hypot(q.x+q.w/2-x,q.y+q.h/2-y)<120){ tooClose=true; break; } }
      if(tooClose) continue;
      v.houses.push({x,y,w:46+rnd()*34,h:38+rnd()*22,rot:rnd()*3,kind:"shed"});
      break;
    }
  }
  /* 田地：默认 55 档 ≈ 老版本的 2~4 块 */
  const fN=Math.max(1, Math.round((opts.fields===undefined?55:opts.fields)*0.055) + ((rnd()*2)|0));
  for(let i=0;i<fN;i++){
    const side=(rnd()*4)|0;
    let x,y;
    if(side===0){x=cx-W*0.42;y=cy+(rnd()*2-1)*H*0.25;}
    else if(side===1){x=cx+W*0.25;y=cy+(rnd()*2-1)*H*0.25;}
    else if(side===2){x=cx+(rnd()*2-1)*W*0.3;y=cy-H*0.36;}
    else{x=cx+(rnd()*2-1)*W*0.3;y=cy+H*0.22;}
    v.fields.push({x,y,w:210+rnd()*200,h:140+rnd()*140,rot:(rnd()*2-1)*0.2});
  }
  /* 大树 3~8 丛（避开房屋，村口树才有样子） */
  const tN=5+((rnd()*5)|0);
  for(let i=0;i<tN;i++){
    for(let tryN=0;tryN<5;tryN++){
      const x=cx+(rnd()*2-1)*W*0.40,y=cy+(rnd()*2-1)*H*0.38;
      let tooClose=false;
      for(const q of v.houses){ if(Math.hypot(q.x+q.w/2-x,q.y+q.h/2-y)<120){ tooClose=true; break; } }
      if(tooClose) continue;
      v.trees.push({x,y,r:17+rnd()*14});
      break;
    }
  }
  /* 水井（中心，可关） */
  if(v.opts.well!==false) v.well={x:cx+(rnd()*60-30),y:cy+(rnd()*40-20)};
  v.name=cityName(rnd,opts.style,"village");
  return v;
}

function renderVillageContent(v, transparent){
  const ctx=APP_CTX;
  const T=THEMES[v.opts.style]||THEMES.wuxia, F=FONT_STACK[T.font];
  if(!transparent){
    ctx.fillStyle=T.paper; ctx.fillRect(0,0,W,H);
    const rnd=mulberry32(v.seed^0xAA);
    if(!FAST){ ctx.fillStyle=T.old;
      for(let i=0;i<500;i++) ctx.fillRect(rnd()*W,rnd()*H,rnd()*1.5,rnd()*1.5); }
    ctx.strokeStyle=T.grid; ctx.lineWidth=1;
    for(let x=70;x<W;x+=140){ ctx.beginPath(); ctx.moveTo(x,40); ctx.lineTo(x,H-40); ctx.stroke(); }
    for(let y=70;y<H;y+=140){ ctx.beginPath(); ctx.moveTo(40,y); ctx.lineTo(W-40,y); ctx.stroke(); }
  }
  /* 田地 */
  for(const f of v.fields){
    ctx.save(); ctx.translate(f.x+f.w/2,f.y+f.h/2); ctx.rotate(f.rot);
    ctx.fillStyle=T.green; ctx.fillRect(-f.w/2,-f.h/2,f.w,f.h);
    ctx.strokeStyle=T.lotEdge; ctx.lineWidth=3; ctx.strokeRect(-f.w/2,-f.h/2,f.w,f.h);
    ctx.lineWidth=2;
    for(let x=-f.w/2+21;x<f.w/2;x+=31){
      ctx.beginPath(); ctx.moveTo(x,-f.h/2); ctx.lineTo(x,f.h/2); ctx.stroke();
    }
    ctx.restore();
  }
  /* 院落地坪（半透明夯土色，压在路之前画） */
  for(const y of (v.courtyards||[])){
    ctx.save(); ctx.translate(y.x,y.y); ctx.rotate(y.rot);
    ctx.globalAlpha=0.55; ctx.fillStyle=T.old;
    ctx.fillRect(-y.w/2,-y.h/2,y.w,y.h);
    ctx.globalAlpha=1;
    ctx.restore();
  }
  /* 主路 */
  ctx.strokeStyle=T.roadExt; ctx.lineWidth=46; ctx.lineCap="round"; ctx.lineJoin="round";
  ctx.beginPath();
  v.road.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.stroke();
  /* 路肩细线，让路和地面分开 */
  ctx.strokeStyle=T.lotEdge; ctx.lineWidth=2;
  ctx.beginPath();
  v.road.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.stroke();
  /* 院墙 + 院门 + 院内小径（先画墙，房屋压在上层） */
  for(const y of (v.courtyards||[])){
    ctx.save(); ctx.translate(y.x,y.y); ctx.rotate(y.rot);
    const hw=y.w/2, hh=y.h/2, gap=54;
    const fy = y.side>0 ? -hh : hh;         /* 靠路那一侧 */
    const by = -fy;                         /* 后墙 */
    const inward = y.side>0 ? 20 : -20;
    /* 院内小径：院门 → 主屋 */
    ctx.strokeStyle=T.roadExt; ctx.lineWidth=16; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(0,fy); ctx.lineTo(0,by*0.70); ctx.stroke();
    /* 三面院墙 + 靠路一侧留门洞 */
    ctx.strokeStyle=T.houseEdge; ctx.lineWidth=5;
    ctx.beginPath();
    ctx.moveTo(-hw,by); ctx.lineTo(-hw,fy);
    ctx.moveTo(hw,by); ctx.lineTo(hw,fy);
    ctx.moveTo(-hw,by); ctx.lineTo(hw,by);
    ctx.moveTo(-hw,fy); ctx.lineTo(-gap,fy);
    ctx.moveTo(gap,fy);  ctx.lineTo(hw,fy);
    ctx.stroke();
    /* 门柱 */
    ctx.lineWidth=7; ctx.strokeStyle=T.wall||T.houseEdge;
    ctx.beginPath();
    ctx.moveTo(-gap,fy); ctx.lineTo(-gap,fy+inward);
    ctx.moveTo(gap,fy);  ctx.lineTo(gap,fy+inward);
    ctx.stroke();
    ctx.restore();
  }
  /* 房屋（加一道屋脊线，避免一片纯色方块） */
  for(const h of v.houses){
    ctx.save(); ctx.translate(h.x+h.w/2,h.y+h.h/2); ctx.rotate(h.rot);
    ctx.fillStyle=T.house;
    ctx.strokeStyle=T.houseEdge; ctx.lineWidth=3;
    ctx.fillRect(-h.w/2,-h.h/2,h.w,h.h);
    ctx.strokeRect(-h.w/2,-h.h/2,h.w,h.h);
    ctx.beginPath();
    if(h.w>=h.h){ ctx.moveTo(-h.w/2,0); ctx.lineTo(h.w/2,0); }
    else { ctx.moveTo(0,-h.h/2); ctx.lineTo(0,h.h/2); }
    ctx.lineWidth=2; ctx.stroke();
    /* 主屋正面开门洞（朝院门那一侧） */
    if(h.kind==="main" && h.side){
      const sgn = h.side>0 ? 1 : -1;
      ctx.strokeStyle=T.houseEdge; ctx.lineWidth=6;
      ctx.beginPath();
      ctx.moveTo(-16, sgn*h.h/2); ctx.lineTo(16, sgn*h.h/2);
      ctx.stroke();
    }
    ctx.restore();
  }
  /* 树 */
  for(const t of v.trees){
    ctx.fillStyle=T.tree;
    ctx.beginPath(); ctx.arc(t.x,t.y,t.r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=T.tree; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(t.x,t.y+t.r); ctx.lineTo(t.x,t.y+t.r+17); ctx.stroke();
  }
  /* 水井 */
  if(v.well){
    ctx.strokeStyle=T.wall; ctx.lineWidth=6;
    ctx.beginPath(); ctx.arc(v.well.x,v.well.y,35,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(v.well.x,v.well.y,14,0,Math.PI*2); ctx.stroke();
  }
  /* 村名 */
  drawTextSpacedWorld(ctx,v.name,W/2,76,`46px ${F}`,10,T.title);
  ctx.font=`${PX(9)}px ${F}`; ctx.fillStyle=T.sub; ctx.textAlign="center";
  ctx.fillText("种子 "+v.seed,W/2,168);
  drawFrame(ctx,W,H,T.houseEdge,T.sub);
}

/* ============================================================
 * 迷宫生成器 —— 递归回溯 + 环路 + 大厅点缀
 * ============================================================ */
function generateMaze(seedNum, opts){
  const rnd=mulberry32(seedNum);
  /* 尺寸：默认 55 档 = 25×25（跟老版本一致），保持奇数便于 2 格间隔打通 */
  let gsz=19+Math.round((opts.msize===undefined?55:opts.msize)*0.11);
  if(gsz%2===0) gsz++;
  gsz=Math.max(15, Math.min(33, gsz));
  const GW=gsz, GH=gsz;
  const grid=Array.from({length:GH},()=>new Array(GW).fill(0)); // 0墙 1地
  const visited=Array.from({length:GH},()=>new Array(GW).fill(false));
  function carve(x,y){
    visited[y][x]=true; grid[y][x]=1;
    const dirs=[[0,-2],[2,0],[0,2],[-2,0]].sort(()=>rnd()-0.5);
    for(const [dx,dy] of dirs){
      const nx=x+dx,ny=y+dy;
      if(nx>0&&ny>0&&nx<GW-1&&ny<GH-1&&!visited[ny][nx]){
        grid[y+dy/2][x+dx/2]=1;
        carve(nx,ny);
      }
    }
  }
  carve(1,1);
  /* 拆墙形成环路：默认 55 档 ≈ 12 条，跟老版本 10~17 条的中位一致 */
  const loopN=Math.max(0, Math.round((opts.loops===undefined?55:opts.loops)*0.22));
  for(let i=0;i<loopN;i++){
    const x=1+((rnd()*(GW-2))|0), y=1+((rnd()*(GH-2))|0);
    if(grid[y][x]===0) grid[y][x]=1;
  }
  /* 大厅：默认开，2~3 个；关掉就是纯通道迷宫 */
  const halls=[];
  const hN = opts.hall===false ? 0 : (2+((rnd()*2)|0));
  for(let i=0;i<hN;i++){
    const w=3+((rnd()*2)|0),h=3+((rnd()*2)|0);
    const x=2+((rnd()*(GW-w-4))|0),y=2+((rnd()*(GH-h-4))|0);
    for(let j=y;j<y+h;j++) for(let k=x;k<x+w;k++) grid[j][k]=1;
    halls.push({x,y,w,h});
  }
  /* 入口/出口：BFS 找最远可达格，并在边界真正开洞（原来只是在图上写两个字，迷宫本身没有门） */
  const dist=Array.from({length:GH},()=>new Array(GW).fill(-1));
  const queue=[[1,1]]; dist[1][1]=0;
  let far={x:1,y:1,d:0};
  for(let qi=0; qi<queue.length; qi++){
    const [x,y]=queue[qi];
    if(dist[y][x]>far.d) far={x,y,d:dist[y][x]};
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx, ny=y+dy;
      if(nx<0||ny<0||nx>=GW||ny>=GH) continue;
      if(!grid[ny][nx] || dist[ny][nx]>=0) continue;
      dist[ny][nx]=dist[y][x]+1; queue.push([nx,ny]);
    }
  }
  /* 入口：左上角向左打通一格 */
  grid[1][0]=1;
  const entry={x:0,y:1,dir:[1,0]};
  /* 出口：从最远点沿最近的一边打通 */
  const dl=far.x, dr=GW-1-far.x, dt=far.y, db=GH-1-far.y;
  const mn=Math.min(dl,dr,dt,db);
  let exit;
  if(mn===dl){
    for(let k=far.x;k>=0;k--) grid[far.y][k]=1;
    exit={x:0,y:far.y,dir:[1,0]};
  }else if(mn===dr){
    for(let k=far.x;k<GW;k++) grid[far.y][k]=1;
    exit={x:GW-1,y:far.y,dir:[-1,0]};
  }else if(mn===dt){
    for(let k=far.y;k>=0;k--) grid[k][far.x]=1;
    exit={x:far.x,y:0,dir:[0,1]};
  }else{
    for(let k=far.y;k<GH;k++) grid[k][far.x]=1;
    exit={x:far.x,y:GH-1,dir:[0,-1]};
  }
  return {seed:seedNum,opts,grid,halls,w:GW,h:GH,entry,exit,
    name:cityName(rnd,opts.style,"maze")};
}

function renderMazeContent(m, transparent){
  const ctx=APP_CTX;
  const T=THEMES[m.opts.style]||THEMES.wuxia, F=FONT_STACK[T.font];
  const GW=m.w,GH=m.h;
  const cell=Math.floor(Math.min((W-200)/GW,(H-240)/GH));
  const ox=(W-GW*cell)/2, oy=(H-GH*cell)/2+30;
  if(!transparent){
    ctx.fillStyle=T.paper; ctx.fillRect(0,0,W,H);
    const rnd=mulberry32(m.seed^0x99);
    if(!FAST){ ctx.fillStyle=T.old;
      for(let i=0;i<500;i++) ctx.fillRect(rnd()*W,rnd()*H,rnd()*1.4,rnd()*1.4); }
  }
  const X=i=>ox+i*cell, Y=j=>oy+j*cell;
  /* 地面 / 墙线
     逐格 fillRect 一格一次调用，44×44 的图就是上千次；
     墙线更夸张 —— 每个边界线段单独 beginPath+stroke，又是近千次。
     格子和墙段各攒成一条 path，各画一次。 */
  ctx.fillStyle=T.lot;
  ctx.beginPath();
  for(let j=0;j<GH;j++) for(let i=0;i<GW;i++)
    if(m.grid[j][i]) ctx.rect(X(i),Y(j),cell,cell);
  ctx.fill();
  ctx.strokeStyle=T.houseEdge; ctx.lineWidth=Math.max(1.6,cell*0.14);
  ctx.beginPath();
  for(let j=0;j<GH;j++) for(let i=0;i<GW;i++){
    if(m.grid[j][i]===0) continue;
    const up    = j===0      || m.grid[j-1][i]===0;
    const down  = j===GH-1   || m.grid[j+1][i]===0;
    const left  = i===0      || m.grid[j][i-1]===0;
    const right = i===GW-1   || m.grid[j][i+1]===0;
    const px=X(i), py=Y(j);
    if(up){ ctx.moveTo(px,py); ctx.lineTo(px+cell,py); }
    if(down){ ctx.moveTo(px,py+cell); ctx.lineTo(px+cell,py+cell); }
    if(left){ ctx.moveTo(px,py); ctx.lineTo(px,py+cell); }
    if(right){ ctx.moveTo(px+cell,py); ctx.lineTo(px+cell,py+cell); }
  }
  ctx.stroke();
  /* 大厅描边 */
  ctx.strokeStyle=T.poi; ctx.lineWidth=2;
  for(const h of m.halls) ctx.strokeRect(X(h.x)+2,Y(h.y)+2,h.w*cell-4,h.h*cell-4);
  /* 起终点：箭头 + 文字（入口/出口已在生成时真的开洞，这里只做标注） */
  const gate=(g,label)=>{
    if(!g) return;
    const gx=X(g.x)+cell/2, gy=Y(g.y)+cell/2;
    const dx=g.dir[0], dy=g.dir[1];
    const px=-dy, py=dx;                    /* 垂直方向，用来画箭头两翼 */
    const tx=gx+dx*cell*1.05, ty=gy+dy*cell*1.05;
    ctx.strokeStyle=T.poi; ctx.lineWidth=Math.max(4,cell*0.20); ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(gx+dx*cell*0.05, gy+dy*cell*0.05); ctx.lineTo(tx,ty); ctx.stroke();
    ctx.fillStyle=T.poi;
    ctx.beginPath();
    ctx.moveTo(tx+dx*cell*0.22, ty+dy*cell*0.22);
    ctx.lineTo(tx-dx*cell*0.34+px*cell*0.30, ty-dy*cell*0.34+py*cell*0.30);
    ctx.lineTo(tx-dx*cell*0.34-px*cell*0.30, ty-dy*cell*0.34-py*cell*0.30);
    ctx.closePath(); ctx.fill();
    ctx.font=`bold ${Math.round(cell*0.82)}px ${F}`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(label, gx+dx*cell*1.45+px*cell*0.85, gy+dy*cell*1.45+py*cell*0.85);
  };
  gate(m.entry,"入");
  gate(m.exit,"出");
  /* 图名 */
  drawTextSpacedWorld(ctx,m.name,W/2,66,`42px ${F}`,10,T.title);
  ctx.font=`${PX(9)}px ${F}`; ctx.fillStyle=T.sub; ctx.textAlign="center";
  ctx.fillText("种子 "+m.seed,W/2,168);
  drawFrame(ctx,W,H,T.houseEdge,T.sub);
}

/* ============================================================
 * 科幻星图模式 —— 崩铁式：恒星系 + 行星轨道 + 跃迁航线 + 全息UI
 * ============================================================ */
const SCI_LEX = {
  arm:["天鹅","天鹰","猎户","仙女","曙光","银心","幽蓝","鎏金"],
  code:["α","β","γ","δ","K","X","Θ","Σ"],
  star:["曦和","烛阴","望舒","北辰","曜灵","羲和","玄晖","长庚"],
  planet:["新曙","凛冬","熔核","翠微","绛紫","雾森","铁壤","汐潮","苍岩","荧惑","澄海","磐石"],
  kind:["殖民都","星港","前哨","采矿站","研究站","船坞","哨站","环轨站","废墟站"]
};

function generateSciFiWorld(seedNum, opts){
  const rnd=mulberry32(seedNum);
  const terra=0.3+(opts.terra||55)*0.007;
  const w={seed:seedNum, opts, stars:[], nebulas:[], orbits:[], planets:[],
           belts:[], links:[], name:""};
  const cx=W/2+(rnd()*120-60), cy=H/2+30+(rnd()*60-30);
  w.cx=cx; w.cy=cy;
  for(let i=0;i<300;i++) w.stars.push({x:rnd()*W,y:rnd()*H,r:0.4+rnd()*1.2,tw:rnd()<0.25});
  const nebN=1+Math.round(terra*3);
  for(let i=0;i<nebN;i++)
    w.nebulas.push({x:rnd()*W, y:rnd()*H, r:180+rnd()*230,
                    c: rnd()<0.5?"150,100,255":"80,200,220"});
  const orbN=2+Math.round(terra*2);                 // 2~4 条轨道
  const R0=140+rnd()*50;
  for(let i=0;i<orbN;i++){
    const R=R0+i*(95+rnd()*55);
    w.orbits.push({R});
    if(rnd()<0.3){                                   // 小行星带
      const rocks=[], n=40+((rnd()*30)|0);
      for(let k=0;k<n;k++){
        const a=rnd()*6.28, rr=R+(rnd()*2-1)*24;
        rocks.push({x:cx+Math.cos(a)*rr, y:cy+Math.sin(a)*rr*0.94, r:0.8+rnd()*2.2});
      }
      w.belts.push({rocks});
    }else{
      const nP=1+((rnd()*2)|0);
      for(let k=0;k<nP;k++){
        const a=rnd()*6.28, gas=rnd()<0.4;
        w.planets.push({
          x:cx+Math.cos(a)*R, y:cy+Math.sin(a)*R*0.94,
          R, a, gas,
          r: gas? 18+rnd()*9 : 10+rnd()*7,
          ring: false,
          moons: gas? 0 : ((rnd()*2)|0)
        });
      }
    }
  }
  // 行星环（气态概率带环）
  for(const p of w.planets) if(p.gas && rnd()<0.6) p.ring=true;
  // 命名与类型
  w.starName=pick(rnd,SCI_LEX.star);
  w.name=pick(rnd,SCI_LEX.arm)+"-"+pick(rnd,SCI_LEX.code)+(2+((rnd()*8)|0));
  w.planets.forEach((p,i)=>{
    p.name=pick(rnd,SCI_LEX.planet)+(p.gas?"·气态":"");
    p.kind = i===0 ? "殖民都" : pick(rnd,SCI_LEX.kind);
  });
  // 航线：相邻轨道之间
  const byOrbit={};
  for(const p of w.planets){ (byOrbit[p.R]=byOrbit[p.R]||[]).push(p); }
  const Rs=Object.keys(byOrbit).map(Number).sort((a,b)=>a-b);
  for(let i=0;i<Rs.length-1;i++)
    for(const a of byOrbit[Rs[i]])
      for(const b of byOrbit[Rs[i+1]])
        if(rnd()<0.65) w.links.push({a,b});
  return w;
}

function renderSciFiContent(w, transparent){
  const ctx=APP_CTX;
  const TAU=Math.PI*2, F=FONT_STACK.SciMono;
  const rnd=mulberry32(w.seed^0xBEEF);

  if(!transparent){ ctx.fillStyle="#060913"; ctx.fillRect(0,0,W,H); }

  /* 星云 */
  for(const n of w.nebulas){
    const g=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r);
    g.addColorStop(0,`rgba(${n.c},0.10)`);
    g.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,TAU); ctx.fill();
  }
  /* 星点 */
  for(const st of w.stars){
    ctx.fillStyle= st.tw? "rgba(190,230,255,0.95)" : "rgba(220,228,255,0.7)";
    ctx.beginPath(); ctx.arc(st.x,st.y,st.r,0,TAU); ctx.fill();
    if(st.tw){
      ctx.strokeStyle="rgba(190,230,255,0.5)"; ctx.lineWidth=0.8;
      ctx.beginPath(); ctx.moveTo(st.x-st.r*3,st.y); ctx.lineTo(st.x+st.r*3,st.y);
      ctx.moveTo(st.x,st.y-st.r*3); ctx.lineTo(st.x,st.y+st.r*3); ctx.stroke();
    }
  }
  /* 轨道环 */
  ctx.strokeStyle="rgba(140,180,255,0.22)"; ctx.lineWidth=1; ctx.setLineDash([3,9]);
  for(const o of w.orbits){ ctx.beginPath(); ctx.arc(w.cx,w.cy,o.R,0,TAU); ctx.stroke(); }
  ctx.setLineDash([]);
  /* 小行星带 */
  ctx.fillStyle="rgba(160,175,200,0.75)";
  for(const b of w.belts) for(const r of b.rocks){ ctx.beginPath(); ctx.arc(r.x,r.y,r.r,0,TAU); ctx.fill(); }

  /* 航线（发光跃迁通道） */
  ctx.strokeStyle="rgba(87,240,228,0.9)"; ctx.lineWidth=1.6;
  ctx.shadowColor="rgba(87,240,228,0.9)"; ctx.shadowBlur=10;
  ctx.setLineDash([12,7]);
  for(const lk of w.links){
    const mx=(lk.a.x+lk.b.x)/2, my=(lk.a.y+lk.b.y)/2;
    const dx=lk.b.x-lk.a.x, dy=lk.b.y-lk.a.y, dl=Math.hypot(dx,dy)||1;
    const off=(rnd()*2-1)*Math.min(60,dl*0.3);
    ctx.beginPath(); ctx.moveTo(lk.a.x,lk.a.y);
    ctx.quadraticCurveTo(mx-dy/dl*off, my+dx/dl*off, lk.b.x, lk.b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]); ctx.shadowBlur=0;

  /* 恒星 */
  ctx.shadowColor="rgba(255,220,140,0.95)"; ctx.shadowBlur=46;
  ctx.fillStyle="#FFE9B8"; ctx.beginPath(); ctx.arc(w.cx,w.cy,15,0,TAU); ctx.fill();
  ctx.shadowBlur=0;
  ctx.strokeStyle="rgba(255,220,140,0.5)"; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.arc(w.cx,w.cy,26,0,TAU); ctx.stroke();
  ctx.font='13px '+F; ctx.fillStyle="rgba(255,230,170,0.9)"; ctx.textAlign="center";
  ctx.fillText(w.starName+" 恒星", w.cx, w.cy+44);

  /* 行星 */
  for(const p of w.planets){
    ctx.save();
    if(p.gas){ ctx.shadowColor="rgba(255,160,90,0.6)"; ctx.shadowBlur=18; ctx.fillStyle="#C98A5A"; }
    else{ ctx.shadowColor="rgba(87,200,240,0.5)"; ctx.shadowBlur=12; ctx.fillStyle="#5E7C8F"; }
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,TAU); ctx.fill();
    ctx.shadowBlur=0;
    /* 条纹 */
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,TAU); ctx.clip();
    ctx.strokeStyle= p.gas? "rgba(120,70,40,0.5)" : "rgba(30,50,60,0.45)";
    ctx.lineWidth=2;
    for(const yy of [-0.4,0.1,0.5]){
      ctx.beginPath(); ctx.moveTo(p.x-p.r,p.y+p.r*yy);
      ctx.quadraticCurveTo(p.x, p.y+p.r*yy+3, p.x+p.r, p.y+p.r*yy);
      ctx.stroke();
    }
    ctx.restore();
    /* 行星环 */
    if(p.ring){
      ctx.strokeStyle="rgba(220,200,160,0.7)"; ctx.lineWidth=2.4;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(-0.35);
      ctx.beginPath(); ctx.ellipse(0,0,p.r*1.7,p.r*0.55,0,0,TAU); ctx.stroke();
      ctx.restore();
    }
    /* 卫星 */
    if(p.moons>0){
      ctx.fillStyle="rgba(200,210,230,0.85)";
      for(let m=0;m<p.moons;m++){
        const ma=p.a+m*2.4;
        ctx.beginPath(); ctx.arc(p.x+Math.cos(ma)*(p.r+10), p.y+Math.sin(ma)*(p.r+8), 1.8, 0, TAU); ctx.fill();
      }
    }
    /* 殖民都双圈 */
    if(p.kind==="殖民都"){
      ctx.strokeStyle="#57F0E4"; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r+7,0,TAU); ctx.stroke();
    }
    /* 标注 */
    ctx.font=`${p.kind==="殖民都"?"bold ":""}${Math.round((p.kind==="殖民都"?14:12)/UI)}px ${F}`;
    ctx.fillStyle= p.kind==="殖民都"? "#7DF7EC" : "rgba(190,240,255,0.92)";
    ctx.textAlign="center";
    ctx.fillText(p.name+"·"+p.kind, p.x, p.y+p.r+Math.round((p.kind==="殖民都"?24:18)/UI));
    ctx.restore();
  }

  /* HUD 四角 */
  ctx.strokeStyle="rgba(87,240,228,0.4)"; ctx.lineWidth=1.6;
  const L=46;
  for(const [hx,hy,dx,dy] of [[26,26,1,1],[W-26,26,-1,1],[26,H-26,1,-1],[W-26,H-26,-1,-1]]){
    ctx.beginPath(); ctx.moveTo(hx+dx*L,hy); ctx.lineTo(hx,hy); ctx.lineTo(hx,hy+dy*L); ctx.stroke();
  }
  /* 标题 */
  ctx.shadowColor="rgba(87,240,228,0.9)"; ctx.shadowBlur=16;
  ctx.font='30px '+F; ctx.fillStyle="#7DF7EC"; ctx.textAlign="center";
  ctx.fillText(w.name+" · 星区航图", W/2, 62);
  ctx.shadowBlur=0;
  ctx.font='12px '+F; ctx.fillStyle="rgba(140,205,205,0.7)";
  ctx.fillText("SECTOR CHART // SEED "+w.seed, W/2, 88);

  /* 方位标 */
  const rx=W-110, ry=H-130;
  ctx.strokeStyle="#57F0E4"; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.arc(rx,ry,28,0,TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rx,ry-20); ctx.lineTo(rx+6,ry); ctx.lineTo(rx,ry+16);
  ctx.moveTo(rx-6,ry); ctx.lineTo(rx+6,ry); ctx.stroke();
  ctx.font='12px '+F; ctx.fillStyle="#7DF7EC"; ctx.fillText("N", rx, ry-36);
  drawFrame(ctx,W,H,"rgba(87,240,228,0.8)","rgba(87,240,228,0.35)");
}

function renderCitySelection(ctx){
  if(!SELECTED) return;
  const T=THEMES[STATE.opts.style]||THEMES.wuxia;
  ctx.strokeStyle=T.poi; ctx.lineWidth=2; ctx.setLineDash([6,4]);
  if(SELECTED.kind==="poi"){
    ctx.beginPath(); ctx.arc(SELECTED.ref.x,SELECTED.ref.y,16,0,Math.PI*2); ctx.stroke();
  }else if(SELECTED.kind==="lot"){
    const l=SELECTED.ref;
    ctx.strokeRect(l.x+2,l.y+2,l.w-4,l.h-4);
  }else if(SELECTED.kind==="house"){
    const l=SELECTED.ref;
    ctx.strokeRect(l.x+2,l.y+2,l.w-4,l.h-4);
  }
  ctx.setLineDash([]);
}

function cellScale(){
  const GW=STATE.w||44, GH=STATE.h||44;
  /* 必须和 renderDungeonContent 里的地图区一模一样：那边是 mapTop=140 / mapBot=H-240，
     格子大小和原点都按这块区域算。原来这里用的是「(H-240)/GH + 整体居中」，
     两套尺子差了 cell 4 像素、原点 y 差 12 —— 屏幕上看着点在房间里，hitTest 却算到别处。
     cell 只差 4 也不致命，但加上原点偏移，靠边的房间就会点空（实测 13 间里 5 间点不中）。 */
  const mapTop=140, mapBot=H-240;
  const cw=Math.floor(Math.min((W-200)/GW,(mapBot-mapTop)/GH));
  return {cw, ox:(W-GW*cw)/2, oy:mapTop+Math.floor((mapBot-mapTop-GH*cw)/2)};
}
function renderDungeonSelection(ctx){
  if(!SELECTED||SELECTED.kind!=="room") return;
  const r=SELECTED.ref, c=cellScale();
  const T=THEMES[STATE.opts.style]||THEMES.wuxia;
  ctx.strokeStyle=T.poi; ctx.lineWidth=2; ctx.setLineDash([6,4]);
  ctx.strokeRect(c.ox+r.x*c.cw+2, c.oy+r.y*c.cw+2, r.w*c.cw-4, r.h*c.cw-4);
  ctx.setLineDash([]);
}
function renderWorldSelection(ctx){
  if(!SELECTED||SELECTED.kind!=="node") return;
  const WT=WORLD_THEMES[STATE.opts.style]||WORLD_THEMES.wuxia;
  ctx.strokeStyle=WT.poi; ctx.lineWidth=2; ctx.setLineDash([6,4]);
  ctx.beginPath(); ctx.arc(SELECTED.ref.x,SELECTED.ref.y,24,0,Math.PI*2); ctx.stroke();
  ctx.setLineDash([]);
}

function renderSciFiSelection(ctx){
  if(!SELECTED||SELECTED.kind!=="planet") return;
  const p=SELECTED.ref;
  ctx.strokeStyle="#57F0E4"; ctx.lineWidth=1.6; ctx.setLineDash([5,4]);
  ctx.beginPath(); ctx.arc(p.x,p.y,p.r+14,0,Math.PI*2); ctx.stroke();
  ctx.setLineDash([]);
}


/* ============================================================
 * 属性编辑 —— 能改什么，写死在这张表里
 * ------------------------------------------------------------
 * 所有元素只认四个通用属性：名称 / 位置 / 大小 / 角度。
 * 表里写 false 的项，面板连那一行都不渲染 —— 不会出现
 * 「按钮点下去才弹一句不支持」，用户看见的都能改，改不了的看不见。
 * step = 方向键一次挪几个单位（世界坐标；房间是「格」）。
 * ============================================================ */
const PROP_SPEC={
  house:    {t:"房屋", name:false, size:true,  rot:true,  step:2},
  poi:      {t:"地标", name:true,  size:false, rot:false, step:2, dup:true},
  node:     {t:"据点", name:true,  size:false, rot:false, step:2, dup:true},
  planet:   {t:"行星", name:true,  size:true,  rot:false, step:2, dup:true},
  label:    {t:"批注", name:true,  size:true,  rot:false, step:2, dup:true},
  note:     {t:"批注", name:true,  size:true,  rot:false, step:2, dup:true},
  room:     {t:"房间", name:true,  size:false, rot:false, step:0},
  courtyard:{t:"院落", name:false, size:true,  rot:true,  step:2},
  field:    {t:"田地", name:false, size:true,  rot:true,  step:2},
  well:     {t:"水井", name:false, size:false, rot:false, step:2}
};
/* 名称写在不同字段上，也写死：不再靠 label→text→name→type 挨个猜 */
const NAME_FIELD={poi:"label", node:"label", planet:"name", label:"text", note:"text"};

/* 把一类元素包装成同一套读写口子：move / scale / rotate / name。
   面板只调这四个，不关心底下房子在扁平数组里、田地存的是左上角。 */
function makeEditor(h){
  const r=h.ref;
  if(!r) return null;
  if(h.kind==="house"){
    const free=h.freeIndex!==undefined;
    const arr=free ? (r.free||[])[h.freeIndex] : (r.houses&&r.houses[h.side]);
    const o=free?0:(h.index||0);
    if(!arr) return null;
    return {
      name:()=>"", setName(){},
      posText:()=>Math.round(arr[o]+arr[o+2]/2)+","+Math.round(arr[o+1]+arr[o+3]/2),
      move(dx,dy){ arr[o]+=dx; arr[o+1]+=dy; },
      sizeText:()=>Math.round(arr[o+2])+"×"+Math.round(arr[o+3]),
      scale(f){
        const cx=arr[o]+arr[o+2]/2, cy=arr[o+1]+arr[o+3]/2;
        arr[o+2]=Math.max(6,arr[o+2]*f); arr[o+3]=Math.max(6,arr[o+3]*f);
        arr[o]=cx-arr[o+2]/2; arr[o+1]=cy-arr[o+3]/2;
      },
      ang:()=>arr[o+4]||0,
      rotate(d){ arr[o+4]=(arr[o+4]||0)+d; }
    };
  }
  if(h.kind==="room"){
    const ds=(STATE.descs||[]).find(d=>d.id===r.id);
    return {
      name:()=>ds?ds.text:"", setName(v){ if(ds) ds.text=v; },
      posText:()=>r.x+","+r.y+" 格",
      move(dx,dy){ /* P0-1：关闭拖动（墙体是位图，只移标签会误导） */ },
      sizeText:()=>r.w+"×"+r.h+" 格",
      scale(f){
        const w=Math.max(1,Math.round(r.w*f)), hh=Math.max(1,Math.round(r.h*f));
        r.x=Math.round(r.cx-w/2); r.y=Math.round(r.cy-hh/2);
        r.w=w; r.h=hh; r.cx=r.x+w/2; r.cy=r.y+hh/2;
      },
      ang:()=>0, rotate(){}
    };
  }
  if(h.kind==="field"){
    /* 田地 x/y 是左上角，缩放要先把中心留住，否则地块会往右下飘 */
    return {
      name:()=>"", setName(){},
      posText:()=>Math.round(r.x+r.w/2)+","+Math.round(r.y+r.h/2),
      move(dx,dy){ r.x+=dx; r.y+=dy; },
      sizeText:()=>Math.round(r.w)+"×"+Math.round(r.h),
      scale(f){
        const cx=r.x+r.w/2, cy=r.y+r.h/2;
        r.w=Math.max(60,r.w*f); r.h=Math.max(40,r.h*f);
        r.x=cx-r.w/2; r.y=cy-r.h/2;
      },
      ang:()=>r.rot||0,
      rotate(d){ r.rot=(r.rot||0)+d; }
    };
  }
  if(h.kind==="courtyard"){
    return {
      name:()=>"", setName(){},
      posText:()=>Math.round(r.x)+","+Math.round(r.y),
      move(dx,dy){ r.x+=dx; r.y+=dy; },
      sizeText:()=>Math.round(r.w)+"×"+Math.round(r.h),
      scale(f){ r.w=Math.max(80,r.w*f); r.h=Math.max(80,r.h*f); },
      ang:()=>r.rot||0,
      rotate(d){ r.rot=(r.rot||0)+d; }
    };
  }
  if(h.kind==="planet"){
    return {
      name:()=>r.name||"", setName(v){ r.name=v; },
      posText:()=>Math.round(r.x)+","+Math.round(r.y),
      move(dx,dy){ r.x+=dx; r.y+=dy; },
      sizeText:()=>"半径 "+Math.round(r.r),
      scale(f){ r.r=Math.max(4,Math.min(90,r.r*f)); },
      ang:()=>0, rotate(){}
    };
  }
  if(h.kind==="label"||h.kind==="note"){
    return {
      name:()=>r.text||"", setName(v){ r.text=v; },
      posText:()=>Math.round(r.x)+","+Math.round(r.y),
      move(dx,dy){ r.x+=dx; r.y+=dy; },
      sizeText:()=>"字号 "+Math.round(r.size||16),
      scale(f){ r.size=Math.max(8,Math.min(72,Math.round((r.size||16)*f))); },
      ang:()=>0, rotate(){}
    };
  }
  /* 地标 / 据点 / 水井：只有名字和位置，没有尺寸和角度 */
  const nf=NAME_FIELD[h.kind];
  return {
    name:()=>nf?(r[nf]||""):"", setName(v){ if(nf) r[nf]=v; },
    posText:()=>Math.round(r.x)+","+Math.round(r.y),
    move(dx,dy){ r.x+=dx; r.y+=dy; },
    sizeText:()=>"", scale(){},
    ang:()=>0, rotate(){}
  };
}

/* ---- 编辑辅助 ---- */

function hitHouse(x,y){
  const R=10/(typeof viewScaleRef==="function"?viewScaleRef():1);
  let best=null,bd=R;
  for(const l of STATE.lots||[]){
    for(const side of ["n","s","e","w","free"]){
      const arr=l.houses[side]; if(!arr) continue;
      for(let i=0;i<arr.length;i+=5){
        const hx=arr[i]+arr[i+2]/2, hy=arr[i+1]+arr[i+3]/2;
        const d=Math.hypot(hx-x,hy-y);
        if(d<bd){ bd=d; best={kind:"house",ref:l,side,index:i}; }
      }
    }
    /* 手加的房子存在 lot.free 里（数组的数组），不查这一份就点不中也删不掉 */
    for(let i=0;i<(l.free||[]).length;i++){
      const a=l.free[i];
      const d=Math.hypot(a[0]+a[2]/2-x, a[1]+a[3]/2-y);
      if(d<bd){ bd=d; best={kind:"house",ref:l,freeIndex:i}; }
    }
  }
  return best;
}
function hitTest(x,y){
  if(!STATE) return null;
  if(MODE==="dungeon"){
    const c=cellScale();
    for(const r of STATE.rooms){
      if(x>=c.ox+r.x*c.cw && x<=c.ox+(r.x+r.w)*c.cw &&
         y>=c.oy+r.y*c.cw && y<=c.oy+(r.y+r.h)*c.cw)
        return {kind:"room",ref:r};
    }
    return null;
  }
  /* 村庄：院、田、井都能点。原来这里没有分支，切到村庄后整个画布点哪儿都选不中 ——
     不是「不好用」，是根本没有任何反应。 */
  if(MODE==="village"){
    const toLocal=(c,px,py)=>{
      const dx=px-c.x, dy=py-c.y, co=Math.cos(-(c.rot||0)), si=Math.sin(-(c.rot||0));
      return { x:dx*co-dy*si, y:dx*si+dy*co };
    };
    if(STATE.well && Math.hypot(STATE.well.x-x, STATE.well.y-y)<34) return {kind:"well",ref:STATE.well};
    /* 院子和田地会叠在一起（田常常压在院的边角）。原来院子先判就直接 return，
       点田地的正中间会选中脚下那个院子。改成取「命中面积最小的那个」——
       小块永远比大块具体，用户心里想点的就是它。 */
    let best=null, bestA=Infinity;
    for(const c of (STATE.courtyards||[])){
      const l=toLocal(c,x,y);
      if(Math.abs(l.x)<=c.w/2 && Math.abs(l.y)<=c.h/2){
        const A=c.w*c.h;
        if(A<bestA){ bestA=A; best={kind:"courtyard",ref:c}; }
      }
    }
    for(const f of (STATE.fields||[])){
      const c={x:f.x+f.w/2, y:f.y+f.h/2, rot:f.rot};
      const l=toLocal(c,x,y);
      if(Math.abs(l.x)<=f.w/2 && Math.abs(l.y)<=f.h/2){
        const A=f.w*f.h;
        if(A<bestA){ bestA=A; best={kind:"field",ref:f}; }
      }
    }
    return best;
  }
  const R=24/(typeof viewScaleRef==="function"?viewScaleRef():1);
  if(MODE==="city"){
    /* 地标/批注优先于房屋：房屋是无名小方块，且铺满整张图，
       先判房屋会导致点了地标却选中它脚下那栋房 —— 用户看不出发生了什么。 */
    for(const lb of (STATE.labels||[])) if(lb.note&&Math.hypot(lb.x-x,lb.y-y)<R) return {kind:"label",ref:lb};
    for(const p of STATE.pois) if(Math.hypot(p.x-x,p.y-y)<R) return {kind:"poi",ref:p};
    const hh=hitHouse(x,y);
    if(hh) return hh;
    for(const l of STATE.lots)
      if(x>=l.x&&x<=l.x+l.w&&y>=l.y&&y<=l.y+l.h) return {kind:"lot",ref:l};
  }else if(STATE.planets){
    for(const p of STATE.planets) if(Math.hypot(p.x-x,p.y-y)<p.r+14) return {kind:"planet",ref:p};
  }else if(STATE.nodes){
    for(const lb of (STATE.notes||[])) if(Math.hypot(lb.x-x,lb.y-y)<R*1.25) return {kind:"note",ref:lb};
    for(const n of STATE.nodes) if(Math.hypot(n.x-x,n.y-y)<30) return {kind:"node",ref:n};
  }
  return null;
}
function lotRefill(l){
  l.green=false;
  const i=STATE.greens.indexOf(l); if(i>=0) STATE.greens.splice(i,1);
  l.houses={n:[],s:[],e:[],w:[]};
  const rnd=mulberry32(STATE.seed^((l.x*7349+l.y*911)|0));
  fillLotPoly(l, rnd, 0.3+(STATE.opts.density||60)*0.0065);
}
/* 从存档对象反推它属于哪种形态。
   原来 afterRestore 只判断 lots，结果读回来的地牢/村庄/迷宫全被当成「大世界」渲染，
   画面是空的 —— 存了等于没存。 */
function modeOf(st){
  if(!st) return "city";
  if(st.lots) return "city";
  if(st.rooms) return "dungeon";
  if(st.courtyards) return "village";
  if(st.halls) return "maze";
  return "world";
}

function migrateState(st){
  if(!st||!st.lots) return st;
  for(const l of st.lots){
    if(!l.houses) continue;
    for(const side of ["n","s","e","w"]){
      const a=l.houses[side];
      if(!Array.isArray(a)) continue;
      if(a.length&&typeof a[0]==="object"){
        const flat=[];
        for(const h of a) flat.push(h.x,h.y,h.w,h.h,h.rot||0);
        l.houses[side]=flat;
      }
    }
  }
  return st;
}

/* ============================================================
 * Skill 适配层（由 tools/extract_core.js 追加，非小程序原代码）
 * 小程序靠 this.data / 触摸事件驱动这些模块级变量；skill 里由 CLI 显式设定。
 * ============================================================ */
function skillSetCtx(c){ APP_CTX = c; }
function skillSetMode(m){ MODE = m; }
function skillSetState(s){ STATE = s; }
function skillSetFast(v){ FAST = !!v; }

/** 按形态分发生成器，与小程序 rebuild() 的分支完全一致。 */
function skillBuild(seedNum, mode, opts){
  if(mode==="village") return generateVillage(seedNum, opts);
  if(mode==="maze")    return generateMaze(seedNum, opts);
  if(mode==="dungeon") return generateDungeon(seedNum, opts);
  if(mode==="city")    return generate(seedNum, opts);
  if(opts.style==="scifi") return generateSciFiWorld(seedNum, opts);
  return generateWorld(seedNum, opts);
}

/** 按形态分发绘制器，与小程序 redraw() 的分支一致（不含选中框：独立出图没有选中态）。 */
function skillRender(state, mode, transparent){
  const t = !!transparent;
  if(mode==="village")      renderVillageContent(state, t);
  else if(mode==="maze")    renderMazeContent(state, t);
  else if(mode==="dungeon") renderDungeonContent(state, t);
  else if(mode==="city")    renderCityContent(state, t);
  else if(state.planets)    renderSciFiContent(state, t);
  else                      renderWorldContent(state, t);
}

module.exports = {
  W, H, THEMES, FONT_STACK, SHOW,
  hashStr, mulberry32,
  skillSetCtx, skillSetMode, skillSetState, skillSetFast,
  skillBuild, skillRender
};
