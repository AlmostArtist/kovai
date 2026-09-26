import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  images: {
    // Generated images are served from provider CDNs; allow remote sources
    // but keep them proxied through our own /api/assets/proxy for privacy.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  experimental: {
    // Generation jobs outlive a single request handler.
    serverComponentsHmrCache: false,
  },
}

export default config
