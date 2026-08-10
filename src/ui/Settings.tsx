import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { getDisplayName, getMapProvider, setMapProvider } from '../db/settings';
import { setMyDisplayName } from '../db/repo';
import { openSubscriptionSettings, restore } from '../pro/purchases';
import { setProStatus, useProStatus } from '../pro/store';
import { isProActive } from '../pro/entitlement';
import { LEGAL_BASE, openLink } from '../lib/openExternal';
import type { MapProvider } from '../lib/maps';


export function Settings({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [provider, setProvider] = useState<MapProvider | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const pro = useProStatus();

  useEffect(() => {
    void (async () => {
      setProvider(await getMapProvider());
      setName(await getDisplayName());
    })();
  }, []);

  return (
    <Sheet title={t('settings.title')} onClose={onClose}>
      <div className="field">
        <label htmlFor="set-name">{t('settings.displayName')}</label>
        <input
          id="set-name"
          value={name}
          placeholder={t('share.displayNameDefault')}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void setMyDisplayName(name)}
        />
      </div>

      <MapProviderField
        value={provider}
        onChange={(next) => {
          setProvider(next);
          void setMapProvider(next);
        }}
      />

      <div>
        <button
          type="button"
          className="menu-item"
          onClick={() => void openLink(`${LEGAL_BASE}/privacy.html`)}
        >
          {t('settings.privacy')}
          <span className="sub">›</span>
        </button>
        <button
          type="button"
          className="menu-item"
          onClick={() => void openLink(`${LEGAL_BASE}/terms.html`)}
        >
          {t('settings.terms')}
          <span className="sub">›</span>
        </button>
        {/*
          3.1.2 は「購入を復元」を求める。**購入画面と設定の2か所に置き、
          購入したあとも消さない**(機種変更や再インストールのあとに要る)。
          解約はアプリ内に作らず Apple の画面へ渡す ── こちらで
          止められるものではないし、途中まで作ると誤解を生む。
        */}
        <button type="button" className="menu-item" onClick={() => void doRestore()}>
          {t('settings.restore')}
          <span className="sub">›</span>
        </button>
        {isProActive(pro, Date.now()) && (
          <button
            type="button"
            className="menu-item"
            onClick={() => void openSubscriptionSettings()}
          >
            {t('settings.manageSubscription')}
            <span className="sub">›</span>
          </button>
        )}
        <div className="menu-item">
          {t('settings.version')}
          <span className="sub">{__APP_VERSION__}</span>
        </div>
      </div>

      {note && <p className="guess">{note}</p>}
    </Sheet>
  );

  async function doRestore() {
    try {
      const status = await restore();
      setProStatus(status);
      setNote(isProActive(status, Date.now()) ? t('pro.restored') : t('pro.nothingToRestore'));
    } catch {
      setNote(t('pro.nothingToRestore'));
    }
  }
}

/**
 * 地図アプリの既定。**どちらかに決めず、使う人に選ばせる**
 * (日本では Google 派が多いが Apple 派も一定数いる。docs/ux-design.md §5.1)
 */
export function MapProviderField({
  value,
  onChange,
}: {
  value: MapProvider | null;
  onChange: (next: MapProvider) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="field">
      <label>{t('settings.mapProvider')}</label>
      <div className="row">
        {(['google', 'apple'] as const).map((p) => (
          <button
            key={p}
            type="button"
            className="catbtn"
            aria-pressed={value === p}
            onClick={() => onChange(p)}
          >
            {p === 'google' ? '🗺' : '🧭'} {t(p === 'google' ? 'map.google' : 'map.apple')}
          </button>
        ))}
      </div>
      <p className="guess">{t('map.chooseProviderHint')}</p>
    </div>
  );
}

/** 初回の地図タップで一度だけ聞く */
export function MapProviderPrompt({
  onPick,
  onClose,
}: {
  onPick: (provider: MapProvider) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Sheet title={t('map.chooseProvider')} onClose={onClose}>
      <MapProviderField value={null} onChange={onPick} />
    </Sheet>
  );
}
