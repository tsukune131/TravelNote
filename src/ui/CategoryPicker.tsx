import { useI18n } from '../i18n/context';
import { categoryLabelKey } from '../i18n/keys';
import { CATEGORIES, CATEGORY_IDS } from '../lib/category';
import type { CategoryId } from '../lib/category';

export function CategoryPicker({
  value,
  onChange,
}: {
  value: CategoryId;
  onChange: (next: CategoryId) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="field">
      <label>{t('event.category')}</label>
      <div className="catgrid">
        {CATEGORY_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="catbtn"
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            <span
              className={`pin ${CATEGORIES[id].family}`}
              style={{ width: '1.25rem', height: '1.25rem', fontSize: '0.75rem' }}
              aria-hidden="true"
            >
              {CATEGORIES[id].emoji}
            </span>
            {t(categoryLabelKey(id))}
          </button>
        ))}
      </div>
    </div>
  );
}
