import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { LEGAL_BASE, openLink } from '../lib/openExternal';
import { REFERENCE_PRICE_JPY } from '../pro/entitlement';


/**
 * 唯一の課金点 ── **自分の旅をはじめて送ろうとしたとき**だけ出る。
 * タイムラインにも詳細シートにも地図にも、課金導線は置かない。
 *
 * 売り文句の主は「同行者と一緒に作れる」ではなく
 * **「相手は登録も支払いも要らない」** ── そこがこの価格設計の強み。
 *
 * ⚠️ 課金の配線はフェーズD(D-0)。いまは判定を通すだけで実際には止めない。
 *    3.1.2 が要求する表示(名称・期間・価格・規約とポリシー・購入を復元)は
 *    先に置いてあるが、**価格は StoreKit から取った値に差し替える**こと
 *    ── ここの数字をそのまま出すと「価格の明示」が嘘になる。
 */
export function Paywall({ onClose, onProceed }: { onClose: () => void; onProceed: () => void }) {
  const { t, currency } = useI18n();

  return (
    <Sheet title={t('pro.title')} onClose={onClose}>
      <p className="paywall-lead">{t('pro.lead')}</p>

      <div className="field">
        <label>{t('pro.freeTitle')}</label>
        <ul className="welcome-points">
          <li>{t('pro.free1')}</li>
          <li>{t('pro.free2')}</li>
        </ul>
      </div>

      <div className="field">
        <label>{t('pro.proTitle')}</label>
        <ul className="welcome-points">
          <li>{t('pro.pro1')}</li>
          <li>{t('pro.pro2')}</li>
        </ul>
      </div>

      {/* 3.1.2: 名称・期間・価格をアプリ内に出す */}
      <div className="row">
        {(['monthly', 'yearly'] as const).map((plan) => (
          <div key={plan} className="plan">
            <b>{t(plan === 'monthly' ? 'pro.monthly' : 'pro.yearly')}</b>
            <span>{currency(REFERENCE_PRICE_JPY[plan])}</span>
          </div>
        ))}
      </div>

      <p className="guess">⚠️ {t('pro.notReady')}</p>

      <button type="button" className="btn wide" onClick={onProceed}>
        {t('pro.proceed')}
      </button>

      {/* 3.1.2: 規約とポリシーへの機能するリンク、購入を復元 */}
      <div>
        <button type="button" className="menu-item" onClick={() => void openLink(`${LEGAL_BASE}/terms.html`)}>
          {t('pro.terms')}
          <span className="sub">›</span>
        </button>
        <button type="button" className="menu-item" onClick={() => void openLink(`${LEGAL_BASE}/privacy.html`)}>
          {t('pro.privacy')}
          <span className="sub">›</span>
        </button>
        <button type="button" className="menu-item" disabled>
          {t('pro.restore')}
          <span className="sub">{t('pro.notReady')}</span>
        </button>
      </div>
    </Sheet>
  );
}
