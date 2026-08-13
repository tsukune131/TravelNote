import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { canProbe, cloudProbe } from '../cloud/probe';
import type { ProbeResult } from '../cloud/probe';

/**
 * CloudKit の実現可能性を実機で確かめる画面(ROADMAP E-0)。
 *
 * ## これは製品の画面ではない
 *
 * **E-0 のブランチにしか存在しない。** main には入れない ──
 * main は 1.0 の提出候補で、審査担当者に診断画面を見せる理由がない。
 * E-1 に進むときに、この画面ごと捨てる。
 *
 * ## なぜ画面にするのか
 *
 * Mac が無いので、確かめる手段は **TestFlight のビルドを実機で触ること**しかない。
 * ログを見る術も無い(解析SDKを入れない方針なので、Sentry も Crashlytics も無い)。
 * **結果を画面に出す以外に、実機で何が起きたかを知る方法が無い。**
 *
 * ボタンを1つずつ押す形にしてあるのは、落ちたときに
 * 「プラグインの配線」「entitlements」「共有そのもの」を切り分けるため。
 * まとめて走らせると、どこで落ちたのか分からない ── C-5 の
 * 「開いても何も起きない」を1日かけて追った反省。
 */
export function CloudProbe({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  return (
    <Sheet title={t('cloudProbe.title')} onClose={onClose}>
      <p className="guess">{t('cloudProbe.lead')}</p>

      {!canProbe() && <p className="guess">{t('cloudProbe.nativeOnly')}</p>}

      <div>
        <Step label={t('cloudProbe.account')} onRun={runAccount} busy={busy} />
        <Step label={t('cloudProbe.dryRun')} onRun={runDryRun} busy={busy} />
        <Step label={t('cloudProbe.createShare')} onRun={runCreateShare} busy={busy} />
        <Step label={t('cloudProbe.fetchShared')} onRun={runFetchShared} busy={busy} />
        <Step label={t('cloudProbe.pending')} onRun={runPending} busy={busy} />
        <Step label={t('cloudProbe.cleanUp')} onRun={runCleanUp} busy={busy} />
      </div>

      {/*
        共有URLは**手で送れるようにしておく。** iOS の共有シートに渡す道は
        E-2 で作るが、E-0 の時点では「URL が返ってくるか」と
        「そのリンクをタップして受諾できるか」だけ分かればいい。
      */}
      {shareUrl && (
        <div className="field">
          <label htmlFor="probe-url">{t('cloudProbe.shareUrl')}</label>
          <input id="probe-url" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
        </div>
      )}

      {lines.length > 0 && (
        <ul className="guess" style={{ paddingLeft: '1.2em' }}>
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </Sheet>
  );

  function log(line: string) {
    setLines((prev) => [...prev, line]);
  }

  /** 結果を1行にする。**code と ms を必ず出す**(それが E-0 で知りたいこと) */
  function describe(name: string, r: ProbeResult): string {
    const account = r.account ? ` [${r.account}]` : '';
    const head = `${name}: ${r.ok ? 'OK' : 'NG'} ${r.ms}ms${account}`;
    if (r.ok) return head;
    return `${head} / ${r.stage} / ${r.code ?? '-'} / ${r.error ?? ''}`;
  }

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      // **握りつぶさない。** 黙る実装は原因の特定まで丸ごと奪う(C-5 の教訓)
      log(`${name}: threw / ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function runAccount() {
    return run('account', async () => {
      const r = await cloudProbe.accountStatus();
      log(`account: ${r.status}${r.error ? ` / ${r.error}` : ''}`);
    });
  }

  function runDryRun() {
    return run('dryRun', async () => {
      log(describe('dryRun', await cloudProbe.dryRun()));
    });
  }

  function runCreateShare() {
    return run('createShare', async () => {
      const r = await cloudProbe.createShare({ title: t('cloudProbe.sampleTitle') });
      log(describe('createShare', r));
      if (r.url) setShareUrl(r.url);
    });
  }

  function runFetchShared() {
    return run('fetchShared', async () => {
      const r = await cloudProbe.fetchShared();
      log(describe('fetchShared', r));
      log(`  titles: ${(r.titles ?? []).join(', ') || '(none)'}`);
    });
  }

  function runPending() {
    return run('pending', async () => {
      const r = await cloudProbe.takePendingShare();
      log(`accepted: ${r.titles.join(', ') || '(none)'}`);
    });
  }

  function runCleanUp() {
    return run('cleanUp', async () => {
      const r = await cloudProbe.cleanUp();
      log(`cleanUp: ${r.ok ? 'OK' : `NG / ${r.error}`}`);
    });
  }
}

function Step({
  label,
  onRun,
  busy,
}: {
  label: string;
  onRun: () => Promise<void>;
  busy: boolean;
}) {
  return (
    <button type="button" className="menu-item" disabled={busy} onClick={() => void onRun()}>
      {label}
      <span className="sub">›</span>
    </button>
  );
}
