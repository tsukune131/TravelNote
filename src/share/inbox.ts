import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { db, newId } from '../db/db';
import type { InboxItem } from '../db/types';

/**
 * 共有シートから届いたものを受け取る。
 *
 * ## なぜ「起動・復帰のときに読む」なのか
 *
 * 共有拡張はアプリとは**別プロセス**で、アプリの IndexedDB には書けない。
 * 書けるのは App Group で共有した入れ物だけ。そして
 * **iOS はアプリに「いま共有された」と教えてくれない。**
 * だから拾えるのは、起動したときと前面に戻ったときの2つだけになる。
 *
 * ## なぜ Preferences なのか
 *
 * 拡張(Swift)が書いた UserDefaults を JS から読む必要がある。
 * `@capacitor/preferences` は `group` を指定すると App Group の
 * UserDefaults を見にいく。**キーには `_cap_` が前置される**ので、
 * 拡張側は `_cap_inbox` に書いている(ShareViewController.swift)。
 * 片方だけ変えると静かに読めなくなる。
 */

const APP_GROUP = 'group.com.tsukune.travelnote';
const KEY = 'inbox';

/** 拡張が書いた1件の形。壊れていても落とさず、読めるものだけ拾う */
type Incoming = { url?: unknown; title?: unknown; at?: unknown };

/**
 * 共有された分を手元へ移す。**移したら向こうは空にする**(二重に取り込まない)。
 * 返り値は今回取り込んだ件数。
 */
export async function drainSharedInbox(): Promise<number> {
  if (!Capacitor.isNativePlatform()) return 0;

  try {
    /*
     * これは**プロセス全体の設定**を切り替える。
     * このアプリは他で Preferences を使っていない(設定は Dexie にある)ので
     * 副作用が無い。使い始めるときはここに注意。
     */
    await Preferences.configure({ group: APP_GROUP });
    const { value } = await Preferences.get({ key: KEY });
    if (!value) return 0;

    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      await Preferences.remove({ key: KEY });
      return 0;
    }

    const items = parsed
      .map((raw) => toItem(raw as Incoming))
      .filter((item): item is InboxItem => item !== null);

    if (items.length > 0) await db.inbox.bulkPut(items);
    // 取り込めたぶんだけ消す ── 途中で失敗したら次の起動でやり直せる
    await Preferences.remove({ key: KEY });
    return items.length;
  } catch {
    // 読めない・壊れているときは黙って何もしない。次の機会に拾える
    return 0;
  }
}

function toItem(raw: Incoming): InboxItem | null {
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (url.length === 0) return null;
  return {
    id: newId(),
    url,
    title: typeof raw.title === 'string' ? raw.title.trim() : '',
    createdAt: typeof raw.at === 'number' ? raw.at : Date.now(),
  };
}

export async function listInbox(): Promise<InboxItem[]> {
  return (await db.inbox.toArray()).sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeFromInbox(id: string): Promise<void> {
  await db.inbox.delete(id);
}

/**
 * 予定にする名前。
 * **題名が取れていればそれ、無ければドメイン名。**
 * URL をそのまま名前にすると旅程が読めなくなるので、それだけは避ける。
 */
export function inboxLabel(item: InboxItem): string {
  if (item.title.length > 0) return item.title;
  try {
    return new URL(item.url).hostname.replace(/^www\./, '');
  } catch {
    return item.url;
  }
}
