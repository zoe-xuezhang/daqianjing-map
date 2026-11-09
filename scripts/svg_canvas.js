"use strict";
/**
 * SvgCanvas —— 一个「长得像 CanvasRenderingContext2D」的 SVG 记录器。
 *
 * 目的：让按 Canvas2D API 写就的地图绘制代码（core.js）一行不改地跑在 Node 里，
 * 输出可缩放、可编辑、可直接贴进文档 / Figma / 网页的 SVG。零第三方依赖。
 *
 * 实现范围严格对齐 core.js 实际用到的 API（不追求完整 Canvas2D）：
 *   path    beginPath / moveTo / lineTo / quadraticCurveTo / rect / arc / ellipse / closePath
 *   绘制    fill / stroke / fillRect / strokeRect / fillText / strokeText / clearRect
 *   状态    save / restore / translate / rotate / setTransform / setLineDash
 *   样式    fillStyle / strokeStyle / lineWidth / lineCap / lineJoin / globalAlpha
 *           font / textAlign / textBaseline / shadowColor / shadowBlur
 *   其它    createRadialGradient / clip / measureText
 *
 * 已知简化（不影响地图主体，写在这里避免误当成 bug）：
 *   - 阴影用 CSS drop-shadow 近似，不做 canvas 那种独立高斯层；
 *   - measureText 用字号估算（CJK≈1em，西文≈0.55em），仅用于「逐字排开」的标题；
 *   - 不实现 drawImage / createPattern / createLinearGradient，内核也没调用它们。
 */
