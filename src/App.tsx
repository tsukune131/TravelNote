import { useEffect, useState } from 'react';
import { I18nProvider } from './i18n/react';
import { useI18n } from './i18n/context';
import { TripList } from './ui/TripList';
import { TripScreen } from './ui/TripScreen';
import { Welcome } from './ui/Welcome';
import { ImportResult } from './ui/ImportResult';
import type { ImportOutcome } from './ui/ShareSheet';
import { findLandingPoint } from './db/repo';
import { FLAGS, getDisplayName, getFlag, setFlag } from './db/settings';
import { importSnapshotText } from './share/apply';
import { listenForIncomingFile } from './share/transport';
import { today } from './lib/plainDate';

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
  const { t } = useI18n();
  const [route, setRoute] = useState<Route | null>(null);
  const [imported, setImported] = useState<ImportOutcome | null>(null);

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

  /**
   * 共有されたファイルをタップしてアプリが開かれたときの受け口。
   *
   * **これが無いと、受け取り側は何も起きない。** iOS では
   * `.tabishiori` を開くとアプリが起動し、ここに中身が届く
   * (書類タイプの宣言は ios/App/App/Info.plist)。
   * ⚠️ この経路は**実機でしか確かめられない**(ROADMAP C-5)。
   */
  useEffect(() => {
    return listenForIncomingFile((text) => {
      void (async () => {
        try {
          const name = (await getDisplayName()) || t('variant.mine');
          const r = await importSnapshotText(text, name);
          setRoute({ screen: 'trip', tripId: r.tripId, dayIndex: 0 });
          setImported(
            r.summary.conflicted > 0 || r.summary.updated > 0 || r.summary.removed > 0
              ? { kind: 'ok', summary: r.summary, conflictedDays: r.conflictedDays, tripId: r.tripId }
              : { kind: 'new', count: r.summary.added, tripId: r.tripId },
          );
        } catch (err) {
          setImported({ kind: 'failed', message: err instanceof Error ? err.message : '' });
        }
      })();
    });
  }, [t]);

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
        <TripList onOpen={(tripId, dayIndex) => setRoute({ screen: 'trip', tripId, dayIndex })} />
      ) : (
        <TripScreen
          tripId={route.tripId}
          dayIndex={route.dayIndex}
          onChangeDay={(dayIndex) => setRoute({ ...route, dayIndex })}
          onBack={() => setRoute({ screen: 'list' })}
        />
      )}

      {imported && <ImportResult outcome={imported} onClose={() => setImported(null)} />}
    </>
  );
}
