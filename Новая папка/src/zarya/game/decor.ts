/** Декор мира: праздничные гирлянды, зимние крыши и сосульки, каустика на мелководье, конусы света фонарей. */
import { B, BUILDINGS, TH, TW } from './data';
import type { Building, Game } from './game';
import { lightOf, windAt } from './fx';
import { iceK, rainK } from './seasons';
import { plazaLanterns } from './plaza';
import { hash2 } from './rng';
import { mk, type Cv } from './sprites';

type Ctx = CanvasRenderingContext2D;

/* ═════════════ Зимние крыши ═════════════ */

interface RoofInfo {
  skip: boolean;
  top: number;
  eave: number;
  snow: Cv | null;
  ice: Cv | null;
}
const roofCache = new WeakMap<Cv, RoofInfo>();

export function roofInfo(sp: Cv): RoofInfo {
  const hit = roofCache.get(sp);
  if (hit) return hit;
  const w = sp.width;
  const h = sp.height;
  const info: RoofInfo = { skip: true, top: 0, eave: 0, snow: null, ice: null };
  roofCache.set(sp, info);
  const d = sp.getContext('2d')!.getImageData(0, 0, w, h).data;
  const A = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
  const topY = new Int16Array(w).fill(-1);
  const rowW = new Int16Array(h);
  let top = h;
  let bottom = 0;
  let maxW = 0;
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++)
      if (A(x, y) >= 200) {
        topY[x] = y;
        if (y < top) top = y;
        break;
      }
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (A(x, y) >= 200) n++;
    rowW[y] = n;
    if (n > 0) bottom = y;
    if (n > maxW) maxW = n;
  }
  const oh = bottom - top + 1;
  if (oh < 20 || maxW < 14) return info;
  // свес крыши: последняя широкая строка выше основания
  let eave = -1;
  for (let y = top; y <= bottom; y++) if (rowW[y] >= maxW - 3) eave = y;
  let ice = true;
  if (eave < 0 || eave - top < 5 || eave > top + oh * 0.74) {
    eave = top + Math.round(oh * 0.5);
    ice = false;
  }
  info.skip = false;
  info.top = top;
  info.eave = eave;
  // снежные шапки: следуем верхнему контуру
  const snow = mk(w, h);
  const sg = snow.getContext('2d')!;
  const put = (x: number, y: number, col: string) => {
    sg.fillStyle = col;
    sg.fillRect(x, y, 1, 1);
  };
  for (let x = 0; x < w; x++) {
    const ty = topY[x];
    if (ty < 0 || ty >= eave) continue;
    const depth = 2 + (hash2(x, 3, 91) < 0.45 ? 1 : 0) + (hash2(x, 5, 92) < 0.15 ? 1 : 0);
    for (let k = 0; k < depth; k++) {
      const y = ty + k;
      if (y >= eave || A(x, y) < 200) continue;
      put(x, y, k === 0 ? '#ffffff' : k === depth - 1 ? '#bcd2ea' : '#e8f2fc');
    }
    // наметённый «козырёк» по кромке
    if (A(x - 1, ty) < 200 || A(x + 1, ty) < 200) put(x, ty, '#ffffff');
  }
  // снег на свесе и по краю ската
  for (let x = 0; x < w; x++) {
    if (A(x, eave) < 200 || hash2(x, eave, 93) > 0.7) continue;
    put(x, eave - 1, '#f4f9ff');
    if (hash2(x, eave, 94) < 0.5) put(x, eave, '#d6e6f6');
  }
  info.snow = snow;
  if (ice) {
    const ic = mk(w, h);
    const ig = ic.getContext('2d')!;
    const px = (x: number, y: number, col: string) => {
      ig.fillStyle = col;
      ig.fillRect(x, y, 1, 1);
    };
    let x = 0;
    while (x < w) {
      if (A(x, eave) >= 200 && hash2(x, 7, 95) < 0.78) {
        const len = 2 + Math.floor(hash2(x, 8, 96) * 4);
        for (let k = 1; k <= len; k++) {
          px(x, eave + k, k === len ? '#8cc8ee' : '#dff2ff');
          if (k < len - 1 && len > 3 && k < 3) px(x + 1, eave + k, '#bfe3f8');
        }
        px(x, eave + 1, '#ffffff');
      }
      x += 2 + Math.floor(hash2(x, 9, 97) * 3);
    }
    info.ice = ic;
  }
  return info;
}

