import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { LEGAL_BASE, openLink } from '../lib/openExternal';
import { loadPrices, purchase, restore } from '../pro/purchases';
import type { PlanPrice } from '../pro/purchases';
import { setProStatus } from '../pro/store';
import { isProActive } from '../pro/entitlement';
import type { PlanId } from '../pro/entitlement';

/**
 * 唯一の課金点 ── **自分の旅をはじめて送ろうとしたとき**だけ出る。
 * タイムラインにも詳細シートにも地図にも、課金導線は置かない。
 *
 * 売り文句の主は「同行者と一緒に作れる」ではなく
 * **「相手は登録も支払いも要らない」** ── そこがこの価格設計の強み。
 *
 * ## 3.1.2 が要求するもの(外すと差し戻される)
 *
 * 名称・期間・**価格**・利用規約とプライバシーポリシーへの動くリンク・購入を復元。
 * **価格は StoreKit から取った文字列をそのまま出す。** 自前で組み立てると
 * 地域や価格改定でずれて「価格の明示」が嘘になる。
 * 取れていないうちは**押せなくする** ── 価格の無い購入ボタンは審査で弾かれる。
 */
export function Paywall({ onClose, onProceed }: { onClose: () => void; onProceed: () => void }) {
  const { t } = useI18n();
  const [prices, setPrices] = useState<PlanPrice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPrices().then(setPrices);
  }, []);

  /** 価格が1つも取れていないなら買わせない */
  const ready = prices !== null && prices.length > 0;

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

      {/* 3.1.2: 名称・期間・価格。価格は StoreKit の整形済み文字列 */}
      <div className="row">
        {(['monthly', 'yearly'] as const).map((plan) => {
          const price = prices?.find((p) => p.plan === plan);
          return (
            <button
              key={plan}
              type="button"
              className="plan"
              disabled={!price || busy}
              onClick={() => void buy(plan)}
            >
              <b>{t(plan === 'monthly' ? 'pro.monthly' : 'pro.yearly')}</b>
              <span>{price ? price.priceString : '…'}</span>
            </button>
          );
        })}
      </div>

      <p className="guess">{t('pro.renewNote')}</p>

      {prices !== null && !ready && <p className="err">{t('pro.unavailable')}</p>}
      {error && <p className="err">{error}</p>}

      {/*
        開発中だけの抜け道。**本番のビルドには入らない**(Vite が
        import.meta.env.DEV の分岐ごと落とす)。
        ブラウザでは StoreKit が無く、これが無いと共有の動作確認ができない。
      */}
      {import.meta.env.DEV && (
        <button type="button" className="btn ghost wide" onClick={onProceed}>
          [dev] {t('pro.proceed')}
        </button>
      )}

      {/* 3.1.2: 規約とポリシーへの機能するリンク、購入を復元 */}
      <div>
        <button
          type="button"
          className="menu-item"
          onClick={() => void openLink(`${LEGAL_BASE}/terms.html`)}
        >
          {t('pro.terms')}
          <span className="sub">›</span>
        </button>
        <button
          type="button"
          className="menu-item"
          onClick={() => void openLink(`${LEGAL_BASE}/privacy.html`)}
        >
          {t('pro.privacy')}
          <span className="sub">›</span>
        </button>
        <button type="button" className="menu-item" disabled={busy} onClick={() => void doRestore()}>
          {t('pro.restore')}
          <span className="sub">›</span>
        </button>
      </div>
    </Sheet>
  );

  async function buy(plan: PlanId) {
    setBusy(true);
    setError(null);
    try {
      const status = await purchase(plan);
      setProStatus(status);
      // 買えたら、そのまま元々やろうとしていたこと(送る)へ進む
      if (isProActive(status, Date.now())) onProceed();
    } catch {
      // 取り消しも失敗もここに来る。取り消しを「失敗」と言わない文言にしてある
      setError(t('pro.purchaseFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function doRestore() {
    setBusy(true);
    setError(null);
    try {
      const status = await restore();
      setProStatus(status);
      if (isProActive(status, Date.now())) onProceed();
      else setError(t('pro.nothingToRestore'));
    } catch {
      setError(t('pro.nothingToRestore'));
    } finally {
      setBusy(false);
    }
  }
}
