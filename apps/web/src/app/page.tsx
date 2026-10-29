import Link from 'next/link';
import { ProductCard } from '@/components/ProductCard';
import { Reveal } from '@/components/Reveal';
import { ReviewsCarousel } from '@/components/ReviewsCarousel';
import { HeroCarousel } from '@/components/HeroCarousel';
import { featured, groups, productsByCollection } from '@/lib/catalog';
import { loadBrand } from '@/lib/brand';
import { T, TextT9n } from '@/components/ContentT9n';
import { activeVisitors } from '@/lib/visitors';

// 后台改上架状态/价格后即时生效（catalog 读取 data/admin/*.json）
export const dynamic = 'force-dynamic';

export default function HomePage() {
  const nations = groups().nation.slice(0, 12);
  const clubs = groups().club.slice(0, 12);
  const seasons = groups().season;
  const featuredList = featured(8);
  const retro = productsByCollection('retro', 4);
  const { reviews, visitors, hero } = loadBrand();
  const live = activeVisitors(visitors.windowMinutes);

  return (
    <>
      {/* Hero：高端买手店定位。全屏轮播（图/文后台可配）+ 居中克制排版 */}
      <HeroCarousel config={hero} />

      {/* 国家队 */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow"><T k="eyebrow.nations" /></span>
              <h2 className="h2"><T k="sec.nations" /></h2>
            </div>
            <Link className="link-more" href="/nations"><T k="sec.viewall" /></Link>
          </div>
          <div className="cat-grid">
            {nations.map((c, i) => (
              <Reveal key={c.slug} delay={i * 40} as="div">
                <Link href={`/collections/${c.slug}`}>
                  <span title={c.label}><TextT9n text={c.label} /></span><i>{c.count}</i>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 俱乐部 */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow"><T k="eyebrow.clubs" /></span>
              <h2 className="h2"><T k="sec.clubs" /></h2>
            </div>
            <Link className="link-more" href="/clubs"><T k="sec.viewall" /></Link>
          </div>
          <div className="cat-grid">
            {clubs.map((c, i) => (
              <Reveal key={c.slug} delay={i * 40} as="div">
                <Link href={`/collections/${c.slug}`}>
                  <span title={c.label}><TextT9n text={c.label} /></span><i>{c.count}</i>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 赛季 + 复古 */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow"><T k="eyebrow.seasons" /></span>
              <h2 className="h2"><T k="sec.seasons" /></h2>
            </div>
          </div>
          <div className="cat-grid">
            {[...seasons, ...groups().retro, ...groups().kids, ...groups().outerwear, ...groups().shorts].map((c, i) => (
              <Reveal key={c.slug} delay={i * 40} as="div">
                <Link href={`/collections/${c.slug}`}>
                  <span title={c.label}><TextT9n text={c.label} /></span><i>{c.count}</i>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 精选商品 */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow"><T k="eyebrow.featured" /></span>
              <h2 className="h2"><T k="sec.featured" /></h2>
            </div>
            <Link className="link-more" href="/collections/2026-27-season"><T k="sec.viewall" /></Link>
          </div>
          <div className="grid-products">
            {featuredList.map((p, i) => (
              <Reveal key={p.h} delay={i * 60}>
                <ProductCard product={p} priority={i < 4} visitors={visitors} liveCount={live.byHandle[p.h] ?? 0} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 复古专区 */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow"><T k="eyebrow.retro" /></span>
              <h2 className="h2"><T k="home.archive" /></h2>
            </div>
            <Link className="link-more" href="/collections/retro"><T k="sec.viewall" /></Link>
          </div>
          <div className="grid-products">
            {retro.map((p, i) => (
              <Reveal key={p.h} delay={i * 60}>
                <ProductCard product={p} visitors={visitors} liveCount={live.byHandle[p.h] ?? 0} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 客户评价（后台可配置，非真实用户评价） */}
      {reviews.enabled && reviews.reviews.length > 0 && (
        <ReviewsCarousel
          reviews={reviews.reviews}
          title={reviews.title}
          subtitle={reviews.subtitle}
        />
      )}
    </>
  );
}
