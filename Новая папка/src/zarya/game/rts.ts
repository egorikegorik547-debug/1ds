import { FOOD, TW, TH } from './data';
import type { Building, Game, Task, Unit } from './game';

/* ───────────── RTS-удобства: очередь приказов, авто-наём, группы, циклический поиск, плавный перелёт камеры ───────────── */

export type JobKind = 'chop' | 'gather' | 'mine' | 'build';

/** границы видимой части карты в мировых пикселях */
export function viewRect(g: Game) {
  const vw = g.cw / g.scale;
  const vh = g.ch / g.scale;
  return { x0: g.cam.x - vw / 2, y0: g.cam.y - vh / 2, x1: g.cam.x + vw / 2, y1: g.cam.y + vh / 2 };
}

/* ---------- Плавный перелёт камеры ---------- */

export function smoothFocus(g: Game, wx: number, wy: number) {
  g.camGoal = { x: wx, y: wy };
}

/** вызывается каждый кадр: тянет камеру к цели, пока игрок сам не взялся за управление */
export function camGoalStep(g: Game, dt: number, manual: boolean) {
  const t = g.camGoal;
  if (!t) return;
  if (manual) {
    g.camGoal = null;
    return;
  }
  const k = 1 - Math.exp(-dt * 5.5);
  g.cam.x += (t.x - g.cam.x) * k;
  g.cam.y += (t.y - g.cam.y) * k;
  g.camV.x = 0;
  g.camV.y = 0;
  g.clampCam();
  if (Math.hypot(t.x - g.cam.x, t.y - g.cam.y) < 1.5) g.camGoal = null;
}

/* ---------- Очередь приказов (Shift) ---------- */

/** отдать приказ: без Shift — сразу (старая очередь сбрасывается), с Shift — в конец очереди */
export function giveTask(g: Game, u: Unit, t: Task, q: boolean) {
  if (!q) {
    g.setTask(u, t);
    return;
  }
  const qt: Task = { ...t, q: true };
  const cur = u.task;
  // ничего конечного сейчас не выполняется — начинаем сразу
  if (cur.type === 'idle' || !(cur.q || cur.type === 'move')) {
    startQueued(g, u, qt, u.queue);
    return;
  }
  (u.queue ??= []).push(qt);
}

function startQueued(g: Game, u: Unit, t: Task, rest?: Task[]) {
  g.setTask(u, t, true);
  u.queue = rest && rest.length ? rest : undefined;
  if (t.type === 'move') {
    const p = g.pf.find(g.world.blocked, Math.floor(u.x), Math.floor(u.y), (x, y) => x === t.tx && y === t.ty, t.tx, t.ty, true, 4000);
    u.path = p ?? [];
  }
}

function validTarget(g: Game, t: Task): boolean {
  const o = g.objAt(t.tx, t.ty);
  if (!o || o.amount <= 0) return false;
  if (t.type === 'chop') return g.isChoppable(o);
  if (t.type === 'gather') return o.kind === 'bush';
  return o.kind === 'rock';
}

function taskDone(g: Game, u: Unit): boolean {
  const t = u.task;
  switch (t.type) {
    case 'idle':
      return true;
    case 'move':
      return u.path.length === 0 && Math.hypot(u.x - (t.tx + 0.5), u.y - (t.ty + 0.5)) < 1.6;
    case 'chop':
    case 'gather':
    case 'mine':
      return !!t.q && u.carry.n === 0 && !validTarget(g, t);
    case 'build': {
      if (!t.q) return false;
      const s = g.buildings.find((b) => b.id === t.site);
      return !s || s.done;
    }
    default:
      return false;
  }
}

/** вызывается из updateUnit: закончили текущий шаг — берём следующий из очереди */
export function advanceQueue(g: Game, u: Unit) {
  if (!u.queue || !u.queue.length) return;
  if (!taskDone(g, u)) return;
  const next = u.queue.shift()!;
  startQueued(g, u, next, u.queue);
}

/* ---------- Авто-наём бездельников ---------- */

function siteLoad(g: Game, b: Building) {
  return g.units.filter((q) => q.task.type === 'build' && q.task.site === b.id).length;
}

