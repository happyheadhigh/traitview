#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const toolsDir = resolve(root, "tools");
const indexPath = resolve(root, "index.html");
const cssPath = resolve(root, "styles.css");
const jsPath = resolve(root, "app.js");
const backupPath = resolve(root, "index.before-modular.html");

if (!existsSync(indexPath)) {
  console.error("Could not find index.html. Run this from the repo root.");
  process.exit(1);
}

if (!existsSync(toolsDir)) mkdirSync(toolsDir);

const original = readFileSync(indexPath, "utf8");

if (!original.includes("<style") || !original.includes("<script")) {
  console.error("index.html does not look like the current monolithic TraitView file. Aborting.");
  process.exit(1);
}

let html = original;
const cssBlocks = [];
const jsBlocks = [];

// Extract all inline CSS blocks in document order.
html = html.replace(/\n?\s*<style\b[^>]*>([\s\S]*?)<\/style>\s*/gi, (_match, css) => {
  cssBlocks.push(css.trim());
  return "\n";
});

// Extract only inline scripts. External scripts like Plotly stay in index.html.
html = html.replace(/\n?\s*<script\b((?:(?!src=)[^>])*)>([\s\S]*?)<\/script>\s*/gi, (_match, attrs, js) => {
  jsBlocks.push(js.trim());
  return "\n";
});

const cssLink = '  <link rel="stylesheet" href="./styles.css">';
const appScript = '  <script src="./app.js" defer></script>';

if (!html.includes('href="./styles.css"')) {
  html = html.replace("</head>", `${cssLink}\n</head>`);
}

if (!html.includes('src="./app.js"')) {
  html = html.replace("</body>", `${appScript}\n</body>`);
}

const cssOut = `/* TraitView extracted styles.
   Generated from index.html by tools/split-index.mjs.
   Mechanical split only. No behavior or visual changes intended. */

${cssBlocks.join("\n\n/* ---- extracted style block ---- */\n\n")}
`;

const jsOut = `/* TraitView extracted app logic.
   Generated from index.html by tools/split-index.mjs.
   Classic script on purpose so existing inline onclick handlers still work. */

${jsBlocks.join("\n\n// ---- extracted script block ----\n\n")}
`;

writeFileSync(backupPath, original, "utf8");
writeFileSync(indexPath, html, "utf8");
writeFileSync(cssPath, cssOut, "utf8");
writeFileSync(jsPath, jsOut, "utf8");

console.log("TraitView modular split complete:");
console.log("  - index.html now links ./styles.css and ./app.js");
console.log("  - styles.css contains extracted inline CSS");
console.log("  - app.js contains extracted inline JS");
console.log("  - index.before-modular.html is a rollback backup");
console.log("");
console.log("Next checks:");
console.log("  git diff --stat");
console.log("  Open index.html with Live Server");