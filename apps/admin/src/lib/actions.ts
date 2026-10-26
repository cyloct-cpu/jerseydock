'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES, PRODUCTS } from '@kitvault/shared';
import { paths, readJson, writeJson, readJsonl, writeJsonl } from './store';
import {
  SESSION_COOKIE_NAME,
  can,
  createUser,
  changeOwnPassword,
  deleteUser,
  findUserByEmail,
  listUsers,
  passwordHistory,
  resetPassword,
  sessionCookieOptions,
  signSession,
  touchLogin,
  toPublicUser,
  updateUser,
  verifyPassword,
  verifySessionEdge,
  audit,
  PERM_ADMINS_MANAGE,
  type AdminRole,
  type AdminUser,
} from './auth';
import { PAGE_PERMISSIONS } from './perm-client';
import { parseProductList, toSlimProduct, validateRow } from './import-parse';
import { loginLocked, loginFail, loginOk } from './login-guard';


// ---------------- 权限守卫 ----------------

/**
 * 写操作守卫：无权限直接抛错。
 * 这是真正的防线——前端隐藏菜单可被绕过，action 内的校验不可绕过。
 */
export async function requirePerm(perm: string): Promise<AdminUser> {
  const user = await currentUser();
  if (!can(user, perm)) {
    audit(user?.id ?? null, 'perm:denied', perm);
    throw new Error(`无权执行该操作（缺少权限：${perm}）`);
  }
  return user as AdminUser;
}

/** 页面守卫：无权限跳到该账号第一个可访问页面 */
export async function requirePage(pathname: string): Promise<AdminUser | null> {
  const user = await currentUser();
  if (!user) return null;
  const need = PAGE_PERMISSIONS[pathname];
  if (need && !can(user, need)) {
    audit(user.id, 'perm:pageDenied', pathname);
    const fallback = Object.keys(PAGE_PERMISSIONS).find(p => can(user, PAGE_PERMISSIONS[p])) ?? '/dashboard';
    redirect(fallback);
  }
  return user;
}

/** owner 专属（账号管理） */
export async function requireOwner(): Promise<AdminUser> {
  return requirePerm(PERM_ADMINS_MANAGE);
}

// ---------------- 会话 ----------------

export async function login(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  // 暴力破解防护：连续失败 5 次锁定 15 分钟
  const guardKey = email.toLowerCase();
  const lockedFor = loginLocked(guardKey);
  if (lockedFor > 0) {
    return { error: `尝试次数过多，已临时锁定，请 ${Math.ceil(lockedFor / 60)} 分钟后再试` };
  }

  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    loginFail(guardKey);
    return { error: '邮箱或密码不正确 / Invalid email or password' };
  }
  loginOk(guardKey);
  touchLogin(user.id);
  audit(user.id, 'login');
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, signSession(user.id), sessionCookieOptions());
  redirect('/dashboard');
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE_NAME);
  redirect('/login');
}

export async function currentUser(): Promise<AdminUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionEdge(token);
  if (!session) return null;
  const users = readJson<{ users: Parameters<typeof toPublicUser>[0][] }>(paths.admins, { users: [] }).users;
  const u = users.find(x => x.id === session.sub);
  return u ? toPublicUser(u) : null;
}

// ---------------- 商品 ----------------

type Override = {
  status?: 'active' | 'draft' | 'archived';
  priceUsd?: number;
  comparePriceUsd?: number;
  title?: string;
  /** 删除标记：采集商品无法物理删除，标记后前台隐藏 */
  deleted?: boolean;
  description?: string;
  sizes?: string[];
  /** 分类覆盖（采集商品的 cl 不可改，落覆盖；第一序列前台归类） */
  cl?: string[];
  /** 图片列表覆盖（第一张为主图） */
  images?: string[];
};

export async function bulkProducts(formData: FormData) {
  const handles = String(formData.get('handles') || '').split(',').map(s => s.trim()).filter(Boolean);
  const action = String(formData.get('action') || '');
  if (!handles.length || !['activate', 'deactivate', 'archive'].includes(action)) return;
  // 归档删除需要 delete 权限，上下架只需 edit
  const user = await currentUser();
  const need = action === 'archive' ? 'products.delete' : 'products.edit';
  if (!can(user, need)) {
    audit(user?.id ?? null, 'perm:denied', need);
    throw new Error(`无权执行该操作（缺少权限：${need}）`);
  }
  const ov = readJson<Record<string, Override>>(paths.overrides, {});
  const status = action === 'activate' ? 'active' : action === 'deactivate' ? 'draft' : 'archived';
  for (const h of handles) {
    // 重新上架 = 恢复（清除删除标记）
    ov[h] = { ...(ov[h] || {}), status };
    if (action === 'activate') delete ov[h].deleted;
  }
  writeJson(paths.overrides, ov);
  audit(user?.id ?? null, `bulk:${action}`, `${handles.length} products`);
  revalidatePath('/products');
}

export async function updateProduct(formData: FormData) {
  const user = await requirePerm('products.edit');
  const handle = String(formData.get('handle') || '');
  const price = Number(formData.get('price') || 0);
  // compare 字段提交即生效：0 或留空 = 清除划线价
  const compareProvided = formData.get('compare') !== null;
  const compare = Number(formData.get('compare') || 0);
  const status = String(formData.get('status') || '');
  if (!handle) return;
  const ov = readJson<Record<string, Override>>(paths.overrides, {});
  ov[handle] = {
    ...(ov[handle] || {}),
    ...(price > 0 ? { priceUsd: Math.round(price * 100) / 100 } : {}),
    ...(compareProvided ? { comparePriceUsd: Math.max(0, Math.round(compare * 100) / 100) } : {}),
    ...(status ? { status: status as Override['status'] } : {}),
  };
  writeJson(paths.overrides, ov);
  audit(user.id, 'product:update', handle);
  revalidatePath('/products');
}

/** 解析尺码输入：支持逗号 / 顿号 / 斜杠 / 空格分隔 */
/** 批量价格计算：按模式返回新价格（两位小数，价格下限 0.01） */
function applyPriceMode(cur: number, mode: string, value: number): number {
  let next: number;
  switch (mode) {
    case 'set': next = value; break;
    case 'inc': next = cur + value; break;
    case 'dec': next = cur - value; break;
    case 'incPct': next = cur * (1 + value / 100); break;
    case 'decPct': next = cur * (1 - value / 100); break;
    default: return cur;
  }
  return Math.max(0.01, Math.round(next * 100) / 100);
}

/**
 * 批量改价 / 批量设置优惠（划线原价）
 * - field=price：mode = set（固定价）/ inc / dec（加减金额）/ incPct / decPct（升降百分比）
 * - field=compare：mode = set（固定原价金额）/ pct（折扣百分比，如 30 = 7 折 → 原价 = 现价 ÷ 0.7）
 * 导入商品写 imported-products.json 并重算折扣 o；采集商品写 overrides。
 */
