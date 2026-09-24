import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { Avatar } from './Avatar';
import { getDeviceId } from '../db/db';
import { getDisplayName } from '../db/settings';
import { addManualMember, ensureOwner, listMembers, removeMember, updateMember } from '../db/repo';
import { AVATAR_PRESETS, defaultIcon, shrinkPhoto } from '../lib/avatar';
import type { Member, MemberIcon } from '../db/types';

/**
 * 旅のメンバー(ディズニーアプリの「マイパーティ」のような一覧)。
 *
 * - 共有の参加者は、しおりを受け取った時点で自動でここに並ぶ
 * - スマホを持たない人(子ども・祖父母)は手で足せる
 * - アイコンは写真か、用意した絵柄から
 *
 * **登録・ログインは無い**(アカウントを作らせない方針。5.1.1(v))。
 * 誰の名前も端末の外へは出ない ── 旅を共有したときに、しおりと一緒に運ばれるだけ。
 */
export function MembersSheet({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const { t } = useI18n();
  const members = useLiveQuery(() => listMembers(tripId), [tripId]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Member | 'new' | null>(null);

  /*
   * 自分を必ず先頭に置く。まだ共有したことのない旅では自分のレコードが無いので、
   * 開いた時点で作る(表示名が未設定なら「あなた」と出す)。
   */
  useEffect(() => {
    void (async () => {
      setDeviceId(await getDeviceId());
      await ensureOwner(tripId, await getDisplayName());
    })();
  }, [tripId]);

  return (
    <>
      <Sheet title={t('members.title')} onClose={onClose}>
        <p className="guess">{t('members.hint')}</p>

        <div className="member-list">
          {members?.map((m) => {
            const mine = m.deviceId === deviceId;
            // 共有で入ってきた他人の名前とアイコンは、その人の端末が決める
            const editable = mine || m.deviceId === '';
            return (
              <button
                key={m.id}
                type="button"
                className="member-row"
                disabled={!editable}
                onClick={() => setEditing(m)}
              >
                <Avatar member={m} size={40} />
                <span className="member-name">
                  <b>{m.displayName || t('members.me')}</b>
                  {/* 名前が未設定の自分は、名前の欄にもう「あなた」と出ている */}
                  {!(mine && !m.displayName) && (
                    <small>
                      {mine ? t('members.me') : m.deviceId === '' ? t('members.manual') : t('members.shared')}
                    </small>
                  )}
                </span>
                {editable && <span className="sub">›</span>}
              </button>
            );
          })}
        </div>

        <button type="button" className="btn ghost wide" onClick={() => setEditing('new')}>
          ＋ {t('members.add')}
        </button>
      </Sheet>

      {editing && (
        <MemberEditor
          tripId={tripId}
          member={editing === 'new' ? null : editing}
          canRemove={editing !== 'new' && editing.deviceId === ''}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function MemberEditor({
  tripId,
  member,
  canRemove,
  onClose,
}: {
  tripId: string;
  member: Member | null;
  canRemove: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(member?.displayName ?? '');
  const [icon, setIcon] = useState<MemberIcon>(
    member?.icon ?? defaultIcon(member?.id ?? String(Date.now())),
  );
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setIcon({ kind: 'photo', dataUrl: await shrinkPhoto(file) });
      setError(null);
    } catch {
      setError(t('members.photoFailed'));
    }
  }

  async function save() {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    if (member) await updateMember(member.id, { displayName: trimmed, icon });
    else await addManualMember(tripId, trimmed, icon);
    onClose();
  }

  return (
    <Sheet title={t(member ? 'members.editTitle' : 'members.addTitle')} onClose={onClose}>
      <div className="member-preview">
        <Avatar icon={icon} size={72} />
      </div>

      <div className="field">
        <label htmlFor="member-name">{t('members.name')}</label>
        <input
          id="member-name"
          value={name}
          placeholder={t('members.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <label>{t('members.icon')}</label>
        <div className="avatar-grid">
          {AVATAR_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="avatar-choice"
              aria-pressed={icon.kind === 'preset' && icon.id === p.id}
              aria-label={p.id}
              onClick={() => setIcon({ kind: 'preset', id: p.id })}
            >
              <Avatar icon={{ kind: 'preset', id: p.id }} size={40} />
            </button>
          ))}
        </div>
        {/*
          写真は OS の写真ピッカーから。**写真ライブラリへのアクセス許可は要らない**
          (選ばれた1枚だけが渡る)。縮めてから持つ(lib/avatar.ts)
        */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void pickPhoto(e.target.files?.[0])}
        />
        <button type="button" className="btn ghost wide" onClick={() => fileRef.current?.click()}>
          🖼 {t('members.photo')}
        </button>
        {error && <p className="err">{error}</p>}
      </div>

      <button type="button" className="btn wide" disabled={name.trim().length === 0} onClick={() => void save()}>
        {t('common.save')}
      </button>

      {canRemove && member && (
        <div className="field">
          <button
            type="button"
            className="btn ghost wide danger"
            onClick={() => {
              void removeMember(member.id);
              onClose();
            }}
          >
            {t('members.remove')}
          </button>
          <p className="guess">{t('members.removeHint')}</p>
        </div>
      )}
    </Sheet>
  );
}
