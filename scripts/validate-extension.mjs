import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const content = readFileSync("content.js", "utf8");
const popup = readFileSync("popup.js", "utf8");
const styles = readFileSync("styles.css", "utf8");

assert.equal(manifest.manifest_version, 3, "Manifest V3 is required");
assert.equal(manifest.version, "1.3.0");
assert.deepEqual(manifest.permissions, ["storage"]);
assert.deepEqual(manifest.host_permissions, ["https://osu.ppy.sh/*"]);
assert.ok(manifest.content_scripts.some((entry) =>
  entry.matches.includes("https://osu.ppy.sh/users/*")
  && entry.js.includes("content.js")
  && entry.css.includes("styles.css")
), "The content script must target osu! profiles");

const declaredIds = new Set([...content.matchAll(/id=\\?"([^"\\]+)\\?"/g)].map((match) => match[1]));
const referencedIds = new Set([...content.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]));
for (const id of referencedIds) {
  assert.ok(declaredIds.has(id), `The editor references missing element #${id}`);
}

for (const selector of [
  ".page-extra--userpage",
  ".page-extra__content-overflow-wrapper-outer",
  ".profile-detail-stats-card--solo .value-display",
  ".profile-stats__entry"
]) {
  assert.ok(content.includes(selector), `Expected osu!web selector is missing: ${selector}`);
}
assert.ok(styles.includes(".profile-info__bg"), "The actual osu! cover selector must be styled.");

for (const feature of [
  "chrome.storage.local",
  "osu-studio-custom-banner",
  "osu-studio-custom-stats",
  "optimizeImage",
  "wallpaperFile",
  "coverFile",
  "bannerFile",
  "--base-hue-override",
  "--colour-pink-hue",
  "osu-studio-has-wallpaper",
  "isNeutralColor",
  "osu-studio-monochrome",
  "rankChartColor",
  "playChartColor",
  "--osu-studio-rank-chart-color",
  "--osu-studio-play-chart-color",
  "osuProfileStudio:v1:"
]) {
  assert.ok(content.includes(feature), `Expected feature is missing: ${feature}`);
}

assert.ok(declaredIds.has("minimize"), "The editor needs an explicit collapse control");
assert.ok(declaredIds.has("launcher"), "The compact launcher must exist");
assert.ok(declaredIds.has("wallpaperFile"), "A local wallpaper file input must exist");
assert.ok(styles.includes("body.osu-studio-active.osu-studio-has-wallpaper"), "Full-page wallpaper styles are required");
assert.ok(styles.includes(".profile-detail-stats-card") && styles.includes("border-radius: 0 !important"), "Nested statistic cards must stay flat");
assert.ok(!styles.includes(".osu-studio-glass-surface"), "The old nested glass-card implementation must not return");
assert.ok(popup.includes("chrome.tabs.sendMessage"));
assert.ok((styles.match(/{/g) ?? []).length === (styles.match(/}/g) ?? []).length, "CSS braces must be balanced");

console.log(`Extension checks passed. ${referencedIds.size} editor controls are connected.`);

for (const selector of [
  ".nav2-header__menu-bg",
  ".nav2-header__transition-overlay",
  ".simple-menu--nav2",
  ".page-mode",
  ".osu-studio-monochrome"
]) {
  assert.ok(styles.includes(selector), `Missing themed navigation or neutral palette selector: ${selector}`);
}
assert.ok(content.includes('accent: "#d8d8dc"'), "Graphite must use a neutral grey accent.");
assert.ok(content.includes('accentAlt: "#96969e"'), "Graphite's secondary accent must also be neutral.");

for (const selector of [
  ".line-chart--profile-page-card .line-chart__line",
  ".line-chart--profile-page-card .line-chart__hover-line",
  ".line-chart--profile-page-card .line-chart__hover-circle",
  ".line-chart--profile-page:not(.line-chart--profile-page-card) .line-chart__line",
  ".line-chart--profile-page:not(.line-chart--profile-page-card) .line-chart__hover-line",
  ".line-chart--profile-page:not(.line-chart--profile-page-card) .line-chart__hover-circle"
]) {
  assert.ok(styles.includes(selector), `Missing independent chart-color selector: ${selector}`);
}
assert.ok(declaredIds.has("rankChartColor"), "Rank chart needs its own color picker.");
assert.ok(declaredIds.has("playChartColor"), "Monthly activity chart needs its own color picker.");
