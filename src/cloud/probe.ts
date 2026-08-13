import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * CloudKit 試作プラグインの JS 側(ROADMAP E-0)。
 *
 * **製品コードではない。** 旅程は1件も触らず、専用のテスト用ゾーンだけを
 * 読み書きする。E-1 でレコード設計が決まったら丸ごと作り直す。
 *
 * ネイティブの中身と、なぜこれが要るのかは
 * `ios/App/App/CloudKitProbe.swift` に書いた。
 *
 * ⚠️ **Capacitor プラグインは静的 import**(動的importで実機が固まった前例あり)。
 * `registerPlugin` は実装を呼ばないので、この行だけでは何も起きない。
 */

/** 何が起きたか。**`code` を見て UI を決める**(文言は E-2 で本実装する) */
export type ProbeResult = {
  ok: boolean;
  /** 所要時間(ms)。課金の直前に走らせるので、待ち時間を知らずに UI を決められない */
  ms: number;
  /** どこで失敗したか: zone / write / read / share / zones / changes / done */
  stage: string;
  /**
   * 失敗の種類。`quotaExceeded`(iCloud が満杯)/ `notAuthenticated`(未サインイン)/
   * `network`(圏外)/ `permission` / `restricted` / `zoneNotFound` / `conflict`。
   * **満杯と未サインインと圏外では、言うべきことが全部違う。**
   */
  code?: string;
  error?: string;
  /** createShare のときだけ返る共有URL */
  url?: string;
  /** fetchShared のときだけ返る、共有されて見えているレコードの題名 */
  titles?: string[];
  recordName?: string;
};

export type AccountStatus = {
  /** available / noAccount / restricted / couldNotDetermine / temporarilyUnavailable / error */
  status: string;
  error?: string;
};

type CloudKitProbePlugin = {
  accountStatus(): Promise<AccountStatus>;
  dryRun(): Promise<ProbeResult>;
  createShare(options: { title: string }): Promise<ProbeResult>;
  fetchShared(): Promise<ProbeResult>;
  takePendingShare(): Promise<{ titles: string[] }>;
  cleanUp(): Promise<{ ok: boolean; error: string }>;
};

const plugin = registerPlugin<CloudKitProbePlugin>('CloudKitProbe');

/**
 * このプラットフォームで試せるか。
 *
 * **ブラウザでは何も確かめられない。** CloudKit はここだけは
 * 実機でしか見られない部分で、ROADMAP E-0 が「⚠️ ここで方針ごと止まる
 * 可能性がある」と書いているのはそのため。
 */
export const canProbe = (): boolean => Capacitor.isNativePlatform();

export const cloudProbe = plugin;
