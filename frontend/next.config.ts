import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.watchOptions = {
      poll: 1000,
      aggregateTimeout: 300,
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/api/ai/:path*',
        destination: 'http://gateway:8080/api/ai/:path*',
      },
    ];
  },
  turbopack: {},
};

export default nextConfig;