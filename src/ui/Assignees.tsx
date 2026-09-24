import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '../i18n/context';
import { Avatar } from './Avatar';
import { Paywall } from './Paywall';
import { db } from '../db/db';
import { listMembers, toggleAssignee } from '../db/repo';
import { tripFeaturesUnlocked } from '../pro/entitlement';
import { useProStatus } from '../pro/store';
import type { Member, TripEvent } from '../db/types';

/**
 * メモの担当を割り振る(詳細シートの中)。**Pro**。
 *
 * 旅の作成者が Pro なら、参加者全員が使える(pro/entitlement.ts)。
 * 使えないときは担当の並びを見せたうえで、押したら購入画面 ──
 * 割り込んで出すのではなく、押した人にだけ出す。
 *
 * ⚠️ Pro が切れても、**付けてあった担当は消さずに見せる**(データをロックしない)。
 */
export function AssigneePicker({ event }: { event: TripEvent }) {
  const { t } = useI18n();
  const pro = useProStatus();
  const trip = useLiveQuery(() => db.trips.get(event.tripId), [event.tripId]);
  const members = useLiveQuery(() => listMembers(event.tripId), [event.tripId]);
  const [paywall, setPaywall] = useState(false);

  if (!trip || !members) return null;
  const unlocked = tripFeaturesUnlocked(trip, pro, Date.now());
  const assigned = new Set(event.assigneeIds ?? []);

  return (
    <div className="field">
      <label>
        {t('assign.label')}
        {!unlocked && <span className="pro-tag">{t('assign.pro')}</span>}
      </label>
      {members.length === 0 ? (
        <p className="guess">{t('assign.noMembers')}</p>
      ) : (
        <div className="assignee-row">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              className="assignee-choice"
              aria-pressed={assigned.has(m.id)}
              onClick={() => (unlocked ? void toggleAssignee(event.id, m.id) : setPaywall(true))}
            >
              <Avatar member={m} size={36} />
              <small>{m.displayName || t('members.me')}</small>
            </button>
          ))}
        </div>
      )}
      <p className="guess">{t('assign.hint')}</p>
      {paywall && <Paywall reason="assign" onClose={() => setPaywall(false)} />}
    </div>
  );
}

/** 行に出す、担当の小さな顔ぶれ。3人まで並べて、あとは +n */
export function AssigneeStack({ ids, members }: { ids: string[]; members: Member[] }) {
  const shown = ids
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is Member => m !== undefined);
  if (shown.length === 0) return null;
  return (
    <span className="assignee-stack">
      {shown.slice(0, 3).map((m) => (
        <Avatar key={m.id} member={m} size={20} />
      ))}
      {shown.length > 3 && <small>+{shown.length - 3}</small>}
    </span>
  );
}

/**
 * メモタブの絞り込み。「全員 / 担当なし / 各メンバー」。
 * `null` が全員、`''` が担当なし。
 */
export function AssigneeFilter({
  members,
  value,
  onChange,
}: {
  members: Member[];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="assignee-filter" role="group" aria-label={t('assign.label')}>
      <button type="button" className="filter-chip" aria-pressed={value === null} onClick={() => onChange(null)}>
        {t('assign.all')}
      </button>
      {members.map((m) => (
        <button
          key={m.id}
          type="button"
          className="filter-chip"
          aria-pressed={value === m.id}
          onClick={() => onChange(m.id)}
        >
          <Avatar member={m} size={20} />
          {m.displayName || t('members.me')}
        </button>
      ))}
      <button type="button" className="filter-chip" aria-pressed={value === ''} onClick={() => onChange('')}>
        {t('assign.unassigned')}
      </button>
    </div>
  );
}
