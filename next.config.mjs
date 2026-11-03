/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export estático: lo empaqueta Tauri (macOS .dmg / iOS .ipa) y también se puede servir en Vercel.
  output: 'export',
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
