import { B, BUILDINGS, DAY_LENGTH, TH, TW } from './data';
import type { Building, Game, Unit } from './game';
import type { Mods } from './techs';
import { SEASON_DAYS, rainK, seasonInfo } from './seasons';
import { chron } from './extstate';
import { allArmies, spawnViking } from './battle';
import { armyCap } from './towns';
import { registerPerson } from './life';
import { drawSym, crestColor, DEFAULT_CREST, type CrestSel } from './crest';
import { labelLands } from './worldgen';
import { personSprite, type Look } from './sprites';

type Ctx = CanvasRenderingContext2D;

/* ═════════════════════════════════════════════════════════════════
   Состояние новых систем (хранится в сохранениях как g.x2).
   Старые сохранения без x2 получают значения по умолчанию.
   ═════════════════════════════════════════════════════════════════ */

export type RiteId = 'harvest' | 'hunt' | 'forge' | 'wind';

export interface Vet {
  fights: number;
  kills: number;
  inFight: boolean;
  nick?: string;
}

export interface Pet {
  id: number;
  species: 'dog' | 'hen' | 'sheep';
  x: number;
  y: number;
  hx: number;
  hy: number;
  tx: number;
  ty: number;
  dir: number;
  wait: number;
  anim: number;
  bark: number;
  home: number;
}

export interface Extra {
  crest: CrestSel;
  /** туман: 0 — скрыто, 1 — открыто; null — туман выключен (старые сохранения) */
  fog: Uint8Array | null;
  bridges: number[];
  rite: { id: RiteId | null; key: number };
  xp: Record<number, number>;
  vets: Record<number, Vet>;
  dil: { id: string | null; next: number; done: number };
  fair: { next: number; until: number; open: boolean; x: number; y: number; bought: string[]; id: number };
  relics: string[];
  vik: { warnYear: number; raidYear: number };
  pets: Pet[];
  petId: number;
  th: { next: number; flash: number; boom: number; bx: number };
}

export function createExtra(fogOn = true, w = 0, h = 0): Extra {
  return {
    crest: { ...DEFAULT_CREST },
    fog: fogOn ? new Uint8Array(w * h) : null,
    bridges: [],
    rite: { id: null, key: -1 },
    xp: {},
    vets: {},
    dil: { id: null, next: DAY_LENGTH * 3, done: 0 },
    fair: { next: DAY_LENGTH * 10.5, until: 0, open: false, x: 0, y: 0, bought: [], id: 0 },
    relics: [],
    vik: { warnYear: 0, raidYear: 0 },
    pets: [],
    petId: 1,
    th: { next: 12, flash: 0, boom: -1, bx: 0.5 },
  };
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dayNo = (g: Game) => Math.floor(g.time / DAY_LENGTH) + 1;
const X = (g: Game): Extra => g.x2;

export function crestOf(g: Game): CrestSel {
  return g.x2?.crest ?? DEFAULT_CREST;
}

/* ───────────── Туман неизведанного ───────────── */

let fogCv: HTMLCanvasElement | null = null;
let fogFor: Extra | null = null;
let fogDirty = true;

export function revealAround(g: Game, cx: number, cy: number, r: number) {
  const F = X(g).fog;
  if (!F) return;
  const w = g.world.w;
  const h = g.world.h;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (F[i]) continue;
      const dx = x - cx;
      const dy = (y - cy) * 1.15;
      if (dx * dx + dy * dy <= r2) {
        F[i] = 1;
        fogDirty = true;
      }
    }
}

export function isFogged(g: Game, tx: number, ty: number): boolean {
  const F = g.x2?.fog;
  if (!F) return false;
  const x = Math.floor(tx);
  const y = Math.floor(ty);
  if (x < 0 || y < 0 || x >= g.world.w || y >= g.world.h) return false;
  return F[y * g.world.w + x] === 0;
}

function isWatchtower(b: Building) {
  const d = BUILDINGS[b.type];
  return d?.arch === 'tower' || b.type === 'tower' || b.type === 'tb_guardpost';
}

function fogTick(g: Game) {
  const F = X(g).fog;
  if (!F) return;
  for (const u of g.units) if (!u.sleeping || u.moving) revealAround(g, u.x, u.y, 6);
  for (const u of g.guards) revealAround(g, u.x, u.y, 7);
  for (const b of g.buildings) {
    if (!b.done) continue;
    revealAround(g, b.x + b.w / 2, b.y + b.h / 2, isWatchtower(b) ? 16 : b.type === 'camp' ? 18 : 5);
  }
  for (const c of allArmies(g)) {
    if ((c as { incoming?: boolean }).incoming || (c as { from?: number }).from !== undefined) continue;
    if (c.ship) revealAround(g, c.ship.x, c.ship.y, 9);
    const s = c.squad?.[0];
    if (s) revealAround(g, s.x, s.y, 8);
  }
  for (const car of g.ext.caravans) revealAround(g, car.x, car.y, 6);
  // дружественные города, ставшие провинциями, открывают землю вокруг
  for (const t of g.towns) if (t.owner === 'player') revealAround(g, t.x, t.y, 12);
}

export function fogCanvas(g: Game): HTMLCanvasElement | null {
  const F = g.x2?.fog;
  if (!F) return null;
  const w = g.world.w;
  const h = g.world.h;
  if (!fogCv || fogFor !== g.x2 || fogCv.width !== w || fogCv.height !== h) {
    fogCv = document.createElement('canvas');
    fogCv.width = w;
    fogCv.height = h;
    fogFor = g.x2;
    fogDirty = true;
  }
  if (fogDirty) {
    fogDirty = false;
    const c = fogCv.getContext('2d')!;
    const img = c.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      // граница тумана: клетки рядом с открытыми чуть прозрачнее
      if (F[i]) continue;
      const x = i % w;
      const y = (i / w) | 0;
      let near = 0;
      if (x > 0 && F[i - 1]) near++;
      if (x < w - 1 && F[i + 1]) near++;
      if (y > 0 && F[i - w]) near++;
      if (y < h - 1 && F[i + w]) near++;
      const k = i * 4;
      img.data[k] = 214;
      img.data[k + 1] = 198;
      img.data[k + 2] = 160;
      img.data[k + 3] = near ? 150 : 235;
    }
    c.putImageData(img, 0, 0);
  }
  return fogCv;
}

/** пергаментно-облачный туман: мягкая карта 1 пиксель на клетку + дрейфующие «облачка» */
export function drawFog(ctx: Ctx, g: Game, c0: number, c1: number, r0: number, r1: number) {
  const cv = fogCanvas(g);
  if (!cv) return;
  const w = g.world.w;
  const F = X(g).fog!;
  const x0 = Math.max(0, c0 - 1);
  const x1 = Math.min(w - 1, c1 + 1);
  const y0 = Math.max(0, r0 - 1);
  const y1 = Math.min(g.world.h - 1, r1 + 1);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(cv, x0, y0, x1 - x0 + 1, y1 - y0 + 1, x0 * TW, y0 * TH, (x1 - x0 + 1) * TW, (y1 - y0 + 1) * TH);
  ctx.imageSmoothingEnabled = false;
  // дрейфующие светлые облачка над скрытыми клетками
  const t = g.waterT;
  ctx.fillStyle = 'rgba(255,250,235,0.16)';
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (F[y * w + x]) continue;
      const hh = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const f = hh - Math.floor(hh);
      if (f > 0.3) continue;
      const ox = Math.sin(t * 0.25 + f * 40) * 6;
      ctx.fillRect(Math.round(x * TW + ox), y * TH + Math.round(f * 18), 10 + Math.round(f * 20), 3);
    }
}

