/**
 * 翻译 Provider（需求 N1 / N4）
 * 当前免费方案：
 *   1) UI 文案 = 静态语言包（主，全手工维护，保证排版稳定）
 *   2) 商品标题等动态内容 = 免费额度翻译后入库缓存（不实时调用）
 * 后续可换 DeepL / Google Translate：实现同一接口即可。
 */

export interface TranslateProvider {
  readonly id: string;
  translate(text: string, from: string, to: string): Promise<string | null>;
}

/** MyMemory 免费额度（约 5000 字符/天，匿名） */
export class MyMemoryTranslate implements TranslateProvider {
  readonly id = 'mymemory';
  async translate(text: string, from: string, to: string): Promise<string | null> {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
      const res = await fetch(url);
      const json = await res.json();
      return json?.responseData?.translatedText || null;
    } catch {
      return null;
    }
  }
}

/** LibreTranslate 公共实例（开源免费，稳定性一般） */
export class LibreTranslate implements TranslateProvider {
  readonly id = 'libretranslate';
  constructor(private endpoint = 'https://libretranslate.com') {}
  async translate(text: string, from: string, to: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.endpoint}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, source: from, target: to, format: 'text' }),
      });
      const json = await res.json();
      return json?.translatedText || null;
    } catch {
      return null;
    }
  }
}

export const translateProvider: TranslateProvider = new MyMemoryTranslate();
