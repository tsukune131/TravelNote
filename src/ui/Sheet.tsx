import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import { IconClose } from './Icon';

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

  return (
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
    </div>
  );
}
