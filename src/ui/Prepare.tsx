import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import {
  addPackItems,
  clearCheckedPackItems,
  listBookedEvents,
  removePackItem,
  setTripNote,
  togglePackItem,
} from '../db/repo';
import { PACK_TEMPLATES, PACK_TEMPLATE_EMOJI, packItemKey, packTemplateKey } from '../lib/packing';
import type { PackTemplateId } from '../lib/packing';
import type { Trip } from '../db/types';

/**
 * 準備(docs/ux-design.md §7.1)。
 *
 * 旅程そのものではないが、旅の前後で必ず要るものを1か所に集める。
 * 順番は**使う時系列**に合わせてある ── 出発前に持ち物、
 * 移動中と現地で予約まとめ、いつでもメモ。
 */
export function Prepare({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const { t } = useI18n();
  const items = trip.packing ?? [];
  const checked = items.filter((i) => i.checked).length;

  return (
    <Sheet title={t('prepare.title')} onClose={onClose}>
      <div className="field">
        <label>
          {t('prepare.packing')}
          {items.length > 0 && ` ${checked}/${items.length}`}
        </label>

        {items.length === 0 ? (
          <>
            <p className="guess">{t('prepare.packingEmpty')}</p>
            <div className="seed-row">
              {(Object.keys(PACK_TEMPLATES) as PackTemplateId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  className="seed"
                  onClick={() =>
                    void addPackItems(
                      trip.id,
                      PACK_TEMPLATES[id].map((k) => t(packItemKey(k))),
                    )
                  }
                >
                  {PACK_TEMPLATE_EMOJI[id]} {t(packTemplateKey(id))}
                </button>
              ))}
            </div>
          </>
        ) : (
          items.map((item) => (
            <div className="packrow" key={item.id}>
              <label className="inline-toggle">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => void togglePackItem(trip.id, item.id)}
                />
                <span className={item.checked ? 'done' : undefined}>{item.text}</span>
              </label>
              <button
                type="button"
                className="iconbtn plain"
                aria-label={`${item.text} — ${t('common.delete')}`}
                onClick={() => void removePackItem(trip.id, item.id)}
              >
                ✕
              </button>
            </div>
          ))
        )}

        <AddItem tripId={trip.id} />

        {/* 旅が終わったあとの掃除。全部チェックが付いてから出す */}
        {items.length > 0 && checked === items.length && (
          <button
            type="button"
            className="btn ghost wide"
            onClick={() => void clearCheckedPackItems(trip.id)}
          >
            {t('prepare.clearChecked')}
          </button>
        )}
      </div>

      <Bookings trip={trip} />

      <div className="field">
        <label htmlFor="trip-note">{t('prepare.note')}</label>
        <textarea
          id="trip-note"
          defaultValue={trip.note ?? ''}
          placeholder={t('prepare.notePlaceholder')}
          onBlur={(e) => void setTripNote(trip.id, e.target.value)}
        />
      </div>
    </Sheet>
  );
}

function AddItem({ tripId }: { tripId: string }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');

  function add() {
    if (draft.trim().length === 0) return;
    void addPackItems(tripId, [draft]);
    setDraft('');
  }

  return (
    <div className="row">
      <input
        value={draft}
        placeholder={t('prepare.addItem')}
        aria-label={t('prepare.addItem')}
        enterKeyHint="done"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add();
        }}
      />
      <button
        type="button"
        className="btn ghost"
        style={{ flex: '0 0 auto' }}
        onClick={add}
        disabled={draft.trim().length === 0}
      >
        {t('common.add')}
      </button>
    </div>
  );
}

/**
 * 予約まとめ。
 *
 * **旅ぜんぶを横断して集める。**空港のカウンターで「予約番号どこだっけ」と
 * Day を行き来させない。予定側で 🎫 を付けたものがここに自動で並ぶ。
 */
function Bookings({ trip }: { trip: Trip }) {
  const { t, time } = useI18n();
  const booked = useLiveQuery(() => listBookedEvents(trip.id), [trip.id]);

  return (
    <div className="field">
      <label>{t('prepare.bookings')}</label>
      {booked === undefined ? null : booked.length === 0 ? (
        <p className="guess">{t('prepare.bookingsEmpty')}</p>
      ) : (
        booked.map((e) => (
          <div className="bookrow" key={e.id}>
            <span className="when">
              {t('trip.dayTab', { n: e.dayIndex + 1 })}
              {e.startMinutes !== null && ` ${time(e.startMinutes)}`}
            </span>
            <span className="what">{e.name}</span>
            {/* 予約番号は**選んでコピーできる**ように、ボタンにしない */}
            {e.booking?.reference && <span className="ref">{e.booking.reference}</span>}
            {e.booking?.partySize !== undefined && (
              <span className="badge">{t('event.partySize', { n: e.booking.partySize })}</span>
            )}
          </div>
        ))
      )}
    </div>
  );
}