export async function bulkPrice(formData: FormData) {
  const user = await requirePerm('products.edit');
  const handles = String(formData.get('handles') || '').split(',').map(s => s.trim()).filter(Boolean);
  const field = String(formData.get('field') || '');
  const mode = String(formData.get('mode') || '');
  const value = Number(formData.get('value') || 0);
  if (!handles.length || !Number.isFinite(value)) return;
  if (field === 'price' && !['set', 'inc', 'dec', 'incPct', 'decPct'].includes(mode)) return;
  if (field === 'compare' && !['set', 'pct'].includes(mode)) return;
  if (field === 'compare' && mode === 'pct' && (value <= 0 || value >= 100)) {
    redirect(`/products?error=${encodeURIComponent('折扣百分比需在 0–100 之间（不含 100）')}`);
  }
  if (field === 'price' && (mode === 'incPct' || mode === 'decPct') && value < 0) {
    redirect(`/products?error=${encodeURIComponent('百分比不能为负')}`);
  }

  const imported = readJson<Record<string, any>[]>(paths.imported, []);
  const byHandle = new Map(imported.map(p => [String(p.h), p]));
  const ov = readJson<Record<string, Override>>(paths.overrides, {});
  let changed = 0;

  for (const h of handles) {
    const imp = byHandle.get(h);
    const baseP = imp ? Number(imp.p) || 0 : Number(PRODUCTS.find(p => p.h === h)?.p || 0);
    const curPrice = ov[h]?.priceUsd ?? baseP;
    const curCompare = ov[h]?.comparePriceUsd ?? (imp ? Number(imp.c) || 0 : Number(PRODUCTS.find(p => p.h === h)?.c || 0));

    if (field === 'price') {
      const next = applyPriceMode(curPrice, mode, value);
      if (next === curPrice) continue;
      if (imp) {
        imp.p = next;
        imp.o = imp.c > imp.p ? Math.round((1 - imp.p / imp.c) * 100) : 0;
      } else {
        ov[h] = { ...(ov[h] || {}), priceUsd: next };
      }
      changed++;
    } else {
      // compare（划线原价）
      let next: number;
      if (mode === 'set') {
        next = Math.max(0, Math.round(value * 100) / 100);
      } else {
        if (curPrice <= 0) continue;
        next = Math.round((curPrice / (1 - value / 100)) * 100) / 100;
      }
      if (next === curCompare) continue;
      if (imp) {
        imp.c = next;
        imp.o = imp.c > imp.p ? Math.round((1 - imp.p / imp.c) * 100) : 0;
      } else {
        ov[h] = { ...(ov[h] || {}), comparePriceUsd: next };
      }
      changed++;
    }
  }

  if (changed) {
    writeJson(paths.imported, imported);
    writeJson(paths.overrides, ov);
  }
  audit(user.id, `bulk:${field === 'price' ? 'reprice' : 'promo'}`, `${changed} products (${mode} ${value})`);
  revalidatePath('/products');
  if (!changed) redirect(`/products?error=${encodeURIComponent('没有商品被修改（检查输入值）')}`);
}

/**
 * 编辑单品（CRUD 的 U）
 * - 导入商品：直接更新 imported-products.json 里的记录（全字段）
 * - 采集商品：静态数据不可改，落 overrides 覆盖（标题/价格/原价/描述/尺码/分类）+ 状态
 */
export async function editProduct(formData: FormData) {
  const user = await requirePerm('products.edit');
  const handle = String(formData.get('handle') || '');
  const source = String(formData.get('source') || '');
  if (!handle) return;

  const title = String(formData.get('title') || '').trim();
  const price = Number(formData.get('price') || 0);
  const compare = Number(formData.get('compare') || 0);
  const status = String(formData.get('status') || '');
  const description = String(formData.get('description') || '').trim().slice(0, 3000);
  const sizes = formData.getAll('sizes').map(s => String(s).trim()).filter(Boolean).slice(0, 24);
  const categories = formData.getAll('categories').map(s => String(s).trim()).filter(Boolean).slice(0, 24);

  if (price <= 0) redirect(`/products/${encodeURIComponent(handle)}/edit?error=${encodeURIComponent('售价必须大于 0')}`);
  if (compare < 0) redirect(`/products/${encodeURIComponent(handle)}/edit?error=${encodeURIComponent('原价不能为负')}`);
  if (compare > 0 && compare <= price) {
    redirect(`/products/${encodeURIComponent(handle)}/edit?error=${encodeURIComponent('原价应大于售价（用于展示划线价），不需要可留空 / 填 0')}`);
  }

  const ov = readJson<Record<string, Override>>(paths.overrides, {});
  const base = ov[handle] || {};
  if (status) base.status = status as Override['status'];
  base.deleted = false; // 编辑保存 = 恢复

  if (source === 'imported') {
    const imported = readJson<Record<string, any>[]>(paths.imported, []);
    const idx = imported.findIndex(p => String(p.h) === handle);
    if (idx < 0) redirect(`/products?error=${encodeURIComponent('商品不存在或已被删除')}`);
    const rec = imported[idx];
    if (title) rec.t = title.slice(0, 200);
    rec.p = Math.round(price * 100) / 100;
    rec.c = compare > 0 ? Math.round(compare * 100) / 100 : 0;
    // 划线价折扣百分比（展示用），与批量导入 toSlimProduct 同规则
    rec.o = rec.c > rec.p ? Math.round((1 - rec.p / rec.c) * 100) : 0;
    if (formData.get('version') !== null) rec.version = String(formData.get('version') || '').trim().slice(0, 40);
    if (formData.get('stock') !== null) rec.stock = Math.max(0, Math.round(Number(formData.get('stock') || 0)));
    rec.s = sizes;
    rec.d = description;
    if (categories.length) rec.cl = categories;
    else delete rec.cl;
    // 图片：编辑器提交的 URL 数组（第一张为主图）；至少保留一张，否则回落原图
    const images = parseImagesJson(formData.get('imagesJson'));
    if (images.length) {
      rec.i = images;
      rec.v = images[0];
    }
    imported[idx] = rec;
    writeJson(paths.imported, imported);
    audit(user.id, 'product:edit', `${handle} (imported)`);
  } else {
    // 采集商品：覆盖式编辑
    if (title) base.title = title.slice(0, 200);
    base.priceUsd = Math.round(price * 100) / 100;
    base.comparePriceUsd = compare > 0 ? Math.round(compare * 100) / 100 : 0;
    base.description = description;
    if (sizes.length) base.sizes = sizes;
    if (categories.length) base.cl = categories;
    else delete base.cl;
    const images = parseImagesJson(formData.get('imagesJson'));
    if (images.length) base.images = images;
    audit(user.id, 'product:edit', `${handle} (override)`);
  }

  writeJson(paths.overrides, ov);
  revalidatePath('/products');
  redirect(`/products?saved=${encodeURIComponent(title || handle)}`);
}

/** 删除单品（CRUD 的 D）
 * - 导入商品：从 imported-products.json 物理移除
 * - 采集商品：覆盖标记 deleted，前台隐藏；重新上架（批量上架/编辑保存）可恢复
 */
export async function deleteProduct(formData: FormData) {
  const user = await requirePerm('products.delete');
  const handle = String(formData.get('handle') || '');
  const source = String(formData.get('source') || '');
  if (!handle) return;

  if (source === 'imported') {
    const imported = readJson<Record<string, unknown>[]>(paths.imported, []);
    const next = imported.filter(p => String((p as { h: string }).h) !== handle);
    if (next.length === imported.length) {
      redirect(`/products?error=${encodeURIComponent('商品不存在或已被删除')}`);
    }
    writeJson(paths.imported, next);
    const ov = readJson<Record<string, Override>>(paths.overrides, {});
    delete ov[handle];
    writeJson(paths.overrides, ov);

    // 清理该商品的本地图片目录：仅删除「不再被任何其他商品引用」的文件
    // （本地化时共享图片会落在首次引用它的商品目录，别的商品可能跨目录引用）
    const prefix = `/assets/products/${handle}/`;
    const stillUsed = [JSON.stringify(next), fs.readFileSync(path.resolve(process.cwd(), '..', '..', 'data', 'clean', 'products.json'), 'utf8')]
      .some(t => t.includes(prefix));
    if (!stillUsed) {
      try { fs.rmSync(path.join(process.cwd(), '..', 'web', 'public', 'assets', 'products', handle), { recursive: true, force: true }); } catch {}
    }
  } else {
    const ov = readJson<Record<string, Override>>(paths.overrides, {});
    ov[handle] = { ...(ov[handle] || {}), deleted: true };
    writeJson(paths.overrides, ov);
  }

  audit(user.id, 'product:delete', handle);
  revalidatePath('/products');
  redirect(`/products?deleted=${encodeURIComponent(handle)}`);
}

// ---------------- 批量导入（N3） ----------------

