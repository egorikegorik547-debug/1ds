import { useState } from 'react';
import type { Game, Snapshot } from '../game/game';
import { CREST_COLORS, CREST_SYMS, crestUrl, type CrestSel } from '../game/crest';
import {
  FAIR_ITEMS,
  LEVELS,
  RITES,
  activeRite,
  buyFair,
  chooseRite,
  dilemmaById,
  fairOpen,
  isSacred,
  levelOf,
  levelProgress,
  nickOf,
  resolveDilemma,
  riteLeftDays,
  thoughtOf,
  vetStats,
  xpOf,
} from '../game/extra';
import { RES_INFO, type ResKey } from '../game/data';

const COST_ICON: Record<string, string> = { food: '🍖', wood: '🪵', stone: '🪨', goods: '📦', gold: '🪙' };
const costText = (c: Record<string, number | undefined>) =>
  Object.entries(c)
    .filter(([, v]) => v)
    .map(([k, v]) => `${COST_ICON[k] ?? RES_INFO[k as ResKey]?.icon ?? ''}${v}`)
    .join(' ');

/* ───────────── Герб ───────────── */

export function CrestImg({ crest, px = 3, className = '' }: { crest: CrestSel; px?: number; className?: string }) {
  return <img src={crestUrl(crest, px)} alt="герб" className={`pix inline-block ${className}`} style={{ width: 11 * px, height: 13 * px }} />;
}

