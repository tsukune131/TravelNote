import { useEffect, useState } from 'react';
import { I18nProvider } from './i18n/react';
import { TripList } from './ui/TripList';
import { TripScreen } from './ui/TripScreen';
import { Welcome } from './ui/Welcome';
import { findLandingPoint } from './db/repo';
import { FLAGS, getFlag, setFlag } from './db/settings';
import { today } from './lib/plainDate';

type Route =
  | { screen: 'welcome' }
  | { screen: 'list' }
  | { screen: 'trip'; tripId: string; dayIndex: number };

export default function App({ onReady }: { onReady?: () => void }) {
  const [route, setRoute] = useState<Route | null>(null);

  /**
   * 起動時の着地点。
   * **進行中の旅があれば、一覧を経由せずその旅の「今日」を直接開く。**
   * 旅行中に「一覧 → 旅を選ぶ → 今日を探す」を毎回やらせない
   * (docs/ux-design.md §2.2)。
   *
   * ようこそ画面はその手前。初回だけで、旅が1つでもあれば二度と出さない。
   */
  useEffect(() => {
    void (async () => {
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

  // 着地点が決まるまでは何も描かない(旅一覧が一瞬見えてから飛ぶのを避ける)
  if (route === null) return <I18nProvider><div className="screen" /></I18nProvider>;

  return (
    <I18nProvider>
      {route.screen === 'welcome' ? (
        <Welcome
          onStart={() => {
            void setFlag(FLAGS.onboarded);
            setRoute({ screen: 'list' });
          }}
        />
      ) : route.screen === 'list' ? (
        <TripList
          onOpen={(tripId, dayIndex) => setRoute({ screen: 'trip', tripId, dayIndex })}
        />
      ) : (
        <TripScreen
          tripId={route.tripId}
          dayIndex={route.dayIndex}
          onChangeDay={(dayIndex) => setRoute({ ...route, dayIndex })}
          onBack={() => setRoute({ screen: 'list' })}
        />
      )}
    </I18nProvider>
  );
}
