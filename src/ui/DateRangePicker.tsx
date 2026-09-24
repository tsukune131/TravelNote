import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { addDays, toDate, toPlainDate, today } from '../lib/plainDate';
import type { PlainDate } from '../lib/plainDate';

/**
 * 出発日と帰る日を**1つのカレンダーで続けて選ぶ**。
 *
 * 日付欄2つだと、OS の日付ピッカーを2回開いて月を2回送ることになる。
 * 旅行サイトでおなじみの形 ── 1回目のタップで出発、2回目で帰る日 ── にして、
 * あいだの日を帯で塗る。何泊になるかが目で分かる。
 *
 * - 帰る日より前をタップしたら、それを出発日に選び直す(逆転を作らせない)
 * - 同じ日を2回タップすれば日帰り
 * - `complete` は範囲が決まりきったとき true。**途中の状態で自動保存させない**ため
 */
export function DateRangePicker({
  start,
  end,
  maxDays,
  onChange,
}: {
  start: PlainDate;
  end: PlainDate;
  maxDays: number;
  onChange: (start: PlainDate, end: PlainDate, complete: boolean) => void;
}) {
  const { t, date } = useI18n();
  const [picking, setPicking] = useState<'start' | 'end'>('start');
  /** 表示している月の1日 */
  const [month, setMonth] = useState<PlainDate>(firstOfMonth(start));

  const now = today();
  const days = monthGrid(month);
  const monthIndex = toDate(month).getMonth();
  // 帰る日を選んでいるあいだは、上限を越える日を押させない
  const limit = picking === 'end' ? addDays(start, maxDays - 1) : null;

  function tap(d: PlainDate) {
    if (picking === 'start' || d < start) {
      onChange(d, d, false);
      setPicking('end');
      return;
    }
    onChange(start, d, true);
    setPicking('start');
  }

  return (
    <div className={`range${picking === 'end' ? ' pending' : ''}`}>
      <p className="range-prompt" aria-live="polite">
        {t(picking === 'start' ? 'tripForm.pickStart' : 'tripForm.pickEnd')}
      </p>

      <div className="range-head">
        <button
          type="button"
          className="iconbtn plain"
          aria-label={t('tripForm.prevMonth')}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ‹
        </button>
        <b>{date(toDate(month), { year: 'numeric', month: 'long' })}</b>
        <button
          type="button"
          className="iconbtn plain"
          aria-label={t('tripForm.nextMonth')}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          ›
        </button>
      </div>

      <div className="range-grid">
        {days.slice(0, 7).map((d) => (
          <span key={`w${d}`} className="range-wd" aria-hidden="true">
            {date(toDate(d), { weekday: 'narrow' })}
          </span>
        ))}
        {days.map((d) => {
          const dt = toDate(d);
          const outside = dt.getMonth() !== monthIndex;
          const isStart = d === start;
          const isEnd = d === end && picking === 'start';
          const inside = picking === 'start' && d > start && d < end;
          const disabled = limit !== null && d > limit;
          const cls = [
            'range-day',
            outside && 'outside',
            dt.getDay() === 0 && 'sun',
            dt.getDay() === 6 && 'sat',
            d === now && 'today',
            isStart && 'start',
            isEnd && 'end',
            // 日帰りは両端が同じ日。帯は描かない
            isStart && isEnd && 'single',
            inside && 'inside',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={d}
              type="button"
              className={cls}
              data-date={d}
              disabled={disabled}
              aria-pressed={isStart || isEnd}
              aria-label={date(dt, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
              onClick={() => tap(d)}
            >
              <span>{dt.getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function firstOfMonth(d: PlainDate): PlainDate {
  return `${d.slice(0, 7)}-01`;
}

function shiftMonth(first: PlainDate, by: number): PlainDate {
  const d = toDate(first);
  return toPlainDate(new Date(d.getFullYear(), d.getMonth() + by, 1));
}

/** 日曜はじまりで、その月を含む週をすべて並べる(前後の月の日も埋める) */
function monthGrid(first: PlainDate): PlainDate[] {
  const d = toDate(first);
  const lead = d.getDay();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((lead + last) / 7) * 7;
  const origin = addDays(first, -lead);
  return Array.from({ length: cells }, (_, i) => addDays(origin, i));
}