const MANUAL_IMG_EXTS = /\.(jpe?g|png|webp|avif)$/i;
const MANUAL_IMG_MAX = 5 * 1024 * 1024; // 5MB（与 /api/upload 的 upload-core 保持一致）

export async function runImport(formData: FormData) {
  await requirePerm('import.run');
  const folder = String(formData.get('folder') || '').trim();
  if (!folder || folder.includes('..')) throw new Error('非法目录名');
  const dir = path.join(paths.imports, folder);
  if (!fs.existsSync(dir)) throw new Error(`目录不存在：data/imports/${folder}`);

  const csvPath = path.join(dir, 'products.csv');
  const jsonPath = path.join(dir, 'products.json');
  let text = '';
  let format: 'csv' | 'json' = 'csv';
  if (fs.existsSync(csvPath)) text = fs.readFileSync(csvPath, 'utf8');
  else if (fs.existsSync(jsonPath)) { text = fs.readFileSync(jsonPath, 'utf8'); format = 'json'; }
  else throw new Error('未找到 products.csv 或 products.json');

  const batchId = 'imp_' + Date.now().toString(36);
  const categorySlugs = new Set(CATEGORIES.map(c => c.slug));
  const rows = parseProductList(text, format);
  const validated = rows.map((r, i) =>
    validateRow(r, i, {
      categorySlugs,
      localImages: key => {
        try {
          return fs.readdirSync(path.join(dir, 'images', key)).filter(f => IMG_EXT_RE.test(f));
        } catch {
          return [];
        }
      },
      localUrlPrefix: `/imports/${batchId}`,
    })
  );

  const ok = validated.filter(r => !r.errors.length);
  const failed = validated.filter(r => r.errors.length);
  if (!ok.length) {
    redirect(`/products/import?folder=${encodeURIComponent(folder)}&error=${encodeURIComponent('没有通过校验的行，请检查清单文件')}`);
  }

  // 本地图片复制到前台 public/imports/<batchId>/<编号>/
  const webPublic = path.resolve(process.cwd(), '..', 'web', 'public', 'imports', batchId);
  for (const r of ok) {
    const key = r.batchNo || r.imageFolder;
    const src = path.join(dir, 'images', key);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.join(webPublic, key), { recursive: true });
      fs.cpSync(src, path.join(webPublic, key), { recursive: true });
    }
  }

  // 入库（按 handle 幂等 upsert；默认 draft 不上架）
  const imported = readJson<Record<string, unknown>[]>(paths.imported, []);
  const byHandle = new Map(imported.map(p => [String((p as { h: string }).h), p]));
  for (const r of ok) {
    const p = toSlimProduct(r, batchId) as unknown as Record<string, unknown>;
    const existing = byHandle.get(String(p.h));
    byHandle.set(String(p.h), existing ? { ...existing, ...p } : p);
  }
  writeJson(paths.imported, [...byHandle.values()]);

  const ov = readJson<Record<string, Override>>(paths.overrides, {});
  for (const r of ok) if (!ov[r.handle]) ov[r.handle] = { status: 'draft' };
  writeJson(paths.overrides, ov);

  const batches = readJson<Record<string, unknown>[]>(paths.importBatches, []);
  batches.unshift({
    id: batchId,
    folderName: folder,
    fileCount: 1,
    productCount: ok.length,
    status: 'imported',
    failed: failed.map(r => ({ sku: r.sku, errors: r.errors })),
    createdAt: new Date().toISOString(),
  });
  writeJson(paths.importBatches, batches);

  audit(null, 'import:run', `${folder} → ${ok.length} products (${failed.length} failed)`);
  revalidatePath('/products');
  revalidatePath('/products/import');
  redirect(`/products?imported=${ok.length}&batch=${batchId}`);
}

export async function rollbackImport(formData: FormData) {
  await requirePerm('import.rollback');
  const batchId = String(formData.get('batchId') || '');
  if (!batchId || batchId.includes('..')) return;
  const imported = readJson<Record<string, unknown>[]>(paths.imported, []);
  const removed = imported.filter(p => (p as { batchId?: string }).batchId === batchId);
  const removedHandles = new Set(removed.map(p => String((p as { h: string }).h)));
  writeJson(paths.imported, imported.filter(p => (p as { batchId?: string }).batchId !== batchId));

  const ov = readJson<Record<string, Override>>(paths.overrides, {});
  for (const h of removedHandles) delete ov[h];
  writeJson(paths.overrides, ov);

  const batches = readJson<Record<string, unknown>[]>(paths.importBatches, []).filter(b => b.id !== batchId);
  writeJson(paths.importBatches, batches);

  fs.rmSync(path.resolve(process.cwd(), '..', 'web', 'public', 'imports', batchId), { recursive: true, force: true });

  audit(null, 'import:rollback', batchId);
  revalidatePath('/products');
  revalidatePath('/products/import');
}

/** 解析图片编辑器提交的 URL 数组（JSON），最多 20 张 */
function parseImagesJson(raw: unknown): string[] {
  try {
    const arr = JSON.parse(String(raw ?? '[]'));
    if (!Array.isArray(arr)) return [];
    return arr.map((u: unknown) => String(u ?? '').trim()).filter(Boolean).slice(0, 20);
  } catch {
    return [];
  }
}

/** 保存上传的图片文件 → 前台可访问 URL 列表 */
async function saveUploadedImages(formData: FormData, batchId: string): Promise<{ urls: string[]; errors: string[] }> {
  const urls: string[] = [];
  const errors: string[] = [];
  const files = formData.getAll('images').filter((f): f is File => typeof File !== 'undefined' && f instanceof File && f.size > 0);
  if (!files.length) return { urls, errors };

  const webPublic = path.resolve(process.cwd(), '..', 'web', 'public', 'imports', batchId);
  let n = 0;
  for (const f of files) {
    const ext = path.extname(f.name).toLowerCase();
    if (!MANUAL_IMG_EXTS.test(ext)) { errors.push(`不支持的图片格式：${f.name}`); continue; }
    if (f.size > MANUAL_IMG_MAX) { errors.push(`图片超过 5MB：${f.name}`); continue; }
    n++;
    const safe = `${String(n).padStart(2, '0')}${ext}`;
    const buf = Buffer.from(await f.arrayBuffer());
    fs.mkdirSync(webPublic, { recursive: true });
    fs.writeFileSync(path.join(webPublic, safe), buf);
    urls.push(`/imports/${batchId}/${safe}`);
  }
  return { urls, errors };
}

