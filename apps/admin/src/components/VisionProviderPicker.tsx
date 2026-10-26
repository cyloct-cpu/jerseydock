'use client';

import { useMemo, useState } from 'react';

type ModelInfo = { id: string; vision: boolean };
type ProviderRow = { type: string; key: string; model: string; endpoint: string };

/** 内置三家的默认模型 / 地址（与前台 vision-api.ts 保持一致，用于两段旧格式行回显） */
const BUILTIN: Record<string, { model: string; endpoint: string }> = {
  groq: { model: 'meta-llama/llama-4-scout-17b-16e-instruct', endpoint: 'https://api.groq.com/openai/v1/chat/completions' },
  openrouter: { model: 'qwen/qwen2.5-vl-72b-instruct:free', endpoint: 'https://openrouter.ai/api/v1/chat/completions' },
  huggingface: { model: 'Qwen/Qwen2.5-VL-72B-Instruct', endpoint: 'https://router.huggingface.co/v1/chat/completions' },
};

function parseLines(raw: string): ProviderRow[] {
  return String(raw || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const i1 = line.indexOf(':');
      if (i1 <= 0) return null;
      const type = line.slice(0, i1).trim();
      const rest = line.slice(i1 + 1).trim();
      const i2 = rest.indexOf(':');
      const key = (i2 === -1 ? rest : rest.slice(0, i2)).trim();
      if (!type || !key) return null;
      const tail = i2 === -1 ? '' : rest.slice(i2 + 1).trim();
      let model = tail;
      let endpoint: string | undefined;
      if (tail) {
        const m = tail.match(/:(https?:\/\/\S+)$/);
        if (m) { endpoint = m[1]; model = tail.slice(0, m.index).trim(); }
      }
      if (BUILTIN[type]) {
        return { type, key, model: model || BUILTIN[type].model, endpoint: endpoint || BUILTIN[type].endpoint };
      }
      if (!model || !endpoint) return null;
      return { type, key, model, endpoint };
    })
    .filter((x): x is ProviderRow => x !== null);
}

const maskKey = (k: string) => (k.length <= 12 ? k : `${k.slice(0, 8)}…${k.slice(-4)}`);

/**
 * 视觉 API 提供商配置器（表单式）：
 * 填接口地址 + 密钥 → 拉取模型列表（视觉模型优先）→ 添加为一条配置；已配置列表可删除。
 * 底层存储仍是 visionKeys 字符串（hidden input 随设置表单一起提交）。
 */
