import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const content = readFileSync("content.js", "utf8");
const popup = readFileSync("popup.js", "utf8");
const styles = readFileSync("styles.css", "utf8");

assert.equal(manifest.manifest_version, 3, "Manifest V3 is required");
assert.deepEqual(manifest.permissions, ["storage"], "Only local storage permission should be requested");
assert.deepEqual(manifest.host_permissions, ["https://osu.ppy.sh/*"]);
assert.ok(
  manifest.content_scripts.some((entry) =>
    entry.matches.includes("https://osu.ppy.sh/users/*")
      && entry.js.includes("content.js")
      && entry.css.includes("styles.css")
  ),
  "The content script must target osu! player profiles"
);

const declaredIds = new Set([...content.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const referencedIds = new Set([...content.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]));
for (const id of referencedIds) {
  assert.ok(declaredIds.has(id), `The editor references missing element #${id}`);
}

for (const selector of [
  ".profile-info__bg",
  ".page-extra--userpage",
  ".page-extra__content-overflow-wrapper-outer",
  ".profile-detail-stats-card--solo .value-display",
  ".profile-stats__entry"
]) {
  assert.ok(content.includes(selector), `Expected osu!web selector is missing: ${selector}`);
}

for (const feature of [
  "chrome.storage.local",
  "osu-studio-custom-banner",
  "osu-studio-custom-stats",
  "handleImageUpload",
  "safeImageUrl"
]) {
  assert.ok(content.includes(feature), `Expected extension feature is missing: ${feature}`);
}

assert.ok(popup.includes("chrome.tabs.sendMessage"));
assert.ok(styles.includes("backdrop-filter"));
assert.ok((styles.match(/{/g) ?? []).length === (styles.match(/}/g) ?? []).length, "CSS braces must be balanced");

console.log(`Extension checks passed. ${referencedIds.size} editor controls are connected.`);
