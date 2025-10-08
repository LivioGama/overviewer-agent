/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@overviewer-agent/shared"],
  output: "standalone",
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "http://localhost:3000",
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "development-secret-key",
  },
};

module.exports = nextConfig;