export async function createProduct(formData: FormData) {
  await requirePerm('products.edit');
  const batchId = 'man_' + Date.now().toString(36);

  // 1) 图片：编辑器提交的 URL 数组（已含本机上传结果）
  const imageUrls = parseImagesJson(formData.get('imagesJson'));

  // 2) 组装 RawRow，复用批量导入的校验（validateRow / toSlimProduct）
  const raw = {
    sku: String(formData.get('sku') || ''),
    title: String(formData.get('title') || ''),
    season: String(formData.get('season') || ''),
    team: String(formData.get('team') || ''),
    league: String(formData.get('league') || ''),
    type: String(formData.get('type') || ''),
    version: String(formData.get('version') || ''),
    price_usd: String(formData.get('priceUsd') || ''),
    compare_price_usd: String(formData.get('comparePriceUsd') || ''),
    size_range: formData.getAll('sizes').map(s => String(s)).join(','),
    stock: String(formData.get('stock') || ''),
    description: String(formData.get('description') || ''),
    category: formData.getAll('categories').map(s => String(s)).join(','),
    image_urls: imageUrls.join(','),
  };

  const categorySlugs = new Set(CATEGORIES.map(c => c.slug));
  const row = validateRow(raw, 0, { categorySlugs, localImages: () => [], localUrlPrefix: '' });
  const errors = [...row.errors];
  if (errors.length) {
    redirect(`/products/new?error=${encodeURIComponent(errors.join('；'))}`);
  }

  // 3) 查重：SKU / handle 不得与已有商品冲突
  const imported = readJson<Record<string, unknown>[]>(paths.imported, []);
  if (imported.some(p => String((p as { sku?: string }).sku || '') === row.sku)) {
    fs.rmSync(path.resolve(process.cwd(), '..', 'web', 'public', 'imports', batchId), { recursive: true, force: true });
    redirect(`/products/new?error=${encodeURIComponent(`SKU 已存在：${row.sku}`)}`);
  }
  if (PRODUCTS.some(p => p.h === row.handle) || imported.some(p => String((p as { h: string }).h) === row.handle)) {
    fs.rmSync(path.resolve(process.cwd(), '..', 'web', 'public', 'imports', batchId), { recursive: true, force: true });
    redirect(`/products/new?error=${encodeURIComponent(`商品链接标识已存在：${row.handle}，请调整标题或 SKU`)}`);
  }

  // 4) 入库（与批量导入同一份 imported-products.json，按 handle upsert）
  const p = toSlimProduct(row, batchId) as unknown as Record<string, unknown>;
  const byHandle = new Map(imported.map(x => [String((x as { h: string }).h), x]));
  byHandle.set(String(p.h), p);
  writeJson(paths.imported, [...byHandle.values()]);

  const status = String(formData.get('status') || 'draft') === 'active' ? 'active' : 'draft';
  const ov = readJson<Record<string, Override>>(paths.overrides, {});
  ov[row.handle] = { status };
  writeJson(paths.overrides, ov);

  audit(null, 'product:create', `${row.sku} → ${row.handle} (${status})`);
  revalidatePath('/products');
  redirect(`/products?created=${encodeURIComponent(row.title)}`);
}

// ---------------- 批量导入：文件上传 ----------------

const LIST_FILE_RE = /^products\.(csv|json)$/i;
const MAX_LIST_BYTES = 5 * 1024 * 1024;   // 清单 5MB
const MAX_IMG_BYTES = 5 * 1024 * 1024;    // 单图 5MB

