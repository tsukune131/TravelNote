import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';

/**
 * 「Safari や地図アプリから送れます」と、共有シートの先頭に固定する方法。
 *
 * **共有シートでのアプリの並びはアプリから指定できない**(iOS がよく使う順に並べる)。
 * できるのは、使う人に「よく使う項目」へ固定してもらうことだけなので、その手順を見せる。
 */
function ShareTipBody() {
  const { t } = useI18n();
  return (
    <>
      <p>{t('shareTip.lead')}</p>
      <p className="section-label">{t('shareTip.pinTitle')}</p>
      <ol className="steps">
        <li>{t('shareTip.pin1')}</li>
        <li>{t('shareTip.pin2')}</li>
        <li>{t('shareTip.pin3')}</li>
      </ol>
    </>
  );
}

/**
 * 旅一覧のいちばん下に置く**1行の Tips**。押すと手順が開く。
 * 一覧の上にカードで出していたが、うるさかった(ユーザー判断 2026-10-02)。
 * 小さく、ずっとそこにある形にした
 */
export function ShareTipLine() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="tipline" onClick={() => setOpen(true)}>
        💡 {t('shareTip.line')}
        {'\u00a0›'}
      </button>
      {open && <ShareTipSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** 設定から開く版。カードを閉じたあとも見直せるように */
export function ShareTipSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet title={t('shareTip.title')} onClose={onClose}>
      <ShareTipBody />
    </Sheet>
  );
}
