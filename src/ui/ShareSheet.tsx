import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { Paywall } from './Paywall';
import { getDisplayName, setDisplayName } from '../db/settings';
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
      const { text } = await exportSnapshotText(trip.id, name.trim() || t('share.displayNameDefault'));
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
