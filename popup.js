const statusNode = document.getElementById("status");
const messageNode = document.getElementById("message");
const editorButton = document.getElementById("open-editor");

function isProfileUrl(url = "") {
  return /^https:\/\/osu\.ppy\.sh\/users\/\d+/i.test(url);
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs && tabs[0];
  if (tab && isProfileUrl(tab.url)) {
    statusNode.textContent = "An osu! profile is open. You can customize it now.";
    editorButton.disabled = false;
  } else {
    statusNode.textContent = "Open any osu! profile to use the visual editor.";
    editorButton.disabled = true;
    editorButton.style.opacity = ".48";
    editorButton.style.cursor = "not-allowed";
  }
});

editorButton.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id || !isProfileUrl(tab.url)) {
      messageNode.textContent = "Open an osu! player profile first.";
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "OSU_STUDIO_OPEN" }, () => {
      if (chrome.runtime.lastError) {
        messageNode.textContent = "Reload the profile tab, then try again.";
        return;
      }
      window.close();
    });
  });
});

document.getElementById("open-osu").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://osu.ppy.sh/rankings/osu/performance" });
});