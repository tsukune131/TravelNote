import { useI18n } from '../i18n/context';
import { LEGAL_BASE, openLink } from '../lib/openExternal';

/**
 * 初回だけ出す1枚。
 *
 * **3枚のカルーセルにしない。** 読まれないし、このアプリの非自明な価値
 * (時刻を決めなくていい・長押しでずらせる)は、その場面が来たときに
 * 教えるほうが効く(空状態のチップと長押しヒント)。
 *
 * ここで言うのは「何のアプリか」と「何を要求されないか」だけ。
 * 登録も支払いも要らないことが、最初の一歩の障壁をいちばん下げる。
 */
export function Welcome({ onStart }: { onStart: () => void }) {
  const { t } = useI18n();

  return (
    <div className="screen welcome">
      <div className="scroller">
        <div className="welcome-body">
          <h1>{t('app.name')}</h1>
          <p className="welcome-tagline">{t('welcome.tagline')}</p>
          <ul className="welcome-points">
            <li>{t('welcome.point1')}</li>
            <li>{t('welcome.point2')}</li>
            <li>{t('welcome.point3')}</li>
          </ul>
          {/* 「端末の中だけ」と言った直後に、その根拠へ行けるようにする */}
          <button
            type="button"
            className="linklike"
            onClick={() => void openLink(`${LEGAL_BASE}/privacy.html`)}
          >
            {t('settings.privacy')}
          </button>
        </div>
      </div>
      <div className="addbar">
        <button type="button" className="btn wide" onClick={onStart}>
          {t('welcome.start')}
        </button>
      </div>
    </div>
  );
}
