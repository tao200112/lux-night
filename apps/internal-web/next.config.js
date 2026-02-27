/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@lux-night/shared', '@lux-night/security'],
}

module.exports = nextConfig
