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

export const SHARE_EXT = 'tabishiori';

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
export function listenForIncomingFile(onText: (text: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  const handle = App.addListener('appUrlOpen', (event) => {
    void (async () => {
      const url = event.url;
      if (!url.includes(`.${SHARE_EXT}`)) return;
      try {
        const file = await Filesystem.readFile({
          path: decodeURI(url.replace(/^file:\/\//, '')),
          encoding: Encoding.UTF8,
        });
        onText(typeof file.data === 'string' ? file.data : await file.data.text());
      } catch {
        // 読めなければ何もしない。取り込み画面から手で選べる道が残っている
      }
    })();
  });

  return () => void handle.then((h) => h.remove());
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
    input.accept = `.${SHARE_EXT},application/json`;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      void file.text().then(resolve);
    };
    // 選ばずに閉じられた場合は何も起きない。呼び出し側は待ちっぱなしにしない作り
    input.click();
  });
}
