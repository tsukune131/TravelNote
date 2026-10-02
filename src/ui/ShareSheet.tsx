import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { getDisplayName } from '../db/settings';
import { ensureOwner, listMembers, setMyDisplayName } from '../db/repo';
import type { Trip } from '../db/types';
import { manageTripShare, shareTrip } from '../cloud/sync';
import { cloudAvailable } from '../cloud/native';

/**
 * 旅の共有画面。**共有は iCloud(CloudKit)だけ**(ROADMAP E-2)。
 * 招待の送り方・参加者の管理・共有の停止は iOS 標準の画面に任せ、
 * ここは入口と「いま誰がいるか」だけを持つ。共有は無料(2026-09-24)。
 *
 * ファイルで送り合う方式(しおりのファイル)は 2026-10-02 に撤去した(E-2b)。
 */
export function ShareSheet({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const members = useLiveQuery(() => listMembers(trip.id), [trip.id]);

  useEffect(() => {
    void getDisplayName().then(setName);
  }, [trip.id]);

  /** 招待を送る。**参加者は招待を出せない**(作成者のゾーンなので) */
  async function shareWithICloud() {
    setBusy(true);
    setNote(null);
    try {
      await ensureOwner(trip.id, name.trim() || t('share.displayNameDefault'));
      const result = await shareTrip(trip, t('share.icloudMessage', { title: trip.title }));
      if (result === 'unavailable') setNote(t('share.icloudUnavailable'));
      if (result === 'notOwner') setNote(t('share.icloudNotOwner'));
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setNote(code === 'ck25' ? t('settings.cloudQuota') : t('share.icloudFailed', { code }));
    } finally {
      setBusy(false);
    }
  }

  async function manageShare() {
    setBusy(true);
    setNote(null);
    try {
      const result = await manageTripShare(trip);
      if (result === 'noShare') setNote(t('share.icloudNotYet'));
      if (result === 'unavailable') setNote(t('share.icloudUnavailable'));
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setNote(t('share.icloudFailed', { code }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={t('share.title')} onClose={onClose}>
      <div className="field">
        <label htmlFor="share-name">{t('share.displayName')}</label>
        <input
          id="share-name"
          value={name}
          placeholder={t('share.displayNameDefault')}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void setMyDisplayName(name)}
        />
        <p className="guess">{t('share.displayNameHint')}</p>
      </div>

      {/* ブラウザ版(開発用)には iCloud が無いので、共有の入口そのものを出さない */}
      {cloudAvailable() ? (
        <div className="field">
          {trip.cloud?.scope === 'shared' ? (
            <p className="guess">{t('share.icloudJoined')}</p>
          ) : (
            <>
              <button type="button" className="btn wide" onClick={() => void shareWithICloud()} disabled={busy}>
                ☁️ {t('share.icloud')}
              </button>
              <p className="guess">{t('share.icloudHint')}</p>
              <button type="button" className="btn ghost" onClick={() => void manageShare()} disabled={busy}>
                {t('share.icloudManage')}
              </button>
            </>
          )}
        </div>
      ) : (
        <p className="guess">{t('share.icloudUnavailable')}</p>
      )}

      {/*
        誰と共有しているか。**まだ誰もいないうちは出さない**(ひとりで使う旅では
        意味のない見出しになる)。役割は表示だけ。参加している人は全員編集できる
      */}
      {members !== undefined && members.length > 0 && (
        <div className="field">
          <label>{t('share.members')}</label>
          {members.map((m) => (
            <div className="linkrow" key={m.id}>
              <span className="lbl">{t(m.role === 'owner' ? 'share.roleOwner' : 'share.roleEditor')}</span>
              <span className="url">{m.displayName || t('share.displayNameDefault')}</span>
            </div>
          ))}
        </div>
      )}

      {note && <p className="guess">{note}</p>}
    </Sheet>
  );
}