/* ───────────── Деревянные мосты ───────────── */

export const BRIDGE_ID = 'tb_bridge';

const isLand = (g: Game, x: number, y: number) => x >= 0 && y >= 0 && x < g.world.w && y < g.world.h && g.world.biome[y * g.world.w + x] > B.WATER;

export function bridgeCheck(g: Game, x: number, y: number): string | null {
  const w = g.world;
  if (x < 1 || y < 1 || x >= w.w - 1 || y >= w.h - 1) return 'Слишком близко к краю';
  const i = y * w.w + x;
  if (w.biome[i] !== B.WATER) return w.biome[i] === B.DEEP ? 'Мост строится только на мелководье' : 'Мост ставится на воду — соедините берега';
  if (g.buildingAt(x, y) || w.objs[i]) return 'Место занято';
  const nb = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of nb) {
    if (isLand(g, x + dx, y + dy) && !g.world.blocked[(y + dy) * w.w + x + dx]) return null;
    if (X(g).bridges.includes((y + dy) * w.w + x + dx)) return null;
  }
  return 'Нужен берег или другой готовый мост рядом';
}

export const isBridgeTile = (g: Game, i: number) => !!g.x2 && g.x2.bridges.includes(i);

function relabel(g: Game) {
  const w = g.world;
  const r = labelLands(w.w, w.h, w.biome);
  w.landId = r.id;
  w.landCount = r.count;
}

function bridgesTick(g: Game) {
  const w = g.world;
  let changed = false;
  for (const b of g.buildings) {
    if (b.type !== BRIDGE_ID || !b.done) continue;
    const i = b.y * w.w + b.x;
    if (X(g).bridges.includes(i)) continue;
    X(g).bridges.push(i);
    if (w.biome[i] <= B.WATER) w.biome[i] = B.BEACH;
    w.blocked[i] = 0;
    changed = true;
    const mm = g.minimap;
    if (mm && mm.width === w.w) {
      const c = mm.getContext('2d')!;
      c.fillStyle = '#8a6a3a';
      c.fillRect(b.x, b.y, 1, 1);
    }
  }
  if (changed) {
    relabel(g);
    g.msg('Мост готов — острова соединены: люди, тележки и караваны могут пройти', 'good');
    chron(g, 'Построен деревянный мост через мелководье', 'info');
    g.onTownsChanged();
  }
}

/** снос моста: клетка снова становится водой */
export function bridgeRemoved(g: Game, b: Building) {
  const w = g.world;
  const i = b.y * w.w + b.x;
  const k = X(g).bridges.indexOf(i);
  if (k < 0) return;
  X(g).bridges.splice(k, 1);
  w.biome[i] = B.WATER;
  w.blocked[i] = 1;
  relabel(g);
}

let bridgeCv: HTMLCanvasElement | null = null;
function bridgeSprite(): HTMLCanvasElement {
  if (bridgeCv) return bridgeCv;
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = TH + 2;
  const x = c.getContext('2d')!;
  // опоры
  x.fillStyle = '#3a2412';
  x.fillRect(1, TH - 1, 2, 3);
  x.fillRect(TW - 3, TH - 1, 2, 3);
  // доски
  const cols = ['#a87a46', '#946a3a', '#b88a52', '#9c7040'];
  for (let i = 0; i < 4; i++) {
    x.fillStyle = cols[i];
    x.fillRect(0, i * 3, TW, 3);
    x.fillStyle = '#5a3a1c';
    x.fillRect(0, i * 3 + 2, TW, 1);
    x.fillStyle = 'rgba(255,230,170,0.25)';
    x.fillRect(0, i * 3, TW, 1);
  }
  x.fillStyle = '#3a2412';
  x.fillRect(0, 0, 1, TH);
  x.fillRect(TW - 1, 0, 1, TH);
  x.fillStyle = '#7a5530';
  x.fillRect(2, 1, 1, 1);
  x.fillRect(TW - 3, TH - 3, 1, 1);
  bridgeCv = c;
  return c;
}

export function installBridgeSprite(g: Game) {
  if (g.bspr && g.bspr.cv) (g.bspr.cv as unknown as Record<string, HTMLCanvasElement>)[BRIDGE_ID] = bridgeSprite();
}

export function drawBridges(ctx: Ctx, g: Game, c0: number, c1: number, r0: number, r1: number) {
  const sp = bridgeSprite();
  for (const b of g.buildings) {
    if (b.type !== BRIDGE_ID) continue;
    if (b.x < c0 - 1 || b.x > c1 + 1 || b.y < r0 - 1 || b.y > r1 + 1) continue;
    const px = b.x * TW;
    const py = b.y * TH;
    if (b.done) {
      // лёгкая тень на воде и сами доски
      ctx.fillStyle = 'rgba(8,24,48,0.25)';
      ctx.fillRect(px + 1, py + TH, TW - 2, 2);
      ctx.drawImage(sp, px, py);
    } else {
      ctx.globalAlpha = 0.35 + b.progress * 0.65;
      ctx.drawImage(sp, 0, 0, TW, Math.max(2, Math.round(TH * b.progress)), px, py, TW, Math.max(2, Math.round(TH * b.progress)));
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,226,122,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TW - 1, TH - 1);
    }
  }
}

/* ───────────── Священные обряды ───────────── */

export interface RiteDef {
  id: RiteId;
  name: string;
  icon: string;
  desc: string;
  cost: Partial<Record<'food' | 'wood' | 'stone' | 'goods' | 'gold', number>>;
}

export const RITES: RiteDef[] = [
  { id: 'harvest', name: 'Дух Урожая', icon: '🌾', desc: 'Поля и сады растут быстрее (урожай +30%) на весь сезон.', cost: { food: 20, gold: 10 } },
  { id: 'hunt', name: 'Дух Охоты', icon: '🦌', desc: 'Звери не трогают людей в лесу, а с добычи — вдвое больше мяса.', cost: { food: 15, wood: 15 } },
  { id: 'forge', name: 'Дух Кузни', icon: '🔥', desc: 'Ковка и крафт в цехах идут на 35% быстрее.', cost: { stone: 20, goods: 4 } },
  { id: 'wind', name: 'Дух Ветра', icon: '🌬️', desc: 'Корабли и караваны плывут и едут в 1.5 раза быстрее.', cost: { wood: 20, gold: 15 } },
];

const seasonKey = (g: Game) => Math.floor(g.time / DAY_LENGTH / SEASON_DAYS);

export function activeRite(g: Game): RiteId | null {
  const R = g.x2?.rite;
  if (!R || !R.id) return null;
  return R.key === seasonKey(g) ? R.id : null;
}

export const riteIs = (g: Game, id: RiteId) => activeRite(g) === id;

export function isSacred(type: string): boolean {
  const d = BUILDINGS[type];
  return type === 'shrine' || type === 'tb_cathedral' || d?.arch === 'temple';
}

