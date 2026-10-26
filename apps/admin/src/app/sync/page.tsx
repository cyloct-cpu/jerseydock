import { requirePage } from '@/lib/actions';
import { loadSyncSettings, SYNC_SOURCE } from '@/lib/catalog-sync';
import { dbGetSyncCursor } from '@/lib/db-store';
import { saveSyncSettingsAction, runSyncAction } from '@/lib/sync-actions';

export const dynamic = 'force-dynamic';

/** 主站商品同步（K-S2-4）：配置 + 游标/最近结果 + 立即拉取 */
export default async function SyncPage() {
  await requirePage('/sync');
  const cfg = loadSyncSettings();
  const cursor = dbGetSyncCursor(SYNC_SOURCE);
  const last = cfg.lastResult;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="a-card a-card-pad">
        <span className="eyebrow">主站商品同步</span>
        <p style={{ marginTop: 8, fontSize: 'var(--fs-small)', color: 'var(--text-2)' }}>
          主店（jerseyshelf）是唯一上架入口；本店每 {cfg.intervalMinutes || 10} 分钟自动拉取商品资料并落库。
          <b>只同步商品资料</b>（标题/价格基准/分类/图片），订单、客户、账号、物流零共享；本店差异（价格系数/上下架/文案）保留。
        </p>
      </div>

      <form action={saveSyncSettingsAction} className="a-card a-card-pad">
        <span className="eyebrow">同步配置</span>
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-small)', cursor: 'pointer' }}>
            <input type="checkbox" name="syncEnabled" defaultChecked={cfg.enabled} />
            启用同步（关闭后定时器空转、手动拉取被拒绝，本店商品库保持当前快照继续营业）
          </label>
          <div className="field">
            <label>主站地址 baseUrl</label>
            <input className="input" name="syncBaseUrl" defaultValue={cfg.baseUrl} placeholder="https://jerseyshelf.com" />
          </div>
          <div className="field">
            <label>同步令牌 token（主站 /admin/sync 生成；留空保持原值）</label>
            <input className="input" name="syncToken" type="password" placeholder="留空则保持原值" />
          </div>
          <div className="field">
            <label>共享图库目录（两店同一物理目录；留空用开发默认 shared-media/）</label>
            <input className="input" name="syncSharedMediaDir" defaultValue={cfg.sharedMediaDir ?? ''} placeholder="/srv/media" />
          </div>
          <div className="field">
            <label>拉取间隔（分钟）</label>
            <input className="input" name="syncIntervalMinutes" type="number" min="1" defaultValue={cfg.intervalMinutes ?? 10} />
          </div>
          <div>
            <button className="btn" type="submit">保存配置</button>
          </div>
        </div>
      </form>

      <div className="a-card a-card-pad">
        <span className="eyebrow">同步状态</span>
        <div style={{ display: 'grid', gap: 6, marginTop: 12, fontSize: 'var(--fs-small)', color: 'var(--text-2)' }}>
          <div>同步游标（已消费主站 seq）：<b style={{ color: 'var(--text-1)' }}>{cursor}</b></div>
          {last ? (
            <div>
              最近拉取：<b style={{ color: last.ok ? 'var(--ok, green)' : '#d64545' }}>{last.ok ? '成功' : '失败'}</b> · {last.at} ·
              拉取 {last.fetched} / 新增更新 {last.upserted} / 未变跳过 {last.skipped} / 软删 {last.deleted} ·
              图片补拉 {last.mediaFetched} / 已有 {last.mediaSkipped} / 失败 {last.mediaFailed}
              {last.errors?.length ? <div style={{ color: '#d64545' }}>错误：{last.errors.slice(0, 5).join('；')}</div> : null}
            </div>
          ) : (
            <div>尚未执行过同步。</div>
          )}
        </div>
        <form action={runSyncAction} style={{ marginTop: 12 }}>
          <button className="btn" type="submit" disabled={!cfg.enabled}>立即同步</button>
          {!cfg.enabled && <span style={{ marginLeft: 10, fontSize: 'var(--fs-small)', color: 'var(--text-2)' }}>启用同步后可用</span>}
        </form>
      </div>
    </div>
  );
}
