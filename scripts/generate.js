#!/usr/bin/env node
"use strict";
/**
 * 大千境 · 奇幻地图生成器（Agent Skill CLI）
 *
 * 一行命令，从种子生成一张可缩放的 SVG 地图。零依赖，只需要 Node.js ≥ 14。
 *
 *   node scripts/generate.js --mode world --style xianxia --seed 20261105 --out map.svg
 *   node scripts/generate.js --list
 *
 * 全部参数见 --help。生成结果完全确定：同样的 seed + 参数，永远得到同一张图。
 */
const fs = require("fs");
const path = require("path");
const core = require("./core.js");
const { SvgCanvas } = require("./svg_canvas.js");

const MODES = {
  city: "城市地图（街巷 / 房屋 / 地标 / 河 / 城墙）",
  world: "大世界（大陆 / 山脉 / 河流 / 据点）",
  dungeon: "地牢（房间 / 走廊 / 机关 / Boss）",
  village: "村庄（院落 / 田地 / 水井）",
  maze: "迷宫（格状通道 / 大厅）"
};
const STYLES = {
  wuxia: "武侠风（暖黄纸本）",
  xianxia: "修仙风（青绿纸本）",
  fantasy: "西式奇幻（羊皮纸）",
  ink: "水墨风（黑白灰）",
  scifi: "科幻全息（深蓝底 + 星图）"
};

/** 与小程序 index.js 的 data 默认值一一对应，保证同种子出同一张图。 */
const DEFAULTS = {
  size: 55, density: 65, terra: 55,
  river: true, wall: false, coast: false, shanty: false, citadel: false,
  center: "none", secret: false, boss: false, water: 0,
  rooms: 55, yards: 55, fields: 55, well: true,
  msize: 55, loops: 55, hall: true,
  forest: 55, diff: 55
};
const NUM_KEYS = ["size", "density", "terra", "rooms", "yards", "fields", "msize", "loops", "forest", "diff"];
const BOOL_KEYS = ["river", "wall", "coast", "shanty", "citadel", "secret", "boss", "well", "hall"];

