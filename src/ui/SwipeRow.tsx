import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';

/**
 * 横スワイプで2つの操作を出す行。
 *
 * 右へ: 行った / 左へ: 削除(docs/ux-design.md §3.2)。
 * 済んだ予定を潰していく手応えが、旅行中にアプリを開く理由になる。
 *
 * 実装で気をつけたこと:
 * - **縦スクロールを殺さない。** 最初の数pxで縦か横かを判定し、
 *   縦だと決まったらスワイプを諦めてブラウザにスクロールを返す
 * - 長押し(アクションメニュー)と両立させるため、
 *   指が動き始めたら長押しタイマーを止める
 */
const DECIDE_PX = 8;
const TRIGGER_PX = 72;
const MAX_PX = 96;
const LONG_PRESS_MS = 480;

export function SwipeRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  onLongPress,
  rightLabel,
  leftLabel,
  disabled = false,
}: {
  children: ReactNode;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  onLongPress: () => void;
  rightLabel: string;
  leftLabel: string;
  disabled?: boolean;
}) {
  const [dx, setDx] = useState(0);
  const [sliding, setSliding] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'none' | 'x' | 'y'>('none');
  const timer = useRef<number | null>(null);

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if (disabled) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = 'none';
    setSliding(false);
    clearTimer();
    timer.current = window.setTimeout(() => {
      // 長押し。指が動いていないときだけ発火する
      if (axis.current === 'none') {
        start.current = null;
        setDx(0);
        onLongPress();
      }
    }, LONG_PRESS_MS);
  }

  function move(e: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const ddx = e.clientX - start.current.x;
    const ddy = e.clientY - start.current.y;

    if (axis.current === 'none') {
      if (Math.abs(ddx) < DECIDE_PX && Math.abs(ddy) < DECIDE_PX) return;
      clearTimer();
      // 縦のほうが大きければスワイプは諦める(スクロールを妨げない)
      axis.current = Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y';
      if (axis.current === 'y') {
        start.current = null;
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    setDx(Math.max(-MAX_PX, Math.min(MAX_PX, ddx)));
  }

  function up() {
    clearTimer();
    const moved = dx;
    start.current = null;
    axis.current = 'none';
    setSliding(true);
    setDx(0);
    if (moved >= TRIGGER_PX) onSwipeRight();
    else if (moved <= -TRIGGER_PX) onSwipeLeft();
  }

  const armedRight = dx >= TRIGGER_PX;
  const armedLeft = dx <= -TRIGGER_PX;

  return (
    <div className="swipe">
      <div className="swipe-back" aria-hidden="true">
        <span className={`swipe-act right${armedRight ? ' armed' : ''}`}>{rightLabel}</span>
        <span className={`swipe-act left${armedLeft ? ' armed' : ''}`}>{leftLabel}</span>
      </div>
      <div
        className="swipe-front"
        style={{
          transform: `translateX(${dx}px)`,
          transition: sliding ? 'transform .18s ease-out' : 'none',
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onTransitionEnd={() => setSliding(false)}
      >
        {children}
      </div>
    </div>
  );
}
