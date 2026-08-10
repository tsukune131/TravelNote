import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { addEvent, listTrips, updateEvent } from '../db/repo';
import { guessLinkLabel } from '../lib/maps';
import { openLink } from '../lib/openExternal';
import { inboxLabel, listInbox, removeFromInbox } from '../share/inbox';
import type { InboxItem } from '../db/types';

/**
 * 共有シートから届いたものの置き場(docs/ux-design.md §4.4)。
 *
 * 共有した時点では「どの旅の、どの Day か」が決まっていない。
 * 拡張の中で選ばせると「共有 → 終わり」の速さが消えるので、
 * **行き先が決まっていないものを一時的に置く場所**を用意している。
 *
 * ## 入口は旅一覧にも旅の中にも出す
 *
 * **インボックスは旅ではなく端末に属する。** それでも旅の中に出すのは、
 * 旅行中に「この店よさそう」を放り込む使い方が普通にあるから。
 * 帯だけ旅一覧に置くと、旅行中は起動が旅に着地するので**一度も目に入らない**。
 *
 * 「この旅に届いている」と読まれないようにしてあるのは2点:
 *
 * - 文言を「**届いたリンク**」にした(旅と結びつけない言い方)
 * - **入れ先を必ず明示的に決めさせる。** 旅一覧から開いたら旅を選ばせ、
 *   旅の中から開いたら「この日に入れる」と書く。黙ってどこかに入ることはない
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
  here,
  onClose,
}: {
  /** 旅の中から開いたとき。あれば旅を選ばせず、その場に入れる */
  here?: { tripId: string; dayIndex: number };
  onClose: () => void;
}) {
  const { t } = useI18n();
  const items = useLiveQuery(() => listInbox(), []);
  const trips = useLiveQuery(() => listTrips(), []);
  /** 旅を選んでいる最中の1件。null なら一覧を出す */
  const [choosing, setChoosing] = useState<InboxItem | null>(null);

  if (choosing) {
    return (
      <Sheet title={inboxLabel(choosing)} onClose={() => setChoosing(null)}>
        <p className="guess">{t('inbox.chooseTrip')}</p>
        {trips?.map((trip) => (
          <button
            key={trip.id}
            type="button"
            className="menu-item"
            onClick={() => void place(choosing, trip.id)}
          >
            {trip.title}
            <span className="sub">›</span>
          </button>
        ))}
        {trips !== undefined && trips.length === 0 && (
          <p className="guess">{t('inbox.noTrip')}</p>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet title={t('inbox.title')} onClose={onClose}>
      <p className="guess">{t('inbox.hint')}</p>

      {items?.map((item) => (
        <div className="inboxrow" key={item.id}>
          <button type="button" className="what" onClick={() => void openLink(item.url)}>
            <span className="name">{inboxLabel(item)}</span>
            <span className="url">{item.url}</span>
          </button>

          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              here ? void place(item, here.tripId, here.dayIndex) : setChoosing(item)
            }
          >
            {here ? t('inbox.placeHere', { n: here.dayIndex + 1 }) : t('inbox.place')}
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

      {items !== undefined && items.length === 0 && <p className="guess">{t('inbox.empty')}</p>}

      {/* 旅の中からは他の旅を選べない。行き先を間違えたときの逃げ道を書いておく */}
      {here && items !== undefined && items.length > 0 && (
        <p className="guess">{t('inbox.otherTrip')}</p>
      )}
    </Sheet>
  );

  /** 予定にして、インボックスから外す。名前は題名、URL はリンクとして入る */
  async function place(item: InboxItem, tripId: string, dayIndex = 0) {
    const event = await addEvent(tripId, dayIndex, inboxLabel(item));
    await updateEvent(event.id, { links: [{ url: item.url, label: guessLinkLabel(item.url) }] });
    await removeFromInbox(item.id);
    setChoosing(null);

    /*
     * 空になったら閉じる。**開いたままにすると「何も届いていません」という
     * 空の画面が残り、後ろの操作も塞ぐ**(実際に踏んだ)。
     * まだ残っているときは開けたままにして、続けて配置できるようにする。
     */
    if ((await listInbox()).length === 0) onClose();
  }
}
