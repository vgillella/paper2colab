/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse uses pdfjs-dist which fails when bundled by webpack (CJS/ESM conflict).
  // serverExternalPackages (top-level in Next.js 15) skips bundling and uses Node require() directly.
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
