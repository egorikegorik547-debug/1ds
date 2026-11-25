import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game/game';
import { buildBuildingSprites, buildFlames, buildObjectSprites, personSprite, type BuildingSprites, type Cv, type Look, type ObjSprites } from '../game/sprites';

/* ───────────── Живые пиксельные мини-демонстрации (как превью карт в Clash Royale) ─────────────
   Каждая сцена — зацикленная 5–7-секундная анимация на <canvas> 192×108 с реальными спрайтами игры. */

export type SceneKind = 'select' | 'build' | 'workshop' | 'food' | 'defense' | 'assault' | 'caravan' | 'winter' | 'claim' | 'estate';

type Ctx = CanvasRenderingContext2D;

interface Sprites {
  spr: ObjSprites;
  bspr: BuildingSprites;
  flames: Cv[];
}

let own: Sprites | null = null;
function sprites(game?: Game | null): Sprites {
  if (game && game.spr && game.bspr) return { spr: game.spr, bspr: game.bspr, flames: game.flames };
  if (!own) own = { spr: buildObjectSprites(), bspr: buildBuildingSprites(), flames: buildFlames() };
  return own;
}

const W = 192;
const H = 108;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * clamp(k);

const mkLook = (skin: number, hair: number, cloth: number, female = false, extra: Partial<Look> = {}): Look => ({ skin, hair, cloth, female, style: female ? 1 : 0, outfit: female ? 2 : 0, beard: false, acc: 0, build: 0, ...extra });
const LOOKS = [mkLook(0, 1, 3), mkLook(1, 2, 1, true), mkLook(2, 0, 2, false, { beard: true }), mkLook(0, 3, 4), mkLook(1, 4, 0, false, { elder: true }), mkLook(3, 0, 2, true)];

/* ───────── рисовалки ───────── */

function person(c: Ctx, look: Look, x: number, y: number, dir: number, frame: number, tool = 0, kid = false) {
  const s = personSprite(look, dir, frame, tool, kid);
  c.fillStyle = 'rgba(10,10,24,0.3)';
  c.fillRect(Math.round(x) - 4, Math.round(y) - 1, 9, 2);
  c.drawImage(s, Math.round(x) - 8, Math.round(y) - 19);
}
const walkF = (t: number, sp = 7) => 1 + (Math.floor(t * sp) % 2);
const workF = (t: number, sp = 5) => 3 + (Math.floor(t * sp) % 2);

function sprite(c: Ctx, s: Cv | undefined, x: number, y: number, alpha = 1) {
  if (!s) return;
  if (alpha !== 1) c.globalAlpha = alpha;
  c.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height));
  c.globalAlpha = 1;
}

function ground(c: Ctx, tone = 0, snow = 0) {
  const g1 = ['#5aa03c', '#4f9436'];
  const g2 = ['#d8e2ee', '#c8d4e4'];
  for (let ty = 0; ty < 9; ty++)
    for (let tx = 0; tx < 12; tx++) {
      c.fillStyle = g1[(tx + ty + tone) & 1];
      c.fillRect(tx * 16, ty * 12, 16, 12);
      if (snow > 0) {
        c.globalAlpha = snow;
        c.fillStyle = g2[(tx + ty) & 1];
        c.fillRect(tx * 16, ty * 12, 16, 12);
        c.globalAlpha = 1;
      }
    }
  c.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 14; i++) c.fillRect((i * 37) % 188, 4 + ((i * 53) % 100), 3, 1);
}

function water(c: Ctx, x: number, y: number, w: number, h: number, t: number, ice = 0) {
  c.fillStyle = '#2a6cb4';
  c.fillRect(x, y, w, h);
  c.fillStyle = '#3a82cc';
  for (let i = 0; i < w; i += 8) c.fillRect(x + i, y + ((i * 7) % h), 4, 1);
  c.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 5; i++) c.fillRect(x + ((i * 29 + Math.floor(t * 8)) % Math.max(1, w - 3)), y + ((i * 17) % h), 3, 1);
  if (ice > 0) {
    c.globalAlpha = ice * 0.92;
    c.fillStyle = '#cfeaff';
    c.fillRect(x, y, w, h);
    c.fillStyle = '#eaf6ff';
    for (let i = 0; i < w; i += 12) c.fillRect(x + i, y + ((i * 5) % h), 7, 1);
    c.fillStyle = '#9ac8ee';
    c.fillRect(x + w * 0.3, y, 1, h);
    c.fillRect(x + w * 0.65, y, 1, h);
    c.globalAlpha = 1;
  }
}

function text(c: Ctx, s: string, x: number, y: number, col = '#ffe9a8', size = 7, align: CanvasTextAlign = 'center') {
  c.font = `bold ${size}px "Pixelify Sans", monospace`;
  c.textAlign = align;
  c.lineWidth = 2;
  c.strokeStyle = '#1a1018';
  c.strokeText(s, Math.round(x), Math.round(y));
  c.fillStyle = col;
  c.fillText(s, Math.round(x), Math.round(y));
}

function emote(c: Ctx, e: string, x: number, y: number, t: number) {
  c.font = '9px sans-serif';
  c.textAlign = 'center';
  c.fillText(e, Math.round(x), Math.round(y - Math.abs(Math.sin(t * 6)) * 1.5));
}

function bar(c: Ctx, x: number, y: number, w: number, k: number, col: string) {
  c.fillStyle = '#12121a';
  c.fillRect(Math.round(x - w / 2) - 1, Math.round(y) - 1, w + 2, 5);
  c.fillStyle = '#3a3a48';
  c.fillRect(Math.round(x - w / 2), Math.round(y), w, 3);
  c.fillStyle = col;
  c.fillRect(Math.round(x - w / 2), Math.round(y), Math.round(w * clamp(k)), 3);
}

function cursor(c: Ctx, x: number, y: number, click = false) {
  c.fillStyle = '#12121a';
  c.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 9);
  c.fillRect(Math.round(x) - 1, Math.round(y) - 1, 7, 3);
  c.fillStyle = '#fff';
  c.fillRect(Math.round(x), Math.round(y), 1, 7);
  c.fillRect(Math.round(x), Math.round(y), 5, 1);
  if (click) text(c, 'ПКМ', x + 10, y + 12, '#ffcf6a', 6);
}

