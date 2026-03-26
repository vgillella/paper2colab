/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse uses pdfjs-dist which fails when bundled by webpack (CJS/ESM conflict).
  // serverExternalPackages (top-level in Next.js 15) skips bundling and uses Node require() directly.
  serverExternalPackages: ['pdf-parse'],

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent the page from being embedded in iframes (clickjacking protection)
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Do not send Referer header (API key leak prevention)
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // Restrict browser feature access
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Content Security Policy — allows Next.js inline scripts and Google Fonts
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data:",
              "connect-src 'self' https://api.openai.com https://api.github.com",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
