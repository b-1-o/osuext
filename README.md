# osu! Profile Studio

A local Chromium extension for turning an osu! player profile into a personalized page. The editor is injected into `https://osu.ppy.sh/users/*` and stores each profile design in the current browser.

## What it customizes

- **Full-page wallpaper:** paste an HTTPS image address or upload an image from your device. The wallpaper covers the profile page, with an adjustable darkening layer.
- **Profile cover:** replace the visible `.profile-info__bg` cover with an HTTPS image or local upload, and adjust its vertical position.
- **Real osu! color theme:** the main color picker updates osu!web's native `--base-hue-override` and color-hue variables. The secondary accent, panel color and text color are independently adjustable.
- **Independent profile chart colors:** choose separate colors for world-rank history and monthly games charts. The graph line, hover guide, point outline and tooltip heading follow each chart's own color.
- **Glass treatment:** enable or disable glass, tune blur and panel opacity, and choose a corner radius from square to rounded.
- **About Me banner:** add a title, description and optional local/remote image below the About Me content.
- **Player snapshot:** show a compact row of statistics already rendered on the osu! profile.
- **Per-profile settings:** designs are stored separately by profile ID in `chrome.storage.local`.

The editor is a compact round launcher in the lower-right corner. When opened, the launcher hides; use the minus button in the editor header or press Escape to collapse it. `Alt+Shift+O` toggles it.

## Install in Brave, Chrome or another Chromium browser

1. Download the [latest main branch ZIP](https://github.com/b-1-o/osuext/archive/refs/heads/main.zip) and extract it.
2. Open `brave://extensions` in Brave or `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the extracted `osuext-main` folder containing `manifest.json`.
5. Open an osu! player profile and refresh the page.
6. Click the small **OS** launcher in the lower-right corner, or press `Alt+Shift+O`.

After updating the extension files, open the extensions page and press the reload icon on osu! Profile Studio, then refresh the osu! profile tab.

## Image uploads

Uploads are optimized locally to WebP before being saved. The source file can be up to 24 MB; the stored optimized image is limited to approximately 1.2 MB. GIF uploads use the first frame. No image is sent to a third-party service.

## Privacy and limitations

All colors, uploaded images and custom sections are local browser customizations. They do **not** modify the profile or cover stored on osu!'s servers, and other players will not see them unless they also use this extension with the same settings. No osu! API key or account login is requested.

The extension follows osu!web's current profile DOM and CSS variables. If osu! changes its website structure, selectors may need an update. The CI checks syntax, controls, selectors and styling rules; a visual check on an actual Brave profile is still required after installing.

## Development

No build step or external dependencies are required. The extension uses Manifest V3, a content script, a stylesheet and a small popup.