export function VisionProviderPicker({ name, formId, defaultValue }: { name: string; formId: string; defaultValue: string }) {
  const [rows, setRows] = useState<ProviderRow[]>(() => parseLines(defaultValue));
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState('');

  const visionModels = useMemo(() => (models || []).filter(m => m.vision), [models]);
  const listModel = showAll ? models || [] : visionModels;

  const fetchModels = async () => {
    setErr(''); setModels(null); setSelected('');
    if (!/^https?:\/\//.test(baseUrl.trim())) { setErr('接口地址要以 http(s):// 开头'); return; }
    if (!apiKey.trim()) { setErr('请先填写 API Key'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/vision/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: baseUrl.trim(), key: apiKey.trim() }),
      });
      const j = await res.json();
      if (!j.ok) { setErr(j.error || `拉取失败（HTTP ${res.status}）`); return; }
      setModels(j.models as ModelInfo[]);
      if (!j.models?.length) setErr('接口连通，但没有返回任何模型');
    } catch {
      setErr('拉取请求失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const defaultLabel = useMemo(() => {
    try { return new URL(baseUrl.trim()).hostname.replace(/^www\./, '').split('.').slice(-2)[0] || 'custom'; }
    catch { return 'custom'; }
  }, [baseUrl]);

  const addRow = () => {
    if (!selected) return;
    const type = (label.trim() || defaultLabel).replace(/[^a-zA-Z0-9_-]/g, '') || 'custom';
    const row: ProviderRow = {
      type,
      key: apiKey.trim(),
      model: selected,
      endpoint: (() => {
        const base = baseUrl.trim().replace(/\/+$/, '');
        return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
      })(),
    };
    setRows(prev => (prev.some(r => r.type === row.type && r.model === row.model && r.endpoint === row.endpoint) ? prev : [...prev, row]));
    setModels(null); setSelected('');
  };

  return (
    <div>
      {/* 已配置列表 */}
      {rows.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          {rows.map((r, i) => (
            <div key={`${r.type}-${r.model}-${i}`}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 4 }}>
              <span className="badge accent">{r.type}</span>
              <span style={{ color: 'var(--text)', fontSize: 'var(--fs-small)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.model}</span>
              <span className="dim mono" style={{ fontSize: 'var(--fs-micro)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{maskKey(r.key)} · {r.endpoint}</span>
              <button className="btn btn-sm btn-ghost" type="button" style={{ color: '#E5484D' }}
                onClick={() => setRows(prev => prev.filter((_, idx) => idx !== i))}>删除</button>
            </div>
          ))}
        </div>
      )}

      {/* 添加表单 */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 0.8fr', gap: 10 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>接口地址（Base URL，填到域名或 /v1）</label>
          <input className="input" value={baseUrl} onChange={e => { setBaseUrl(e.currentTarget.value); setModels(null); }} placeholder="https://api.siliconflow.cn/v1" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>API Key</label>
          <input className="input" type="text" value={apiKey} onChange={e => setApiKey(e.currentTarget.value)} placeholder="sk-…" autoComplete="off" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>备注名（选填）</label>
          <input className="input" value={label} onChange={e => setLabel(e.currentTarget.value)} placeholder={defaultLabel} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" type="button" disabled={loading} onClick={fetchModels}>{loading ? '拉取中…' : '拉取模型列表'}</button>
        {models && (
          <>
            <select className="select" value={selected} onChange={e => setSelected(e.currentTarget.value)} style={{ minWidth: 320, height: 32 }}>
              <option value="">— 选择模型（共 {models.length} 个，其中视觉模型 {visionModels.length} 个）—</option>
              {listModel.map(m => <option key={m.id} value={m.id}>{m.vision ? '🖼 ' : ''}{m.id}</option>)}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-micro)', color: 'var(--text-3)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.currentTarget.checked)} /> 显示全部模型
            </label>
            <button className="btn btn-sm" type="button" disabled={!selected} onClick={addRow}>添加 ↑</button>
          </>
        )}
      </div>
      {err && <div style={{ color: '#E5484D', fontSize: 'var(--fs-micro)', marginTop: 6 }}>{err}</div>}

      {/* 真正随表单提交的存储字段 */}
      <input type="hidden" name={name} form={formId} value={rows.map(r => [r.type, r.key, r.model, r.endpoint].join(':')).join('\n')} />

      {/* 使用说明与推荐 */}
      <details open style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-small)', color: 'var(--text-2)' }}>使用说明与推荐模型（点开/收起）</summary>
        <div style={{ fontSize: 'var(--fs-micro)', lineHeight: 1.9, color: 'var(--text-2)', marginTop: 10 }}>
          <p style={{ margin: 0 }}>
            <b style={{ color: 'var(--accent)' }}>这是什么：</b>
            以图搜款的主引擎是网站内置的本地模型（自动运行，无需配置）。当本地模型对某张图“看不准”时，
            才会调用这里配置的视觉大模型帮忙读图——认出球队、赛季、配色，再转成文字去搜商品。
            <b>不配置网站也能正常搜图</b>，配置后搜索联想更准。
          </p>
          <p style={{ margin: '8px 0 0' }}>
            <b style={{ color: 'var(--accent)' }}>怎么配（三步）：</b>
            ① 去下面任一推荐平台注册，创建一个 API Key；
            ② 填接口地址 + Key，点「拉取模型列表」；
            ③ 选一个带 🖑 的模型，点「添加 ↑」，最后拉到页面底部点「保存设置」。
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', margin: '10px 0 4px' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-3)' }}>
                <th style={{ padding: '4px 8px 4px 0', fontWeight: 500 }}>推荐度</th>
                <th style={{ padding: '4px 8px', fontWeight: 500 }}>平台（去这拿 Key）</th>
                <th style={{ padding: '4px 8px', fontWeight: 500 }}>选这个模型</th>
                <th style={{ padding: '4px 0', fontWeight: 500 }}>费用</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '5px 8px 5px 0' }}>★★★</td>
                <td style={{ padding: '4px 8px' }}>openrouter.ai</td>
                <td style={{ padding: '4px 8px' }} className="mono">qwen/qwen2.5-vl-72b-instruct:free</td>
                <td style={{ padding: '4px 0', color: 'var(--ok, #46A758)' }}>免费</td>
              </tr>
              <tr style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '5px 8px 5px 0' }}>★★★</td>
                <td style={{ padding: '4px 8px' }}>console.groq.com</td>
                <td style={{ padding: '4px 8px' }} className="mono">meta-llama/llama-4-scout-17b-16e-instruct</td>
                <td style={{ padding: '4px 0', color: 'var(--ok, #46A758)' }}>免费额度</td>
              </tr>
              <tr style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '5px 8px 5px 0' }}>★★☆</td>
                <td style={{ padding: '4px 8px' }}>siliconflow.cn（硅基流动）</td>
                <td style={{ padding: '4px 8px' }} className="mono">Qwen/Qwen2.5-VL-72B-Instruct</td>
                <td style={{ padding: '4px 0' }}>按量，很便宜</td>
              </tr>
              <tr style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '5px 8px 5px 0' }}>★★☆</td>
                <td style={{ padding: '4px 8px' }}>openrouter.ai</td>
                <td style={{ padding: '4px 8px' }} className="mono">google/gemini-2.5-flash</td>
                <td style={{ padding: '4px 0' }}>按量</td>
              </tr>
            </tbody>
          </table>
          <p style={{ margin: '8px 0 0' }}>
            <b style={{ color: 'var(--accent)' }}>选模型的标准：</b>
            必须是<b>视觉（图片输入）模型</b>（列表里带 🖑 的）；优先选 70B 以上或大厂旗舰（GPT-4o / Claude / Gemini / Qwen-VL-72B），
            认球队队徽需要足球知识，太小的模型认不出队名导致搜索变差。<b>纯文本模型（如 DeepSeek-V3、GPT-3.5）不可用</b>。
          </p>
          <p style={{ margin: '8px 0 0' }}>
            <b style={{ color: 'var(--accent)' }}>出问题会怎样：</b>
            调用失败会自动跳过并冷却 10 分钟，不影响网站正常搜图；配错最多是“辅助增强没生效”。
            想验证效果：在前台用一张球衣照片搜一次，能正常出结果即可；多条配置按顺序轮换，一家失败自动换下一家。
          </p>
        </div>
      </details>
    </div>
  );
}
