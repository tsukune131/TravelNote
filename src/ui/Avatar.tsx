import { defaultIcon, presetOf } from '../lib/avatar';
import type { Member, MemberIcon } from '../db/types';

/** メンバーの丸いアイコン。写真かプリセット(絵文字 + 地の色) */
export function Avatar({
  member,
  icon,
  size = 28,
}: {
  member?: Pick<Member, 'displayName' | 'icon' | 'id'>;
  /** member を持たないとき(追加画面のプレビューなど) */
  icon?: MemberIcon;
  size?: number;
}) {
  const shown = icon ?? member?.icon ?? defaultIcon(member?.id ?? '');
  const style = { width: size, height: size, fontSize: size * 0.58 };

  if (shown.kind === 'photo') {
    return (
      <img className="avatar" src={shown.dataUrl} alt={member?.displayName ?? ''} style={style} />
    );
  }
  const preset = presetOf(shown.id);
  return (
    <span
      className="avatar"
      role="img"
      aria-label={member?.displayName ?? preset.id}
      style={{ ...style, background: preset.bg }}
    >
      {preset.emoji}
    </span>
  );
}
