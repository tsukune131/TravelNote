import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { I18nProvider } from './i18n/react';
import { TripList } from './ui/TripList';
import { TripScreen } from './ui/TripScreen';
import { Welcome } from './ui/Welcome';
import { findLandingPoint, listTrips, syncOwnerPro } from './db/repo';
import { FLAGS, getFlag, getTheme, setFlag } from './db/settings';
import { applyTheme } from './lib/theme';
import { drainSharedInbox } from './share/inbox';
import { syncProStatus, useProStatus } from './pro/store';
import { showsAds } from './pro/entitlement';
import { maybeShowInterstitial, noteAdAction, startAds, stopAds } from './ads/ads';
import { DevAdLayer } from './ui/DevAds';
import { App as CapApp } from '@capacitor/app';
import { today } from './lib/plainDate';
import { startCloudSync } from './cloud/sync';

type Route =
  | { screen: 'welcome' }
  | { screen: 'list' }
  | { screen: 'trip'; tripId: string; dayIndex: number };

export default function App({ onReady }: { onReady?: () => void }) {
  return (
    <I18nProvider>
      <Shell onReady={onReady} />
    </I18nProvider>
  );
}

/**
 * `useI18n` を使うため、Provider の内側に一段挟む。
 * 受け取ったしおりの取り込みは**アプリのどこにいても起きうる**ので、ここで面倒を見る。
 */
function Shell({ onReady }: { onReady?: () => void }) {
  const [route, setRoute] = useState<Route | null>(null);
  const pro = useProStatus();
  const adsOn = showsAds(pro, Date.now());

  /**
   * 旅行中の旅があるか。**あるあいだは全画面広告を出さない**(src/ads/policy.ts)。
   * 旅の画面を出たり入ったりするのは、旅行中なら「次の予定を確かめる」ため。
   */
  const traveling = useLiveQuery(async () => {
    const now = today();
    return (await listTrips()).some((t) => t.startDate <= now && now <= t.endDate);
  }, []);

  /**
   * 起動時の着地点。
   * **進行中の旅があれば、一覧を経由せずその旅の「今日」を直接開く。**
   * 旅行中に「一覧 → 旅を選ぶ → 今日を探す」を毎回やらせない
   * (docs/ux-design.md §2.2)。
   *
   * ようこそ画面はその手前。初回だけで、旅が1つでもあれば二度と出さない。
   */
  /**
   * iCloud の同期(ROADMAP E-2)。**ほかのどの書き込みよりも先に始める** ──
   * 変更を拾う hook がここで付くので、これより前の書き込みは送られない。
   */
  useEffect(() => {
    void startCloudSync();
  }, []);

  useEffect(() => {
    void (async () => {
      // 色はスプラッシュが閉じる前に。桜色が一瞬見えてから替わるのを避ける
      applyTheme(await getTheme());
      const landing = await findLandingPoint(today());
      if (landing) {
        setRoute({ screen: 'trip', tripId: landing.tripId, dayIndex: landing.dayIndex });
      } else {
        setRoute((await getFlag(FLAGS.onboarded)) ? { screen: 'list' } : { screen: 'welcome' });
      }
      // 行き先が決まった = 見せられる状態。ここでスプラッシュを閉じる
      onReady?.();
    })();
  }, [onReady]);

  /**
   * 共有シートから届いたものを拾う。
   *
   * **iOS は「いま共有された」を教えてくれない。** 拡張は別プロセスで走り、
   * App Group に書いて終わる。だから拾えるのは**起動したとき**と
   * **前面に戻ったとき**の2つだけ(src/share/inbox.ts)。
   */
  useEffect(() => {
    void drainSharedInbox();
    // 購入状態も同じ機会に取り直す。別の端末で買った・解約した、が反映される
    void syncProStatus();
    const handle = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      void drainSharedInbox();
      void syncProStatus();
    });
    return () => void handle.then((h) => h.remove());
  }, []);

  /**
   * 契約が変わったら:
   * - 自分が作った旅の「作成者は Pro」を合わせる(参加者に Pro の機能を届ける)
   * - 広告を出す/やめる。**ようこそ画面のうちは始めない** ──
   *   何のアプリか分かる前に ATT(トラッキング許可)を聞かない
   */
  const ready = route !== null && route.screen !== 'welcome';
  useEffect(() => {
    void syncOwnerPro(pro);
  }, [pro]);
  useEffect(() => {
    if (!ready) return;
    void (adsOn ? startAds() : stopAds());
  }, [ready, adsOn]);

  /** 旅一覧 ⇄ 旅の画面は「区切り」。全画面広告を出してよい唯一の場所 */
  function navigate(next: Route) {
    if (route?.screen !== next.screen) {
      maybeShowInterstitial({ onTripInProgress: traveling !== false });
    }
    setRoute(next);
  }

  // 着地点が決まるまでは何も描かない(旅一覧が一瞬見えてから飛ぶのを避ける)
  if (route === null) return <div className="screen" />;

  return (
    <>
      {route.screen === 'welcome' ? (
        <Welcome
          onStart={() => {
            void setFlag(FLAGS.onboarded);
            setRoute({ screen: 'list' });
          }}
        />
      ) : route.screen === 'list' ? (
        <TripList onOpen={(tripId, dayIndex) => navigate({ screen: 'trip', tripId, dayIndex })} />
      ) : (
        <TripScreen
          tripId={route.tripId}
          dayIndex={route.dayIndex}
          onChangeDay={(dayIndex) => {
            noteAdAction();
            setRoute({ ...route, dayIndex });
          }}
          onBack={() => navigate({ screen: 'list' })}
        />
      )}


      {import.meta.env.DEV && <DevAdLayer />}
    </>
  );
}
