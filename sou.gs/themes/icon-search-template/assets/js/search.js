const homeThemeToggle = document.getElementById("themeToggle");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const submitButton = searchForm?.querySelector(".submit");
const submitButtonText = submitButton?.querySelector("span");
const submitButtonIcon = submitButton?.querySelector("svg");
const engineButtons = Array.from(document.querySelectorAll(".engine"));
const homePlayerRoot = document.getElementById("homePlayerRoot");
const homePlayerFrame = document.getElementById("homePlayerFrame");
const homePlayerStatus = document.getElementById("homePlayerStatus");
const homePlayerSettingsButton = document.querySelector("[data-home-player-settings]");
const homePlayerCloseTargets = Array.from(document.querySelectorAll("[data-home-player-close]"));
const legalConsentRoot = document.getElementById("legalConsentRoot");
const legalConsentCheckbox = document.getElementById("legalConsentCheckbox");
const legalConsentConfirm = document.getElementById("legalConsentConfirm");
const legalDetailsToggle = document.getElementById("legalDetailsToggle");
const legalDetailsPanel = document.getElementById("legalDetailsPanel");
const LEGAL_CONSENT_KEY = "yunSouLegalConsentV1";
const SEARCH_STATE_KEY = "yunSouSearchStateV1";

const enginePlaceholders = {
  all: "输入关键词搜索全部资源",
  seed: "输入关键词搜索磁力资源",
  quark: "输入关键词搜索夸克网盘",
  baidu: "输入关键词搜索百度网盘",
  xunlei: "输入关键词搜索迅雷网盘",
  uc: "输入关键词搜索 UC 网盘",
  play: "输入视频地址即可播放视频"
};

const submitIcons = {
  search: '<path d="M21 3 10 14"></path><path d="m21 3-7 18-4-7-7-4 18-7Z"></path>',
  play: '<path d="M8 5v14l11-7-11-7Z"></path>'
};

let activeEngine = "all";

function readPlayerParser() {
  try {
    return JSON.parse(localStorage.getItem("yunSouPlayerParser") || "{}");
  } catch (error) {
    return {};
  }
}

function buildParsedUrl(parserUrl, videoUrl) {
  const encodedVideo = encodeURIComponent(videoUrl);
  if (parserUrl.includes("{url}")) {
    return parserUrl.replace("{url}", encodedVideo);
  }
  return `${parserUrl}${encodedVideo}`;
}

function applyHomeTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (!homeThemeToggle) return;
  const dark = theme === "dark";
  homeThemeToggle.setAttribute("aria-pressed", String(dark));
  homeThemeToggle.setAttribute("aria-label", dark ? "切换白天模式" : "切换夜间模式");
}

