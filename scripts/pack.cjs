// Canonical portable packaging for the Windows build.
//
// Uses @electron/packager PROGRAMMATICALLY (not the CLI): the CLI --ignore
// forward-slash regexes don't match Windows backslash paths, so it would
// recursively swallow release/ into a multi-GB asar. The programmatic `ignore`
// function below matches reliably on both separators. App icon is build/icon.ico.
//
// Run: node scripts/pack.cjs   (build dist/ first: npm run build)
const path = require("node:path");
const { packager } = require("@electron/packager");

// Exclude everything that isn't needed at runtime. Anchored at the repo root so
// dist/ (the built renderer) and electron/ (main+preload) are kept.
// NB: `release[^\\/]*` (not bare `release`) so it also excludes the accumulated one-off
// `release-r*` / `release-new` dirs — otherwise they get swallowed into the asar and it
// overflows the 4.2GB asar limit once a couple of them exist.
const EXCLUDE =
  /^[\\/](release[^\\/]*|node_modules|src|docs|e2e|coverage|scratchpad|build|test|test-results|playwright-report|playwright\.config\.ts|qa-workspace|\.git|\.vscode|\.superpowers|\.playwright-mcp|\.idea|dist[\\/].*\.map)([\\/]|$)/;

packager({
  dir: ".",
  name: "BPMN compartida",
  platform: "win32",
  arch: "x64",
  out: "release",
  overwrite: true,
  prune: false,
  icon: path.resolve(__dirname, "..", "build", "icon.ico"),
  ignore: (p) => p !== "" && EXCLUDE.test(p),
})
  .then((paths) => {
    console.log("PACKAGED_OK", paths.join(", "));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
