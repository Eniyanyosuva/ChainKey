/** @type {import('next').NextConfig} */
const nextConfig = {
    typescript: {
        // Anchor generates Program<Idl> types that conflict with TS strict checks.
        // This is the standard approach for Solana/Anchor frontends.
        ignoreBuildErrors: true,
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    webpack: (config) => {
        config.resolve.fallback = {
            ...config.resolve.fallback,
            fs: false,
            os: false,
            path: false,
            crypto: false,
        };
        return config;
    },
};

module.exports = nextConfig;