/** 批次文件夹名规范化：只允许字母数字 - _ */
function safeFolderName(input: string): string {
  return input
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const IMG_EXT_RE = /\.(jpe?g|png|webp|avif)$/i;
const MAX_ZIP_BYTES = 300 * 1024 * 1024;  // zip 整体上限 300MB
const MAX_TOTAL_IMAGES = 600;              // 单批图片总数上限

/** 把上传的图片写入 <batch>/images/<编号>/ 目录；返回写入数量与告警 */
async function writeImages(
  targetDir: string,
  items: { key: string; buf: Buffer; size: number; orig: string }[],
): Promise<{ ok: number; errors: string[] }> {
  const errors: string[] = [];
  let ok = 0;

  if (items.length > MAX_TOTAL_IMAGES) {
    errors.push(`本次共 ${items.length} 张图片，超过单批 ${MAX_TOTAL_IMAGES} 张上限，多余的已忽略`);
    items = items.slice(0, MAX_TOTAL_IMAGES);
  }

  for (const it of items) {
    const ext = path.extname(it.orig).toLowerCase();
    if (!IMG_EXT_RE.test(ext)) continue;              // 非图片（含清单、说明文件等）静默跳过
    if (it.size > MAX_IMG_BYTES) { errors.push(`跳过超过 5MB 的图片：${it.orig}`); continue; }

    // key 可能是 "1"（子文件夹）或 "sku"（散图以文件名当 key）
    const dirKey = safeFolderName(it.key) || 'misc';
    const imgDir = path.join(targetDir, 'images', dirKey);
    fs.mkdirSync(imgDir, { recursive: true });

    // 保留原始文件名以便自然排序；同名冲突时加序号后缀
    let dest = path.join(imgDir, it.orig);
    if (fs.existsSync(dest)) {
      const base = path.basename(it.orig, path.extname(it.orig));
      let n = 2;
      while (fs.existsSync(path.join(imgDir, `${base}-${n}${ext}`))) n++;
      dest = path.join(imgDir, `${base}-${n}${ext}`);
    }
    fs.writeFileSync(dest, it.buf);
    ok++;
  }
  return { ok, errors };
}

/** 收集表单里的散图（无目录结构）：key 取文件名（不含扩展名） */
function collectLooseImages(formData: FormData): File[] {
  return formData.getAll('images').filter((f): f is File => typeof File !== 'undefined' && f instanceof File && f.size > 0);
}

/**
 * 上传导入清单 + 图片，支持两种通道：
 *   ① 整文件夹：<input webkitdirectory>，File.webkitRelativePath 形如 "批次目录/1/1.jpg"
 *   ② zip 包：<input accept=".zip">，用 jszip 解压（防 zip slip）
 * 图片按「子文件夹名 = 清单编号」归档；无目录结构时退回「文件名 = 编号」。
 */
export async function uploadImportFile(formData: FormData) {
  await requirePerm('import.run');
  const rawName = String(formData.get('folder') || '').trim();
  const folder = safeFolderName(rawName) || `batch-${new Date().toISOString().slice(0, 10)}`;

  const listFile = formData.get('listFile');
  if (!(listFile instanceof File) || listFile.size === 0) {
    redirect(`/products/import?error=${encodeURIComponent('请选择要上传的清单文件（products.csv 或 products.json）')}`);
  }
  const listName = String(listFile.name || '');
  if (!LIST_FILE_RE.test(path.basename(listName))) {
    redirect(`/products/import?error=${encodeURIComponent(`清单文件名必须是 products.csv 或 products.json，当前为 ${listName || '空'}`)}`);
  }
  if (listFile.size > MAX_LIST_BYTES) {
    redirect(`/products/import?error=${encodeURIComponent('清单文件超过 5MB，请拆分后上传')}`);
  }

  const dir = path.join(paths.imports, folder);
  const suffix = fs.existsSync(dir) ? `-${Date.now().toString(36).slice(-4)}` : '';
  const targetDir = suffix ? `${folder}${suffix}` : folder;

  fs.mkdirSync(targetDir, { recursive: true });
  const ext = path.extname(listName).toLowerCase(); // .csv / .json / .xlsx
  if (ext === '.xlsx' || ext === '.xls') {
    // Excel 清单：解析为 RawRow[] 后转 products.json（后续管线统一走 JSON）
    const { parseExcelRows } = await import('./import-parse');
    const rows = await parseExcelRows(Buffer.from(await listFile.arrayBuffer()));
    fs.writeFileSync(path.join(targetDir, 'products.json'), JSON.stringify(rows.map(r => {
      // 展开为完整 key-value（normalizeRow 在读取时再做一次，这里预填原始 key 即可）
      return r;
    })));
  } else {
    fs.writeFileSync(path.join(targetDir, `products${ext}`), Buffer.from(await listFile.arrayBuffer()));
  }

  const warn: string[] = [];
  let imgOk = 0;

  // ---------- 通道 ①：整文件夹 ----------
  const files = formData.getAll('files').filter((f): f is File => typeof File !== 'undefined' && f instanceof File && f.size > 0);
  const withPath = files.filter(f => typeof (f as File & { webkitRelativePath?: string }).webkitRelativePath === 'string' && (f as File & { webkitRelativePath?: string }).webkitRelativePath);
  if (withPath.length) {
    const items = await Promise.all(withPath.map(async f => {
      const rel = String((f as File & { webkitRelativePath: string }).webkitRelativePath);
      // rel 形如 "根目录/1/1.jpg"，取第一层子目录作为配对键；根目录下的散文件以文件名当键
      const parts = rel.split('/').filter(Boolean);
      const key = parts.length >= 2 ? parts[parts.length - 2] : path.basename(f.name, path.extname(f.name));
      return { key, buf: Buffer.from(await f.arrayBuffer()), size: f.size, orig: path.basename(f.name) };
    }));
    const r = await writeImages(targetDir, items);
    imgOk += r.ok;
    warn.push(...r.errors);
  }

  // ---------- 通道 ②：zip 包 ----------
  const zipFile = formData.get('zipFile');
  if (zipFile instanceof File && zipFile.size > 0) {
    if (zipFile.size > MAX_ZIP_BYTES) {
      warn.push(`zip 超过 300MB，未解压：${zipFile.name}`);
    } else {
      try {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
        const items: { key: string; buf: Buffer; size: number; orig: string }[] = [];
        const entries = Object.values(zip.files).filter(f => !f.dir);
        // zip 内可能自带清单文件，一并落地（若清单还没传）
        for (const entry of entries) {
          const name = path.basename(entry.name);
          if (LIST_FILE_RE.test(name) && !fs.existsSync(path.join(targetDir, `products${path.extname(name).toLowerCase()}`))) {
            const buf = await entry.async('nodebuffer');
            fs.writeFileSync(path.join(targetDir, `products${path.extname(name).toLowerCase()}`), buf);
            continue;
          }
          if (!IMG_EXT_RE.test(name)) continue;
          const buf = await entry.async('nodebuffer');
          // zip 内可能自带一层根目录，取「文件名所在目录」作为配对键
          const parts = entry.name.replace(/\\/g, '/').split('/').filter(Boolean);
          const key = parts.length >= 2 ? parts[parts.length - 2] : path.basename(name, path.extname(name));
          items.push({ key, buf, size: buf.length, orig: name });
        }
        const r = await writeImages(targetDir, items);
        imgOk += r.ok;
        warn.push(...r.errors);
      } catch (e) {
        warn.push(`zip 解压失败：${e instanceof Error ? e.message : '未知错误'}`);
      }
    }
  }

  // ---------- 通道 ③：散图（无目录结构的老方式） ----------
  const loose = collectLooseImages(formData);
  if (loose.length) {
    const items = await Promise.all(loose.map(async f => ({
      key: path.basename(f.name, path.extname(f.name)),
      buf: Buffer.from(await f.arrayBuffer()),
      size: f.size,
      orig: path.basename(f.name),
    })));
    const r = await writeImages(targetDir, items);
    imgOk += r.ok;
    warn.push(...r.errors);
  }

  audit(null, 'import:upload', `${targetDir} (${ext}, ${imgOk} images)`);
  const warnParam = warn.length ? `&warn=${encodeURIComponent(warn.slice(0, 3).join('；'))}` : '';
  redirect(`/products/import?folder=${encodeURIComponent(targetDir)}${warnParam}`);
}

/** 删除未导入的批次文件夹（仅允许删 data/imports 下的子目录） */
export async function deleteImportFolder(formData: FormData) {
  await requirePerm('import.run');
  const folder = safeFolderName(String(formData.get('folder') || ''));
  if (!folder) return;
  const dir = path.join(paths.imports, folder);
  // 双重保险：解析后必须仍在 imports 目录内
  if (path.dirname(path.resolve(dir)) !== path.resolve(paths.imports)) return;
  fs.rmSync(dir, { recursive: true, force: true });
  audit(null, 'import:deleteFolder', folder);
  revalidatePath('/products/import');
}

// ---------------- 订单与物流（N2 / N10） ----------------

type AnyOrder = Record<string, any>;

function mutateOrder(orderNo: string, fn: (o: AnyOrder) => void): AnyOrder {
  const orders = readJsonl<AnyOrder>(paths.orders);
  const o = orders.find(x => String(x.orderNo).toUpperCase() === orderNo.toUpperCase());
  if (!o) throw new Error(`订单不存在：${orderNo}`);
  fn(o);
  writeJsonl(paths.orders, orders);
  return o;
}

export async function setOrderPayment(formData: FormData) {
  await requirePerm('orders.edit');
  const orderNo = String(formData.get('orderNo') || '');
  const status = String(formData.get('status') || '');
  if (!['pending', 'paid', 'failed', 'refunded'].includes(status)) return;
  mutateOrder(orderNo, o => { o.paymentStatus = status; });
  audit(null, 'order:payment', `${orderNo} → ${status}`);
  // 标记已支付 = 收款确认 → 入 OMS 推送队列（先付款后发货；未启用 OMS 时 worker 不消费）
  if (status === 'paid') {
    try {
      const { enqueueOmsPush } = await import('./oms');
      enqueueOmsPush(orderNo);
    } catch { /* 入队失败不阻塞标记 */ }
  }
  revalidatePath('/orders');
  revalidatePath('/shipping');
}

/** 删除订单（物理删除 orders.jsonl，支持单个/批量；不可恢复，走审计日志） */
export async function deleteOrders(formData: FormData) {
  await requirePerm('orders.edit');
  const nos = [...new Set(formData.getAll('orderNos').map(v => String(v).trim()).filter(Boolean))];
  if (!nos.length) redirect('/orders');
  const set = new Set(nos.map(n => n.toUpperCase()));
  const list = readJsonl<AnyOrder>(paths.orders);
  const kept = list.filter(o => !set.has(String(o.orderNo).toUpperCase()));
  writeJsonl(paths.orders, kept);
  audit(null, 'order:delete', nos.join(','));
  revalidatePath('/orders');
  revalidatePath('/shipping');
  redirect(`/orders?deleted=${nos.length}`);
}

export async function shipOrder(formData: FormData) {
  await requirePerm('shipping.edit');
  const orderNo = String(formData.get('orderNo') || '');
  const carrier = String(formData.get('carrier') || '').trim();
  const trackingNo = String(formData.get('trackingNo') || '').trim();
  if (!trackingNo) throw new Error('追踪号不能为空');
  mutateOrder(orderNo, o => {
    const events = Array.isArray(o.shipment?.events) ? o.shipment.events : [];
    o.shipment = {
      carrier: carrier || 'yunexpress',
      trackingNo,
      status: 'in_transit',
      events: [...events, { time: new Date().toISOString(), location: 'Origin warehouse', description: 'Parcel handed to carrier' }],
    };
    o.fulfillmentStatus = 'shipped';
    o.shippedAt = new Date().toISOString();
  });
  audit(null, 'order:ship', `${orderNo} → ${carrier} ${trackingNo}`);
  revalidatePath('/orders');
  revalidatePath('/shipping');
}

/** 批量填单号：粘贴 CSV，每行 orderNo,carrier,trackingNo */
export async function batchShip(formData: FormData) {
  await requirePerm('shipping.edit');
  const csv = String(formData.get('csv') || '');
  const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);
  let done = 0;
  const errors: string[] = [];
  for (const line of lines) {
    const [orderNo, carrier, trackingNo] = line.split(/[,;\t]/).map(s => s.trim());
    if (!orderNo || !trackingNo) { errors.push(line); continue; }
    try {
      const fd = new FormData();
      fd.set('orderNo', orderNo); fd.set('carrier', carrier || 'yunexpress'); fd.set('trackingNo', trackingNo);
      await shipOrder(fd);
      done++;
    } catch (e) {
      errors.push(`${orderNo}: ${e instanceof Error ? e.message : 'failed'}`);
    }
  }
  audit(null, 'order:batchShip', `${done} shipped, ${errors.length} failed`);
  revalidatePath('/orders');
  revalidatePath('/shipping');
  redirect(`/orders?shipped=${done}&failed=${errors.length}`);
}

export async function addShipmentEvent(formData: FormData) {
  await requirePerm('shipping.edit');
  const orderNo = String(formData.get('orderNo') || '');
  const time = String(formData.get('time') || '') || new Date().toISOString();
  const location = String(formData.get('location') || '').trim();
  const description = String(formData.get('description') || '').trim();
  if (!description) throw new Error('事件描述不能为空');
  mutateOrder(orderNo, o => {
    const events = Array.isArray(o.shipment?.events) ? o.shipment.events : [];
    o.shipment = { ...(o.shipment || { carrier: '', trackingNo: '', status: 'in_transit' }), events: [...events, { time, location, description }] };
    if (/deliver/i.test(description)) {
      o.shipment.status = 'delivered';
      o.fulfillmentStatus = 'delivered';
      o.deliveredAt = time;
    } else if (/exception|held|customs delay/i.test(description)) {
      o.shipment.status = 'exception';
      o.fulfillmentStatus = 'exception';
    } else if (o.fulfillmentStatus === 'unfulfilled' || o.fulfillmentStatus === 'packing') {
      o.fulfillmentStatus = 'in_transit';
    }
  });
  audit(null, 'shipment:event', orderNo);
  revalidatePath('/orders');
  revalidatePath('/shipping');
}

