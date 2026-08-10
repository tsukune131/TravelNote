import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { getDisplayName, getMapProvider, setMapProvider } from '../db/settings';
import { setMyDisplayName } from '../db/repo';
import { LEGAL_BASE, openLink } from '../lib/openExternal';
import type { MapProvider } from '../lib/maps';


export function Settings({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [provider, setProvider] = useState<MapProvider | null>(null);
  const [name, setName] = useState('');

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
        <div className="menu-item">
          {t('settings.version')}
          <span className="sub">{__APP_VERSION__}</span>
        </div>
      </div>
    </Sheet>
  );
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