/** самая нужная работа для свободного жителя: еда в днях, стройки, остатки дерева и камня */
export function neededJob(g: Game, u: Unit): JobKind | null {
  const stoneOk = g.done.has('stone_tools');
  const days = g.foodInfo.days;
  const score: Record<JobKind, number> = { chop: 0, gather: 0, mine: -9, build: -9 };
  score.chop = (140 - g.res.wood) / 140;
  score.gather = days < 2 ? 2.4 : days < 4 ? 1.4 : (120 - g.res.food) / 120;
  if (g.foodInfo.winter) score.gather -= 0.8; // зимой кусты пусты
  if (stoneOk) score.mine = (90 - g.res.stone) / 90;
  const sites = g.buildings.filter((b) => !b.done && siteLoad(g, b) < 3);
  if (sites.length && g.canBuild(u)) score.build = 1.1 + Math.min(0.6, sites.length * 0.1) - (g.res.wood < 5 && g.res.stone < 5 ? 0.9 : 0);
  let best: JobKind | null = null;
  let bs = -1e9;
  for (const k of ['chop', 'gather', 'mine', 'build'] as JobKind[]) {
    if (score[k] > bs) {
      bs = score[k];
      best = k;
    }
  }
  return best;
}

/** отправить конкретного жителя на работу; null — успех, иначе причина */
export function sendToJob(g: Game, u: Unit, kind: JobKind): string | null {
  if (kind === 'build') {
    const sites = g.buildings.filter((b) => !b.done).sort((a, b) => siteLoad(g, a) - siteLoad(g, b) || Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y));
    if (!sites.length) return 'Нет незавершённых строек';
    if (!g.canBuild(u)) return 'Этот человек не может строить';
    g.setTask(u, { type: 'build', tx: sites[0].x, ty: sites[0].y, site: sites[0].id, auto: true });
    return null;
  }
  if (kind === 'mine' && !g.done.has('stone_tools')) return 'Для добычи камня изучите «Каменные орудия»';
  const o = g.nearestObj(kind, u.x, u.y);
  if (!o) return kind === 'chop' ? 'Рядом нет деревьев' : kind === 'gather' ? 'Рядом нет ягод' : 'Рядом нет камней';
  g.setTask(u, { type: kind, tx: o.tx, ty: o.ty, site: 0, auto: true });
  return null;
}

export function setAutoHire(g: Game, on: boolean) {
  g.autoHire = on;
  try {
    localStorage.setItem('zarya_autohire', on ? '1' : '0');
  } catch {
    /* без хранилища */
  }
  g.msg(on ? '🤖 Авто-наём включён: свободные жители сами пойдут за нужным ресурсом' : '🤖 Авто-наём выключен', 'info');
  g.emit(true);
}

export function autoHireTick(g: Game, dt: number) {
  if (!g.autoHire) {
    if (g.idleSince.size) g.idleSince.clear();
    return;
  }
  g.hireT -= dt;
  if (g.hireT > 0) return;
  g.hireT = 0.5;
  const night = g.life.sleepTime;
  let sent = 0;
  for (const u of g.units) {
    const ok =
      !night &&
      !u.child &&
      u.spawn <= 0 &&
      u.role === 'none' &&
      u.status === 'free' &&
      u.task.type === 'idle' &&
      !u.sleeping &&
      !u.sel &&
      !u.cb &&
      !u.visit &&
      !u.meal &&
      !u.goHome &&
      !(u.flee && u.flee > 0) &&
      !(u.queue && u.queue.length) &&
      u.hp >= 6;
    if (!ok) {
      g.idleSince.delete(u.id);
      continue;
    }
    const since = g.idleSince.get(u.id);
    if (since === undefined) {
      g.idleSince.set(u.id, g.time);
      continue;
    }
    if (g.time - since < 3) continue;
    const kind = neededJob(g, u);
    g.idleSince.delete(u.id);
    if (!kind) continue;
    if (!sendToJob(g, u, kind)) {
      sent++;
      g.floatText(u.x * TW, u.y * TH - 24, '🤖', '#9affaa');
    }
  }
  if (sent) g.wakeEpoch++;
}

/* ---------- Выбор по классу и горячие группы ---------- */

function classOf(u: Unit): string {
  if (u.role === 'soldier' || u.role === 'guard') return 'war';
  if (u.role === 'hunter') return 'hunter';
  return u.task.type === 'move' ? 'idle' : u.task.type;
}

/** двойной клик: все юниты той же профессии/роли в области видимости экрана */
export function selectSameClass(g: Game, ref: Unit, add = false) {
  const v = viewRect(g);
  const k = classOf(ref);
  if (!add) g.clearSel();
  for (const u of [...g.units, ...g.armyUnits()]) {
    if (u.spawn > 0 || u.sleeping || u.child) continue;
    const px = u.x * TW;
    const py = u.y * TH;
    if (px < v.x0 || px > v.x1 || py < v.y0 || py > v.y1) continue;
    if (classOf(u) === k) u.sel = true;
  }
  ref.sel = true;
  g.selBuilding = null;
  g.sfx('select');
  g.emit(true);
}

