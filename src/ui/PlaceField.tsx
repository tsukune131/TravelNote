import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { searchPlace, toPlace } from '../weather/weather';
import type { PlaceCandidate } from '../weather/weather';
import type { TripPlace } from '../db/types';

/**
 * 旅先(天気予報を出す場所)。旅をつくるときと、旅の設定の中。
 *
 * 地名で探して、候補から1つ選ぶ。座標を手で入れさせない。
 * 探すのは Apple の地名検索なので、**入れた名前は Apple に送られる**
 * (プライバシーポリシーに書く。ROADMAP E-8)。
 *
 * 保存先は呼び出し側が決める(つくるときは手元に持って作成時に、
 * 設定では即時に書く)。
 *
 * 旅先は無料で決められる。予報を見るのが Pro(WeatherBar)。
 *
 * Day ごとの切り替え(DayPlaceSheet)でも使う。そのときは見出し・説明・
 * 外すボタンの文言を差し替える(`clearLabel` が null なら外すボタンを出さない)。
 */
export function PlaceField({
  value,
  onChange,
  label,
  hint,
  note,
  clearLabel,
}: {
  value: TripPlace | undefined;
  onChange: (place: TripPlace | undefined) => void;
  label?: string;
  hint?: string;
  /** いまの場所の横に添える一言(「Day 1 から続いています」など) */
  note?: string;
  clearLabel?: string | null;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const q = query.trim();
    if (q.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const found = await searchPlace(q);
      setResults(found);
      if (found.length === 0) setError(t('weather.notFound'));
    } catch {
      setResults(null);
      setError(t('weather.notFound'));
    } finally {
      setBusy(false);
    }
  }

  function pick(candidate: PlaceCandidate) {
    onChange(toPlace(candidate));
    setResults(null);
    setQuery('');
  }

  return (
    <div className="field">
      <label htmlFor="trip-place">{label ?? t('weather.place')}</label>
      {value && (
        <div className="linkrow">
          <span className="lbl">📍</span>
          <span className="url">
            {value.name}
            {note && <small className="place-note"> {note}</small>}
          </span>
          {clearLabel !== null && (
            <button type="button" className="linklike" onClick={() => onChange(undefined)}>
              {clearLabel ?? t('weather.clear')}
            </button>
          )}
        </div>
      )}
      <div className="row">
        <input
          id="trip-place"
          value={query}
          placeholder={t('weather.placePlaceholder')}
          enterKeyHint="search"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void search();
          }}
        />
        <button type="button" className="btn" disabled={busy || query.trim().length === 0} onClick={() => void search()}>
          {t('weather.search')}
        </button>
      </div>
      {results?.map((p) => (
        <button key={`${p.lat},${p.lng}`} type="button" className="menu-item" onClick={() => pick(p)}>
          📍
          {/* 2行目に国と州。「トロント」がカナダかアメリカかを選ぶ前に見分けられるように */}
          <span className="link-choice">
            <b>{p.name}</b>
            {p.detail && <small>{p.detail}</small>}
          </span>
          <span className="sub">›</span>
        </button>
      ))}
      {error && <p className="err">{error}</p>}
      <p className="guess">{hint ?? t('weather.placeHint')}</p>
    </div>
  );
}
