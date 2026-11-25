import { BUILDINGS, STORED, TH, TW, type BuildingId, type ResKey } from './data';
import type { Building, Game, Unit } from './game';
import { giveTask, sendToJob, smoothFocus } from './rts';
import { RECIPE_BY_ID } from './lifeData';
import type { Obj } from './worldgen';

/* ───────────── Удобства управления: зоны добычи, умный ПКМ, баланс племени, откат, подсказки «почему стоит» ───────────── */

type Kind = 'chop' | 'gather' | 'mine';
const RES_OF: Record<Kind, ResKey> = { chop: 'wood', gather: 'food', mine: 'stone' };

const matches = (g: Game, kind: Kind, o: Obj | null): boolean => {
  if (!o) return false;
  if (o.amount <= 0) return false;
  if (kind === 'chop') return g.isChoppable(o) && o.kind !== 'cactus';
  if (kind === 'gather') return o.kind === 'bush';
  return o.kind === 'rock';
};

/* ---------- 1. Зоны авто-добычи ---------- */

export interface WorkZone {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  n: { wood: number; food: number; stone: number };
}

function countZone(g: Game, z: WorkZone) {
  const n = { wood: 0, food: 0, stone: 0 };
  const w = g.world;
  for (let y = z.y0; y <= z.y1; y++)
    for (let x = z.x0; x <= z.x1; x++) {
      const o = w.objs[y * w.w + x];
      if (!o || o.amount <= 0) continue;
      if (matches(g, 'chop', o)) n.wood++;
      else if (o.kind === 'bush') n.food++;
      else if (o.kind === 'rock') n.stone++;
    }
  z.n = n;
  return n.wood + n.food + n.stone;
}

export function addWorkZone(g: Game, wx0: number, wy0: number, wx1: number, wy1: number): string | null {
  const w = g.world;
  const x0 = Math.max(0, Math.floor(Math.min(wx0, wx1) / TW));
  const x1 = Math.min(w.w - 1, Math.floor(Math.max(wx0, wx1) / TW));
  const y0 = Math.max(0, Math.floor(Math.min(wy0, wy1) / TH));
  const y1 = Math.min(w.h - 1, Math.floor(Math.max(wy0, wy1) / TH));
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 3600) return 'Зона слишком большая — обведите участок поменьше';
  const z: WorkZone = { id: g.nextId++, x0, y0, x1, y1, n: { wood: 0, food: 0, stone: 0 } };
  if (countZone(g, z) === 0) return 'В рамке нет деревьев, ягод или камней';
  g.workZones.push(z);
  // уже работающие добытчики сразу переключаются на отмеченный участок
  let moved = 0;
  for (const u of g.units) {
    const k = u.task.type;
    if ((k !== 'chop' && k !== 'gather' && k !== 'mine') || u.child || u.spawn > 0 || u.task.q) continue;
    const t = zoneTarget(g, u, k);
    if (!t || (u.task.tx === t.tx && u.task.ty === t.ty)) continue;
    u.task.tx = t.tx;
    u.task.ty = t.ty;
    u.task.tries = 0;
    u.task.wait = 0;
    u.path = [];
    if (u.carry.n === 0 || u.carry.type === RES_OF[k]) u.phase = 'goto';
    moved++;
  }
  g.wakeEpoch++;
  g.msg(`Зона добычи: 🪵${z.n.wood} 🫐${z.n.food} 🪨${z.n.stone}. Добытчики займутся ею в первую очередь${moved ? ` (переключено ${moved})` : ''}`, 'good');
  g.sfx('click');
  return null;
}

export function removeZoneAt(g: Game, wx: number, wy: number): boolean {
  const tx = Math.floor(wx / TW);
  const ty = Math.floor(wy / TH);
  const i = g.workZones.findIndex((z) => tx >= z.x0 && tx <= z.x1 && ty >= z.y0 && ty <= z.y1);
  if (i < 0) return false;
  g.workZones.splice(i, 1);
  g.msg('Зона добычи снята', 'info');
  return true;
}