const TAU = Math.PI * 2;
const num = v => {
  const n = +v;
  if (!isFinite(n)) return 0;
  return Math.abs(n) < 1e-9 ? 0 : Math.round(n * 1000) / 1000;
};
const esc = s => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** 把 CSS 颜色拆成「颜色 + 透明度」，因为 SVG 的 rgba() 支持度不一致。 */
function splitColor(c) {
  if (c && typeof c === "object" && c.__svgGradientId) {
    return { value: `url(#${c.__svgGradientId})`, alpha: 1, gradient: c };
  }
  const s = String(c == null ? "#000" : c).trim();
  let m;
  if ((m = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i.exec(s)))
    return { value: `rgb(${m[1]},${m[2]},${m[3]})`, alpha: +m[4] };
  if ((m = /^rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i.exec(s)))
    return { value: `rgb(${m[1]},${m[2]},${m[3]})`, alpha: 1 };
  if ((m = /^#([0-9a-f]{8})$/i.exec(s)))
    return { value: `#${m[1].slice(0, 6)}`, alpha: parseInt(m[1].slice(6, 8), 16) / 255 };
  return { value: s, alpha: 1 };
}

function parseFont(font) {
  const s = String(font || "14px sans-serif");
  const m = /(?:^|\s)([\d.]+)px\s+(.+)$/i.exec(s);
  const size = m ? +m[1] : 14;
  const family = m ? m[2].trim() : "sans-serif";
  return {
    size,
    family,
    weight: /\bbold\b/i.test(s) ? "bold" : "normal",
    style: /\bitalic\b/i.test(s) ? "italic" : "normal"
  };
}

const STYLE_KEYS = [
  "fillStyle", "strokeStyle", "lineWidth", "lineCap", "lineJoin",
  "globalAlpha", "font", "textAlign", "textBaseline",
  "shadowColor", "shadowBlur", "lineDash"
];

function defaultState() {
  return {
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1,
    lineCap: "butt", lineJoin: "miter", globalAlpha: 1,
    font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic",
    shadowColor: "transparent", shadowBlur: 0, lineDash: [],
    transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  };
}
function cloneState(s) {
  const c = Object.assign({}, s);
  c.lineDash = s.lineDash.slice();
  c.transform = Object.assign({}, s.transform);
  return c;
}

class SvgCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.body = [];
    this.defs = [];
    this._uid = 0;
    this._st = defaultState();
    this._stack = [];
    this._depth = 0;
    this._path = [];
    this._clips = [];
    // 让 ctx.fillStyle = x 这类赋值真正落到可 save/restore 的状态对象上
    for (const k of STYLE_KEYS) {
      Object.defineProperty(this, k, {
        get: () => this._st[k],
        set: v => { this._st[k] = v; },
        enumerable: true, configurable: true
      });
    }
  }

  /* ---------- 变换 ---------- */
  pt(x, y) {
    const t = this._st.transform;
    return { x: t.a * x + t.c * y + t.e, y: t.b * x + t.d * y + t.f };
  }
  setTransform(a, b, c, d, e, f) {
    this._st.transform = { a, b, c, d, e, f };
  }
  translate(x, y) {
    const t = this._st.transform;
    t.e += t.a * x + t.c * y;
    t.f += t.b * x + t.d * y;
  }
  rotate(rad) {
    const t = this._st.transform, co = Math.cos(rad), si = Math.sin(rad);
    const a = t.a * co + t.c * si, b = t.b * co + t.d * si;
    const c = t.a * -si + t.c * co, d = t.b * -si + t.d * co;
    t.a = a; t.b = b; t.c = c; t.d = d;
  }
  scale(x, y) {
    const t = this._st.transform;
    t.a *= x; t.b *= x; t.c *= y; t.d *= y;
  }
  save() {
    this._stack.push(cloneState(this._st));
    this._depth++;
  }
  restore() {
    const prev = this._stack.pop();
    if (prev) this._st = prev;
    this._depth--;
    while (this._clips.length && this._clips[this._clips.length - 1].depth > this._depth) {
      this._clips.pop();
      this.body.push("</g>");
    }
  }

  /* ---------- 路径 ---------- */
  beginPath() { this._path = []; }
  moveTo(x, y) { const p = this.pt(x, y); this._path.push(`M${num(p.x)} ${num(p.y)}`); }
  lineTo(x, y) { const p = this.pt(x, y); this._path.push(`L${num(p.x)} ${num(p.y)}`); }
  quadraticCurveTo(cx, cy, x, y) {
    const c = this.pt(cx, cy), p = this.pt(x, y);
    this._path.push(`Q${num(c.x)} ${num(c.y)} ${num(p.x)} ${num(p.y)}`);
  }
  rect(x, y, w, h) {
    const a = this.pt(x, y), b = this.pt(x + w, y),
          c = this.pt(x + w, y + h), d = this.pt(x, y + h);
    this._path.push(`M${num(a.x)} ${num(a.y)}L${num(b.x)} ${num(b.y)}` +
                    `L${num(c.x)} ${num(c.y)}L${num(d.x)} ${num(d.y)}Z`);
  }
  arc(x, y, r, sa, ea, ccw) { this._arc(x, y, r, r, 0, sa, ea, ccw); }
  ellipse(x, y, rx, ry, rot, sa, ea, ccw) { this._arc(x, y, rx, ry, rot, sa, ea, ccw); }
  _arc(x, y, rx, ry, rot, sa, ea, ccw) {
    const t = this._st.transform;
    const rotAll = rot + Math.atan2(t.b, t.a);
    const at = ang => {
      const px = x + Math.cos(ang) * rx, py = y + Math.sin(ang) * ry;
      return this.pt(px, py);
    };
    // 旋转椭圆：A 命令的 x-axis-rotation 已含 CTM 旋转，但起点仍按未旋转椭圆算出后再变换。
    // 内核只对整圆用 arc/ellipse（13 处 translate/rotate 都作用在文字与图标上），
    // 这里按通用角度处理即可。
    const p0 = at(sa), p1 = at(ea);
    // canvas 行为：arc 若接在已有子路径后面，先连一条直线到弧起点
    if (this._path.length) this._path.push(`L${num(p0.x)} ${num(p0.y)}`);
    else this._path.push(`M${num(p0.x)} ${num(p0.y)}`);

    let raw = ccw ? (sa - ea) : (ea - sa);
    while (raw < 0) raw += TAU;
    const full = raw >= TAU - 1e-3;          // 必须先判整圆，否则取模后会被当成 0 弧
    const delta = full ? TAU : raw;
    const sweep = ccw ? 0 : 1;
    const large = delta > Math.PI ? 1 : 0;
    if (!full && delta < 1e-6) return;
    if (full) {
      // 整圆：两个半圆，SVG 一条 A 命令画不出 360°
      const half = at(sa + Math.PI);
      this._path.push(`A${num(rx)} ${num(ry)} ${num(rotAll * 180 / Math.PI)} 0 ${sweep} ${num(half.x)} ${num(half.y)}`);
      this._path.push(`A${num(rx)} ${num(ry)} ${num(rotAll * 180 / Math.PI)} 0 ${sweep} ${num(p0.x)} ${num(p0.y)}`);
    } else {
      this._path.push(`A${num(rx)} ${num(ry)} ${num(rotAll * 180 / Math.PI)} ${large} ${sweep} ${num(p1.x)} ${num(p1.y)}`);
    }
  }
  closePath() { this._path.push("Z"); }
  setLineDash(a) { this._st.lineDash = Array.isArray(a) ? a.slice() : []; }

  /* ---------- 绘制 ---------- */
  _common(extra) {
    const st = this._st;
    const bits = [];
    bits.push(`opacity="${num(st.globalAlpha)}"`);
    if (st.shadowBlur > 0 && st.shadowColor && st.shadowColor !== "transparent")
      bits.push(`style="filter:drop-shadow(0px 0px ${num(st.shadowBlur)}px ${esc(st.shadowColor)})"`);
    if (extra) bits.push(extra);
    return bits.join(" ");
  }
  fill() {
    if (!this._path.length) return;
    const st = this._st, c = splitColor(st.fillStyle);
    this.body.push(`<path d="${this._path.join(" ")}" fill="${esc(c.value)}"` +
      (c.alpha !== 1 ? ` fill-opacity="${num(c.alpha)}"` : "") +
      ` ${this._common()}/>`);
  }
  stroke() {
    if (!this._path.length) return;
    const st = this._st, c = splitColor(st.strokeStyle);
    const dash = st.lineDash.length ? ` stroke-dasharray="${st.lineDash.map(num).join(",")}"` : "";
    this.body.push(`<path d="${this._path.join(" ")}" fill="none" stroke="${esc(c.value)}"` +
      (c.alpha !== 1 ? ` stroke-opacity="${num(c.alpha)}"` : "") +
      ` stroke-width="${num(st.lineWidth)}" stroke-linecap="${esc(st.lineCap)}"` +
      ` stroke-linejoin="${esc(st.lineJoin)}"${dash} ${this._common()}/>`);
  }
  fillRect(x, y, w, h) {
    const keep = this._path; this._path = [];
    this.rect(x, y, w, h); this.fill(); this._path = keep;
  }
  strokeRect(x, y, w, h) {
    const keep = this._path; this._path = [];
    this.rect(x, y, w, h); this.stroke(); this._path = keep;
  }
  clearRect() { /* 独立出图没有「上一帧」，纸底由渲染器自己画 */ }

  fillText(text, x, y) { this._text(text, x, y, false); }
  strokeText(text, x, y) { this._text(text, x, y, true); }
  _text(text, x, y, isStroke) {
    const st = this._st, f = parseFont(st.font);
    const t = st.transform;
    const tf = (t.a !== 1 || t.b || t.c || t.d !== 1 || t.e || t.f)
      ? ` transform="matrix(${num(t.a)} ${num(t.b)} ${num(t.c)} ${num(t.d)} ${num(t.e)} ${num(t.f)})"` : "";
    const anchor = ({ center: "middle", right: "end", end: "end", left: "start", start: "start" })[st.textAlign] || "start";
    const baseline = ({ middle: "central", top: "hanging", bottom: "alphabetic", alphabetic: "alphabetic" })[st.textBaseline] || "alphabetic";
    const c = splitColor(isStroke ? st.strokeStyle : st.fillStyle);
    const paint = isStroke
      ? `fill="none" stroke="${esc(c.value)}" stroke-width="${num(st.lineWidth)}"`
      : `fill="${esc(c.value)}"` + (c.alpha !== 1 ? ` fill-opacity="${num(c.alpha)}"` : "");
    this.body.push(`<text x="${num(x)}" y="${num(y)}"${tf} font-size="${num(f.size)}"` +
      ` font-family="${esc(f.family)}" font-weight="${f.weight}" font-style="${f.style}"` +
      ` text-anchor="${anchor}" dominant-baseline="${baseline}" ${paint} ${this._common()}>` +
      `${esc(text)}</text>`);
  }
  measureText(text) {
    const f = parseFont(this._st.font);
    let units = 0;
    for (const ch of String(text)) units += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch) ? 1 : 0.55;
    return { width: units * f.size * (f.weight === "bold" ? 1.05 : 1) };
  }

  /* ---------- 渐变 / 裁剪 ---------- */
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    const id = `grad${++this._uid}`;
    const g = { __svgGradientId: id, stops: [] };
    g.addColorStop = (off, col) => { g.stops.push([+off, String(col)]); };
    this.defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse"` +
      ` cx="${num(x1)}" cy="${num(y1)}" r="${num(r1)}"` +
      ` fx="${num(x0)}" fy="${num(y0)}" fr="${num(r0)}" data-stops="${id}"></radialGradient>`);
    g.__coords = { x0, y0, r0, x1, y1, r1 };
    this._gradients = this._gradients || {};
    this._gradients[id] = g;
    return g;
  }
  createLinearGradient(x0, y0, x1, y1) {
    const id = `grad${++this._uid}`;
    const g = { __svgGradientId: id, stops: [], __linear: [x0, y0, x1, y1] };
    g.addColorStop = (off, col) => { g.stops.push([+off, String(col)]); };
    this._gradients = this._gradients || {};
    this._gradients[id] = g;
    return g;
  }
  clip() {
    const id = `clip${++this._uid}`;
    this.defs.push(`<clipPath id="${id}"><path d="${this._path.join(" ")}"/></clipPath>`);
    this.body.push(`<g clip-path="url(#${id})">`);
    this._clips.push({ depth: this._depth, id });
  }

  /* ---------- 输出 ---------- */
  toSVG() {
    // 渐变 stop 在填充时才写齐，这里统一补齐（addColorStop 可能晚于 def 创建）
    const defs = this.defs.map(d => {
      const m = /data-stops="(grad\d+)"/.exec(d);
      if (m) {
        const g = this._gradients[m[1]];
        const [x0, y0, r0, x1, y1, r1] = [g.__coords.x0, g.__coords.y0, g.__coords.r0, g.__coords.x1, g.__coords.y1, g.__coords.r1];
        const stops = g.stops.map(([o, c]) => {
          const s = splitColor(c);
          return `<stop offset="${num(o)}" stop-color="${esc(s.value)}" stop-opacity="${num(s.alpha)}"/>`;
        }).join("");
        return `<radialGradient id="${m[1]}" gradientUnits="userSpaceOnUse" cx="${num(x1)}" cy="${num(y1)}" r="${num(r1)}" fx="${num(x0)}" fy="${num(y0)}" fr="${num(r0)}">${stops}</radialGradient>`;
      }
      return d;
    });
    for (const [id, g] of Object.entries(this._gradients || {})) {
      if (!g.__linear) continue;
      const [x0, y0, x1, y1] = g.__linear;
      const stops = g.stops.map(([o, c]) => {
        const s = splitColor(c);
        return `<stop offset="${num(o)}" stop-color="${esc(s.value)}" stop-opacity="${num(s.alpha)}"/>`;
      }).join("");
      defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(x0)}" y1="${num(y0)}" x2="${num(x1)}" y2="${num(y1)}">${stops}</linearGradient>`);
    }
    // 兜底：把遗留的 <g clip-path> 全部闭合
    const tail = this._clips.length ? "</g>".repeat(this._clips.length) : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"` +
      ` width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}">\n` +
      `<defs>${defs.join("\n")}</defs>\n` +
      this.body.join("\n") + tail + `\n</svg>\n`;
  }
}

module.exports = { SvgCanvas };
