import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { addEvent, updateEvent } from '../db/repo';
import { guessLinkLabel } from '../lib/maps';
import { openLink } from '../lib/openExternal';
import { inboxLabel, listInbox, removeFromInbox } from '../share/inbox';

/**
 * 共有シートから届いたものの置き場(docs/ux-design.md §4.4)。
 *
 * 共有した時点では「どの旅の、どの Day か」が決まっていない。
 * 拡張の中で選ばせると「共有 → 終わり」の速さが消えるので、
 * **行き先が決まっていないものを一時的に置く場所**を用意する。
 *
 * 出すのは旅の中だけ。**配置できる場所でだけ見せる** ──
 * 旅一覧には Day が無いので、そこで見せても押せるものが無い。
 */

export function InboxBar({ count, onOpen }: { count: number; onOpen: () => void }) {
  const { t } = useI18n();
  if (count === 0) return null;
  return (
    <button type="button" className="inboxbar" onClick={onOpen}>
      📥 {t('inbox.waiting', { n: count })}
      <span className="sub">›</span>
    </button>
  );
}

export function InboxSheet({
  tripId,
  dayIndex,
  onClose,
}: {
  tripId: string;
  dayIndex: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const items = useLiveQuery(() => listInbox(), []);

  return (
    <Sheet title={t('inbox.title')} onClose={onClose}>
      <p className="guess">{t('inbox.hint', { n: dayIndex + 1 })}</p>

      {items?.map((item) => (
        <div className="inboxrow" key={item.id}>
          <button type="button" className="what" onClick={() => void openLink(item.url)}>
            <span className="name">{inboxLabel(item)}</span>
            <span className="url">{item.url}</span>
          </button>

          <button
            type="button"
            className="btn ghost"
            onClick={() => void place(item.id, inboxLabel(item), item.url)}
          >
            {t('inbox.place', { n: dayIndex + 1 })}
          </button>

          <button
            type="button"
            className="iconbtn plain"
            aria-label={t('common.delete')}
            onClick={() => void removeFromInbox(item.id)}
          >
            ✕
          </button>
        </div>
      ))}

      {items !== undefined && items.length === 0 && (
        <p className="guess">{t('inbox.empty')}</p>
      )}
    </Sheet>
  );

  /** 予定にして、インボックスから外す。名前は題名、URL はリンクとして入る */
  async function place(id: string, name: string, url: string) {
    const event = await addEvent(tripId, dayIndex, name);
    await updateEvent(event.id, { links: [{ url, label: guessLinkLabel(url) }] });
    await removeFromInbox(id);
  }
}
