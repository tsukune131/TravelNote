import type { DeepPartial, Messages } from '../types';

/**
 * 英語版はまだリリースしない(competitive-landscape.md §4)。
 * 「共有相手の言語で表示される」道を残すための下地として置いてある。
 *
 * 欠けたキーは ja にフォールバックするので、部分的でも壊れない。
 */
export const en: DeepPartial<Messages> = {
  app: {
    name: 'Tabi no Shiori',
  },

  welcome: {
    tagline: 'Plan it together.\nCarry it in one hand.',
    point1: 'No sign-up, no password',
    point2: 'Your itinerary stays on this device',
    point3: "Times are optional — you can fill them in later",
    start: 'Get started',
  },

  seed: {
    label: 'Tap to start from a skeleton',
    depart: 'Leave home',
    checkIn: 'Check in',
    checkOut: 'Check out',
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    souvenir: 'Souvenirs',
    trainHome: 'Train home',
  },

  hint: {
    longPress: 'Press and hold a stop to push the schedule, move it to another day, or duplicate it',
    gotIt: 'Got it',
  },

  tripList: {
    title: 'Trips',
    empty: 'No trips yet',
    emptyHint: 'Start by picking where you are going and when.',
    create: 'New trip',
    nights: '{n} nights, {m} days',
    dayTrip: 'Day trip',
    upcomingIn: 'in {n} days',
    ongoing: 'On the trip',
    past: 'Finished',
  },

  trip: {
    dayTab: 'Day {n}',
    segmentList: 'List',
    segmentMap: 'Map',
    menu: 'Menu',
  },

  tripForm: {
    newTitle: 'New trip',
    editTitle: 'Trip settings',
    name: 'Name of the trip',
    namePlaceholder: 'Kyoto & Osaka, 4 days',
    startDate: 'Leaving',
    endDate: 'Coming home',
    create: 'Create',
    rangeError: 'The return date has to come after the departure date',
    nameError: 'Give the trip a name',
    tooLong: 'That trip is too long (60 days max)',
    deleteTrip: 'Delete this trip',
    deleteConfirm: 'Delete "{title}"? Everything in it goes too.',
  },

  timeline: {
    unscheduled: 'No time set',
    noTime: '—',
    now: 'Now {time}',
    gap: '{duration} free',
    addEvent: 'Add a stop',
    empty: 'Day {n} is empty',
    emptyHintFirst: 'Add where you are staying, or one place you want to see.',
    emptyHintLast: 'Going-home day. Add the train home first, then work backwards.',
    openMap: 'Open in Maps',
    done: 'Done',
    delete: 'Delete',
    duplicate: 'Duplicate',
    moveToDay: 'Move to another day',
    pinned: 'Pinned',
  },

  connector: {
    estimate: '~{duration}',
    walk: 'Walk',
    transit: 'Train',
    drive: 'Drive',
    tooTight: 'You may not make it',
    setTravel: 'Add travel time',
    title: 'Getting to the next stop',
    mode: 'How',
    minutes: 'How long',
    clear: 'Remove travel time',
    route: 'See the route in Maps',
    gapNote: 'You have {duration} between these',
    noGap: "One of these has no time set, so we can't tell if you'll make it",
  },

  reflow: {
    action: 'Push this and everything after',
    by: '{n} min',
    ahead: '{n} min earlier',
    done: 'Moved {count} stops by {n} minutes',
    preview: '{count} stops from here will move',
    nothing: 'Nothing here to move',
    undo: 'Undo',
    pinnedSkipped: '{n} pinned stops were left alone',
  },

  actions: {
    title: '{name}',
    done: 'Mark as done',
    undone: 'Mark as not done',
    duplicate: 'Duplicate',
    up: 'Move up',
    down: 'Move down',
    moveToDay: 'Move to another day',
    pin: '📌 Pin (never reflow)',
    unpin: '📌 Unpin',
    edit: 'Edit details',
  },

  event: {
    namePlaceholder: 'Name of the place',
    nameHint: 'Press return to keep adding. Time, map and links can come later.',
    guessedCategory: 'Guessed',
    changeCategory: 'Tap to change',
    time: 'Time',
    noTimeToggle: 'No specific time',
    duration: 'How long',
    category: 'Category',
    place: 'Place',
    links: 'Links',
    addLink: 'Add a link',
    note: 'Note',
    booking: 'Booking',
    booked: 'Booked',
    partySize: '{n} people',
    bookingRef: 'Reference',
    cost: 'Cost',
  },

  category: {
    castle: 'Castle & ruins',
    shrine: 'Temple & shrine',
    museum: 'Museum & gallery',
    nature: 'Nature & views',
    restaurant: 'Restaurant',
    cafe: 'Cafe',
    bar: 'Izakaya & bar',
    shopping: 'Shopping',
    activity: 'Activity',
    lodging: 'Stay',
    onsen: 'Onsen',
    transit: 'Transit',
    other: 'Other',
  },

  categoryFamily: {
    culture: 'Culture',
    nature: 'Nature',
    food: 'Food',
    play: 'Shop & play',
    stay: 'Stay & soak',
    move: 'Transit & other',
  },

  linkLabel: {
    tabelog: 'Tabelog',
    booking: 'Booking',
    official: 'Official',
    photo: 'Photos',
    map: 'Map',
    other: 'Link',
  },

  map: {
    chooseProvider: 'Choose a maps app',
    chooseProviderHint: 'You can change this later in Settings. Long-press to use the other one just once.',
    apple: 'Apple Maps',
    google: 'Google Maps',
    openDayInMap: 'Open this day in Maps',
  },

  share: {
    title: 'Share',
    invite: 'Send an invite link',
    inviteHint: 'No sign-up, no password. Opening the link is enough to join.',
    roleOwner: 'Owner',
    roleEditor: 'Can edit',
    roleViewer: 'Can view',
    editing: '{name} is editing',
    unsynced: '{n} not synced',
    offline: 'Offline. Your changes are saved here and sent when you reconnect.',
    activity: 'Activity',
    displayName: 'Display name',
    displayNameDefault: 'Guest',
  },

  duration: {
    hm: '{h}h {m}m',
    h: '{h}h',
    m: '{m}m',
  },

  settings: {
    title: 'Settings',
    mapProvider: 'Maps app',
    displayName: 'Display name',
    privacy: 'Privacy Policy',
    terms: 'Terms of Use',
    restore: 'Restore Purchases',
    version: 'Version',
  },

  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    undo: 'Undo',
    close: 'Close',
    back: 'Back',
    settings: 'Settings',
    none: 'None',
    add: 'Add',
  },
};
