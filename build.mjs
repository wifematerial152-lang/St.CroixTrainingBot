import esbuild from "esbuild";

esbuild.build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  sourcemap: true
});
