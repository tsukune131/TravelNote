import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import type { ImportOutcome } from './ShareSheet';

/**
 * 取り込んだ直後に「相手が何を変えたか」を見せる。
 *
 * **黙って入れない。** サーバーが無い方式では、相手の変更が自分の画面に
 * 反映されるのは取り込みの瞬間だけなので、そこで一度だけまとめて見せる
 * (docs/ux-design.md §6.4)。
 */
export function ImportResult({
  outcome,
  onClose,
}: {
  outcome: ImportOutcome;
  onClose: () => void;
}) {
  const { t } = useI18n();

  if (outcome.kind === 'failed') {
    return (
      <Sheet title={t('importResult.failed')} onClose={onClose}>
        <p className="err">{outcome.message}</p>
        <button type="button" className="btn wide" onClick={onClose}>
          {t('importResult.ok')}
        </button>
      </Sheet>
    );
  }

  if (outcome.kind === 'new') {
    return (
      <Sheet title={t('importResult.title')} onClose={onClose}>
        <p>{t('importResult.newTrip')}</p>
        <p className="guess">{t('importResult.added', { n: outcome.count })}</p>
        <button type="button" className="btn wide" onClick={onClose}>
          {t('importResult.ok')}
        </button>
      </Sheet>
    );
  }

  const { summary, conflictedDays } = outcome;
  const nothing =
    summary.added + summary.updated + summary.removed + conflictedDays.length === 0;

  return (
    <Sheet title={t('importResult.title')} onClose={onClose}>
      {nothing ? (
        <p>{t('importResult.nothing')}</p>
      ) : (
        <>
          <div className="trip-meta">
            {summary.added > 0 && <span className="chip">{t('importResult.added', { n: summary.added })}</span>}
            {summary.updated > 0 && <span className="chip">{t('importResult.updated', { n: summary.updated })}</span>}
            {summary.removed > 0 && <span className="chip">{t('importResult.removed', { n: summary.removed })}</span>}
          </div>

          {summary.changes.length > 0 && (
            <ul className="changelist">
              {summary.changes.slice(0, 12).map((c, i) => (
                <li key={`${c.name}-${i}`}>
                  <span className="chip">Day {c.dayIndex + 1}</span>
                  <span className="changekind">{t(`importResult.${c.kind}` as 'importResult.added', { n: 1 })}</span>
                  {c.name}
                </li>
              ))}
            </ul>
          )}

          {conflictedDays.length > 0 && (
            <div className="hintbar">
              <span>
                ⚖️ {t('importResult.conflicted', { n: conflictedDays.length })}
                <br />
                {t('importResult.conflictHint')}
              </span>
            </div>
          )}
        </>
      )}

      <button type="button" className="btn wide" onClick={onClose}>
        {t('importResult.ok')}
      </button>
    </Sheet>
  );
}