function allSelectable(g: Game): Unit[] {
  return [...g.units, ...g.armyUnits()];
}

export function saveGroup(g: Game, n: number) {
  const ids = allSelectable(g).filter((u) => u.sel).map((u) => u.id);
  if (!ids.length) {
    g.msg(`Группа ${n + 1}: сначала выберите людей`, 'warn');
    return;
  }
  g.groups[n] = ids;
  g.msg(`Группа ${n + 1} запомнена: ${ids.length} чел.`, 'good');
  g.sfx('click');
  g.emit(true);
}

export function groupUnits(g: Game, n: number): Unit[] {
  const set = new Set(g.groups[n] ?? []);
  return allSelectable(g).filter((u) => set.has(u.id) && u.spawn <= 0);
}

export function groupSizes(g: Game): number[] {
  return [0, 1, 2, 3].map((n) => groupUnits(g, n).length);
}

/** true — группа есть и выбрана (двойное нажатие центрирует камеру) */
export function recallGroup(g: Game, n: number): boolean {
  const list = groupUnits(g, n);
  if (!list.length) return false;
  const now = performance.now();
  const dbl = g.lastGroup.n === n && now - g.lastGroup.t < 420;
  g.lastGroup = { n, t: now };
  g.clearSel();
  for (const u of list) u.sel = true;
  if (dbl) {
    let x = 0;
    let y = 0;
    for (const u of list) {
      x += u.x;
      y += u.y;
    }
    smoothFocus(g, (x / list.length) * TW, (y / list.length) * TH);
  }
  g.sfx('select');
  g.emit(true);
  return true;
}

/* ---------- Циклический поиск проблем ---------- */

function selectOnly(g: Game, u: Unit) {
  g.clearSel();
  u.sel = true;
  g.selBuilding = null;
}

/** [F] / «Свободны»: первое нажатие — выбрать всех бездельников, повторные — перелёт к следующему */
export function cycleIdle(g: Game) {
  const idle = g.units.filter((u) => !u.child && u.spawn <= 0 && u.task.type === 'idle' && u.role === 'none');
  if (!idle.length) {
    g.msg('Свободных людей нет', 'info');
    return;
  }
  const now = performance.now();
  const again = now - g.idleCycleT < 6000;
  g.idleCycleT = now;
  idle.sort((a, b) => a.id - b.id);
  g.clearSel();
  for (const u of idle) u.sel = true;
  if (!again) {
    g.idleCursor = -1;
    // если никого не видно на экране — показываем первого
    const v = viewRect(g);
    const seen = idle.some((u) => u.x * TW >= v.x0 && u.x * TW <= v.x1 && u.y * TH >= v.y0 && u.y * TH <= v.y1);
    if (!seen) {
      g.idleCursor = 0;
      smoothFocus(g, idle[0].x * TW, idle[0].y * TH);
    }
  } else {
    g.idleCursor = (g.idleCursor + 1) % idle.length;
    const u = idle[g.idleCursor];
    smoothFocus(g, u.x * TW, u.y * TH);
  }
  g.sfx('select');
  g.emit(true);
}

/** клик по «😫 Голодных»: фокус на самом голодном жителе */
export function focusHungriest(g: Game) {
  const list = g.units.filter((u) => !u.child && u.spawn <= 0 && u.role !== 'lord').sort((a, b) => a.hunger - b.hunger);
  const u = list[0];
  if (!u || u.hunger >= FOOD.LOW) {
    g.msg('Голодных нет — все сыты 🍖', 'good');
    return;
  }
  selectOnly(g, u);
  smoothFocus(g, u.x * TW, u.y * TH);
  g.msg(`😫 Самый голодный: ${u.name} (${Math.round(u.hunger)}%)`, 'warn');
  g.sfx('select');
  g.emit(true);
}

/** клик по «👷 Цеха»: следующий цех, где не хватает работников */
export function cycleShortStaff(g: Game) {
  const list = g.buildings.filter((b) => b.done && g.isStaffable(b) && g.staffUnits(b).length < g.staffSlots(b));
  if (!list.length) {
    g.msg('Все цеха укомплектованы 👷', 'good');
    return;
  }
  g.shortCursor = (g.shortCursor + 1) % list.length;
  const b = list[g.shortCursor];
  g.clearSel();
  g.selBuilding = b.id;
  smoothFocus(g, (b.x + b.w / 2) * TW, (b.y + b.h / 2) * TH);
  g.sfx('select');
  g.emit(true);
}

