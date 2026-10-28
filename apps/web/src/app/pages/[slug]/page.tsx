import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { use } from 'react';
import { ContactForm } from './ContactForm';
import { Breadcrumb } from '@/components/Breadcrumb';

/** 静态内容页独立 metadata（title/description 取自页面定义） */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = PAGES[slug];
  if (!page) return {};
  return {
    title: page.title,
    alternates: { canonical: `/pages/${slug}` },
  };
}

/**
 * 静态内容页（Shipping / Returns / Size guide / About / FAQ / Contact）
 * 说明：政策类长文案以英文撰写（国际客户基准语言，N4）；
 * 结构性文案（标题/表单）走 i18n key，见 lib/i18n.ts。
 */

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'faq'; q: string; a: string }
  | { kind: 'contact' };

type PageDef = { title: string; eyebrow: string; blocks: Block[] };

const PAGES: Record<string, PageDef> = {
  shipping: {
    title: 'Shipping & delivery',
    eyebrow: 'Help',
    blocks: [
      { kind: 'p', text: 'We ship worldwide from our Asia warehouse with tracked, insured logistics. Every parcel carries a tracking number you can follow on this site or on the carrier page.' },
      { kind: 'h', text: 'Delivery times' },
      { kind: 'ul', items: [
        'United States / Canada — 7–12 business days',
        'United Kingdom / EU — 6–10 business days',
        'Australia / New Zealand — 7–14 business days',
        'Rest of world — 8–15 business days',
      ] },
      { kind: 'h', text: 'Shipping rates' },
      { kind: 'ul', items: [
        'Orders of 3+ items — free worldwide',
        'Orders of 1–2 items — flat $6.90',
        'Multi-buy discount: 3 items save $5, 8 items save $10 (applied automatically at checkout)',
      ] },
      { kind: 'h', text: 'Customs & import duties' },
      { kind: 'p', text: 'Import taxes and duties are the buyer’s responsibility and are not included in the item price. Most destinations clear small parcels without extra charges; if your country charges duties, the courier will contact you.' },
      { kind: 'h', text: 'Lost or delayed parcels' },
      { kind: 'p', text: 'If a parcel is delayed beyond the estimates above, contact us with your order number — we reship or refund in full. Parcels marked delivered but not received are investigated with the carrier.' },
    ],
  },
  returns: {
    title: 'Returns & refunds',
    eyebrow: 'Help',
    blocks: [
      { kind: 'p', text: 'You have 30 days from delivery to return any item for a full refund — no questions asked.' },
      { kind: 'h', text: 'Conditions' },
      { kind: 'ul', items: [
        'Item unworn, unwashed, with original tags and packaging',
        'Return address provided by our support team before you ship anything back',
        'Refunds are issued to the original payment method within 5 business days of inspection',
      ] },
      { kind: 'h', text: 'Exchanges' },
      { kind: 'p', text: 'Wrong size? Tell us the size you need — if it is in stock we ship the replacement immediately and cover both ways of shipping.' },
      { kind: 'h', text: 'Damaged or wrong item' },
      { kind: 'p', text: 'Send a photo of the item within 48 hours of delivery and we reship the correct product at no cost, or refund in full — your choice.' },
    ],
  },
  'size-guide': {
    title: 'Size guide',
    eyebrow: 'Help',
    blocks: [
      { kind: 'p', text: 'Jerseys run true to size with a regular fan-fit. Player versions are slimmer through the body — take one size up if you prefer a looser fit. Kids sizes follow age; when in doubt, size up.' },
      { kind: 'h', text: 'Adult (chest / length, cm)' },
      { kind: 'ul', items: [
        'S — 96 / 71',
        'M — 100 / 73',
        'L — 104 / 75',
        'XL — 110 / 77',
        '2XL — 116 / 79',
        '3XL / 4XL — 122–134 / 81–84',
      ] },
      { kind: 'h', text: 'Kids (height, cm)' },
      { kind: 'ul', items: [
        '5–6 yrs — 110–116',
        '7–8 yrs — 122–128',
        '9–10 yrs — 134–140',
        '11–12 yrs — 146–152',
        '13–15 yrs — 158–170',
      ] },
      { kind: 'h', text: 'Still unsure?' },
      { kind: 'p', text: 'Send us your height, weight and the fit you like (slim / regular / loose) and we will recommend the size.' },
    ],
  },
  about: {
    title: 'About us',
    eyebrow: 'About',
    blocks: [
      { kind: 'p', text: 'We are a jersey-only store: club and national team shirts from every major league, in fan, player and kids versions — including retro classics and current-season releases.' },
      { kind: 'h', text: 'How we work' },
      { kind: 'ul', items: [
        'Direct-from-source sourcing keeps prices honest',
        'Every parcel tracked and insured, worldwide',
        '30-day returns, full refund',
        'Real humans on support — answers within one business day',
      ] },
      { kind: 'h', text: 'Wholesale & bulk orders' },
      { kind: 'p', text: 'Teams, fan clubs and resellers: contact us for tiered pricing on 10+ items.' },
    ],
  },
  faq: {
    title: 'Frequently asked questions',
    eyebrow: 'Help',
    blocks: [
      { kind: 'faq', q: 'Are these official products?', a: 'We sell fan-quality replicas at replica prices. They carry full club/league branding and are made for fans and everyday wear — they are not the official match-issue player shirts sold by clubs.' },
      { kind: 'faq', q: 'Can I personalize a shirt with a name and number?', a: 'Yes — selected shirts support official-style printing at checkout for a small fee. Leave a note at checkout with the exact name and number.' },
      { kind: 'faq', q: 'Which payment methods do you accept?', a: 'Online payment is being connected right now. Until then, orders are created as “awaiting payment” and our team confirms payment manually before shipping — we will email you payment instructions.' },
      { kind: 'faq', q: 'How do I track my parcel?', a: 'Open “Track order”, enter your order number and the email you used. The page shows live status and a direct link to the carrier.' },
      { kind: 'faq', q: 'Do you ship to PO boxes or freight forwarders?', a: 'Yes to both. Forwarders are popular with our customers — just make sure the address you enter matches your forwarder account.' },
      { kind: 'faq', q: 'What if my size is out of stock?', a: 'Restocks land weekly. Contact us with the shirt and size and we will tell you the expected date — or recommend the closest alternative.' },
    ],
  },
  contact: {
    title: 'Contact us',
    eyebrow: 'Help',
    blocks: [
      { kind: 'p', text: 'Questions about an order, sizing, bulk pricing or anything else — send a message and we reply within one business day.' },
      { kind: 'contact' },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    eyebrow: 'Legal',
    blocks: [
      { kind: 'p', text: 'This policy explains what information JERSEYDOCK (jerseydock.shop) collects when you browse or shop with us, how we use it, and the choices you have. It was last updated in October 2026.' },
      { kind: 'h', text: 'What we collect' },
      { kind: 'ul', items: [
        'Account details — your email address and password (stored only as a salted hash) when you create an account, including accounts created by signing in with Google.',
        'Order details — the items you buy, shipping address, and order history, so we can fulfil and support your purchases.',
        'Usage data — anonymous analytics about pages visited and features used, which helps us improve the store.',
      ] },
      { kind: 'h', text: 'How we use it' },
      { kind: 'ul', items: [
        'To create and secure your account and process sign-ins.',
        'To take, ship, and support your orders, including email notifications about order status.',
        'To send service emails such as verification codes. We do not send marketing emails unless you opt in.',
      ] },
      { kind: 'h', text: 'Who we share it with' },
      { kind: 'p', text: 'We share only what is necessary with the partners that help us run the store: our email delivery provider (verification and order emails) and our logistics carriers (shipping address and tracking). We never sell your personal data.' },
      { kind: 'h', text: 'Cookies' },
      { kind: 'p', text: 'We use a small number of essential cookies to keep you signed in and remember your cart and language. No advertising cookies are set.' },
      { kind: 'h', text: 'Your choices' },
      { kind: 'p', text: 'You may request a copy of your data, correct it, or delete your account at any time by contacting us. Orders that have already shipped are retained as required for accounting and dispute resolution.' },
      { kind: 'h', text: 'Contact' },
      { kind: 'p', text: 'For any privacy question or request, email our support team or use the contact page — we reply within one business day.' },
    ],
  },
};

export default function StaticPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const page = PAGES[slug];
  if (!page) notFound();

  return (
    <div className="container">
      <Breadcrumb items={[{ label: page.title }]} />
      <div className="page-prose">
        <span className="eyebrow">{page.eyebrow}</span>
        <h1 className="h2" style={{ fontSize: 'clamp(26px,3.4vw,42px)', margin: '10px 0 18px' }}>{page.title}</h1>
        {page.blocks.map((b, i) => {
          if (b.kind === 'p') return <p key={i} style={{ marginTop: 12 }}>{b.text}</p>;
          if (b.kind === 'h') return <h2 key={i}>{b.text}</h2>;
          if (b.kind === 'ul') return <ul key={i}>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>;
          if (b.kind === 'faq') return (
            <div key={i}>
              <p className="faq-q">{b.q}</p>
              <p style={{ marginTop: 6 }}>{b.a}</p>
            </div>
          );
          return <ContactForm key={i} />;
        })}
      </div>
    </div>
  );
}
