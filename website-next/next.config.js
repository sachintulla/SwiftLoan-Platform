/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  async redirects() {
    return [
      // Canonical privacy-policy URL is the hyphenated /privacy-policy. Keep the
      // old /privacypolicy path working with a permanent redirect.
      { source: '/privacypolicy', destination: '/privacy-policy', permanent: true },
    ];
  },
};
module.exports = nextConfig;
