import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { categoryLabelKey, linkLabelKey } from '../i18n/keys';
import { Sheet } from './Sheet';
import { CategoryPicker } from './CategoryPicker';
import { deleteEvent, renameEvent, setEventCategory, setEventTime, updateEvent } from '../db/repo';
import { guessLinkLabel } from '../lib/maps';
import { normalizeUrl, openLink } from '../lib/openExternal';
import { clampMinutes } from '../lib/plainDate';
import type { EventLink, TripEvent } from '../db/types';

/** 所要時間はよく使う刻みだけ。分単位で自由入力させると入力が仕事になる */
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

export function EventSheet({
  event,
  onClose,
  onOpenMap,
}: {
  event: TripEvent;
  onClose: () => void;
  onOpenMap: (event: TripEvent) => void;
}) {
  const { t, duration } = useI18n();
  const [name, setName] = useState(event.name);
  const [linkDraft, setLinkDraft] = useState('');

  const hasTime = event.startMinutes !== null;

  return (
    <Sheet
      title={event.name || t('event.namePlaceholder')}
      onClose={onClose}
      headerAction={
        <button type="button" className="iconbtn" onClick={() => onOpenMap(event)} aria-label={t('timeline.openMap')}>
          🗺
        </button>
      }
    >
      <div className="field">
        <label htmlFor="ev-name">{t('event.namePlaceholder')}</label>
        <input
          id="ev-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() !== event.name && name.trim().length > 0) {
              void renameEvent(event.id, name);
            }
          }}
        />
      </div>

      {/*
        時刻は空にできる。チェックボックスで切り替えていたのをやめた ──
        時刻欄そのものを空にすれば済むし、そのほうが操作が1つ減る
      */}
      <div className="row pair">
        <div className="field">
          <label htmlFor="ev-time">{t('event.time')}</label>
          <input
            id="ev-time"
            type="time"
            value={hasTime ? toTimeValue(event.startMinutes ?? 0) : ''}
            onChange={(e) =>
              void setEventTime(event.id, e.target.value === '' ? null : fromTimeValue(e.target.value))
            }
          />
        </div>
        <div className="field">
          <label htmlFor="ev-dur">{t('event.duration')}</label>
          <select
            id="ev-dur"
            value={event.durationMinutes ?? ''}
            onChange={(e) =>
              void updateEvent(event.id, {
                durationMinutes: e.target.value === '' ? null : Number(e.target.value),
              })
            }
          >
            <option value="">{t('common.none')}</option>
            {DURATIONS.map((m) => (
              <option key={m} value={m}>
                {duration(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <CategoryPicker
        value={event.category}
        onChange={(next) => void setEventCategory(event.id, next)}
      />
      {!event.categoryLocked && (
        <p className="guess">
          {t('event.guessedCategory')}: {t(categoryLabelKey(event.category))} ・{' '}
          {t('event.changeCategory')}
        </p>
      )}

      <div className="field">
        <label>{t('event.links')}</label>
        {event.links.map((link, i) => (
          <div className="linkrow" key={`${link.url}-${i}`}>
            <span className="lbl">{t(linkLabelKey(link.label))}</span>
            <button
              type="button"
              className="url"
              style={{ textAlign: 'left' }}
              onClick={() => void openLink(link.url)}
            >
              {link.url}
            </button>
            <button
              type="button"
              className="iconbtn plain"
              aria-label={t('common.delete')}
              onClick={() =>
                void updateEvent(event.id, { links: event.links.filter((_, j) => j !== i) })
              }
            >
              ✕
            </button>
          </div>
        ))}
        <div className="row">
          <input
            value={linkDraft}
            placeholder="https://tabelog.com/..."
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addLink();
            }}
          />
          <button
            type="button"
            className="btn ghost"
            style={{ flex: '0 0 auto' }}
            onClick={addLink}
            disabled={linkDraft.trim().length === 0}
          >
            {t('common.add')}
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="ev-note">{t('event.note')}</label>
        <textarea
          id="ev-note"
          defaultValue={event.note ?? ''}
          onBlur={(e) => void updateEvent(event.id, { note: e.target.value.trim() || undefined })}
        />
      </div>

      <label className="inline-toggle">
        <input
          type="checkbox"
          checked={event.pinned}
          onChange={(e) => void updateEvent(event.id, { pinned: e.target.checked })}
        />
        📌 {t('timeline.pinned')}
      </label>

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

  function addLink() {
    const url = normalizeUrl(linkDraft);
    if (!url) return;
    const link: EventLink = { url, label: guessLinkLabel(url) };
    void updateEvent(event.id, { links: [...event.links, link] });
    setLinkDraft('');
  }
}

function toTimeValue(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fromTimeValue(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return clampMinutes((h || 0) * 60 + (m || 0));
}