export function riteLeftDays(g: Game): number {
  const s = seasonInfo(g);
  return Math.max(1, SEASON_DAYS - Math.floor(s.pos));
}

export function chooseRite(g: Game, id: RiteId): string | null {
  const def = RITES.find((r) => r.id === id)!;
  if (activeRite(g)) return 'Покровитель на этот сезон уже выбран';
  if (!g.buildings.some((b) => b.done && isSacred(b.type))) return 'Нужно построенное Святилище или Храм';
  for (const k of Object.keys(def.cost) as (keyof RiteDef['cost'])[]) if ((g.res[k] ?? 0) < (def.cost[k] ?? 0)) return 'Не хватает ресурсов для подношения';
  for (const k of Object.keys(def.cost) as (keyof RiteDef['cost'])[]) g.spend(k, def.cost[k] ?? 0);
  X(g).rite = { id, key: seasonKey(g) };
  g.refreshMods();
  const sh = g.buildings.find((b) => b.done && isSacred(b.type));
  if (sh) for (let i = 0; i < 14; i++) g.spark((sh.x + sh.w / 2) * TW, sh.y * TH + 4, i % 2 ? '#ffe27a' : '#fff6c8');
  g.msg(`Обряд совершён: ${def.icon} ${def.name} покровительствует вам до конца сезона`, 'good');
  chron(g, `Обряд в святилище: ${def.name}`, 'info');
  g.sfx('fanfare');
  return null;
}

/** модификаторы от обрядов и реликвий — вызывается из lifeApplyMods */
export function extraMods(g: Game, m: Mods) {
  const x = g.x2;
  if (!x) return;
  const r = activeRite(g);
  if (r === 'harvest') m.farm *= 1.3;
  if (r === 'forge') m.prod *= 1.35;
  if (x.relics.includes('amulet')) m.loyalty += 2;
  if (x.relics.includes('chalice')) m.birth *= 0.92;
}

/* ───────────── Уровни мастерства и прозвища ───────────── */

export const LEVELS = ['Новичок', 'Опытный', 'Мастер'] as const;
const XP_MID = 60;
const XP_MAX = 200;

export function xpOf(g: Game, id: number): number {
  return g.x2?.xp[id] ?? 0;
}
export function levelOf(g: Game, id: number): 0 | 1 | 2 {
  const v = xpOf(g, id);
  return v >= XP_MAX ? 2 : v >= XP_MID ? 1 : 0;
}
export function levelProgress(g: Game, id: number): number {
  const v = xpOf(g, id);
  if (v >= XP_MAX) return 1;
  if (v >= XP_MID) return (v - XP_MID) / (XP_MAX - XP_MID);
  return v / XP_MID;
}

export const nickOf = (g: Game, id: number): string | undefined => g.x2?.vets[id]?.nick;
export const vetStats = (g: Game, id: number): Vet | undefined => g.x2?.vets[id];

/** множитель труда: мастер +30% */
export function masteryWork(g: Game, u: Unit): number {
  return levelOf(g, u.id) === 2 ? 1.3 : levelOf(g, u.id) === 1 ? 1.08 : 1;
}
/** множитель силы в бою: мастер +30%, ветеран с прозвищем +15% */
export function combatMult(g: Game, u: Unit): number {
  let k = 1;
  if (levelOf(g, u.id) === 2) k *= 1.3;
  if (nickOf(g, u.id)) k *= 1.15;
  return k;
}

const NICKS = ['Медвежья Шкура', 'Железный', 'Сорвиголова', 'Волчий Глаз', 'Невредимый', 'Громобой', 'Стальной', 'Зоркий', 'Ястреб', 'Каменный', 'Храбрый Лис', 'Буревестник'];

function award(g: Game, u: Unit, why: string) {
  const V = X(g).vets;
  const v = V[u.id];
  if (!v || v.nick) return;
  v.nick = NICKS[(u.id * 7 + v.fights + v.kills * 3) % NICKS.length];
  g.floatText(u.x * TW, u.y * TH - 18, `★ «${v.nick}»`, '#ffe27a');
  g.msg(`${u.name} получает прозвище «${v.nick}» — ${why}. Сила в бою +15%`, 'good');
  chron(g, `${u.name} прозван «${v.nick}» (${why})`, 'info');
  for (let i = 0; i < 8; i++) g.spark(u.x * TW, u.y * TH - 10, '#ffe27a');
}

function vetOf(g: Game, id: number): Vet {
  const V = X(g).vets;
  return (V[id] ??= { fights: 0, kills: 0, inFight: false });
}

