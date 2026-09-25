import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { LinkList } from './LinkList';
import { DateRangePicker } from './DateRangePicker';
import { PlaceField } from './PlaceField';
import { withPlaceFrom } from '../weather/places';
import { addTripLink, createTrip, deleteTrip, removeTripLink, updateTrip } from '../db/repo';
import { addDays, dayCount, isPlainDate, toDate, today } from '../lib/plainDate';
import type { PlainDate } from '../lib/plainDate';
import type { Trip, TripPlace } from '../db/types';

const MAX_DAYS = 60;

/** 'YYYY-MM-DD' の頭4桁 */
function yearOf(date: PlainDate): string {
  return date.slice(0, 4);
}

export function TripForm({
  trip,
  onClose,
  onCreated,
  onDeleted,
}: {
  trip?: Trip;
  onClose: () => void;
  onCreated?: (tripId: string) => void;
  /** 消したあとは、その旅の画面に留まれない。呼び出し側が一覧へ戻す */
  onDeleted?: () => void;
}) {
  const { t, date } = useI18n();
  const [title, setTitle] = useState(trip?.title ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [startDate, setStartDate] = useState<PlainDate>(trip?.startDate ?? today());
  const [endDate, setEndDate] = useState<PlainDate>(trip?.endDate ?? addDays(today(), 2));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** つくるときの旅先。まだ旅が無いので手元に持ち、作成時に一緒に書く */
  const [place, setPlace] = useState<TripPlace | undefined>(undefined);

  /**
   * 入れたものが正しいか。**正しくないものは保存しない**(自動保存でも同じ)。
   * 返り値はエラーの文言。null なら通る。
   */
  function validate(name: string, from: PlainDate, to: PlainDate): string | null {
    if (name.trim().length === 0) return t('tripForm.nameError');
    if (!isPlainDate(from) || !isPlainDate(to)) return t('tripForm.rangeError');
    if (to < from) return t('tripForm.rangeError');
    if (dayCount(from, to) > MAX_DAYS) return t('tripForm.tooLong');
    return null;
  }

  /**
   * 既存の旅は**自動保存**。ボタンを押させない。
   *
   * 予定の詳細シートは以前から即時反映なので、旅の設定だけ「保存」を
   * 押させるのは不揃いだった。**押し忘れると直したつもりで直っていない。**
   *
   * 通らない値のときは書かずにエラーだけ出す(名前を空にした瞬間に
   * 旅の名前が消える、というようなことをしない)。
   */
  function autosave(next: { title?: string; startDate?: PlainDate; endDate?: PlainDate }) {
    if (!trip) return;
    const name = next.title ?? title;
    const from = next.startDate ?? startDate;
    const to = next.endDate ?? endDate;

    const problem = validate(name, from, to);
    setError(problem);
    if (problem) return;
    void updateTrip(trip.id, { title: name.trim(), startDate: from, endDate: to });
  }

  /** 新規作成だけボタンで確定する。まだ保存先が無いので自動保存にできない */
  async function submit() {
    const problem = validate(title, startDate, endDate);
    if (problem) return setError(problem);
    setBusy(true);
    const created = await createTrip({
      title: title.trim(),
      startDate,
      endDate,
      place,
    });
    onCreated?.(created.id);
  }

  const range = describeRange();

  /** 「2026年8月8日(土) 〜 8月11日(火)・3泊4日」。日付が壊れているときは出さない */
  function describeRange(): string | null {
    if (!isPlainDate(startDate) || !isPlainDate(endDate) || endDate < startDate) return null;
    const days = dayCount(startDate, endDate);
    if (days > MAX_DAYS) return null;
    const withYear = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' } as const;
    const sameYear = yearOf(startDate) === yearOf(endDate);
    return t('tripForm.range', {
      start: date(toDate(startDate), withYear),
      end: date(
        toDate(endDate),
        sameYear ? { month: 'long', day: 'numeric', weekday: 'short' } : withYear,
      ),
      length: days <= 1 ? t('tripList.dayTrip') : t('tripList.nights', { n: days - 1, m: days }),
    });
  }

  return (
    <Sheet title={trip ? t('tripForm.editTitle') : t('tripForm.newTitle')} onClose={onClose}>
      <div className="field">
        <label htmlFor="trip-name">{t('tripForm.name')}</label>
        <input
          id="trip-name"
          value={title}
          placeholder={t('tripForm.namePlaceholder')}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          // 1文字ごとに書かない。手が止まったところで1回
          onBlur={() => autosave({ title })}
          autoFocus={trip === undefined}
        />
      </div>

      {/*
        出発と帰りは1つのカレンダーで続けて選ぶ。
        既存の旅の自動保存は**帰る日まで決まってから**。出発日を押した瞬間に
        書くと、いったん日帰りの旅として保存されてしまう
      */}
      <div className="field">
        <label>{t('tripForm.dates')}</label>
        <DateRangePicker
          start={startDate}
          end={endDate}
          maxDays={MAX_DAYS}
          onChange={(from, to, complete) => {
            setStartDate(from);
            setEndDate(to);
            setError(null);
            if (complete) autosave({ startDate: from, endDate: to });
          }}
        />
      </div>

      {/*
        決めた日付を**年つきの言葉で**返す。
        日付欄は OS の表記なので月日しか目に入らず、来年の旅を今年で作ってしまう。
        泊数も一緒に出す ── 数え間違いはここで気づけたほうがいい。
        年が変わる旅(年末年始)は、終わりの日にも年を出す。
      */}
      {range !== null && <p className="guess">{range}</p>}

      {/*
        アルバムは**作るときには出さない。**まだ存在しないものを聞かれても困る。
        旅の設定を開いたとき ── つまり旅が始まっているか、終わったあとにだけ。
        日付の確認行より下に置くのは、その行が上の日付欄の説明だから。
      */}
      {/*
        旅先(天気予報用)。つくるときから決められる。**決めるのは無料**で、
        予報を見るのが Pro(Day の WeatherBar が無料の人に案内を出す)
      */}
      {trip ? (
        <PlaceField
          value={trip.place}
          label={trip.placeChanges?.length ? t('weather.placeFromDay1') : undefined}
          onChange={(next) => void updateTrip(trip.id, withPlaceFrom(trip, 0, next))}
        />
      ) : (
        <PlaceField value={place} onChange={setPlace} />
      )}

      {/*
        途中で変わる天気の場所。**切り替えるのは Day の天気の行から**(その日の予報を
        見ながら決めるほうが迷わない)。ここでは一覧と取り消しだけ
      */}
      {trip && (trip.placeChanges?.length ?? 0) > 0 && (
        <div className="field">
          <label>{t('weather.changes')}</label>
          {[...(trip.placeChanges ?? [])]
            .sort((a, b) => a.fromDay - b.fromDay)
            .map((c) => (
              <div className="linkrow" key={c.fromDay}>
                <span className="lbl">{t('weather.fromDay', { n: c.fromDay + 1 })}</span>
                <span className="url">📍 {c.place.name}</span>
                <button
                  type="button"
                  className="linklike"
                  onClick={() => void updateTrip(trip.id, withPlaceFrom(trip, c.fromDay, undefined))}
                >
                  {t('weather.stopChange')}
                </button>
              </div>
            ))}
        </div>
      )}

      {trip && (
        <div className="field">
          <label>{t('tripForm.album')}</label>
          <p className="guess">{t('tripForm.albumHint')}</p>
          <LinkList
            links={trip.links ?? []}
            placeholder={t('tripForm.albumPlaceholder')}
            onAdd={(link) => void addTripLink(trip.id, link)}
            onRemove={(url) => void removeTripLink(trip.id, url)}
          />
        </div>
      )}

      {error && <p className="err">{error}</p>}

      {/* 既存の旅は自動保存なので、押させるボタンは出さない */}
      {!trip && (
        <button type="button" className="btn wide" onClick={submit} disabled={busy}>
          {t('tripForm.create')}
        </button>
      )}

      {/*
        削除。**確認を挟む。**中の予定ごと消えるうえ、戻す導線が無い。
        OS の confirm ダイアログではなくシートの中で聞く ── 何が消えるのかを
        旅の名前つきで書けるし、文面をこちらで決められる。
      */}
      {trip &&
        (confirmingDelete ? (
          <>
            <p className="err">{t('tripForm.deleteConfirm', { title: trip.title })}</p>
            <div className="row">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setConfirmingDelete(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  setBusy(true);
                  void deleteTrip(trip.id).then(() => (onDeleted ?? onClose)());
                }}
                disabled={busy}
              >
                {t('common.delete')}
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="btn danger wide"
            onClick={() => setConfirmingDelete(true)}
          >
            {t('tripForm.deleteTrip')}
          </button>
        ))}
    </Sheet>
  );
}
