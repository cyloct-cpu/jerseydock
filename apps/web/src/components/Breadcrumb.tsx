'use client';

import Link from 'next/link';
import { useT } from '@/lib/store';

export type CrumbItem = { href?: string; label?: string; labelKey?: string };

/**
 * 面包屑导航（商品详情 / 分类 / 订单详情等二级页的返回上级入口）
 * 首项固定为「首页」（走 i18n）；末项为当前位置，不渲染链接并做超长截断。
 * labelKey 走 i18n 词典（服务端页面也能传），label 为原始文本（数据类标题）。
 */
export function Breadcrumb({ items }: { items: CrumbItem[] }) {
  const t = useT();
  const norm = items
    .map(i => ({ href: i.href, label: i.labelKey ? t(i.labelKey) : (i.label || '') }))
    .filter(i => i.label);
  const all: CrumbItem[] = [{ href: '/', label: t('crumb.home') }, ...norm];
  return (
    <nav
      aria-label="Breadcrumb"
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', marginBottom: 18 }}
    >
      {all.map((it, i) => {
        const last = i === all.length - 1;
        return (
          <span key={`${it.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {i > 0 && <span aria-hidden="true">/</span>}
            {it.href && !last ? (
              <Link href={it.href} style={{ color: 'var(--text-3)' }} title={it.label}>{it.label}</Link>
            ) : (
              <span
                title={it.label}
                style={{
                  color: last ? 'var(--text-2)' : undefined,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: last ? 'min(56ch, 62vw)' : undefined,
                }}
              >
                {it.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
