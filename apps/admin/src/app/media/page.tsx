import { requirePage } from '@/lib/actions';
import { listAllMediaItems } from '@/lib/media';
import { MediaManager } from '@/components/MediaManager';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 60;

export default async function MediaPage() {
  await requirePage('/media');
  const all = listAllMediaItems();

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Catalog · Media</span>
          <h1 style={{ marginTop: 6 }}>图库管理</h1>
          <div className="sub">
            后台所有本地上传的图片（商品图、Hero 轮播、客服二维码、图库上传）自动进入图库；
            商品数据集的主图（已本地化存储）也一并收录，编辑商品时可直接选取复用。
          </div>
        </div>
      </div>

      <MediaManager initial={all.slice(0, PAGE_SIZE)} initialTotal={all.length} pageSize={PAGE_SIZE} />
    </>
  );
}