function setActiveEngine(engine) {
  activeEngine = engine || "all";
  const isPlayMode = activeEngine === "play";
  engineButtons.forEach((button) => {
    const active = button.dataset.engine === activeEngine;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  searchForm?.classList.toggle("is-play-mode", isPlayMode);
  if (submitButtonText) {
    submitButtonText.textContent = isPlayMode ? "立即播放" : "搜索";
  }
  if (submitButton) {
    submitButton.setAttribute("aria-label", isPlayMode ? "立即播放" : "搜索");
  }
  if (submitButtonIcon) {
    submitButtonIcon.innerHTML = isPlayMode ? submitIcons.play : submitIcons.search;
  }
  if (searchInput) {
    searchInput.placeholder = enginePlaceholders[activeEngine] || enginePlaceholders.all;
    searchInput.focus();
  }
}

function buildSearchURL(query) {
  if (activeEngine === "play") {
    return `./player.html?url=${encodeURIComponent(query)}`;
  }
  writeSearchState(query, activeEngine);
  return "/search";
}

function writeSearchState(query, drive) {
  try {
    sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify({
      q: query,
      drive: drive && drive !== "all" ? drive : "",
      ts: Date.now()
    }));
  } catch (error) {
    // Some privacy modes block sessionStorage; the result page still handles empty state.
  }
}

function openHomePlayer(videoUrl, parser) {
  if (!homePlayerRoot || !homePlayerFrame || !parser?.url) return;
  if (homePlayerStatus) homePlayerStatus.textContent = "正在加载播放器...";
  homePlayerFrame.src = buildParsedUrl(parser.url, videoUrl);
  homePlayerRoot.hidden = false;
  document.body.classList.add("player-open");
}

function closeHomePlayer() {
  if (!homePlayerRoot || !homePlayerFrame) return;
  homePlayerRoot.hidden = true;
  homePlayerFrame.removeAttribute("src");
  if (homePlayerStatus) homePlayerStatus.textContent = "等待播放";
  document.body.classList.remove("player-open");
}

function shakeForm() {
  if (!searchForm) return;
  searchForm.classList.remove("is-invalid");
  void searchForm.offsetWidth;
  searchForm.classList.add("is-invalid");
}

function readConsentAccepted() {
  try {
    const raw = localStorage.getItem(LEGAL_CONSENT_KEY);
    if (!raw) return false;
    if (raw === "accepted") return true;
    const parsed = JSON.parse(raw);
    return parsed && parsed.accepted === true;
  } catch (error) {
    return false;
  }
}

function writeConsentAccepted() {
  try {
    localStorage.setItem(
      LEGAL_CONSENT_KEY,
      JSON.stringify({
        accepted: true,
        version: "2026-06-18",
        acceptedAt: new Date().toISOString()
      })
    );
  } catch (error) {
    // localStorage may be blocked in private mode; close the modal for this session.
  }
}

function setLegalDetailsOpen(open) {
  if (!legalDetailsPanel || !legalDetailsToggle) return;
  legalDetailsPanel.hidden = !open;
  legalDetailsToggle.setAttribute("aria-expanded", String(open));
  legalDetailsToggle.textContent = open ? "《收起完整版权与网站免责声明》" : "《完整版权与网站免责声明》";
}

function showLegalConsent() {
  if (!legalConsentRoot) return;
  legalConsentRoot.hidden = false;
  document.body.classList.add("legal-open");
  if (legalConsentConfirm) {
    legalConsentConfirm.disabled = !legalConsentCheckbox?.checked;
  }
  window.setTimeout(() => legalConsentCheckbox?.focus(), 120);
}

function hideLegalConsent() {
  if (!legalConsentRoot) return;
  legalConsentRoot.hidden = true;
  document.body.classList.remove("legal-open");
}

function initLegalConsent() {
  if (!legalConsentRoot || !legalConsentCheckbox || !legalConsentConfirm) return;
  const params = new URLSearchParams(window.location.search);
  const previewMode = params.get("legalPreview") === "1";

  legalConsentCheckbox.addEventListener("change", () => {
    legalConsentConfirm.disabled = !legalConsentCheckbox.checked;
  });

  legalDetailsToggle?.addEventListener("click", () => {
    setLegalDetailsOpen(Boolean(legalDetailsPanel?.hidden));
  });

  legalConsentConfirm.addEventListener("click", () => {
    if (!legalConsentCheckbox.checked) return;
    writeConsentAccepted();
    hideLegalConsent();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && legalConsentRoot && !legalConsentRoot.hidden) {
      event.preventDefault();
      legalConsentCheckbox.focus();
    }
  });

  if (previewMode || !readConsentAccepted()) {
    window.setTimeout(showLegalConsent, 260);
  }
}

applyHomeTheme(localStorage.getItem("yunSouTheme") || "light");
setActiveEngine("all");
initLegalConsent();

homeThemeToggle?.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("yunSouTheme", nextTheme);
  applyHomeTheme(nextTheme);
});

engineButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveEngine(button.dataset.engine || "all");
  });
});

searchForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = searchInput?.value.trim() || "";
  if (!query) {
    searchInput?.focus();
    shakeForm();
    return;
  }

  if (activeEngine === "play") {
    const parser = readPlayerParser();
    if (!parser.url) {
      window.YunSouDialogs?.open("player");
      window.YunSouDialogs?.setStatus("player", "请先在播放设置中配置解析接口。");
      return;
    }
    openHomePlayer(query, parser);
    return;
  }

  searchForm.classList.add("is-submitting");
  window.setTimeout(() => {
    window.location.href = buildSearchURL(query);
  }, 140);
});

homePlayerCloseTargets.forEach((target) => {
  target.addEventListener("click", closeHomePlayer);
});

homePlayerSettingsButton?.addEventListener("click", () => {
  closeHomePlayer();
  window.YunSouDialogs?.open("player");
});

homePlayerFrame?.addEventListener("load", () => {
  if (homePlayerStatus && homePlayerFrame.getAttribute("src")) {
    homePlayerStatus.textContent = "播放器已加载，可使用全屏等播放控制";
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && homePlayerRoot && !homePlayerRoot.hidden) {
    closeHomePlayer();
  }
});
