/**
 * 以图搜款 · 索引构建器
 * 扫全部在售商品主图 → embedding + dHash → data/search/image-vectors.json
 * - full：全量重建；incremental：只处理新增/主图变更的商品（sig 比对）
 * - 进度落盘 data/search/reindex-status.json，可随时查询
 */
import fs from 'node:fs';
import path from 'node:path';
import { allProducts, isActive } from './catalog';
import {
  embedImage,
  dHash,
  fetchImageBuffer,
  readIndex,
  writeIndex,
  urlSig,
  type VectorRecord,
} from './image-search';

const STATUS_PATH = path.resolve(process.cwd(), '..', '..', 'data', 'search', 'reindex-status.json');

export type ReindexStatus = {
  running: boolean;
  startedAt: string;
  finishedAt?: string;
  mode: 'full' | 'incremental';
  total: number;
  done: number;
  ok: number;
  failed: number;
  error?: string;
};

const IDLE: ReindexStatus = {
  running: false, startedAt: '', mode: 'full', total: 0, done: 0, ok: 0, failed: 0,
};

export function readStatus(): ReindexStatus {
  try {
    return { ...IDLE, ...JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8')) };
  } catch {
    return IDLE;
  }
}

function writeStatus(s: ReindexStatus): void {
  fs.mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
  fs.writeFileSync(STATUS_PATH, JSON.stringify(s), 'utf8');
}

/** 商品主图 URL（v 优先，退 i[0]） */
function primaryImage(p: { v: string; i: string[] }): string {
  return p.v || p.i[0] || '';
}

/**
 * 执行索引构建（长任务，由 API 路由后台调用）。
 * 并发 4  worker；单张失败不影响整体（失败计数，可后续增量补）。
 */
export async function runReindex(mode: 'full' | 'incremental' = 'full'): Promise<ReindexStatus> {
  const status: ReindexStatus = {
    running: true,
    startedAt: new Date().toISOString(),
    mode,
    total: 0,
    done: 0,
    ok: 0,
    failed: 0,
  };
  writeStatus(status);

  try {
    const products = allProducts().filter(isActive);
    const existing = new Map(readIndex().map(r => [r.h, r]));
    const todo = products.filter(p => {
      const img = primaryImage(p);
      if (!img) return false;
      if (mode === 'full') return true;
      return existing.get(p.h)?.sig !== urlSig(img);
    });

    // full 模式丢弃旧记录整体重建；incremental 保留未处理的旧记录
    const keep: VectorRecord[] = mode === 'incremental'
      ? [...existing.values()].filter(r => !todo.some(p => p.h === r.h))
      : [];

    status.total = todo.length;
    writeStatus(status);

    const results: VectorRecord[] = [...keep];
    let cursor = 0;
    let lastCheckpoint = 0;

    async function worker(): Promise<void> {
      while (true) {
        const i = cursor++;
        if (i >= todo.length) return;
        const p = todo[i];
        const img = primaryImage(p);
        try {
          const buf = await fetchImageBuffer(img);
          if (!buf) throw new Error('fetch failed');
          const [v, d] = await Promise.all([embedImage(buf), dHash(buf)]);
          results.push({ h: p.h, u: img, sig: urlSig(img), v, d, at: new Date().toISOString() });
          status.ok++;
        } catch {
          status.failed++;
        }
        status.done++;
        if (status.done % 20 === 0 || status.done === todo.length) writeStatus(status);
        // 阶段性落盘：每 200 件回写一次索引，服务中断不丢进度
        if (status.done - lastCheckpoint >= 200) {
          lastCheckpoint = status.done;
          writeIndex([...keep, ...results]);
        }
      }
    }

    await Promise.all([worker(), worker(), worker(), worker()]);

    // 仅当有成功记录或 full 模式才落盘（避免全失败把索引清空）
    if (results.length > 0 || mode === 'full') writeIndex(results);
    status.running = false;
    status.finishedAt = new Date().toISOString();
    writeStatus(status);
  } catch (err) {
    status.running = false;
    status.error = err instanceof Error ? err.message : 'unknown error';
    status.finishedAt = new Date().toISOString();
    writeStatus(status);
  }
  return status;
}
