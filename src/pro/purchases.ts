import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { getSetting, setSetting } from '../db/db';
import { FREE, PRODUCT_IDS } from './entitlement';
import type { PlanId, ProStatus } from './entitlement';

/**
 * StoreKit との配線。
 *
 * **RevenueCat のような課金SDKは使わない。** 購入情報が第三者のサーバーを
 * 経由した時点で、プライバシーラベル「データを収集していません」が崩れる
 * (docs/pricing.md §7)。StoreKit 2 を直接叩く。
 *
 * 判定そのものは `entitlement.ts` の純粋関数。ここは**外の世界とのやりとり**だけ。
 */

const PRO_CACHE_KEY = 'proActive';

/** 端末で購入できるか。web で動かしているときは常に false */
async function available(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { isBillingSupported } = await NativePurchases.isBillingSupported();
    return isBillingSupported;
  } catch {
    return false;
  }
}

/**
 * いま Pro か。
 *
 * `onlyCurrentEntitlements: true` を必ず付ける ── **いま有効なものだけ**が返り、
 * 期限切れも、別の Apple ID の購入も混ざらない(中古端末や共用端末での取り違え防止)。
 * 期限は StoreKit 側で見てくれるので、こちらで持たない。
 *
 * ⚠️ **聞けなかったときに false へ倒さない。** 圏外・機内モードは旅先の日常で、
 * そこで購入者の機能を取り上げるのが最悪の体験。最後に分かった状態を返す。
 */
export async function refreshProStatus(): Promise<ProStatus> {
  if (!(await available())) return cachedStatus();

  try {
    const { purchases } = await NativePurchases.getPurchases({
      productType: PURCHASE_TYPE.SUBS,
      onlyCurrentEntitlements: true,
    });
    const ids = Object.values(PRODUCT_IDS);
    const active = purchases.some((p) => ids.includes(p.productIdentifier));
    await setSetting(PRO_CACHE_KEY, active ? '1' : '0');
    return { active };
  } catch {
    return cachedStatus();
  }
}

/** 最後に分かった状態。確認できないときはこれを使う */
export async function cachedStatus(): Promise<ProStatus> {
  return (await getSetting(PRO_CACHE_KEY)) === '1' ? { active: true } : FREE;
}

export type PlanPrice = {
  plan: PlanId;
  /** StoreKit が整形した文字列(「¥300」)。**自前で組み立てない** */
  priceString: string;
};

/**
 * 価格を取りに行く。
 *
 * **表示する価格は必ずここで取った文字列を使う。** ハードコードした数字を出すと、
 * 地域や価格改定でずれて「価格の明示」(3.1.2)が嘘になる。
 * 取れなかったときは空を返し、UI 側は**購入ボタンを押せなくする**。
 */
export async function loadPrices(): Promise<PlanPrice[]> {
  if (!(await available())) return [];
  try {
    // getProduct を Promise.all で並べない(プラグインの注意書き。競合して壊れる)
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: Object.values(PRODUCT_IDS),
      productType: PURCHASE_TYPE.SUBS,
    });
    return (Object.keys(PRODUCT_IDS) as PlanId[])
      .map((plan) => {
        const found = products.find((p) => p.identifier === PRODUCT_IDS[plan]);
        return found ? { plan, priceString: found.priceString } : null;
      })
      .filter((p): p is PlanPrice => p !== null);
  } catch {
    return [];
  }
}

/** 買う。成功しても失敗しても、最後に StoreKit へ聞き直して状態を決める */
export async function purchase(plan: PlanId): Promise<ProStatus> {
  await NativePurchases.purchaseProduct({
    productIdentifier: PRODUCT_IDS[plan],
    productType: PURCHASE_TYPE.SUBS,
  });
  return refreshProStatus();
}

/**
 * 購入を復元する(3.1.2 の必須ボタン)。
 * 機種変更や再インストールのあと、これで戻る。
 */
export async function restore(): Promise<ProStatus> {
  await NativePurchases.restorePurchases();
  return refreshProStatus();
}

/** 解約や支払い方法の変更は Apple の画面でやってもらう。アプリ内に作らない */
export async function openSubscriptionSettings(): Promise<void> {
  await NativePurchases.manageSubscriptions();
}
