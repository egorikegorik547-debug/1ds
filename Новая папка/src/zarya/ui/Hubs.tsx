import type { ReactNode } from 'react';
import type { Game, Snapshot } from '../game/game';
import { CourtPanel, type CourtTab } from './CourtPanel';
import { DecreePanel } from './DecreePanel';
import { EconomyPanel } from './EconomyPanel';
import { LifePanel, type LifeTab } from './LifePanel';
import { RealmPanel, type RealmTab } from './RealmPanel';
import { WorldPanel } from './WorldPanel';
import { LEGACY } from '../game/techlegacy';

/* ───────────── Три больших окна: Хозяйство [M], Люди и Двор [N], Мир и Война [V] ───────────── */

export type HubId = 'econ' | 'people' | 'war';
export interface HubState {
  id: HubId;
  tab: string;
  pill?: string;
  focusBld?: number | null;
  focusTown?: number | null;
}

interface Pill {
  id: string;
  name: string;
  hint: string;
}
interface TabDef {
  id: string;
  name: string;
  icon: string;
  hint: string;
  badge?: number;
  lock?: string;
  hidden?: boolean;
  pills?: Pill[];
}

export const HUB_INFO: Record<HubId, { icon: string; name: string; key: string; sub: string }> = {
  econ: { icon: '⚒️', name: 'Хозяйство', key: 'M', sub: 'ресурсы, еда, рынок и крафт в цехах' },
  people: { icon: '👥', name: 'Люди и Двор', key: 'N', sub: 'жители, роды, странники и управление' },
  war: { icon: '⚔️', name: 'Мир и Война', key: 'V', sub: 'соседи, воины, караваны, летопись и победа' },
};

const LOCK = 'Откроется, когда присоедините первое соседнее селение';

export const hasProvince = (snap: Snapshot) => snap.provinces > 0 || snap.soc.estates.length > 0;
export const hasLaws = (snap: Snapshot) => snap.provinces > 0 || snap.soc.rule.lords || snap.soc.rule.serfs || snap.soc.rule.slaves || snap.done.some((id) => LEGACY[id] && (LEGACY[id].kind === 'decree' || LEGACY[id].kind === 'class'));

function govBadge(snap: Snapshot) {
  const free = snap.soc.heroes.filter((h) => h.town == null).length;
  const need = snap.provinces - snap.towns.filter((t) => t.owner === 'player' && t.governor !== null).length;
  return free > 0 && need > 0 ? need : 0;
}

export function hubBadge(id: HubId, snap: Snapshot): number {
  if (id === 'econ') return snap.shortStaff + (snap.unpaid ? 1 : 0);
  if (id === 'people') return snap.life.visitors + snap.life.fallen + govBadge(snap);
  return snap.ext.caravans.active.filter((c) => c.ambush).length;
}

