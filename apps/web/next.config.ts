import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal packages are consumed as TypeScript source (CLAUDE.md, SPEC §4.1)
  // — there is no build step for them, so Next has to compile them itself.
  // Repo guidance lives in the root CLAUDE.md; don't scatter generated copies.
  agentRules: false,
  transpilePackages: ["@typefeud/game", "@typefeud/content", "@typefeud/protocol"],
};

export default nextConfig;
