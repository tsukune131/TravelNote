import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { db, newId } from '../db/db';
import type { InboxItem } from '../db/types';

/**
 * 共有シートから届いたものを受け取る。
 *
 * ## 経路
 *
 *   拡張(別プロセス)→ App Group のファイル
 *     → SceneDelegate が起動・前面復帰で Documents へ移す
 *     → ここが読んで Dexie に入れる
 *
 * ネイティブで一段挟むのは、**JS から App Group を指す方法が無い**から。
 * `@capacitor/preferences` の `group` で読めると思っていたが、
 * **あれは group をキーの接頭辞にしか使わず、読むのは `UserDefaults.standard`**
 * だった(実装を読んで判明)。App Group は原理的に見えない。
 *
 * ⚠️ ファイル名と JSON の形は ShareViewController.swift・SharedInbox.swift と
 * 揃っている。**どれか1つだけ変えると、エラーも出ずに黙って届かなくなる。**
 */

const FILE = 'shared-inbox.json';

/** 拡張が書いた1件の形。壊れていても落とさず、読めるものだけ拾う */
type Incoming = { url?: unknown; title?: unknown; at?: unknown };

/**
 * 届いたぶんを手元へ移す。**移したらファイルは消す**(二重に取り込まない)。
 * 返り値は今回取り込んだ件数。
 */
export async function drainSharedInbox(): Promise<number> {
  if (!Capacitor.isNativePlatform()) return 0;

  let text: string;
  try {
    const file = await Filesystem.readFile({
      path: FILE,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    text = typeof file.data === 'string' ? file.data : await file.data.text();
  } catch {
    // まだ何も届いていない(ファイルが無い)。ふつうの状態
    return 0;
  }

  try {
    const parsed: unknown = JSON.parse(text);
    const items = Array.isArray(parsed)
      ? parsed.map((raw) => toItem(raw as Incoming)).filter((i): i is InboxItem => i !== null)
      : [];
    if (items.length > 0) await db.inbox.bulkPut(items);
    await Filesystem.deleteFile({ path: FILE, directory: Directory.Documents });
    return items.length;
  } catch {
    // 壊れていたら消して打ち切る。残すと毎回同じところで失敗し続ける
    await Filesystem.deleteFile({ path: FILE, directory: Directory.Documents }).catch(() => {});
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
