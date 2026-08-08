import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import {
  applyUndo,
  deleteEvent,
  duplicateEvent,
  moveEventToDay,
  nudgeEvent,
  reflowFrom,
  toggleDone,
  updateEvent,
} from '../db/repo';
import type { ReflowResult } from '../db/repo';
import { reflowPreview } from '../lib/connector';
import type { TripEvent } from '../db/types';

/** 旅程は必ず押す。15/30/60 が実際に使う刻み */
const REFLOW_STEPS = [15, 30, 60];

export function EventActions({
  event,
  events,
  dayCount,
  onClose,
  onEdit,
  onReflowed,
}: {
  event: TripEvent;
  events: TripEvent[];
  dayCount: number;
  onClose: () => void;
  onEdit: () => void;
  onReflowed: (result: ReflowResult, deltaMinutes: number) => void;
}) {
  const { t } = useI18n();
  const preview = reflowPreview(events, event.id);
  const canReflow = event.startMinutes !== null && preview.willMove > 0;

  async function reflow(delta: number) {
    const result = await reflowFrom(event.tripId, event.dayIndex, event.id, delta);
    onClose();
    onReflowed(result, delta);
  }

  return (
    <Sheet title={t('actions.title', { name: event.name })} onClose={onClose}>
      {canReflow && (
        <div className="field">
          <label>{t('reflow.action')}</label>
          <div className="row">
            {REFLOW_STEPS.map((m) => (
              <button key={m} type="button" className="catbtn" onClick={() => void reflow(m)}>
                +{t('reflow.by', { n: m })}
              </button>
            ))}
          </div>
          <div className="row">
            {REFLOW_STEPS.map((m) => (
              <button key={m} type="button" className="catbtn" onClick={() => void reflow(-m)}>
                −{t('reflow.by', { n: m })}
              </button>
            ))}
          </div>
          <p className="guess">
            {t('reflow.preview', { count: preview.willMove })}
            {preview.pinnedSkipped > 0 && ` / ${t('reflow.pinnedSkipped', { n: preview.pinnedSkipped })}`}
          </p>
        </div>
      )}

      <div>
        <button
          type="button"
          className="menu-item"
          onClick={() => {
            void toggleDone(event.id);
            onClose();
          }}
        >
          {event.done ? '↩ ' : '✓ '}
          {t(event.done ? 'actions.undone' : 'actions.done')}
        </button>

        <button
          type="button"
          className="menu-item"
          onClick={() => {
            void updateEvent(event.id, { pinned: !event.pinned });
            onClose();
          }}
        >
          {t(event.pinned ? 'actions.unpin' : 'actions.pin')}
        </button>

        <button
          type="button"
          className="menu-item"
          onClick={() => {
            void nudgeEvent(event.id, -1);
            onClose();
          }}
        >
          ↑ {t('actions.up')}
        </button>
        <button
          type="button"
          className="menu-item"
          onClick={() => {
            void nudgeEvent(event.id, 1);
            onClose();
          }}
        >
          ↓ {t('actions.down')}
        </button>

        <button
          type="button"
          className="menu-item"
          onClick={() => {
            void duplicateEvent(event.id);
            onClose();
          }}
        >
          ⧉ {t('actions.duplicate')}
        </button>

        <button type="button" className="menu-item" onClick={onEdit}>
          ✎ {t('actions.edit')}
        </button>
      </div>

      {dayCount > 1 && (
        <div className="field">
          <label>{t('actions.moveToDay')}</label>
          <div className="catgrid">
            {Array.from({ length: dayCount }, (_, i) => (
              <button
                key={i}
                type="button"
                className="catbtn"
                disabled={i === event.dayIndex}
                aria-pressed={i === event.dayIndex}
                onClick={() => {
                  void moveEventToDay(event.id, i);
                  onClose();
                }}
              >
                {t('trip.dayTab', { n: i + 1 })}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className="btn danger wide"
        onClick={() => {
          void deleteEvent(event.id);
          onClose();
        }}
      >
        {t('common.delete')}
      </button>
    </Sheet>
  );
}

/** リフローのあとに数秒出す「元に戻す」 */
export function UndoBar({
  result,
  deltaMinutes,
  onDismiss,
}: {
  result: ReflowResult;
  deltaMinutes: number;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="undobar" role="status">
      <span>
        {result.movedCount > 0
          ? t('reflow.done', { count: result.movedCount, n: deltaMinutes })
          : t('reflow.nothing')}
        {result.pinnedSkipped > 0 && ` ・ ${t('reflow.pinnedSkipped', { n: result.pinnedSkipped })}`}
      </span>
      {result.undo.length > 0 && (
        <button
          type="button"
          onClick={() => {
            void applyUndo(result.undo);
            onDismiss();
          }}
        >
          {t('reflow.undo')}
        </button>
      )}
    </div>
  );
}