/** убил хищника/разбойника: засчитываем ближайшему воину, стражнику или охотнику */
export function awardKill(g: Game, x: number, y: number) {
  if (!g.x2) return;
  let best: Unit | null = null;
  let bd = 6;
  const pool = [...g.guards, ...g.units.filter((u) => u.role === 'hunter' || u.role === 'soldier')];
  for (const u of pool) {
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  if (!best) return;
  const v = vetOf(g, best.id);
  v.kills++;
  award(g, best, 'победил хищника или разбойника');
}

function lvlUp(g: Game, u: Unit, lv: number) {
  g.floatText(u.x * TW, u.y * TH - 16, lv === 2 ? '⭐ Мастер!' : '▲ Опытный', lv === 2 ? '#ffe27a' : '#9affaa');
  if (lv === 2) {
    g.msg(`${u.name} стал Мастером: работает и сражается на 30% лучше, учит новичков`, 'good');
    chron(g, `${u.name} достиг мастерства`, 'info');
  }
}

function masteryTick(g: Game) {
  const x = X(g);
  const all = [...g.units, ...g.guards];
  const masters = all.filter((u) => (x.xp[u.id] ?? 0) >= XP_MAX && !u.sleeping);
  const foes = g.life.animals.filter((a) => a.hp > 0 && a.kind !== 'deer');
  for (const u of all) {
    if (u.child || u.sleeping) continue;
    let gain = 0;
    const tt = u.task.type;
    if (u.cb) gain += 2.2;
    else if (u.role === 'soldier' || u.role === 'hunter' || g.guards.includes(u)) {
      const near = foes.some((a) => Math.hypot(a.x - u.x, a.y - u.y) < 6) || g.life.raiders.some((r) => Math.hypot(r.unit.x - u.x, r.unit.y - u.y) < 6);
      if (near) gain += 2;
      else gain += 0.15;
    } else if ((tt === 'chop' || tt === 'gather' || tt === 'mine' || tt === 'build' || tt === 'craft') && !u.moving) gain += 1;
    if (gain <= 0) continue;
    const before = x.xp[u.id] ?? 0;
    // ученичество: мастер рядом удваивает опыт новичка
    if (before < XP_MID && masters.some((m) => m !== u && Math.hypot(m.x - u.x, m.y - u.y) < 3.5)) {
      gain *= 2;
      if (Math.random() < 0.08) g.floatText(u.x * TW, u.y * TH - 14, '📖', '#bfe6ff');
    }
    const after = before + gain;
    x.xp[u.id] = after;
    const lb = before >= XP_MAX ? 2 : before >= XP_MID ? 1 : 0;
    const la = after >= XP_MAX ? 2 : after >= XP_MID ? 1 : 0;
    if (la > lb) lvlUp(g, u, la);
    // бои: считаем пережитые сражения
    if (u.role === 'soldier' || u.role === 'hunter' || g.guards.includes(u) || u.cb) {
      const v = vetOf(g, u.id);
      const fighting = !!u.cb;
      if (v.inFight && !fighting) {
        v.fights++;
        if (v.fights >= 3) award(g, u, 'пережил три боя');
      }
      v.inFight = fighting;
    }
  }
  // прорежаем память о погибших
  if (Math.random() < 0.05) {
    const alive = new Set(all.map((u) => u.id));
    for (const k of Object.keys(x.xp)) if (!alive.has(+k)) delete x.xp[+k];
  }
}

/* ───────────── Живые реплики поселенцев ───────────── */

export function thoughtOf(g: Game, id: number): string {
  const u = g.units.find((q) => q.id === id) ?? g.guards.find((q) => q.id === id);
  if (!u) return '…';
  const s = seasonInfo(g);
  const hour = g.dayT * 24;
  const night = hour >= 21 || hour < 5;
  const rain = rainK(g) > 0.3;
  const lines: string[] = [];
  const v = vetStats(g, id);
  if (u.hunger < 15) lines.push('Живот сводит… Хоть бы горсть ягод.', 'Скорее бы к костру, силы на исходе.');
  else if (u.hunger < 30) lines.push('Проголодался. Пора бы к котелку.');
  if (g.life.battleT > 0 || u.cb) lines.push('Сердце колотится — враги рядом!', 'Держись, друг, не отступай!');
  if (v?.nick) lines.push(`Люди зовут меня «${v.nick}». Не посрамлю имя!`);
  else if (v && v.fights > 0) lines.push('Бой — дело страшное. Но я выстоял.');
  if (levelOf(g, id) === 2) lines.push('Руки сами знают дело. Могу и новичков поучить.');
  if (night) lines.push(u.sleeping ? 'Хр-р… Мне снятся поля…' : 'Ночь холодная. Скорей бы под крышу.');
  else if (hour < 8) lines.push('Утро! Самое время браться за дело.');
  else if (hour >= 18) lines.push('Вечереет. Скоро ужин у костра.');
  if (s.winter) lines.push('Пар изо рта… Зима лютует, берегите дрова.', 'Только бы запасов до весны хватило.');
  else if (s.idx === 2 && rain) lines.push('Дождь льёт стеной, но работа не ждёт.');
  else if (s.idx === 0) lines.push('Весна! Земля оттаяла, всё зазеленело.');
  else if (s.idx === 1) lines.push('Жаркий день — работа спорится.');
  switch (u.trait) {
    case 'worker': lines.push('Работа — лучший отдых. Ещё бы одно бревно!'); break;
    case 'drunkard': lines.push('Эх, глоток бы чего-нибудь покрепче…'); break;
    case 'coward': lines.push('Только бы волки не пришли…'); break;
    case 'brave': lines.push('Пусть только сунутся — встречу как положено!'); break;
    case 'kind': lines.push('Надо бы поделиться хлебом с соседями.'); break;
  }
  const tt = u.task.type;
  if (u.role === 'soldier' || g.guards.includes(u)) lines.push('Копьё наточено, караул не дремлет.');
  else if (u.role === 'hunter') lines.push('Следы свежие… зверь где-то рядом.');
  else if (tt === 'chop') lines.push('Хороший дуб. Дров будет вдоволь!');
  else if (tt === 'mine') lines.push('Камень звенит — жила богатая.');
  else if (tt === 'build') lines.push('Стены растут — дом будет на славу.');
  else if (tt === 'gather') lines.push('Ягоды сегодня крупные.');
  else if (tt === 'craft') lines.push('Мастерская дымит, товар идёт.');
  else if (tt === 'idle') lines.push('Скучно без дела. Дайте поручение, государь!');
  const rite = activeRite(g);
  if (rite) lines.push('Духи благоволят нам в этот сезон.');
  const idx = Math.floor(g.time / 7 + id) % lines.length;
  return lines[idx] ?? '…';
}

/* ───────────── Дилеммы правителя ───────────── */

type Eff = { food?: number; wood?: number; stone?: number; gold?: number; goods?: number; know?: number; happy?: number; loy?: number; pop?: number };

export interface DilemmaOpt {
  label: string;
  effect: string;
  go: (g: Game) => string;
}
export interface Dilemma {
  id: string;
  icon: string;
  title: string;
  text: string;
  when?: (g: Game) => boolean;
  opts: [DilemmaOpt, DilemmaOpt];
}

function applyEff(g: Game, e: Eff) {
  for (const k of ['food', 'wood', 'stone', 'gold', 'goods'] as const) {
    const v = e[k];
    if (v) g.res[k] = Math.max(0, g.res[k] + v);
  }
  if (e.know) g.know = Math.max(0, g.know + e.know);
  if (e.happy && g.soc) g.soc.happy = clamp(g.soc.happy + e.happy, 0, 100);
  if (e.loy) for (const t of g.towns) if (t.owner === 'player') t.loyalty = clamp(t.loyalty + e.loy, 0, 100);
  if (e.pop) {
    const camp = g.buildings[0];
    if (camp) {
      const tiles = g.freeTilesNear(camp.x + 1, camp.y + 3, e.pop);
      for (const t of tiles) {
        const u = g.newUnit(t.x + 0.5, t.y + 0.5, false);
        g.units.push(u);
        registerPerson(g, u, []);
      }
    }
  }
}

const D = (id: string, icon: string, title: string, text: string, a: [string, string, (g: Game) => string], b: [string, string, (g: Game) => string], when?: (g: Game) => boolean): Dilemma => ({
  id,
  icon,
  title,
  text,
  when,
  opts: [
    { label: a[0], effect: a[1], go: a[2] },
    { label: b[0], effect: b[1], go: b[2] },
  ],
});

export const DILEMMAS: Dilemma[] = [
  D(
    'refugees',
    '🧳',
    'Беженцы у ворот',
    'К селению вышли изгнанники с детьми. Они просят хлеба и места у костра.',
    ['Принять', '−20 еды · +3 жителя · счастье −2', (g) => (applyEff(g, { food: -20, pop: 3, happy: -2 }), 'Беженцы остались и помогают строить деревню.')],
    ['Отказать', 'лояльность −2 · счастье +1', (g) => (applyEff(g, { loy: -2, happy: 1 }), 'Ворота остались закрыты. Люди шепчутся о жестокости.')],
    (g) => g.res.food >= 20,
  ),
  D(
    'clans',
    '⚖️',
    'Спор двух родов',
    'Два старших рода не поделили покос и пришли к вам на суд.',
    ['Решить в пользу старшего', 'лояльность +4 · счастье −4', (g) => (applyEff(g, { loy: 4, happy: -4 }), 'Старший род доволен, младший затаил обиду.')],
    ['Разделить поровну', '−15 золота · счастье +5 · лояльность +1', (g) => (applyEff(g, { gold: -15, happy: 5, loy: 1 }), 'Мудрое решение! Рода помирились за общим столом.')],
    (g) => g.res.gold >= 15,
  ),
  D(
    'hoard',
    '🗝️',
    'Древний клад в шахте',
    'Горняки наткнулись на запечатанный ход с древними знаками. Внутри что-то блестит.',
    ['Вскрыть', 'риск: клад (+70 золота) или обвал (−20 камня, счастье −5)', (g) => (Math.random() < 0.55 ? (applyEff(g, { gold: 70, goods: 4 }), 'Клад найден! Золото и редкие вещицы в казне.') : (applyEff(g, { stone: -20, happy: -5 }), 'Обвал! Ход завалило, горняки напуганы.'))],
    ['Запечатать', 'знания +20 · счастье +2', (g) => (applyEff(g, { know: 20, happy: 2 }), 'Знаки зарисованы старцами. Тайна осталась в земле.')],
    (g) => g.stats.stone > 15,
  ),
  D(
    'merchant',
    '🐪',
    'Купец просит льготы',
    'Заезжий купец обещает частые караваны, если снять с него пошлину.',
    ['Дать льготу', '−10 золота · +12 товаров · лояльность +1', (g) => (applyEff(g, { gold: -10, goods: 12, loy: 1 }), 'Купец привёз тюки добротных товаров.')],
    ['Взять пошлину', '+8 золота · счастье −2', (g) => (applyEff(g, { gold: 8, happy: -2 }), 'Казна пополнилась, но купец уехал недовольный.')],
    (g) => g.res.gold >= 10,
  ),
  D(
    'feast',
    '🍖',
    'Просьба о празднике',
    'Старейшины просят устроить пир в честь урожая — люди устали от тягот.',
    ['Устроить пир', '−25 еды · счастье +10 · лояльность +3', (g) => (applyEff(g, { food: -25, happy: 10, loy: 3 }), 'Пир удался! Песни слышны до утра.')],
    ['Отложить', 'счастье −3 · лояльность −1', (g) => (applyEff(g, { happy: -3, loy: -1 }), 'Праздник отложен — люди ворчат.')],
    (g) => g.res.food >= 25,
  ),
  D(
    'preacher',
    '📿',
    'Странствующий проповедник',
    'Бородатый проповедник собрал толпу на площади и говорит о новых духах.',
    ['Позволить', 'знания +25 · счастье +4 · лояльность −2', (g) => (applyEff(g, { know: 25, happy: 4, loy: -2 }), 'Проповедь вдохновила людей, но старики хмурятся.')],
    ['Изгнать', 'лояльность +1 · счастье −2', (g) => (applyEff(g, { loy: 1, happy: -2 }), 'Проповедника проводили за околицу.')],
  ),
  D(
    'hunters',
    '🏹',
    'Охотники требуют награды',
    'Охотники притащили шкуры хищников и ждут благодарности.',
    ['Наградить', '−15 золота · +10 еды · счастье +3 · лояльность +2', (g) => (applyEff(g, { gold: -15, food: 10, happy: 3, loy: 2 }), 'Охотники гордо шагают по селению.')],
    ['Отмахнуться', 'лояльность −2', (g) => (applyEff(g, { loy: -2 }), 'Охотники ушли обиженными.')],
    (g) => g.res.gold >= 15,
  ),
  D(
    'plague',
    '🤒',
    'Слух о хвори',
    'В дальних хижинах кашляют. Лекарка просит дров и еды для отваров.',
    ['Помочь', '−15 еды · −10 дерева · счастье +5', (g) => (applyEff(g, { food: -15, wood: -10, happy: 5 }), 'Отвары помогли, хворь не пошла дальше.')],
    ['Не вмешиваться', 'счастье −6 · лояльность −2', (g) => (applyEff(g, { happy: -6, loy: -2 }), 'Люди испуганы, слухи множатся.')],
    (g) => g.res.food >= 15 && g.res.wood >= 10,
  ),
];

export const dilemmaById = (id: string | null) => DILEMMAS.find((d) => d.id === id) ?? null;

export function resolveDilemma(g: Game, idx: 0 | 1): string | null {
  const x = X(g);
  const d = dilemmaById(x.dil.id);
  if (!d) return null;
  const res = d.opts[idx].go(g);
  x.dil.id = null;
  x.dil.done++;
  x.dil.next = g.time + DAY_LENGTH * rnd(2, 3);
  g.msg(`${d.icon} ${d.title}: ${res}`, 'info');
  chron(g, `Решение правителя — «${d.title}»: ${d.opts[idx].label}`, 'gov');
  g.emit(true);
  return res;
}

function dilemmaTick(g: Game) {
  const x = X(g);
  if (x.dil.id || g.time < x.dil.next || g.gameOver) return;
  const pool = DILEMMAS.filter((d) => !d.when || d.when(g));
  if (!pool.length) {
    x.dil.next = g.time + DAY_LENGTH * 0.5;
    return;
  }
  const d = pool[Math.floor(Math.random() * pool.length)];
  x.dil.id = d.id;
  g.msg(`${d.icon} Дилемма правителя: «${d.title}» — выберите решение`, 'warn');
  g.emit(true);
}

/* ───────────── Купеческая ярмарка ───────────── */

export interface FairItem {
  id: string;
  kind: 'relic' | 'plan' | 'hire';
  icon: string;
  name: string;
  desc: string;
  cost: Partial<Record<'food' | 'wood' | 'stone' | 'goods' | 'gold', number>>;
}

export const FAIR_ITEMS: FairItem[] = [
  { id: 'amulet', kind: 'relic', icon: '📿', name: 'Янтарный оберег', desc: 'Реликвия: лояльность +2 навсегда, счастье +8.', cost: { gold: 45 } },
  { id: 'chalice', kind: 'relic', icon: '🏺', name: 'Чаша предков', desc: 'Реликвия: дети рождаются на 8% чаще, память рода +30.', cost: { gold: 60, food: 10 } },
  { id: 'compass', kind: 'relic', icon: '🧭', name: 'Бронзовый компас', desc: 'Реликвия: разгоняет туман вокруг дальних земель.', cost: { gold: 35, wood: 20 } },
  { id: 'plan1', kind: 'plan', icon: '📜', name: 'Чертёж мастерской', desc: 'Чертёж: +150 знаний.', cost: { gold: 25, goods: 6 } },
  { id: 'plan2', kind: 'plan', icon: '🗺️', name: 'Чертёж механизма', desc: 'Чертёж: +320 знаний.', cost: { gold: 70, goods: 10 } },
  { id: 'archers', kind: 'hire', icon: '🏇', name: 'Конные лучники ×2', desc: 'Наёмники вступают в вашу армию.', cost: { gold: 60, food: 12 } },
];

export const fairOpen = (g: Game) => !!g.x2?.fair.open;

export function buyFair(g: Game, id: string): string | null {
  const F = X(g).fair;
  const it = FAIR_ITEMS.find((i) => i.id === id);
  if (!it || !F.open) return 'Ярмарка закрыта';
  if (F.bought.includes(id)) return 'Это уже куплено';
  for (const k of Object.keys(it.cost) as (keyof FairItem['cost'])[]) if ((g.res[k] ?? 0) < (it.cost[k] ?? 0)) return 'Не хватает ресурсов';
  if (it.kind === 'relic' && X(g).relics.includes(id)) return 'Такая реликвия у вас уже есть';
  if (it.id === 'archers' && g.army + g.awayCount() + 2 > armyCap(g) + 6) return 'Нет места в армии — постройте казарму';
  for (const k of Object.keys(it.cost) as (keyof FairItem['cost'])[]) g.spend(k, it.cost[k] ?? 0);
  F.bought.push(id);
  const px = (F.x + 3) * TW;
  const py = F.y * TH;
  if (it.kind === 'relic') {
    X(g).relics.push(id);
    if (id === 'amulet') applyEff(g, { happy: 8 });
    if (id === 'chalice') g.life.memory += 30;
    if (id === 'compass') {
      const F2 = X(g).fog;
      if (F2) {
        // открываем несколько дальних областей карты
        for (let i = 0; i < 4; i++) revealAround(g, rnd(10, g.world.w - 10), rnd(10, g.world.h - 10), 12);
      }
    }
    g.refreshMods();
  } else if (it.kind === 'plan') {
    g.know += id === 'plan1' ? 150 : 320;
  } else {
    g.army += 2;
    g.life.items.horse_archers = (g.life.items.horse_archers ?? 0) + 2;
  }
  g.floatText(px, py - 6, `${it.icon} куплено`, '#ffe27a');
  g.msg(`Ярмарка: куплено «${it.name}»`, 'good');
  g.sfx('fanfare');
  g.emit(true);
  return null;
}

function findFairSite(g: Game): { x: number; y: number } | null {
  const camp = g.buildings[0];
  if (!camp) return null;
  const w = g.world;
  const cx = camp.x + 1;
  const cy = camp.y + 1;
  const cands: { x: number; y: number; d: number }[] = [];
  for (let y = cy - 16; y <= cy + 16; y++)
    for (let x = cx - 16; x <= cx + 16; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < 6 || d > 16) continue;
      let ok = true;
      for (let yy = y; yy < y + 3 && ok; yy++)
        for (let xx = x; xx < x + 7; xx++) {
          if (xx < 2 || yy < 2 || xx >= w.w - 2 || yy >= w.h - 2) { ok = false; break; }
          const i = yy * w.w + xx;
          if (w.biome[i] <= B.WATER || w.blocked[i] || w.objs[i]) { ok = false; break; }
        }
      if (ok) cands.push({ x, y, d: d + Math.random() * 3 });
    }
  cands.sort((a, b) => a.d - b.d);
  return cands[0] ?? null;
}

