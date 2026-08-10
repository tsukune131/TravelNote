import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { snapshotFileName } from './snapshot';
import type { Trip } from '../db/types';

/**
 * しおりの受け渡し。**サーバーを経由しない。**
 *
 * 送る:  JSON を一時ファイルに書いて、OS の共有シートに渡す。
 *        どこへ送るか(LINE / AirDrop / メール)は使う人が選ぶ。
 * 受ける: 共有されたファイルをタップするとアプリが起動し、
 *        `appUrlOpen` でファイルの場所が届く。
 *
 * Capacitor プラグインは**静的 import**(動的importで実機が固まった前例あり)。
 * ネイティブでないときは、ブラウザで確かめられるように別の道へ落とす。
 */

/**
 * 受け取れる拡張子。**`json` が現役、`tabishiori` は過去に配ったファイル用。**
 *
 * 独自拡張子をやめた理由は snapshot.ts の `snapshotFileName` に書いた
 * (LINE が送れなかった)。**古い方を消さない** ── すでに誰かの
 * トーク履歴やファイルアプリに `.tabishiori` が残っているので、
 * それが開けなくなるほうが害が大きい。
 */
export const SHARE_EXTS = ['json', 'tabishiori'] as const;

/* ────────── 送る ────────── */

export type SendResult = 'shared' | 'downloaded' | 'cancelled';

export async function sendSnapshot(trip: Trip, text: string): Promise<SendResult> {
  const fileName = snapshotFileName(trip);

  if (!Capacitor.isNativePlatform()) return sendFromBrowser(fileName, text);

  // 一時領域に書いてから渡す。共有シートは**端末上の実ファイル**しか受け取れない
  const written = await Filesystem.writeFile({
    path: fileName,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  try {
    await Share.share({ title: trip.title, files: [written.uri] });
    return 'shared';
  } catch {
    // 共有シートを閉じただけ。失敗ではない
    return 'cancelled';
  }
}

/** ブラウザではダウンロードに落とす(検証用の道でもある) */
function sendFromBrowser(fileName: string, text: string): SendResult {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}

/* ────────── 受ける ────────── */

/**
 * 共有されたファイルからアプリが開かれたときに呼ばれる。
 *
 * iOS は受け取ったファイルを `Documents/Inbox/` に置いてから URL を渡してくる。
 * ⚠️ **この経路は実機でしか確かめられない**(ROADMAP C-5)。
 * ブラウザでは §「ファイルから読み込む」を使う。
 */
export function listenForIncomingFile(
  onText: (text: string) => void,
  onFailed: () => void,
): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  const handle = App.addListener('appUrlOpen', (event) => {
    void (async () => {
      const url = event.url;
      // 拡張子で足切りする。中身が しおり かどうかは parseSnapshot が見る
      if (!SHARE_EXTS.some((ext) => url.toLowerCase().includes(`.${ext}`))) return;

      const text = await readIncomingFile(url);
      // **読めなかったときに黙らない。** かつては catch して何もしていなかったので、
      // 「開いたのに何も起きない」が原因不明のまま残った
      if (text === null) onFailed();
      else onText(text);
    })();
  });

  return () => void handle.then((h) => h.remove());
}

/**
 * 届いたファイルを読む。
 *
 * ⚠️ **`directory` を渡さないとき、Capacitor は「完全な `file://` URI」を期待する**
 * (`FilesystemLocationResolver` → `getFileURL(atPath:withSearchPath:)`)。
 * 以前は `file://` を剥がした素のパスを渡していたので `invalidPath` で失敗し、
 * **LINE から開いても何も起きなかった**。実機で判明。
 *
 * 渡し方は端末やパスの中身(日本語のファイル名)で変わりうるので、
 * **確からしい順に試す**。1つでも読めればそれでよい。
 */
async function readIncomingFile(url: string): Promise<string | null> {
  const stripped = url.replace(/^file:\/\//, '');

  for (const path of new Set([url, decodeURI(url), stripped, decodeURI(stripped)])) {
    try {
      const file = await Filesystem.readFile({ path, encoding: Encoding.UTF8 });
      return typeof file.data === 'string' ? file.data : await file.data.text();
    } catch {
      // この渡し方では読めなかっただけ。次を試す
    }
  }
  return null;
}

/**
 * ファイルを自分で選んで読み込む。
 *
 * ブラウザでの検証手段であると同時に、**実機でも逃げ道になる**
 * ── 共有シートからの受け取りが何らかの理由で効かなくても、
 * 「ファイル」アプリから選べば取り込める。
 */
export function readFileFromPicker(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${SHARE_EXTS.map((ext) => `.${ext}`).join(',')},application/json`;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      void file.text().then(resolve);
    };
    // 選ばずに閉じられた場合は何も起きない。呼び出し側は待ちっぱなしにしない作り
    input.click();
  });
}
