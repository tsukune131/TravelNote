/**
 * UI クロームのアイコン。
 *
 * **カテゴリの絵文字はそのまま**(色と形で6系統を見分ける設計。
 * iOS では Apple の絵文字が出るので見栄えもする)。
 * 置き換えるのは「戻る」「メニュー」「地図」などの**器のほう**だけ。
 * 絵文字だと小さい寸法でつぶれるし、OS ごとに形が変わって器としては落ち着かない。
 *
 * 外部のアイコンフォントは入れない。数が少ないので、ここに直接書くのがいちばん軽い。
 */
type Props = { size?: number; className?: string };

function svg(path: React.ReactNode, { size = 22, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}

export const IconBack = (p: Props) => svg(<path d="M15 5 8 12l7 7" />, p);

export const IconMore = (p: Props) =>
  svg(
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>,
    p,
  );

export const IconClose = (p: Props) => svg(<path d="M6 6l12 12M18 6L6 18" />, p);

/** 地図。折りたたんだ紙の地図 ── しおりの比喩に合う */
export const IconMap = (p: Props) =>
  svg(
    <>
      <path d="M9 4 3.5 6.2v13.3L9 17.3l6 2.4 5.5-2.2V4.2L15 6.4z" />
      <path d="M9 4v13.3M15 6.4v13.3" />
    </>,
    p,
  );

export const IconSettings = (p: Props) =>
  svg(
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
    </>,
    p,
  );

export const IconPlus = (p: Props) => svg(<path d="M12 5.5v13M5.5 12h13" />, p);

/** 並べ替えのつまみ。三本線 */
export const IconDrag = (p: Props) =>
  svg(<path d="M4 8h16M4 12h16M4 16h16" strokeWidth="1.6" />, p);
