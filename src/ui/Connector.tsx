import { useState } from 'react';
import { useI18n } from '../i18n/context';
import type { MessageKey } from '../i18n';
import { Sheet } from './Sheet';
import { setTravel } from '../db/repo';
import { connectorBetween } from '../lib/connector';
import { openDirections, openMap } from '../lib/openExternal';
import { canRouteExactly, mapLinkOf } from '../lib/maps';
import type { MapProvider, TravelMode } from '../lib/maps';
import type { TripEvent } from '../db/types';

const MODES: TravelMode[] = ['walk', 'bike', 'transit', 'drive', 'other'];
const MODE_EMOJI: Record<TravelMode, string> = {
  walk: '🚶',
  bike: '🚲',
  transit: '🚃',
  drive: '🚗',
  other: '🧭',
};
const PRESET_MINUTES = [5, 10, 15, 20, 30, 45, 60, 90];

function modeKey(mode: TravelMode): MessageKey {
  return `connector.${mode}` as MessageKey;
}

/**
 * 予定と予定の「あいだ」。
 *
 * ここが旅程アプリの価値の核。**次に間に合うか**と
 * **ここに何か入れられるか**を、計画している最中に見せる。
 */
export function Connector({
  prev,
  next,
  mapProvider,
}: {
  prev: TripEvent;
  next: TripEvent;
  mapProvider: MapProvider | null;
}) {
  const { t, duration } = useI18n();
  const [editing, setEditing] = useState(false);
  const c = connectorBetween(prev, next);

  return (
    <>
      <div className={`conn${c.tooTight ? ' warn' : ''}`}>
        <div />
        <div className="conn-rail" aria-hidden="true" />
        <button type="button" className="conn-txt" onClick={() => setEditing(true)}>
          {c.travel ? (
            <>
              <span>{MODE_EMOJI[c.travel.mode]}</span>{' '}
              <span>{t('connector.estimate', { duration: duration(c.travel.minutes) })}</span>
              {c.tooTight && <span className="warnmark"> ⚠️ {t('connector.tooTight')}</span>}
            </>
          ) : c.freeMinutes !== null ? (
            <span className="gap-box">⌛ {t('timeline.gap', { duration: duration(c.freeMinutes) })}</span>
          ) : (
            // まだ入れていない区間は静かに。同じ行が何本も並ぶと騒がしい
            <span className="conn-add">{t('connector.setTravel')}</span>
          )}
        </button>
      </div>

      {editing && (
        <TravelSheet
          prev={prev}
          next={next}
          mapProvider={mapProvider}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

function TravelSheet({
  prev,
  next,
  mapProvider,
  onClose,
}: {
  prev: TripEvent;
  next: TripEvent;
  mapProvider: MapProvider | null;
  onClose: () => void;
}) {
  const { t, duration } = useI18n();
  const c = connectorBetween(prev, next);
  const mode = prev.travelMode ?? 'transit';

  const from = { name: prev.name, lat: prev.lat, lng: prev.lng, url: mapLinkOf(prev.links) };
  const to = { name: next.name, lat: next.lat, lng: next.lng, url: mapLinkOf(next.links) };
  // 目的地にリンクがあるなら、名前で経路を引くより「そこを開く」ほうが確実
  const exact = canRouteExactly(from, to) || to.url === undefined;

  function openRouteOrPlace() {
    const provider = mapProvider ?? 'google';
    if (exact) openDirections(provider, from, to, mode);
    else openMap(provider, to);
  }

  return (
    <Sheet title={t('connector.title')} onClose={onClose}>
      <p className="guess">
        {prev.name} → {next.name}
      </p>

      {c.gapMinutes !== null ? (
        <p className={c.tooTight ? 'err' : 'guess'}>
          {t('connector.gapNote', { duration: duration(Math.max(0, c.gapMinutes)) })}
          {c.tooTight && ` ⚠️ ${t('connector.tooTight')}`}
        </p>
      ) : (
        <p className="guess">{t('connector.noGap')}</p>
      )}

      <div className="field">
        <label>{t('connector.mode')}</label>
        {/* 5つになったので横並びをやめる。390px に3つ以上は入らない */}
        <div className="catgrid">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              className="catbtn"
              aria-pressed={prev.travelMinutes !== null && mode === m}
              onClick={() => void setTravel(prev.id, prev.travelMinutes ?? 15, m)}
            >
              {MODE_EMOJI[m]} {t(modeKey(m))}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>{t('connector.minutes')}</label>
        <div className="catgrid">
          {PRESET_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              className="catbtn"
              aria-pressed={prev.travelMinutes === m}
              onClick={() => void setTravel(prev.id, m, mode)}
            >
              {duration(m)}
            </button>
          ))}
        </div>
      </div>

      {/*
        経路は**正確に引けるときだけ**引く。

        Googleマップアプリの「リンクをコピー」は短縮リンクで座標が入っておらず、
        解決には通信が要る(しない方針)。座標が取れないまま名前で経路を引くと、
        同名の別の場所へ案内してしまう ── 旅先ではこれがいちばん痛い。

        引けないときは**目的地そのものを開く。**貼られたリンクは場所を確実に
        指しているので、地図アプリ側で1タップすれば現在地からの経路が出る。
        旅行中はそもそも「いまいる場所から次へ」が知りたいことが多い。
      */}
      <button type="button" className="btn ghost wide" onClick={openRouteOrPlace}>
        🗺 {exact ? t('connector.route') : t('connector.openNext')}
      </button>

      {prev.travelMinutes !== null && (
        <button
          type="button"
          className="btn danger wide"
          onClick={() => {
            void setTravel(prev.id, null, null);
            onClose();
          }}
        >
          {t('connector.clear')}
        </button>
      )}
    </Sheet>
  );
}
