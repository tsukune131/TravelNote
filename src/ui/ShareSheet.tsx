import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { Paywall } from './Paywall';
import { getDisplayName, setDisplayName } from '../db/settings';
import { ensureOwner, listMembers } from '../db/repo';
import { countUnsentChanges } from '../share/snapshot';
import { exportSnapshotText, importSnapshotText } from '../share/apply';
import { readFileFromPicker, sendSnapshot } from '../share/transport';
import { canShare } from '../pro/entitlement';
import { FREE } from '../pro/entitlement';
import type { MergeSummary } from '../share/merge';
import type { Trip } from '../db/types';

export type ImportOutcome =
  | { kind: 'ok'; summary: MergeSummary; conflictedDays: number[]; tripId: string }
  | { kind: 'new'; count: number; tripId: string }
  | { kind: 'failed'; message: string };

/**
 * しおりの受け渡し画面。
 *
 * **サーバーは無い。** 送るのはファイルで、経路は使う人が選ぶ。
 * 受け取る側は無料 ── ここを有料にすると共有そのものが死ぬ(docs/pricing.md §4)。
 */
export function ShareSheet({
  trip,
  onClose,
  onImported,
}: {
  trip: Trip;
  onClose: () => void;
  onImported: (outcome: ImportOutcome) => void;
}) {
  const { t, date } = useI18n();
  const [name, setName] = useState('');
  const [unsent, setUnsent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const members = useLiveQuery(() => listMembers(trip.id), [trip.id]);

  useEffect(() => {
    void getDisplayName().then(setName);
    void countUnsentChanges(trip.id).then(setUnsent);
  }, [trip.id]);

  // 課金はフェーズDで配線する。いまは判定だけ通して、実際には止めない
  const gate = canShare(trip, FREE, Date.now());

  /** `force` はペイウォールから戻ってきたとき。付けないと同じ関門で永久に跳ね返る */
  async function send(force = false) {
    if (!gate.allowed && !force) return setPaywall(true);
    setBusy(true);
    try {
      const myName = name.trim() || t('share.displayNameDefault');
      /*
       * 送る前に**自分を参加者として登録する。**
       * これが抜けていたので、送っても参加者が0人のしおりが飛んでいた ──
       * 受け取った側にも「誰から来たのか」が残らない。
       * 一度作れば以後は同じレコードを使い回す。
       */
      await ensureOwner(trip.id, myName);
      const { text } = await exportSnapshotText(trip.id, myName);
      const result = await sendSnapshot(trip, text);
      if (result === 'downloaded') setNote(t('share.downloaded'));
      setUnsent(await countUnsentChanges(trip.id));
    } finally {
      setBusy(false);
    }
  }

  async function receive() {
    const text = await readFileFromPicker();
    if (text === null) return;
    setBusy(true);
    try {
      const before = trip.id;
      // 案のラベルになる。名前を決めていない人は「わたしの案」のほうが分かりやすい
      const r = await importSnapshotText(text, name.trim() || t('variant.mine'));
      onImported(
        r.tripId === before
          ? { kind: 'ok', summary: r.summary, conflictedDays: r.conflictedDays, tripId: r.tripId }
          : { kind: 'new', count: r.summary.added, tripId: r.tripId },
      );
    } catch (err) {
      onImported({ kind: 'failed', message: err instanceof Error ? err.message : '' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet title={t('share.title')} onClose={onClose}>
        <div className="field">
          <label htmlFor="share-name">{t('share.displayName')}</label>
          <input
            id="share-name"
            value={name}
            placeholder={t('share.displayNameDefault')}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void setDisplayName(name)}
          />
          <p className="guess">{t('share.displayNameHint')}</p>
        </div>

        <div className="field">
          <button type="button" className="btn wide" onClick={() => void send()} disabled={busy}>
            📤 {trip.sharedAt === null ? t('share.send') : t('share.sendAgain')}
          </button>
          <p className="guess">{t('share.sendHint')}</p>
          <p className={unsent && unsent > 0 ? 'unsent-badge' : 'guess'}>
            {trip.sharedAt === null
              ? t('share.neverShared')
              : unsent === null
                ? ''
                : unsent > 0
                  ? t('share.unsent', { n: unsent })
                  : t('share.unsentNone')}
            {trip.sharedAt !== null &&
              ` ・ ${t('share.lastSharedAt', { when: date(new Date(trip.sharedAt), { month: 'numeric', day: 'numeric' }) })}`}
          </p>
        </div>

        <div className="field">
          <button type="button" className="btn ghost wide" onClick={() => void receive()} disabled={busy}>
            📥 {t('share.receive')}
          </button>
          <p className="guess">{t('share.receiveHint')}</p>
        </div>

        {/*
          誰と共有しているか。**まだ誰もいないうちは出さない**(ひとりで使う旅では
          意味のない見出しになる)。役割は表示だけ ── サーバーが無い以上、
          渡した相手の端末では何でもできるので、権限として機能させない
          (docs/ux-design.md §6.5「守れる顔をしたUIを作らない」)。
        */}
        {members !== undefined && members.length > 0 && (
          <div className="field">
            <label>{t('share.members')}</label>
            {members.map((m) => (
              <div className="linkrow" key={m.id}>
                <span className="lbl">
                  {t(m.role === 'owner' ? 'share.roleOwner' : 'share.roleEditor')}
                </span>
                <span className="url">{m.displayName}</span>
              </div>
            ))}
          </div>
        )}

        {note && <p className="guess">{note}</p>}
      </Sheet>

      {paywall && (
        <Paywall
          onClose={() => setPaywall(false)}
          onProceed={() => {
            setPaywall(false);
            void send(true);
          }}
        />
      )}
    </>
  );
}
