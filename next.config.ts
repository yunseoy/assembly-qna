import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse(및 내부적으로 쓰는 @napi-rs/canvas)는 Turbopack 번들링 없이
  // Node.js 런타임에서 그대로 실행되어야 워커 파일을 정상적으로 찾는다.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
};

export default nextConfig;
