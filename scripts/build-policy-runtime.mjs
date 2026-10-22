import { build } from "esbuild";

// @tideorg/js currently publishes extensionless ESM directory imports. Bundle
// its parser for Node instead of patching node_modules or reimplementing bytes.
await build({
  entryPoints: ["server/tide-policy-runtime.js"],
  outfile: ".cache/tide-policy-runtime.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  logLevel: "warning",
});
