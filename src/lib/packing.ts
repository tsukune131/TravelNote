import type { MessageKey } from '../i18n';

/**
 * 持ち物のテンプレ。
 *
 * **空の一覧に文章だけ置いても手は動かない**(空状態のチップと同じ考え方・
 * docs/ux-design.md §2.3)。旅の種類を1タップすると骨組みが立つようにする。
 *
 * 中身は「**忘れると本当に困るもの**」に寄せてある。
 * 網羅した長い一覧は、全部にチェックを付ける作業になって使われなくなる。
 * 足りないものは自由入力で足せる。
 */
export type PackTemplateId = 'domestic' | 'overseas' | 'onsen';

export const PACK_TEMPLATES: Record<PackTemplateId, readonly string[]> = {
  domestic: ['wallet', 'phone', 'charger', 'battery', 'meds', 'clothes', 'toiletries', 'umbrella'],
  overseas: ['passport', 'wallet', 'card', 'plug', 'esim', 'charger', 'meds', 'clothes'],
  onsen: ['towel', 'bathchange', 'hairtie', 'skincare', 'meds', 'clothes'],
};

export const PACK_TEMPLATE_EMOJI: Record<PackTemplateId, string> = {
  domestic: '🧳',
  overseas: '🛂',
  onsen: '♨️',
};

export function packItemKey(id: string): MessageKey {
  return `prepare.item.${id}` as MessageKey;
}

export function packTemplateKey(id: PackTemplateId): MessageKey {
  return `prepare.template.${id}` as MessageKey;
}
