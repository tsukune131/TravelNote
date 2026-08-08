import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { getDisplayName } from '../db/settings';
import { importSnapshotText } from '../share/apply';
import { readFileFromPicker } from '../share/transport';
import type { ImportOutcome } from './ShareSheet';

/**
 * 「ファイルから取り込む」。
 *
 * **旅を1つも持っていない人が最初に使うボタン。** 受け取る側はまさにその状態なので、
 * 旅の中だけでなく**旅一覧にも置く**。ここが無いと、送られた人が何もできない
 * (実際に往復を試して詰まった)。
 */
export function ImportButton({
  className = 'btn ghost wide',
  onImported,
}: {
  className?: string;
  onImported: (outcome: ImportOutcome) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function receive() {
    const text = await readFileFromPicker();
    if (text === null) return;
    setBusy(true);
    try {
      const name = (await getDisplayName()) || t('variant.mine');
      const r = await importSnapshotText(text, name);
      onImported({
        kind: 'new',
        count: r.summary.added,
        tripId: r.tripId,
      });
    } catch (err) {
      onImported({ kind: 'failed', message: err instanceof Error ? err.message : '' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={className} onClick={() => void receive()} disabled={busy}>
      📥 {t('share.receive')}
    </button>
  );
}