export function shortStaffCount(g: Game) {
  let n = 0;
  for (const b of g.buildings) if (b.done && g.isStaffable(b) && g.staffUnits(b).length < g.staffSlots(b)) n++;
  return n;
}

/* ---------- Карточка «Работа племени»: [ − ] [ + ] и выбор профессии ---------- */

export function selectJobUnits(g: Game, kind: JobKind) {
  g.clearSel();
  let n = 0;
  for (const u of g.units) {
    if (!u.child && u.spawn <= 0 && u.task.type === kind) {
      u.sel = true;
      n++;
    }
  }
  if (!n) g.msg('Никто сейчас не занят этой работой', 'info');
  g.sfx('select');
  g.emit(true);
}

/** [ + ]: забрать ближайшего свободного — или наименее загруженного с другой работы */
export function jobPlus(g: Game, kind: JobKind): string | null {
  const adults = g.units.filter((u) => !u.child && u.spawn <= 0 && u.role === 'none' && u.status === 'free' && !u.sleeping && !u.cb);
  let pool = adults.filter((u) => u.task.type === 'idle' || u.task.type === 'move');
  if (!pool.length) {
    // берём с самой многолюдной другой работы того, кто сейчас ничего не несёт
    const count = (k: string) => adults.filter((u) => u.task.type === k).length;
    const donors = (['chop', 'gather', 'mine', 'build'] as JobKind[]).filter((k) => k !== kind && count(k) > 1).sort((a, b) => count(b) - count(a));
    if (donors.length) pool = adults.filter((u) => u.task.type === donors[0]).sort((a, b) => a.carry.n - b.carry.n);
  }
  if (!pool.length) return 'Некого отправить — свободных нет, а на других работах по одному человеку';
  let focus: { x: number; y: number };
  if (kind === 'build') {
    const s = g.buildings.find((b) => !b.done);
    if (!s) return 'Нет незавершённых строек';
    focus = { x: s.x, y: s.y };
  } else {
    const camp = g.buildings[0];
    focus = camp ? { x: camp.x + 1, y: camp.y + 1 } : { x: 0, y: 0 };
  }
  pool.sort((a, b) => Math.hypot(a.x - focus.x, a.y - focus.y) - Math.hypot(b.x - focus.x, b.y - focus.y));
  let last: string | null = null;
  for (const u of pool.slice(0, 4)) {
    last = sendToJob(g, u, kind);
    if (!last) {
      g.emit(true);
      return null;
    }
  }
  return last;
}

/** [ − ]: снять одного работника с этой профессии — он становится свободным */
export function jobMinus(g: Game, kind: JobKind): string | null {
  const cand = g.units.filter((u) => !u.child && u.spawn <= 0 && u.task.type === kind).sort((a, b) => a.carry.n - b.carry.n);
  if (!cand.length) return null;
  g.setIdle(cand[0]);
  cand[0].queue = undefined;
  g.emit(true);
  return null;
}

/* ---------- Адрес события для кликабельных уведомлений ---------- */

export function eventPos(g: Game, text: string): { x: number; y: number } | null {
  const low = text.toLowerCase();
  const L = g.life;
  const isRaid = /набег|налёт|налет|тревога|разбойник|воры|вор |грабит|разграблен|отряд из/.test(low);
  if (isRaid) {
    const r = L?.raiders?.[0];
    if (r) return { x: r.unit.x * TW, y: r.unit.y * TH };
    const m = g.marches?.find((q) => q.incoming);
    const sq = m?.squad;
    if (sq && sq.length) return { x: sq[0].x * TW, y: sq[0].y * TH };
  }
  for (const t of g.towns ?? []) if (text.includes(t.name)) return { x: t.x * TW + TW / 2, y: (t.y + 1) * TH };
  if (/засад/.test(low)) {
    const c = g.ext?.caravans?.find((q) => q.state === 'ambush');
    if (c) return { x: c.x * TW, y: c.y * TH };
  }
  if (/странник|гость|торговец|путник|рыцарь|ведьма|кузнец/.test(low)) {
    const v = L?.visitors?.[0];
    if (v) return { x: v.unit.x * TW, y: v.unit.y * TH };
  }
  if (/бунт|восстан|волнен/.test(low) || isRaid) {
    const c = g.buildings?.[0];
    if (c) return { x: (c.x + c.w / 2) * TW, y: (c.y + c.h / 2) * TH };
  }
  return null;
}

/** клик по тосту */
export function focusMsg(g: Game, id: number) {
  const m = g.msgs.find((q) => q.id === id);
  if (!m || !m.at) return;
  smoothFocus(g, m.at.x, m.at.y);
  g.sfx('click');
}
