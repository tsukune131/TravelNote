import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/context';
import { closeDevInterstitial, useDevAds } from '../ads/ads';

/**
 * **開発中だけ**の広告の見本(ブラウザには AdMob が無い)。
 * 帯の高さと全画面の出るタイミングを、実機に載せる前に目で確かめるためのもの。
 * App.tsx で `import.meta.env.DEV` の分岐の中に置くので、本番には入らない。
 */
export function DevAdLayer() {
  const { t } = useI18n();
  const ads = useDevAds();
  const [left, setLeft] = useState(5);

  useEffect(() => {
    if (!ads.interstitial) return;
    setLeft(5);
    const id = window.setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearInterval(id);
  }, [ads.interstitial]);

  return (
    <>
      {ads.banner && (
        <div className="dev-ad-banner" aria-hidden="true">
          {t('ads.devBanner')}
        </div>
      )}
      {ads.interstitial && (
        <div className="dev-ad-full" role="dialog" aria-label={t('ads.devInterstitial')}>
          <span>{t('ads.devInterstitial')}</span>
          <button type="button" className="btn" disabled={left > 0} onClick={closeDevInterstitial}>
            {left > 0 ? `${left}` : t('ads.skip')}
          </button>
        </div>
      )}
    </>
  );
}
