#!/usr/bin/env node
"use strict";
/**
 * 自测：5 形态 × 5 风格矩阵 + 确定性 + 透明底 + JSON 回读。
 * 不依赖任何第三方包，直接在 skill 根目录 `node scripts/selftest.js`。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const CLI = path.join(ROOT, "scripts", "generate.js");
const MODES = ["city", "world", "dungeon", "village", "maze"];
const STYLES = ["wuxia", "xianxia", "fantasy", "ink", "scifi"];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dqj-selftest-"));

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (detail ? " — " + detail : "")); }
};
const run = (args) => execFileSync(process.execPath, [CLI].concat(args), {
  cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
});
const gen = (mode, style, seed, out, extra) => {
  run(["--mode", mode, "--style", style, "--seed", String(seed), "--out", out, "--quiet"]
    .concat(extra || []));
  return fs.readFileSync(out, "utf8");
};
const validSvg = (s) =>
  s.indexOf("<svg ") >= 0 && s.trim().endsWith("</svg>") &&
  s.indexOf("<path") >= 0 &&
  s.indexOf("NaN") < 0 && s.indexOf("undefined") < 0 &&
  // 参数错位会让图标坐标全部塌成 0，这条能挡住上游那个 bug 复发
  s.indexOf("M0 0L0 0L0 0L0 0Z") < 0;

try {
  console.log("\n=== 5 形态 × 5 风格 ===");
  for (const m of MODES) {
    for (const st of STYLES) {
      const out = path.join(tmp, `${m}-${st}.svg`);
      let svg = "";
      try { svg = gen(m, st, 20261105, out); }
      catch (e) { ok(`${m}/${st} 不抛异常`, false, String(e.message).slice(0, 80)); continue; }
      ok(`${m}/${st}`, validSvg(svg) && svg.length > 20000,
        `${(svg.length / 1024).toFixed(0)}KB`);
    }
  }

  console.log("\n=== 确定性 ===");
  const a = gen("world", "xianxia", 4242, path.join(tmp, "det-a.svg"));
  const b = gen("world", "xianxia", 4242, path.join(tmp, "det-b.svg"));
  const c = gen("world", "xianxia", 4243, path.join(tmp, "det-c.svg"));
  ok("同种子同参数逐字节一致", a === b);
  ok("换种子结果不同", a !== c);
  const t1 = gen("world", "xianxia", 4242, path.join(tmp, "det-style.svg"));
  const t2 = gen("world", "ink", 4242, path.join(tmp, "det-style2.svg"));
  ok("同种子换风格只改画法（仍出图）", validSvg(t1) && validSvg(t2) && t1 !== t2);

  console.log("\n=== 输出选项 ===");
  const normal = gen("city", "wuxia", 7, path.join(tmp, "opt-normal.svg"));
  const trans = gen("city", "wuxia", 7, path.join(tmp, "opt-trans.svg"), ["--transparent"]);
  ok("--transparent 去掉纸底", normal.includes("M0 0L1400 0L1400 1400L0 1400Z") &&
    !trans.includes("M0 0L1400 0L1400 1400L0 1400Z"));
  ok("--transparent 仍画出内容", trans.includes("<path") && trans.length > 20000);

  const jp = path.join(tmp, "with-json.svg");
  gen("dungeon", "fantasy", 99, jp, ["--json"]);
  const j = JSON.parse(fs.readFileSync(jp.replace(/\.svg$/, ".json"), "utf8"));
  ok("--json 能读回形态 / 风格 / 名称",
    j.mode === "dungeon" && j.style === "fantasy" && typeof j.state.name === "string" && j.state.name.length > 0,
    JSON.stringify({ mode: j.mode, style: j.style, name: j.state && j.state.name }));

  console.log("\n=== 参数防呆 ===");
  let extreme = "";
  try { extreme = gen("city", "xianxia", 1, path.join(tmp, "extreme.svg"), ["--size", "9999", "--diff", "-50"]); }
  catch (e) { /* 下面统一判 */ }
  ok("极端参数不崩、仍出图", validSvg(extreme) && extreme.length < 3 * 1024 * 1024,
    `${(extreme.length / 1024).toFixed(0)}KB`);

  console.log("\n" + (fail ? `失败 ${fail} 项 / 共 ${pass + fail} 项` : `全部通过（${pass} 项）`));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(fail ? 1 : 0);
