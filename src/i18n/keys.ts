import type { CategoryId } from '../lib/category';
import type { LinkLabelId } from '../lib/maps';
import type { MessageKey } from './index';

/**
 * ドメインの id から文言キーを組み立てる。
 * `category.castle` のような形は型で表現しきれないので、ここに閉じ込めて
 * キャストを1か所にまとめる。
 */
export function categoryLabelKey(id: CategoryId): MessageKey {
  return `category.${id}` as MessageKey;
}

export function linkLabelKey(id: LinkLabelId): MessageKey {
  return `linkLabel.${id}` as MessageKey;
}
