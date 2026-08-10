import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { LEGAL_BASE, openLink } from '../lib/openExternal';
import { loadPrices, purchase, restore } from '../pro/purchases';
import type { PlanPrice } from '../pro/purchases';
import { setProStatus } from '../pro/store';
import { isProActive, PRICE_TEXT_JPY } from '../pro/entitlement';
import type { PlanId } from '../pro/entitlement';

/**
 * 文言中の `**…**` を太字にする。
 *
 * ⚠️ **文言をそのまま `{t(...)}` に流すと、アスタリスクが画面に出る。**
 * 実際に `**送るときだけ** Pro が要ります。` と表示されたまま
 * TestFlight まで行った(審査で最初に見られる画面なのに)。
 *
 * 使っているのは `pro.lead` だけ。訳す人が文を分断されずに済むよう、
 * キーを割らずにここで処理する。**他のキーで `**` を使うならここを通すこと。**
 */
function emphasize(text: string) {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

/**
 * ボタンに出す価格。**円で返ってきたときだけ StoreKit を信じる。**
 * 円以外は日本の定価に差し替える(理由は下の Paywall のコメント)。
 */
function priceOf(price: PlanPrice): string {
  return price.currencyCode === 'JPY' ? price.priceString : PRICE_TEXT_JPY[price.plan];
}

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
 * 取れていないうちは**押せなくする** ── 価格の無い購入ボタンは審査で弾かれる。
 *
 * ## 価格の出し方(`priceOf`)
 *
 * **StoreKit が円で返したときだけ、その文字列を出す。** 円以外なら
 * `PRICE_TEXT_JPY`(日本の定価)を出す。
 *
 * 本アプリは**日本のみ配信**なので、本番で円以外が返る経路が無い ──
 * つまり実利用では常に StoreKit の値が出て、価格改定にも自動で追従する。
 * 円以外が来るのは **Sandbox のストアフロントが米国に落ちるとき**だけで、
 * これは端末側からは直せなかった(サンドボックステスターを日本にしても
 * ドルのまま。審査用スクリーンショットが撮れず、この分岐を入れた)。
 *
 * ⚠️ **買える／買えないの判定は、価格の表示と分ける。** 定価が出せるからと
 * ボタンを押せるようにしない ── StoreKit が製品を返せていないなら、
 * 押しても購入は始まらない。`disabled` は今までどおり `price` の有無で見る。
 */
export function Paywall({
  onClose,
  onProceed,
  expiredTrip = false,
}: {
  onClose: () => void;
  onProceed: () => void;
  /** 一度共有できていた旅が1年を過ぎた場合。理由を説明しないと不意打ちになる */
  expiredTrip?: boolean;
}) {
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
      <p className="paywall-lead">{emphasize(t(expiredTrip ? 'pro.leadExpired' : 'pro.lead'))}</p>

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

      {/* 3.1.2: 名称・期間・価格 */}
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
              <span>{price ? priceOf(price) : '…'}</span>
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
