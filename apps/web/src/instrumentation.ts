/**
 * 出站代理：本机网络环境下（Clash TUN），node 进程直连外网 API 会被墙（connect timeout），
 * 而浏览器/curl 的流量会被 TUN 正常接管。这里在服务启动时把全局 fetch 分发器
 * 挂到本机 Clash 混合端口（读 HTTPS_PROXY/HTTP_PROXY 环境变量），
 * localhost/127.0.0.1 走 NO_PROXY 直连，不受影响。未配置代理变量时本文件不做任何事。
 * 仅 nodejs 运行时生效；edge 包会在编译期剔除 undici 导入。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!proxy) return;
  try {
    // webpackIgnore：让 webpack 不解析此导入，运行时由 Node 原生加载（undici 在 node_modules 根目录）
    const { setGlobalDispatcher, EnvHttpProxyAgent } = await import(/* webpackIgnore: true */ 'undici');
    setGlobalDispatcher(new EnvHttpProxyAgent({ connectTimeout: 30000 }));
    console.log(`[instrumentation] outbound fetch via proxy ${proxy}`);
  } catch (e) {
    console.error('[instrumentation] proxy setup failed:', e instanceof Error ? e.message : e);
  }
}
