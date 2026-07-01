// Alternativa de empaquetado portable para PROBAR la feature de documentación
// (rama feat/knowledge-procesos-fundacion) sin pisar el .exe principal.
// Mismo enfoque que scripts/pack.cjs, pero con un nombre de producto distinto,
// así sale en su propia carpeta release/ y se distingue del ejecutable normal.
//
// Run: node scripts/pack-docs-preview.cjs   (build dist/ primero: npm run build)
const path = require("node:path");
const { packager } = require("@electron/packager");

const EXCLUDE =
  /^[\\/](release|node_modules|src|docs|e2e|coverage|scratchpad|build|test|\.git|\.vscode|\.superpowers|\.playwright-mcp|\.idea|dist[\\/].*\.map)([\\/]|$)/;

packager({
  dir: ".",
  name: process.env.PACK_NAME || "BPMN compartida (docs preview)",
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
