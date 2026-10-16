import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O app é dinâmico (sessão em quase todas as páginas); renderização sob demanda é o padrão desejado.
  cacheComponents: false,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "gi.yatta.moe" },
      { protocol: "https", hostname: "genshin.jmp.blue" },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
