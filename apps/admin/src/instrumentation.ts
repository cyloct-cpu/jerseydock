/**
 * 出站代理（后台 17TRACK / 外网 API 同样需要；详见 apps/web/src/instrumentation.ts）
 * + OMS 进程内 worker（推送队列消费 / 轨迹轮询，见 lib/oms.ts ensureOmsWorker）
 */
export async function register() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (proxy) {
    try {
      // webpackIgnore：让 webpack 不解析此导入，运行时由 Node 原生加载（undici 在 node_modules 根目录）
      const { setGlobalDispatcher, EnvHttpProxyAgent } = await import(/* webpackIgnore: true */ 'undici');
      setGlobalDispatcher(new EnvHttpProxyAgent({ connectTimeout: 30000 }));
      console.log(`[instrumentation] outbound fetch via proxy ${proxy}`);
    } catch (e) {
      console.error('[instrumentation] proxy setup failed:', e instanceof Error ? e.message : e);
    }
  }
  // OMS worker 仅在 Node 运行时启动（globalThis 幂等锁防 dev 热重载重复起定时器）
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { ensureOmsWorker } = await import('./lib/oms');
      ensureOmsWorker();
    } catch (e) {
      console.error('[instrumentation] oms worker start failed:', e instanceof Error ? e.message : e);
    }
  }
}
