/*
 * Stages the deployable site into dist/.
 *
 * Cloudflare Pages uploads every file in the directory you point it at, and
 * `wrangler pages deploy` does NOT honour .assetsignore (that's a Workers
 * static-assets feature). So deploying the repo root would publish README.md,
 * validate.js and bundle.js too. Staging into dist/ keeps the deploy to just
 * the files the game actually serves.
 *
 * Run:  node build.js       (runs validate + bundle first)
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const RUNTIME_FILES = [
  "index.html",
  "styles.css",
  "game.js",
  "puzzles.js",
  "puzzles.json"
];

// Fail the build on a malformed archive, and make sure the file:// mirror of
// puzzles.json is current before it gets copied.
execFileSync("node", [path.join(__dirname, "validate.js")], { stdio: "inherit" });
execFileSync("node", [path.join(__dirname, "bundle.js")], { stdio: "inherit" });

const dist = path.join(__dirname, "dist");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist);

for (const file of RUNTIME_FILES) {
  fs.copyFileSync(path.join(__dirname, file), path.join(dist, file));
}

console.log(`✓ dist/ staged with ${RUNTIME_FILES.length} files`);
