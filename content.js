(() => {
  "use strict";

  const DEFAULTS = {
    coverImage: "",
    pageImage: "",
    accent: "#e66ca7",
    accent2: "#8e4b83",
    textColor: "#f7edf3",
    glass: true,
    blur: 18,
    opacity: 74,
    coverPosition: 50,
    showBanner: false,
    bannerTitle: "Beyond the rhythm",
    bannerText: "A little space to make this profile yours.",
    bannerImage: "",
    showStats: true
  };

  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
  const ROOT_ID = "osu-profile-studio-root";
  let profileId = null;
  let settings = { ...DEFAULTS };
  let host = null;
  let shadow = null;
  let mutationTimer = null;
  let observer = null;

  const $ = (id) => shadow && shadow.getElementById(id);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));

  function currentProfileId() {
    const match = location.pathname.match(/^\/users\/([^/]+)/i);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function storageKey(id = profileId) {
    return `osuProfileStudio:v1:${id || "unknown"}`;
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      try {
        if (globalThis.chrome?.storage?.local) {
          chrome.storage.local.get([key], (result) => resolve(result?.[key] || null));
        } else {
          resolve(JSON.parse(localStorage.getItem(key) || "null"));
        }
      } catch {
        resolve(null);
      }
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve, reject) => {
      try {
        if (globalThis.chrome?.storage?.local) {
          chrome.storage.local.set({ [key]: value }, () => {
            const error = chrome.runtime?.lastError;
            if (error) reject(new Error(error.message));
            else resolve();
          });
        } else {
          localStorage.setItem(key, JSON.stringify(value));
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  function storageRemove(key) {
    return new Promise((resolve, reject) => {
      try {
        if (globalThis.chrome?.storage?.local) {
          chrome.storage.local.remove([key], () => {
            const error = chrome.runtime?.lastError;
            if (error) reject(new Error(error.message));
            else resolve();
          });
        } else {
          localStorage.removeItem(key);
          resolve();
        }
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

  function normalizeSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const color = (input, fallback) => /^#[0-9a-f]{6}$/i.test(String(input || "")) ? input : fallback;
    return {
      ...DEFAULTS,
      coverImage: safeImageUrl(source.coverImage),
      pageImage: safeImageUrl(source.pageImage),
      accent: color(source.accent, DEFAULTS.accent),
      accent2: color(source.accent2, DEFAULTS.accent2),
      textColor: color(source.textColor, DEFAULTS.textColor),
      glass: source.glass !== false,
      blur: clamp(source.blur, 0, 32),
      opacity: clamp(source.opacity, 35, 98),
      coverPosition: clamp(source.coverPosition, 0, 100),
      showBanner: source.showBanner === true,
      bannerTitle: String(source.bannerTitle ?? DEFAULTS.bannerTitle).slice(0, 90),
      bannerText: String(source.bannerText ?? DEFAULTS.bannerText).slice(0, 360),
      bannerImage: safeImageUrl(source.bannerImage),
      showStats: source.showStats !== false
    };
  }

  function createPanel() {
    if (document.getElementById(ROOT_ID)) {
      host = document.getElementById(ROOT_ID);
      shadow = host.shadowRoot;
      return;
    }

    host = document.createElement("div");
    host.id = ROOT_ID;
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
        * { box-sizing: border-box; }
        .launcher {
          position: fixed; z-index: 2147483000; right: 22px; bottom: 22px;
          display: flex; align-items: center; gap: 10px; padding: 10px 15px 10px 10px;
          border: 1px solid rgba(255,255,255,.18); border-radius: 999px;
          color: #fff; background: linear-gradient(125deg, #d75b98, #75385f 88%);
          box-shadow: 0 10px 35px rgba(0,0,0,.34), 0 0 28px rgba(210,83,145,.22);
          font-size: 12px; font-weight: 800; letter-spacing: .01em; cursor: pointer;
          transition: transform .18s, filter .18s;
        }
        .launcher:hover { transform: translateY(-2px); filter: brightness(1.1); }
        .mark { display:grid; place-items:center; width:28px; height:28px; border-radius:50%;
          color:#fff; background:rgba(255,255,255,.17); font-size:10px; letter-spacing:-.04em; }
        .panel {
          position: fixed; z-index: 2147483001; right: 22px; bottom: 78px;
          width: min(390px, calc(100vw - 24px)); max-height: min(82vh, 760px);
          display:flex; flex-direction:column; overflow:hidden;
          color:#f8eff4; background:rgba(18,15,22,.96);
          border:1px solid rgba(255,255,255,.15); border-radius:22px;
          box-shadow:0 22px 80px rgba(0,0,0,.52), 0 0 36px rgba(194,75,133,.13);
          backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px);
        }
        .panel[hidden] { display:none !important; }
        .header { display:flex; align-items:center; justify-content:space-between; gap:12px;
          padding:18px 18px 15px; border-bottom:1px solid rgba(255,255,255,.09);
          background:linear-gradient(110deg,rgba(217,91,151,.17),transparent 75%); }
        .heading { font-size:15px; font-weight:850; letter-spacing:-.035em; }
        .subheading { margin-top:4px; color:#a99aa4; font-size:10px; }
        .close { width:30px;height:30px;border:1px solid rgba(255,255,255,.12);border-radius:10px;
          color:#e8dce4;background:rgba(255,255,255,.06);font-size:18px;cursor:pointer; }
        .body { overflow:auto; padding:15px 17px 18px; scrollbar-width:thin; scrollbar-color:#654157 transparent; }
        .section { padding:13px 0; border-bottom:1px solid rgba(255,255,255,.075); }
        .section:first-child { padding-top:0; }
        .section:last-child { border-bottom:0; }
        .section-title { margin:0 0 11px; color:#f2dbe7; font-size:10px; font-weight:850;
          letter-spacing:.13em; text-transform:uppercase; }
        label { display:block; margin:10px 0 6px; color:#c9bac4; font-size:11px; font-weight:650; }
        input[type="text"], textarea {
          display:block; width:100%; min-width:0; padding:10px 11px; outline:none;
          color:#fff; background:rgba(255,255,255,.055); border:1px solid rgba(255,255,255,.13);
          border-radius:10px; font:inherit; font-size:11px; transition:border-color .18s,background .18s;
        }
        input[type="text"]:focus, textarea:focus { border-color:#d86b9f; background:rgba(255,255,255,.08); }
        textarea { min-height:72px; resize:vertical; line-height:1.5; }
        input[type="color"] { width:38px;height:32px;padding:2px;border:1px solid rgba(255,255,255,.15);
          border-radius:9px;background:rgba(255,255,255,.06);cursor:pointer; }
        input[type="range"] { width:100%; accent-color:#d866a0; cursor:pointer; }
        input[type="file"] { width:100%; color:#a99aa4; font-size:10px; }
        .color-row { display:grid; grid-template-columns:repeat(3,1fr); gap:9px; }
        .color-cell { display:flex; align-items:center; gap:7px; min-width:0; }
        .color-cell span { color:#b7a8b2; font-size:10px; }
        .range-label { display:flex; justify-content:space-between; gap:10px; }
        .range-label output { color:#e9a4c6; font-variant-numeric:tabular-nums; }
        .toggle-row { display:flex; align-items:center; justify-content:space-between; gap:12px;
          margin:9px 0; color:#e6dce3; font-size:11px; }
        .toggle-row input { width:15px;height:15px; accent-color:#d866a0; }
        .presets { display:flex; flex-wrap:wrap; gap:7px; }
        .preset { padding:7px 10px; color:#e7d9e2; background:rgba(255,255,255,.06);
          border:1px solid rgba(255,255,255,.12); border-radius:9px;font-size:10px;cursor:pointer; }
        .preset:hover { border-color:#d866a0; }
        .mini-button { margin-top:6px; padding:7px 9px; color:#cfb9c7; background:rgba(255,255,255,.05);
          border:1px solid rgba(255,255,255,.1); border-radius:8px;font-size:10px;cursor:pointer; }
        .file-note { margin-top:5px; color:#8f818b; font-size:9px; line-height:1.45; }
        .actions { display:grid; grid-template-columns:1fr auto; gap:8px; padding-top:13px; }
        .save { padding:11px 13px; color:white; background:linear-gradient(110deg,#d75b98,#914276);
          border:0;border-radius:11px;font-size:11px;font-weight:850;cursor:pointer; }
        .reset { padding:11px 12px; color:#dfcbd7;background:rgba(255,255,255,.06);
          border:1px solid rgba(255,255,255,.12);border-radius:11px;font-size:11px;cursor:pointer; }
        .message { min-height:15px; margin-top:8px; color:#d99cbd; font-size:10px; line-height:1.4; }
        .notice { margin:12px 0 0; color:#91838d; font-size:9px; line-height:1.55; }
        @media(max-width:480px) {
          .launcher { right:12px;bottom:12px; }
          .panel { right:12px;bottom:65px; }
        }
      </style>
      <button class="launcher" id="launcher" type="button" aria-expanded="false">
        <span class="mark">OS</span><span>PROFILE STUDIO</span>
      </button>
      <section class="panel" id="panel" aria-label="osu! Profile Studio editor" hidden>
        <header class="header">
          <div><div class="heading">Profile Studio</div><div class="subheading">Customize this osu! profile locally</div></div>
          <button class="close" id="close" type="button" aria-label="Close">×</button>
        </header>
        <div class="body">
          <section class="section">
            <h2 class="section-title">Profile cover</h2>
            <label for="coverUrl">Cover image URL</label>
            <input id="coverUrl" type="text" placeholder="https://example.com/cover.jpg" autocomplete="off">
            <label for="coverFile">Or upload an image</label>
            <input id="coverFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif">
            <div class="file-note" id="coverNote">Image stays in this browser. Maximum file size: 4 MB.</div>
            <button class="mini-button" id="clearCover" type="button">Remove custom cover</button>
            <div class="range-label"><label for="coverPosition">Cover vertical position</label><output id="coverPositionValue">50%</output></div>
            <input id="coverPosition" type="range" min="0" max="100" value="50">
            <label for="pageImage">Optional page background URL</label>
            <input id="pageImage" type="text" placeholder="https://example.com/background.jpg" autocomplete="off">
            <button class="mini-button" id="clearPage" type="button">Remove page background</button>
          </section>
          <section class="section">
            <h2 class="section-title">Color palette</h2>
            <div class="presets">
              <button class="preset" data-preset="rose" type="button">Ruby rose</button>
              <button class="preset" data-preset="ice" type="button">Cold glass</button>
              <button class="preset" data-preset="violet" type="button">Violet night</button>
            </div>
            <div class="color-row">
              <div><label for="accent">Accent</label><div class="color-cell"><input id="accent" type="color"><span>Primary</span></div></div>
              <div><label for="accent2">Secondary</label><div class="color-cell"><input id="accent2" type="color"><span>Accent</span></div></div>
              <div><label for="textColor">Text</label><div class="color-cell"><input id="textColor" type="color"><span>Text</span></div></div>
            </div>
          </section>
          <section class="section">
            <h2 class="section-title">Glass interface</h2>
            <div class="toggle-row"><span>Enable glass surfaces</span><input id="glass" type="checkbox"></div>
            <div class="range-label"><label for="blur">Background blur</label><output id="blurValue">18 px</output></div>
            <input id="blur" type="range" min="0" max="32" value="18">
            <div class="range-label"><label for="opacity">Panel opacity</label><output id="opacityValue">74%</output></div>
            <input id="opacity" type="range" min="35" max="98" value="74">
          </section>
          <section class="section">
            <h2 class="section-title">Custom profile banner</h2>
            <div class="toggle-row"><span>Show banner after About me</span><input id="showBanner" type="checkbox"></div>
            <label for="bannerTitle">Banner title</label>
            <input id="bannerTitle" type="text" maxlength="90" placeholder="Your headline">
            <label for="bannerText">Banner text</label>
            <textarea id="bannerText" maxlength="360" placeholder="Write a short introduction…"></textarea>
            <label for="bannerImage">Banner image URL (optional)</label>
            <input id="bannerImage" type="text" placeholder="https://example.com/banner.jpg" autocomplete="off">
          </section>
          <section class="section">
            <h2 class="section-title">Player statistics</h2>
            <div class="toggle-row"><span>Add a compact stats block</span><input id="showStats" type="checkbox"></div>
            <div class="file-note">Values are read from the statistics already displayed on the osu! page. No account access or API key is requested.</div>
          </section>
          <div class="actions">
            <button class="save" id="save" type="button">Save changes</button>
            <button class="reset" id="reset" type="button">Reset</button>
          </div>
          <div class="message" id="message" role="status" aria-live="polite"></div>
          <p class="notice">Everything here is a local visual customization. Your official osu! profile, cover, account data and what other players see remain unchanged.</p>
        </div>
      </section>
    `;

    document.documentElement.appendChild(host);
    wirePanel();
  }

  function setPanelOpen(open) {
    const panel = $("panel");
    const launcher = $("launcher");
    if (!panel || !launcher) return;
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
  }

  function showMessage(message, isError = false) {
    const node = $("message");
    if (!node) return;
    node.textContent = message;
    node.style.color = isError ? "#ff9aab" : "#d99cbd";
  }

  function fillControls() {
    if (!shadow) return;
    $("coverUrl").value = settings.coverImage.startsWith("https://") ? settings.coverImage : "";
    $("pageImage").value = settings.pageImage.startsWith("https://") ? settings.pageImage : "";
    $("coverNote").textContent = settings.coverImage.startsWith("data:image/")
      ? "A local uploaded image is saved for this profile."
      : "Image stays in this browser. Maximum file size: 4 MB.";
    $("accent").value = settings.accent;
    $("accent2").value = settings.accent2;
    $("textColor").value = settings.textColor;
    $("glass").checked = settings.glass;
    $("blur").value = String(settings.blur);
    $("opacity").value = String(settings.opacity);
    $("coverPosition").value = String(settings.coverPosition);
    $("showBanner").checked = settings.showBanner;
    $("bannerTitle").value = settings.bannerTitle;
    $("bannerText").value = settings.bannerText;
    $("bannerImage").value = settings.bannerImage.startsWith("https://") ? settings.bannerImage : "";
    $("showStats").checked = settings.showStats;
    updateRangeLabels();
  }

  function updateRangeLabels() {
    if (!shadow) return;
    $("blurValue").textContent = `${$("blur").value} px`;
    $("opacityValue").textContent = `${$("opacity").value}%`;
    $("coverPositionValue").textContent = `${$("coverPosition").value}%`;
  }

  function pullControlsIntoSettings() {
    if (!shadow) return;
    const next = { ...settings };
    const coverUrl = $("coverUrl").value.trim();
    const pageUrl = $("pageImage").value.trim();
    const bannerUrl = $("bannerImage").value.trim();
    if (coverUrl) next.coverImage = safeImageUrl(coverUrl) || next.coverImage;
    if (pageUrl) next.pageImage = safeImageUrl(pageUrl) || next.pageImage;
    if (bannerUrl) next.bannerImage = safeImageUrl(bannerUrl) || next.bannerImage;
    next.accent = $("accent").value;
    next.accent2 = $("accent2").value;
    next.textColor = $("textColor").value;
    next.glass = $("glass").checked;
    next.blur = clamp($("blur").value, 0, 32);
    next.opacity = clamp($("opacity").value, 35, 98);
    next.coverPosition = clamp($("coverPosition").value, 0, 100);
    next.showBanner = $("showBanner").checked;
    next.bannerTitle = $("bannerTitle").value.slice(0, 90);
    next.bannerText = $("bannerText").value.slice(0, 360);
    next.showStats = $("showStats").checked;
    settings = normalizeSettings(next);
    updateRangeLabels();
    applySettings();
    renderProfileSections();
  }

  function setImageCssProperty(element, name, value) {
    if (value) element.style.setProperty(name, `url(${JSON.stringify(value)})`);
    else element.style.removeProperty(name);
  }

  function applySettings() {
    if (!document.body) return;
    const root = document.documentElement;
    root.style.setProperty("--osu-studio-accent", settings.accent);
    root.style.setProperty("--osu-studio-accent-2", settings.accent2);
    root.style.setProperty("--osu-studio-text", settings.textColor);
    root.style.setProperty("--osu-studio-blur", settings.glass ? `${settings.blur}px` : "0px");
    root.style.setProperty("--osu-studio-opacity", String(settings.opacity / 100));
    root.style.setProperty("--osu-studio-panel", settings.glass
      ? `rgba(18, 15, 23, ${settings.opacity / 100})`
      : `rgba(18, 15, 23, ${Math.min(.98, settings.opacity / 100 + .18)})`);
    root.style.setProperty("--osu-studio-cover-position", `${settings.coverPosition}%`);
    setImageCssProperty(root, "--osu-studio-cover-image", settings.coverImage);
    setImageCssProperty(root, "--osu-studio-page-image", settings.pageImage);
    document.body.classList.add("osu-studio-active");
    document.body.classList.toggle("osu-studio-has-cover", Boolean(settings.coverImage));
    document.body.classList.toggle("osu-studio-page-background", Boolean(settings.pageImage));
  }

  function markGlassSurfaces() {
    const selectors = [
      ".profile-info",
      ".profile-detail",
      ".profile-stats",
      ".user-profile-pages > [data-page-id]",
      ".page-extra",
      ".page-extra__content-overflow-wrapper-inner"
    ];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => node.classList.add("osu-studio-glass-surface"));
    }
  }

  function findAboutAnchor() {
    const userPage = document.querySelector(".page-extra--userpage");
    return userPage?.querySelector(".page-extra__content-overflow-wrapper-inner .js-audio--group")
      || userPage?.querySelector(".page-extra__content-overflow-wrapper-inner")
      || userPage
      || document.querySelector('[data-page-id="me"]')
      || document.querySelector(".user-profile-pages")
      || document.querySelector(".profile-info");
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
    const text = document.createElement("p");
    text.className = "osu-studio-custom-banner__text";
    text.dataset.role = "text";
    content.append(eyebrow, title, text);
    node.append(content);
    return node;
  }

  function findStats() {
    const candidates = [...document.querySelectorAll(
      ".profile-stats__stat, .profile-stats__entry, .profile-stats__row, .profile-statistics__stat, [data-stat]"
    )];
    const definitions = [
      { label: "Ranked score", aliases: /ranked score/i, selectors: [".profile-stats__entry--key-ranked_score"] },
      { label: "Accuracy", aliases: /accuracy|hit accuracy/i, selectors: [".profile-stats__entry--key-hit_accuracy"] },
      { label: "Play count", aliases: /play count/i, selectors: [".profile-stats__entry--key-play_count"] },
      { label: "Maximum combo", aliases: /maximum combo/i, selectors: [".profile-stats__entry--key-maximum_combo"] }
    ];

    const results = [];
    for (const definition of definitions) {
      let element = null;
      for (const selector of definition.selectors) {
        element = document.querySelector(selector);
        if (element) break;
      }
      if (!element) {
        element = candidates.find((candidate) => definition.aliases.test((candidate.innerText || candidate.textContent || "").trim()));
      }
      if (!element) continue;

      const valueNode = element.querySelector(".profile-stats__value, .profile-stats__stat-value, .value, strong, b");
      let value = (valueNode?.innerText || valueNode?.textContent || "").trim();
      if (!value) {
        const raw = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
        value = raw.replace(definition.aliases, "").replace(/^[:\s–-]+/, "").trim();
      }
      if (value && value.length <= 48) results.push({ label: definition.label, value });
    }
    return results;
  }

  function renderProfileSections() {
    if (!document.body || !profileId) return;
    const anchor = findAboutAnchor();
    const bannerEnabled = settings.showBanner && Boolean(settings.bannerTitle.trim() || settings.bannerText.trim() || settings.bannerImage);
    let banner = document.querySelector('[data-osu-studio="banner"]');

    if (bannerEnabled) {
      if (!banner) banner = makeBanner();
      const title = banner.querySelector('[data-role="title"]');
      const text = banner.querySelector('[data-role="text"]');
      const nextTitle = settings.bannerTitle.trim() || " ";
      const nextText = settings.bannerText.trim();
      if (title.textContent !== nextTitle) title.textContent = nextTitle;
      if (text.textContent !== nextText) text.textContent = nextText;

      if (settings.bannerImage) {
        const imageStyle = `linear-gradient(90deg, rgba(10,8,14,.78), rgba(10,8,14,.25)), url(${JSON.stringify(settings.bannerImage)})`;
        if (banner.style.getPropertyValue("--osu-studio-banner-image") !== imageStyle) {
          banner.style.setProperty("--osu-studio-banner-image", imageStyle);
        }
      } else if (banner.style.getPropertyValue("--osu-studio-banner-image")) {
        banner.style.removeProperty("--osu-studio-banner-image");
      }
    } else if (banner) {
      banner.remove();
      banner = null;
    }

    let statsNode = document.querySelector('[data-osu-studio="stats"]');
    const stats = settings.showStats ? findStats() : [];
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
        for (const stat of stats) {
          const item = document.createElement("div");
          item.className = "osu-studio-custom-stats__item";
          const label = document.createElement("span");
          label.className = "osu-studio-custom-stats__label";
          label.textContent = stat.label;
          const value = document.createElement("strong");
          value.className = "osu-studio-custom-stats__value";
          value.textContent = stat.value;
          item.append(label, value);
          grid.append(item);
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
    const insertAfter = banner || anchor;
    if (statsNode && (statsNode.parentElement !== insertAfter.parentElement || statsNode.previousElementSibling !== insertAfter)) {
      insertAfter.insertAdjacentElement("afterend", statsNode);
    }
    markGlassSurfaces();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read this image."));
      reader.onerror = () => reject(new Error("Could not read this image."));
      reader.readAsDataURL(file);
    });
  }

  function applyPreset(name) {
    const presets = {
      rose: { accent: "#e66ca7", accent2: "#8e4b83", textColor: "#fff1f7" },
      ice: { accent: "#8dc8ed", accent2: "#637eaa", textColor: "#edf7ff" },
      violet: { accent: "#b19af7", accent2: "#725ba9", textColor: "#f4efff" }
    };
    if (!presets[name]) return;
    settings = normalizeSettings({ ...settings, ...presets[name] });
    fillControls();
    applySettings();
    renderProfileSections();
  }

  function wirePanel() {
    $("launcher").addEventListener("click", () => setPanelOpen($("panel").hidden));
    $("close").addEventListener("click", () => setPanelOpen(false));

    const liveInputs = ["coverUrl", "pageImage", "accent", "accent2", "textColor", "glass", "blur", "opacity",
      "coverPosition", "showBanner", "bannerTitle", "bannerText", "bannerImage", "showStats"];
    for (const id of liveInputs) {
      $(id).addEventListener("input", pullControlsIntoSettings);
      $(id).addEventListener("change", pullControlsIntoSettings);
    }

    shadow.querySelectorAll("[data-preset]").forEach((button) => {
      button.addEventListener("click", () => applyPreset(button.dataset.preset));
    });

    $("clearCover").addEventListener("click", () => {
      settings.coverImage = "";
      $("coverUrl").value = "";
      $("coverFile").value = "";
      $("coverNote").textContent = "Custom cover removed. Save to keep this change.";
      applySettings();
    });
    $("clearPage").addEventListener("click", () => {
      settings.pageImage = "";
      $("pageImage").value = "";
      applySettings();
    });

    $("coverFile").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        showMessage("Choose an image file.", true);
        event.target.value = "";
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        showMessage("This image is larger than 4 MB. Choose a smaller one.", true);
        event.target.value = "";
        return;
      }
      try {
        settings.coverImage = await readFileAsDataUrl(file);
        $("coverUrl").value = "";
        $("coverNote").textContent = `Uploaded: ${file.name} — save to keep it for this profile.`;
        applySettings();
        showMessage("Cover preview applied. Save changes to store it.");
      } catch (error) {
        showMessage(error.message || "Image upload failed.", true);
      }
    });

    $("save").addEventListener("click", async () => {
      pullControlsIntoSettings();
      try {
        await storageSet(storageKey(), settings);
        showMessage("Saved for this profile in this browser.");
      } catch (error) {
        showMessage(`Could not save: ${error.message || "storage error"}`, true);
      }
    });

    $("reset").addEventListener("click", async () => {
      try {
        await storageRemove(storageKey());
        settings = { ...DEFAULTS };
        fillControls();
        applySettings();
        renderProfileSections();
        showMessage("This profile's local customization has been reset.");
      } catch (error) {
        showMessage(`Could not reset: ${error.message || "storage error"}`, true);
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
      settings = normalizeSettings(await storageGet(storageKey(nextId)));
      fillControls();
    }
    applySettings();
    renderProfileSections();
  }

  function watchPage() {
    if (!document.body || observer) return;
    observer = new MutationObserver(() => {
      clearTimeout(mutationTimer);
      mutationTimer = setTimeout(() => {
        const nextId = currentProfileId();
        if (nextId !== profileId) loadProfile();
        else {
          applySettings();
          renderProfileSections();
        }
      }, 220);
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
      return true;
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.altKey && event.shiftKey && event.code === "KeyO") {
      setPanelOpen($("panel")?.hidden ?? true);
    }
  });
})();