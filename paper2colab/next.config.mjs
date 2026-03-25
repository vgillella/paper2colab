/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse uses pdfjs-dist which has pdfjs-dist/legacy/build/pdf.mjs that
  // sets properties on non-objects when bundled by webpack.
  // Marking as external skips webpack bundling and uses Node require() directly.
  // pdf-parse uses pdfjs-dist which fails when bundled by webpack (CJS/ESM)
  // experimental.serverComponentsExternalPackages is the Next.js 14 option
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
};

export default nextConfig;
