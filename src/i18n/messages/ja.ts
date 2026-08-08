/**
 * 既定の言語。**すべてのキーはここに揃っている**のが正で、
 * 他言語はここからの差分(欠けたキーは ja にフォールバックする)。
 *
 * JSX に日本語を直書きしないこと。文言は必ずここへ。
 * 理由: docs/competitive-landscape.md §4 —
 * 共有相手の言語で表示できる道を残すため、下地だけ最初から持っておく。
 */
export const ja = {
  app: {
    name: 'たびのしおり',
  },

  welcome: {
    tagline: '友達や恋人と一緒に作って、\n旅行中に片手で見る。',
    point1: '登録も、パスワードも要りません',
    point2: '旅程はこの端末の中だけに保存されます',
    point3: '時刻は決めなくて大丈夫。あとから足せます',
    start: 'はじめる',
  },

  seed: {
    label: 'タップして骨組みから',
    depart: '出発',
    checkIn: 'チェックイン',
    checkOut: 'チェックアウト',
    breakfast: '朝食',
    lunch: '昼食',
    dinner: '夕食',
    souvenir: 'お土産',
    trainHome: '帰りの新幹線',
  },

  hint: {
    longPress: '予定を長押しすると、まとめてずらす・別の日へ移す・複製ができます',
    gotIt: 'わかった',
  },

  tripList: {
    title: '旅の一覧',
    empty: 'まだ旅がありません',
    emptyHint: '行き先と日付を決めるところから始めましょう。',
    create: '旅をつくる',
    nights: '{n}泊{m}日',
    dayTrip: '日帰り',
    upcomingIn: 'あと{n}日',
    ongoing: '旅行中',
    past: '終了',
  },

  trip: {
    dayTab: 'Day {n}',
    segmentList: 'リスト',
    segmentMap: '地図',
    menu: 'メニュー',
  },

  tripForm: {
    newTitle: '旅をつくる',
    editTitle: '旅の設定',
    name: '旅の名前',
    namePlaceholder: '京都・大阪 3泊4日',
    startDate: '出発日',
    endDate: '帰る日',
    create: 'つくる',
    rangeError: '帰る日は出発日より後にしてください',
    nameError: '名前を入れてください',
    tooLong: '旅の日数が長すぎます(最大60日)',
    deleteTrip: 'この旅を削除',
    deleteConfirm: '「{title}」を削除しますか? 中の予定もすべて消えます。',
  },

  timeline: {
    unscheduled: '時刻未定',
    noTime: '—',
    now: '今 {time}',
    gap: '{duration}の空き',
    addEvent: '予定を追加',
    empty: 'Day {n} はまだ空です',
    emptyHintFirst: 'まずは泊まる場所か、行きたい場所をひとつ入れてみましょう。',
    emptyHintLast: '帰る日。まずは帰りの列車から入れると、逆算して予定を置けます。',
    openMap: '地図で開く',
    done: '行った',
    delete: '削除',
    duplicate: '複製',
    moveToDay: '別の日へ移動',
    pinned: '固定',
  },

  connector: {
    /** 概算であることを必ず示す。経路探索APIは使わない */
    estimate: '約{duration}',
    walk: '徒歩',
    transit: '電車',
    drive: '車',
    tooTight: '間に合わない可能性',
    setTravel: '移動時間を入れる',
    title: '次までの移動',
    mode: '手段',
    minutes: 'かかる時間',
    clear: '移動を消す',
    route: '経路を地図で見る',
    gapNote: 'この区間の空きは{duration}です',
    noGap: 'どちらかの時刻が未定なので、間に合うかは判定できません',
  },

  reflow: {
    action: 'ここから後ろへずらす',
    by: '{n}分',
    ahead: '{n}分前へ',
    done: '{count}件を{n}分ずらしました',
    preview: 'これ以降の{count}件が動きます',
    nothing: 'ずらせる予定がありません',
    undo: '元に戻す',
    pinnedSkipped: '📌 固定の{n}件はそのままです',
  },

  actions: {
    title: '{name}',
    done: '行ったことにする',
    undone: '「行った」を取り消す',
    duplicate: '複製する',
    up: 'ひとつ上へ',
    down: 'ひとつ下へ',
    moveToDay: '別の日へ移す',
    reorder: '並べ替え',
    pin: '📌 固定する(ずらさない)',
    unpin: '📌 固定をやめる',
    edit: '詳しく編集',
  },

  event: {
    namePlaceholder: '場所の名前',
    nameHint: '改行で続けて追加。「9:00 二条城」と書けば時刻ごと入ります。',
    guessedCategory: '推定',
    changeCategory: 'タップで変更',
    time: '時刻',
    noTimeToggle: '時刻を決めない',
    duration: '所要時間',
    category: 'カテゴリ',
    place: '場所',
    links: 'リンク',
    addLink: 'リンクを追加',
    note: 'メモ',
    booking: '予約',
    booked: '予約済',
    partySize: '{n}名',
    bookingRef: '予約番号',
    cost: '費用',
  },

  category: {
    castle: '城・史跡',
    shrine: '寺社',
    museum: '美術・博物',
    nature: '景色・自然',
    restaurant: 'レストラン',
    cafe: 'カフェ',
    bar: '居酒屋・バー',
    shopping: 'ショッピング',
    activity: 'アクティビティ',
    lodging: '宿',
    onsen: '温泉',
    transit: '移動',
    other: 'その他',
  },

  categoryFamily: {
    culture: '文化',
    nature: '自然',
    food: '食',
    play: '買う・遊ぶ',
    stay: '泊まる・癒す',
    move: '移動・その他',
  },

  linkLabel: {
    tabelog: '食べログ',
    booking: '予約',
    official: '公式',
    photo: '写真',
    map: '地図',
    other: 'リンク',
  },

  map: {
    chooseProvider: '地図アプリを選ぶ',
    chooseProviderHint: 'あとから設定で変更できます。長押しで一回だけ別のアプリを使えます。',
    apple: 'Apple マップ',
    google: 'Google マップ',
    openDayInMap: 'この日を地図アプリで開く',
  },

  share: {
    title: '共有',
    invite: '招待リンクを送る',
    inviteHint: '登録もパスワードも要りません。リンクを開くだけで参加できます。',
    roleOwner: '作成者',
    roleEditor: '編集できる',
    roleViewer: '見るだけ',
    editing: '{name} が編集中',
    unsynced: '未同期 {n}件',
    offline: 'オフライン。変更は端末に保存され、接続時に送られます。',
    activity: '変更履歴',
    displayName: '表示名',
    displayNameDefault: 'ゲスト',
  },

  duration: {
    hm: '{h}時間{m}分',
    h: '{h}時間',
    m: '{m}分',
  },

  settings: {
    title: '設定',
    mapProvider: '地図アプリ',
    displayName: '表示名',
    privacy: 'プライバシーポリシー',
    terms: '利用規約',
    restore: '購入を復元',
    version: 'バージョン',
  },

  common: {
    save: '保存',
    cancel: 'やめる',
    delete: '削除',
    undo: '元に戻す',
    close: '閉じる',
    back: '戻る',
    settings: '設定',
    none: 'なし',
    add: '追加',
  },
} as const;