/** белые шапки на крышах и сосульки под карнизами (зимой) */
export function drawWinterRoof(ctx: Ctx, g: Game, sp: Cv, dx: number, dy: number) {
  const k = iceK(g);
  if (k <= 0.02) return;
  const r = roofInfo(sp);
  if (r.skip) return;
  ctx.globalAlpha = Math.min(1, k * 1.15);
  if (r.snow) ctx.drawImage(r.snow, dx, dy);
  if (r.ice && k > 0.35) {
    ctx.globalAlpha = Math.min(1, (k - 0.35) * 1.8);
    ctx.drawImage(r.ice, dx, dy);
    // редкая блестящая капля
    const t = g.waterT;
    const n = Math.floor(t * 0.9) + dx;
    if (hash2(n, dy, 17) < 0.3) {
      const ph = (t * 0.9) % 1;
      const gx = dx + 3 + Math.floor(hash2(n, 3, 17) * (sp.width - 6));
      ctx.globalAlpha = 0.9 * (1 - ph);
      ctx.fillStyle = '#d8f2ff';
      ctx.fillRect(gx, Math.round(dy + r.eave + 4 + ph * 8), 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

/* ═════════════ Праздничные гирлянды ═════════════ */

interface Edge {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  delay: number;
  ph: number;
  col: number;
}
interface FestState {
  sig: string;
  edges: Edge[];
  start: number;
  active: boolean;
  lastSeen: number;
  rebuildAt: number;
}
const fest = new WeakMap<Game, FestState>();
const FLAG_COLS = ['#e8404a', '#f4c830', '#38a8e8', '#58c860', '#d060d8', '#ff8a2a', '#f4f4f4'];

function anchorOf(g: Game, b: Building, towardX: number): { x: number; y: number } {
  const sp = g.bspr.cv[b.type];
  const dy = (b.y + b.h) * TH - sp.height;
  const r = roofInfo(sp);
  const cx = b.x * TW + (b.w * TW) / 2;
  const half = Math.min(sp.width * 0.4, (b.w * TW) / 2 + 5);
  const side = towardX >= cx ? 1 : -1;
  const ey = r.skip ? sp.height * 0.45 : r.eave - 1;
  return { x: cx + side * half * 0.85, y: dy + ey };
}

function buildEdges(g: Game): Edge[] {
  const list = g.buildings.filter((b) => b.done && BUILDINGS[b.type] && b.type !== 'campfire' && b.type !== 'farm' && g.bspr.cv[b.type].height >= 20);
  const cen = list.map((b) => ({ b, x: (b.x + b.w / 2) * TW, y: (b.y + b.h / 2) * TH }));
  const seen = new Set<string>();
  const edges: Edge[] = [];
  const MAX = 15 * TW;
  for (let i = 0; i < cen.length; i++) {
    const near = cen
      .map((c, j) => ({ j, d: Math.hypot(c.x - cen[i].x, (c.y - cen[i].y) * 1.4) }))
      .filter((o) => o.j !== i && o.d < MAX && o.d > 18)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const o of near) {
      const key = i < o.j ? `${i}-${o.j}` : `${o.j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const A = anchorOf(g, cen[i].b, cen[o.j].x);
      const B = anchorOf(g, cen[o.j].b, cen[i].x);
      edges.push({ ax: A.x, ay: A.y, bx: B.x, by: B.y, delay: 0, ph: hash2(i, o.j, 5) * 6, col: Math.floor(hash2(i, o.j, 6) * FLAG_COLS.length) });
    }
  }
  // «натягиваем» от Стоянки наружу
  const camp = g.buildings[0];
  const cx = camp ? (camp.x + 1) * TW : 0;
  const cy = camp ? (camp.y + 1) * TH : 0;
  edges.sort((a, b) => Math.hypot((a.ax + a.bx) / 2 - cx, (a.ay + a.by) / 2 - cy) - Math.hypot((b.ax + b.bx) / 2 - cx, (b.ay + b.by) / 2 - cy));
  edges.forEach((e, i) => (e.delay = i * 0.22));
  return edges.slice(0, 48);
}

export function drawFestival(ctx: Ctx, g: Game, left: number, top: number, vw: number, vh: number) {
  if (g.mode !== 'play' || !g.soc) return;
  let st = fest.get(g);
  if (!st) {
    st = { sig: '', edges: [], start: 0, active: false, lastSeen: -999, rebuildAt: 0 };
    fest.set(g, st);
  }
  const dec = g.soc.decrees.find((d) => d.id === 'feast');
  if (dec) {
    if (!st.active) {
      st.active = true;
      st.start = g.time;
      st.sig = '';
    }
    st.lastSeen = g.time;
  } else if (st.active) {
    st.active = false;
  }
  if (g.time < st.lastSeen - 1) {
    // загрузка более раннего сохранения
    st.lastSeen = -999;
    st.active = false;
  }
  const sinceEnd = g.time - st.lastSeen;
  if (!st.active && sinceEnd > 2.5) return;
  let alpha = 1;
  if (!st.active) alpha = Math.max(0, 1 - sinceEnd / 2.5);
  else if (dec && dec.left < 4) alpha = Math.max(0, dec.left / 4);
  if (alpha <= 0.01) return;

  const sig = String(g.buildings.length) + ':' + g.buildings.filter((b) => b.done).length;
  if (st.sig !== sig && (st.sig === '' || g.time > st.rebuildAt)) {
    st.sig = sig;
    st.rebuildAt = g.time + 2;
    st.edges = buildEdges(g);
  }
  const t = g.waterT;
  const age = g.time - st.start;
  for (const e of st.edges) {
    const prog = Math.max(0, Math.min(1, (age - e.delay) / 1.3));
    if (prog <= 0) continue;
    const minX = Math.min(e.ax, e.bx);
    const maxX = Math.max(e.ax, e.bx);
    const minY = Math.min(e.ay, e.by);
    if (maxX < left - 10 || minX > left + vw + 10 || minY > top + vh + 30 || Math.max(e.ay, e.by) < top - 30) continue;
    const len = Math.hypot(e.bx - e.ax, e.by - e.ay);
    const sag = Math.min(12, 3 + len * 0.1);
    const sway = windAt(g, e.ax) * 1.4;
    const steps = Math.max(2, Math.round(len * prog));
    ctx.globalAlpha = alpha;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const u = (i / steps) * prog;
      const bell = 4 * u * (1 - u);
      const x = e.ax + (e.bx - e.ax) * u;
      const y = e.ay + (e.by - e.ay) * u + (sag * bell) * (0.35 + 0.65 * Math.min(1, prog * 1.4)) + Math.sin(t * 2.1 + e.ph + u * 5) * sway * bell * 0.5;
      pts.push({ x, y });
    }
    // верёвка
    ctx.fillStyle = '#3a2a1a';
    for (const p of pts) ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    // флажки
    const every = 7;
    let n = 0;
    for (let i = 3; i < pts.length - 2; i += every) {
      const p = pts[i];
      const col = FLAG_COLS[(e.col + n++) % FLAG_COLS.length];
      const fl = Math.round(Math.sin(t * 4.2 + e.ph + i * 0.7) * sway * 0.9);
      const x = Math.round(p.x);
      const y = Math.round(p.y) + 1;
      ctx.fillStyle = col;
      ctx.fillRect(x - 2, y, 5, 1);
      ctx.fillRect(x - 1 + Math.round(fl * 0.4), y + 1, 3, 1);
      ctx.fillRect(x + Math.round(fl * 0.8), y + 2, 1, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x - 2, y, 2, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 2, y, 1, 1);
    }
    // бубенцы-огоньки ночью
    if (g.nightK > 0.3 && prog >= 1) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 6; i < pts.length - 3; i += 14) {
        const p = pts[i];
        const f = 0.6 + 0.4 * Math.sin(t * 5 + i + e.ph);
        ctx.fillStyle = `rgba(255,214,120,${0.55 * f * g.nightK * alpha})`;
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.globalAlpha = 1;
}

/* ═════════════ Каустика и блики на мелководье ═════════════ */

export function drawCaustics(ctx: Ctx, g: Game, c0: number, c1: number, r0: number, r1: number) {
  const w = g.world;
  const shore = w.shore;
  if (!shore) return;
  const sun = Math.max(0, Math.min(1, (lightOf(g) - 0.5) / 0.35));
  const day = sun * (1 - rainK(g) * 0.8);
  if (day < 0.05) return;
  const t = g.waterT;
  ctx.globalCompositeOperation = 'lighter';
  const wob = (x: number, k: number) => x * 0.55 + t * 1.6 + k * 3;
  for (let ty = Math.max(0, r0); ty <= Math.min(w.h - 1, r1); ty++) {
    for (let tx = Math.max(0, c0); tx <= Math.min(w.w - 1, c1); tx++) {
      const i = ty * w.w + tx;
      if (w.biome[i] > 1) continue;
      const sh = shore[i];
      if (sh > 5) continue;
      const depthK = 1 - Math.max(0, sh - 1) / 5.5;
      const I = day * (0.4 + 0.6 * depthK);
      const x0 = tx * TW;
      const y0 = ty * TH;
      // сеть светлых «нитей»
      ctx.fillStyle = `rgba(190,255,245,${0.085 * I})`;
      for (let k = 0; k < 2; k++) {
        const base = y0 + 3 + k * 5 + Math.sin(t * 0.9 + tx * 1.3 + k * 2) * 1.4;
        for (let x = 0; x < TW; x += 2) {
          const yy = Math.round(base + Math.sin(wob(x, k) + tx * 0.8 + ty * 1.1) * 1.7);
          ctx.fillRect(x0 + x, yy, 2, 1);
        }
      }
      // мерцающие солнечные блики
      for (let k = 0; k < 2; k++) {
        const sp = hash2(tx, ty, 61 + k) * 3;
        const cyc = t * 0.85 + sp;
        const ph = cyc % 1;
        if (hash2(tx, ty, Math.floor(cyc) * 3 + k) > 0.62) continue;
        const a = Math.sin(ph * Math.PI);
        const al = a * a * I;
        if (al < 0.05) continue;
        const gx = x0 + 2 + Math.floor(hash2(tx + k, ty, Math.floor(cyc)) * (TW - 4));
        const gy = y0 + 2 + Math.floor(hash2(ty, tx + k, Math.floor(cyc)) * (TH - 4));
        ctx.fillStyle = `rgba(255,252,220,${0.9 * al})`;
        ctx.fillRect(gx, gy, 1, 1);
        if (al > 0.45) {
          ctx.fillStyle = `rgba(255,248,200,${0.45 * al})`;
          ctx.fillRect(gx - 1, gy, 3, 1);
          ctx.fillRect(gx, gy - 1, 1, 3);
        }
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ═════════════ Конусы света уличных фонарей ═════════════ */

export function drawLightCones(ctx: Ctx, g: Game, left: number, top: number, s: number, night: number) {
  if (night < 0.05 || g.mode !== 'play') return;
  const lamps = plazaLanterns(g);
  if (!lamps.length) return;
  const t = g.waterT;
  const vw = g.cw / s;
  const vh = g.ch / s;
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lamps) {
    if (l.x < left - 30 || l.x > left + vw + 30 || l.y < top - 10 || l.y > top + vh + 40) continue;
    const fl = 0.9 + 0.1 * Math.sin(t * 7.5 + l.tx * 3 + l.ty) + 0.03 * Math.sin(t * 21 + l.tx);
    const sx = (l.x - left) * s;
    const hy = (l.y - 17 - top) * s;
    const gy = (l.y - top) * s;
    const spread = 17 * s;
    const a = night * fl;
    // сам конус
    const lg = ctx.createLinearGradient(0, hy, 0, gy + 3 * s);
    lg.addColorStop(0, `rgba(255,222,140,${0.3 * a})`);
    lg.addColorStop(0.55, `rgba(255,205,115,${0.12 * a})`);
    lg.addColorStop(1, `rgba(255,195,100,${0.05 * a})`);
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(sx - 1.5 * s, hy + 1 * s);
    ctx.lineTo(sx + 1.5 * s, hy + 1 * s);
    ctx.lineTo(sx + spread, gy + 3 * s);
    ctx.lineTo(sx - spread, gy + 3 * s);
    ctx.closePath();
    ctx.fill();
    // световое пятно на земле
    ctx.save();
    ctx.translate(sx, gy + 1.5 * s);
    ctx.scale(1, 0.38);
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, spread * 1.25);
    rg.addColorStop(0, `rgba(255,216,130,${0.34 * a})`);
    rg.addColorStop(0.5, `rgba(255,196,100,${0.14 * a})`);
    rg.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, spread * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // мягкое гало у самого фонаря
    const hg = ctx.createRadialGradient(sx, hy + 2 * s, 0, sx, hy + 2 * s, 9 * s);
    hg.addColorStop(0, `rgba(255,236,170,${0.42 * a})`);
    hg.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(sx - 9 * s, hy - 7 * s, 18 * s, 18 * s);
    // пылинки в луче
    for (let m = 0; m < 5; m++) {
      const ph = (t * 0.22 + m * 0.2 + l.tx * 0.13) % 1;
      const wy = hy + ph * (gy - hy);
      const half = 1.5 * s + (spread - 1.5 * s) * ph;
      const wx = sx + Math.sin(t * 0.9 + m * 2.3 + l.ty) * half * 0.7;
      ctx.fillStyle = `rgba(255,240,190,${0.5 * a * Math.sin(ph * Math.PI)})`;
      ctx.fillRect(Math.round(wx), Math.round(wy), Math.max(1, Math.round(s * 0.6)), Math.max(1, Math.round(s * 0.6)));
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ═════════════ Мелочи живой деревни: вёдра, поленницы, мешки, ящики, змей и кораблик ═════════════ */

const rectPx = (ctx: Ctx, col: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};

function drawBucket(ctx: Ctx, x: number, y: number, tip = false) {
  rectPx(ctx, 'rgba(0,0,0,0.25)', x - 1, y, 6, 1);
  rectPx(ctx, '#6a4524', x, y - 4, 4, 4);
  rectPx(ctx, '#8a6238', x, y - 4, 4, 1);
  rectPx(ctx, '#3a3a40', x, y - 3, 4, 1);
  rectPx(ctx, '#3a3a40', x, y - 1, 4, 1);
  if (!tip) {
    rectPx(ctx, '#2a1c10', x + 1, y - 6, 2, 1);
    rectPx(ctx, '#2a1c10', x, y - 5, 1, 1);
    rectPx(ctx, '#2a1c10', x + 3, y - 5, 1, 1);
  }
  rectPx(ctx, '#4a90c0', x + 1, y - 4, 2, 1);
}

function drawWoodpile(ctx: Ctx, x: number, y: number) {
  rectPx(ctx, 'rgba(0,0,0,0.25)', x - 1, y, 12, 1);
  const rows = [4, 3, 2];
  rows.forEach((n, r) => {
    for (let i = 0; i < n; i++) {
      const lx = x + r * 1.5 + i * 3;
      const ly = y - 3 * (r + 1);
      rectPx(ctx, '#8a5e34', lx, ly, 3, 3);
      rectPx(ctx, '#c89a64', lx, ly, 3, 1);
      rectPx(ctx, '#e0c08a', lx + 1, ly + 1, 1, 1);
    }
  });
}

function drawSack(ctx: Ctx, x: number, y: number, tone = 0) {
  rectPx(ctx, 'rgba(0,0,0,0.25)', x - 1, y, 7, 1);
  const base = tone ? '#c8b080' : '#d8c898';
  rectPx(ctx, base, x, y - 5, 5, 5);
  rectPx(ctx, '#f0e4bc', x + 1, y - 5, 2, 2);
  rectPx(ctx, '#a8905c', x, y - 1, 5, 1);
  rectPx(ctx, '#a8905c', x + 4, y - 4, 1, 3);
  rectPx(ctx, base, x + 1, y - 6, 3, 1);
  rectPx(ctx, '#8a6238', x + 1, y - 4, 3, 1);
}

function drawCrate(ctx: Ctx, x: number, y: number) {
  rectPx(ctx, 'rgba(0,0,0,0.25)', x - 1, y, 8, 1);
  rectPx(ctx, '#8a6238', x, y - 6, 6, 6);
  rectPx(ctx, '#c89a64', x, y - 6, 6, 1);
  rectPx(ctx, '#5a3a1c', x, y - 1, 6, 1);
  rectPx(ctx, '#5a3a1c', x + 2, y - 5, 1, 4);
  rectPx(ctx, '#5a3a1c', x + 3, y - 5, 1, 4);
  rectPx(ctx, '#6a4524', x + 1, y - 4, 4, 1);
}

const WELL_RX = /колодец|родник|поилка/i;
const STORE_RX = /амбар|склад|рынок|торг|ярмарка|лавка|зернохранилище|storage/i;

type PropKind = 'fire' | 'well' | 'store' | null;
const propKindCache = new Map<string, PropKind>();
function propKind(b: Building): PropKind {
  const hit = propKindCache.get(b.type);
  if (hit !== undefined) return hit;
  let k: PropKind = null;
  const nm = BUILDINGS[b.type]?.name ?? '';
  if (b.type === 'campfire' || b.type === 'camp') k = 'fire';
  else if (WELL_RX.test(nm)) k = 'well';
  else if (b.type === 'storage' || b.type === 'market' || STORE_RX.test(nm)) k = 'store';
  propKindCache.set(b.type, k);
  return k;
}

/** стоящие рядом с колодцами и кострами вёдра и поленницы; у амбаров и рынков — мешки и ящики */
export function drawVillageProps(ctx: Ctx, g: Game, c0: number, c1: number, r0: number, r1: number) {
  const list: Building[] = [...g.buildings];
  for (const t of g.towns) for (const b of t.bld) if (b.done) list.push(b);
  for (const b of list) {
    if (!b.done || b.x + b.w < c0 || b.x > c1 || b.y + b.h < r0 || b.y > r1 + 2) continue;
    const k = propKind(b);
    if (!k) continue;
    const h = hash2(b.x, b.y, 77);
    const side = h < 0.5 ? -1 : 1;
    const bx = (b.x + b.w / 2) * TW;
    const by = (b.y + b.h) * TH;
    if (k === 'fire') {
      const fx = bx + side * (b.w * TW * 0.5 + 6);
      drawWoodpile(ctx, fx - (side < 0 ? 12 : 0), by - 1);
      drawBucket(ctx, bx - side * (b.w * TW * 0.5 + 5), by + 1, h > 0.7);
    } else if (k === 'well') {
      drawBucket(ctx, bx + side * (b.w * TW * 0.5 + 4), by + 1, h > 0.5);
      drawWoodpile(ctx, bx - side * (b.w * TW * 0.5 + 15), by);
    } else {
      const sx = bx + side * (b.w * TW * 0.5 + 3);
      drawSack(ctx, sx, by - 1, 0);
      drawSack(ctx, sx + side * 6, by + 1, 1);
      drawCrate(ctx, sx + side * 2, by - 6 + 6);
      if (h > 0.4) drawCrate(ctx, sx + side * 2 + 1, by - 6);
      if (b.w >= 2) drawSack(ctx, bx - side * (b.w * TW * 0.5 + 6), by, 1);
    }
  }
}

const boatSpot = new Map<number, { x: number; y: number; cyc: number } | null>();

/** дети пускают бумажного змея и кораблик у кромки воды (в светлое время, в хорошую погоду) */
export function drawKidsPlay(ctx: Ctx, g: Game, left: number, top: number, vw: number, vh: number) {
  if (g.mode !== 'play' || g.nightK > 0.2 || rainK(g) > 0.2) return;
  const cyc = Math.floor(g.time / 70);
  const phase = (g.time % 70) / 70;
  if (phase > 0.45) return; // игра длится треть цикла
  const w = g.world;
  const t = g.waterT;
  for (const u of g.units) {
    if (!u.child || u.spawn > 0 || u.sleeping) continue;
    const px = u.x * TW;
    const py = u.y * TH;
    if (px < left - 30 || px > left + vw + 30 || py < top - 60 || py > top + vh + 30) continue;
    const slot = (u.id + cyc) % 5;
    const fade = Math.min(1, phase / 0.04, (0.45 - phase) / 0.04);
    if (slot === 0 && windAt(g, px) > 0.3) {
      // змей
      const sway = Math.sin(t * 1.7 + u.id) * 5;
      const kx = px + 12 + sway;
      const ky = py - 38 + Math.sin(t * 2.3 + u.id * 1.3) * 3;
      ctx.globalAlpha = fade;
      ctx.strokeStyle = 'rgba(255,255,240,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 3, py - 12);
      ctx.quadraticCurveTo(px + 6 + sway * 0.3, py - 24, kx, ky + 4);
      ctx.stroke();
      const col = ['#e84a4a', '#4a8ae8', '#e8c040', '#5ac86a'][u.id % 4];
      rectPx(ctx, col, kx - 1, ky - 4, 2, 2);
      rectPx(ctx, col, kx - 2, ky - 2, 4, 2);
      rectPx(ctx, '#fff6dc', kx - 1, ky, 2, 2);
      rectPx(ctx, col, kx, ky + 2, 1, 1);
      for (let i = 0; i < 4; i++) rectPx(ctx, i % 2 ? '#fff' : col, kx - 1 + Math.sin(t * 4 + i) * 1.5 + i * 0.4, ky + 4 + i * 2, 1, 1);
      ctx.globalAlpha = 1;
    } else if (slot === 1) {
      // кораблик у кромки воды
      let spot = boatSpot.get(u.id);
      if (!spot || spot.cyc !== cyc) {
        spot = null;
        const cx = Math.floor(u.x);
        const cy = Math.floor(u.y);
        let bd = 1e9;
        for (let dy = -5; dy <= 5; dy++)
          for (let dx = -5; dx <= 5; dx++) {
            const x = cx + dx;
            const y = cy + dy;
            if (x < 1 || y < 1 || x >= w.w - 1 || y >= w.h - 1) continue;
            if (w.biome[y * w.w + x] > B.WATER) continue;
            const shore = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => w.biome[(y + ay) * w.w + x + ax] > B.WATER);
            const d = dx * dx + dy * dy;
            if (shore && d < bd) {
              bd = d;
              spot = { x: x + 0.5, y: y + 0.5, cyc };
            }
          }
        boatSpot.set(u.id, spot);
      }
      if (!spot) continue;
      const bx = spot.x * TW + Math.sin(t * 0.8 + u.id) * 3;
      const by = spot.y * TH + 3 + Math.sin(t * 1.9 + u.id) * 0.8;
      ctx.globalAlpha = fade;
      ctx.strokeStyle = 'rgba(255,255,240,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 2, py - 6);
      ctx.lineTo(bx, by - 2);
      ctx.stroke();
      rectPx(ctx, 'rgba(255,255,255,0.35)', bx - 5, by + 1, 10, 1);
      rectPx(ctx, '#8a5e34', bx - 4, by - 1, 8, 2);
      rectPx(ctx, '#c89a64', bx - 3, by - 2, 6, 1);
      rectPx(ctx, '#5a3a1c', bx, by - 6, 1, 4);
      rectPx(ctx, '#fff6dc', bx + 1, by - 6, 3, 3);
      ctx.globalAlpha = 1;
    }
  }
}

/* ═════════════ Бонусы соседей при наведении на кнопку стройки ═════════════ */

interface Bonus {
  test: (b: Building) => boolean;
  text: string;
  gold?: boolean;
}

const isHome = (b: Building) => (BUILDINGS[b.type]?.housing ?? 0) > 0 && b.type !== 'camp';
const isFireish = (b: Building) => b.type === 'campfire' || b.type === 'camp';
const isStore = (b: Building) => !!BUILDINGS[b.type]?.dropoff || propKind(b) === 'store';
const isWellB = (b: Building) => WELL_RX.test(BUILDINGS[b.type]?.name ?? '');

function bonusesFor(type: string): Bonus[] {
  const d = BUILDINGS[type];
  if (!d) return [];
  const out: Bonus[] = [];
  if ((d.housing ?? 0) > 0) {
    out.push({ test: isFireish, text: 'тепло и свет +' });
    out.push({ test: isWellB, text: 'колодец: счастье +' });
    out.push({ test: (b) => b.type === 'market' || b.type === 'shrine', text: 'уют +' });
  }
  if (type === 'farm' || d.food) out.push({ test: isStore, text: 'быстрая сдача', gold: true });
  if (type === 'farm') out.push({ test: (b) => b.type === 'farm', text: 'соседние поля +' });
  if (d.dropoff || type === 'storage') out.push({ test: (b) => b.type === 'farm' || b.type === 'lodge' || b.type === 'workshop', text: 'ближе добыча', gold: true });
  if (d.prod || d.jobs) out.push({ test: isStore, text: 'склад рядом', gold: true });
  if (type === 'market') out.push({ test: isHome, text: 'покупатели +', gold: true });
  if (type === 'tower' || type === 'barracks') out.push({ test: (b) => b.type === 'tower' || b.type === 'barracks' || isFireish(b), text: 'оборона +' });
  return out;
}

/** зелёные/золотые стрелки от соседних построек к призраку, пока курсор на кнопке в меню [B] */
export function drawBuildBonuses(ctx: Ctx, g: Game) {
  const type = g.hoverBuild;
  if (!type || g.mode !== 'play') return;
  const d = BUILDINGS[type];
  if (!d) return;
  const gp = g.tool === 'build' && g.buildType ? g.ghostPos() : { x: Math.round(g.mouse.wx / TW - d.w / 2), y: Math.round(g.mouse.wy / TH - d.h / 2) };
  const gx = (gp.x + d.w / 2) * TW;
  const gy = (gp.y + d.h / 2) * TH;
  const rules = bonusesFor(type);
  const t = g.waterT;
  let found = 0;
  ctx.save();
  ctx.font = '7px "Pixelify Sans", monospace';
  ctx.textBaseline = 'middle';
  for (const b of g.buildings) {
    if (!b.done) continue;
    const bx = (b.x + b.w / 2) * TW;
    const by = (b.y + b.h / 2) * TH;
    const dist = Math.hypot(bx - gx, by - gy) / TW;
    if (dist > 9 || dist < 0.5) continue;
    const rule = rules.find((r) => r.test(b));
    if (!rule) continue;
    found++;
    const ang = Math.atan2(gy - by, gx - bx);
    const col = rule.gold ? '#ffd860' : '#7dff8c';
    // стрелка от соседа к призраку: бегущие шевроны
    const len = Math.hypot(gx - bx, gy - by);
    for (let i = 0; i < 4; i++) {
      const p = ((i / 4 + t * 0.6) % 1) * len;
      const x = bx + Math.cos(ang) * p;
      const y = by + Math.sin(ang) * p;
      const fade = Math.sin((p / len) * Math.PI);
      ctx.globalAlpha = 0.25 + 0.7 * fade;
      ctx.fillStyle = col;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(ang);
      ctx.fillRect(-2, -1, 3, 2);
      ctx.fillRect(1, -2, 1, 4);
      ctx.fillRect(2, -1, 1, 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    outlineBox(ctx, b, col);
    ctx.fillStyle = '#0f0906';
    const lx = Math.round(bx - 14);
    const ly = Math.round(b.y * TH - 6 - Math.sin(t * 3) * 1);
    ctx.fillText(rule.text, lx + 1, ly + 1);
    ctx.fillStyle = col;
    ctx.fillText(rule.text, lx, ly);
  }
  // дороги и тропы рядом с призраком
  const tr = g.trample;
  if (tr) {
    const w = g.world;
    let road = 0;
    for (let y = gp.y - 2; y <= gp.y + d.h + 1; y++)
      for (let x = gp.x - 2; x <= gp.x + d.w + 1; x++) if (x >= 0 && y >= 0 && x < w.w && y < w.h && tr[y * w.w + x] >= 7) road++;
    if (road > 3) {
      found++;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
      ctx.fillStyle = '#ffd860';
      const ax = Math.round(gx);
      const ay = Math.round(gp.y * TH - 8 - Math.abs(Math.sin(t * 4)) * 2);
      ctx.fillRect(ax - 2, ay - 2, 5, 1);
      ctx.fillRect(ax - 1, ay - 1, 3, 1);
      ctx.fillRect(ax, ay, 1, 1);
      ctx.fillText('дорога рядом', ax - 20, ay - 6);
      ctx.globalAlpha = 1;
    }
  }
  if (!found) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#fff2c0';
    ctx.fillText('нет бонусов соседей', Math.round(gx - 28), Math.round(gp.y * TH - 8));
  }
  ctx.restore();
}

function outlineBox(ctx: Ctx, b: Building, col: string) {
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.strokeRect(b.x * TW + 0.5, b.y * TH + 0.5, b.w * TW - 1, b.h * TH - 1);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/* ═════════════ Приказы: колышек-флажок, маршруты очереди, подсветка рамки ═════════════ */

/** флажок приказа: пиксельный колышек втыкается в землю и исчезает через 0.8 с */
export function drawPingFlags(ctx: Ctx, g: Game) {
  for (const p of g.pings) {
    const life = 0.8;
    const k = Math.min(1, p.t / life);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const drop = Math.max(0, 1 - p.t / 0.16); // воткнули за 0.16 с
    const bounce = p.t > 0.16 && p.t < 0.28 ? -1 : 0;
    const a = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    ctx.globalAlpha = a;
    // пыль от удара
    if (p.t > 0.14 && p.t < 0.5) {
      const r = (p.t - 0.14) * 18;
      ctx.globalAlpha = a * (1 - (p.t - 0.14) / 0.36) * 0.6;
      ctx.fillStyle = '#e0d0a8';
      ctx.fillRect(x - Math.round(r) - 1, y, 2, 1);
      ctx.fillRect(x + Math.round(r), y, 2, 1);
      ctx.globalAlpha = a;
    }
    const top = y - 9 - Math.round(drop * 7) + bounce;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x - 1, y, 4, 1);
    ctx.fillStyle = '#5a3a1c';
    ctx.fillRect(x, top, 1, y - top);
    ctx.fillStyle = '#a8794a';
    ctx.fillRect(x, top, 1, 2);
    // флажок колышется
    const wave = Math.round(Math.sin(p.t * 22) * 0.6);
    ctx.fillStyle = p.color;
    ctx.fillRect(x + 1, top, 4, 1);
    ctx.fillRect(x + 1, top + 1, 3 + wave, 1);
    ctx.fillRect(x + 1, top + 2, 2, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x + 1, top, 4, 1);
    ctx.globalAlpha = 1;
  }
}

function taskPoint(g: Game, t: { type: string; tx: number; ty: number; site: number }): { x: number; y: number; col: string } | null {
  if (t.type === 'chop') return { x: (t.tx + 0.5) * TW, y: (t.ty + 0.6) * TH, col: '#ffa04a' };
  if (t.type === 'gather') return { x: (t.tx + 0.5) * TW, y: (t.ty + 0.6) * TH, col: '#ff7a9a' };
  if (t.type === 'mine') return { x: (t.tx + 0.5) * TW, y: (t.ty + 0.6) * TH, col: '#c4cad8' };
  if (t.type === 'move') return { x: (t.tx + 0.5) * TW, y: (t.ty + 0.5) * TH, col: '#ffffff' };
  if (t.type === 'build') {
    const b = g.buildings.find((q) => q.id === t.site);
    if (b) return { x: (b.x + b.w / 2) * TW, y: (b.y + b.h) * TH - 2, col: '#8aff9a' };
  }
  return null;
}

/** тонкие пунктиры и точки маршрута очереди приказов для выделенных юнитов */
export function drawQueueLines(ctx: Ctx, g: Game) {
  const t = g.waterT;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.lineDashOffset = -Math.floor(t * 8);
  for (const u of g.units) {
    if (!u.sel || !u.queue || !u.queue.length) continue;
    let cx = u.x * TW;
    let cy = u.y * TH;
    const pts: { x: number; y: number; col: string }[] = [];
    const cur = u.task.q || u.task.type === 'move' ? taskPoint(g, u.task) : null;
    if (cur) pts.push(cur);
    for (const q of u.queue) {
      const p = taskPoint(g, q);
      if (p) pts.push(p);
    }
    pts.forEach((p, i) => {
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = p.col;
      ctx.beginPath();
      ctx.moveTo(Math.round(cx) + 0.5, Math.round(cy) + 0.5);
      ctx.lineTo(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5);
      ctx.stroke();
      cx = p.x;
      cy = p.y;
      void i;
    });
    ctx.setLineDash([]);
    pts.forEach((p, i) => {
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#0f0906';
      ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 5, 5);
      ctx.fillStyle = p.col;
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
      if (i === pts.length - 1) ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 1, 7, 3);
    });
    ctx.setLineDash([2, 3]);
  }
  ctx.restore();
}

/** контуры тех, кого зацепит рамка — ещё до отпускания кнопки мыши */
export function drawDragPreview(ctx: Ctx, g: Game) {
  const d = g.drag;
  if (!d || g.mode !== 'play') return;
  const x0 = Math.min(d.wx, g.mouse.wx);
  const x1 = Math.max(d.wx, g.mouse.wx);
  const y0 = Math.min(d.wy, g.mouse.wy);
  const y1 = Math.max(d.wy, g.mouse.wy);
  if (Math.hypot(g.mouse.sx - d.sx, g.mouse.sy - d.sy) < 8 * g.dpr) return;
  const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 110);
  const inside = (px: number, py: number) => px >= x0 && px <= x1 && py >= y0 && py <= y1;
  const w = g.world;
  ctx.save();
  ctx.lineWidth = 1;
  if (g.tool === 'chop' || g.tool === 'gather' || g.tool === 'mine') {
    const col = g.tool === 'chop' ? '#ffb060' : g.tool === 'gather' ? '#ff8aa8' : '#d8e0f0';
    const tx0 = Math.max(0, Math.floor(x0 / TW) - 2);
    const tx1 = Math.min(w.w - 1, Math.floor(x1 / TW) + 2);
    const ty0 = Math.max(0, Math.floor(y0 / TH) - 1);
    const ty1 = Math.min(w.h - 1, Math.floor(y1 / TH) + 5);
    ctx.strokeStyle = col;
    ctx.globalAlpha = pulse;
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const o = w.objs[ty * w.w + tx];
        if (!o) continue;
        const ok = g.tool === 'chop' ? g.isChoppable(o) && o.kind !== 'cactus' : g.tool === 'gather' ? o.kind === 'bush' && o.amount > 0 : o.kind === 'rock';
        if (!ok) continue;
        const s = g.spr[o.spr];
        const bx = (tx + 0.5) * TW;
        const by = (ty + 0.5) * TH;
        const cym = (ty + 0.9) * TH - s.height * 0.55;
        if (inside(bx, by) || inside(bx, cym)) ctx.strokeRect(tx * TW + 0.5, ty * TH + 0.5, TW - 1, TH - 1);
      }
  } else if (g.tool === 'site') {
    ctx.strokeStyle = '#9affaa';
    ctx.globalAlpha = pulse;
    for (const b of g.buildings) if (!b.done && b.x * TW < x1 && (b.x + b.w) * TW > x0 && b.y * TH < y1 && (b.y + b.h) * TH > y0) ctx.strokeRect(b.x * TW + 0.5, b.y * TH + 0.5, b.w * TW - 1, b.h * TH - 1);
  } else if (g.tool === 'select') {
    ctx.globalAlpha = pulse;
    for (const u of [...g.units, ...g.armyUnits()]) {
      if (u.spawn > 0 || u.sleeping || (u.child && !g.armyUnits().includes(u))) continue;
      if (u.child) continue;
      if (!inside(u.x * TW, u.y * TH - 6)) continue;
      const war = u.role === 'soldier' || u.role === 'guard';
      ctx.strokeStyle = war ? '#8ac8ff' : '#9affaa';
      const bx = Math.round(u.x * TW - 7);
      const by = Math.round(u.y * TH - 17);
      ctx.strokeRect(bx + 0.5, by + 0.5, 14, 20);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillRect(bx - 1, by - 1, 3, 1);
      ctx.fillRect(bx + 13, by + 20, 3, 1);
    }
  }
  ctx.restore();
}