/** ближайшая цель нужного вида внутри любой зоны игрока (приоритет над всем остальным) */
export function zoneTarget(g: Game, u: Unit, kind: Kind): { tx: number; ty: number } | null {
  if (!g.workZones.length) return null;
  const w = g.world;
  let best: Obj | null = null;
  let bd = 1e9;
  for (const z of g.workZones)
    for (let y = z.y0; y <= z.y1; y++)
      for (let x = z.x0; x <= z.x1; x++) {
        const o = w.objs[y * w.w + x];
        if (!matches(g, kind, o)) continue;
        if (g.bad.has(y * w.w + x) || !g.hasFreeAdj(x, y)) continue;
        const d = (x + 0.5 - u.x) ** 2 + (y + 0.5 - u.y) ** 2;
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
  const b = best as Obj | null;
  return b ? { tx: b.tx, ty: b.ty } : null;
}

/** раз в секунду: обновить счётчики, убрать вычищенные зоны */
export function zonesTick(g: Game, dt: number) {
  if (!g.workZones.length) return;
  g.zoneT -= dt;
  if (g.zoneT > 0) return;
  g.zoneT = 1;
  for (let i = g.workZones.length - 1; i >= 0; i--) {
    if (countZone(g, g.workZones[i]) === 0) {
      const z = g.workZones[i];
      g.workZones.splice(i, 1);
      g.msg('✔ Зона добычи очищена — участок свободен', 'good');
      g.ping(Math.floor((z.x0 + z.x1) / 2), Math.floor((z.y0 + z.y1) / 2), '#8aff9a');
    }
  }
}

/* ---------- 2. Умный контекстный ПКМ и пипетка ---------- */

/** ближайший свободный житель (потом — добытчик) для приказа без выделения */
function nearestFree(g: Game, tx: number, ty: number, skipCraft = true): Unit | null {
  let best: Unit | null = null;
  let bs = 1e9;
  for (const u of g.units) {
    if (u.child || u.spawn > 0 || u.cb || u.sleeping || u.role !== 'none' || u.status !== 'free') continue;
    const t = u.task.type;
    const rank = t === 'idle' || t === 'move' ? 0 : t === 'chop' || t === 'gather' || t === 'mine' ? 1 : -1;
    if (rank < 0 || (skipCraft && t === 'craft')) continue;
    const sc = rank * 60 + Math.hypot(u.x - tx, u.y - ty);
    if (sc < bs) {
      bs = sc;
      best = u;
    }
  }
  return best;
}

/** ПКМ без выделенных людей: стройка → позвать строителя, цех → поставить работника, ресурс → ближайший свободный */
export function smartContextNoSel(g: Game, wx: number, wy: number): boolean {
  const site = g.pickSite(wx, wy);
  if (site) {
    const err = g.callBuilder(site.id);
    if (err) g.msg(err, 'warn');
    return true;
  }
  const bld = g.pickBuilding(wx, wy);
  if (bld && g.isStaffable(bld)) {
    const err = g.staffAdd(bld.id);
    if (err) g.msg(`«${BUILDINGS[bld.type].name}»: ${err}`, 'warn');
    else g.msg(`В «${BUILDINGS[bld.type].name}» встал работник (${bld.staff.length}/${g.staffSlots(bld)})`, 'good');
    return true;
  }
  const o = g.pickObj(wx, wy);
  if (!o) return false;
  const kind: Kind | null = g.isChoppable(o) ? 'chop' : o.kind === 'bush' && o.amount > 0 ? 'gather' : o.kind === 'rock' ? 'mine' : null;
  if (!kind) return false;
  if (kind === 'mine' && !g.done.has('stone_tools')) {
    g.msg('Для добычи камня изучите «Каменные орудия»', 'warn');
    return true;
  }
  const u = nearestFree(g, o.tx, o.ty);
  if (!u) {
    g.msg('Свободных людей нет — выделите кого-нибудь', 'warn');
    return true;
  }
  if (kind === 'chop') g.orderChop([u], o.tx, o.ty, true);
  else if (kind === 'gather') g.orderGather([u], o.tx, o.ty);
  else g.orderMine([u], o.tx, o.ty);
  g.msg(`${u.name} идёт ${kind === 'chop' ? 'рубить' : kind === 'gather' ? 'собирать ягоды' : 'добывать камень'}`, 'info');
  return true;
}

/** двойной ПКМ по лесу/камням/ягодам: группа делится и разбирает все такие же цели в радиусе 8 клеток */
export function areaHarvest(g: Game, wx: number, wy: number, units: Unit[]): boolean {
  const o0 = g.pickObj(wx, wy);
  if (!o0) return false;
  const kind: Kind | null = matches(g, 'chop', o0) ? 'chop' : matches(g, 'gather', o0) ? 'gather' : matches(g, 'mine', o0) ? 'mine' : null;
  if (!kind) return false;
  if (kind === 'mine' && !g.done.has('stone_tools')) {
    g.msg('Для добычи камня изучите «Каменные орудия»', 'warn');
    return true;
  }
  const w = g.world;
  const R = 8;
  const found: Obj[] = [];
  for (let y = Math.max(0, o0.ty - R); y <= Math.min(w.h - 1, o0.ty + R); y++)
    for (let x = Math.max(0, o0.tx - R); x <= Math.min(w.w - 1, o0.tx + R); x++) {
      const o = w.objs[y * w.w + x];
      if (!matches(g, kind, o) || (x - o0.tx) ** 2 + (y - o0.ty) ** 2 > R * R) continue;
      found.push(o!);
    }
  if (!found.length) return false;
  if (kind === 'chop')
    for (const o of found) {
      o.marked = true;
      g.marked.add(o.ty * w.w + o.tx);
      g.bad.delete(o.ty * w.w + o.tx);
    }
  const taken = new Set<number>();
  for (const u of units) {
    let best: Obj | null = null;
    let bd = 1e9;
    for (const pass of [0, 1]) {
      for (const o of found) {
        if (pass === 0 && taken.has(o.id)) continue;
        const d = (o.tx + 0.5 - u.x) ** 2 + (o.ty + 0.5 - u.y) ** 2;
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      if (best) break;
      taken.clear();
    }
    if (!best) continue;
    taken.add(best.id);
    giveTask(g, u, { type: kind, tx: best.tx, ty: best.ty, site: 0, auto: true }, false);
  }
  g.msg(`Двойной ПКМ: ${units.length} чел. разбирают ${kind === 'chop' ? 'деревья' : kind === 'gather' ? 'кусты' : 'камни'} вокруг (${found.length} шт.)`, 'good');
  g.ping(o0.tx, o0.ty, '#ffd27a');
  return true;
}

/** СКМ по зданию — взять такой же чертёж в курсор */
export function pipette(g: Game, wx: number, wy: number): boolean {
  const b = g.pickBuilding(wx, wy);
  if (!b) return false;
  if (b.type === 'camp' || b.type === 'manor') {
    g.msg('Стоянку и усадьбу копировать нельзя', 'warn');
    return true;
  }
  if (!g.isUnlocked(b.type)) return true;
  g.setBuildType(b.type as BuildingId);
  g.msg(`🧪 Пипетка: чертёж «${BUILDINGS[b.type].name}». ЛКМ — поставить, ПКМ — отмена`, 'info');
  return true;
}

/* ---------- 3. Баланс племени ---------- */

export type BalanceId = 'food' | 'build' | 'equal' | 'war';
export const BALANCES: { id: BalanceId; icon: string; name: string; hint: string }[] = [
  { id: 'food', icon: '🌾', name: 'Выживание', hint: '60% ягоды и еда · 30% дерево · 10% стройка' },
  { id: 'build', icon: '🪓', name: 'Большая стройка', hint: '50% дерево · 25% камень · 25% стройка' },
  { id: 'equal', icon: '⚖️', name: 'Равный баланс', hint: 'Поровну: дерево, еда, камень' },
  { id: 'war', icon: '🛡️', name: 'Военный сбор', hint: 'Максимум людей — в оружейные цеха, остальные на камень и дерево' },
];

const WEAPON_SHOPS = new Set(['workshop', 'bowyer', 'forge', 'armory', 'gunsmith', 'siegeworks', 'stable']);

export function applyBalance(g: Game, id: BalanceId): string | null {
  const pool = g.units.filter((u) => !u.child && u.spawn <= 0 && !u.cb && !u.sleeping && u.role === 'none' && u.status === 'free' && ['idle', 'move', 'chop', 'gather', 'mine', 'build'].includes(u.task.type) && !(u.flee && u.flee > 0));
  if (!pool.length) return 'Некого перераспределять — все заняты в цехах или спят';
  const stoneOk = g.done.has('stone_tools');
  const hasSites = g.buildings.some((b) => !b.done);
  const kindOf = (u: Unit): Kind | 'build' | 'free' => {
    const t = u.task.type;
    return t === 'chop' || t === 'gather' || t === 'mine' || t === 'build' ? t : 'free';
  };
  let rest = pool.slice();
  let staffed = 0;
  let wts: Record<string, number>;
  if (id === 'war') {
    const shops = g.buildings.filter((b) => b.done && WEAPON_SHOPS.has(b.type) && g.isStaffable(b));
    for (const b of shops) {
      g.staffUnits(b);
      while (b.staff.length < g.staffSlots(b) && rest.length) {
        rest.sort((a, c) => (kindOf(a) === 'free' ? 0 : 1000) + Math.hypot(a.x - b.x, a.y - b.y) - ((kindOf(c) === 'free' ? 0 : 1000) + Math.hypot(c.x - b.x, c.y - b.y)));
        const u = rest.shift()!;
        if (g.assignStaff(u, b)) break;
        staffed++;
      }
    }
    wts = stoneOk ? { mine: 0.5, chop: 0.5 } : { chop: 1 };
  } else if (id === 'food') wts = { gather: 0.6, chop: 0.3, build: 0.1 };
  else if (id === 'build') wts = stoneOk ? { chop: 0.5, mine: 0.25, build: 0.25 } : { chop: 0.7, build: 0.3 };
  else wts = stoneOk ? { chop: 1, gather: 1, mine: 1 } : { chop: 1, gather: 1 };
  if (!hasSites) delete wts.build;
  if (!stoneOk) delete wts.mine;
  const keys = Object.keys(wts);
  const sum = keys.reduce((a, k) => a + wts[k], 0);
  const N = rest.length;
  const target: Record<string, number> = {};
  let used = 0;
  const fr: [string, number][] = [];
  for (const k of keys) {
    const v = (wts[k] / sum) * N;
    target[k] = Math.floor(v);
    used += target[k];
    fr.push([k, v - target[k]]);
  }
  fr.sort((a, b) => b[1] - a[1]);
  for (let i = 0; used < N; i++, used++) target[fr[i % fr.length][0]]++;
  const cur: Record<string, Unit[]> = { chop: [], gather: [], mine: [], build: [], free: [] };
  for (const u of rest) cur[kindOf(u)].push(u);
  const supply: Unit[] = [...cur.free];
  for (const k of ['chop', 'gather', 'mine', 'build']) {
    const have = cur[k];
    const want = target[k] ?? 0;
    if (have.length > want) {
      have.sort((a, b) => a.carry.n - b.carry.n);
      supply.push(...have.slice(0, have.length - want));
    }
  }
  let moved = 0;
  for (const k of keys) {
    const need = target[k] - cur[k].length;
    for (let i = 0; i < need && supply.length; i++) {
      const f = k === 'build' ? g.buildings.find((b) => !b.done) : null;
      const fx = f ? f.x : g.mainCamp()?.x ?? 0;
      const fy = f ? f.y : g.mainCamp()?.y ?? 0;
      supply.sort((a, b) => Math.hypot(a.x - fx, a.y - fy) - Math.hypot(b.x - fx, b.y - fy));
      const u = supply.shift()!;
      if (!sendToJob(g, u, k as Kind | 'build')) moved++;
    }
  }
  g.balance = id;
  g.wakeEpoch++;
  const b = BALANCES.find((x) => x.id === id)!;
  g.msg(`${b.icon} «${b.name}»: перераспределено ${moved + staffed} чел. (мастера в цехах не тронуты)`, 'good');
  g.emit(true);
  return null;
}

/* ---------- 4. Массовый наём ---------- */

export function fillShop(g: Game, bid: number): number {
  const b = g.buildings.find((q) => q.id === bid);
  if (!b || !g.isStaffable(b)) return 0;
  let n = 0;
  for (let i = 0; i < 30; i++) {
    if (g.staffAdd(bid)) break;
    n++;
  }
  g.emit(true);
  return n;
}

export function fillAllShops(g: Game): string | null {
  let n = 0;
  for (const b of g.buildings) if (b.done && g.isStaffable(b)) n += fillShop(g, b.id);
  if (!n) return 'Нет свободных людей или мест в цехах';
  g.msg(`👷 Заполнены рабочие места: +${n}`, 'good');
  return null;
}

export function siteHoverAdd(g: Game): void {
  const s = g.pickSite(g.mouse.wx, g.mouse.wy);
  if (!s) return;
  const err = g.callBuilder(s.id);
  if (err) g.msg(err, 'warn');
}

export function siteHoverRemove(g: Game): void {
  const s = g.pickSite(g.mouse.wx, g.mouse.wy);
  if (!s) return;
  const list = g.units.filter((u) => u.task.type === 'build' && u.task.site === s.id);
  if (!list.length) return;
  list.sort((a, b) => Math.hypot(b.x - s.x, b.y - s.y) - Math.hypot(a.x - s.x, a.y - s.y));
  g.setIdle(list[0]);
  g.msg(`${list[0].name} снят со стройки`, 'info');
  g.emit(true);
}

/* ---------- 5. «Почему стоит?» ---------- */

export interface Badge {
  wx: number;
  wy: number;
  text: string;
  tone: 'bad' | 'warn' | 'info';
  act?: { k: 'site'; id: number };
  rect?: { x0: number; y0: number; x1: number; y1: number };
}

function lackOf(g: Game, b: Building): string | null {
  const need: Record<string, number> = {};
  const P = g.life.prod[b.id];
  const q = P?.queue[0];
  const r = q ? RECIPE_BY_ID[q.recipe] : null;
  if (r) for (const k of Object.keys(r.in)) need[k] = r.in[k];
  const pr = BUILDINGS[b.type].prod;
  if (pr) for (const k of Object.keys(pr.in)) need[k] = Math.max(need[k] ?? 0, pr.in[k as ResKey] ?? 0);
  if ((need.wood ?? 0) > g.res.wood) return '🪵! Нет дерева';
  if ((need.stone ?? 0) > g.res.stone) return '🪨! Нет камня';
  return null;
}

export function computeBadges(g: Game): Badge[] {
  const out: Badge[] = [];
  const v = { x0: g.cam.x - g.cw / g.scale / 2 - 40, x1: g.cam.x + g.cw / g.scale / 2 + 40, y0: g.cam.y - g.ch / g.scale / 2 - 40, y1: g.cam.y + g.ch / g.scale / 2 + 60 };
  for (const b of g.buildings) {
    const wx = (b.x + b.w / 2) * TW;
    const wy = b.y * TH - 5;
    if (wx < v.x0 || wx > v.x1 || wy < v.y0 || wy > v.y1) continue;
    if (!b.done) {
      if (g.siteBuilders(b.id) === 0) out.push({ wx, wy, text: '🔨 Ждёт строителя', tone: 'warn', act: { k: 'site', id: b.id } });
      continue;
    }
    if (!g.isStaffable(b)) continue;
    const jobs = g.staffSlots(b);
    const n = Math.min(jobs, b.staff?.length ?? 0);
    const lack = lackOf(g, b);
    let row = 0;
    if (lack) out.push({ wx, wy: wy - 0 - row++ * -1, text: lack, tone: 'bad' });
    if (n < jobs) out.push({ wx, wy: wy + (lack ? 0 : 0), text: `👷 ${n}/${jobs}`, tone: n === 0 ? 'bad' : 'info' });
  }
  let cnt = 0;
  for (const u of g.units) {
    if (cnt >= 10) break;
    const t = u.task.type;
    if (t !== 'chop' && t !== 'gather' && t !== 'mine') continue;
    if (u.carry.n <= 0 || u.spawn > 0) continue;
    if (g.res[RES_OF[t]] < g.capVal) continue;
    const wx = u.x * TW;
    const wy = u.y * TH - 22;
    if (wx < v.x0 || wx > v.x1 || wy < v.y0 || wy > v.y1) continue;
    out.push({ wx, wy, text: '📦 Склад полон', tone: 'warn' });
    cnt++;
  }
  return out;
}

export function badgeAt(g: Game, sx: number, sy: number): Badge | null {
  for (const b of g.badges) if (b.rect && sx >= b.rect.x0 && sx <= b.rect.x1 && sy >= b.rect.y0 && sy <= b.rect.y1) return b;
  return null;
}

export function clickBadge(g: Game, b: Badge): boolean {
  if (b.act?.k === 'site') {
    const err = g.callBuilder(b.act.id);
    if (err) g.msg(err, 'warn');
    return true;
  }
  return false;
}

/* ---------- 6. Камера ---------- */

export function camHome(g: Game) {
  const c = g.mainCamp();
  if (!c) return;
  g.camIdx = 0;
  smoothFocus(g, (c.x + 0.5) * TW, (c.y + 0.5) * TH);
  g.msg('🏠 Камера — к главной Стоянке', 'info');
}

export function camCycle(g: Game) {
  const c = g.mainCamp();
  const list: { x: number; y: number; name: string }[] = [];
  if (c) list.push({ x: (c.x + 0.5) * TW, y: (c.y + 0.5) * TH, name: `Стоянка «${g.name}»` });
  for (const t of g.towns) if (t.owner === 'player') list.push({ x: (t.x + 0.5) * TW, y: (t.y + 0.5) * TH, name: t.name });
  if (!list.length) return;
  g.camIdx = (g.camIdx + 1) % list.length;
  const t = list[g.camIdx];
  smoothFocus(g, t.x, t.y);
  g.msg(`📍 ${t.name} (${g.camIdx + 1}/${list.length}) — Tab: следующая`, 'info');
}

/* ---------- 7. Откат (Ctrl+Z, 15 секунд) ---------- */

export const UNDO_SEC = 15;

export interface UndoRec {
  at: number;
  label: string;
  kind: 'place' | 'demolish';
  id?: number;
  type: BuildingId;
  x: number;
  y: number;
  done: boolean;
  progress: number;
  refund: Partial<Record<ResKey, number>>;
}

export function recordUndo(g: Game, rec: Omit<UndoRec, 'at'>) {
  g.undoRec = { ...rec, at: performance.now() };
}

export function undoLeft(g: Game): number {
  if (!g.undoRec) return 0;
  return Math.max(0, UNDO_SEC - (performance.now() - g.undoRec.at) / 1000);
}

export function undoLast(g: Game): string | null {
  const r = g.undoRec;
  if (!r || undoLeft(g) <= 0) {
    g.undoRec = null;
    return 'Нечего отменять (откат доступен 15 секунд)';
  }
  const def = BUILDINGS[r.type];
  if (r.kind === 'place') {
    const b = g.buildings.find((q) => q.id === r.id);
    g.undoRec = null;
    if (!b) return 'Эта постройка уже убрана';
    for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) g.world.blocked[yy * g.world.w + xx] = 0;
    for (const u of g.staffUnits(b)) g.setIdle(u);
    for (const u of g.units) if (u.task.type === 'build' && u.task.site === b.id) g.setIdle(u);
    g.buildings = g.buildings.filter((q) => q.id !== b.id);
    if (!g.dev.freeBuild) for (const k of STORED) g.res[k] += def.cost[k] ?? 0;
    if (g.selBuilding === b.id) g.selBuilding = null;
    g.msg(`↶ Отменено: «${def.name}» — ресурсы возвращены полностью`, 'good');
    return null;
  }
  // откат сноса
  for (let yy = r.y; yy < r.y + def.h; yy++)
    for (let xx = r.x; xx < r.x + def.w; xx++) if (g.world.blocked[yy * g.world.w + xx] || g.buildingAt(xx, yy)) return 'Место уже занято — восстановить нельзя';
  for (const k of STORED) if ((r.refund[k] ?? 0) > g.res[k]) return 'Не хватает ресурсов, чтобы вернуть здание (нужно вернуть полученное при сносе)';
  for (const k of STORED) g.spend(k, r.refund[k] ?? 0);
  const b = g.addBuilding(r.type, r.x, r.y, r.done);
  b.progress = r.progress;
  g.undoRec = null;
  g.msg(`↶ Отменено: «${def.name}» восстановлено`, 'good');
  return null;
}
