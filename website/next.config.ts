import type { NextConfig } from 'next'

const root = process.cwd()

const nextConfig: NextConfig = {
  // Static export disabled — using Vercel SSR so robots.txt and sitemap work normally
  turbopack: {
    root,
  },
}

export default nextConfig