const HELP = `大千境 · 奇幻地图生成器

用法:
  node scripts/generate.js [参数]

必需/常用:
  --mode <名>        形态，默认 world。可选: ${Object.keys(MODES).join(" / ")}
  --style <名>       风格，默认 xianxia。可选: ${Object.keys(STYLES).join(" / ")}
  --seed <值>        种子，数字或任意文字。不给则随机，并打印所用种子
  --out <路径>       输出 SVG 路径，默认 ./daqianjing-<mode>-<seed>.svg
  --diff <0-100>     差异度：0 = 每张图轮廓接近，100 = 每次都像另一个世界（默认 55）
  --list             列出全部形态与风格后退出
  --help             显示本说明

形态专属参数（0-100，默认见 references/parameters.md）:
  --size --density --terra                 城市：街区规模 / 建筑密度 / 地形起伏
  --rooms --water                         地牢：房间数 / 水位 0=干燥 1=浅水 2=深水
  --yards --fields                        村庄：院落数 / 田地数
  --msize --loops                         迷宫：规模 / 环路多少
  --forest                                大世界：森林覆盖

开关:
  --river --wall --coast --shanty --citadel --secret --boss --well --hall
  用 --no-<名字> 关闭，例如 --no-river。默认 river/well/hall 开，其余关。
  --center <none|plaza|temple>            城市中心：无 / 广场 / 神殿

输出控制:
  --transparent      不画纸底与网格，方便叠到自己的版式里
  --json             同目录多写一份 .json，含完整地图数据（可再加工）
  --width <像素>     SVG 显示宽度，默认 1400（viewBox 恒为 1400×1400，缩放不失真）
  --quiet            不打印摘要

示例:
  node scripts/generate.js --mode world --style xianxia --seed 临渊 --out 临渊域.svg
  node scripts/generate.js --mode city --style ink --seed 42 --no-river --center temple
  node scripts/generate.js --mode dungeon --style fantasy --seed 7 --json
`;

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    if (a.startsWith("--no-")) { o[a.slice(5)] = false; continue; }
    const key = a.slice(2);
    let val = true;
    if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) val = argv[++i];
    o[key] = val;
  }
  return o;
}
const clamp = (v, lo, hi, dv) => {
  const n = +v;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dv;
};

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help || a.h) { process.stdout.write(HELP); return; }
  if (a.list) {
    console.log("形态:"); for (const [k, v] of Object.entries(MODES)) console.log("  " + k.padEnd(9) + v);
    console.log("风格:"); for (const [k, v] of Object.entries(STYLES)) console.log("  " + k.padEnd(9) + v);
    return;
  }

  const mode = String(a.mode || "world");
  const style = String(a.style || "xianxia");
  if (!MODES[mode]) { console.error("未知形态: " + mode + "（用 --list 查看）"); process.exit(2); }
  if (!STYLES[style]) { console.error("未知风格: " + style + "（用 --list 查看）"); process.exit(2); }

  // 种子：数字直接用，文字走 FNV-1a 哈希；都不给则随机，但立刻回显以便复现
  const rawSeed = a.seed === undefined ? String((Math.random() * 1e9) | 0) : String(a.seed);
  const seedNum = /^-?\d+$/.test(rawSeed) ? (Number(rawSeed) | 0) : core.hashStr(rawSeed);

  const opts = Object.assign({}, DEFAULTS, { style });
  for (const k of NUM_KEYS) if (a[k] !== undefined) opts[k] = clamp(a[k], 0, 100, DEFAULTS[k]);
  for (const k of BOOL_KEYS) if (a[k] !== undefined) opts[k] = !(a[k] === false || a[k] === "false" || a[k] === "0");
  if (a.water !== undefined) opts.water = Math.round(clamp(a.water, 0, 2, 0));
  if (a.center !== undefined) {
    const c = String(a.center);
    if (!["none", "plaza", "temple"].includes(c)) { console.error("--center 只能是 none / plaza / temple"); process.exit(2); }
    opts.center = c;
  }
  // 与小程序 currentOpts() 一致：所有 0-100 参数在唯一出口夹一次，防止手改链接式传参把生成器搞崩
  for (const k of NUM_KEYS) opts[k] = clamp(opts[k], 0, 100, DEFAULTS[k]);

  const state = core.skillBuild(seedNum, mode, opts);
  const ctx = new SvgCanvas(core.W, core.H);
  core.skillSetCtx(ctx);
  core.skillSetMode(mode);
  core.skillSetState(state);
  core.skillSetFast(false);          // 不降级：纸底做旧噪点、树点全部保留
  core.skillRender(state, mode, !!a.transparent);

  let svg = ctx.toSVG();
  const width = Math.round(clamp(a.width === undefined ? core.W : a.width, 100, 8000, core.W));
  if (width !== core.W) svg = svg.replace(/width="1400" height="1400"/, `width="${width}" height="${width}"`);
  const meta = `<!-- daqianjing-map | mode=${mode} style=${style} seed=${rawSeed}(${seedNum}) diff=${opts.diff} name=${state.name} -->\n`;
  svg = svg.replace(/^<svg /, meta + "<svg ");

  const out = path.resolve(String(a.out === undefined ? `daqianjing-${mode}-${seedNum}.svg` : a.out));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, svg, "utf8");
  if (a.json) {
    const jp = out.replace(/\.svg$/i, "") + ".json";
    fs.writeFileSync(jp, JSON.stringify({ mode, style, seed: seedNum, seedText: rawSeed, opts, state }, null, 2), "utf8");
  }

  if (!a.quiet) {
    console.log("地图名称 : " + state.name);
    console.log("形态风格 : " + mode + " / " + style);
    console.log("种子     : " + rawSeed + (String(rawSeed) === String(seedNum) ? "" : " → " + seedNum));
    console.log("输出     : " + out + " (" + (Buffer.byteLength(svg, "utf8") / 1024).toFixed(1) + " KB)");
    if (a.json) console.log("数据     : " + out.replace(/\.svg$/i, "") + ".json");
  }
}

try { main(); }
catch (e) {
  console.error("生成失败: " + (e && e.stack ? e.stack : e));
  process.exit(1);
}
