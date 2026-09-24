/**
 * ベース色。**端末ごとの見た目の好み**なので、旅にもしおりのファイルにも乗せない
 * (相手の端末の色まで変えない)。
 *
 * 既定は桜色(docs/ux-design.md §8.0)。ほかは同じ組み方で色相だけ替えたもの ──
 * 文字の可読性と情報の階層は崩さない。カテゴリ色は替えない(色で6系統を見分けるため)。
 */
export const THEMES = ['pink', 'green', 'blue', 'red', 'yellow'] as const;
export type ThemeId = (typeof THEMES)[number];
export const DEFAULT_THEME: ThemeId = 'pink';

/** 設定画面の見本の色。CSS の --primary(明るい配色)と揃える */
export const THEME_SWATCH: Record<ThemeId, string> = {
  pink: '#e35d8b',
  green: '#2e9e6a',
  blue: '#3a7bd5',
  red: '#d2433f',
  yellow: '#f2b418',
};

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * `<html data-theme>` を付け替える。色の中身は index.css が持つ。
 * 既定(桜色)は属性を外す ── `:root` の素の値がそれなので。
 */
export function applyTheme(theme: ThemeId): void {
  const root = document.documentElement;
  if (theme === DEFAULT_THEME) delete root.dataset.theme;
  else root.dataset.theme = theme;
}