function fairTick(g: Game) {
  const F = X(g).fair;
  if (F.open) {
    if (g.time >= F.until) {
      F.open = false;
      F.next = g.time + DAY_LENGTH * rnd(10, 12);
      g.msg('🎪 Ярмарка свернулась — купцы уезжают до следующего раза', 'info');
      g.emit(true);
    }
    return;
  }
  if (g.time < F.next || g.buildings.length < 2) return;
  const site = findFairSite(g);
  if (!site) {
    F.next = g.time + DAY_LENGTH;
    return;
  }
  F.open = true;
  F.x = site.x;
  F.y = site.y;
  F.id++;
  F.until = g.time + DAY_LENGTH;
  F.bought = [];
  g.msg('🎪 На поляне у деревни открылась купеческая ярмарка — один день! Реликвии, чертежи, наёмники', 'good');
  chron(g, 'Разбита купеческая ярмарка', 'info');
  g.sfx('horn', (site.x + 3) * TW, site.y * TH);
  g.ping(site.x + 3, site.y + 1, '#ffe27a');
  g.emit(true);
}

const FAIR_COLS: [string, string][] = [
  ['#c8303a', '#f4ecd8'],
  ['#3a6ad8', '#f4ecd8'],
  ['#d8aa2a', '#7a1a22'],
  ['#2aa86a', '#f4ecd8'],
];
const FAIR_LOOKS: Look[] = [
  { skin: 1, hair: 3, cloth: 2, female: false, style: 0, outfit: 0, beard: true, acc: 2 },
  { skin: 0, hair: 1, cloth: 4, female: true, style: 1, outfit: 2, acc: 0 },
  { skin: 2, hair: 0, cloth: 3, female: false, style: 0, outfit: 1, beard: false, acc: 1, rich: true },
];