// ---------------- 回访管理（N9） ----------------

export async function saveFollowUp(formData: FormData) {
  const operator = await requirePerm('followup.edit');
  const id = String(formData.get('id') || '');
  const list = readJson<Record<string, any>[]>(paths.followups, []);
  const existing = list.find(f => f.id === id);
  const now = new Date().toISOString();
  const result = String(formData.get('result') || '').trim();
  const ownerVal = String(formData.get('owner') || '');
  const record = {
    id: id || 'fu_' + Date.now().toString(36),
    customerKey: String(formData.get('customerKey') || ''),
    email: String(formData.get('email') || ''),
    status: String(formData.get('status') || 'pending'),
    nextAt: String(formData.get('nextAt') || '') || null,
    owner: ownerVal,
    note: String(formData.get('note') || ''),
    history: [
      ...(Array.isArray(existing?.history) ? existing.history : []),
      {
        time: now,
        operator: operator.name || operator.email,
        owner: ownerVal,
        action: existing ? 'updated' : 'created',
        result,
        note: String(formData.get('note') || ''),
      },
    ].slice(-50),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const idx = list.findIndex(f => f.id === record.id);
  if (idx >= 0) list[idx] = record; else list.unshift(record);
  writeJson(paths.followups, list);
  audit(operator.id, 'followup:save', record.id);
  revalidatePath('/customers/followup');
  revalidatePath('/customers');
  revalidatePath(`/customers/followup/${record.id}`);
}

export async function deleteFollowUp(formData: FormData) {
  await requirePerm('followup.edit');
  const id = String(formData.get('id') || '');
  const list = readJson<Record<string, any>[]>(paths.followups, []).filter(f => f.id !== id);
  writeJson(paths.followups, list);
  audit(null, 'followup:delete', id);
  revalidatePath('/customers/followup');
  revalidatePath('/customers');
}

// ---------------- 设置（N7 / N8 / N12） ----------------

export async function saveSettings(formData: FormData) {
  await requirePerm('settings.edit');

  // 顶部滚动公告条
  const barItems = String(formData.get('barItems') || '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
  const barFontSize = Number(formData.get('barFontSize') || 12);

  // 客户评价（运营自定义内容）
  const reviewsEnabled = formData.get('reviewsEnabled') === 'on';
  const reviewsTitle = String(formData.get('reviewsTitle') || '').trim();
  const reviewsSubtitle = String(formData.get('reviewsSubtitle') || '').trim();
  let reviews: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(String(formData.get('reviewsJson') || '[]'));
    if (Array.isArray(parsed)) {
      reviews = parsed.slice(0, 24).map((x, i) => {
        const o = (x ?? {}) as Partial<Record<string, unknown>>;
        const rating = Number(o.rating);
        const date = String(o.date || '');
        return {
          id: String(o.id || '').trim() || `rv_${i}`,
          name: String(o.name || '').trim().slice(0, 40),
          location: String(o.location || '').trim().slice(0, 40),
          rating: Number.isFinite(rating) ? Math.min(5, Math.max(1, Math.round(rating))) : 5,
          content: String(o.content || '').trim().slice(0, 600),
          date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
          avatar: String(o.avatar || '').trim().slice(0, 500),
        };
      }).filter(x => x.content);
    }
  } catch {}

  // 实时访客数
  const visitorsBase = Number(formData.get('visitorsBase') ?? 12);
  const visitorsWindow = Number(formData.get('visitorsWindow') ?? 5);
  const clamp = (v: number, lo: number, hi: number, d: number) =>
    Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d;

  // 商品定制（前台详情页：姓名烫印 / 袖章补丁）
  let customize: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(formData.get('customizeJson') || '{}'));
    if (parsed && typeof parsed === 'object') {
      const cu = parsed as Record<string, any>;
      const nn = (cu.nameNumber ?? {}) as Record<string, unknown>;
      const ab = (cu.armband ?? {}) as Record<string, unknown>;
      const opts = Array.isArray(ab.options) ? ab.options : [];
      customize = {
        enabled: cu.enabled === true,
        nameNumber: {
          enabled: nn.enabled === true,
          price: clamp(Number(nn.price ?? 3), 0, 999, 3),
          maxLength: clamp(Number(nn.maxLength ?? 24), 1, 100, 24),
          placeholder: String(nn.placeholder ?? '').trim().slice(0, 40) || 'Ronaldo#7',
        },
        armband: {
          enabled: ab.enabled === true,
          options: opts.slice(0, 8).map((o: any) => ({
            label: String(o?.label ?? '').trim().slice(0, 40),
            price: clamp(Number(o?.price ?? 3), 0, 999, 3),
            image: String(o?.image ?? '').trim().slice(0, 500),
          })).filter((o: { label: string }) => o.label),
        },
      };
    }
  } catch {}

  // Hero 轮播（前台首页）
  let hero: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(formData.get('heroJson') || '{}'));
    if (parsed && typeof parsed === 'object') {
      const hv = parsed as Record<string, any>;
      const slides = Array.isArray(hv.slides) ? hv.slides : [];
      hero = {
        enabled: hv.enabled === true,
        intervalMs: clamp(Number(hv.intervalMs ?? 7000), 3000, 15000, 7000),
        slides: slides.slice(0, 5).map((s: any, i: number) => ({
          id: String(s?.id ?? `hero_${i}`).slice(0, 60),
          image: String(s?.image ?? '').trim().slice(0, 500),
          eyebrow: String(s?.eyebrow ?? '').trim().slice(0, 80),
          title: String(s?.title ?? '').trim().slice(0, 120),
          subtitle: String(s?.subtitle ?? '').trim().slice(0, 300),
          ctaText: String(s?.ctaText ?? '').trim().slice(0, 40),
          ctaHref: String(s?.ctaHref ?? '').trim().slice(0, 300),
          cta2Text: String(s?.cta2Text ?? '').trim().slice(0, 40),
          cta2Href: String(s?.cta2Href ?? '').trim().slice(0, 300),
        })).filter((s: { image: string; title: string }) => s.image && s.title),
      };
    }
  } catch {}

  const settings = {
    brand: {
      name: String(formData.get('brandName') || '').trim() || 'JERSEYDOCK',
      domain: String(formData.get('domain') || '').trim(),
      adminDomain: String(formData.get('adminDomain') || '').trim(),
      supportEmail: String(formData.get('supportEmail') || '').trim(),
      whatsapp: String(formData.get('whatsapp') || '').trim(),
      supportQr: String(formData.get('supportQr') || '').trim(),
    },
    announcement: String(formData.get('announcement') || '').trim(),
    // 顶部滚动公告条（前台 components/Chrome.tsx Announcement 读取）
    announcementBar: {
      enabled: formData.get('barEnabled') === 'on',
      items: barItems,
      color: String(formData.get('barColor') || '').trim(),
      bg: String(formData.get('barBg') || '').trim(),
      fontSize: clamp(barFontSize, 9, 28, 12),
    },
    // 客户评价（前台 components/ReviewsCarousel.tsx）
    reviews: {
      enabled: reviewsEnabled,
      title: reviewsTitle.slice(0, 60) || 'What our customers say',
      subtitle: reviewsSubtitle.slice(0, 120),
      reviews,
    },
    // 实时访客数（前台 components/LiveVisitors.tsx）
    visitors: {
      enabled: formData.get('visitorsEnabled') === 'on',
      baseCount: clamp(visitorsBase, 0, 999, 12),
      windowMinutes: clamp(visitorsWindow, 1, 60, 5),
      padToBase: formData.get('visitorsPad') === 'on',
    },
    // 商品定制（前台商品详情页 AddToCart.tsx；空 customizeJson 时保留原值，避免被其他表单清空）
    ...(formData.has('customizeJson')
      ? { customize }
      : (() => {
          try {
            const keep = readJson<Record<string, any>>(paths.settings, {});
            return keep?.customize ? { customize: keep.customize } : {};
          } catch { return {}; }
        })()),
    // Hero 轮播（前台首页 HeroCarousel.tsx；同上，其他表单保存时保留原值）
    ...(formData.has('heroJson')
      ? { hero }
      : (() => {
          try {
            const keep = readJson<Record<string, any>>(paths.settings, {});
            return keep?.hero ? { hero: keep.hero } : {};
          } catch { return {}; }
        })()),
    // 在线支付通道（前台结算页读取；paymentProvider 字段存在才更新，避免被定制表单等单独保存时清空）
    ...(formData.has('paymentProvider')
      ? {
          payment: {
            provider: ['stripe', 'paypal', 'worldfirst', 'xtransfer'].includes(String(formData.get('paymentProvider')))
              ? String(formData.get('paymentProvider'))
              : 'placeholder',
            stripe: {
              secretKey: String(formData.get('stripeSecretKey') || '').trim(),
              publishableKey: String(formData.get('stripePublishableKey') || '').trim(),
              webhookSecret: String(formData.get('stripeWebhookSecret') || '').trim(),
            },
            paypal: {
              clientId: String(formData.get('paypalClientId') || '').trim(),
              clientSecret: String(formData.get('paypalClientSecret') || '').trim(),
              env: String(formData.get('paypalEnv') || 'sandbox') === 'live' ? 'live' : 'sandbox',
              webhookId: String(formData.get('paypalWebhookId') || '').trim(),
            },
            worldfirst: {
              accountName: String(formData.get('wfAccountName') || '').trim(),
              accountNumber: String(formData.get('wfAccountNumber') || '').trim(),
              bankName: String(formData.get('wfBankName') || '').trim(),
              swiftCode: String(formData.get('wfSwift') || '').trim(),
              note: String(formData.get('wfNote') || '').trim(),
            },
            xtransfer: {
              accountName: String(formData.get('wfAccountName') || '').trim(),
              accountNumber: String(formData.get('wfAccountNumber') || '').trim(),
              bankName: String(formData.get('wfBankName') || '').trim(),
              swiftCode: String(formData.get('wfSwift') || '').trim(),
              note: String(formData.get('wfNote') || '').trim(),
            },
          },
        }
      : (() => {
          try {
            const keep = readJson<Record<string, any>>(paths.settings, {});
            return keep?.payment ? { payment: keep.payment } : {};
          } catch { return {}; }
        })()),
    // 以图搜款 · 视觉 API keys（CLIP 无置信结果时兜底；字段缺席保留原值）
    ...(formData.has('visionKeys')
      ? { visionApi: { keys: String(formData.get('visionKeys') || '').trim().slice(0, 4000) } }
      : (() => {
          try {
            const keep = readJson<Record<string, any>>(paths.settings, {});
            return keep?.visionApi ? { visionApi: keep.visionApi } : {};
          } catch { return {}; }
        })()),
    // 支付区提示文案（仅占位通道前台展示；字段缺席时保留原值）
    paymentPlaceholder: formData.has('paymentPlaceholder')
      ? String(formData.get('paymentPlaceholder') || 'Online payment — coming soon')
      : (() => {
          try {
            const keep = readJson<Record<string, any>>(paths.settings, {});
            return typeof keep?.paymentPlaceholder === 'string' ? keep.paymentPlaceholder : 'Online payment — coming soon';
          } catch { return 'Online payment — coming soon'; }
        })(),
    updatedAt: new Date().toISOString(),
  };
  // 兜底合并：本表单不管理的节点（sync / oms / 未来新增）原样保留。
  // 曾发生：设置页整表单提交把 settings.json 里的 sync 节点整个吃掉
  // （sharedMediaDir 丢失 → /media 全站 404、同步 worker 停摆）。
  const MANAGED = new Set(['brand', 'announcement', 'announcementBar', 'reviews', 'visitors', 'customize', 'hero', 'payment', 'visionApi', 'paymentPlaceholder', 'updatedAt']);
  let prevSettings: Record<string, unknown> = {};
  try { prevSettings = readJson<Record<string, unknown>>(paths.settings, {}) || {}; } catch { /* 文件不存在则跳过 */ }
  for (const [k, v] of Object.entries(prevSettings)) {
    if (!MANAGED.has(k) && settings[k] === undefined) settings[k] = v;
  }
  writeJson(paths.settings, settings);
  audit(null, 'settings:save');
  revalidatePath('/settings');
}

