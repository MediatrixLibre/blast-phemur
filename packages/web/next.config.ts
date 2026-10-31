import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@guardianstream/types'],
};

export default nextConfig;
