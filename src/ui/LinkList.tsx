import { useState } from 'react';
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
        <button
          type="button"
          className="btn ghost"
          style={{ flex: '0 0 auto' }}
          onClick={add}
          disabled={draft.trim().length === 0}
        >
          {t('common.add')}
        </button>
      </div>
    </>
  );

  function add() {
    const url = normalizeUrl(draft);
    if (!url) return;
    onAdd({ url, label: guessLinkLabel(url) });
    setDraft('');
  }
}