// ---------------- 账号管理（owner 专属） ----------------

export async function createAdminUser(formData: FormData) {
  const me = await requireOwner();
  const email = String(formData.get('email') || '').trim();
  const name = String(formData.get('name') || '').trim();
  const password = String(formData.get('password') || '');
  const isOwner = formData.get('isOwner') === 'on';
  const role: AdminRole = isOwner ? 'owner' : 'operator';
  const roleName = String(formData.get('roleName') || '').trim();
  const permissions = formData.getAll('permissions').map(String);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(`/admins?error=${encodeURIComponent('邮箱格式不正确')}`);
  }
  if (password.length < 8) {
    redirect(`/admins?error=${encodeURIComponent('初始密码至少 8 位')}`);
  }

  try {
    const u = createUser({ email, name, role, roleName, password, permissions });
    audit(me.id, 'admin:create', u.id, { email, role, roleName: u.roleName, permissions: u.permissions });
  } catch (e) {
    redirect(`/admins?error=${encodeURIComponent(e instanceof Error ? e.message : '创建失败')}`);
  }
  revalidatePath('/admins');
  redirect(`/admins?created=${encodeURIComponent(email)}`);
}

export async function updateAdminUser(formData: FormData) {
  const me = await requireOwner();
  const id = String(formData.get('id') || '');
  const name = String(formData.get('name') || '');
  const isOwner = formData.get('isOwner') === 'on';
  const role: AdminRole = isOwner ? 'owner' : 'operator';
  const roleName = String(formData.get('roleName') || '').trim();
  const permissions = formData.getAll('permissions').map(String);
  try {
    updateUser(id, { name, role, roleName, permissions });
    audit(me.id, 'admin:update', id, { role, roleName, permissions });
  } catch (e) {
    redirect(`/admins?error=${encodeURIComponent(e instanceof Error ? e.message : '更新失败')}`);
  }
  revalidatePath('/admins');
  redirect(`/admins?saved=1`);
}

/** 重置密码：设置新密码而非展示旧密码（哈希不可逆），账号 ID 与权限全部保留 */
export async function resetAdminPassword(formData: FormData) {
  const me = await requireOwner();
  const id = String(formData.get('id') || '');
  const password = String(formData.get('password') || '');
  if (password.length < 8) {
    redirect(`/admins?error=${encodeURIComponent('新密码至少 8 位')}`);
  }
  const ok = resetPassword(id, password);
  if (!ok) redirect(`/admins?error=${encodeURIComponent('账号不存在')}`);
  audit(me.id, 'password:reset', id);
  revalidatePath('/admins');
  redirect(`/admins?reset=1`);
}

export async function deleteAdminUser(formData: FormData) {
  const me = await requireOwner();
  const id = String(formData.get('id') || '');
  try {
    deleteUser(id, me.id);
    audit(me.id, 'admin:delete', id);
  } catch (e) {
    redirect(`/admins?error=${encodeURIComponent(e instanceof Error ? e.message : '删除失败')}`);
  }
  revalidatePath('/admins');
  redirect(`/admins?deleted=1`);
}

