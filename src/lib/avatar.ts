import type { MemberIcon } from '../db/types';

/**
 * メンバーのアイコン。
 *
 * プリセットは**絵文字 + 地の色**。絵文字は OS が描くので画像を持たずに済み、
 * 16px でも判読できる動物の顔だけを選んだ(細かい絵柄は小さいと潰れる)。
 * 地の色は明るい画面でも暗い画面でも同じ ── 淡い色の上に絵文字を載せる形なので、
 * 暗い画面ではバッジとして浮くくらいがちょうどよい。
 */
export const AVATAR_PRESETS = [
  { id: 'bear', emoji: '🐻', bg: '#f6dcc4' },
  { id: 'cat', emoji: '🐱', bg: '#fde2b0' },
  { id: 'dog', emoji: '🐶', bg: '#e8dccf' },
  { id: 'rabbit', emoji: '🐰', bg: '#fbd3df' },
  { id: 'fox', emoji: '🦊', bg: '#ffd2bd' },
  { id: 'panda', emoji: '🐼', bg: '#dfe4ea' },
  { id: 'koala', emoji: '🐨', bg: '#d8e0f0' },
  { id: 'frog', emoji: '🐸', bg: '#d3f0d0' },
  { id: 'penguin', emoji: '🐧', bg: '#cfe6f7' },
  { id: 'tiger', emoji: '🐯', bg: '#fde6a8' },
  { id: 'chick', emoji: '🐥', bg: '#fff1a8' },
  { id: 'unicorn', emoji: '🦄', bg: '#eadcfb' },
] as const;

export type AvatarPreset = (typeof AVATAR_PRESETS)[number];

export function presetOf(id: string): AvatarPreset {
  return AVATAR_PRESETS.find((p) => p.id === id) ?? AVATAR_PRESETS[0];
}

/**
 * アイコンが決まっていない人の既定。**名前から決める**ので、
 * 同じ人はどの端末でも同じ動物になる(並びが入れ替わっても見分けがつく)。
 */
export function defaultIcon(seed: string): MemberIcon {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return { kind: 'preset', id: AVATAR_PRESETS[h % AVATAR_PRESETS.length].id };
}

/** 写真の一辺。表示は最大 56px なので、Retina の2倍で足りる */
const PHOTO_PX = 128;

/**
 * 写真を**真ん中で正方形に切り、128px の JPEG に縮める。**
 *
 * 元の写真(数MB)をそのまま持つと、旅と一緒に共有で運ぶ量が跳ね上がる。
 * 縮めれば1枚 5〜10KB。位置情報などの EXIF も、描き直すことで落ちる。
 */
export async function shrinkPhoto(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image'));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = PHOTO_PX;
    canvas.height = PHOTO_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      PHOTO_PX,
      PHOTO_PX,
    );
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}
