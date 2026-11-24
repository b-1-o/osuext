(() => {
  "use strict";

  const DEFAULTS = {
    coverImage: "",
    wallpaperImage: "",
    bannerImage: "",
    accent: "#e96a9e",
    accentAlt: "#9a78c7",
    surfaceColor: "#17141c",
    textColor: "#f5f0f4",
    rankChartColor: "#ffcc22",
    playChartColor: "#ffcc22",
    glass: true,
    blur: 16,
    surfaceOpacity: 62,
    wallpaperDim: 18,
    cornerRadius: 0,
    coverPosition: 50,
    showBanner: false,
    bannerTitle: "Beyond the rhythm",
    bannerText: "A little space to make this profile yours.",
    showStats: true
  };

  const ROOT_ID = "osu-profile-studio-root";
  const MAX_INPUT_BYTES = 24 * 1024 * 1024;
  const MAX_STORED_IMAGE_BYTES = 1200 * 1024;
  const MAX_IMAGE_SIDE = 2200;
  const allowedImageTypes = new Set([
    "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"
  ]);

  let profileId = null;
  let settings = { ...DEFAULTS };
  let host = null;
  let shadow = null;
  let observer = null;
  let mutationTimer = null;
  let renderPending = false;

  const $ = (id) => shadow?.getElementById(id) ?? null;
  const clamp = (value, min, max) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
  };

  function currentProfileId() {
    const match = location.pathname.match(/^\/users\/([^/]+)/i);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function storageKey(id = profileId) {
    return "osuProfileStudio:v2:" + (id || "unknown");
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (result) => {
          if (chrome.runtime?.lastError) return resolve(null);
          resolve(result?.[key] ?? null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set({ [key]: value }, () => {
          const error = chrome.runtime?.lastError;
          if (error) reject(new Error(error.message));
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function storageRemove(key) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.remove([key], () => {
          const error = chrome.runtime?.lastError;
          if (error) reject(new Error(error.message));
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function safeImageUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(raw)) return raw;
    try {
      const parsed = new URL(raw);
      return parsed.protocol === "https:" ? parsed.href : "";
    } catch {
      return "";
    }
  }

  function validColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
  }

  function normalizeSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      ...DEFAULTS,
      coverImage: safeImageUrl(source.coverImage),
      wallpaperImage: safeImageUrl(source.wallpaperImage ?? source.pageImage),
      bannerImage: safeImageUrl(source.bannerImage),
      accent: validColor(source.accent, DEFAULTS.accent),
      accentAlt: validColor(source.accentAlt ?? source.accent2, DEFAULTS.accentAlt),
      surfaceColor: validColor(source.surfaceColor, DEFAULTS.surfaceColor),
      textColor: validColor(source.textColor, DEFAULTS.textColor),
      rankChartColor: validColor(source.rankChartColor, DEFAULTS.rankChartColor),
      playChartColor: validColor(source.playChartColor, DEFAULTS.playChartColor),
      glass: source.glass !== false,
      blur: clamp(source.blur, 0, 30),
      surfaceOpacity: clamp(source.surfaceOpacity ?? source.opacity, 35, 98),
      wallpaperDim: clamp(source.wallpaperDim, 0, 80),
      cornerRadius: clamp(source.cornerRadius, 0, 20),
      coverPosition: clamp(source.coverPosition, 0, 100),
      showBanner: source.showBanner === true,
      bannerTitle: String(source.bannerTitle ?? DEFAULTS.bannerTitle).slice(0, 90),
      bannerText: String(source.bannerText ?? DEFAULTS.bannerText).slice(0, 360),
      showStats: source.showStats !== false
    };
  }

  function hexToRgb(hex) {
    const value = String(hex).replace("#", "");
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function hexToHue(hex) {
    const { r, g, b } = hexToRgb(hex);
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    if (delta === 0) return 0;
    let hue;
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    return Math.round((hue * 60 + 360) % 360);
  }

  function colorSaturation(hex) {
    const { r, g, b } = hexToRgb(hex);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
  }

  function isNeutralColor(hex) {
    return colorSaturation(hex) < 0.085;
  }

  function hexToRgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
  }

  function cssUrl(value) {
    return value ? "url(" + JSON.stringify(value) + ")" : "none";
  }

  function setCssImage(element, property, value) {
    if (value) element.style.setProperty(property, cssUrl(value));
    else element.style.removeProperty(property);
  }

  function createPanel() {
    const existing = document.getElementById(ROOT_ID);
    if (existing) {
      existing.remove();
    }

    host = document.createElement("div");
    host.id = ROOT_ID;
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = "<style>\n" +
      ":host { all: initial; color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }\n" +
      "* { box-sizing: border-box; }\n" +
      ".launcher { position: fixed; z-index: 2147483000; right: 22px; bottom: 22px; width: 44px; height: 44px; display: grid; place-items: center; padding: 0; border: 1px solid rgba(255,255,255,.18); border-radius: 50%; color: #fff; background: rgba(24,19,28,.88); box-shadow: 0 5px 22px rgba(0,0,0,.36), inset 0 1px rgba(255,255,255,.14); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); cursor: pointer; transition: transform .18s, background .18s; }\n" +
      ".launcher:hover { transform: translateY(-2px); background: rgba(60,35,54,.96); }\n" +
      ".launcher-mark { display: grid; place-items: center; width: 29px; height: 29px; border-radius: 50%; color: #fff; background: linear-gradient(145deg,#df75a7,#805080); font-size: 10px; font-weight: 900; letter-spacing: -.06em; }\n" +
      ":host(.is-open) .launcher { display: none; }\n" +
      ".panel { position: fixed; z-index: 2147483001; right: 22px; bottom: 22px; width: min(430px, calc(100vw - 24px)); max-height: min(84vh, 820px); display: flex; flex-direction: column; overflow: hidden; color: #f5eff4; background: rgba(17,14,21,.97); border: 1px solid rgba(255,255,255,.14); border-radius: 18px; box-shadow: 0 22px 80px rgba(0,0,0,.58); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); }\n" +
      ".panel[hidden] { display: none !important; }\n" +
      ".header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 15px 17px; border-bottom: 1px solid rgba(255,255,255,.09); background: linear-gradient(110deg,rgba(210,100,151,.12),transparent 72%); }\n" +
      ".heading { color: #fff; font-size: 15px; font-weight: 850; letter-spacing: -.035em; }\n" +
      ".subheading { margin-top: 4px; color: #a99da7; font-size: 10px; }\n" +
      ".minimize { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; color: #f7edf3; background: rgba(255,255,255,.06); font-size: 18px; cursor: pointer; }\n" +
      ".minimize:hover { background: rgba(255,255,255,.13); }\n" +
      ".body { overflow: auto; padding: 4px 17px 18px; scrollbar-width: thin; scrollbar-color: #654157 transparent; }\n" +
      ".section { padding: 15px 0; border-bottom: 1px solid rgba(255,255,255,.075); }\n" +
      ".section:last-of-type { border-bottom: 0; }\n" +
      ".section-title { margin: 0 0 12px; color: #f1dce8; font-size: 10px; font-weight: 850; letter-spacing: .13em; text-transform: uppercase; }\n" +
      "label { display: block; margin: 10px 0 6px; color: #cbbdc7; font-size: 11px; font-weight: 650; }\n" +
      "input[type=text], textarea { display: block; width: 100%; min-width: 0; padding: 10px 11px; outline: none; color: #fff; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.13); border-radius: 8px; font: inherit; font-size: 11px; }\n" +
      "input[type=text]:focus, textarea:focus { border-color: #bd7197; background: rgba(255,255,255,.08); }\n" +
      "textarea { min-height: 70px; resize: vertical; line-height: 1.5; }\n" +
      "input[type=color] { width: 42px; height: 34px; padding: 2px; border: 1px solid rgba(255,255,255,.15); border-radius: 7px; background: rgba(255,255,255,.06); cursor: pointer; }\n" +
      "input[type=range] { width: 100%; accent-color: #d77ba5; cursor: pointer; }\n" +
      "input[type=file] { display: block; width: 100%; color: #afa2ac; font-size: 10px; }\n" +
      "input[type=file]::file-selector-button { margin-right: 9px; padding: 7px 10px; border: 1px solid rgba(255,255,255,.14); border-radius: 7px; color: #eee3eb; background: rgba(255,255,255,.07); font: inherit; cursor: pointer; }\n" +
      ".color-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }\n" +
      ".color-cell { display: flex; align-items: center; gap: 9px; }\n" +
      ".color-cell span { color: #b9acb6; font-size: 10px; }\n" +
      ".presets { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 12px; }\n" +
      ".preset { padding: 7px 10px; color: #e9dfe6; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 7px; font-size: 10px; cursor: pointer; }\n" +
      ".preset:hover { border-color: #c37ba0; }\n" +
      ".toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 0 12px; color: #e9dfe6; font-size: 11px; }\n" +
      ".toggle-row input { width: 16px; height: 16px; accent-color: #d77ba5; }\n" +
      ".range-label { display: flex; justify-content: space-between; gap: 10px; }\n" +
      ".range-label output { padding-top: 9px; color: #ddaac4; font-size: 10px; font-variant-numeric: tabular-nums; }\n" +
      ".file-note { margin-top: 5px; color: #91848e; font-size: 9px; line-height: 1.45; }\n" +
      ".clear-image { display: none; margin-top: 7px; padding: 5px 0; border: 0; color: #c7a9ba; background: transparent; font-size: 10px; text-decoration: underline; cursor: pointer; }\n" +
      ".clear-image.visible { display: inline-block; }\n" +
      ".actions { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding-top: 15px; }\n" +
      ".save { padding: 11px 14px; color: white; background: linear-gradient(110deg,#c25e8d,#84527f); border: 0; border-radius: 9px; font-size: 11px; font-weight: 850; cursor: pointer; }\n" +
      ".reset { padding: 11px 12px; color: #dfd1db; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.12); border-radius: 9px; font-size: 11px; cursor: pointer; }\n" +
      ".message { min-height: 15px; margin-top: 8px; color: #dca9c3; font-size: 10px; line-height: 1.45; }\n" +
      ".notice { margin: 11px 0 0; color: #938791; font-size: 9px; line-height: 1.5; }\n" +
      "@media(max-width:480px) { .launcher { right: 12px; bottom: 12px; } .panel { right: 12px; bottom: 12px; width: calc(100vw - 24px); max-height: 88vh; } }\n" +
      "</style>\n" +
      "<button class=\"launcher\" id=\"launcher\" type=\"button\" aria-label=\"Open Profile Studio\" title=\"Open Profile Studio\"><span class=\"launcher-mark\">OS</span></button>\n" +
      "<section class=\"panel\" id=\"panel\" aria-label=\"osu! Profile Studio editor\" hidden>\n" +
      "  <header class=\"header\"><div><div class=\"heading\">Profile Studio</div><div class=\"subheading\">Personalize this profile on your device</div></div><button class=\"minimize\" id=\"minimize\" type=\"button\" title=\"Collapse Profile Studio\" aria-label=\"Collapse Profile Studio\">−</button></header>\n" +
      "  <div class=\"body\">\n" +
      "    <section class=\"section\"><h2 class=\"section-title\">Cover image</h2>\n" +
      "      <label for=\"coverUrl\">Image address</label><input id=\"coverUrl\" type=\"text\" placeholder=\"https://example.com/cover.jpg\" autocomplete=\"off\">\n" +
      "      <label for=\"coverFile\">Upload from device</label><input id=\"coverFile\" type=\"file\" accept=\"image/png,image/jpeg,image/webp,image/gif,image/avif\">\n" +
      "      <div class=\"file-note\" id=\"coverNote\">Select a picture from your device or paste an HTTPS address.</div><button class=\"clear-image\" id=\"clearCover\" type=\"button\">Remove cover</button>\n" +
      "      <div class=\"range-label\"><label for=\"coverPosition\">Image position</label><output id=\"coverPositionValue\">50%</output></div><input id=\"coverPosition\" type=\"range\" min=\"0\" max=\"100\" value=\"50\">\n" +
      "    </section>\n" +
      "    <section class=\"section\"><h2 class=\"section-title\">Page wallpaper</h2>\n" +
      "      <label for=\"wallpaperUrl\">Wallpaper address</label><input id=\"wallpaperUrl\" type=\"text\" placeholder=\"https://example.com/wallpaper.jpg\" autocomplete=\"off\">\n" +
      "      <label for=\"wallpaperFile\">Upload wallpaper from device</label><input id=\"wallpaperFile\" type=\"file\" accept=\"image/png,image/jpeg,image/webp,image/gif,image/avif\">\n" +
      "      <div class=\"file-note\" id=\"wallpaperNote\">The image will fill the profile page background, not just one section.</div><button class=\"clear-image\" id=\"clearWallpaper\" type=\"button\">Remove wallpaper</button>\n" +
      "      <div class=\"range-label\"><label for=\"wallpaperDim\">Wallpaper darkening</label><output id=\"wallpaperDimValue\">18%</output></div><input id=\"wallpaperDim\" type=\"range\" min=\"0\" max=\"80\" value=\"18\">\n" +
      "    </section>\n" +
      "    <section class=\"section\"><h2 class=\"section-title\">Full color palette</h2>\n" +
      "      <div class=\"presets\"><button class=\"preset\" data-preset=\"ruby\" type=\"button\">Ruby</button><button class=\"preset\" data-preset=\"ice\" type=\"button\">Ice</button><button class=\"preset\" data-preset=\"violet\" type=\"button\">Violet</button><button class=\"preset\" data-preset=\"graphite\" type=\"button\">Graphite</button></div>\n" +
      "      <div class=\"color-grid\">\n" +
      "        <div><label for=\"accent\">Main profile hue</label><div class=\"color-cell\"><input id=\"accent\" type=\"color\"><span>Changes osu! colors</span></div></div>\n" +
      "        <div><label for=\"accentAlt\">Secondary accent</label><div class=\"color-cell\"><input id=\"accentAlt\" type=\"color\"><span>Highlights</span></div></div>\n" +
      "        <div><label for=\"surfaceColor\">Panel color</label><div class=\"color-cell\"><input id=\"surfaceColor\" type=\"color\"><span>Profile surfaces</span></div></div>\n" +
      "        <div><label for=\"textColor\">Text color</label><div class=\"color-cell\"><input id=\"textColor\" type=\"color\"><span>Profile text</span></div></div>\n" +
      "      </div>\n" +
      "    </section>\n" +
      "    <section class=\"section\"><h2 class=\"section-title\">Chart line colors</h2>\n" +
      "      <div class=\"color-grid\">\n" +
      "        <div><label for=\"rankChartColor\">World ranking history</label><div class=\"color-cell\"><input id=\"rankChartColor\" type=\"color\"><span>Rank chart</span></div></div>\n" +
      "        <div><label for=\"playChartColor\">Monthly games</label><div class=\"color-cell\"><input id=\"playChartColor\" type=\"color\"><span>Activity chart</span></div></div>\n" +
      "      </div>\n" +
      "      <div class=\"file-note\">Each color controls its chart line, hover guide and point outline independently. Choose any color, including white or red.</div>\n" +
      "    </section>\n" +
      "    <section class=\"section\"><h2 class=\"section-title\">Glass and panel style</h2>\n" +
      "      <div class=\"toggle-row\"><span>Glass surfaces</span><input id=\"glass\" type=\"checkbox\"></div>\n" +
      "      <div class=\"range-label\"><label for=\"blur\">Glass blur</label><output id=\"blurValue\">16 px</output></div><input id=\"blur\" type=\"range\" min=\"0\" max=\"30\" value=\"16\">\n" +
      "      <div class=\"range-label\"><label for=\"surfaceOpacity\">Panel opacity</label><output id=\"surfaceOpacityValue\">84%</output></div><input id=\"surfaceOpacity\" type=\"range\" min=\"35\" max=\"98\" value=\"84\">\n" +
      "      <div class=\"range-label\"><label for=\"cornerRadius\">Panel corner radius</label><output id=\"cornerRadiusValue\">8 px</output></div><input id=\"cornerRadius\" type=\"range\" min=\"0\" max=\"20\" value=\"8\">\n" +
      "    </section>\n" +
      "    <section class=\"section\"><h2 class=\"section-title\">About me banner</h2>\n" +
      "      <div class=\"toggle-row\"><span>Show custom banner below About me</span><input id=\"showBanner\" type=\"checkbox\"></div>\n" +
      "      <label for=\"bannerTitle\">Heading</label><input id=\"bannerTitle\" type=\"text\" maxlength=\"90\" placeholder=\"Your headline\">\n" +
      "      <label for=\"bannerText\">Description</label><textarea id=\"bannerText\" maxlength=\"360\" placeholder=\"Write a short introduction...\"></textarea>\n" +
      "      <label for=\"bannerUrl\">Banner image address (optional)</label><input id=\"bannerUrl\" type=\"text\" placeholder=\"https://example.com/banner.jpg\" autocomplete=\"off\">\n" +
      "      <label for=\"bannerFile\">Upload banner image</label><input id=\"bannerFile\" type=\"file\" accept=\"image/png,image/jpeg,image/webp,image/gif,image/avif\">\n" +
      "      <div class=\"file-note\" id=\"bannerNote\">This image is used only for the custom About me banner.</div><button class=\"clear-image\" id=\"clearBanner\" type=\"button\">Remove banner image</button>\n" +
      "    </section>\n" +
      "    <section class=\"section\"><h2 class=\"section-title\">Player statistics</h2>\n" +
      "      <div class=\"toggle-row\"><span>Show a compact statistics strip</span><input id=\"showStats\" type=\"checkbox\"></div>\n" +
      "      <div class=\"file-note\">Reads values that osu! already displays on this profile. Unavailable statistics are omitted.</div>\n" +
      "    </section>\n" +
      "    <div class=\"actions\"><button class=\"save\" id=\"save\" type=\"button\">Save profile design</button><button class=\"reset\" id=\"reset\" type=\"button\">Reset</button></div>\n" +
      "    <div class=\"message\" id=\"message\" role=\"status\" aria-live=\"polite\"></div>\n" +
      "    <p class=\"notice\">The design is saved locally in this browser. It does not change the profile on osu! servers or what other players see.</p>\n" +
      "  </div>\n" +
      "</section>";
    document.documentElement.appendChild(host);
    wirePanel();
  }

  function setPanelOpen(open) {
    const panel = $("panel");
    if (!panel) return;
    panel.hidden = !open;
    host.classList.toggle("is-open", open);
    $("launcher")?.setAttribute("aria-expanded", String(open));
  }

  function showMessage(message, isError = false) {
    const node = $("message");
    if (!node) return;
    node.textContent = message;
    node.style.color = isError ? "#ff9eaa" : "#dca9c3";
  }

  function updateImageButtons() {
    const pairs = [
      ["clearCover", settings.coverImage],
      ["clearWallpaper", settings.wallpaperImage],
      ["clearBanner", settings.bannerImage]
    ];
    for (const [id, value] of pairs) {
      $(id)?.classList.toggle("visible", Boolean(value));
    }
  }

  function updateRangeLabels() {
    if (!$("blur")) return;
    $("blurValue").textContent = $("blur").value + " px";
    $("surfaceOpacityValue").textContent = $("surfaceOpacity").value + "%";
    $("wallpaperDimValue").textContent = $("wallpaperDim").value + "%";
    $("coverPositionValue").textContent = $("coverPosition").value + "%";
    $("cornerRadiusValue").textContent = $("cornerRadius").value + " px";
  }

  function fillControls() {
    if (!shadow) return;
    $("coverUrl").value = settings.coverImage.startsWith("https://") ? settings.coverImage : "";
    $("wallpaperUrl").value = settings.wallpaperImage.startsWith("https://") ? settings.wallpaperImage : "";
    $("bannerUrl").value = settings.bannerImage.startsWith("https://") ? settings.bannerImage : "";
    $("coverFile").value = "";
    $("wallpaperFile").value = "";
    $("bannerFile").value = "";
    $("coverNote").textContent = settings.coverImage.startsWith("data:image/")
      ? "A local cover image is saved for this profile."
      : "Select a picture from your device or paste an HTTPS address.";
    $("wallpaperNote").textContent = settings.wallpaperImage.startsWith("data:image/")
      ? "A local wallpaper image is saved for this profile."
      : "The image will fill the profile page background, not just one section.";
    $("bannerNote").textContent = settings.bannerImage.startsWith("data:image/")
      ? "A local banner image is saved for this profile."
      : "This image is used only for the custom About me banner.";
    $("accent").value = settings.accent;
    $("accentAlt").value = settings.accentAlt;
    $("surfaceColor").value = settings.surfaceColor;
    $("textColor").value = settings.textColor;
    $("rankChartColor").value = settings.rankChartColor;
    $("playChartColor").value = settings.playChartColor;
    $("glass").checked = settings.glass;
    $("blur").value = String(settings.blur);
    $("surfaceOpacity").value = String(settings.surfaceOpacity);
    $("wallpaperDim").value = String(settings.wallpaperDim);
    $("cornerRadius").value = String(settings.cornerRadius);
    $("coverPosition").value = String(settings.coverPosition);
    $("showBanner").checked = settings.showBanner;
    $("bannerTitle").value = settings.bannerTitle;
    $("bannerText").value = settings.bannerText;
    $("showStats").checked = settings.showStats;
    updateRangeLabels();
    updateImageButtons();
  }

  function pullControlsIntoSettings() {
    if (!shadow) return;
    settings = normalizeSettings({
      ...settings,
      accent: $("accent").value,
      accentAlt: $("accentAlt").value,
      surfaceColor: $("surfaceColor").value,
      textColor: $("textColor").value,
      rankChartColor: $("rankChartColor").value,
      playChartColor: $("playChartColor").value,
      glass: $("glass").checked,
      blur: $("blur").value,
      surfaceOpacity: $("surfaceOpacity").value,
      wallpaperDim: $("wallpaperDim").value,
      cornerRadius: $("cornerRadius").value,
      coverPosition: $("coverPosition").value,
      showBanner: $("showBanner").checked,
      bannerTitle: $("bannerTitle").value,
      bannerText: $("bannerText").value,
      showStats: $("showStats").checked
    });
    updateRangeLabels();
  }

  function applySettings() {
    if (!document.body) return;
    const body = document.body;
    const mainHue = hexToHue(settings.accent);
    const secondaryHue = hexToHue(settings.accentAlt);
    const monochrome = isNeutralColor(settings.accent) && isNeutralColor(settings.accentAlt);
    const opacity = settings.glass ? settings.surfaceOpacity / 100 : 0.97;
    const surface = hexToRgba(settings.surfaceColor, opacity);

    body.classList.add("osu-studio-active");
    body.classList.toggle("osu-studio-has-wallpaper", Boolean(settings.wallpaperImage));
    body.classList.toggle("osu-studio-has-cover", Boolean(settings.coverImage));
    body.classList.toggle("osu-studio-monochrome", monochrome);

    // osu! builds most of its UI palette from hue-only CSS variables. A grey
    // colour has no meaningful hue, so letting it become 0° would turn the
    // site red/orange. In neutral mode we remove those overrides and let the
    // stylesheet's monochrome token set below handle the entire UI instead.
    if (monochrome) {
      body.style.removeProperty("--base-hue-override");
      body.style.removeProperty("--colour-pink-hue");
      body.style.removeProperty("--colour-purple-hue");
    } else {
      body.style.setProperty("--base-hue-override", String(mainHue));
      body.style.setProperty("--colour-pink-hue", String(mainHue));
      body.style.setProperty("--colour-purple-hue", String(secondaryHue));
    }

    body.style.setProperty("--osu-studio-accent", settings.accent);
    body.style.setProperty("--osu-studio-accent-alt", settings.accentAlt);
    body.style.setProperty("--osu-studio-surface", surface);
    body.style.setProperty("--osu-studio-text", settings.textColor);
    body.style.setProperty("--osu-studio-rank-chart-color", settings.rankChartColor);
    body.style.setProperty("--osu-studio-play-chart-color", settings.playChartColor);
    body.style.setProperty("--osu-studio-blur", settings.glass ? settings.blur + "px" : "0px");
    body.style.setProperty("--osu-studio-radius", settings.cornerRadius + "px");
    body.style.setProperty("--osu-studio-wallpaper-dim", String(settings.wallpaperDim / 100));
    body.style.setProperty("--osu-studio-cover-position", settings.coverPosition + "%");
    setCssImage(body, "--osu-studio-wallpaper-image", settings.wallpaperImage);
    setCssImage(body, "--osu-studio-cover-image", settings.coverImage);
  }

  function findAboutAnchor() {
    const userPage = document.querySelector(".page-extra--userpage");
    return userPage?.querySelector(".page-extra__content-overflow-wrapper-outer")
      || userPage?.querySelector(".page-extra__content-overflow-wrapper-inner")
      || userPage
      || document.querySelector('[data-page-id="me"]')
      || document.querySelector(".user-profile-pages")
      || null;
  }

  function makeBanner() {
    const node = document.createElement("section");
    node.className = "osu-studio-custom-banner";
    node.dataset.osuStudio = "banner";
    const content = document.createElement("div");
    content.className = "osu-studio-custom-banner__content";
    const eyebrow = document.createElement("span");
    eyebrow.className = "osu-studio-custom-banner__eyebrow";
    eyebrow.textContent = "PROFILE NOTE";
    const title = document.createElement("h2");
    title.className = "osu-studio-custom-banner__title";
    title.dataset.role = "title";
    const description = document.createElement("p");
    description.className = "osu-studio-custom-banner__text";
    description.dataset.role = "text";
    content.append(eyebrow, title, description);
    node.append(content);
    return node;
  }

  function readProfileStats() {
    const candidates = [...document.querySelectorAll(
      ".profile-stats__entry, .profile-detail-stats-card--solo .value-display, [data-stat]"
    )];
    const definitions = [
      { label: "PP", aliases: /^(pp|performance|performance points?)$/i },
      { label: "Global rank", aliases: /^(global|global rank|world rank)$/i },
      { label: "Country rank", aliases: /^(country|country rank|national rank)$/i },
      { label: "Accuracy", aliases: /accuracy/i },
      { label: "Play count", aliases: /play count/i },
      { label: "Ranked score", aliases: /ranked score/i },
      { label: "Maximum combo", aliases: /maximum combo/i },
      { label: "Total hits", aliases: /total hits/i }
    ];
    const found = [];
    const labels = new Set();

    for (const definition of definitions) {
      const element = candidates.find((candidate) => {
        const labelNode = candidate.querySelector(".profile-stats__key, .value-display__label");
        const label = (labelNode?.innerText || labelNode?.textContent || "").replace(/\s+/g, " ").trim();
        return label ? definition.aliases.test(label) : false;
      });
      if (!element) continue;
      const valueNode = element.querySelector(".profile-stats__value, .value-display__value");
      const value = (valueNode?.innerText || valueNode?.textContent || "").replace(/\s+/g, " ").trim();
      if (value && value.length <= 48 && !labels.has(definition.label)) {
        found.push({ label: definition.label, value });
        labels.add(definition.label);
      }
    }
    return found;
  }

  function renderProfileSections() {
    if (!document.body || !profileId) return;

    const anchor = findAboutAnchor();
    const bannerEnabled = settings.showBanner && Boolean(
      settings.bannerTitle.trim() || settings.bannerText.trim() || settings.bannerImage
    );
    let banner = document.querySelector('[data-osu-studio="banner"]');

    if (bannerEnabled) {
      if (!banner) banner = makeBanner();
      const title = banner.querySelector('[data-role="title"]');
      const text = banner.querySelector('[data-role="text"]');
      const nextTitle = settings.bannerTitle.trim() || " ";
      const nextText = settings.bannerText.trim();
      if (title.textContent !== nextTitle) title.textContent = nextTitle;
      if (text.textContent !== nextText) text.textContent = nextText;

      if (settings.bannerImage) setCssImage(banner, "--osu-studio-banner-image", settings.bannerImage);
      else banner.style.removeProperty("--osu-studio-banner-image");
    } else if (banner) {
      banner.remove();
      banner = null;
    }

    let statsNode = document.querySelector('[data-osu-studio="stats"]');
    const stats = settings.showStats ? readProfileStats() : [];

    if (settings.showStats && stats.length) {
      if (!statsNode) {
        statsNode = document.createElement("section");
        statsNode.className = "osu-studio-custom-stats";
        statsNode.dataset.osuStudio = "stats";
      }
      const signature = JSON.stringify(stats);
      if (statsNode.dataset.signature !== signature) {
        statsNode.replaceChildren();
        const heading = document.createElement("h3");
        heading.className = "osu-studio-custom-stats__heading";
        heading.textContent = "PLAYER SNAPSHOT";
        const grid = document.createElement("div");
        grid.className = "osu-studio-custom-stats__grid";
        for (const item of stats) {
          const metric = document.createElement("div");
          metric.className = "osu-studio-custom-stats__item";
          const label = document.createElement("span");
          label.className = "osu-studio-custom-stats__label";
          label.textContent = item.label;
          const value = document.createElement("strong");
          value.className = "osu-studio-custom-stats__value";
          value.textContent = item.value;
          metric.append(label, value);
          grid.append(metric);
        }
        statsNode.append(heading, grid);
        statsNode.dataset.signature = signature;
      }
    } else if (statsNode) {
      statsNode.remove();
      statsNode = null;
    }

    if (!anchor) return;
    if (banner && (banner.parentElement !== anchor.parentElement || banner.previousElementSibling !== anchor)) {
      anchor.insertAdjacentElement("afterend", banner);
    }
    const after = banner || anchor;
    if (statsNode && (statsNode.parentElement !== after.parentElement || statsNode.previousElementSibling !== after)) {
      after.insertAdjacentElement("afterend", statsNode);
    }
  }

  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the optimized image."));
      reader.onerror = () => reject(new Error("Could not read the optimized image."));
      reader.readAsDataURL(blob);
    });
  }

  async function optimizeImage(file) {
    if (!allowedImageTypes.has(file.type)) {
      throw new Error("Use PNG, JPEG, WebP, GIF or AVIF.");
    }
    if (file.size > MAX_INPUT_BYTES) {
      throw new Error("The original image is larger than 24 MB.");
    }

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error("This image could not be opened. Try another image format.");
    }

    try {
      let width = bitmap.width;
      let height = bitmap.height;
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("Image processing is not available in this browser.");

      for (let attempt = 0; attempt < 5; attempt += 1) {
        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);

        const quality = Math.max(0.55, 0.86 - attempt * 0.08);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
        if (!blob) throw new Error("Could not compress the image.");
        if (blob.size <= MAX_STORED_IMAGE_BYTES) {
          return await blobToDataUrl(blob);
        }
        width = Math.max(500, Math.round(width * 0.78));
        height = Math.max(500, Math.round(height * 0.78));
      }
      throw new Error("This image remains too large after optimization. Try a smaller image.");
    } finally {
      bitmap.close?.();
    }
  }

  async function uploadImage(event, key, urlId, noteId, clearId, label) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      showMessage("Optimizing " + label.toLowerCase() + " image...");
      settings[key] = await optimizeImage(file);
      $(urlId).value = "";
      $(noteId).textContent = file.name + " · optimized and ready to save.";
      applySettings();
      renderProfileSections();
      updateImageButtons();
      showMessage(label + " preview updated. Save profile design to keep it.");
    } catch (error) {
      showMessage(error.message || "Image upload failed.", true);
    } finally {
      event.target.value = "";
    }
  }

  function handleUrlInput(inputId, key, label) {
    const input = $(inputId);
    input.addEventListener("input", () => {
      const value = input.value.trim();
      if (!value) {
        settings[key] = "";
        applySettings();
        renderProfileSections();
        updateImageButtons();
        return;
      }
      const safe = safeImageUrl(value);
      if (!safe) {
        showMessage(label + " must be a valid HTTPS image address.", true);
        return;
      }
      settings[key] = safe;
      applySettings();
      renderProfileSections();
      updateImageButtons();
      showMessage(label + " preview updated. Save profile design to keep it.");
    });
  }

  function clearImage(key, inputId, fileId, noteId, message) {
    settings[key] = "";
    if (inputId) $(inputId).value = "";
    if (fileId) $(fileId).value = "";
    if (noteId) $(noteId).textContent = message;
    applySettings();
    renderProfileSections();
    updateImageButtons();
  }

  function applyPreset(name) {
    const presets = {
      ruby: {
        accent: "#e85d91", accentAlt: "#a66b9e",
        surfaceColor: "#17121a", textColor: "#f8eef4"
      },
      ice: {
        accent: "#7cbfe0", accentAlt: "#788cbd",
        surfaceColor: "#101923", textColor: "#eff7fc"
      },
      violet: {
        accent: "#a88aeb", accentAlt: "#d17eb2",
        surfaceColor: "#171321", textColor: "#f4effb"
      },
      graphite: {
        accent: "#d8d8dc", accentAlt: "#96969e",
        surfaceColor: "#17191c", textColor: "#f3f4f5"
      }
    };
    if (!presets[name]) return;
    settings = normalizeSettings({ ...settings, ...presets[name] });
    fillControls();
    applySettings();
    renderProfileSections();
    showMessage("Palette applied. Save profile design to keep it.");
  }

  function wirePanel() {
    $("launcher").addEventListener("click", () => setPanelOpen(true));
    $("minimize").addEventListener("click", () => setPanelOpen(false));

    const liveIds = [
      "accent", "accentAlt", "surfaceColor", "textColor",
      "rankChartColor", "playChartColor",
      "glass", "blur", "surfaceOpacity", "wallpaperDim",
      "cornerRadius", "coverPosition", "showBanner",
      "bannerTitle", "bannerText", "showStats"
    ];
    for (const id of liveIds) {
      $(id).addEventListener("input", () => {
        pullControlsIntoSettings();
        applySettings();
        renderProfileSections();
      });
      $(id).addEventListener("change", () => {
        pullControlsIntoSettings();
        applySettings();
        renderProfileSections();
      });
    }

    shadow.querySelectorAll("[data-preset]").forEach((button) => {
      button.addEventListener("click", () => applyPreset(button.dataset.preset));
    });

    handleUrlInput("coverUrl", "coverImage", "Cover image");
    handleUrlInput("wallpaperUrl", "wallpaperImage", "Wallpaper");
    handleUrlInput("bannerUrl", "bannerImage", "Banner image");

    $("coverFile").addEventListener("change", (event) =>
      uploadImage(event, "coverImage", "coverUrl", "coverNote", "clearCover", "Cover")
    );
    $("wallpaperFile").addEventListener("change", (event) =>
      uploadImage(event, "wallpaperImage", "wallpaperUrl", "wallpaperNote", "clearWallpaper", "Wallpaper")
    );
    $("bannerFile").addEventListener("change", (event) =>
      uploadImage(event, "bannerImage", "bannerUrl", "bannerNote", "clearBanner", "Banner")
    );

    $("clearCover").addEventListener("click", () =>
      clearImage("coverImage", "coverUrl", "coverFile", "coverNote", "No custom cover selected.")
    );
    $("clearWallpaper").addEventListener("click", () =>
      clearImage("wallpaperImage", "wallpaperUrl", "wallpaperFile", "wallpaperNote", "No wallpaper selected.")
    );
    $("clearBanner").addEventListener("click", () =>
      clearImage("bannerImage", "bannerUrl", "bannerFile", "bannerNote", "No banner image selected.")
    );

    $("save").addEventListener("click", async () => {
      pullControlsIntoSettings();
      try {
        await storageSet(storageKey(), settings);
        showMessage("Saved for this profile in this browser.");
      } catch (error) {
        showMessage("Could not save: " + (error.message || "browser storage error") + ". Remove an older image and try again.", true);
      }
    });

    $("reset").addEventListener("click", async () => {
      try {
        await storageRemove(storageKey());
        settings = { ...DEFAULTS };
        fillControls();
        applySettings();
        renderProfileSections();
        showMessage("This profile design has been reset.");
      } catch (error) {
        showMessage("Could not reset: " + (error.message || "storage error"), true);
      }
    });

    shadow.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setPanelOpen(false);
    });
  }

  async function loadProfile() {
    const nextId = currentProfileId();
    if (!nextId) return;
    if (nextId !== profileId) {
      profileId = nextId;
      let stored = await storageGet(storageKey(nextId));
      if (!stored) {
        const legacy = await storageGet("osuProfileStudio:v1:" + nextId);
        if (legacy) {
          stored = legacy;
          try { await storageSet(storageKey(nextId), normalizeSettings(legacy)); } catch { /* Keep legacy settings loaded for this session. */ }
        }
      }
      settings = normalizeSettings(stored);
      fillControls();
    }
    applySettings();
    renderProfileSections();
  }

  function schedulePageUpdate() {
    if (renderPending) return;
    renderPending = true;
    mutationTimer = window.setTimeout(() => {
      renderPending = false;
      const nextId = currentProfileId();
      if (nextId !== profileId) {
        loadProfile();
      } else {
        renderProfileSections();
      }
    }, 180);
  }

  function watchPage() {
    if (!document.body || observer) return;
    observer = new MutationObserver((records) => {
      const relevant = records.some((record) => {
        const target = record.target;
        return !host?.contains(target) && !host?.contains(target.parentElement);
      });
      if (relevant) schedulePageUpdate();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", loadProfile);
    window.addEventListener("pageshow", loadProfile);
  }

  createPanel();
  loadProfile();
  watchPage();

  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "OSU_STUDIO_OPEN") {
        setPanelOpen(true);
        sendResponse({ ok: true });
      }
      return false;
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.altKey && event.shiftKey && event.code === "KeyO") {
      setPanelOpen(Boolean($("panel")?.hidden));
    }
  });
})();