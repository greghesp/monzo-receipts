// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    instrumentationHook: true,
    // pdfkit reads .afm font files from disk at runtime — webpack breaks those
    // relative paths when bundling, so we exclude it from the bundle entirely.
    serverComponentsExternalPackages: ['pdfkit', 'puppeteer', 'pdf-parse', 'pdfjs-dist'],
  },
  webpack(config, { isServer }) {
    if (isServer) {
      // serverComponentsExternalPackages covers RSC/route handlers but NOT the
      // instrumentation hook, which uses a separate webpack compilation.
      // Externalising pdf-parse (and its pdfjs-dist dependency) here ensures
      // webpack never tries to bundle them in any server context, preventing the
      // ESM/Worker handling that breaks the instrumentation compile.
      const prev = Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)
      config.externals = [...prev, 'pdf-parse', 'pdfjs-dist']
    }
    return config
  },
}

export default nextConfig