export function hubTabs(id: HubId, snap: Snapshot): TabDef[] {
  const prov = hasProvince(snap);
  if (id === 'econ')
    return [
      { id: 'res', name: 'Ресурсы и Еда', icon: '🪵', hint: 'Здесь видно, чего хватает, а чего нет: дерево, камень, еда и золото. Красное — повод отправить людей на добычу (кнопка [J] раздаст работу сама).', badge: snap.food.days < 3 ? 1 : 0 },
      { id: 'craft', name: 'Мастерские и Крафт', icon: '🔨', hint: 'Здесь вы заказываете топоры, плуги и мечи — свободные жители сами придут в мастерскую и сделают их.', badge: snap.shortStaff },
      { id: 'market', name: 'Рынок и Налоги', icon: '💰', hint: 'Здесь вы решаете, сколько брать налогов, и меняете лишнее на золото — или докупаете то, чего не хватает.', badge: snap.unpaid ? 1 : 0 },
    ];
  if (id === 'people')
    return [
      { id: 'fam', name: 'Жители и Роды', icon: '👪', hint: 'Здесь живут ваши люди и их семьи. Хорошие семьи растят детей — а дети вырастают в работников и воинов.' },
      {
        id: 'hunt',
        name: 'Охота и Кладбище',
        icon: '🪦',
        badge: snap.life.fallen,
        hint: '',
        pills: [
          { id: 'hunt', name: '🐺 Охота и ночь', hint: 'Здесь вы нанимаете охотников — они добывают мясо и отгоняют волков, пока деревня спит.' },
          { id: 'grave', name: '🪦 Кладбище', hint: 'Здесь хоронят павших. Память о героях даёт армии боевой дух — не оставляйте тела без погребения.' },
        ],
      },
      { id: 'guests', name: 'Странники', icon: '🧳', badge: snap.life.visitors, hint: 'К вам заглядывают кузнецы, ведьмы и рыцари. Выслушайте каждого — у него есть предложение или просьба.' },
      {
        id: 'law',
        name: 'Указы и Законы',
        icon: '📜',
        hidden: !hasLaws(snap),
        hint: '',
        pills: [
          { id: 'tax', name: '💰 Налоги', hint: 'Здесь вы решаете, сколько подати брать с народа: чем выше налог, тем больше золота — и тем злее люди.' },
          { id: 'class', name: '⛓️ Сословия', hint: 'Здесь решается, кто свободен, а кто работает на помещика. Зависимых можно освободить в любой момент.' },
          { id: 'decree', name: '📜 Указы двора', hint: 'Короткие распоряжения власти: нажали — и народ делает по-новому на несколько минут.' },
          { id: 'deeds', name: '✨ Дела науки', hint: 'Здесь собраны приказы, указы и классовые дела, которые открыла наука. Нажмите «Выполнить» — эффект сразу.' },
        ],
      },
      {
        id: 'gov',
        name: 'Наместники',
        icon: '🎩',
        badge: govBadge(snap),
        hidden: !hasLaws(snap),
        lock: prov ? undefined : LOCK,
        hint: '',
        pills: [
          { id: 'gov', name: '🎩 Наместники', hint: 'Здесь вы ставите наместников в присоединённые селения — иначе там начнётся ропот и не будет дани.' },
          { id: 'cap', name: '🏰 Столица', hint: 'Столица — главный город державы. Отсюда идёт приказ всем провинциям, а её защита — защита государства.' },
        ],
      },
    ];
  return [
    {
      id: 'army',
      name: 'Армия и Соседи',
      icon: '⚔️',
      hint: '',
      pills: [
        { id: 'diplo', name: '🌍 Соседи и походы', hint: 'Здесь вы нанимаете воинов и отправляете их захватывать или мириться с соседними городами.' },
        { id: 'gear', name: '🛡️ Войско и снаряжение', hint: 'Здесь видно, кто из воинов чем вооружён, и что лежит на складе. Нет оружия — закажите его в кузнице.' },
      ],
    },
    {
      id: 'car',
      name: 'Караваны и Чудеса',
      icon: '🐎',
      badge: snap.ext.caravans.active.filter((c) => c.ambush).length,
      lock: prov ? undefined : LOCK,
      hint: '',
      pills: [
        { id: 'car', name: '🐎 Караваны', hint: 'Здесь вы отправляете повозки с товарами в свои селения. Дорога опасна — берегитесь засад, дайте охрану.' },
        { id: 'wonders', name: '✦ Чудеса', hint: 'Чудеса света — огромные стройки на всю державу. Они дают бонусы и приближают победу.' },
      ],
    },
    {
      id: 'chron',
      name: 'Летопись и Победа',
      icon: '📖',
      hint: '',
      pills: [
        { id: 'chron', name: '📖 Летопись', hint: 'Здесь записана вся история вашего племени — день за днём. Можно сохранить её картинкой.' },
        { id: 'ach', name: '🏆 Достижения', hint: 'Награды за смелые дела. Каждое достижение даёт небольшой постоянный бонус.' },
        { id: 'victory', name: '🏁 Победа', hint: 'Здесь видно, насколько вы близки к победе — войной, золотом или наукой.' },
        { id: 'rivals', name: '🌐 Державы ИИ', hint: 'Другие державы идут к своей цели. Следите за соперниками — и за тем, кто сильнее вас.' },
      ],
    },
  ];
}

function Locked({ text }: { text: string }) {
  return (
    <div className="px-inset flex flex-col items-center gap-3 p-10 text-center">
      <div className="text-[56px]">🔒</div>
      <div className="text-[20px] font-bold text-[#ffe9a8]">{text}</div>
      <div className="text-[14px] text-[#c8b088]">Захватите землю [L] или присоедините соседей в разделе «Мир и Война» [V].</div>
    </div>
  );
}

