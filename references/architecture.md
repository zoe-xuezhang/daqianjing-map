# 内核来源、封装边界与已知简化

## 为什么不是「整个小程序做成 skill」

「大千境」微信小程序 `pages/index/index.js` 约 4165 行，按 `/* ================= 页面 ================= */` 一刀切成两段：

| 段 | 行数 | 依赖 | 能否搬进 Agent |
|---|---|---|---|
| 生成 + 绘制内核 | 1–2701 | 只有 `Math`、纯数据、Canvas2D 上下文 | **能** |
| 页面层 | 2702 之后 | `wx.*`（触摸、缩放、存档、导出相册、分享、广告、`setData`） | 不能 |

交互层依赖微信运行时，Agent 里没有 `wx`，也没有能触摸的画布。因此本 skill 封装的是**地图生成能力**：给定种子与参数，产出静态矢量图与可加工的 JSON，而不是一个可交互小程序。

## 目录结构

```
daqianjing-map/
├── SKILL.md                    触发条件、工作流、非目标
├── scripts/
│   ├── core.js                 从小程序抽取的纯内核（2701 行，生成 + 绘制 + 主题 + 词库）
│   ├── svg_canvas.js           Canvas2D → SVG 记录器（零依赖）
│   ├── generate.js             CLI
│   └── selftest.js             5×5 矩阵自测
├── references/
│   ├── parameters.md           参数字典
│   └── architecture.md         本文件
├── tools/
│   └── extract_core.js         从小程序重新抽取内核
├── examples/                   样例 SVG / PNG 预览
└── README.md / LICENSE
```

数据流：

```
seed + opts ──> core.skillBuild() ──> STATE（纯数据）
                                      │
                                      v
                    core.skillRender(STATE, mode) ──> SvgCanvas（记录 Canvas2D 命令）
                                                        │
                                                        v
                                                   toSVG() ──> .svg
```

## 重新抽取内核

小程序改了生成或画法后，跑一次即可同步（需要本机有小程序源码）：

```bash
node tools/extract_core.js <小程序路径>/pages/index/index.js scripts/core.js
```

抽取脚本会做三件事：

1. 截到「页面」分界标记之前；
2. 把 `require("../../utils/track.js")` 换成空函数（埋点是小程序侧能力）；
3. 末尾追加导出层，把模块级变量 `APP_CTX / MODE / STATE / FAST` 暴露成 setter，并提供与 `rebuild()` / `redraw()` 分支一致的 `skillBuild()` / `skillRender()`。

脚本带**硬校验**：内核段里只要出现 `wx.*` 就直接报错停止，避免把微信依赖偷偷带进来；找不到 `track` 的 require 也报错，提示抽取规则需要更新。

## 抽取时修正的一处上游缺陷（上游已同步修复）

`renderWorldContent` 曾调用 `drawIcon(ctx, n.icon, n.x, n.y, WT, size)` 传 6 个参数，而定义是 `drawIcon(ctx, icon, x, y, s)` 只收 5 个 —— `s` 拿到配色对象，`-s*0.2` 得到 `NaN`，Canvas 静默丢弃这些命令。后果：**大世界所有据点图标从未被画出来**，只剩文字标注；SVG 记录器把 NaN 归一成 0，据点图标全部塌成 `M0 0L0 0L0 0L0 0Z`。

第 6 个参数是旧签名残留。`tools/extract_core.js` 在抽取时把调用改成 5 参数。**2026-11-09 已在小程序本体 `index.js` 同步修复**（删掉多余的 `WT`），并补了 `render_test.js` 做几何值防回归；抽取脚本里的替换逻辑降级为「兼容旧版源码」的兜底，正常情况下不会命中。

## SVG 记录器的实现边界

`svg_canvas.js` 是一个形似 `CanvasRenderingContext2D` 的对象：赋值 `ctx.fillStyle = ...` 会落到可 `save/restore` 的状态栈上；路径坐标在添加时按当前变换矩阵展开；`fill()` / `stroke()` 时输出 SVG 元素。

覆盖的 API（严格对齐内核实际调用，不追求完整 Canvas2D）：

- 路径：`beginPath / moveTo / lineTo / quadraticCurveTo / rect / arc / ellipse / closePath`
- 绘制：`fill / stroke / fillRect / strokeRect / fillText / strokeText / clearRect`
- 状态：`save / restore / translate / rotate / scale / setTransform / setLineDash`
- 样式：`fillStyle / strokeStyle / lineWidth / lineCap / lineJoin / globalAlpha / font / textAlign / textBaseline / shadowColor / shadowBlur`
- 其它：`createRadialGradient / createLinearGradient / clip / measureText`

未实现：`drawImage / createPattern / putImageData / getImageData`。内核没有调用它们。

**已知简化**（不是 bug，改内核时要留意）：

- 阴影用 CSS `drop-shadow` 近似，不做 Canvas 那种独立高斯图层；科幻风行星光晕主要靠 `createRadialGradient`，这部分是真实的 SVG 渐变。
- `measureText` 按字号估算（CJK ≈ 1em，西文 ≈ 0.55em），只服务于「逐字排开」的标题，不影响其它文字。
- `rgba()` 拆成 `rgb()` + `*-opacity`，避免部分 SVG 渲染器不支持 CSS Color 4 语法。
- 字体走系统字体链，SVG 不内嵌字体；跨机器观感可能略有差异。

## 验收

```bash
node scripts/selftest.js
```

覆盖：5 形态 × 5 风格全部能出图、SVG 为合法 XML、同参数两次生成逐字节一致、不同种子结果不同、`--transparent` 去掉纸底、`--json` 能读回同一名称。

人工目视验收建议用 `examples/` 下的 PNG 预览；改动记录器后，把新 SVG 用浏览器打开对照即可（SVG 是文本，可直接 diff）。
