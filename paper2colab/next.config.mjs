/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse uses pdfjs-dist which has pdfjs-dist/legacy/build/pdf.mjs that
  // sets properties on non-objects when bundled by webpack.
  // Marking as external skips webpack bundling and uses Node require() directly.
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
