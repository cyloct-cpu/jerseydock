import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import fs from 'node:fs';
import path from 'node:path';
import { paths } from '@/lib/store';
import { parseExcelRows } from '@/lib/import-parse';
import { SESSION_COOKIE_NAME, verifySessionEdge } from '@/lib/session';
import { can, readUserById } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const IMG_EXT_RE = /\.(jpe?g|png|webp|avif)$/i;
const LIST_FILE_RE = /^products\.(csv|json|xlsx)$/i;
const MAX_LIST_BYTES = 5 * 1024 * 1024;
const MAX_ZIP_BYTES = 300 * 1024 * 1024;

function safeFolderName(input: string): string {
  return input.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionEdge(token) : null;
  if (!session) return NextResponse.json({ ok: false, error: '登录已过期，请重新登录' }, { status: 401 });
  const user = readUserById(session.sub);
  if (!user) return NextResponse.json({ ok: false, error: '账号不存在' }, { status: 401 });
  if (!can(user, 'import.run')) return NextResponse.json({ ok: false, error: '无权导入商品' }, { status: 403 });

  const formData = await req.formData();
  const rawName = String(formData.get('folder') || '').trim();
  const folder = safeFolderName(rawName) || `batch-${new Date().toISOString().slice(0, 10)}`;

  const listFile = formData.get('listFile');
  if (!(listFile instanceof File) || listFile.size === 0) {
    return NextResponse.json({ ok: false, error: '请选择要上传的清单文件' }, { status: 400 });
  }
  const listName = listFile.name;
  if (!LIST_FILE_RE.test(path.basename(listName))) {
    return NextResponse.json({ ok: false, error: `清单文件名必须是 products.csv / products.json / products.xlsx，当前为 ${listName}` }, { status: 400 });
  }
  if (listFile.size > MAX_LIST_BYTES) {
    return NextResponse.json({ ok: false, error: '清单文件超过 5MB' }, { status: 400 });
  }

  const suffix = fs.existsSync(path.join(paths.imports, folder)) ? `-${Date.now().toString(36).slice(-4)}` : '';
  const targetDir = path.join(paths.imports, suffix ? `${folder}${suffix}` : folder);
  fs.mkdirSync(targetDir, { recursive: true });

  // ---- 保存清单文件（xlsx 转为 JSON） ----
  const ext = path.extname(listName).toLowerCase();
  const listBuf = Buffer.from(await listFile.arrayBuffer());
  if (ext === '.xlsx' || ext === '.xls') {
    const rows = await parseExcelRows(listBuf);
    fs.writeFileSync(path.join(targetDir, 'products.json'), JSON.stringify(rows));
  } else {
    fs.writeFileSync(path.join(targetDir, `products${ext}`), listBuf);
  }

  // ---- 图片：三个通道（文件夹 / zip / 散图） ----
  const warn: string[] = [];
  let imgOk = 0;
  const writeImages = async (items: { key: string; buf: Buffer; orig: string }[]) => {
    let ok = 0;
    for (const item of items) {
      try {
        const imgDir = path.join(targetDir, 'images', item.key);
        fs.mkdirSync(imgDir, { recursive: true });
        fs.writeFileSync(path.join(imgDir, item.orig), item.buf);
        ok++;
      } catch { /* skip */ }
    }
    return { ok, errors: [] as string[] };
  };

  // ① 文件夹 / 多文件（客户端把相对路径放进 filename，形如 JR001/1.png）
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length) {
    const items = await Promise.all(files.map(async f => {
      const rel = (f.name || '').replace(/\\/g, '/');
      const parts = rel.split('/').filter(Boolean);
      const key = parts.length >= 2 ? parts[parts.length - 2] : path.basename(f.name, path.extname(f.name));
      return { key, buf: Buffer.from(await f.arrayBuffer()), orig: path.basename(f.name) };
    }));
    const r = await writeImages(items);
    imgOk += r.ok;
  }

  // ② ZIP 包
  const zipFile = formData.get('zipFile');
  if (zipFile instanceof File && zipFile.size > 0) {
    if (zipFile.size > MAX_ZIP_BYTES) {
      warn.push(`zip 超过 300MB，未解压：${zipFile.name}`);
    } else {
      try {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
        const imgItems: { key: string; buf: Buffer; orig: string }[] = [];
        for (const entry of Object.values(zip.files).filter(f => !f.dir)) {
          const name = path.basename(entry.name);
          if (/^products\.(csv|json|xlsx)$/i.test(name) && !fs.existsSync(path.join(targetDir, `products${path.extname(name).toLowerCase()}`))) {
            fs.writeFileSync(path.join(targetDir, `products${path.extname(name).toLowerCase()}`), await entry.async('nodebuffer'));
            continue;
          }
          if (!IMG_EXT_RE.test(name)) continue;
          const buf = await entry.async('nodebuffer');
          const parts = entry.name.replace(/\\/g, '/').split('/').filter(Boolean);
          const key = parts.length >= 2 ? parts[parts.length - 2] : path.basename(name, path.extname(name));
          imgItems.push({ key, buf, orig: name });
        }
        const r = await writeImages(imgItems);
        imgOk += r.ok;
      } catch (e) {
        warn.push(`zip 解压失败：${e instanceof Error ? e.message : '未知错误'}`);
      }
    }
  }

  // ③ 散图
  const loose = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
  if (loose.length) {
    const items = await Promise.all(loose.map(async f => ({
      key: path.basename(f.name, path.extname(f.name)),
      buf: Buffer.from(await f.arrayBuffer()),
      orig: path.basename(f.name),
    })));
    const r = await writeImages(items);
    imgOk += r.ok;
  }

  return NextResponse.json({
    ok: true,
    folder: path.basename(targetDir),
    images: imgOk,
    warn: warn.slice(0, 5),
  });
}