function ring(c: Ctx, x: number, y: number, k: number, col = '#ffe27a') {
  if (k <= 0 || k >= 1) return;
  c.strokeStyle = col;
  c.globalAlpha = 1 - k;
  c.lineWidth = 1;
  c.strokeRect(Math.round(x - 3 - k * 9) + 0.5, Math.round(y - 2 - k * 5) + 0.5, 6 + k * 18, 4 + k * 10);
  c.globalAlpha = 1;
}

function flag(c: Ctx, x: number, y: number, col: string, t: number, h = 14) {
  c.fillStyle = '#2a1c10';
  c.fillRect(Math.round(x), Math.round(y - h), 1, h);
  for (let i = 0; i < 8; i++) {
    c.fillStyle = col;
    c.fillRect(Math.round(x) + 1 + i, Math.round(y - h + 1 + Math.sin(t * 5 - i * 0.8) * 0.9), 1, 5);
  }
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(Math.round(x) + 1, Math.round(y - h + 1), 8, 1);
}

function smoke(c: Ctx, x: number, y: number, t: number, n = 4) {
  for (let i = 0; i < n; i++) {
    const k = (t * 0.7 + i / n) % 1;
    c.globalAlpha = (1 - k) * 0.7;
    c.fillStyle = '#dcdce8';
    const s = 2 + k * 3;
    c.fillRect(Math.round(x + k * 6 + Math.sin(k * 6 + i) * 1.5), Math.round(y - k * 16), Math.round(s), Math.round(s));
  }
  c.globalAlpha = 1;
}

function tree(c: Ctx, S: Sprites, key: string, x: number, y: number, shake = 0) {
  sprite(c, S.spr[key], x + Math.round(Math.sin(shake * 60) * shake * 6), y);
}

function night(c: Ctx, k: number) {
  c.fillStyle = `rgba(10,16,52,${0.55 * k})`;
  c.fillRect(0, 0, W, H);
}

