import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '../i18n/context';
import { listTrips } from '../db/repo';
import { listInbox } from '../share/inbox';
import { dayCount, diffDays, toDate, today } from '../lib/plainDate';
import type { Trip } from '../db/types';
import { TripForm } from './TripForm';
import { openLink } from '../lib/openExternal';
import { primaryLink } from '../lib/maps';
import { Settings } from './Settings';
import { JoinSheet } from './JoinSheet';
import { ShareTipLine } from './ShareTip';
import { cloudAvailable } from '../cloud/native';
import { InboxBar, InboxSheet } from './Inbox';
import { IconPlus, IconSettings } from './Icon';
import { Paywall } from './Paywall';
import { useProStatus } from '../pro/store';
import { isProActive } from '../pro/entitlement';


export function TripList({ onOpen }: { onOpen: (tripId: string, dayIndex: number) => void }) {
  const { t, date } = useI18n();
  const trips = useLiveQuery(() => listTrips(), []);
  const [creating, setCreating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [joining, setJoining] = useState(false);
  const inbox = useLiveQuery(() => listInbox(), []);
  const pro = useProStatus();
  const now = today();

  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-row">
          <h1>{t('tripList.title')}</h1>
          {/*
            ここだけラベルを添える。旅の中のトップバーと違ってボタンが1つしかなく
            場所に余裕があるし、**アプリで最初に着く画面**なので、
            歯車を読めなくても「設定」と書いてあれば分かる。
            見えている文字がボタンの名前になるので aria-label は付けない。
          */}
          <button type="button" className="iconbtn labeled" onClick={() => setShowSettings(true)}>
            <span>
              <IconSettings size={17} />
              {t('settings.title')}
            </span>
          </button>
        </div>
      </header>

      <div className="scroller">
        <div className="pad">
          {/*
            共有シートから届いたもの。**インボックスは旅ではなく端末のもの**なので、
            端末の画面であるここに置く(旅の中に出すと、旅の数だけ同じ帯が並ぶ)
          */}
          <InboxBar count={inbox?.length ?? 0} onOpen={() => setInboxOpen(true)} />

          {trips !== undefined && trips.length === 0 && (
            <div className="empty">
              <b>{t('tripList.empty')}</b>
              <p>{t('tripList.emptyHint')}</p>
              {/*
                招待された人は、まさにこの画面に着く。
                ここに参加の入口が無いと何もできない
              */}
              {cloudAvailable() && (
                <button type="button" className="seed" onClick={() => setJoining(true)}>
                  🔗 {t('join.title')}
                </button>
              )}
            </div>
          )}

          {trips?.map((trip) => {
            const album = primaryLink(trip.links);
            return (
            <div className="trip-row" key={trip.id}>
            <button
              type="button"
              className={`trip-card${album ? ' has-album' : ''}`}
              onClick={() => onOpen(trip.id, currentDayIndex(trip, now))}
            >
              <h2>{trip.title}</h2>
              <div className="trip-meta">
                {/*
                  年は**始まりの日にだけ**。来年の旅と今年の旅が並ぶので年は要るが、
                  両方に付けると「2026/8/8 – 2026/8/11」となって読む量が倍になる。
                  年をまたぐ旅(年末年始)のときだけ、終わりの日にも付ける。
                */}
                <span>
                  {date(toDate(trip.startDate), {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                  })}
                  {' – '}
                  {date(toDate(trip.endDate), {
                    ...(trip.startDate.slice(0, 4) === trip.endDate.slice(0, 4)
                      ? {}
                      : { year: 'numeric' }),
                    month: 'numeric',
                    day: 'numeric',
                  })}
                </span>
                <span>{lengthLabel(trip, t)}</span>
                <Status trip={trip} now={now} />
              </div>
            </button>

            {/*
              アルバムへは**一覧から直接**。旅を開いて設定を開いて…では、
              旅行が終わったあとに写真を見る道として遠すぎる。
              カードの中に入れ子のボタンは置けないので(button の中に button)、
              兄弟として重ねている。
            */}
            {album && (
              <button
                type="button"
                className="trip-album"
                aria-label={`${trip.title} — ${t('tripForm.album')}`}
                onClick={() => void openLink(album.url)}
              >
                📷
              </button>
            )}
            </div>
            );
          })}

          {/*
            Pro の案内(購入画面の入口の1つ。docs/ux-design.md §9.1)。
            一覧の最後に軽く出すだけで、押した人にだけ購入画面を出す。
            Pro の中身(広告なし・天気・割り振り)を、使う場面より前に知ってもらうため。
          */}
          {trips !== undefined && trips.length > 0 && !isProActive(pro, Date.now()) && (
            <button type="button" className="probanner" onClick={() => setShowPaywall(true)}>
              <span>{t('tripList.proBanner')}</span>
              <span className="sub">›</span>
            </button>
          )}

          {/* 共有シートから送る方法。一覧のいちばん下に小さく(旅が1つできてから) */}
          {trips !== undefined && trips.length > 0 && <ShareTipLine />}
        </div>
      </div>

      <div className="addbar">
        {/* 招待リンクで参加(iCloud 共有)。ブラウザ版では共有できないので出さない */}
        {trips !== undefined && trips.length > 0 && cloudAvailable() && (
          <button type="button" className="btn ghost" onClick={() => setJoining(true)}>
            🔗 {t('join.short')}
          </button>
        )}
        <button type="button" className="btn wide with-icon" onClick={() => setCreating(true)}>
          <IconPlus size={18} />
          {t('tripList.create')}
        </button>
      </div>

      {creating && (
        <TripForm
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onOpen(id, 0);
          }}
        />
      )}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {inboxOpen && <InboxSheet onClose={() => setInboxOpen(false)} />}
      {joining && (
        <JoinSheet
          onClose={() => setJoining(false)}
          onJoined={(tripId) => {
            setJoining(false);
            onOpen(tripId, 0);
          }}
        />
      )}
      {/*
        共有シートの外からの唯一の入口。ここでは「送ろうとした旅」が無いので、
        買えたあとに続ける操作が無い ── onProceed は閉じるだけでいい。
      */}
      {showPaywall && <Paywall onClose={() => setShowPaywall(false)} />}
    </div>
  );
}

function Status({ trip, now }: { trip: Trip; now: string }) {
  const { t } = useI18n();
  if (trip.startDate <= now && now <= trip.endDate) {
    return <span className="chip now">{t('tripList.ongoing')}</span>;
  }
  if (trip.endDate < now) {
    return <span className="chip">{t('tripList.past')}</span>;
  }
  const days = diffDays(now, trip.startDate);
  if (days <= 30) {
    return <span className="chip soon">{t('tripList.upcomingIn', { n: days })}</span>;
  }
  return null;
}

function lengthLabel(trip: Trip, t: ReturnType<typeof useI18n>['t']): string {
  const days = dayCount(trip.startDate, trip.endDate);
  if (days <= 1) return t('tripList.dayTrip');
  return t('tripList.nights', { n: days - 1, m: days });
}

/** 旅行中ならその日、そうでなければ Day 1 を開く */
function currentDayIndex(trip: Trip, now: string): number {
  if (trip.startDate <= now && now <= trip.endDate) return diffDays(trip.startDate, now);
  return 0;
}
