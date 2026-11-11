/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Keep the Firebase Admin SDK as a normal Node dependency instead of bundling it.
  serverExternalPackages: ["firebase-admin"],
};

module.exports = nextConfig;
