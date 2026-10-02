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
    // 一度縮めてから測らないと、行を消したときに縮まない
    el.style.height = 'auto';
    // box-sizing: border-box なので枠線のぶんを足す
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + border}px`;
  };

  useLayoutEffect(fit);

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
