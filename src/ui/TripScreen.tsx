import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '../i18n/context';
import { categoryLabelKey } from '../i18n/keys';
import { db } from '../db/db';
import { addEvent, listEventsOfDay, listVariants, setEventCategory } from '../db/repo';
import { FLAGS, getFlag, getMapProvider, setFlag, setMapProvider } from '../db/settings';
import { guessCategory } from '../lib/category';
import { parseLeadingTime } from '../lib/ordering';
import { dateOfDay, dayCount, toDate, today } from '../lib/plainDate';
import { openMap } from '../lib/openExternal';
import type { MapProvider } from '../lib/maps';
import type { TripEvent } from '../db/types';
import type { ReflowResult } from '../db/repo';
import { Timeline } from './Timeline';
import { EventSheet } from './EventSheet';
import { EventActions, UndoBar } from './EventActions';
import { TripForm } from './TripForm';
import { MapProviderPrompt } from './Settings';
import { Sheet } from './Sheet';
import { CategoryPicker } from './CategoryPicker';
import { IconBack, IconMore, IconShare } from './Icon';
import { ShareSheet } from './ShareSheet';
import type { ImportOutcome } from './ShareSheet';
import { ImportResult } from './ImportResult';
import { VariantBar } from './VariantBar';
import { countUnsentChanges } from '../share/snapshot';

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

  const [draft, setDraft] = useState('');
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [actionEventId, setActionEventId] = useState<string | null>(null);
  const [categoryEventId, setCategoryEventId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [imported, setImported] = useState<ImportOutcome | null>(null);
  const [editingTrip, setEditingTrip] = useState(false);
  const [pendingMapFor, setPendingMapFor] = useState<TripEvent | null>(null);
  const [mapProvider, setMapProviderState] = useState<MapProvider | null>(null);
  const [undo, setUndo] = useState<{ result: ReflowResult; delta: number } | null>(null);
  const [knowsLongPress, setKnowsLongPress] = useState(true); // 読み込むまでは出さない
  const inputRef = useRef<HTMLInputElement>(null);

  const openEvent = events?.find((e) => e.id === openEventId) ?? null;
  const actionEvent = events?.find((e) => e.id === actionEventId) ?? null;
  const categoryEvent = events?.find((e) => e.id === categoryEventId) ?? null;

  useEffect(() => {
    void getMapProvider().then(setMapProviderState);
    void getFlag(FLAGS.knowsLongPress).then((v) => setKnowsLongPress(v));
  }, []);

  /**
   * 長押しヒントは**必要な場面でだけ**出す。
   * 時刻の入った予定が2件以上ある日 ── つまり「ずらす」が意味を持つ状態になって
   * はじめて見せる。空の日や1件だけの日に出しても邪魔なだけ。
   */
  const showHint =
    !knowsLongPress && (events?.filter((e) => e.startMinutes !== null).length ?? 0) >= 2;

  function dismissHint() {
    void setFlag(FLAGS.knowsLongPress);
    setKnowsLongPress(true);
  }

  // 「元に戻す」は数秒で消える。押さなければそのまま確定
  useEffect(() => {
    if (!undo) return;
    const id = window.setTimeout(() => setUndo(null), 6000);
    return () => window.clearTimeout(id);
  }, [undo]);

  // 旅の日数が縮んで、開いていた Day が範囲外になったときの保険
  const total = trip ? dayCount(trip.startDate, trip.endDate) : 1;
  useEffect(() => {
    if (trip && dayIndex >= total) onChangeDay(total - 1);
  }, [trip, dayIndex, total, onChangeDay]);

  if (!trip) return <div className="screen" />;

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
    const place = { name: event.name, lat: event.lat, lng: event.lng };
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
    setDraft('');
    // 連続追加。計画段階で行きたい場所をまとめて放り込めることが大事
    inputRef.current?.focus();
  }

  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-row">
          <button type="button" className="iconbtn" onClick={onBack} aria-label={t('common.back')}>
            <IconBack />
          </button>
          <h1>{trip.title}</h1>
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
            aria-label={t('trip.menu')}
          >
            <IconMore />
          </button>
        </div>
      </header>

      {/* 線は外側に。内側に置くと横スクロールで一緒に流れて途中で切れる */}
      <div className="daytabs-wrap">
        <div className="daytabs" role="tablist" aria-label={t('trip.dayTab', { n: total })}>
          {Array.from({ length: total }, (_, i) => {
            const d = dateOfDay(trip.startDate, i);
            return (
              <button
                key={i}
                type="button"
                role="tab"
                className="daytab"
                aria-selected={i === dayIndex}
                onClick={() => onChangeDay(i)}
              >
                <b>{t('trip.dayTab', { n: i + 1 })}</b>
                <small>{date(toDate(d))}</small>
              </button>
            );
          })}
        </div>
      </div>

      <div className="scroller">
        <div className="pad">
          {variants && variants.length >= 2 && (
            <VariantBar variants={variants} tripId={tripId} dayIndex={dayIndex} />
          )}

          {events && (
            <Timeline
              tripId={tripId}
              events={events}
              dayIndex={dayIndex}
              isToday={dayDate === todayDate}
              isLastDay={dayIndex === total - 1}
              mapProvider={mapProvider}
              onOpen={(e) => setOpenEventId(e.id)}
              onOpenMap={handleOpenMap}
              onLongPress={(e) => {
                // 使えたなら、もう教える必要はない
                dismissHint();
                setActionEventId(e.id);
              }}
              onPickCategory={(e) => setCategoryEventId(e.id)}
            />
          )}

          {showHint && (
            <div className="hintbar" role="note">
              <span>💡 {t('hint.longPress')}</span>
              <button type="button" onClick={dismissHint}>
                {t('hint.gotIt')}
              </button>
            </div>
          )}
        </div>
      </div>

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

      {draft.trim().length > 0 && (
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

      {undo && (
        <UndoBar result={undo.result} deltaMinutes={undo.delta} onDismiss={() => setUndo(null)} />
      )}

      {actionEvent && events && (
        <EventActions
          event={actionEvent}
          events={events}
          dayCount={total}
          onClose={() => setActionEventId(null)}
          onEdit={() => {
            setOpenEventId(actionEvent.id);
            setActionEventId(null);
          }}
          onReflowed={(result, delta) => setUndo({ result, delta })}
        />
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

      {editingTrip && <TripForm trip={trip} onClose={() => setEditingTrip(false)} />}

      {pendingMapFor && (
        <MapProviderPrompt
          onClose={() => setPendingMapFor(null)}
          onPick={(provider: MapProvider) => {
            pickedMapProvider(provider);
            openMap(provider, {
              name: pendingMapFor.name,
              lat: pendingMapFor.lat,
              lng: pendingMapFor.lng,
            });
            setPendingMapFor(null);
          }}
        />
      )}
    </div>
  );
}
