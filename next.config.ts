import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "framer-motion",
      "@supabase/ssr",
      "@supabase/supabase-js",
      "clsx",
      "tailwind-merge",
      "react-hot-toast",
    ],
  },
};

export default nextConfig;
