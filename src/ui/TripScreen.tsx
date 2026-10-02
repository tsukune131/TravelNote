import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '../i18n/context';
import { categoryLabelKey } from '../i18n/keys';
import { db } from '../db/db';
import {
  addEvent,
  ensureOwner,
  listEventsOfDay,
  listMembers,
  listVariants,
  setEventCategory,
  setTripNote,
} from '../db/repo';
import { getDisplayName, getMapProvider, setMapProvider } from '../db/settings';
import { categoryRank, guessCategory, ideaGroupOf } from '../lib/category';
import type { IdeaGroup } from '../lib/category';
import { parseLeadingTime } from '../lib/ordering';
import { dateOfDay, dayCount, toDate, today } from '../lib/plainDate';
import { openLink, openMap } from '../lib/openExternal';
import { mapLinkOf } from '../lib/maps';
import type { MapProvider } from '../lib/maps';
import { IDEAS_DAY } from '../db/types';
import type { TripEvent } from '../db/types';
import { linkLabelKey } from '../i18n/keys';
import { dayLabel } from './dayLabel';
import { Timeline } from './Timeline';
import { EventSheet } from './EventSheet';
import { TripForm } from './TripForm';
import { Prepare } from './Prepare';
import { InboxBar, InboxSheet } from './Inbox';
import { MapProviderPrompt } from './Settings';
import { Sheet } from './Sheet';
import { CategoryPicker } from './CategoryPicker';
import { IconBack, IconChecklist, IconPeople, IconSettings, IconShare } from './Icon';
import { ShareSheet } from './ShareSheet';
import type { ImportOutcome } from './ShareSheet';
import { ImportResult } from './ImportResult';
import { VariantBar } from './VariantBar';
import { AutoGrowTextarea } from './AutoGrowTextarea';
import { countUnsentChanges } from '../share/snapshot';
import { listInbox } from '../share/inbox';
import { MembersSheet } from './MembersSheet';
import { AssigneeFilter, AssigneePicker, AssigneeStack } from './Assignees';
import { WeatherBar } from './WeatherBar';
import { useTripWeather, weatherEmoji } from '../weather/weather';
import { useEventWeather } from '../weather/eventWeather';
import { tripFeaturesUnlocked } from '../pro/entitlement';
import { useProStatus } from '../pro/store';
import { noteAdAction } from '../ads/ads';

