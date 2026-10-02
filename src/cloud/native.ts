import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

/**
 * ネイティブの同期プラグイン(ios/App/App/CloudSync.swift)の型。
 * Capacitor プラグインは静的 import(CLAUDE.md 技術メモ)。
 */

export type CloudScope = 'private' | 'shared';

/** 旅がどのゾーンにあるか。**端末だけの欄**(同期しない) */
export type CloudLocation = {
  scope: CloudScope;
  /** ゾーンの持ち主。自分のゾーン(private)は空文字 */
  owner: string;
  zone: string;
};

export type OutgoingRecord = CloudLocation & {
  recordType: RecordType;
  recordName: string;
  /** 欄名 → JSON 文字列 */
  fields: Record<string, string>;
};

export type RecordType = 'Trip' | 'Event' | 'Member' | 'DayVariant';

export type InboundItem = CloudLocation & {
  seq: number;
  kind: 'record' | 'zoneDeleted';
  recordType?: RecordType;
  recordName?: string;
  fields?: Record<string, string>;
};

export type AccountStatus =
  | 'available'
  | 'noAccount'
  | 'restricted'
  | 'temporarilyUnavailable'
  | 'couldNotDetermine'
  | 'unknown';

export type CloudDiagnostics = {
  /** まだ送れていない記録の数 */
  pendingRecords: number;
  /** 受け取ったが Dexie にまだ入れていない数 */
  inbound: number;
  zones: number;
  lastError: string;
  lastSyncAt?: number;
};

type CloudSyncPlugin = {
  /** `reset`: CloudKit の環境(開発/本番)が変わって、同期の記憶を捨てた */
  status(): Promise<{ account: AccountStatus; error: string; environment: string; reset: boolean }>;
  diagnostics(): Promise<CloudDiagnostics>;
  enqueue(options: { items: OutgoingRecord[] }): Promise<{ accepted: number }>;
  pull(): Promise<{ items: InboundItem[] }>;
  ack(options: { upTo: number }): Promise<void>;
  syncNow(): Promise<void>;
  deleteZone(options: CloudLocation): Promise<void>;
  /** 招待を送る共有シートを出す(無ければ共有を作る) */
  share(options: { zone: string; title: string; message: string }): Promise<{ result: string }>;
  /** 参加者・共有オプション・停止。まだ共有していなければ code `noShare` で reject */
  manageShare(options: { zone: string; title: string }): Promise<{ result: string }>;
  addListener(
    event: 'changes' | 'account' | 'shareStopped' | 'shareError',
    handler: (data: Record<string, string>) => void,
  ): Promise<PluginListenerHandle>;
};

export const CloudSync = registerPlugin<CloudSyncPlugin>('CloudSync');

/** ブラウザ(開発用)では同期しない。端末の中だけで動く */
export const cloudAvailable = (): boolean => Capacitor.isNativePlatform();
