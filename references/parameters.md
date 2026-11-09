# 参数字典

所有数值参数在 CLI 唯一出口处夹到合法区间（0–100），与小程序 `currentOpts()` 的防呆一致：手改分享链接式的极端值（如 `size=9999`）不会把生成器拖进十几万街区的死循环。

## 全局

| 参数 | 取值 | 默认 | 说明 |
|---|---|---|---|
| `--mode` | city / world / dungeon / village / maze | `world` | 形态，决定用哪套独立生成器 |
| `--style` | wuxia / xianxia / fantasy / ink / scifi | `xianxia` | 画风，决定配色、词库、字体。**`scifi` + `world` 会切到星图生成器**（行星、航道、星点），地形与其余风格不同 |
| `--seed` | 数字或任意文字 | 随机 | 数字直接用，文字走 FNV-1a 哈希；随机时会回显种子便于复现 |
| `--diff` | 0–100 | `55` | 差异度，只影响 world / scifi：控制大陆轮廓摆幅与岛屿、山脉、河流、据点数量。0 = 每张图轮廓接近，100 = 像另一个星球 |
| `--out` | 路径 | `daqianjing-<mode>-<seed>.svg` | 输出目录不存在会自动创建 |
| `--width` | 100–8000 | `1400` | 只改 SVG 的显示宽高，`viewBox` 恒为 `0 0 1400 1400`，缩放不失真 |
| `--transparent` | 开关 | 关 | 不画纸底、做旧噪点与网格，方便叠到自己的版式里 |
| `--json` | 开关 | 关 | 同目录写 `<同名>.json`，含 `opts` 与完整 `state`（地块 / 道路 / 房间 / 节点 / 名称） |
| `--quiet` | 开关 | 关 | 不打印摘要，适合批量脚本 |

## 形态与风格

| 形态 | 画面内容 | 适合的用途 |
|---|---|---|
| `city` | 主次道路网切出街区、沿街排房、河流与桥、地标、城墙、中心广场/神殿 | 城池设定、跑团城市、小说地图插页 |
| `world` | 大陆与离岛、海波纹、山脉、河流湖泊、森林、据点与虚线连线、比例尺、指北针 | 世界观总图、章节扉页 |
| `dungeon` | 房间与走廊、门、水位、密室与 Boss 房、编号房间图例 | 跑团副本、关卡俯视图 |
| `village` | 院落、田地、水井、小路 | 小场景、起点村落 |
| `maze` | 格状通道、环路、大厅 | 迷宫关卡、解谜附图 |

| 风格 | 视觉 | 字体 |
|---|---|---|
| `wuxia` 武侠 | 暖黄纸本、墨线、朱红点缀 | 楷体 |
| `xianxia` 修仙 | 青绿纸本、淡墨山形 | 楷体 |
| `fantasy` 西式奇幻 | 羊皮纸、赭石色 | 楷体 |
| `ink` 水墨 | 黑白灰、留白多 | 楷体 |
| `scifi` 科幻全息 | 深蓝底、荧光青、星点与行星光晕 | 等宽 |

> 楷体链为 `Kaiti SC → STKaiti → KaiTi → Songti SC → serif`。Windows 未装楷体时退化成系统宋体/黑体，文字内容不变。

## 形态专属参数

参数 0–100 的语义是「滑块位置」，不是直接数量：生成器内部另有映射（例如 `rooms=55` → 约 12 个房间，`msize=55` → 约 25 格）。这样调参手感一致，也不会出现极端值把内存打爆。

| 参数 | 归属 | 默认 | 影响 |
|---|---|---|---|
| `--size` | city | 55 | 竖向/横向主干道条数 → 街区数量与规模 |
| `--density` | city | 65 | 沿街排房的填充密度 |
| `--terra` | world / scifi | 55 | 山川丰富度 |
| `--forest` | world | 55 | 森林树丛数量 |
| `--rooms` | dungeon | 55 | 房间数量（4–20） |
| `--yards` | village | 55 | 院落数量（2–12） |
| `--fields` | village | 55 | 田地数量 |
| `--msize` | maze | 55 | 迷宫格数 |
| `--loops` | maze | 55 | 环路多少（越高越不像树状迷宫） |
| `--water` | dungeon | 0 | 0 干燥 / 1 浅水 / 2 深水；**不是 0–100 滑块** |

## 开关

默认 `river`、`well`、`hall` 开，其余关。用 `--no-<名字>` 关闭，例如 `--no-river`、`--no-well`。

| 开关 | 归属 | 作用 |
|---|---|---|
| `--river` | city | 河流与桥 |
| `--wall` | city | 城墙 |
| `--coast` | city | 一侧临海 |
| `--shanty` | city | 棚户区 |
| `--citadel` | city | 城堡 |
| `--secret` | dungeon | 密室 |
| `--boss` | dungeon | Boss 房 |
| `--well` | village | 水井 |
| `--hall` | maze | 大厅 |
| `--center` | city | `none` / `plaza`（中心广场）/ `temple`（中心神殿） |

## 复现与对照

```bash
# 同一世界，换画法：地形与地名不变，只有配色和笔触变
node scripts/generate.js --seed 20261105 --style xianxia --out a.svg
node scripts/generate.js --seed 20261105 --style ink     --out b.svg

# 同一画法，换世界
node scripts/generate.js --seed 20261105 --out a.svg
node scripts/generate.js --seed 20261106 --out b.svg

# 批量出候选（PowerShell / bash 均可）
for s in 1 2 3 4 5; do node scripts/generate.js --seed $s --out "candidate-$s.svg" --quiet; done
```
