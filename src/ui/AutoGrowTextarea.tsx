import { useLayoutEffect, useRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

/**
 * 行が増えるぶんだけ縦に伸びる textarea。
 * 高さ固定だと3行ほどしか見えず、長いメモを中でスクロールさせることになっていた。
 * `field-sizing: content` は iOS の対応版が揃わないので、scrollHeight で合わせる。
 */
export function AutoGrowTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = () => {
    const el = ref.current;
    if (!el) return;
    /*
     * 一度縮めてから測らないと、行を消したときに縮まない。ただし**縮めた一瞬に
     * スクロールの位置が押し戻され、書いている欄が跳ねる**(実機で「メモ欄が動く」)。
     * 包んでいるスクロール領域の位置を覚えておいて戻す
     */
    const scroller = el.closest('.scroller');
    const top = scroller?.scrollTop;
    el.style.height = 'auto';
    // box-sizing: border-box なので枠線のぶんを足す
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + border}px`;
    if (scroller && top !== undefined) scroller.scrollTop = top;
  };

  /*
   * 測るのは**最初と、打ったときだけ。** 描き直しのたびに測ると、iCloud で
   * 誰かの変更が届くたび(打っていないときも)に欄が動いた
   */
  useLayoutEffect(fit, []);

  return (
    <textarea
      {...props}
      ref={ref}
      onInput={(e) => {
        fit();
        props.onInput?.(e);
      }}
    />
  );
}
