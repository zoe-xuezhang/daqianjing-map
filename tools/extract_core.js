#!/usr/bin/env node
/**
 * 从「大千境」微信小程序抽取纯生成 / 绘制内核，产出 scripts/core.js。
 *
 * 用法：
 *   node tools/extract_core.js <小程序 pages/index/index.js 的路径> [输出路径]
 *
 * 判据：内核 = index.js 里「页面」分界注释（一串等号包住「页面」二字）之前的所有内容。
 * 这一段只依赖 Math / Canvas2D，不调用任何 wx.* API；页面的触摸、缩放、存档、导出
 * 全部在标记之后，属于微信运行时，不进 skill。
 *
 * 抽取后做两处最小改写：
 *   1. require("../../utils/track.js") 换成空函数（埋点是小程序侧能力，与出图无关）
 *   2. 末尾追加导出层，把模块级变量（APP_CTX / MODE / STATE / FAST）暴露成 setter
 */
"use strict";
const fs = require("fs");
const path = require("path");

const srcPath = process.argv[2];
const outPath = process.argv[3] || path.join(__dirname, "..", "scripts", "core.js");
if (!srcPath) {
  console.error("用法: node tools/extract_core.js <小程序 index.js 路径> [输出路径]");
  process.exit(2);
}

const src = fs.readFileSync(srcPath, "utf8");
const lines = src.split(/\r?\n/);
const end = lines.findIndex(l => /^\/\*\s*=+\s*页面\s*=+\s*\*\//.test(l.trim()));
if (end < 0) throw new Error("找不到「页面」分界标记，index.js 结构可能已变");

let body = lines.slice(0, end).join("\n");
const before = body;
body = body.replace(
  /const\s*\{\s*track\s*\}\s*=\s*require\(["'][^"']*utils\/track\.js["']\);/,
  "const track = function(){};  /* skill 版：不埋点 */"
);
if (body === before) throw new Error("没找到 track 的 require，抽取规则需要更新");

/* 兼容旧版源码的兜底：历史上 renderWorldContent 曾把 drawIcon 传成 6 参
 * （ctx, icon, x, y, WT, size），而定义是 5 参（ctx, icon, x, y, s），
 * s 拿到配色对象 → -s*0.2 = NaN → 大世界据点图标全部画不出来。
 * 该缺陷已于 2026-11-09 在小程序本体 index.js 同步修复，
 * 下面这段只在抽取旧版源码时才会命中，保留它以便回溯历史版本。 */
const BAD_CALL = "drawIcon(ctx, n.icon, n.x, n.y, WT, n.icon===\"capital\"?16:12);";
const FIX_CALL = "drawIcon(ctx, n.icon, n.x, n.y, n.icon===\"capital\"?16:12);  /* 参数错位已修正 */";
if (body.indexOf(BAD_CALL) >= 0) body = body.split(BAD_CALL).join(FIX_CALL);

if (/\bwx\./.test(body)) throw new Error("内核段里出现了 wx.* —— 不能作为纯 Node 模块");

const adapter = `

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
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body + adapter, "utf8");
console.log("抽取完成:", outPath);
console.log("内核行数:", end, "| 输出字节:", Buffer.byteLength(body + adapter, "utf8"));
