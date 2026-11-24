# osu! Profile Studio

A local Chromium extension for customizing osu! player profile pages. It adds a compact visual editor directly to `https://osu.ppy.sh/users/*`.

## Features

- Replace the visible profile cover (`.profile-info__bg`) with an HTTPS image or a local upload.
- Set an optional page background and adjust the cover's vertical position.
- Choose accent, secondary and text colors, with Ruby Rose, Cold Glass and Violet Night presets.
- Apply a glass treatment to the profile header, detail/statistics panels and profile sections; tune blur and panel opacity.
- Add a custom banner immediately after the About Me content, with a title, description and optional background image.
- Add a compact player snapshot using values already rendered in the osu! profile statistics.
- Save settings separately for each profile ID in `chrome.storage.local`.
- Keep the editor isolated in a Shadow DOM so its controls do not inherit the website's styles.

## Install in Chrome, Brave or another Chromium browser

1. Download this repository as a ZIP and extract it.
2. Open `chrome://extensions` (in Brave, open `brave://extensions`).
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the extracted `osuext` folder (the folder containing `manifest.json`).
5. Open an osu! player profile and reload the page.
6. Use the **PROFILE STUDIO** floating button at the lower-right corner, or open the extension popup and choose **Open profile editor**.

## Local storage and privacy

All theme values and uploaded cover images are saved in the browser's `chrome.storage.local`, keyed by the profile ID in the URL. This extension does not send profile settings or uploaded images to a third-party service, does not request an osu! API key, and does not change the cover or profile data stored on osu!'s servers.

Customizations are visible only in the browser where the extension is installed. Other osu! users will not see them.

## Notes

- The custom cover replaces the cover image visually on the local page. It does not upload a new official osu! cover.
- Local cover uploads are limited to 4 MB and common image formats.
- The player snapshot reads the statistics elements already rendered by osu!web. If a section or statistic is not present on a particular profile or game mode, that value is omitted.
- The extension targets the current osu!web profile structure. osu!web updates may require selector adjustments.

## Development

No build step or external JavaScript dependencies are required. The extension uses Manifest V3, a content script, a stylesheet and a small popup.
