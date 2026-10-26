import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone 产出自包含目录，但会把 public（17GB 采集图库）整目录复制——仅部署构建时开启：BUILD_STANDALONE=1 npm run build
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  outputFileTracingRoot: path.join(appDir, '..', '..'),
  images: { unoptimized: true },
  transpilePackages: ['@kitvault/shared'],
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Server Actions 上传图片文件夹需要更大的请求体上限（默认 1MB 远不够）
      bodySizeLimit: '10gb',
    },
    // 挂了 middleware 后 Next 会把请求体截断到 10MB（默认值），批量导入几百张图必须放开
    middlewareClientMaxBodySize: '2gb',
  },
};

export default nextConfig;
