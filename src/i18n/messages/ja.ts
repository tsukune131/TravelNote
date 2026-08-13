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
    proBanner: '✨ 友達や恋人にしおりを送るには Pro が必要です',
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
    /** 決めた日付を年つきで返す。来年の旅を今年で作ってしまわないように */
    range: '{start} 〜 {end}・{length}',
    album: '写真アルバム',
    /** LINEアルバムはリンクを作れないので案内しない(探しても見つからない) */
    albumHint: 'Googleフォトや iCloud共有アルバムのリンクを貼ると、旅の一覧から開けます。写真はこのアプリに取り込みません。',
    albumPlaceholder: 'アルバムのリンク',
    create: 'つくる',
    rangeError: '帰る日は出発日より後にしてください',
    nameError: '名前を入れてください',
    tooLong: '旅の日数が長すぎます(最大60日)',
    deleteTrip: 'この旅を削除',
    deleteConfirm: '「{title}」を削除しますか? 中の予定もすべて消えます。',
  },

  /** 準備画面(docs/ux-design.md §7.1)。旅程ではないが旅の前後で必ず要るもの */
  prepare: {
    title: '準備',
    packing: '持ち物',
    packingEmpty: 'タップして定番から。足りないものは下から足せます。',
    addItem: '持ち物を足す',
    clearChecked: 'チェックしたものを片づける',
    bookings: '予約まとめ',
    bookingsEmpty: '予定に🎫予約を付けると、ここに全部まとまります。',
    note: '旅のメモ',
    notePlaceholder: '集合場所、宿の電話番号、両替のことなど',
    template: {
      domestic: '国内',
      overseas: '海外',
      onsen: '温泉',
    },
    item: {
      wallet: '財布',
      phone: 'スマホ',
      charger: '充電器',
      battery: 'モバイルバッテリー',
      meds: '常備薬',
      clothes: '着替え',
      toiletries: '洗面用具',
      umbrella: '折りたたみ傘',
      passport: 'パスポート',
      card: 'クレジットカード',
      plug: '変換プラグ',
      esim: '海外用SIM・eSIM',
      towel: 'タオル',
      bathchange: '湯上がりの着替え',
      hairtie: 'ヘアゴム',
      skincare: '基礎化粧品',
    },
  },

  /** 共有シートから届いたもの(ROADMAP C-4) */
  inbox: {
    title: '届いたリンク',
    waiting: '届いたリンク {n}件',
    placeHere: 'Day {n} に入れる',
    otherTrip: '別の旅に入れるときは、旅の一覧から開いてください。',
    hint: '入れたい旅を選ぶと、その旅の Day 1 に予定として入ります。あとから別の日へ移せます。',
    /** 旅の中から開いたとき。入る先は「いま見ている Day」なので、そう書く */
    hintHere: '入れたい日の Day タブを開いてから押すと、その日に入ります。',
    place: '旅に入れる',
    chooseTrip: 'どの旅に入れますか?',
    noTrip: '先に旅をつくってください。',
    empty: 'いまは何も届いていません。',
  },

  timeline: {
    unscheduled: '時刻未定',
    noTime: '—',
    /** 時刻が空の行に出す。押せることが伝わる短さで */
    setTime: '＋ 時刻',
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
    bike: '自転車',
    transit: '電車',
    drive: '車',
    /** 船・ロープウェイ・送迎など。地図には手段を渡さない */
    other: 'その他',
    tooTight: '間に合わない可能性',
    setTravel: '移動時間を入れる',
    title: '次までの移動',
    mode: '手段',
    minutes: 'かかる時間',
    /** プリセット(最長90分)に無い値を入れる欄。新幹線・フェリー用 */
    freeMinutes: '自分で入れる',
    unitMinutes: '分',
    clear: '移動を消す',
    route: '経路を地図で見る',
    /** 座標が取れず正確に経路を引けないとき。名前で誤った場所へ案内しない */
    openNext: '次の場所を地図で開く',
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
    /** 入力欄の見出し。partySize は表示用の書式なので兼用できない */
    party: '人数',
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
    album: 'アルバム',
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
    title: 'しおりを共有',
    send: 'しおりを送る',
    sendHint: 'LINE や AirDrop で送れます。相手はアプリを入れるだけ。登録も支払いも要りません。',
    sendAgain: '最新のしおりを送る',
    receive: 'ファイルから取り込む',
    receiveHint: '受け取ったしおりを開きます。取り込んでも、あなたの変更は消えません。',
    unsent: '未送信の変更 {n}件',
    unsentNone: '送ったあとの変更はありません',
    neverShared: 'まだ誰にも送っていません',
    lastSharedAt: '{when} に送りました',
    displayName: '表示名',
    displayNameHint: '共有したしおりで「誰が直したか」を示すのに使います。',
    displayNameDefault: 'ゲスト',
    members: '参加している人',
    roleOwner: '作成者',
    roleEditor: '編集できる',
    downloaded: 'しおりを書き出しました',
  },

  importResult: {
    title: '取り込みました',
    nothing: '新しい変更はありませんでした',
    added: '追加 {n}件',
    updated: '変更 {n}件',
    removed: '削除 {n}件',
    conflicted: '{n}日ぶん、2つの案に分かれました',
    conflictHint: '同じ日を二人が直していました。見比べて、どちらかを採用してください。',
    newTrip: '新しい旅として取り込みました',
    failed: '取り込めませんでした',
    readFailed:
      'ファイルを読み込めませんでした。共有アプリからいったん「ファイル」に保存して、取り込み画面から選んでみてください。',
    ok: '閉じる',
  },

  variant: {
    label: '{name}の案',
    mine: 'わたしの案',
    switch: '案を切り替える',
    adopt: 'この案を採用',
    adopted: '案を1つに戻しました',
    banner: 'この日は2つの案に分かれています',
  },

  pro: {
    title: 'たびのしおり Pro',
    lead: '**送るときだけ** Pro が要ります。\n受け取る人は、登録も支払いも要りません。',
    /** 一度共有できていた旅が、無料で送れる期限を過ぎたとき */
    leadExpired:
      'この旅を**無料で送れる期間(旅の終了から60日)**が終わりました。\n旅の中身は今までどおり見られますし、直せます。',
    freeTitle: '無料でできること',
    free1: '旅をいくつでも作る・編集する',
    free2: '受け取ったしおりを開いて、直して、送り返す(旅の終了後60日まで)',
    proTitle: 'Pro でできること',
    pro1: '自分の旅を友達に送る',
    pro2: '一度送った旅は、解約しても送り続けられます(旅の終了後60日まで)',
    monthly: '1か月',
    yearly: '1年',
    restore: '購入を復元',
    terms: '利用規約',
    privacy: 'プライバシーポリシー',
    /** 自動更新であることは必ず書く(3.1.2) */
    renewNote: '自動更新です。解約はいつでも設定からできます。期間終了の24時間前までに解約しないと更新されます。',
    unavailable: 'いまは購入できません。時間をおいて試してください。',
    purchaseFailed: '購入は完了しませんでした。',
    nothingToRestore: '復元できる購入は見つかりませんでした。',
    restored: '購入を復元しました。',
    proceed: 'このまま送る',
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
    manageSubscription: 'サブスクリプションの管理',
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
    paste: '貼り付け',
  },
} as const;
