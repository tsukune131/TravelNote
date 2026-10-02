import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { findShareLink, joinByLink } from '../cloud/sync';

/**
 * 招待リンクを貼り付けて、共有された旅に参加する(ROADMAP E-2)。
 *
 * **LINE で受け取ったリンクはタップしてもアプリに渡らない**(LINE の中のブラウザで
 * iCloud の Web ページが開くだけ。2026-10-02 に実機で確認)。日本では招待は
 * LINE で届くのが普通なので、どの経路で届いても参加できる道をここに置く。
 *
 * 招待の文ごと貼られても、中からリンクだけを拾う(URL 欄と同じ考え方)。
 */
export function JoinSheet({
  onClose,
  onJoined,
}: {
  onClose: () => void;
  onJoined: (tripId: string) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const link = findShareLink(draft);

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim().length > 0) setDraft(findShareLink(text) ?? text.trim());
    } catch {
      // 読めない環境では OS の長押し「ペースト」に任せる
    }
  }

  async function join() {
    if (!link) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await joinByLink(link);
      if (r.kind === 'unavailable') {
        setNote(t('share.icloudUnavailable'));
      } else if (r.tripId) {
        onJoined(r.tripId);
      } else {
        setNote(t('join.waiting'));
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setNote(code === 'ck11' ? t('join.notFound') : t('join.failed', { code }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={t('join.title')} onClose={onClose}>
      <p className="guess">{t('join.lead')}</p>
      <div className="field">
        <div className="row">
          <input
            value={draft}
            placeholder="https://www.icloud.com/share/..."
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            aria-label={t('join.title')}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="button" className="btn ghost" style={{ flex: '0 0 auto' }} onClick={() => void paste()}>
            {t('common.paste')}
          </button>
        </div>
        {draft.trim().length > 0 && !link && <p className="guess">{t('join.noLink')}</p>}
      </div>
      <button type="button" className="btn wide" onClick={() => void join()} disabled={!link || busy}>
        {t('join.join')}
      </button>
      {note && <p className="guess">{note}</p>}
    </Sheet>
  );
}
