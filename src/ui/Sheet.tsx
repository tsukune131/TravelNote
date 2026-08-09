import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import { IconClose } from './Icon';

/**
 * いま開いているシートの枚数。
 * シートの上にシートが出る場面(移動時間 → 地図アプリの選択)があるので、
 * 真偽値ではなく数える。最後の1枚が閉じたときだけ下地を戻す。
 */
let openSheets = 0;

/**
 * 下から出るシート。詳細の編集も追加も、画面遷移させずにここで済ませる
 * (旅程を見失わないため)。
 */
export function Sheet({
  title,
  onClose,
  children,
  headerAction,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 開いているあいだは下端の追加バーを引っ込める(index.css の body.sheet-open)
  useEffect(() => {
    openSheets += 1;
    document.body.classList.add('sheet-open');
    return () => {
      openSheets -= 1;
      if (openSheets === 0) document.body.classList.remove('sheet-open');
    };
  }, []);

  /*
   * **body の直下に出す。**
   * シートは行の中からも開く(移動時間は予定と予定のあいだのボタンから)。
   * 途中の要素に transform / filter / will-change が載っていると、
   * position:fixed の基準がそこになり、シートがその行の中に閉じ込められる。
   * どこから呼ばれても画面全体を覆えるように、DOM 上は必ず外へ逃がす。
   */
  return createPortal(
    <div
      className="scrim"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
      >
        <div className="sheet-head">
          <h2>{title}</h2>
          {headerAction}
          <button type="button" className="iconbtn" onClick={onClose} aria-label={t('common.close')}>
            <IconClose />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