export function TripScreen({
  tripId,
  dayIndex,
  onChangeDay,
  onBack,
}: {
  tripId: string;
  dayIndex: number;
  onChangeDay: (next: number) => void;
  onBack: () => void;
}) {
  const { t, date } = useI18n();
  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId]);
  const events = useLiveQuery(() => listEventsOfDay(tripId, dayIndex), [tripId, dayIndex]);
  const variants = useLiveQuery(() => listVariants(tripId, dayIndex), [tripId, dayIndex]);
  const unsent = useLiveQuery(() => countUnsentChanges(tripId), [tripId]);
  const inbox = useLiveQuery(() => listInbox(), []);
  const members = useLiveQuery(() => listMembers(tripId), [tripId]);
  const pro = useProStatus();
  const unlocked = trip ? tripFeaturesUnlocked(trip, pro, Date.now()) : false;
  const weather = useTripWeather(trip, trip ? dayCount(trip.startDate, trip.endDate) : 0, unlocked);
  const eventWeather = useEventWeather(trip, dayIndex, events, unlocked);

  const [draft, setDraft] = useState('');
  /** 旅のメモを書いているあいだ。下の入力欄を引っ込める */
  const [noteFocused, setNoteFocused] = useState(false);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [categoryEventId, setCategoryEventId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [imported, setImported] = useState<ImportOutcome | null>(null);
  const [editingTrip, setEditingTrip] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  /** メモタブの担当での絞り込み。null = 全員、'' = 担当なし */
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [pendingMapFor, setPendingMapFor] = useState<TripEvent | null>(null);
  const [mapProvider, setMapProviderState] = useState<MapProvider | null>(null);
  const [linksEventId, setLinksEventId] = useState<string | null>(null);
  const [assignEventId, setAssignEventId] = useState<string | null>(null);
  /** ドラッグ中に指が乗っているタブ。そのタブを光らせる */
  const [dropDay, setDropDay] = useState<number | null>(null);
  /** ドラッグ中に指が乗っている見出し(メモタブ) */
  const [dropGroup, setDropGroup] = useState<IdeaGroup | null>(null);
  /** タブへ落として別の日へ移したあとに出す「移しました」 */
  const [moved, setMoved] = useState<{ name: string; dayIndex: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ideas = dayIndex === IDEAS_DAY;
  /*
   * 絞り込みはメモタブだけ。日の予定は時刻と移動でつながっているので、
   * 抜き出すと並びが読めなくなる。担当が1件も無い旅では絞り込みを出さない
   */
  const anyAssigned = ideas && (events?.some((e) => (e.assigneeIds?.length ?? 0) > 0) ?? false);
  const shownEvents =
    ideas && anyAssigned && assigneeFilter !== null
      ? events?.filter((e) =>
          assigneeFilter === ''
            ? (e.assigneeIds?.length ?? 0) === 0
            : (e.assigneeIds ?? []).includes(assigneeFilter),
        )
      : events;
  /*
   * メモタブは「行きたいところ / やりたいこと」に分け、それぞれアイコンの順に並べる
   * (同じアイコンどうしは入れた順のまま)。日の予定は時刻で並ぶので触らない。
   * 見出しは**片方が空でも2つとも出す** ── ドラッグ中だけ出すと、上の見出しが
   * 途中で現れて掴んでいる行の位置がずれる
   */
  const ideaGroups: { group: IdeaGroup; events: TripEvent[] }[] | null =
    ideas && shownEvents && shownEvents.length > 0
      ? (['place', 'todo'] as const)
          .map((group) => ({
            group,
            events: shownEvents
              .filter((e) => ideaGroupOf(e) === group)
              .sort((a, b) => categoryRank(a.category) - categoryRank(b.category)),
          }))
      : null;
  const openEvent = events?.find((e) => e.id === openEventId) ?? null;
  const categoryEvent = events?.find((e) => e.id === categoryEventId) ?? null;
  const linksEvent = events?.find((e) => e.id === linksEventId) ?? null;
  const assignEvent = events?.find((e) => e.id === assignEventId) ?? null;

  useEffect(() => {
    void getMapProvider().then(setMapProviderState);
  }, []);

  /*
   * 開いた旅には自分を必ずメンバーとして入れる。トップバーに最初から自分の顔が出る
   * (メンバーの画面を開くまで人のマークのままだった)。アイコンはほかの旅から引き継ぐ
   */
  useEffect(() => {
    void getDisplayName().then((name) => ensureOwner(tripId, name));
  }, [tripId]);

  useEffect(() => {
    if (!moved) return;
    const id = window.setTimeout(() => setMoved(null), 4000);
    return () => window.clearTimeout(id);
  }, [moved]);

  // 旅の日数が縮んで、開いていた Day が範囲外になったときの保険
  const total = trip ? dayCount(trip.startDate, trip.endDate) : 1;
  useEffect(() => {
    if (trip && dayIndex >= total) onChangeDay(total - 1);
  }, [trip, dayIndex, total, onChangeDay]);

  /** リンクが1本ならそのまま開く。2本以上ならどれを開くか選ばせる */
  function handleOpenLinks(event: TripEvent) {
    if (event.links.length === 1) {
      void openLink(event.links[0].url);
      return;
    }
    setLinksEventId(event.id);
  }

  if (!trip) return <div className="screen" />;

  /** Day タブの日付の横に、その日の天気の絵文字だけ(Pro・予報のある日だけ) */
  function dayWeather(i: number, d: string) {
    const f = unlocked ? weather.forecastFor(i)?.days.find((x) => x.date === d) : undefined;
    return f ? ` ${weatherEmoji(f.symbol)}` : null;
  }

  const todayDate = today();
  const dayDate = dateOfDay(trip.startDate, dayIndex);

  /**
   * 地図を開く。
   *
   * **設定の読み出しで await を挟まない。** 起動時に読んだ state を使う ──
   * DB 往復を挟むとユーザー操作との連続性が切れて、WKWebView が遷移を落とす
   * (詳しくは lib/openExternal.ts)。state がまだ空のときだけ DB に聞きに行く。
   */
  function handleOpenMap(event: TripEvent) {
    // 貼られた地図リンクが最優先。名前は同名の別の場所に飛ぶ(lib/maps.ts)
    const place = {
      name: event.name,
      lat: event.lat,
      lng: event.lng,
      url: mapLinkOf(event.links),
    };
    if (mapProvider) {
      openMap(mapProvider, place);
      return;
    }
    void getMapProvider().then((provider) => {
      if (provider) {
        setMapProviderState(provider);
        openMap(provider, place);
      } else {
        // 初回だけ聞く。以後は設定から変えられる
        setPendingMapFor(event);
      }
    });
  }

  function pickedMapProvider(provider: MapProvider) {
    void setMapProvider(provider);
    setMapProviderState(provider);
  }

  async function submitDraft() {
    // 「9:00 二条城」のように、時刻ごと1行で入れられる。
    // 時刻を入れるためだけに詳細シートを開かせない
    const { minutes, name } = parseLeadingTime(draft);
    if (name.length === 0) return;
    await addEvent(tripId, dayIndex, name, minutes);
    noteAdAction();
    setDraft('');
    // 連続追加。計画段階で行きたい場所をまとめて放り込めることが大事
    inputRef.current?.focus();
  }

  /** メモタブは見出しごとに、日の予定は1本で描く */
  function renderTimeline(list: TripEvent[]) {
    return (
      <Timeline
        tripId={tripId}
        events={list}
        members={members ?? []}
        dayIndex={dayIndex}
        ideas={ideas}
        isToday={!ideas && dayDate === todayDate}
        isLastDay={dayIndex === total - 1}
        mapProvider={mapProvider}
        onOpen={(e) => {
          noteAdAction();
          setOpenEventId(e.id);
        }}
        onOpenMap={handleOpenMap}
        onOpenLinks={handleOpenLinks}
        onAssign={ideas ? (e) => setAssignEventId(e.id) : undefined}
        onPickCategory={(e) => setCategoryEventId(e.id)}
        onHoverDay={setDropDay}
        onHoverGroup={setDropGroup}
        onMovedToDay={(e, to) => setMoved({ name: e.name, dayIndex: to })}
        weatherFor={unlocked ? eventWeather : undefined}
      />
    );
  }

  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-row">
          <button type="button" className="iconbtn" onClick={onBack} aria-label={t('common.back')}>
            <IconBack />
          </button>
          <h1>{trip.title}</h1>
          {/*
            メンバー・準備・共有・旅の設定は**トップバーに直接並べる**(以前は ⋯ のメニュー)。
            1段深いメニューは、旅行中に片手で探すには遠い
          */}
          {/*
            並びは メンバー → 準備 → 共有 → 設定(ユーザー判断 2026-10-02)。
            メンバーは**顔を重ねて出す** ── 旅を開いた瞬間に「誰と行く旅か」が分かり、
            選んだアイコンや写真が目に入る。まだ誰もいない旅は人のマーク
          */}
          <button
            type="button"
            className={`iconbtn plain${members && members.length > 0 ? ' faces' : ''}`}
            onClick={() => setMembersOpen(true)}
            aria-label={t('trip.members')}
          >
            {members && members.length > 0 ? (
              <AssigneeStack ids={members.map((m) => m.id)} members={members} size={26} />
            ) : (
              <IconPeople />
            )}
          </button>
          <button
            type="button"
            className="iconbtn plain"
            onClick={() => setPreparing(true)}
            aria-label={t('prepare.title')}
          >
            <IconChecklist />
          </button>
          <button
            type="button"
            className="iconbtn"
            onClick={() => setSharing(true)}
            aria-label={t('share.title')}
          >
            <IconShare />
            {/* 送ったあとに変わった件数。「送り返すのを忘れる」への手当て */}
            {unsent !== undefined && unsent > 0 && trip.sharedAt !== null && (
              <span className="dot" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="iconbtn plain"
            onClick={() => setEditingTrip(true)}
            aria-label={t('tripForm.editTitle')}
          >
            <IconSettings />
          </button>
        </div>
      </header>

      {/* 線は外側に。内側に置くと横スクロールで一緒に流れて途中で切れる */}
      <div className="daytabs-wrap">
        {/*
          タブはドラッグの落とし先を兼ねる(data-drop-day)。
          予定のつまみを掴んでタブに重ねて離すと、その日の末尾へ移る(Timeline.tsx)
        */}
        <div
          className="daytabs"
          role="tablist"
          aria-label={t('trip.dayTab', { n: total })}
          data-drop-strip=""
        >
          {/* 日を決めていないアイデアの置き場。Day 1 の手前に置く */}
          <button
            type="button"
            role="tab"
            className={`daytab ideas${dropDay === IDEAS_DAY ? ' drop' : ''}`}
            aria-selected={ideas}
            data-drop-day={IDEAS_DAY}
            onClick={() => onChangeDay(IDEAS_DAY)}
          >
            <b>{t('ideas.tab')}</b>
            <small>{t('ideas.tabSub')}</small>
          </button>
          {Array.from({ length: total }, (_, i) => {
            const d = dateOfDay(trip.startDate, i);
            return (
              <button
                key={i}
                type="button"
                role="tab"
                className={`daytab${dropDay === i ? ' drop' : ''}`}
                aria-selected={i === dayIndex}
                data-drop-day={i}
                onClick={() => onChangeDay(i)}
              >
                <b>{t('trip.dayTab', { n: i + 1 })}</b>
                <small>
                  {date(toDate(d))}
                  {dayWeather(i, d)}
                </small>
              </button>
            );
          })}
        </div>
      </div>

      <div className="scroller">
        <div className="pad">
          {/*
            届いたリンク。**旅行中こそ「この店よさそう」を放り込む**ので、
            旅一覧だけに置くと(旅行中は起動が旅に着地するため)一度も目に入らない。
            中身は端末のものなので、入れ先は「この日」と明示して押させる
          */}
          <InboxBar count={inbox?.length ?? 0} onOpen={() => setInboxOpen(true)} />

          {!ideas && (
            <WeatherBar
              trip={trip}
              dayIndex={dayIndex}
              day={dayDate}
              unlocked={unlocked}
              forecast={weather.forecastFor(dayIndex)}
              unavailable={weather.unavailable}
            />
          )}

          {/* 作成者が共有を終えた旅。消さずに残したことを1回だけ説明する場所 */}
          {trip.sharedEndedAt !== undefined && (
            <p className="guess" role="note">
              {t('sharedEnded.banner')}
            </p>
          )}

          {variants && variants.length >= 2 && (
            <VariantBar variants={variants} tripId={tripId} dayIndex={dayIndex} />
          )}


          {anyAssigned && members && (
            <AssigneeFilter members={members} value={assigneeFilter} onChange={setAssigneeFilter} />
          )}

          {/*
            見出しの塊は**ドラッグの落とし先を兼ねる**(data-drop-group)。予定のつまみを
            掴んでもう一方の見出しへ重ねて離すと、そちらへ移る(Day タブへ落とすのと同じ)
          */}
          {ideaGroups
            ? ideaGroups.map(({ group, events: list }) => (
                <div key={group} data-drop-group={group} className={dropGroup === group ? 'drop-group drop' : 'drop-group'}>
                  <p className="section-label">{t(group === 'place' ? 'ideas.places' : 'ideas.todos')}</p>
                  {/* 空の見出しも出す。移す先が見えていないと、ドラッグで移せると気づけない */}
                  {list.length > 0 ? renderTimeline(list) : <p className="drop-empty">{t('ideas.dropHere')}</p>}
                </div>
              ))
            : shownEvents && renderTimeline(shownEvents)}

          {/*
            旅のメモ(集合場所・連絡先など)。以前は準備(⋯)の中にあった。
            アイデアの一覧の下に置く ── 旅の前に書き溜める場所が1つにまとまる
          */}
          {ideas && (
            <div className="field ideas-note">
              <label htmlFor="trip-note">{t('prepare.note')}</label>
              <AutoGrowTextarea
                id="trip-note"
                key={trip.id}
                defaultValue={trip.note ?? ''}
                placeholder={t('prepare.notePlaceholder')}
                onFocus={() => setNoteFocused(true)}
                onBlur={(e) => {
                  setNoteFocused(false);
                  void setTripNote(trip.id, e.target.value);
                }}
              />
            </div>
          )}

        </div>
      </div>

      {/*
        **メモを書いているあいだは出さない。** キーボードと一緒に持ち上がって
        書いている行の上に重なり、メモが見えなくなっていた(実機で報告)
      */}
      {!noteFocused && (
      <div className="addbar">
        <input
          ref={inputRef}
          value={draft}
          placeholder={t('event.namePlaceholder')}
          enterKeyHint="done"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitDraft();
          }}
          aria-label={t('timeline.addEvent')}
        />
        <button type="button" className="btn" onClick={() => void submitDraft()} disabled={draft.trim().length === 0}>
          {t('common.add')}
        </button>
      </div>
      )}

      {!noteFocused && draft.trim().length > 0 && (
        <p
          className="guess addbar-hint"
          style={{
            position: 'fixed',
            left: '0.9rem',
            right: '0.9rem',
            bottom: 'calc(var(--safe-bottom) + 3.6rem)',
            textAlign: 'right',
          }}
        >
          {t('event.guessedCategory')}: {t(categoryLabelKey(guessCategory(draft)))} ・{' '}
          {t('event.nameHint')}
        </p>
      )}

      {moved && (
        <div className="undobar" role="status">
          <span>
            {moved.name} — {t('timeline.movedTo', { day: dayLabel(t, moved.dayIndex) })}
          </span>
          <button
            type="button"
            onClick={() => {
              onChangeDay(moved.dayIndex);
              setMoved(null);
            }}
          >
            {t('timeline.show')}
          </button>
        </div>
      )}

      {/* 担当はメモタブの行から。複数付けられるので、選んでも閉じない */}
      {assignEvent && (
        <Sheet title={assignEvent.name} onClose={() => setAssignEventId(null)}>
          <AssigneePicker event={assignEvent} />
        </Sheet>
      )}

      {linksEvent && (
        <Sheet title={linksEvent.name} onClose={() => setLinksEventId(null)}>
          <div>
            {linksEvent.links.map((link) => (
              <button
                key={link.url}
                type="button"
                className="menu-item"
                onClick={() => {
                  void openLink(link.url);
                  setLinksEventId(null);
                }}
              >
                <span className="link-choice">
                  <b>{link.customLabel ?? t(linkLabelKey(link.label))}</b>
                  <small>{link.url}</small>
                </span>
                <span className="sub">›</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {categoryEvent && (
        <Sheet title={categoryEvent.name} onClose={() => setCategoryEventId(null)}>
          <CategoryPicker
            value={categoryEvent.category}
            onChange={(next) => {
              void setEventCategory(categoryEvent.id, next);
              setCategoryEventId(null);
            }}
          />
        </Sheet>
      )}

      {openEvent && (
        <EventSheet
          event={openEvent}
          onClose={() => setOpenEventId(null)}
          onOpenMap={handleOpenMap}
        />
      )}

      {sharing && (
        <ShareSheet
          trip={trip}
          onClose={() => setSharing(false)}
          onImported={(outcome) => {
            setSharing(false);
            setImported(outcome);
          }}
        />
      )}

      {imported && <ImportResult outcome={imported} onClose={() => setImported(null)} />}

      {preparing && <Prepare trip={trip} onClose={() => setPreparing(false)} />}

      {membersOpen && <MembersSheet tripId={tripId} onClose={() => setMembersOpen(false)} />}

      {inboxOpen && (
        <InboxSheet here={{ tripId, dayIndex }} onClose={() => setInboxOpen(false)} />
      )}

      {editingTrip && (
        <TripForm
          trip={trip}
          onClose={() => setEditingTrip(false)}
          // 消した旅の画面には留まれない
          onDeleted={onBack}
        />
      )}

      {pendingMapFor && (
        <MapProviderPrompt
          onClose={() => setPendingMapFor(null)}
          onPick={(provider: MapProvider) => {
            pickedMapProvider(provider);
            openMap(provider, {
              name: pendingMapFor.name,
              lat: pendingMapFor.lat,
              lng: pendingMapFor.lng,
              url: mapLinkOf(pendingMapFor.links),
            });
            setPendingMapFor(null);
          }}
        />
      )}
    </div>
  );
}
