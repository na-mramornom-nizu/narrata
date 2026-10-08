/** @type {import('next').NextConfig} */
module.exports = { reactStrictMode: true, experimental: { outputFileTracingIncludes: { '/api/chat': ['./node_modules/sql.js/dist/sql-asm.js'] } } };
