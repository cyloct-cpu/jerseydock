'use server';

import { revalidatePath } from 'next/cache';
import { requirePerm } from '@/lib/actions';
import { audit } from '@/lib/auth';
import { loadSyncSettings, saveSyncSettings, pullCatalogSafe, type SyncSettings } from './catalog-sync';

/** 保存同步配置（settings.edit 权限；写 settings.json sync 节） */
export async function saveSyncSettingsAction(formData: FormData): Promise<void> {
  const user = await requirePerm('settings.edit');
  const patch: Partial<SyncSettings> = {
    enabled: formData.get('syncEnabled') === 'on',
    baseUrl: String(formData.get('syncBaseUrl') ?? '').trim().replace(/\/+$/, ''),
    token: String(formData.get('syncToken') ?? '').trim() || loadSyncSettings().token,
    sharedMediaDir: String(formData.get('syncSharedMediaDir') ?? '').trim() || undefined,
    intervalMinutes: Math.max(1, Number(formData.get('syncIntervalMinutes')) || 10),
  };
  saveSyncSettings(patch);
  audit(user.id, 'sync:settings', patch.baseUrl);
  revalidatePath('/sync');
}

/** 立即拉取一次（settings.edit 权限；结果写 lastResult 并回显） */
export async function runSyncAction(): Promise<void> {
  const user = await requirePerm('settings.edit');
  const r = await pullCatalogSafe();
  audit(user.id, 'sync:pull', 'error' in r ? r.error : `upsert ${r.upserted} skip ${r.skipped} del ${r.deleted}`);
  revalidatePath('/sync');
}
