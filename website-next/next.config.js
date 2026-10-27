/** @type {import('next').NextConfig} */

// The internal API-traffic viewer lives on the backend at <api-origin>/logs.
// Proxy /logs (and /logs/data) from this site so it's reachable at
// dev.swiftloan.ai/logs. NEXT_PUBLIC_API_BASE is like
// https://dev-api.swiftloan.ai/api — strip the trailing /api to get the origin.
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000').replace(/\/api\/?$/, '');

const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      { source: '/logs', destination: `${API_ORIGIN}/logs` },
      { source: '/logs/:path*', destination: `${API_ORIGIN}/logs/:path*` },
      // The Upshot SDK registers "./upshot-service-worker.js" relative to the CURRENT page, so on /apply/verify it asks
      // for /apply/upshot-service-worker.js. Serve the one file from every path.
      { source: '/:path+/upshot-service-worker.js', destination: '/upshot-service-worker.js' },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*/upshot-service-worker.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Canonical privacy-policy URL is the hyphenated /privacy-policy. Keep the
      // old /privacypolicy path working with a permanent redirect.
      { source: '/privacypolicy', destination: '/privacy-policy', permanent: true },
    ];
  },
};
module.exports = nextConfig;
