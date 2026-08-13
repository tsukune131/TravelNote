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

/**
 * 設定。歯車。
 *
 * ⚠️ **歯は円周に必ず接させる。** 以前ここは「小さな円 + 放射状の直線8本」で、
 * 円と線のあいだが空いていた ── それは歯車ではなく**太陽(明るさ調整)の絵**で、
 * 実際に「ライトのボタンに見える」と指摘されるまで気づかれなかった。
 *
 * いまの形は6歯。根円 r=6.5 から歯先 r=10 まで、歯の側面を直線、
 * 歯と歯のあいだを根円の弧でつないだ閉じたパスにしてある。
 * 22px でも 17px でも歯が潰れないよう、歯数を減らして1枚を厚くしている。
 */
export const IconSettings = (p: Props) =>
  svg(
    <>
      <path d="M9.67 5.93L9.58 2.3A10 10 0 0 1 14.42 2.3L14.33 5.93A6.5 6.5 0 0 1 16.09 6.95L19.19 5.05A10 10 0 0 1 21.61 9.24L18.42 10.98A6.5 6.5 0 0 1 18.42 13.02L21.61 14.76A10 10 0 0 1 19.19 18.95L16.09 17.05A6.5 6.5 0 0 1 14.33 18.07L14.42 21.7A10 10 0 0 1 9.58 21.7L9.67 18.07A6.5 6.5 0 0 1 7.91 17.05L4.81 18.95A10 10 0 0 1 2.39 14.76L5.58 13.02A6.5 6.5 0 0 1 5.58 10.98L2.39 9.24A10 10 0 0 1 4.81 5.05L7.91 6.95A6.5 6.5 0 0 1 9.67 5.93Z" />
      <circle cx="12" cy="12" r="2.9" />
    </>,
    p,
  );

export const IconPlus = (p: Props) => svg(<path d="M12 5.5v13M5.5 12h13" />, p);

/** 共有。箱から出ていく矢印 */
export const IconShare = (p: Props) =>
  svg(
    <>
      <path d="M12 3.5v11" />
      <path d="M8 7.2 12 3.4l4 3.8" />
      <path d="M5 13.5v5.2a1.6 1.6 0 0 0 1.6 1.6h10.8a1.6 1.6 0 0 0 1.6-1.6v-5.2" />
    </>,
    p,
  );

/** 並べ替えのつまみ。三本線 */
export const IconDrag = (p: Props) =>
  svg(<path d="M4 8h16M4 12h16M4 16h16" strokeWidth="1.6" />, p);