export function CrestPicker({ value, onChange }: { value: CrestSel; onChange: (c: CrestSel) => void }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="px-inset flex shrink-0 items-center justify-center self-start p-3">
        <CrestImg crest={value} px={7} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <div className="mb-1 text-[12px] text-[#c8b088]">Цвет щита: {CREST_COLORS[value.c].name}</div>
          <div className="flex flex-wrap gap-1.5">
            {CREST_COLORS.map((k, i) => (
              <button
                key={k.name}
                title={k.name}
                onClick={() => onChange({ ...value, c: i })}
                className="h-7 w-7 transition-transform hover:scale-110"
                style={{ background: k.main, boxShadow: value.c === i ? '0 0 0 3px #ffe27a, 0 0 0 5px #0f0906' : '0 0 0 2px #0f0906', imageRendering: 'pixelated' }}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[12px] text-[#c8b088]">Символ: {CREST_SYMS[value.s].name}</div>
          <div className="flex flex-wrap gap-1.5">
            {CREST_SYMS.map((s, i) => (
              <button key={s.id} onClick={() => onChange({ ...value, s: i })} className={`px-btn flex items-center gap-1.5 px-2 py-1 text-[13px] font-bold ${value.s === i ? 'active' : ''}`}>
                <CrestImg crest={{ c: value.c, s: i }} px={2} />
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[12px] text-[#a08868]">Герб украсит флаги, щиты воинов, паруса кораблей и шапку Летописи.</div>
      </div>
    </div>
  );
}

/* ───────────── Дилемма правителя ───────────── */

export function DilemmaCard({ game }: { game: Game; snap: Snapshot }) {
  const d = dilemmaById(game.x2.dil.id);
  if (!d) return null;
  return (
    <div className="px-panel fade-up pointer-events-auto absolute top-[150px] left-3 z-20 flex w-[min(330px,92vw)] flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[24px] leading-none">{d.icon}</span>
        <div className="font-pixel text-[8px] leading-snug text-[#ffe9a8]">ДИЛЕММА ПРАВИТЕЛЯ · {d.title.toUpperCase()}</div>
      </div>
      <div className="text-[14px] leading-snug text-[#f3e3c0]">{d.text}</div>
      {d.opts.map((o, i) => (
        <button key={i} onClick={() => resolveDilemma(game, i as 0 | 1)} className={`px-btn flex flex-col items-start gap-0.5 px-2.5 py-2 text-left ${i === 0 ? 'px-btn-green text-white' : ''}`}>
          <span className="text-[14px] font-bold">{o.label}</span>
          <span className="text-[12px] opacity-90">{o.effect}</span>
        </button>
      ))}
    </div>
  );
}

/* ───────────── Ярмарка ───────────── */

export function FairCard({ game, snap, onClose, compact }: { game: Game; snap: Snapshot; onClose?: () => void; compact?: boolean }) {
  const [note, setNote] = useState('');
  const F = game.x2.fair;
  const left = Math.max(0, Math.round((F.until - game.time) / 3));
  const cannot = (c: Record<string, number | undefined>) => Object.entries(c).some(([k, v]) => ((snap.res as Record<string, number>)[k] ?? 0) < (v ?? 0));
  const days = Math.max(0, Math.floor((F.next - game.time) / 180));
  return (
    <div className={`${compact ? 'px-panel pointer-events-auto' : 'px-inset'} flex flex-col gap-2 p-3`}>
      <div className="flex items-center justify-between gap-2">
        <div className="font-pixel text-[9px] text-[#ffe9a8]">🎪 КУПЕЧЕСКАЯ ЯРМАРКА</div>
        {onClose && (
          <button onClick={onClose} className="px-btn px-btn-red font-pixel px-2 py-1 text-[9px]">
            ✕
          </button>
        )}
      </div>
      {!F.open ? (
        <div className="text-[13px] text-[#c8b088]">Ярмарка собирается раз в 10–12 дней и стоит один день. Следующая — примерно через {days} дн.</div>
      ) : (
        <>
          <div className="text-[13px] text-[#e8d4a8]">Шатры на поляне у деревни. Торги закроются через ~{left} сек. Каждый товар — один раз за ярмарку.</div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {FAIR_ITEMS.map((it) => {
              const bought = F.bought.includes(it.id) || (it.kind === 'relic' && game.x2.relics.includes(it.id));
              const no = cannot(it.cost);
              return (
                <button
                  key={it.id}
                  disabled={bought || no}
                  onClick={() => setNote(buyFair(game, it.id) ?? `Куплено: ${it.name}`)}
                  className={`px-btn flex items-start gap-2 px-2 py-1.5 text-left ${bought ? 'opacity-50' : ''}`}
                >
                  <span className="text-[22px] leading-none">{it.icon}</span>
                  <span className="flex flex-col leading-tight">
                    <span className="text-[13px] font-bold">{it.name}</span>
                    <span className="text-[11px] text-[#c8b088]">{it.desc}</span>
                    <span className="mt-0.5 text-[12px] font-bold" style={{ color: bought ? '#8aff9a' : no ? '#ff9a8a' : '#ffe27a' }}>
                      {bought ? '✔ у вас' : costText(it.cost)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {note && <div className="text-[12px] text-[#ffcf6a]">{note}</div>}
    </div>
  );
}

export function FairChip({ game, onClick }: { game: Game; onClick: () => void }) {
  if (!fairOpen(game)) return null;
  return (
    <button onClick={onClick} className="px-btn px-btn-gold font-pixel pulse-px pointer-events-auto absolute top-[196px] right-3 z-20 px-3 py-2 text-[9px] md:top-[150px]">
      🎪 ЯРМАРКА
    </button>
  );
}

/* ───────────── Обряды ───────────── */

export function RitePanel({ game, snap }: { game: Game; snap: Snapshot }) {
  const [note, setNote] = useState('');
  const cur = activeRite(game);
  const curDef = RITES.find((r) => r.id === cur);
  return (
    <div className="px-inset flex flex-col gap-1.5 px-2 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-pixel text-[8px] text-[#ffcf6a]">🙏 СВЯЩЕННЫЕ ОБРЯДЫ</span>
        {curDef && (
          <span className="text-[12px] font-bold text-[#8aff9a]">
            {curDef.icon} {curDef.name} · ещё ~{riteLeftDays(game)} дн.
          </span>
        )}
      </div>
      {curDef ? (
        <div className="text-[12px] text-[#e8d4a8]">{curDef.desc} Новое покровительство — со следующего сезона.</div>
      ) : (
        <>
          <div className="text-[12px] text-[#c8b088]">Принесите дары и выберите покровителя на этот сезон:</div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {RITES.map((r) => {
              const no = Object.entries(r.cost).some(([k, v]) => ((snap.res as Record<string, number>)[k] ?? 0) < (v ?? 0));
              return (
                <button key={r.id} disabled={no} onClick={() => setNote(chooseRite(game, r.id) ?? '')} className="px-btn flex items-start gap-1.5 px-2 py-1.5 text-left">
                  <span className="text-[20px] leading-none">{r.icon}</span>
                  <span className="flex flex-col leading-tight">
                    <span className="text-[13px] font-bold">{r.name}</span>
                    <span className="text-[11px] text-[#c8b088]">{r.desc}</span>
                    <span className="text-[12px] font-bold" style={{ color: no ? '#ff9a8a' : '#ffe27a' }}>
                      Дар: {costText(r.cost)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {note && <div className="text-[12px] text-[#ff9a8a]">{note}</div>}
    </div>
  );
}

export const isSacredType = isSacred;

/* ───────────── Карточка жителя: мастерство, прозвище, мысли ───────────── */

export function UnitMark({ game, id }: { game: Game; id: number }) {
  const lv = levelOf(game, id);
  const nick = nickOf(game, id);
  if (lv === 0 && !nick) return null;
  return (
    <span title={`${LEVELS[lv]}${nick ? ` · «${nick}»` : ''}`} className="mr-0.5 text-[11px]" style={{ color: nick ? '#ffe27a' : lv === 2 ? '#ffd45a' : '#9affaa' }}>
      {nick ? '★' : ''}
      {lv === 2 ? '✦' : lv === 1 ? '▲' : ''}
    </span>
  );
}

export function UnitExtras({ game, id }: { game: Game; id: number; snap: Snapshot }) {
  const lv = levelOf(game, id);
  const nick = nickOf(game, id);
  const vet = vetStats(game, id);
  const pr = levelProgress(game, id);
  const col = lv === 2 ? '#ffd45a' : lv === 1 ? '#9affaa' : '#9ab0c8';
  return (
    <div className="px-inset flex flex-col gap-1 px-2.5 py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12px] font-bold" style={{ color: col }}>
          {lv === 2 ? '⭐ ' : lv === 1 ? '▲ ' : '◦ '}
          {LEVELS[lv]}
        </span>
        {lv < 2 && (
          <span className="px-inset block h-[7px] w-[70px] p-[1px]" title={`Опыт ${Math.floor(xpOf(game, id))}`}>
            <span className="block h-full" style={{ width: `${Math.round(pr * 100)}%`, background: col }} />
          </span>
        )}
        {lv === 2 && <span className="text-[11px] text-[#c8b088]">+30% к работе и бою · учит новичков рядом</span>}
        {nick && (
          <span className="px-inset px-1.5 py-0.5 text-[12px] font-bold text-[#ffe27a]" title="Ветеран: +15% к силе в бою">
            ★ «{nick}»
          </span>
        )}
        {vet && (vet.fights > 0 || vet.kills > 0) && (
          <span className="text-[11px] text-[#c8b088]">
            боёв: {vet.fights} · побед над врагом: {vet.kills}
          </span>
        )}
      </div>
      <div className="text-[13px] leading-snug text-[#e8d4a8] italic">💭 «{thoughtOf(game, id)}»</div>
    </div>
  );
}