function glow(c: Ctx, x: number, y: number, r: number, a = 0.5) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,170,60,${a})`);
  g.addColorStop(1, 'rgba(255,170,60,0)');
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

function wolf(c: Ctx, x: number, y: number, dir: number, t: number, hit = 0) {
  const d = dir < 0 ? -1 : 1;
  const R = (dx: number, dy: number, w: number, h: number, col: string) => {
    c.fillStyle = col;
    c.fillRect(Math.round(x + (d > 0 ? dx : -dx - w + 1)), Math.round(y + dy), w, h);
  };
  c.fillStyle = 'rgba(10,10,24,0.3)';
  c.fillRect(Math.round(x) - 6, Math.round(y) - 1, 13, 2);
  const st = Math.floor(t * 8) % 2;
  R(-6, -9, 12, 5, '#7a7a86');
  R(-6, -9, 12, 1, '#a4a4b2');
  R(5, -11, 5, 5, '#7a7a86');
  R(9, -9, 2, 2, '#3a3a44');
  R(6, -12, 1, 2, '#5a5a66');
  R(7, -10, 1, 1, hit ? '#ff3a3a' : '#ffe27a');
  R(-8, -9 + st, 3, 2, '#5a5a66');
  R(-5, -4, 2, 4 - st, '#5a5a66');
  R(3, -4, 2, 3 + st, '#5a5a66');
}

function logIcon(c: Ctx, x: number, y: number) {
  c.fillStyle = '#6a4524';
  c.fillRect(Math.round(x) - 3, Math.round(y), 7, 3);
  c.fillStyle = '#b8884e';
  c.fillRect(Math.round(x) - 3, Math.round(y), 1, 3);
  c.fillRect(Math.round(x) - 2, Math.round(y), 5, 1);
}

function spearman(c: Ctx, look: Look, x: number, y: number, dir: number, fr: number, col: string, atk = 0) {
  person(c, look, x, y, dir, fr, 0);
  const d = dir === 3 ? -1 : 1;
  c.fillStyle = '#8c93a4';
  c.fillRect(Math.round(x) - 5, Math.round(y) - 20, 10, 3);
  c.fillStyle = col;
  c.fillRect(Math.round(x) - 1, Math.round(y) - 23, 2, 3);
  c.fillStyle = '#7a5a30';
  const ext = atk ? Math.round(Math.sin(atk * 14) * 3) : 0;
  c.fillRect(Math.round(x + d * 6 + (d > 0 ? ext : -ext)) - (d < 0 ? 1 : 0), Math.round(y) - 16, 1, 13);
  c.fillStyle = '#d8dce8';
  c.fillRect(Math.round(x + d * 6 + (d > 0 ? ext : -ext)) - (d < 0 ? 1 : 0), Math.round(y) - 18, 1, 3);
  c.fillStyle = col;
  c.fillRect(Math.round(x) + (d > 0 ? -7 : 5), Math.round(y) - 14, 3, 6);
}

/* ───────── сцены ───────── */

interface Scene {
  dur: number;
  caps: [number, string][];
  draw: (c: Ctx, t: number, S: Sprites) => void;
}

const SCENES: Record<SceneKind, Scene> = {
  /* 1. Рамка и приказы */
  select: {
    dur: 6.4,
    caps: [
      [0, 'ЛКМ: тянем зелёную рамку вокруг трёх жителей'],
      [1.8, 'ПКМ по дереву — приказ «рубить»'],
      [3.3, 'Лесорубы рубят — дерево падает'],
      [4.7, 'Брёвна несут на склад'],
    ],
    draw(c, t, S) {
      ground(c);
      sprite(c, S.bspr.cv.shelter ?? S.bspr.cv.house, 28, 62);
      sprite(c, S.spr.rock0, 20, 96);
      tree(c, S, 'oak1', 160, 40);
      tree(c, S, 'pine0', 176, 100);
      const fall = seg(t, 4.1, 4.5);
      const shake = t > 3.2 && t < 4.1 ? 0.12 + Math.sin(t * 16) * 0.05 : 0;
      const tx = 140;
      const ty = 74;
      if (fall <= 0) tree(c, S, 'oak0', tx, ty, shake);
      else if (fall < 1) {
        c.save();
        c.translate(tx, ty);
        c.rotate(fall * fall * 1.5);
        sprite(c, S.spr.oak0, 0, 0);
        c.restore();
      } else sprite(c, S.spr.stump, tx, ty);
      if (t > 4.5) for (let i = 0; i < 3; i++) logIcon(c, tx + 8 + i * 2, ty - 1 + (i % 2));
      // жители
      const base: [number, number][] = [[46, 80], [60, 88], [38, 92]];
      base.forEach(([bx, by], i) => {
        let x = bx;
        let y = by;
        let dir = 2;
        let fr = 0;
        let tool = 0;
        if (t > 2.4 && t < 3.3) {
          const k = seg(t, 2.4, 3.3);
          x = lerp(bx, tx - 8 - i * 4, k);
          y = lerp(by, ty + 2 + i * 3 - 3, k);
          fr = walkF(t);
        } else if (t >= 3.3 && t < 4.7) {
          x = tx - 8 - i * 4;
          y = ty + 2 + i * 3 - 3;
          fr = workF(t + i * 0.2);
        } else if (t >= 4.7) {
          const k = seg(t, 4.7, 6.2);
          x = lerp(tx - 8 - i * 4, 40 + i * 5, k);
          y = lerp(ty + 2 + i * 3 - 3, 66 + i * 3, k);
          dir = 3;
          fr = walkF(t);
          tool = 0;
        }
        person(c, LOOKS[i], x, y, dir, fr, tool);
        if (t >= 4.7 && t < 6.3) logIcon(c, x - 1, y - 14);
        if (t >= 1.2 && t < 3.3 && i >= 0) {
          c.strokeStyle = '#7dff8c';
          c.lineWidth = 1;
          c.strokeRect(Math.round(x) - 6.5, Math.round(y) - 2.5, 13, 5);
        }
      });
      // рамка и курсор
      if (t < 1.4) {
        const k = seg(t, 0.2, 1.2);
        const x0 = 30;
        const y0 = 62;
        const x1 = lerp(30, 76, k);
        const y1 = lerp(62, 98, k);
        c.fillStyle = 'rgba(125,255,140,0.18)';
        c.fillRect(x0, y0, x1 - x0, y1 - y0);
        c.strokeStyle = '#7dff8c';
        c.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
        cursor(c, x1, y1);
      } else if (t < 3.0) {
        const k = seg(t, 1.5, 2.2);
        const cx = lerp(76, tx + 2, k);
        const cy = lerp(98, ty - 20, k);
        cursor(c, cx, cy, t > 2.2);
        if (t > 2.2) {
          ring(c, tx, ty, seg(t, 2.2, 2.9));
          c.font = '9px sans-serif';
          c.textAlign = 'center';
          c.fillText('🪓', tx, ty - 44 - (t - 2.2) * 4);
        }
      }
      if (t > 3.3 && t < 4.2) for (let i = 0; i < 3; i++) {
        c.fillStyle = '#8ac04a';
        c.fillRect(tx - 6 + ((t * 40 + i * 9) % 14), ty - 30 + ((t * 25 + i * 11) % 22), 1, 1);
      }
    },
  },

  /* 2. Стройка */
  build: {
    dur: 6.4,
    caps: [
      [0, 'Ставим фундамент дома на карте'],
      [1.2, 'Двое рабочих бегут на стройку с молотками'],
      [2.6, 'Стучат по лесам — стены поднимаются'],
      [5.2, 'Дом готов — можно заселять!'],
    ],
    draw(c, t, S) {
      ground(c, 1);
      tree(c, S, 'oak2', 14, 44);
      tree(c, S, 'birch1', 176, 38);
      sprite(c, S.spr.bush, 30, 100);
      const hx = 100;
      const hy = 80;
      const house = S.bspr.cv.house;
      const prog = seg(t, 2.2, 5.0);
      if (t > 0.5) {
        c.strokeStyle = t < 5 ? '#ffe27a' : 'transparent';
        c.setLineDash([3, 2]);
        const w = house?.width ?? 32;
        c.strokeRect(hx - w / 2 + 0.5, hy - 22.5, w, 22);
        c.setLineDash([]);
        c.fillStyle = 'rgba(150,110,60,0.55)';
        c.fillRect(hx - w / 2 + 1, hy - 21, w - 1, 21);
      }
      if (house && t > 2.2) {
        const sh = Math.max(1, Math.round(house.height * (t > 5 ? 1 : prog)));
        c.drawImage(house, 0, house.height - sh, house.width, sh, Math.round(hx - house.width / 2), Math.round(hy - sh), house.width, sh);
        if (t < 5.1) {
          c.strokeStyle = '#a07a46';
          for (let i = 0; i < 4; i++) {
            c.fillStyle = '#8a6a3a';
            c.fillRect(hx - house.width / 2 - 2 + (i % 2) * (house.width + 3), hy - sh - 2, 1, sh + 2);
          }
          c.fillStyle = '#b8884e';
          c.fillRect(hx - house.width / 2 - 2, hy - sh + 2, house.width + 4, 1);
        }
        if (t < 5.1) bar(c, hx, hy + 5, 28, prog, '#7dff8c');
      }
      // рабочие
      [0, 1].forEach((i) => {
        const sx = 8 + i * 8;
        const sy = 96 - i * 6;
        const ax = hx - 24 + i * 40;
        const ay = hy + 4 + i * 4;
        let x = sx;
        let y = sy;
        let fr = 0;
        let dir = 2;
        if (t > 1.2 && t < 2.6) {
          const k = seg(t, 1.2, 2.6);
          x = lerp(sx, ax, k);
          y = lerp(sy, ay, k);
          fr = walkF(t, 8);
        } else if (t >= 2.6 && t < 5.2) {
          x = ax;
          y = ay;
          fr = workF(t + i * 0.25, 6);
          dir = i ? 3 : 2;
          if (Math.floor(t * 6 + i) % 2 === 0) {
            c.fillStyle = '#ffe27a';
            c.fillRect(Math.round(x + (i ? -7 : 7)), Math.round(y - 12), 1, 1);
          }
        } else if (t >= 5.2) {
          x = ax;
          y = ay;
          emote(c, '👍', x, y - 20, t);
        }
        person(c, LOOKS[i + 2], x, y, dir, fr, 2);
      });
      if (t < 1.4) cursor(c, lerp(40, hx, seg(t, 0, 0.6)), lerp(30, hy - 10, seg(t, 0, 0.6)));
      if (t > 5.2) for (let i = 0; i < 5; i++) {
        c.fillStyle = i % 2 ? '#ffe27a' : '#fff';
        c.fillRect(hx - 14 + ((i * 9 + t * 30) % 28), hy - 34 + ((i * 7) % 12), 1, 1);
      }
    },
  },

  /* 3. Цеха и штат */
  workshop: {
    dur: 6.2,
    caps: [
      [0, 'Выбираем цех и жмём [+] — закрепляем постоянный штат'],
      [1.5, 'Житель заходит в Мастерскую'],
      [2.4, 'Из трубы идёт дым — шкала прогресса растёт'],
      [4.6, 'Над крышей вылетает готовый товар!'],
    ],
    draw(c, t, S) {
      ground(c, 0);
      tree(c, S, 'pine1', 16, 50);
      tree(c, S, 'oak0', 178, 56);
      const bx = 96;
      const by = 74;
      const ws = S.bspr.cv.workshop ?? S.bspr.cv.house;
      sprite(c, ws, bx, by);
      const sm = S.bspr.smoke.workshop ?? S.bspr.smoke.house;
      const working = t > 1.9 && t < 5.4;
      if (working && ws && sm) smoke(c, bx - ws.width / 2 + sm.x, by - ws.height + sm.y, t, 5);
      // кнопка [+]
      if (t < 1.7) {
        const pulse = 1 + Math.sin(t * 8) * 0.12;
        c.fillStyle = '#12121a';
        c.fillRect(bx + 16, by - 40, 18, 12);
        c.fillStyle = t > 0.9 ? '#7dff8c' : '#f0d890';
        c.fillRect(bx + 17, by - 39, 16, 10);
        text(c, '[ + ]', bx + 25, by - 31, '#1a1018', Math.round(7 * pulse));
        if (t > 0.5) cursor(c, bx + 24 + (t < 0.9 ? (0.9 - t) * 30 : 0), by - 28 + (t < 0.9 ? (0.9 - t) * 20 : 0));
      }
      // житель
      const door = { x: bx, y: by + 1 };
      if (t < 1.9) {
        const k = seg(t, 1.2, 1.9);
        const x = t < 1.2 ? 40 + t * 0 : lerp(40, door.x, k);
        const y = lerp(92, door.y, k);
        person(c, LOOKS[0], t < 1.2 ? 40 : x, t < 1.2 ? 92 : y, 2, t < 1.2 ? 0 : walkF(t), 2);
      }
      if (t > 5.2) {
        const k = seg(t, 5.2, 5.8);
        person(c, LOOKS[0], door.x + k * 18, door.y + 6 + k * 8, 2, k < 1 ? walkF(t) : 0, 2);
      }
      // шкала и товар
      if (t > 1.9 && t < 5.6) {
        const k = seg(t, 2.0, 4.6);
        bar(c, bx, by + 8, 40, k, '#f0a030');
        text(c, `${Math.round(k * 100)}%`, bx, by + 20, '#ffe9a8', 6);
        c.fillStyle = '#ffcf6a';
        c.fillRect(bx - 24, by + 14, 8, 8);
        text(c, '👤', bx - 20, by + 21, '#fff', 7);
      }
      if (t > 4.6 && t < 6.0) {
        const k = seg(t, 4.6, 6.0);
        c.font = '11px sans-serif';
        c.textAlign = 'center';
        c.globalAlpha = 1 - k * 0.6;
        c.fillText('🪓', bx - 8, by - (ws?.height ?? 30) - k * 18);
        c.fillText('📦', bx + 10, by - (ws?.height ?? 30) - 4 - k * 14);
        c.globalAlpha = 1;
        for (let i = 0; i < 5; i++) {
          c.fillStyle = '#ffe27a';
          c.fillRect(bx - 18 + ((i * 11 + t * 30) % 36), by - (ws?.height ?? 30) - 8 + ((i * 5) % 10), 1, 1);
        }
      }
    },
  },

  /* 4. Еда, готовка, завтрак */
  food: {
    dur: 6.4,
    caps: [
      [0, '06:00 — наступило утро, пора завтракать'],
      [1.0, 'Голодный житель с иконкой еды идёт к костру'],
      [2.6, 'Еда варится в котелке: 1 сырая → ×2.2 порции'],
      [4.0, 'Шкала сытости восполняется'],
    ],
    draw(c, t, S) {
      ground(c, 1);
      tree(c, S, 'oak1', 20, 44);
      tree(c, S, 'birch0', 174, 50);
      const fx = 96;
      const fy = 66;
      sprite(c, S.bspr.cv.campfire, fx, fy);
      const fl = S.flames[Math.floor(t * 8) % S.flames.length];
      if (fl) c.drawImage(fl, fx - 5, fy - 17);
      // котелок
      c.fillStyle = '#25252c';
      c.fillRect(fx + 10, fy - 7, 11, 7);
      c.fillStyle = '#4a4a56';
      c.fillRect(fx + 10, fy - 7, 11, 1);
      c.fillStyle = '#d8884a';
      c.fillRect(fx + 11, fy - 6, 9, 1);
      if (t > 2.4) {
        for (let i = 0; i < 3; i++) {
          const k = (t * 1.3 + i / 3) % 1;
          c.fillStyle = `rgba(240,240,250,${0.7 - k * 0.7})`;
          c.fillRect(fx + 13 + i * 3, Math.round(fy - 9 - k * 10), 2, 2);
        }
        text(c, '×2.2', fx + 16, fy - 22, '#8aff9a', 7);
      }
      // утро: небо
      const hour = 6 + t * 0.4;
      c.fillStyle = `rgba(255,170,90,${0.18 * (1 - seg(t, 0, 3))})`;
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#12121a';
      c.fillRect(4, 4, 36, 12);
      text(c, `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60 / 10) * 10).padStart(2, '0')}`, 22, 13, '#ffe27a', 8);
      c.font = '10px sans-serif';
      c.textAlign = 'left';
      c.fillText('🌅', 44, 14);
      // житель
      const k = seg(t, 1.0, 2.6);
      const x = lerp(30, fx - 14, k);
      const y = lerp(92, fy + 6, k);
      const hungry = 18 + seg(t, 3.6, 5.6) * 80;
      person(c, LOOKS[2], x, y, 2, k < 1 && k > 0 ? walkF(t) : 0, 3);
      if (t < 3.6) {
        c.font = '10px sans-serif';
        c.textAlign = 'center';
        c.fillText('🍖', x, y - 24 - Math.abs(Math.sin(t * 5)) * 2);
      } else emote(c, hungry > 80 ? '❤️' : '😋', x, y - 22, t);
      bar(c, x, y - 21 + (t < 3.6 ? 0 : 0), 20, hungry / 100, hungry < 30 ? '#ff6a5a' : hungry < 60 ? '#ffd45a' : '#7dff8c');
      text(c, `сытость ${Math.round(hungry)}%`, x, y + 12, hungry < 30 ? '#ff9a8a' : '#8aff9a', 6);
      // другие едоки
      person(c, LOOKS[1], fx + 28, fy + 8, 3, 0, 3);
      if (t > 4) emote(c, '😊', fx + 28, fy - 12, t);
    },
  },

  /* 5. Оборона */
  defense: {
    dur: 6.4,
    caps: [
      [0, 'Ночь. К частоколу подкрадывается волк'],
      [2.0, 'Частокол держит удар'],
      [3.0, 'Стражник с факелом и копьём бежит на перехват'],
      [4.6, 'Враг прогнан — деревня спит спокойно'],
    ],
    draw(c, t, S) {
      ground(c, 0);
      for (let i = 0; i < 6; i++) sprite(c, S.spr.pine0, 12 + i * 34, 22);
      sprite(c, S.bspr.cv.house, 36, 94);
      sprite(c, S.bspr.cv.house, 150, 96);
      // частокол
      const px = 112;
      const hit = t > 1.9 && t < 3.6 ? Math.sin(t * 30) * 1 : 0;
      for (let y = 32; y < 100; y += 6) {
        c.fillStyle = '#5a3a1c';
        c.fillRect(px + (Math.floor(y / 6) % 2 ? Math.round(hit) : 0), y, 4, 8);
        c.fillStyle = '#9a7446';
        c.fillRect(px + (Math.floor(y / 6) % 2 ? Math.round(hit) : 0), y, 1, 8);
        c.fillStyle = '#c8a470';
        c.fillRect(px + (Math.floor(y / 6) % 2 ? Math.round(hit) : 0), y - 1, 4, 1);
      }
      // волк
      let wx = 190;
      let dir = -1;
      if (t < 2.0) wx = lerp(190, 124, seg(t, 0.2, 2.0));
      else if (t < 3.6) wx = 124;
      else {
        wx = lerp(124, 200, seg(t, 3.6, 5.0));
        dir = 1;
      }
      wolf(c, wx, 68, dir, t, t > 1.9 && t < 3.6 ? 1 : 0);
      // прочность
      if (t > 1.8 && t < 4.6) {
        const hp = t < 3.0 ? 1 - seg(t, 1.9, 3.0) * 0.12 : 0.88;
        bar(c, px + 2, 24, 22, hp, '#ff8a3a');
        text(c, 'частокол', px + 2, 20, '#ffd0a0', 6);
      }
      // стражник
      const gx = t < 3.0 ? 30 : lerp(30, 100, seg(t, 3.0, 4.4));
      const gy = 70 + Math.sin(gx * 0.1) * 0;
      spearman(c, LOOKS[3], gx, gy, 2, t > 3.0 && t < 4.4 ? walkF(t, 9) : 0, '#3a6ad8', t > 4.2 && t < 5 ? t - 4.2 : 0);
      // факел
      const tx = gx + 7;
      c.fillStyle = '#6a4524';
      c.fillRect(Math.round(tx), Math.round(gy) - 20, 1, 7);
      const fl = S.flames[Math.floor(t * 9) % S.flames.length];
      if (fl) c.drawImage(fl, Math.round(tx) - 4, Math.round(gy) - 33);
      night(c, 0.9);
      glow(c, tx, gy - 24, 30, 0.7);
      glow(c, 36, 78, 18, 0.35);
      glow(c, 150, 80, 18, 0.35);
      c.fillStyle = '#fff6c8';
      c.beginPath();
      c.arc(168, 12, 5, 0, 7);
      c.fill();
      c.fillStyle = '#0c1440';
      c.beginPath();
      c.arc(170, 11, 4.4, 0, 7);
      c.fill();
      if (t > 4.4) text(c, 'Прочь!', gx + 8, gy - 38, '#ffe9a8', 7);
      if (t > 5) emote(c, '💤', 36, 66, t);
    },
  },

  /* 6. Поход и штурм */
  assault: {
    dur: 7,
    caps: [
      [0, 'Отряд воинов с флагом подходит к чужому поселению'],
      [2.0, 'Защитники выбегают навстречу'],
      [3.0, 'Бой: стрелы, удары, полоски HP'],
      [5.4, 'Поднимается знамя победителя — селение взято!'],
    ],
    draw(c, t, S) {
      ground(c, 1);
      sprite(c, S.bspr.cv.house, 150, 52);
      sprite(c, S.bspr.cv.barracks ?? S.bspr.cv.house, 168, 96);
      sprite(c, S.bspr.cv.tower ?? S.bspr.cv.house, 128, 98);
      tree(c, S, 'oak0', 12, 98);
      tree(c, S, 'pine2', 70, 28);
      // отряд
      const sx = t < 2.2 ? lerp(-10, 54, seg(t, 0, 2.2)) : t < 5.4 ? 54 + Math.sin(t * 3) * 1.5 : 56;
      const col = '#3a6ad8';
      const rows = [60, 72, 84, 94];
      const foeCol = '#c8303a';
      const fighting = t > 3 && t < 5.4;
      rows.forEach((ry, i) => {
        const hp = fighting ? 1 - seg(t, 3.2 + i * 0.3, 5.3) * (i === 3 ? 0.8 : 0.35) : 1;
        spearman(c, LOOKS[i % 4], sx + (i % 2) * 8, ry, 2, t < 2.2 ? walkF(t + i * 0.1, 8) : fighting ? 0 : 0, col, fighting ? t + i * 0.2 : 0);
        if (fighting) bar(c, sx + (i % 2) * 8, ry - 28, 12, hp, '#7dff8c');
      });
      flag(c, sx - 8, 62, col, t, 26);
      // защитники
      const dx0 = 140;
      [64, 76, 88].forEach((dy, i) => {
        const k = seg(t, 2.0 + i * 0.12, 3.0);
        const x = lerp(dx0 + 12, 82 + i * 4, k);
        const hp = fighting ? 1 - seg(t, 3.2 + i * 0.25, 5.2) : 1;
        if (hp > 0.05 || t < 5.3) {
          if (t < 5.4 || hp > 0.05) spearman(c, LOOKS[(i + 2) % 6], x, dy, 3, k < 1 && k > 0 ? walkF(t, 8) : 0, foeCol, fighting ? t + i * 0.3 : 0);
          if (t > 2.0 && t < 5.4) bar(c, x, dy - 28, 12, hp, '#ff6a5a');
        }
      });
      // стрелы
      if (fighting) {
        for (let i = 0; i < 3; i++) {
          const k = ((t * 1.4 + i * 0.33) % 1);
          const ax = lerp(124, 74, k);
          const ay = lerp(80, 74 + i * 6, k) - Math.sin(k * Math.PI) * 14;
          c.fillStyle = '#e8d8a8';
          c.fillRect(Math.round(ax), Math.round(ay), 4, 1);
          c.fillStyle = '#c8c8d8';
          c.fillRect(Math.round(ax) - 1, Math.round(ay), 1, 1);
        }
        for (let i = 0; i < 3; i++) {
          const k = ((t * 1.2 + i * 0.4) % 1);
          c.fillStyle = '#ffe27a';
          c.fillRect(Math.round(lerp(70, 88, k)), Math.round(70 + i * 8 - k * 4), 1, 1);
        }
      }
      // знамя победителя
      if (t > 5.4) {
        const k = seg(t, 5.4, 6.6);
        flag(c, 150, 62, col, t, Math.round(4 + k * 28));
        for (let i = 0; i < 6; i++) {
          c.fillStyle = i % 2 ? '#ffe27a' : '#fff';
          c.fillRect(Math.round(146 + ((i * 7 + t * 20) % 16)), Math.round(26 + ((i * 11) % 14)), 1, 1);
        }
        text(c, 'ПОБЕДА!', 100, 20, '#ffe27a', 9);
      }
    },
  },

  /* 7. Караван */
  caravan: {
    dur: 7,
    caps: [
      [0, 'Повозка с лошадью и двумя воинами охраны выезжает из провинции'],
      [2.2, 'В лесу выскакивают разбойники!'],
      [3.6, 'Охрана отбивает засаду'],
      [5.4, 'Золото довезено в столицу'],
    ],
    draw(c, t, S) {
      ground(c, 0);
      // дорога
      c.fillStyle = '#b89a62';
      c.fillRect(0, 60, W, 14);
      c.fillStyle = '#a08650';
      for (let i = 0; i < W; i += 10) c.fillRect(i, 66 + ((i * 3) % 5), 4, 1);
      for (let i = 0; i < 8; i++) sprite(c, S.spr[i % 2 ? 'pine1' : 'oak1'], 70 + i * 14, 40 + (i % 3) * 3);
      sprite(c, S.spr.bush, 86, 62);
      sprite(c, S.spr.bush, 96, 76);
      sprite(c, S.bspr.cv.house, 18, 56);
      sprite(c, S.bspr.cv.camp ?? S.bspr.cv.hall ?? S.bspr.cv.house, 172, 62);
      const stopped = t > 2.2 && t < 5.0;
      const cx = t < 2.2 ? lerp(22, 80, seg(t, 0.3, 2.2)) : t < 5.0 ? 80 : lerp(80, 150, seg(t, 5.0, 6.2));
      const y = 70;
      const roll = stopped ? 0 : t * 24;
      // повозка
      c.fillStyle = 'rgba(10,10,24,0.3)';
      c.fillRect(cx - 16, y + 1, 32, 2);
      c.fillStyle = '#6a4524';
      c.fillRect(Math.round(cx) - 10, y - 12, 18, 8);
      c.fillStyle = '#a07040';
      c.fillRect(Math.round(cx) - 10, y - 12, 18, 2);
      c.fillStyle = '#d8aa2a';
      c.fillRect(Math.round(cx) - 7, y - 15, 5, 3);
      c.fillRect(Math.round(cx) - 1, y - 14, 5, 2);
      for (const wx of [-7, 3]) {
        c.fillStyle = '#2a1c10';
        c.fillRect(Math.round(cx) + wx, y - 6, 5, 5);
        c.fillStyle = '#9a7446';
        c.fillRect(Math.round(cx) + wx + 2 + Math.round(Math.cos(roll * 0.5)), y - 4 + Math.round(Math.sin(roll * 0.5)), 1, 1);
      }
      // лошадь
      const hx = Math.round(cx) + 14;
      c.fillStyle = '#7a4a28';
      c.fillRect(hx, y - 11, 9, 5);
      c.fillRect(hx + 7, y - 15, 3, 5);
      c.fillStyle = '#2a1c10';
      c.fillRect(hx + 9, y - 14, 2, 2);
      const st = stopped ? 0 : Math.floor(t * 8) % 2;
      c.fillStyle = '#5a3a1c';
      c.fillRect(hx + 1, y - 6, 1, 6 - st);
      c.fillRect(hx + 7, y - 6, 1, 5 + st);
      c.fillRect(hx - 2, y - 11, 2, 1);
      // охрана
      [-20, 28].forEach((o, i) => spearman(c, LOOKS[3 + i], cx + o, y + 6 + i * 2, 2, stopped ? 0 : walkF(t + i * 0.2, 8), '#3a6ad8', stopped && t > 3.6 ? t + i * 0.3 : 0));
      // разбойники
      const ambush = t > 2.2 && t < 5.0;
      if (ambush) {
        const k = seg(t, 2.2, 2.7);
        const flee = seg(t, 4.4, 5.0);
        [-6, 12].forEach((o, i) => {
          const bx = cx + 20 + o + (i ? 8 : 0) + flee * 40;
          const by = lerp(54, 62 + i * 8, k);
          const dead = t > 4.2 && i === 1;
          if (dead) {
            c.globalAlpha = 1 - flee;
          }
          person(c, LOOKS[2 + i], bx, by, 3, t > 3.6 ? 0 : 0, 0);
          c.fillStyle = '#25252c';
          c.fillRect(Math.round(bx) - 5, Math.round(by) - 20, 10, 3);
          c.fillStyle = '#7a5a30';
          c.fillRect(Math.round(bx) - 8, Math.round(by) - 14, 1, 8);
          c.globalAlpha = 1;
          if (t < 3.0) emote(c, '❗', bx, by - 24, t);
          if (t > 3.6 && t < 4.4) bar(c, bx, by - 28, 12, 1 - seg(t, 3.6, 4.4), '#ff6a5a');
        });
        if (t > 3.6 && t < 4.4) for (let i = 0; i < 4; i++) {
          c.fillStyle = '#ffe27a';
          c.fillRect(Math.round(cx + 22 + ((t * 40 + i * 7) % 16)), 62 + ((i * 5) % 12), 1, 1);
        }
      }
      if (t > 5.4) {
        const k = seg(t, 5.4, 6.6);
        c.font = '10px sans-serif';
        c.textAlign = 'center';
        c.globalAlpha = 1 - k * 0.5;
        c.fillText('🪙', 160, 44 - k * 14);
        c.globalAlpha = 1;
        text(c, '+120', 172, 40 - k * 10, '#ffe27a', 8);
      }
      if (t < 1) text(c, 'Провинция', 18, 38, '#e8d4a8', 6);
      if (t > 5.8) text(c, 'Столица', 172, 28, '#e8d4a8', 6);
    },
  },

  /* 8. Зима и лёд */
  winter: {
    dur: 7,
    caps: [
      [0, 'Весна: пролив разделяет два острова'],
      [1.2, 'Приходит зима — земля покрывается снегом'],
      [2.6, 'Пролив затягивается льдом'],
      [4.0, 'Отряд переходит на соседний остров пешком по льду'],
    ],
    draw(c, t, S) {
      const snow = seg(t, 1.2, 2.6);
      const ice = seg(t, 2.6, 3.8);
      ground(c, 0, snow);
      water(c, 66, 0, 60, H, t, ice);
      // берега
      c.fillStyle = snow > 0.5 ? '#eef4fa' : '#d8c07a';
      c.fillRect(62, 0, 4, H);
      c.fillRect(126, 0, 4, H);
      // деревья и дома
      sprite(c, S.spr[snow > 0.5 ? 'pine0' : 'oak0'], 24, 44);
      sprite(c, S.spr.pine1, 40, 100);
      sprite(c, S.bspr.cv.house, 160, 62);
      sprite(c, S.spr.pine2, 176, 100);
      sprite(c, S.spr.pine1, 146, 36);
      // иконка сезона
      c.fillStyle = '#12121a';
      c.fillRect(4, 4, 26, 12);
      c.font = '10px sans-serif';
      c.textAlign = 'left';
      c.fillText(snow > 0.5 ? '❄️' : '🌸', 7, 14);
      text(c, snow > 0.5 ? 'ЗИМА' : 'ВЕСНА', 24, 13, snow > 0.5 ? '#bfe6ff' : '#ffb0d0', 6, 'left');
      // снегопад
      if (snow > 0.2) for (let i = 0; i < 22; i++) {
        c.fillStyle = 'rgba(255,255,255,0.85)';
        c.fillRect(Math.round((i * 29 + t * 8 * (1 + (i % 3) * 0.4)) % W), Math.round((i * 17 + t * 24 * (1 + (i % 4) * 0.3)) % H), 1, 1);
      }
      // отряд
      const k = seg(t, 4.0, 6.4);
      const bx = lerp(40, 150, k);
      const by = 84;
      [0, 1, 2].forEach((i) => {
        spearman(c, LOOKS[i], bx - i * 9, by + (i % 2) * 6, 2, k > 0 && k < 1 ? walkF(t + i * 0.1, 8) : 0, '#3a6ad8');
      });
      flag(c, bx + 8, by - 2, '#3a6ad8', t, 24);
      if (t > 3.8 && t < 4.4) text(c, 'лёд крепок!', 96, 40, '#cfeaff', 7);
      if (t > 6.2) text(c, 'Остров взят без флота!', 96, 20, '#ffe27a', 7);
    },
  },

  /* 9. Захват земель и Чудеса */
  claim: {
    dur: 6.4,
    caps: [
      [0, 'Инструмент [L]: ставим флаг на границе'],
      [1.4, 'Золотая граница расширяется'],
      [3.4, 'Граница накрывает Древний монолит'],
      [4.4, 'Чудо активировано — бонус ваш!'],
    ],
    draw(c, t, S) {
      ground(c, 1);
      tree(c, S, 'oak1', 22, 98);
      tree(c, S, 'birch2', 60, 30);
      tree(c, S, 'pine1', 176, 100);
      sprite(c, S.bspr.cv.camp ?? S.bspr.cv.house, 50, 66);
      const cx = 52;
      const cy = 60;
      const r = lerp(34, 78, seg(t, 1.4, 3.6));
      // территория
      c.save();
      c.beginPath();
      c.ellipse(cx, cy, r, r * 0.72, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,210,90,0.16)';
      c.fill();
      c.setLineDash([4, 3]);
      c.lineDashOffset = -t * 8;
      c.strokeStyle = '#ffd45a';
      c.lineWidth = 1.5;
      c.stroke();
      c.restore();
      // флаг [L]
      const fx = lerp(cx + 34, cx + 36, 0);
      const fy = 70;
      const k = seg(t, 0.6, 1.4);
      if (t > 0.6) {
        flag(c, fx, fy, '#7dff8c', t, Math.round(6 + k * 14));
        text(c, '[L]', fx + 4, fy + 9, '#ffe27a', 7);
      }
      if (t < 1.4) cursor(c, lerp(fx - 18, fx + 2, seg(t, 0, 0.6)), lerp(fy - 20, fy - 4, seg(t, 0, 0.6)));
      ring(c, fx, fy, seg(t, 0.6, 1.2), '#7dff8c');
      // монолит
      const mx = 140;
      const my = 76;
      const covered = r > Math.hypot((mx - cx) / 1, (my - cy) / 0.72) - 3;
      const act = covered && t > 3.5 ? seg(t, 3.5, 4.4) : 0;
      if (act > 0) glow(c, mx, my - 14, 30, 0.6 * act);
      c.fillStyle = 'rgba(10,10,24,0.3)';
      c.fillRect(mx - 8, my - 1, 16, 3);
      c.fillStyle = '#6a6a7a';
      c.fillRect(mx - 5, my - 28, 10, 28);
      c.fillStyle = '#8a8a9c';
      c.fillRect(mx - 5, my - 28, 3, 28);
      c.fillStyle = '#4a4a58';
      c.fillRect(mx + 3, my - 28, 2, 28);
      c.fillStyle = act > 0 ? '#ffe27a' : '#2a2a38';
      for (let i = 0; i < 4; i++) c.fillRect(mx - 2, my - 24 + i * 6, 4, 2);
      c.fillStyle = '#5a5a68';
      c.fillRect(mx - 4, my - 31, 8, 3);
      if (act > 0) {
        for (let i = 0; i < 8; i++) {
          c.fillStyle = i % 2 ? '#ffe27a' : '#fff';
          const a = t * 2 + i;
          c.fillRect(Math.round(mx + Math.cos(a) * 14), Math.round(my - 16 + Math.sin(a) * 14), 1, 1);
        }
        text(c, '✦ ЧУДО: +знания, +золото', mx - 12, my - 40, '#ffe27a', 6);
      } else if (t > 0.5) text(c, 'Древний монолит', mx, my - 36, '#d8d8e8', 6);
    },
  },

  /* 10. Династии, сословия, наместники */
  estate: {
    dur: 7,
    caps: [
      [0, 'Усадьба помещика: крепостные трудятся на полях'],
      [2.0, 'Назначаем наместника — героя-управленца'],
      [3.6, 'Дань течёт в казну… но часть оседает в кармане'],
      [5.0, 'Ревизия вскрывает казнокрада — золото возвращено'],
    ],
    draw(c, t, S) {
      ground(c, 0);
      // поля
      for (let f = 0; f < 2; f++) {
        const fx = 10 + f * 82;
        c.fillStyle = '#8a6a3a';
        c.fillRect(fx, 62, 66, 40);
        for (let r = 0; r < 6; r++) {
          c.fillStyle = r % 2 ? '#d8c04a' : '#b8a43a';
          c.fillRect(fx + 2, 64 + r * 6, 62, 3);
          c.fillStyle = '#5aa03c';
          for (let i = 0; i < 12; i++) c.fillRect(fx + 3 + i * 5, 63 + r * 6, 1, 2);
        }
      }
      sprite(c, S.bspr.cv.manor ?? S.bspr.cv.house, 96, 50);
      // помещик
      person(c, mkLook(0, 4, 4, false, { rich: true, beard: true }), 114, 54, 3, 0, 0);
      // крестьяне
      [[24, 80], [44, 92], [104, 78], [128, 90]].forEach(([x, y], i) => person(c, LOOKS[(i + 1) % 6], x, y, 2, workF(t + i * 0.3, 4), 3));
      // наместник
      const gov = mkLook(2, 0, 3, false, { vet: 2 });
      const gx = t < 2 ? 160 : lerp(160, 138, seg(t, 2, 2.8));
      const gy = 54;
      person(c, gov, gx, gy, 3, t > 2 && t < 2.8 ? walkF(t) : 0, 0);
      if (t > 2.4 && t < 4.2) {
        const k = seg(t, 2.4, 3.2);
        c.font = '10px sans-serif';
        c.textAlign = 'center';
        c.fillText('👑', gx, gy - 24 - (1 - k) * 12);
        text(c, 'Наместник', gx, gy - 33, '#ffe27a', 6);
      }
      // золото
      if (t > 3.6) {
        for (let i = 0; i < 6; i++) {
          const k = ((t - 3.6) * 0.8 + i / 6) % 1;
          const leak = i % 3 === 0;
          const x = lerp(gx, 164, k);
          const y = lerp(gy - 8, leak ? gy - 8 : 30, k) - Math.sin(k * Math.PI) * 8;
          if (t > 5.3 && leak) continue;
          c.font = '7px sans-serif';
          c.fillText('🪙', Math.round(leak ? lerp(gx, gx - 4, k) : x), Math.round(leak ? gy - 6 - k * 4 : y));
        }
        c.font = '10px sans-serif';
        c.fillText('💰', 172, 34);
        c.font = '9px sans-serif';
        c.fillText('👛', gx - 8, gy - 12);
      }
      // ревизор
      if (t > 4.6) {
        const k = seg(t, 4.6, 5.6);
        const ax = lerp(190, gx + 14, k);
        person(c, mkLook(1, 4, 0, false, { elder: true }), ax, gy + 8, 3, k < 1 ? walkF(t) : 0, 0);
        c.font = '10px sans-serif';
        c.textAlign = 'center';
        c.fillText('🔍', ax - 8, gy - 14);
        if (t > 5.4) {
          emote(c, '❗', gx, gy - 24, t);
          text(c, 'Казнокрад!', gx, gy - 33, '#ff9a8a', 6);
        }
        if (t > 5.8) {
          c.font = '9px sans-serif';
          c.fillText('🪙', lerp(gx, 164, seg(t, 5.8, 6.8)), lerp(gy - 8, 34, seg(t, 5.8, 6.8)) - 6);
        }
      }
    },
  },
};

export const SCENE_LABEL: Record<SceneKind, string> = {
  select: 'Рамка и приказы',
  build: 'Стройка и бригада',
  workshop: 'Цеха и штат [+]',
  food: 'Еда и завтрак',
  defense: 'Частокол и стража',
  assault: 'Поход и штурм',
  caravan: 'Караван и охрана',
  winter: 'Зима и лёд',
  claim: 'Флаг [L] и Чудеса',
  estate: 'Сословия и наместники',
};

export function DemoScene({ kind, game, className = '' }: { kind: SceneKind; game?: Game | null; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [cap, setCap] = useState(SCENES[kind].caps[0][1]);
  useEffect(() => {
    const cv = ref.current!;
    const c = cv.getContext('2d')!;
    const sc = SCENES[kind];
    const S = sprites(game);
    let raf = 0;
    let last = -1;
    const t0 = performance.now();
    c.imageSmoothingEnabled = false;
    const loop = (now: number) => {
      const t = (((now - t0) / 1000) % sc.dur + sc.dur) % sc.dur;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, W, H);
      c.imageSmoothingEnabled = false;
      try {
        sc.draw(c, t, S);
      } catch {
        /* спрайт ещё не готов — пропускаем кадр */
      }
      let idx = 0;
      for (let i = 0; i < sc.caps.length; i++) if (t >= sc.caps[i][0]) idx = i;
      if (idx !== last) {
        last = idx;
        setCap(sc.caps[idx][1]);
      }
      // прогресс цикла
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(0, H - 2, W, 2);
      c.fillStyle = '#ffcf6a';
      c.fillRect(0, H - 2, Math.round((W * t) / sc.dur), 2);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [kind, game]);
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ boxShadow: '0 0 0 3px #0f0906, 0 0 0 5px #8a5a2a', background: '#0f0906' }}>
      <canvas ref={ref} width={W} height={H} className="block w-full" style={{ imageRendering: 'pixelated', aspectRatio: `${W} / ${H}` }} />
      <div className="absolute inset-x-0 bottom-[3px] flex justify-center px-2">
        <div className="max-w-full px-2.5 py-1 text-center text-[13px] leading-tight font-bold text-[#ffe9a8]" style={{ background: 'rgba(15,9,6,0.86)', boxShadow: '0 0 0 2px #8a5a2a' }}>
          {cap}
        </div>
      </div>
      <div className="font-pixel absolute top-1.5 left-1.5 px-1.5 py-1 text-[7px] text-[#ffcf6a]" style={{ background: 'rgba(15,9,6,0.8)' }}>
        ▶ {SCENE_LABEL[kind].toUpperCase()}
      </div>
    </div>
  );
}
