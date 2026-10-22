/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  // NOTE: 'output: export' removed — the app now uses Next.js serverless API routes.
  // Vercel will deploy this as a standard Next.js application.
};

export default nextConfig;
