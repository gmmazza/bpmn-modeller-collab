const path = require("node:path");

// Resolve `rel` against `root` and guarantee the result stays inside `root`.
// rel === "" yields root itself. Throws on any escape (.. or absolute outside).
function resolveWithinRoot(root, rel) {
  const normRoot = path.resolve(root);
  const resolved = path.resolve(normRoot, rel);
  if (resolved !== normRoot && !resolved.startsWith(normRoot + path.sep)) {
    throw new Error(`path escapes root: ${rel}`);
  }
  return resolved;
}

module.exports = { resolveWithinRoot };