/** 自助改密码：必须验证原密码 */
export async function changePassword(formData: FormData) {
  const me = await currentUser();
  if (!me) redirect('/login');
  const oldPassword = String(formData.get('oldPassword') || '');
  const newPassword = String(formData.get('newPassword') || '');
  const confirm = String(formData.get('confirmPassword') || '');
  if (newPassword !== confirm) {
    redirect(`/admins?error=${encodeURIComponent('两次输入的新密码不一致')}`);
  }
  const r = changeOwnPassword(me.id, oldPassword, newPassword);
  if (!r.ok) {
    audit(me.id, 'password:changeFailed', me.email);
    redirect(`/admins?error=${encodeURIComponent(r.error || '修改失败')}`);
  }
  audit(me.id, 'password:selfChange', me.email);
  revalidatePath('/admins');
  redirect(`/admins?passwordChanged=1`);
}

export { listUsers, passwordHistory };

// ---------------- OMS 代发（COD 代收 / 推送 / 回款确认） ----------------

/** 标记 COD 回款：服务商结算核对后确认到账（写 codConfirmedAt + paymentStatus=paid + 轨迹事件） */
export async function setCodCollected(formData: FormData) {
  await requirePerm('shipping.edit');
  const orderNo = String(formData.get('orderNo') || '');
  const now = new Date().toISOString();
  mutateOrder(orderNo, o => {
    o.codConfirmedAt = now;
    o.paymentStatus = 'paid';
    o.paidAt = o.paidAt || now;
    const events = Array.isArray(o.shipment?.events) ? o.shipment.events : [];
    o.shipment = {
      ...(o.shipment || { carrier: '', trackingNo: '', status: 'delivered' }),
      events: [...events, { time: now, location: '后台', description: `COD payment confirmed · $${Number(o.totalUsd).toFixed(2)} collected via carrier settlement` }],
    };
  });
  audit(null, 'order:codCollected', orderNo);
  revalidatePath('/orders');
  revalidatePath('/shipping');
}

/** 批量标记 COD 回款（对账日核对结算单后勾选多单一次确认） */
export async function setCodCollectedBulk(formData: FormData) {
  await requirePerm('shipping.edit');
  const nos = String(formData.get('orderNos') || '').split(',').map(s => s.trim()).filter(Boolean);
  const now = new Date().toISOString();
  let done = 0;
  for (const no of nos) {
    try {
      mutateOrder(no, o => {
        if (!(o.paymentMethod === 'cod' || o.paymentStatus === 'cod')) return;
        o.codConfirmedAt = now;
        o.paymentStatus = 'paid';
        o.paidAt = o.paidAt || now;
        const events = Array.isArray(o.shipment?.events) ? o.shipment.events : [];
        o.shipment = {
          ...(o.shipment || { carrier: '', trackingNo: '', status: 'delivered' }),
          events: [...events, { time: now, location: '后台', description: `COD payment confirmed · $${Number(o.totalUsd).toFixed(2)} collected via carrier settlement` }],
        };
      });
      done++;
    } catch { /* 单条失败继续 */ }
  }
  audit(null, 'order:codCollectedBulk', `${done}/${nos.length}`);
  revalidatePath('/orders');
  revalidatePath('/shipping');
}

/** 人工标记拒收（轨迹缺失时兜底）：履约转异常 + 轨迹事件 */
export async function setCodRefused(formData: FormData) {
  await requirePerm('shipping.edit');
  const orderNo = String(formData.get('orderNo') || '');
  const now = new Date().toISOString();
  mutateOrder(orderNo, o => {
    o.fulfillmentStatus = 'exception';
    const events = Array.isArray(o.shipment?.events) ? o.shipment.events : [];
    o.shipment = {
      ...(o.shipment || { carrier: '', trackingNo: '', status: 'exception' }),
      status: 'exception',
      events: [...events, { time: now, location: '后台', description: 'Manually marked as refused by customer — payment not collected, parcel returning' }],
    };
  });
  audit(null, 'order:codRefused', orderNo);
  revalidatePath('/orders');
  revalidatePath('/shipping');
}

/** 推送订单到 OMS（单个/批量；可补填历史订单缺失的收件人电话）。立即消费一次队列 */
export async function pushOrdersToOms(formData: FormData) {
  const me = await requirePerm('shipping.edit');
  const nos = String(formData.get('orderNos') || '').split(',').map(s => s.trim()).filter(Boolean);
  const phone = String(formData.get('phone') || '').trim();
  if (!nos.length) return;
  const { enqueueOmsPush, processPushQueue } = await import('./oms');
  for (const no of nos) {
    if (phone) {
      try { mutateOrder(no, o => { if (!o.phone) o.phone = phone; }); } catch { /* 单条失败继续 */ }
    }
    enqueueOmsPush(no);
  }
  audit(me.id, 'order:omsPush', nos.join(','));
  const r = await processPushQueue();
  const mine = r.reports.filter(x => nos.includes(x.orderNo));
  const failedCount = mine.filter(x => !x.ok).length;
  const okCount = nos.length - failedCount; // 未报错的（含异步取号等待中）都视为已受理
  revalidatePath('/orders');
  revalidatePath('/shipping');
  redirect(`/orders?pushed=${okCount}&failed=${failedCount}`);
}

/** 重试推送：重置队列计数并立即再推一次 */
export async function retryOmsPush(formData: FormData) {
  await requirePerm('shipping.edit');
  const orderNo = String(formData.get('orderNo') || '');
  const { enqueueOmsPush, processPushQueue, readQueue, writeQueue } = await import('./oms');
  const queue = readQueue();
  const row = queue.find(r => r.orderNo.toUpperCase() === orderNo.toUpperCase());
  if (row) {
    row.state = 'pending';
    row.attempts = 0;
    row.lastError = undefined;
    writeQueue(queue);
  } else {
    enqueueOmsPush(orderNo);
  }
  mutateOrder(orderNo, o => { if (o.oms) o.oms.pushError = undefined; });
  audit(null, 'order:omsRetry', orderNo);
  await processPushQueue();
  revalidatePath('/orders');
  revalidatePath('/shipping');
}

/** 保存 OMS 代发配置（独立表单，不影响设置页其他区块） */
export async function saveOmsSettings(formData: FormData) {
  await requirePerm('settings.edit');
  const { readJson, writeJson, paths } = await import('./store');
  const { normalizeOmsConfig } = await import('@kitvault/shared');
  const settings = readJson<Record<string, unknown>>(paths.settings, {});
  const prev = normalizeOmsConfig(settings.oms);
  const next = normalizeOmsConfig({
    enabled: formData.get('omsEnabled') === 'on',
    customerCode: String(formData.get('omsCustomerCode') || '').trim() || prev.customerCode,
    customerPwd: String(formData.get('omsCustomerPwd') || '').trim() || prev.customerPwd,
    baseUrl: String(formData.get('omsBaseUrl') || '').trim() || prev.baseUrl,
    defaultOgId: Number(formData.get('omsOgId') || prev.defaultOgId),
    defaultServiceCode: String(formData.get('omsServiceCode') || '').trim() || prev.defaultServiceCode,
    defaultWeightKg: Number(formData.get('omsWeightKg') || prev.defaultWeightKg),
    codRemindDays: Number(formData.get('omsCodRemindDays') || prev.codRemindDays),
  });
  writeJson(paths.settings, { ...settings, oms: next });
  audit(null, 'settings:oms', `enabled=${next.enabled}`);
  revalidatePath('/settings');
  revalidatePath('/orders');
  revalidatePath('/shipping');
}

/** 拉取 OMS 渠道 / 仓库列表到本地缓存（设置页按钮；下单渠道下拉数据源） */
export async function refreshOmsCache() {
  await requirePerm('settings.edit');
  const { refreshOmsReferenceData } = await import('./oms');
  await refreshOmsReferenceData();
  audit(null, 'settings:omsRefresh');
  revalidatePath('/settings');
}
