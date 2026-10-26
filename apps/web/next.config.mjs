import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone：build 产出自包含目录（含精简 node_modules），便于上传服务器部署
  // standalone 产出自包含目录，但会把 public（17GB 采集图库）整目录复制——仅部署构建时开启：BUILD_STANDALONE=1 npm run build
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  // monorepo 根，保证 @kitvault/shared 被正确追踪打包
  outputFileTracingRoot: path.join(appDir, '..', '..'),
  images: { unoptimized: true },
  transpilePackages: ['@kitvault/shared'],
  reactStrictMode: true,
  // 以图搜款依赖原生模块（ONNX 推理 / 图像解码），必须作为外部依赖保持 require，
  // 不能进 webpack 打包（否则 .node 二进制与 ESM/CJS 互操作会崩）；undici 同理（node: 协议导入）
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'sharp', 'undici'],
  // 挂了 middleware 后 Next 会把请求体截断到 10MB（默认值），以图搜款上传大图必须放开
  experimental: {
    middlewareClientMaxBodySize: '50mb',
  },
};

export default nextConfig;
