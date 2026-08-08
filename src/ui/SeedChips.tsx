import { useI18n } from '../i18n/context';
import type { MessageKey } from '../i18n';
import { addEvent } from '../db/repo';

/**
 * 空の Day に出す、タップで即追加できるチップ。
 *
 * 空状態に文章だけ置いても手は動かない。**1タップで骨組みが立つ**ようにする。
 * 名前はカテゴリ自動推定が当たる語を選んである
 * (出発→移動 / チェックイン→宿 / 朝食→レストラン / お土産→ショッピング)。
 * 推定が効くところを最初に見せる、という意図もある。
 */
type Seed = { key: MessageKey; emoji: string };

const FIRST_DAY: Seed[] = [
  { key: 'seed.depart', emoji: '🚉' },
  { key: 'seed.checkIn', emoji: '🛏' },
  { key: 'seed.dinner', emoji: '🍜' },
];

const LAST_DAY: Seed[] = [
  { key: 'seed.checkOut', emoji: '🛏' },
  { key: 'seed.souvenir', emoji: '🛍' },
  { key: 'seed.trainHome', emoji: '🚉' },
];

const MIDDLE_DAY: Seed[] = [
  { key: 'seed.breakfast', emoji: '🍽' },
  { key: 'seed.lunch', emoji: '🍜' },
  { key: 'seed.dinner', emoji: '🍶' },
];

export function SeedChips({
  tripId,
  dayIndex,
  isFirstDay,
  isLastDay,
}: {
  tripId: string;
  dayIndex: number;
  isFirstDay: boolean;
  isLastDay: boolean;
}) {
  const { t } = useI18n();
  // 1日だけの旅は「出発〜帰り」が同じ日に入るので、最終日の並びを優先する
  const seeds = isLastDay ? LAST_DAY : isFirstDay ? FIRST_DAY : MIDDLE_DAY;

  return (
    <div className="seed-row" aria-label={t('seed.label')}>
      {seeds.map((seed) => (
        <button
          key={seed.key}
          type="button"
          className="seed"
          onClick={() => void addEvent(tripId, dayIndex, t(seed.key))}
        >
          {seed.emoji} {t(seed.key)}
        </button>
      ))}
    </div>
  );
}
