import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { FLAGS, getFlag, setFlag } from '../db/settings';

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

/** 旅一覧に**1回だけ**出すカード。「わかった」で二度と出さない */
export function ShareTipCard() {
  const { t } = useI18n();
  // 読み込むまでは出さない(出てすぐ消えるのを避ける)
  const [known, setKnown] = useState(true);

  useEffect(() => {
    void getFlag(FLAGS.knowsShareSheet).then(setKnown);
  }, []);

  if (known) return null;
  return (
    <div className="tipcard" role="note">
      <b>📮 {t('shareTip.title')}</b>
      <ShareTipBody />
      <button
        type="button"
        className="btn ghost small"
        onClick={() => {
          setKnown(true);
          void setFlag(FLAGS.knowsShareSheet);
        }}
      >
        {t('shareTip.gotIt')}
      </button>
    </div>
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
