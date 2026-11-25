/* ───────────── Герб державы: цвет щита и символ ───────────── */

export interface CrestColor {
  name: string;
  main: string;
  dark: string;
  light: string;
}

export const CREST_COLORS: CrestColor[] = [
  { name: 'Багряный', main: '#c8303a', dark: '#7a1a22', light: '#ee6a6a' },
  { name: 'Лазурный', main: '#3a6ad8', dark: '#1e3a8a', light: '#7aa4f4' },
  { name: 'Изумрудный', main: '#2aa86a', dark: '#12603a', light: '#6adc9a' },
  { name: 'Золотой', main: '#d8aa2a', dark: '#8a6a10', light: '#f8e070' },
  { name: 'Пурпурный', main: '#8a4ad8', dark: '#4a2488', light: '#b88af4' },
  { name: 'Чёрный', main: '#3a3a46', dark: '#17171e', light: '#7a7a8a' },
  { name: 'Снежный', main: '#d8dce8', dark: '#8a90a4', light: '#ffffff' },
  { name: 'Янтарный', main: '#e8742a', dark: '#8a3a10', light: '#ffb06a' },
];

export const CREST_SYMS = [
  { id: 'wolf', name: 'Волк', icon: '🐺' },
  { id: 'oak', name: 'Дуб', icon: '🌳' },
  { id: 'hammer', name: 'Молот', icon: '🔨' },
  { id: 'sun', name: 'Солнце', icon: '☀️' },
  { id: 'crown', name: 'Корона', icon: '👑' },
  { id: 'ship', name: 'Ладья', icon: '⛵' },
] as const;

/** 7×7 пиксельные символы: # — рисунок */
const BITS: string[][] = [
  // волк: голова с ушами
  ['#.....#', '##...##', '#######', '#.###.#', '#######', '.#####.', '..#.#..'],
  // дуб
  ['..###..', '.#####.', '#######', '.#####.', '..###..', '...#...', '..###..'],
  // молот
  ['.#####.', '.#####.', '...#...', '...#...', '...#...', '...#...', '...#...'],
  // солнце
  ['#..#..#', '.#####.', '.#####.', '###.###', '.#####.', '.#####.', '#..#..#'],
  // корона
  ['#.#.#.#', '#######', '#######', '#######', '.#####.', '.......', '.......'],
  // ладья
  ['...#...', '..##...', '.###...', '.####..', '.......', '#######', '.#####.'],
];

export interface CrestSel {
  c: number;
  s: number;
}

export const DEFAULT_CREST: CrestSel = { c: 0, s: 0 };

export const crestColor = (c: CrestSel) => CREST_COLORS[((c.c % CREST_COLORS.length) + CREST_COLORS.length) % CREST_COLORS.length];

/** символ: (x,y) — левый верхний угол, scale — размер пикселя битмапа */
export function drawSym(ctx: CanvasRenderingContext2D, x: number, y: number, c: CrestSel, scale = 1, fg?: string) {
  const bits = BITS[((c.s % 6) + 6) % 6];
  const col = fg ?? (c.c === 6 || c.c === 3 ? '#2a2018' : '#fff6d8');
  ctx.fillStyle = col;
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) if (bits[j][i] === '#') ctx.fillRect(Math.round(x + i * scale), Math.round(y + j * scale), scale, scale);
}

const urlCache = new Map<string, string>();

/** картинка герба для интерфейса (пиксельная, data URL) */
export function crestUrl(c: CrestSel, px = 6): string {
  const key = `${c.c}|${c.s}|${px}`;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = 11 * px;
  cv.height = 13 * px;
  const g = cv.getContext('2d')!;
  const k = crestColor(c);
  g.fillStyle = '#1a1008';
  g.fillRect(0, 0, 11 * px, 10 * px);
  g.fillRect(px, 10 * px, 9 * px, px);
  g.fillRect(2 * px, 11 * px, 7 * px, px);
  g.fillRect(3 * px, 12 * px, 5 * px, px);
  g.fillStyle = k.dark;
  g.fillRect(px, px, 9 * px, 9 * px);
  g.fillRect(2 * px, 10 * px, 7 * px, px);
  g.fillRect(3 * px, 11 * px, 5 * px, px);
  g.fillStyle = k.main;
  g.fillRect(2 * px, 2 * px, 7 * px, 8 * px);
  g.fillRect(3 * px, 10 * px, 5 * px, px);
  g.fillStyle = k.light;
  g.fillRect(2 * px, 2 * px, 7 * px, px);
  g.fillRect(2 * px, 2 * px, px, 6 * px);
  g.fillStyle = '#ffe27a';
  g.fillRect(px, 0, 9 * px, px);
  drawSym(g, 2 * px + Math.floor(px * 0.0), 3 * px, c, px);
  const out = cv.toDataURL();
  urlCache.set(key, out);
  return out;
}

const TINY = [
  ['#.#', '###', '.#.'],
  ['.#.', '###', '.#.'],
  ['###', '.#.', '.#.'],
  ['#.#', '.#.', '#.#'],
  ['#.#', '###', '###'],
  ['.#.', '.##', '###'],
];

/** крошечный 3×3 знак символа для флагов */
export function drawTiny(ctx: CanvasRenderingContext2D, x: number, y: number, c: CrestSel, col?: string) {
  const b = TINY[((c.s % 6) + 6) % 6];
  ctx.fillStyle = col ?? crestColor(c).light;
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (b[j][i] === '#') ctx.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
}
