/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: {
    '/api/chat': ['./node_modules/sql.js/dist/sql-asm.js', './certs/*.pem'],
    '/api/analyze': ['./certs/*.pem'],
  },
};
