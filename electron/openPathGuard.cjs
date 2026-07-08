// Allowlist of extensions safe to hand to the OS default-app opener. MUST mirror
// OPENABLE_EXTS in src/fuentes/fuentesPreview.ts. Executables/scripts are NOT here:
// shell.openPath on an .exe would EXECUTE it, and the source folder is cloud-synced,
// so a hostile file can appear without the user creating it.
const OPENABLE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg",
  "pdf", "html", "htm", "md", "txt", "csv",
  "doc", "docx", "ppt", "pptx", "xls", "xlsx", "odt", "ods", "odp",
]);

function isOpenableExt(name) {
  const i = String(name).lastIndexOf(".");
  if (i <= 0) return false;
  return OPENABLE_EXTS.has(String(name).slice(i + 1).toLowerCase());
}

module.exports = { OPENABLE_EXTS, isOpenableExt };
