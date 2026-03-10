import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import path from "node:path";
import url from "node:url";
import json from "@rollup/plugin-json";
import { glob } from "glob";

const isWatching = !!process.env.ROLLUP_WATCH;
const flexPlugin = "com.luis.webstorm.plugin";

export default {
  input: "src/plugin.js",
  output: {
    file: `${flexPlugin}/backend/plugin.cjs`,
    format: "cjs",
    sourcemap: isWatching,
    sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
      return url.pathToFileURL(
        path.resolve(path.dirname(sourcemapPath), relativeSourcePath)
      ).href;
    },
  },
  plugins: [
    json(),
    {
      name: "watch-externals",
      buildStart() {
        this.addWatchFile(`${flexPlugin}/manifest.json`);
        glob.sync(`${flexPlugin}/ui/*.vue`).forEach((f) => this.addWatchFile(f));
      },
    },
    nodeResolve({
      browser: false,
      exportConditions: ["node"],
      preferBuiltins: true,
    }),
    commonjs(),
    !isWatching && terser(),
    {
      name: "emit-module-package-file",
      generateBundle() {
        this.emitFile({
          fileName: "package.json",
          source: `{ "type": "module" }`,
          type: "asset",
        });
      },
    },
  ],
  external: ["fs", "path", "os", "util", "child_process", /^node:/],
};