function tent(ctx: Ctx, x: number, y: number, a: string, b: string, big: boolean) {
  const w = big ? 26 : 20;
  const h = big ? 18 : 14;
  ctx.fillStyle = 'rgba(10,10,24,0.28)';
  ctx.fillRect(x + 2, y - 1, w, 3);
  ctx.fillStyle = '#4a2e18';
  ctx.fillRect(x, y - h + 4, w, h - 4);
  // полосатая крыша
  for (let i = 0; i < w; i += 4) {
    ctx.fillStyle = (i / 4) % 2 ? b : a;
    ctx.fillRect(x + i, y - h + 4, 4, h - 8);
  }
  // шатёр-конус
  for (let r = 0; r < 6; r++) {
    const ww = w - r * 4;
    if (ww <= 2) break;
    ctx.fillStyle = r % 2 ? b : a;
    ctx.fillRect(x + r * 2, y - h + 4 - r - 1, ww, 1);
  }
  ctx.fillStyle = '#ffe27a';
  ctx.fillRect(x + w / 2 - 1, y - h - 4, 2, 2);
  ctx.fillStyle = a;
  ctx.fillRect(x + w / 2, y - h - 6, 4, 2);
  // прилавок
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(x + 2, y - 5, w - 4, 4);
  ctx.fillStyle = '#a87a46';
  ctx.fillRect(x + 2, y - 5, w - 4, 1);
  ctx.fillStyle = '#ffd45a';
  ctx.fillRect(x + 5, y - 7, 2, 2);
  ctx.fillStyle = '#7fd8e0';
  ctx.fillRect(x + 9, y - 7, 2, 2);
  ctx.fillStyle = '#e06a8a';
  ctx.fillRect(x + w - 8, y - 7, 2, 2);
}

export function drawFair(ctx: Ctx, g: Game, left: number, top: number, vw: number, vh: number) {
  const F = g.x2?.fair;
  if (!F || !F.open) return;
  const bx = F.x * TW;
  const by = (F.y + 3) * TH;
  if (bx > left + vw + 60 || bx + 7 * TW < left - 60 || by < top - 40 || by - 60 > top + vh) return;
  // утоптанная поляна
  ctx.fillStyle = 'rgba(150,120,70,0.35)';
  ctx.fillRect(bx - 4, F.y * TH + 6, 7 * TW + 8, 3 * TH - 4);
  const spots: [number, number, boolean][] = [
    [bx + 2, by - 2, true],
    [bx + 34, by - 6, false],
    [bx + 60, by - 2, true],
    [bx + 90, by - 6, false],
  ];
  spots.forEach(([x, y, big], i) => tent(ctx, Math.round(x), Math.round(y), FAIR_COLS[i % 4][0], FAIR_COLS[i % 4][1], big));
  // торговцы и гирлянда флажков
  FAIR_LOOKS.forEach((lk, i) => {
    const sp = personSprite(lk, i === 1 ? 3 : 0, Math.floor(g.waterT * 1.5 + i) % 3 === 0 ? 0 : 0, 0, false);
    ctx.drawImage(sp, Math.round(bx + 26 + i * 30), Math.round(by - 14 + (i % 2) * 2));
  });
  for (let i = 0; i < 12; i++) {
    const px = bx + 4 + i * 9;
    const py = by - 26 + Math.sin(i * 0.5) * 2 + Math.sin(g.waterT * 3 + i) * 0.6;
    ctx.fillStyle = FAIR_COLS[i % 4][0];
    ctx.fillRect(Math.round(px), Math.round(py), 3, 4);
  }
  ctx.font = '5px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1a1018';
  ctx.strokeText('ЯРМАРКА', bx + 52, by - 34);
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText('ЯРМАРКА', bx + 52, by - 34);
}

