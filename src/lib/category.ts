/**
 * カテゴリと、場所名からの自動推定。
 *
 * 方針(docs/ux-design.md §4.2):
 * - 毎回13個から選ばせない。名前から推定し、外れたときだけ直させる
 * - **色は6系統だけ**。13色は人の色識別能力を超える。系統の中は絵文字の形で見分ける
 * - 色だけに頼らない(色覚特性への配慮)
 */

export const CATEGORY_FAMILIES = ['culture', 'nature', 'food', 'play', 'stay', 'move'] as const;
export type CategoryFamily = (typeof CATEGORY_FAMILIES)[number];

export const CATEGORIES = {
  castle: { family: 'culture', emoji: '🏯' },
  shrine: { family: 'culture', emoji: '⛩' },
  museum: { family: 'culture', emoji: '🖼' },
  nature: { family: 'nature', emoji: '🏞' },
  restaurant: { family: 'food', emoji: '🍜' },
  cafe: { family: 'food', emoji: '☕' },
  bar: { family: 'food', emoji: '🍶' },
  shopping: { family: 'play', emoji: '🛍' },
  activity: { family: 'play', emoji: '🎡' },
  lodging: { family: 'stay', emoji: '🛏' },
  onsen: { family: 'stay', emoji: '♨️' },
  transit: { family: 'move', emoji: '🚉' },
  other: { family: 'move', emoji: '📍' },
} as const satisfies Record<string, { family: CategoryFamily; emoji: string }>;

export type CategoryId = keyof typeof CATEGORIES;

export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

/**
 * メモタブの2つの見出し。**場所か、体験・用事か**で分ける(ユーザー判断 2026-10-02)。
 * 「景福宮」「広蔵市場」は行きたいところ、「コスメを買う」「両替する」はやりたいこと。
 *
 * **カテゴリだけでは分けない。** 推定が当たらない固有名詞は「その他」になり、
 * 市場は「ショッピング」になる ── カテゴリで分けると、行きたい場所が
 * やりたいことへ落ちた(実際に試して落ちた)。だから先に**名前の形**を見る:
 * 「〜を〜」「〜する」「〜を買う」のような動作ならやりたいこと。
 * それ以外は場所とみなし、体験(アクティビティ)だけはやりたいことに寄せる。
 */
const ACTION =
  /を|(する|しよう|したい|買う|食べる|食べたい|食べ歩き|飲む|見る|観る|行く|乗る|撮る|泊まる|会う|予約|両替|購入|申請|申込|確認|準備|手配|体験|散策|散歩|観戦|鑑賞|作り)$/;

export type IdeaGroup = 'place' | 'todo';

export function ideaGroupOf(event: { name: string; category: CategoryId; ideaGroup?: IdeaGroup }): IdeaGroup {
  // 手で決めたものが最優先(推定は外れるので、直す道を残す)
  if (event.ideaGroup) return event.ideaGroup;
  if (ACTION.test(event.name.trim())) return 'todo';
  return event.category === 'activity' ? 'todo' : 'place';
}

/** アイコン(カテゴリ)の順。カテゴリ選択の並びと同じ */
export function categoryRank(id: CategoryId): number {
  return CATEGORY_IDS.indexOf(id);
}

export function familyOf(id: CategoryId): CategoryFamily {
  return CATEGORIES[id].family;
}

export function emojiOf(id: CategoryId): string {
  return CATEGORIES[id].emoji;
}

/**
 * 推定ルール。**上から順に評価し、最初に当たったものを採る**ので並び順が仕様。
 *
 * 意図的な順序:
 * - 温泉を城より先に置く(「城崎温泉」を城と誤判定しないため)
 * - 宿は「ホテル・旅館」など具体語のみ。裸の「宿」を入れると「新宿」を宿と判定してしまう
 * - 寺社の「宮」も裸では使わない(「大宮」駅を寺社にしてしまう)
 *
 * 外れても1タップで直せる前提の推定であり、完璧を目指さない。
 */
const RULES: ReadonlyArray<{ test: RegExp; id: CategoryId }> = [
  { test: /温泉|銭湯|の湯$|湯めぐり|サウナ|スパ$|onsen|hot ?spring/i, id: 'onsen' },
  {
    test: /ホテル|旅館|民宿|ペンション|ゲストハウス|ドミトリー|旅籠|チェックイン|チェックアウト|hotel|ryokan|hostel|guest ?house|inn$|check[- ]?(in|out)/i,
    id: 'lodging',
  },
  { test: /城$|城跡|城址|天守|櫓$|castle/i, id: 'castle' },
  {
    test: /寺$|寺院|大仏|神社|神宮|東照宮|八幡宮|天満宮|稲荷|大社|参道|temple|shrine/i,
    id: 'shrine',
  },
  /*
   * 宮殿(景福宮・昌徳宮など)。**寺社のあとに置く** ── 神宮・天満宮を先に寺社で拾うため。
   * 「大宮」「宇都宮」は駅・街なので除く(寺社の注記と同じ理由)
   */
  { test: /宮殿|王宮|(?<![大都])宮$|palace/i, id: 'castle' },
  {
    test: /美術館|博物館|記念館|資料館|ギャラリー|科学館|水族館|動物園|museum|gallery|aquarium|zoo/i,
    id: 'museum',
  },
  {
    test: /公園|庭園|展望|渓谷|峠$|岬$|滝$|湖$|海岸|砂丘|森林|並木|竹林|park|garden|view ?point|falls?$|lake$|beach/i,
    id: 'nature',
  },
  {
    test: /カフェ|珈琲|コーヒー|喫茶|パフェ|スイーツ|ケーキ|パン屋|ベーカリー|cafe|café|coffee|bakery|dessert/i,
    id: 'cafe',
  },
  {
    test: /居酒屋|バー$|酒場|立ち飲み|ビアホール|ワイン|日本酒|クラフトビール|izakaya|\bbar$|pub$|brewery/i,
    id: 'bar',
  },
  {
    test: /ラーメン|食堂|寿司|鮨|焼肉|焼鳥|そば|うどん|カレー|定食|レストラン|ランチ|ディナー|朝食|昼食|夕食|restaurant|ramen|sushi|lunch|dinner|breakfast/i,
    id: 'restaurant',
  },
  {
    test: /商店街|市場|モール|百貨店|デパート|アウトレット|土産|物産|ドンキ|免税|コスメ|化粧品|market|mall|shopping|outlet|souvenir/i,
    id: 'shopping',
  },
  {
    test: /遊園地|テーマパーク|クルーズ|遊覧|体験|工房|ライブ|ツアー|レンタサイクル|スキー|ダイビング|cruise|tour$|workshop|experience|theme ?park/i,
    id: 'activity',
  },
  {
    test: /駅$|空港|港$|バスターミナル|インターチェンジ|新幹線|特急|フェリー|レンタカー|移動|出発|到着|station$|airport|ferry|terminal|depart|arriv/i,
    id: 'transit',
  },
];

/**
 * 場所名からカテゴリを推定する。当たらなければ 'other'。
 * 呼び出し側は結果を「推定」として扱い、ユーザーが直したら
 * `categoryLocked` を立てて二度と推定し直さないこと。
 */
export function guessCategory(name: string): CategoryId {
  const text = name.trim();
  if (text.length === 0) return 'other';
  for (const rule of RULES) {
    if (rule.test.test(text)) return rule.id;
  }
  return 'other';
}
