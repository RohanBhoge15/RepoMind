/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['avatars.githubusercontent.com'],
  },

  // Modularize imports to significantly speed up compilation with heavy libraries
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{lowerCase kebabCase member}}',
      skipDefaultConversion: true,
    },
  },

  // Optimize webpack for faster builds
  webpack: (config, { dev, isServer }) => {
    // Faster source maps in development
    if (dev) {
      config.devtool = 'eval-cheap-module-source-map';
    }
    return config;
  },

  // Keep compiled pages in memory longer during development
  onDemandEntries: {
    // Period (in ms) where the server will keep pages in the buffer
    // increased from 25s to 5 minutes to prevent frequent recompilation
    maxInactiveAge: 60 * 5 * 1000,
    // Number of pages that should be kept simultaneously without being disposed
    // increased from 2 to 10
    pagesBufferLength: 10,
  },
}

module.exports = nextConfig

