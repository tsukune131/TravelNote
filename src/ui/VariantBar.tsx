import { useI18n } from '../i18n/context';
import { adoptVariant, showVariant } from '../db/repo';
import type { DayVariant } from '../db/types';

/**
 * その日が「2つの案」に分かれているときだけ出る帯。
 *
 * 同じ日を二人が直していた、という状況(docs/ux-design.md §6.3)。
 * **どちらも捨てない。** 見比べて、選んだほうを本線に戻す。
 */
export function VariantBar({
  variants,
  tripId,
  dayIndex,
}: {
  variants: DayVariant[];
  tripId: string;
  dayIndex: number;
}) {
  const { t } = useI18n();
  if (variants.length < 2) return null;

  const active = variants.find((v) => v.active) ?? variants[0];

  return (
    <div className="variantbar" role="group" aria-label={t('variant.banner')}>
      <div className="variantbar-head">⚖️ {t('variant.banner')}</div>
      <div className="variantbar-tabs">
        {variants.map((v) => (
          <button
            key={v.id}
            type="button"
            className="catbtn"
            aria-pressed={v.id === active.id}
            onClick={() => void showVariant(tripId, dayIndex, v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn wide"
        onClick={() => void adoptVariant(tripId, dayIndex, active.id)}
      >
        {t('variant.adopt')}
      </button>
    </div>
  );
}