/* ───────────── Эпические набеги (драккары) ───────────── */

function vikingTick(g: Game) {
  const s = seasonInfo(g);
  const V = X(g).vik;
  if (g.dev.noRaids || g.mode !== 'play' || g.gameOver) return;
  if (s.idx !== 2 || s.year % 3 !== 0) return;
  if (s.dayIn >= 2 && V.warnYear !== s.year) {
    V.warnYear = s.year;
    g.msg('⚓ На горизонте паруса налётчиков! Завтра они причалят к берегу — укрепляйте оборону', 'warn');
    chron(g, 'Дозорные заметили паруса налётчиков на горизонте', 'war');
    g.sfx('alarm');
    return;
  }
  if (s.dayIn >= 3 && V.warnYear === s.year && V.raidYear !== s.year) {
    V.raidYear = s.year;
    const n = Math.min(30, 10 + s.year * 2);
    const ok = spawnViking(g, n);
    if (ok) {
      g.msg(`🛶 Драккары причаливают к берегу! Налётчиков: ${n}. Победа принесёт богатые трофеи`, 'warn');
      chron(g, `Драккары налётчиков высадили ${n} воинов`, 'war');
      g.sfx('horn');
    } else g.msg('Паруса налётчиков скрылись за горизонтом — берег им не по зубам', 'info');
  }
}

/* ───────────── Деревенские животные ───────────── */

function pettable(g: Game, x: number, y: number) {
  const w = g.world;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 1 || ty < 1 || tx >= w.w - 1 || ty >= w.h - 1) return false;
  const i = ty * w.w + tx;
  return w.biome[i] > B.WATER && !w.blocked[i];
}

function spawnPet(g: Game, species: Pet['species'], b: Building) {
  const x = X(g);
  for (let k = 0; k < 12; k++) {
    const px = b.x + b.w / 2 + rnd(-2.5, 2.5);
    const py = b.y + b.h + rnd(0.3, 2.2);
    if (!pettable(g, px, py)) continue;
    x.pets.push({ id: x.petId++, species, x: px, y: py, hx: b.x + b.w / 2, hy: b.y + b.h + 1, tx: px, ty: py, dir: 0, wait: rnd(0.5, 3), anim: Math.random() * 6, bark: 0, home: b.id });
    return;
  }
}

function petSync(g: Game) {
  const x = X(g);
  const done = g.buildings.filter((b) => b.done);
  const lodges = done.filter((b) => b.type === 'lodge' || b.type === 'tb_logcamp');
  const pastures = done.filter((b) => b.type === 'tb_pasture');
  const houses = done.filter((b) => b.type !== 'camp' && (BUILDINGS[b.type].housing ?? 0) > 0 && b.w * b.h <= 6 && (b.type === 'house' || BUILDINGS[b.type].arch === 'home' || b.type === 'shelter'));
  const want = { dog: Math.min(4, lodges.length + pastures.length), sheep: Math.min(8, pastures.length * 3), hen: Math.min(8, houses.length * 2) };
  const have = { dog: 0, sheep: 0, hen: 0 };
  for (const p of x.pets) have[p.species]++;
  const homes = (list: Building[]) => (list.length ? list[Math.floor(Math.random() * list.length)] : null);
  if (have.dog < want.dog) {
    const b = homes([...lodges, ...pastures]);
    if (b) spawnPet(g, 'dog', b);
  }
  if (have.sheep < want.sheep) {
    const b = homes(pastures);
    if (b) spawnPet(g, 'sheep', b);
  }
  if (have.hen < want.hen) {
    const b = homes(houses);
    if (b) spawnPet(g, 'hen', b);
  }
  // потеряли дом — животное уходит
  const ids = new Set(g.buildings.map((b) => b.id));
  x.pets = x.pets.filter((p) => ids.has(p.home));
}

function petsStep(g: Game, dt: number) {
  const x = X(g);
  if (!x.pets.length) return;
  const wolves = g.life.animals.filter((a) => a.hp > 0 && (a.kind === 'wolf' || a.kind === 'bear'));
  const night = g.nightK > 0.3;
  for (const p of x.pets) {
    p.bark = Math.max(0, p.bark - dt);
    let spd = p.species === 'dog' ? 1.5 : p.species === 'hen' ? 0.9 : 0.55;
    let tx = p.tx;
    let ty = p.ty;
    if (p.species === 'dog') {
      // сторожевой пёс: бежит к волку или ночному вору и лает
      let tgt: { x: number; y: number; kind: 'wolf' | 'thief' } | null = null;
      let bd = 11;
      for (const w of wolves) {
        const d = Math.hypot(w.x - p.x, w.y - p.y);
        if (d < bd) {
          bd = d;
          tgt = { x: w.x, y: w.y, kind: 'wolf' };
          if (d < 3 && Math.random() < dt * 2) w.scare = Math.max(w.scare ?? 0, 2.5);
        }
      }
      for (const r of g.life.raiders) {
        const d = Math.hypot(r.unit.x - p.x, r.unit.y - p.y);
        if (d < bd) {
          bd = d;
          tgt = { x: r.unit.x, y: r.unit.y, kind: 'thief' };
          if (d < 2.5 && r.kind === 'thief' && r.state !== 'flee' && Math.random() < dt * 1.5) r.state = 'flee';
        }
      }
      if (tgt) {
        tx = tgt.x;
        ty = tgt.y;
        spd = 3.1;
        if (bd > 1.8 && p.bark <= 0) {
          p.bark = 2.8;
          g.floatText(p.x * TW, p.y * TH - 12, Math.random() < 0.5 ? 'Гав!' : 'Гав-гав!', '#ffe9a8');
          g.sfx('battle', p.x * TW, p.y * TH);
        }
        if (bd < 1.6) {
          tx = p.x;
          ty = p.y;
        }
        p.wait = 0;
      }
    }
    if (p.wait > 0 && !(p.species === 'dog' && p.bark > 0)) {
      p.wait -= dt;
      if (p.wait > 0) continue;
      const R = p.species === 'dog' ? 6 : 2.6;
      for (let k = 0; k < 8; k++) {
        const nx = p.hx + rnd(-R, R);
        const ny = p.hy + rnd(-R * 0.7, R * 0.7);
        if (pettable(g, nx, ny)) {
          p.tx = nx;
          p.ty = ny;
          break;
        }
      }
      tx = p.tx;
      ty = p.ty;
    }
    if (night && p.species !== 'dog' && Math.hypot(p.x - p.hx, p.y - p.hy) < 2.5) continue; // куры и овцы спят
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.15) {
      p.wait = rnd(1.5, 6);
      continue;
    }
    const st = Math.min(d, spd * dt);
    const nx = p.x + (dx / d) * st;
    const ny = p.y + (dy / d) * st;
    if (!pettable(g, nx, ny)) {
      p.wait = 0.4;
      p.tx = p.x;
      p.ty = p.y;
      continue;
    }
    p.x = nx;
    p.y = ny;
    p.anim += dt * spd * 4;
    if (Math.abs(dx) > Math.abs(dy)) p.dir = dx > 0 ? 2 : 3;
  }
}