export function HubPanel({ game, snap, hub, setHub, onClose }: { game: Game; snap: Snapshot; hub: HubState; setHub: (h: HubState) => void; onClose: () => void }) {
  const info = HUB_INFO[hub.id];
  const tabs = hubTabs(hub.id, snap).filter((t) => !t.hidden);
  const tab = tabs.find((t) => t.id === hub.tab) ?? tabs[0];
  const pill = tab.pills ? tab.pills.find((p) => p.id === hub.pill) ?? tab.pills[0] : null;
  const hint = pill ? pill.hint : tab.hint;
  const goCraft = () => setHub({ id: 'econ', tab: 'craft' });
  const s = snap.soc;

  let body: ReactNode = null;
  if (tab.lock) body = <Locked text={tab.lock} />;
  else if (hub.id === 'econ') {
    if (tab.id === 'craft') body = <LifePanel game={game} snap={snap} onClose={onClose} tabOverride="prod" embedded focusBld={hub.focusBld} />;
    else body = <EconomyPanel game={game} snap={snap} onClose={onClose} embedded section={tab.id === 'market' ? 'market' : 'res'} />;
  } else if (hub.id === 'people') {
    const life = (t: LifeTab) => <LifePanel game={game} snap={snap} onClose={onClose} tabOverride={t} embedded />;
    const court = (t: CourtTab) => <CourtPanel game={game} snap={snap} onClose={onClose} tabOverride={t} embedded />;
    if (tab.id === 'fam') body = life('fam');
    else if (tab.id === 'hunt') body = life(pill?.id === 'grave' ? 'grave' : 'hunt');
    else if (tab.id === 'guests') body = life('guests');
    else if (tab.id === 'law') body = pill?.id === 'deeds' ? <DecreePanel game={game} snap={snap} onClose={onClose} embedded /> : court(pill?.id === 'class' ? 'class' : pill?.id === 'decree' ? 'decree' : 'tax');
    else body = court(pill?.id === 'cap' ? 'cap' : 'gov');
  } else {
    if (tab.id === 'army') body = pill?.id === 'gear' ? <LifePanel game={game} snap={snap} onClose={onClose} tabOverride="army" embedded /> : <WorldPanel game={game} snap={snap} focusId={hub.focusTown ?? null} onClose={onClose} embedded goCraft={goCraft} />;
    else body = <RealmPanel game={game} snap={snap} embedded tab={(pill?.id ?? 'chron') as RealmTab} setTab={() => undefined} onClose={onClose} />;
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div className="px-panel flex h-[min(95vh,900px)] w-full max-w-[1260px] flex-col p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[34px] leading-none">{info.icon}</span>
            <div>
              <h2 className="font-pixel text-[15px] text-[#ffe9a8]">
                {info.name.toUpperCase()} <span className="text-[10px] text-[#ffcf6a]">[{info.key}]</span>
              </h2>
              <div className="mt-1 text-[13px] text-[#c8b088]">{info.sub}</div>
            </div>
          </div>
          {hub.id === 'people' && (
            <div className="flex flex-wrap gap-2 text-[14px] font-bold">
              <span className="px-inset px-2.5 py-1.5" style={{ color: s.happy > 60 ? '#8aff9a' : s.happy > 35 ? '#ffd27a' : '#ff7a6a' }}>😊 Счастье {s.happy}%</span>
              {s.unrest > 40 && <span className="px-inset px-2.5 py-1.5 text-[#ff7a6a]">🔥 Недовольство {s.unrest}%</span>}
              <span className="px-inset px-2.5 py-1.5 text-[#e8d4a8]">👥 {snap.pop}/{snap.housing}</span>
            </div>
          )}
          <div className="flex gap-2">
            {(Object.keys(HUB_INFO) as HubId[]).filter((k) => k !== hub.id).map((k) => (
              <button key={k} onClick={() => setHub({ id: k, tab: hubTabs(k, snap).filter((t) => !t.hidden)[0].id })} className="px-btn relative px-3 py-2 text-[13px] font-bold" title={`Перейти: ${HUB_INFO[k].name} [${HUB_INFO[k].key}]`}>
                {HUB_INFO[k].icon} {HUB_INFO[k].name}
                {hubBadge(k, snap) > 0 && <span className="font-pixel absolute -top-2 -left-1.5 bg-[#c0392b] px-1 py-[3px] text-[8px] text-white">{hubBadge(k, snap)}</span>}
              </button>
            ))}
            <button onClick={onClose} className="px-btn px-btn-red font-pixel px-4 py-3 text-[10px]">
              ЗАКРЫТЬ ✕
            </button>
          </div>
        </div>

        <div className="mb-2 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setHub({ id: hub.id, tab: t.id })} className={`px-btn relative flex items-center gap-2 px-4 py-2.5 text-[15px] font-bold ${tab.id === t.id ? 'active' : ''} ${t.lock ? 'opacity-70' : ''}`} title={t.lock}>
              <span className="text-[20px]">{t.lock ? '🔒' : t.icon}</span>
              {t.name}
              {!!t.badge && !t.lock && <span className="font-pixel absolute -top-2 -left-1.5 bg-[#c0392b] px-1 py-[3px] text-[8px] text-white">{t.badge}</span>}
            </button>
          ))}
        </div>

        {tab.pills && !tab.lock && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {tab.pills.map((p) => (
              <button key={p.id} onClick={() => setHub({ id: hub.id, tab: tab.id, pill: p.id })} className={`px-btn px-3 py-1.5 text-[13px] font-bold ${pill?.id === p.id ? 'active' : ''}`}>
                {p.name}
              </button>
            ))}
          </div>
        )}

        <div className="px-inset mb-3 flex items-center gap-3 px-4 py-2.5">
          <span className="text-[22px]">💬</span>
          <span className="text-[17px] leading-snug font-bold text-[#ffe9a8]">{tab.lock ? tab.lock : hint}</span>
        </div>

        <div className="embed flex min-h-0 flex-1 flex-col">{body}</div>
      </div>
    </div>
  );
}
