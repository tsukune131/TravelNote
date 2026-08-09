import { useRef, useState } from 'react';
import { useI18n } from '../i18n/context';
import { linkLabelKey } from '../i18n/keys';
import { guessLinkLabel } from '../lib/maps';
import { normalizeUrl, openLink } from '../lib/openExternal';
import type { EventLink } from '../db/types';

/**
 * リンクの一覧と追加。予定にも旅にも同じものを出す。
 *
 * 旅に付けるいちばんの目的は**写真アルバム**(LINE / Googleフォト)。
 * 旅が終わったあとにしおりを開いて、いちばん見たいものへ行けるようにする。
 * 写真そのものは持たない ── URL を1本持つだけ。
 */
export function LinkList({
  links,
  placeholder,
  onAdd,
  onRemove,
}: {
  links: readonly EventLink[];
  placeholder: string;
  onAdd: (link: EventLink) => void;
  onRemove: (url: string) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {links.map((link) => (
        <div className="linkrow" key={link.url}>
          <span className="lbl">{t(linkLabelKey(link.label))}</span>
          <button
            type="button"
            className="url"
            style={{ textAlign: 'left' }}
            onClick={() => void openLink(link.url)}
          >
            {link.url}
          </button>
          <button
            type="button"
            className="iconbtn plain"
            aria-label={t('common.delete')}
            onClick={() => onRemove(link.url)}
          >
            ✕
          </button>
        </div>
      ))}

      <div className="row">
        <input
          ref={inputRef}
          value={draft}
          placeholder={placeholder}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          aria-label={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
        />
        {/*
          空のときは「貼り付け」、書いたら「追加」。**ボタンは1つのまま。**
          横に3つ並べると 390px では窮屈になるし、そのときに押せるのは
          どのみち片方だけ。
        */}
        {draft.trim().length === 0 ? (
          <button
            type="button"
            className="btn ghost"
            style={{ flex: '0 0 auto' }}
            onClick={() => void paste()}
          >
            {t('common.paste')}
          </button>
        ) : (
          <button type="button" className="btn ghost" style={{ flex: '0 0 auto' }} onClick={add}>
            {t('common.add')}
          </button>
        )}
      </div>
    </>
  );

  function add() {
    const url = normalizeUrl(draft);
    if (!url) return;
    onAdd({ url, label: guessLinkLabel(url) });
    setDraft('');
  }

  /**
   * クリップボードから貼る。
   *
   * **読めたら入力欄に入れるだけで、勝手に追加しない。** 何が入っていたかを
   * 目で見てから足せるようにする(クリップボードには意図しないものも入っている)。
   *
   * WKWebView で `readText()` が使えないことがある。そのときは黙って
   * 入力欄に寄せて、**OS の長押し「ペースト」に任せる** ── エラーを出しても
   * ユーザーにできることは同じなので、静かに退く。
   */
  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim().length > 0) {
        setDraft(text.trim());
        return;
      }
    } catch {
      // 読めない環境。下の focus に落ちる
    }
    inputRef.current?.focus();
  }
}
