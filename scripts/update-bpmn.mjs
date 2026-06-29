import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { bpmnEcosystemDeps } from "./ecosystem.mjs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const deps = bpmnEcosystemDeps(pkg);
if (deps.length === 0) {
  console.log("No bpmn-io ecosystem dependencies found.");
  process.exit(0);
}
console.log("Updating bpmn-io ecosystem:\n  " + deps.join("\n  ") + "\n");

function run(cmd) {
  console.log("> " + cmd);
  execSync(cmd, { stdio: "inherit" });
}

try {
  run(`npx --yes npm-check-updates -u ${deps.join(" ")}`);
  run("npm install");
  run("npm test");
  run("npm run typecheck");
  run("npm run build");
  console.log("\n✓ bpmn-io ecosystem updated; all gates passed.");
} catch {
  console.error(
    "\n✗ Update gate failed. Review with `git diff`, then revert if needed:\n" +
      "  git checkout -- package.json package-lock.json\n",
  );
  process.exit(1);
}
