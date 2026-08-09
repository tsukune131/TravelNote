import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '../i18n/context';
import {
  addCompanion,
  ensureOwner,
  listMembers,
  removeMember,
  setIsMeetup,
  setMeetupEntry,
} from '../db/repo';
import { getDisplayName } from '../db/settings';
import { departureTime } from '../lib/plainDate';
import type { Member, MeetupEntry, TripEvent } from '../db/types';
import type { TravelMode } from '../lib/maps';

/**
 * 集合。
 *
 * **3人で行くなら、集合場所まで45分の人と20分の人がいる。**
 * ひとつの「移動時間」を全員で共有しても誰の役にも立たない。
 *
 * ここで見せたいのは所要時間そのものではなく、**何時に出ればいいか**。
 * 所要時間は入力で、出発時刻が答え。だから右側に大きく出す。
 *
 * 他人の欄も編集できる。同行者はアプリを持っていないことがあり、
 * 誰かが代わりに入れられないと3人ぶんが埋まらないため(db/repo.ts)。
 */

/** 集合までの移動はプリセットだけ。分単位で入れさせると入力が仕事になる */
const PRESETS = [10, 15, 20, 30, 45, 60, 90, 120];
const MODES: TravelMode[] = ['walk', 'transit', 'drive'];
const MODE_EMOJI: Record<TravelMode, string> = { walk: '🚶', transit: '🚃', drive: '🚗' };

export function MeetupSection({ event }: { event: TripEvent }) {
  const { t } = useI18n();
  const members = useLiveQuery(() => listMembers(event.tripId), [event.tripId]);
  const [draft, setDraft] = useState('');

  const on = event.isMeetup === true;

  return (
    <div className="field">
      <label className="inline-toggle">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => void toggle(e.target.checked)}
        />
        👥 {t('meetup.toggle')}
      </label>

      {on && (
        <>
          <p className="guess">
            {event.startMinutes === null ? t('meetup.needsTime') : t('meetup.hint')}
          </p>

          {members?.map((m) => (
            <MemberRow
              key={m.id}
              event={event}
              member={m}
              entry={(event.meetup ?? []).find((x) => x.memberId === m.id)}
            />
          ))}

          {/*
            同行者はここで足す。設定画面に追い出さない ──
            必要になった瞬間に聞くのがこのアプリの流儀(docs/ux-design.md §11)
          */}
          <div className="row">
            <input
              value={draft}
              placeholder={t('meetup.addCompanion')}
              aria-label={t('meetup.addCompanion')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add();
              }}
            />
            <button
              type="button"
              className="btn ghost"
              style={{ flex: '0 0 auto' }}
              onClick={add}
              disabled={draft.trim().length === 0}
            >
              {t('common.add')}
            </button>
          </div>
        </>
      )}
    </div>
  );

  /**
   * 集合にした瞬間に、自分を1人目として置く。
   * 空の一覧に「同行者を足す」だけが出ていても、何をする画面か伝わらない。
   */
  async function toggle(next: boolean) {
    await setIsMeetup(event.id, next);
    if (!next) return;
    const saved = await getDisplayName();
    await ensureOwner(event.tripId, saved.trim() || t('meetup.me'));
  }

  function add() {
    const name = draft.trim();
    if (name.length === 0) return;
    void addCompanion(event.tripId, name);
    setDraft('');
  }
}

function MemberRow({
  event,
  member,
  entry,
}: {
  event: TripEvent;
  member: Member;
  entry: MeetupEntry | undefined;
}) {
  const { t, duration, time } = useI18n();
  const mode = entry?.mode ?? 'transit';
  const leaveAt = departureTime(event.startMinutes, entry?.minutes);

  return (
    <div className="meetrow">
      <span className="who">{member.displayName}</span>

      <button
        type="button"
        className="modebtn"
        aria-label={t('connector.mode')}
        onClick={() =>
          void setMeetupEntry(event.id, member.id, entry?.minutes ?? 30, nextMode(mode))
        }
      >
        {MODE_EMOJI[mode]}
      </button>

      <select
        className="mins"
        value={entry?.minutes ?? ''}
        aria-label={`${member.displayName} — ${t('meetup.minutes')}`}
        onChange={(e) =>
          void setMeetupEntry(
            event.id,
            member.id,
            e.target.value === '' ? null : Number(e.target.value),
            mode,
          )
        }
      >
        <option value="">{t('common.none')}</option>
        {PRESETS.map((m) => (
          <option key={m} value={m}>
            {duration(m)}
          </option>
        ))}
      </select>

      {/* 答えはここ。所要時間ではなく「何時に出るか」 */}
      <span className="leave">
        {leaveAt === null ? '—' : t('meetup.leaveAt', { time: time(leaveAt) })}
      </span>

      {/* 消せるのは同行者だけ。自分は旅から外せない(外す意味もない) */}
      {member.deviceId === '' ? (
        <button
          type="button"
          className="iconbtn plain"
          aria-label={`${member.displayName} — ${t('common.delete')}`}
          onClick={() => void removeMember(member.id)}
        >
          ✕
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

function nextMode(mode: TravelMode): TravelMode {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length];
}
