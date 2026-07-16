#!/usr/bin/env bun
import { resolve } from "node:path";

// Build script for Silly Sim Tracker.
//
// Wraps Bun.build() so the backend uses yaml's ESM browser entry rather than
// its CommonJS Node entry. The Node entry makes Bun emit import.meta.require,
// which Spindle correctly rejects as an unrestricted module-loader surface.
//
// The plugin also swaps out the `yaml` package's `!!binary` tag handler
// (yaml/dist/schema/yaml-1.1/binary.js).
// That handler does Buffer.from(s, "base64") / atob / btoa, which the
// Spindle host's startup scanner flags as a backend "base64 decoding"
// capability. We never parse !!binary tags, so we replace the module with
// a same-shape stub that throws if invoked — eliminating the base64
// codepath from the bundle entirely.

const yamlForSpindle = {
  name: "yaml-for-spindle",
  setup(build) {
    build.onResolve({ filter: /^yaml$/ }, () => ({
      path: resolve(import.meta.dir, "node_modules/yaml/browser/index.js"),
    }));

    build.onResolve({ filter: /[\\/]binary\.js$/ }, (args) => {
      if (!args.importer || !/[\\/]yaml[\\/](?:browser[\\/])?dist[\\/]schema[\\/]/.test(args.importer)) {
        return undefined;
      }
      return { path: "stub-yaml-binary", namespace: "stub-yaml-binary" };
    });

    build.onLoad({ filter: /.*/, namespace: "stub-yaml-binary" }, () => ({
      contents: `
export const binary = {
  identify: () => false,
  default: false,
  tag: "tag:yaml.org,2002:binary",
  resolve(src, onError) {
    if (typeof onError === "function") {
      onError("Binary YAML tags are not supported in this build");
    }
    return src;
  },
  stringify() {
    throw new Error("Binary YAML tags are not supported in this build");
  }
};
`,
      loader: "js",
    }));
  },
};

const targets = [
  { entrypoint: "src/backend.ts", target: "bun" },
  { entrypoint: "src/frontend.ts", target: "browser" },
];

let failed = false;
for (const t of targets) {
  const result = await Bun.build({
    entrypoints: [t.entrypoint],
    outdir: "dist",
    target: t.target,
    plugins: [yamlForSpindle],
  });

  if (!result.success) {
    failed = true;
    console.error(`Build failed for ${t.entrypoint}:`);
    for (const log of result.logs) console.error(log);
    continue;
  }

  for (const out of result.outputs) {
    const sizeMb = (out.size / 1024 / 1024).toFixed(2);
    console.log(`  ${out.path}  ${sizeMb} MB  (target: ${t.target})`);
  }
}

if (failed) process.exit(1);
