/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  // API routes run on the Next.js server; static export is not supported.
};

export default nextConfig;