export function drawPet(ctx: Ctx, _g: Game, p: Pet) {
  const x = Math.round(p.x * TW);
  const y = Math.round(p.y * TH);
  const left = p.dir === 3;
  const f = (v: number, w = 1) => (left ? -v - w + 1 : v);
  const R = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + (left ? -dx - w + 1 : dx), y + dy, w, h);
  };
  void f;
  const step = Math.floor(p.anim) % 2;
  ctx.fillStyle = 'rgba(10,10,24,0.28)';
  ctx.fillRect(x - 5, y - 1, 11, 2);
  if (p.species === 'dog') {
    const run = p.bark > 0 ? 1 : 0;
    R(-4, -7, 8, 4, '#8a5e36');
    R(-4, -7, 8, 1, '#b08052');
    R(3, -9, 4, 4, '#8a5e36');
    R(6, -8, 2, 2, '#3a2412');
    R(3, -10, 1, 2, '#4a2e18');
    R(-6, -8 - (step && run ? 1 : 0), 2, 2, '#6a4524');
    R(-3, -3, 1, 3 - (step ? 1 : 0), '#6a4524');
    R(2, -3, 1, 3 - (step ? 0 : 1), '#6a4524');
    R(-1, -3, 1, 2, '#4a2e18');
    if (p.bark > 2.2) R(8, -7, 1, 1, '#ffe9a8');
  } else if (p.species === 'hen') {
    R(-2, -5, 5, 3, '#f4ecd8');
    R(-2, -5, 5, 1, '#fff');
    R(2, -7, 2, 2, '#f4ecd8');
    R(2, -8, 1, 1, '#d8302a');
    R(4, -6, 1, 1, '#f0a020');
    R(-3, -6, 1, 2, '#d8d0b8');
    R(-1, -2, 1, 2, '#e8a030');
    R(1, -2 + (step ? 1 : 0), 1, 2 - (step ? 1 : 0), '#e8a030');
  } else {
    R(-4, -7, 8, 5, '#f0ede4');
    R(-3, -8, 6, 1, '#fffdf4');
    R(-4, -4, 8, 1, '#d8d4c6');
    R(3, -7, 3, 3, '#3a3228');
    R(3, -8, 1, 1, '#3a3228');
    R(-3, -2, 1, 2, '#3a3228');
    R(2, -2, 1, 2 - (step ? 1 : 0), '#3a3228');
  }
}

/* ───────────── Пар изо рта и грозы ───────────── */

function steamTick(g: Game) {
  const s = seasonInfo(g);
  if (!s.winter) return;
  const list: Unit[] = [...g.units, ...g.guards];
  const L = g.viewLeft;
  const T = g.viewTop;
  const vw = g.cw / g.scale;
  const vh = g.ch / g.scale;
  for (const u of list) {
    if (u.sleeping || u.child && Math.random() < 0.3) continue;
    const px = u.x * TW;
    const py = u.y * TH;
    if (px < L - 20 || px > L + vw + 20 || py < T - 20 || py > T + vh + 20) continue;
    if (Math.random() > 0.2) continue;
    const dir = u.dir === 3 || u.fx === 3 ? -1 : 1;
    g.particles.push({ x: px + dir * 3.5, y: py - 12, vx: dir * 3 + rnd(-0.6, 0.6), vy: -3.2 - Math.random() * 1.2, life: 1.1, max: 1.1, color: 'rgba(240,248,255,0.72)', size: 1, grav: 0, grow: 2.2 });
  }
}

function thunderTick(g: Game, dt: number) {
  const T = X(g).th;
  T.flash = Math.max(0, T.flash - dt * 2.4);
  if (T.boom > 0) {
    T.boom -= dt;
    if (T.boom <= 0) {
      T.boom = -1;
      g.sfx('thunder');
    }
  }
  const s = seasonInfo(g);
  const heavy = s.idx === 2 && rainK(g) > 0.62;
  if (!heavy) return;
  T.next -= dt;
  if (T.next <= 0) {
    T.next = rnd(14, 32);
    T.flash = 1;
    T.bx = rnd(0.15, 0.85);
    T.boom = rnd(0.5, 1.6);
  }
}

/** вспышка молнии на весь экран (экранные координаты) */
export function drawLightning(ctx: Ctx, g: Game, cw: number, ch: number) {
  const T = g.x2?.th;
  if (!T || T.flash <= 0.02) return;
  const pulse = T.flash > 0.65 ? 1 : T.flash > 0.5 ? 0.35 : T.flash > 0.3 ? 0.8 : T.flash;
  ctx.fillStyle = `rgba(225,235,255,${0.5 * pulse})`;
  ctx.fillRect(0, 0, cw, ch);
  if (T.flash > 0.45) {
    // сама молния: ломаная линия от неба до земли
    let x = T.bx * cw;
    let y = 0;
    const seed = Math.floor(T.bx * 1000);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(2, g.scale);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i < 9; i++) {
      x += Math.sin(seed * 7.3 + i * 4.1) * cw * 0.04;
      y += (ch * 0.55) / 9;
      ctx.lineTo(Math.round(x), Math.round(y));
    }
    ctx.stroke();
  }
}

/* ───────────── Главный цикл ───────────── */

let slow = 0;
let tickG: Game | null = null;

export function extraUpdate(g: Game, dt: number) {
  if (g.mode !== 'play' || !g.x2) return;
  if (tickG !== g) {
    tickG = g;
    slow = 0;
    fogDirty = true;
  }
  // быстрое: питомцы, гроза, обряд охоты
  petsStep(g, dt);
  thunderTick(g, dt);
  if (riteIs(g, 'hunt')) {
    for (const a of g.life.animals) if ((a.kind === 'wolf' || a.kind === 'bear') && a.state === 'chase' && a.hp > 0) {
      const inForest = !g.buildings.some((b) => Math.hypot(b.x - a.x, b.y - a.y) < 4);
      if (inForest) {
        a.state = 'flee';
        a.scare = Math.max(a.scare ?? 0, 4);
      }
    }
  }
  slow -= dt;
  if (slow > 0) return;
  slow = 0.5;
  steamTick(g);
  fogTick(g);
  bridgesTick(g);
  installBridgeSprite(g);
  const X2 = X(g);
  // раз в секунду: опыт, реплики, события
  if (Math.floor(g.time) % 2 === 0) masteryTick(g);
  petSync(g);
  dilemmaTick(g);
  fairTick(g);
  vikingTick(g);
  if (X2.rite.id && X2.rite.key !== seasonKey(g)) {
    X2.rite = { id: null, key: -1 };
    g.refreshMods();
    g.msg('Срок покровительства духов истёк — выберите нового покровителя в святилище', 'info');
  }
  void dayNo;
  void crestColor;
  void drawSym;
}

/** первичная настройка нового мира (после startGame) */
export function extraStart(g: Game, crest: CrestSel) {
  const w = g.world;
  g.x2 = createExtra(true, w.w, w.h);
  g.x2.crest = { ...crest };
  const camp = g.buildings[0];
  if (camp) revealAround(g, camp.x + 1, camp.y + 1, 18);
  installBridgeSprite(g);
  fogDirty = true;
}
