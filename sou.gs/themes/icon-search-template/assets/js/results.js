const themeToggle = document.getElementById("themeToggle");
const themeTransition = document.getElementById("themeTransition");
const themeToast = document.getElementById("themeToast");
const searchForm = document.getElementById("resultsSearchForm");
const searchInput = document.getElementById("resultsSearchInput");
const clearSearch = document.querySelector(".serp-clear");
const sourceChips = Array.from(document.querySelectorAll(".source-chip"));
const resultTopbar = document.querySelector(".result-topbar");
const summary = document.getElementById("resultSummary");
const resultsList = document.getElementById("resultsList");
const pagination = document.getElementById("resultsPagination");
const hotSearchList = document.getElementById("hotSearchList");
const PAGE_SIZE = 10;
const API_BASE = "/api/frontend";
const TRANSFER_REQUEST_TIMEOUT = 35000;
const RESOURCE_CHECK_TIMEOUT = 45000;
const RESOURCE_CHECK_CONCURRENCY = 4;
const SEARCH_STATE_KEY = "yunSouSearchStateV1";
const THEME_BASE = String(
  window.__ydThemeBase ||
  (window.KnifeSearch && window.KnifeSearch.themeBase) ||
  "/themes/icon-search-template"
).replace(/\/+$/, "");

const params = new URLSearchParams(window.location.search);
const storedSearchState = readSearchState();
let query = params.get("q") || storedSearchState.q || "";
let activeDrive = params.get("drive") || storedSearchState.drive || "";
if (params.has("q") || params.has("drive") || window.location.pathname.toLowerCase().endsWith("/search.html")) {
  writeSearchState(query, activeDrive);
  cleanSearchAddress();
}
let searchId = "";
let complete = false;
let startedAt = 0;
let items = [];
let currentPage = 1;
let itemSerial = 0;
let qrLibPromise = null;
let resourceCheckQueue = [];
let resourceCheckRunning = 0;
let blockedMessage = "";
let blockedType = "";
let lastResultsHTML = "";
const resourceCheckQueuedKeys = new Set();
const resourceCheckDoneKeys = new Set();

const torrentLaunchConfig = {
  path: "/go/torrent",
  referer: "https://bt.sou.gs/",
  custom: "2549689805"
};
let thunderSDKPromise = null;
let lastThunderTask = null;
let thunderLocalProbeGuarded = false;
let thunderWarmStarted = false;

function readSearchState() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SEARCH_STATE_KEY) || "{}");
    return {
      q: typeof parsed.q === "string" ? parsed.q.trim() : "",
      drive: typeof parsed.drive === "string" ? parsed.drive.trim() : ""
    };
  } catch (error) {
    return { q: "", drive: "" };
  }
}

function writeSearchState(nextQuery, nextDrive) {
  try {
    sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify({
      q: String(nextQuery || "").trim(),
      drive: nextDrive && nextDrive !== "all" ? String(nextDrive) : "",
      ts: Date.now()
    }));
  } catch (error) {
    // Ignore storage failures; the current page state remains usable.
  }
}

function cleanSearchAddress() {
  const cleanPath = "/search";
  if (window.location.pathname !== cleanPath || window.location.search || window.location.hash) {
    history.replaceState(null, "", cleanPath);
  }
}

const FIXED_HOT_SEARCH_WORDS = uniqueWords(`
少儿、小学、初中、高中、大学、四六级、考研、考公、教资、英语、电影、动漫、美剧、软件、电子书、编程、剪辑、设计、专升本、自考、成考、雅思、托福、日语、韩语、会计、一建、二建、法考、医师、护士、事业单位、军队文职、教师招聘、小升初、中考、高考、单招、学位英语、计算机二级、教师资格面试、公考行测、公考申论、考研数学、考研英语、考研政治、PS、PR、AE、CAD、3Dmax、UI 设计、原画、摄影、配音、自媒体、短视频运营、Excel、PPT、Python、Java、前端、后端、数据分析、跨境电商、新媒体、烘焙、美甲、化妆、汽修、厨师、韩剧、日剧、泰剧、综艺、纪录片、漫画、有声书、小说、国漫、院线电影、短剧、脱口秀、演唱会、广播剧、游戏、单机游戏、手游、端游、模板、素材、课件、题库、真题、源码、插件、字体、壁纸、教程、绘本、习题、试卷、工具书、有声小说、付费课程、网盘资源、办公工具、早教、幼小衔接、奥数、作文、练字、口语、语法、词汇、乐理、美术、舞蹈、体育、考证、求职简历、面试技巧
`.split(/[，,、]/));
const HOT_SEARCH_FOCUS_POSITIONS = [
  [178, 72, 1.03, -4],
  [246, 98, 0.96, 3],
  [284, 166, 0.92, 5],
  [258, 238, 1.02, -3],
  [184, 284, 0.98, 2],
  [108, 246, 0.96, -5],
  [76, 176, 0.94, 4],
  [112, 106, 0.98, -3],
  [222, 70, 0.9, 4],
  [92, 218, 0.88, 2]
];

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (themeToggle) {
    const dark = theme === "dark";
    themeToggle.setAttribute("aria-pressed", String(dark));
    themeToggle.setAttribute("aria-label", dark ? "切换白天模式" : "切换夜间模式");
  }
}

function showThemeFeedback(theme, event) {
  const dark = theme === "dark";
  const source = event?.currentTarget?.getBoundingClientRect?.();
  const x = source ? `${Math.round(source.left + source.width / 2)}px` : "92%";
  const y = source ? `${Math.round(source.top + source.height / 2)}px` : "44px";

  if (themeTransition) {
    themeTransition.dataset.mode = theme;
    themeTransition.style.setProperty("--theme-x", x);
    themeTransition.style.setProperty("--theme-y", y);
    themeTransition.classList.remove("is-active");
    void themeTransition.offsetWidth;
    themeTransition.classList.add("is-active");
    window.clearTimeout(showThemeFeedback.transitionTimer);
    showThemeFeedback.transitionTimer = window.setTimeout(() => {
      themeTransition.classList.remove("is-active");
    }, 880);
  }

  if (themeToast) {
    themeToast.textContent = dark ? "已切换到深色模式" : "已切换到浅色模式";
    themeToast.classList.add("is-show");
    window.clearTimeout(showThemeFeedback.timer);
    showThemeFeedback.timer = window.setTimeout(() => {
      themeToast.classList.remove("is-show");
    }, 1600);
  }
}

function syncTopbarShadow() {
  if (!resultTopbar) return;
  resultTopbar.classList.toggle("is-scrolled", window.scrollY > 8);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") || "";
}

function uniqueWords(words) {
  const seen = new Set();
  return words
    .map((word) => String(word || "").replace(/\s+/g, " ").trim())
    .filter((word) => {
      if (!word || seen.has(word)) return false;
      seen.add(word);
      return true;
    });
}

function shuffleWords(words) {
  const list = [...words];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.random() * (index + 1));
    [list[index], list[next]] = [list[next], list[index]];
  }
  return list;
}

function hotTagStyle(index, front) {
  if (front) {
    const [x, y, scale, rotate] = HOT_SEARCH_FOCUS_POSITIONS[index % HOT_SEARCH_FOCUS_POSITIONS.length];
    return `--hot-x:${x}px;--hot-y:${y}px;--hot-scale:${scale};--hot-rotate:${rotate}deg;--hot-blur:0px;--hot-opacity:1;--hot-z:${80 - index};`;
  }
  const ring = index % 3;
  const angle = (index * 37 + Math.random() * 24) * Math.PI / 180;
  const radius = [88, 112, 136][ring] + Math.random() * 12;
  const x = 180 + Math.cos(angle) * radius;
  const y = 188 + Math.sin(angle) * radius * 0.92;
  const scale = [0.62, 0.7, 0.78][index % 3] + Math.random() * 0.06;
  const blur = [1.2, 2.2, 3.4][ring];
  const opacity = [0.62, 0.48, 0.34][ring];
  const rotate = Math.round(Math.random() * 16 - 8);
  return `--hot-x:${Math.round(x)}px;--hot-y:${Math.round(y)}px;--hot-scale:${scale.toFixed(2)};--hot-rotate:${rotate}deg;--hot-blur:${blur}px;--hot-opacity:${opacity};--hot-z:${20 - ring};`;
}

function renderHotSearches(words) {
  if (!hotSearchList) return;
  const list = uniqueWords(words);
  if (!list.length) {
    hotSearchList.innerHTML = `<p class="hot-search-empty">关键词库暂未配置</p>`;
    return;
  }
  const shuffled = shuffleWords(list);
  const focusCount = Math.min(shuffled.length, 6 + Math.floor(Math.random() * 5));
  const focusWords = shuffled.slice(0, focusCount);
  const backgroundWords = shuffleWords(shuffled.slice(focusCount));
  const ordered = [...focusWords, ...backgroundWords];
  hotSearchList.innerHTML = ordered.map((word, index) => {
    const front = index < focusCount;
    const size = front ? (index < 3 ? 3 : 2) : [1, 0, 1, 0, 2, 0][index % 6];
    const tone = index % 5;
    const depth = front ? "front" : "back";
    return `<a class="hot-tag hot-tag--${depth} hot-tag--size-${size} hot-tag--tone-${tone}" style="${hotTagStyle(index, front)}" href="/search" data-hot-keyword="${escapeHTML(word)}">${escapeHTML(word)}</a>`;
  }).join("");
  hotSearchList.scrollTop = 0;
}

function normalizeDrive(value) {
  const raw = String(value || "").toLowerCase();
  if (["seed", "torrent", "bt", "magnet"].includes(raw) || raw.includes("种子") || raw.includes("磁力")) return "seed";
  if (raw.includes("quark") || raw.includes("夸克") || raw.includes("pan.quark.cn")) return "quark";
  if (raw.includes("baidu") || raw.includes("百度") || raw.includes("pan.baidu.com")) return "baidu";
  if (raw.includes("xunlei") || raw.includes("迅雷") || raw.includes("pan.xunlei.com")) return "xunlei";
  if (raw === "uc" || raw.includes("uc")) return "uc";
  if (raw.includes("播放") || raw.includes("video")) return "play";
  return raw;
}

function driveFor(item) {
  return normalizeDrive(pickFirst(
    item.drive_type,
    item.disk_type,
    item.pan_type,
    item.disk_name,
    item.drive_name,
    item.source_type,
    item.source_label,
    item.type,
    item.platform,
    item.link,
    item.share_link,
    item.url
  )) || "default";
}

function driveLabel(item) {
  const drive = driveFor(item);
  const labels = {
    seed: "磁力",
    torrent: "磁力",
    quark: "夸克网盘",
    baidu: "百度网盘",
    xunlei: "迅雷网盘",
    uc: "UC 网盘",
    play: "在线播放"
  };
  return pickFirst(item.disk_name, item.pan_type, labels[drive], item.source_label, "资源");
}

function themeAsset(path) {
  return `${THEME_BASE}/assets/${String(path || "").replace(/^\/+/, "")}`;
}

function sourceChipIcon(drive) {
  const chip = sourceChips.find((item) => (item.dataset.drive || "") === drive);
  const image = chip?.querySelector("img");
  return image?.src || "";
}

function iconFor(item) {
  const drive = driveFor(item);
  const iconMap = {
    seed: "zhongzi-dark.svg",
    torrent: "zhongzi-dark.svg",
    quark: "kuake-dark.svg",
    baidu: "icon_baiduwangpan-dark.svg",
    xunlei: "xunlei1-dark.svg",
    uc: "changyonglogo31-dark.svg",
    play: "play-dark.svg",
    default: "all-source-dark.svg"
  };
  const key = iconMap[drive] ? drive : "default";
  const src = sourceChipIcon(key) || themeAsset(iconMap[key]);
  return `<img class="source-icon source-icon--${key}" src="${src}" alt="" aria-hidden="true">`;
}

function rawPosterURL(item) {
  const images = Array.isArray(item?.images) ? item.images : [];
  return String(pickFirst(
    item?.poster,
    item?.image,
    item?.cover,
    item?.thumb,
    item?.thumbnail,
    images[0]
  )).trim();
}

function imageProxyEndpoint() {
  const context = window.__ydPageContext || window.__ydContext || window.YunSouContext || {};
  const configured = pickFirst(
    context?.image_proxy?.endpoint,
    context?.imageProxy?.endpoint,
    context?.site?.image_proxy?.endpoint,
    window.__ydImageProxyEndpoint
  );
  return String(configured || "https://images.weserv.nl/?url=").trim();
}

function proxiedPosterURL(rawURL) {
  const url = String(rawURL || "").trim();
  if (!url || /^(?:data:|blob:|\/)/i.test(url)) return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "images.weserv.nl") return url;
  } catch (error) {
    return url;
  }
  const endpoint = imageProxyEndpoint();
  if (!endpoint) return url;
  const encoded = encodeURIComponent(url);
  const rawNoScheme = url.replace(/^https?:\/\//i, "");
  if (endpoint.includes("{full}")) return endpoint.replaceAll("{full}", url);
  if (endpoint.includes("{raw}")) return endpoint.replaceAll("{raw}", rawNoScheme);
  if (endpoint.includes("{url}")) return endpoint.replaceAll("{url}", encoded);
  if (endpoint.includes("%s")) return endpoint.replaceAll("%s", encoded);
  if (/images\.weserv\.nl\/\?url=/i.test(endpoint)) return endpoint + encoded;
  if (/[=?]$/.test(endpoint)) return endpoint + encoded;
  return endpoint + encoded;
}

function posterHTML(item) {
  const rawURL = rawPosterURL(item);
  if (!rawURL) return "";
  const src = proxiedPosterURL(rawURL);
  return `
    <figure class="serp-item__poster" aria-label="资源海报">
      <img src="${escapeHTML(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">
    </figure>
  `;
}

function metaIcon(kind) {
  if (kind === "source") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M4 12h16"></path><path d="M12 4c2 2.2 3 4.8 3 8s-1 5.8-3 8"></path><path d="M12 4c-2 2.2-3 4.8-3 8s1 5.8 3 8"></path></svg>';
  }
  if (kind === "file") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5Z"></path><path d="M14 3.5V8h4"></path></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 10-13h-7l0-7Z"></path></svg>';
}

function rawResourceTime(item) {
  return String(pickFirst(
    item.share_time,
    item.shareTime,
    item.time,
    item.datetime,
    item.publish_time,
    item.published_at,
    item.pub_date,
    item.pubDate,
    item.post_time,
    item.posted_at,
    item.resource_time,
    item.release_time,
    item.created_time,
    item.created_at,
    item.createdAt
  )).trim();
}

function parseResourceTime(item) {
  const raw = rawResourceTime(item);
  if (!raw) return null;
  if (/^(?:0000|0001)[-/.:T\s]/.test(raw) || /^0{10,}$/.test(raw)) return null;
  const compact = raw
    .replace("T", " ")
    .replace(/\.\d+/, "")
    .replace(/(?:Z|[+-]\d{2}:?\d{2})$/, "")
    .trim();
  let match = compact.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
    if (Number(year) <= 1) return null;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  match = compact.match(/^(\d{1,2})[-/.](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const now = new Date();
    const [, month, day, hour = "0", minute = "0", second = "0"] = match;
    const date = new Date(now.getFullYear(), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const timestamp = Number(compact);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    const date = new Date(timestamp > 100000000000 ? timestamp : timestamp * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(compact);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function displayTime(item) {
  const raw = rawResourceTime(item);
  if (!raw) return "时间待检测";
  if (/^(?:0000|0001)[-/.:T\s]/.test(raw) || /^0{10,}$/.test(raw)) return "时间待检测";
  const compact = raw
    .replace("T", " ")
    .replace(/\.\d+/, "")
    .replace(/(?:Z|[+-]\d{2}:?\d{2})$/, "")
    .trim();
  const match = compact.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2})(?::\d{2})?)?/);
  if (!match) return compact;
  const [, year, month, day, hour, minute] = match;
  const now = new Date();
  const currentYear = String(now.getFullYear());
  if (year === currentYear && hour && minute) return `${month}-${day} ${hour}:${minute}`;
  if (year === currentYear) return `${month}-${day}`;
  return `${year}-${month}-${day}`;
}

function timeBucketLabel(item) {
  const date = parseResourceTime(item);
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 0 || diff <= 24 * 60 * 60 * 1000) return "24小时内";
  if (diff <= 72 * 60 * 60 * 1000) return "72小时内";
  if (diff <= 30 * 24 * 60 * 60 * 1000) return "30天以内";
  return "更早时间";
}

function timeBadgeHTML(item) {
  const label = timeBucketLabel(item);
  if (!label) return "";
  return `<span class="serp-time-badge">${escapeHTML(label)}</span>`;
}

function isInvalidItem(item) {
  if (item?._checkClass === "is-invalid") return true;
  if (item.valid === false || item.is_valid === false || item.available === false) return true;
  const raw = [
    item._checkText,
    item.validity_text,
    item.validityText,
    item.status_text,
    item.statusText,
    item.check_status,
    item.checkStatus,
    item.valid_status,
    item.validStatus,
    item.link_status,
    item.linkStatus,
    item.status,
    item.reason
  ].map((value) => String(value || "")).join(" ");
  return /失效|无效|失联|不可用|已取消|不存在|invalid|dead|expired|unavailable/i.test(raw);
}

function isValidItem(item) {
  if (item?._checkClass === "is-valid") return true;
  if (item.valid === true || item.is_valid === true || item.available === true) return true;
  const text = String(item?._checkText || "").trim();
  return /有效|可用|正常/.test(text);
}

function statusTextFor(item) {
  if (isSeedItem(item)) return "资源有效";
  if (item?._checkText) return item._checkText;
  if (isInvalidItem(item)) return "已失效";
  if (item.valid === true || item.is_valid === true || item.available === true) return "有效";
  const raw = String(pickFirst(
    item.validity_text,
    item.validityText,
    item.status_text,
    item.statusText,
    item.check_status,
    item.checkStatus,
    item.valid_status,
    item.validStatus,
    item.link_status,
    item.linkStatus,
    item.status
  )).trim();
  if (!raw || raw.toLowerCase() === "active") return "待检测";
  return raw;
}

function statusClassFor(item) {
  if (isSeedItem(item)) return "is-valid";
  if (item?._checkClass) return item._checkClass;
  if (isInvalidItem(item)) return "is-invalid";
  if (isValidItem(item)) return "is-valid";
  return "is-pending";
}

function checkedStatusText(data = {}) {
  const raw = data || {};
  const value = String(pickFirst(
    raw.validity_text,
    raw.validityText,
    raw.status_text,
    raw.statusText,
    raw.check_status,
    raw.checkStatus,
    raw.status
  )).trim();
  if (/^valid$/i.test(value)) return "资源有效";
  if (/^invalid$/i.test(value)) return "资源失效";
  if (/^unknown$/i.test(value)) return "待检测";
  if (/^error$/i.test(value)) return "资源有效";
  if (/检测失败|接口失败|接口异常|请求失败|超时|timeout|network|fetch/i.test(value)) return "资源有效";
  if (value) return value;
  if (raw.valid === true || raw.available === true || raw.is_valid === true) return "资源有效";
  if (raw.valid === false || raw.available === false || raw.is_valid === false) return "资源失效";
  return "待检测";
}

function checkedStatusClass(text) {
  if (/检测中/.test(text)) return "is-checking";
  if (/检测失败|接口失败|接口异常/.test(text)) return "is-error";
  if (/有效|可用|正常/.test(text)) return "is-valid";
  if (/失效|无效|异常|失联|失败/.test(text)) return "is-invalid";
  return "is-pending";
}

function statusSortRank(item) {
  const statusClass = statusClassFor(item);
  if (statusClass === "is-valid") return 0;
  if (statusClass === "is-pending" || statusClass === "is-checking") return 1;
  if (statusClass === "is-error") return 2;
  if (statusClass === "is-invalid") return 3;
  return 1;
}

function sortByValidity(list) {
  return [...list].sort((a, b) => {
    const rank = statusSortRank(a) - statusSortRank(b);
    if (rank !== 0) return rank;
    const leftTime = parseResourceTime(a);
    const rightTime = parseResourceTime(b);
    if (leftTime || rightTime) {
      if (!leftTime) return 1;
      if (!rightTime) return -1;
      const diff = rightTime.getTime() - leftTime.getTime();
      if (diff !== 0) return diff;
    }
    return Number(a._serpOrder || 0) - Number(b._serpOrder || 0);
  });
}

function isSeedItem(item) {
  return driveFor(item) === "seed" || item.source_type === "torrent";
}

function torrentTokenFor(item) {
  return pickFirst(
    item && item.torrent_token,
    item && item.torrentToken,
    item && item.torrent_id,
    item && item.torrentId,
    item && item.resource_id,
    item && item.resourceId,
    item && item.id
  );
}

function thunderURLFor(item) {
  const base = torrentLaunchConfig.path || "/go/torrent";
  const token = torrentTokenFor(item);
  if (!base || !token || !searchId) return "";
  const url = new URL(base, window.location.href);
  url.searchParams.set("id", token);
  url.searchParams.set("search_id", searchId);
  url.searchParams.set("referer", torrentLaunchConfig.referer);
  url.searchParams.set("custom", torrentLaunchConfig.custom);
  return url.toString();
}

function thunderTaskURLFor(item) {
  const launchURL = thunderURLFor(item);
  if (!launchURL) return "";
  const url = new URL(launchURL);
  url.searchParams.set("format", "json");
  return url.toString();
}

function loadThunderSDK() {
  installThunderLocalProbeGuard();
  if (window.thunderLink && typeof window.thunderLink.newTask === "function") return Promise.resolve(window.thunderLink);
  if (thunderSDKPromise) return thunderSDKPromise;
  thunderSDKPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-thunder-sdk="open-thunderurl"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.thunderLink), { once: true });
      existing.addEventListener("error", () => reject(new Error("迅雷下载组件加载失败")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://open.thunderurl.com/thunder-link.js";
    script.async = true;
    script.dataset.thunderSdk = "open-thunderurl";
    script.onload = () => resolve(window.thunderLink);
    script.onerror = () => reject(new Error("迅雷下载组件加载失败"));
    document.head.appendChild(script);
  });
  return thunderSDKPromise;
}

function warmThunderSDK() {
  if (thunderWarmStarted) return;
  thunderWarmStarted = true;
  installThunderLocalProbeGuard();
  loadThunderSDK()
    .then(() => installThunderLocalProbeGuard())
    .catch(() => {
      // 预加载失败不影响搜索页，点击磁力时再给用户明确提示。
    });
}

function scheduleThunderWarmup() {
  const startWarmup = () => warmThunderSDK();
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(startWarmup, { timeout: 4200 });
    return;
  }
  window.setTimeout(startWarmup, 1800);
}

function installThunderLocalProbeGuard() {
  if (thunderLocalProbeGuarded) return;
  const originalFetch = window.fetch ? window.fetch.bind(window) : null;
  if (originalFetch) {
    window.fetch = function guardedThunderFetch(input, init) {
      const url = typeof input === "string" ? input : (input && input.url ? input.url : "");
      if (isThunderLocalProbeURL(url)) {
        return Promise.resolve(new Response(JSON.stringify({ ret: 0, version: "" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }));
      }
      return originalFetch(input, init);
    };
  }
  if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
    const proto = window.XMLHttpRequest.prototype;
    const originalOpen = proto.open;
    const originalSend = proto.send;
    proto.open = function guardedThunderXHROpen(method, url) {
      this.__thunderLocalProbeBlocked = isThunderLocalProbeURL(url);
      if (this.__thunderLocalProbeBlocked) {
        this.__thunderLocalProbeResponse = JSON.stringify({ ret: 0, version: "" });
        return;
      }
      return originalOpen.apply(this, arguments);
    };
    proto.send = function guardedThunderXHRSend() {
      if (!this.__thunderLocalProbeBlocked) {
        return originalSend.apply(this, arguments);
      }
      const xhr = this;
      window.setTimeout(() => {
        setXHRValue(xhr, "readyState", 4);
        setXHRValue(xhr, "status", 200);
        setXHRValue(xhr, "statusText", "OK");
        setXHRValue(xhr, "responseText", xhr.__thunderLocalProbeResponse || "{}");
        setXHRValue(xhr, "response", xhr.__thunderLocalProbeResponse || "{}");
        if (typeof xhr.onreadystatechange === "function") xhr.onreadystatechange();
        dispatchXHRLikeEvent(xhr, "readystatechange");
        dispatchXHRLikeEvent(xhr, "load");
        dispatchXHRLikeEvent(xhr, "loadend");
      }, 0);
      return undefined;
    };
  }
  const jq = window.j_xunlei_q;
  if (jq && typeof jq.ajax === "function" && !jq.__thunderLocalProbeGuarded) {
    const originalAjax = jq.ajax.bind(jq);
    jq.ajax = function guardedThunderAjax(options) {
      const url = String(options && options.url ? options.url : "");
      if (isThunderLocalProbeURL(url)) {
        window.setTimeout(() => {
          if (typeof options.success === "function") options.success({ ret: 0, version: "" });
          if (typeof options.complete === "function") options.complete({ status: 200, responseJSON: { ret: 0, version: "" } }, "success");
        }, 0);
        return { abort() {} };
      }
      return originalAjax(options);
    };
    jq.__thunderLocalProbeGuarded = true;
  }
  thunderLocalProbeGuarded = true;
}

function isThunderLocalProbeURL(url) {
  return /^http:\/\/127\.0\.0\.1:(28317|36759)\/get_thunder_version\//i.test(String(url || ""));
}

function setXHRValue(xhr, key, value) {
  try {
    Object.defineProperty(xhr, key, { configurable: true, get: () => value });
  } catch {
    try { xhr[key] = value; } catch {}
  }
}

function dispatchXHRLikeEvent(xhr, type) {
  try {
    xhr.dispatchEvent(new Event(type));
  } catch {}
}

async function requestThunderTask(item) {
  const url = thunderTaskURLFor(item);
  if (!url) throw new Error("当前磁力资源还未准备好，请刷新后重试。");
  const data = await fetchJSON(url);
  if (!data || !data.url) throw new Error("当前磁力资源缺少可用下载链接");
  return data;
}

function buildThunderTaskOptions(task) {
  const custom = String(task.custom || torrentLaunchConfig.custom || "2549689805").trim();
  const referer = String(task.referer || torrentLaunchConfig.referer || "https://bt.sou.gs/").trim();
  const name = String(task.title || task.name || "磁力资源").trim();
  const extra = { ...(task.extra || {}), custom, pid: custom, thunderPid: custom };
  return {
    referer,
    custom,
    pid: custom,
    thunderPid: custom,
    extra,
    tasks: [{
      url: task.url,
      name,
      referer,
      custom,
      pid: custom,
      thunderPid: custom,
      extra
    }]
  };
}

function configureThunderPartner(options) {
  const partnerID = String(options?.custom || options?.pid || torrentLaunchConfig.custom || "2549689805").trim();
  if (!partnerID || !window.thunderLink || typeof window.thunderLink.config !== "function") return;
  window.thunderLink.config({
    pid: partnerID,
    custom: partnerID,
    referer: options?.referer || torrentLaunchConfig.referer || "https://bt.sou.gs/"
  });
}

function invokeThunderTask(task) {
  if (typeof window.thunderLink === "function" && typeof window.thunderLink.newTask !== "function") {
    window.thunderLink();
  }
  if (!window.thunderLink || typeof window.thunderLink.newTask !== "function") {
    throw new Error("迅雷下载组件未就绪");
  }
  const options = buildThunderTaskOptions(task);
  configureThunderPartner(options);
  window.thunderLink.newTask(options);
}

async function openSeedItem(item) {
  const loadingTimer = window.setTimeout(() => showThunderDialog(item, null, "loading"), 180);
  try {
    const [task] = await Promise.all([
      requestThunderTask(item),
      loadThunderSDK()
    ]);
    lastThunderTask = task;
    installThunderLocalProbeGuard();
    window.clearTimeout(loadingTimer);
    closeThunderDialog();
    invokeThunderTask(task);
  } catch (error) {
    window.clearTimeout(loadingTimer);
    showThunderDialog(item, null, "error", error?.message || "迅雷下载组件加载失败，请稍后重试。");
  }
}

function ensureThunderDialog() {
  let root = document.querySelector(".thunder-dialog-root");
  if (root) return root;
  root = document.createElement("div");
  root.className = "thunder-dialog-root";
  root.hidden = true;
  root.innerHTML = `
    <div class="thunder-dialog__backdrop"></div>
    <section class="thunder-dialog thunder-dialog--loading" role="status" aria-live="polite">
      <span class="thunder-loading-ring" aria-hidden="true"></span>
      <strong data-thunder-title>正在获取下载链接</strong>
      <p data-thunder-message>正在连接迅雷下载组件，请稍候...</p>
    </section>
  `;
  document.body.appendChild(root);
  return root;
}

function closeThunderDialog() {
  const root = document.querySelector(".thunder-dialog-root");
  if (root) root.hidden = true;
  document.body.classList.remove("dialog-open");
}

function showThunderDialog(item, launchURL, state = "ready", message = "") {
  const root = ensureThunderDialog();
  const title = root.querySelector("[data-thunder-title]");
  const messageNode = root.querySelector("[data-thunder-message]");
  root.dataset.state = state;
  if (title) title.textContent = state === "error" ? "迅雷下载组件未就绪" : "正在获取下载链接";
  if (messageNode) {
    if (state === "loading") {
      messageNode.textContent = "正在连接迅雷下载组件，请稍候...";
    } else if (state === "error") {
      messageNode.textContent = message || "未能唤起迅雷，请安装后重试。";
    } else {
      messageNode.textContent = "正在连接迅雷下载组件，请稍候...";
    }
  }
  root.hidden = false;
  document.body.classList.add("dialog-open");
}

function resourceKeyFor(item) {
  if (!item) return "";
  if (!item._serpKey) {
    itemSerial += 1;
    item._serpKey = `resource-${itemSerial}`;
  }
  return item._serpKey;
}

function findItemByResourceKey(key) {
  return items.find((item) => resourceKeyFor(item) === key);
}

function ensureTransferDialog() {
  let root = document.querySelector(".transfer-dialog-root");
  if (root) return root;
  root = document.createElement("div");
  root.className = "transfer-dialog-root";
  root.hidden = true;
  root.innerHTML = `
    <div class="transfer-dialog__backdrop" data-transfer-close></div>
    <section class="transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="transfer-dialog-title">
      <div class="transfer-dialog__head">
        <div>
          <h2 id="transfer-dialog-title">获取资源</h2>
        </div>
        <button type="button" class="transfer-dialog__close" data-transfer-close aria-label="关闭">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>
        </button>
      </div>
      <div class="transfer-dialog__body" data-transfer-body></div>
    </section>
  `;
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-transfer-close]")) closeTransferDialog();
  });
  document.body.appendChild(root);
  return root;
}

function openTransferDialog() {
  const root = ensureTransferDialog();
  root.hidden = false;
  document.body.classList.add("dialog-open");
}

function closeTransferDialog() {
  const root = document.querySelector(".transfer-dialog-root");
  if (!root) return;
  root.hidden = true;
  document.body.classList.remove("dialog-open");
}

async function openTransferResourceFlow(item) {
  if (!item) return;
  const root = ensureTransferDialog();
  const body = root.querySelector("[data-transfer-body]");
  if (!body) return;
  body.innerHTML = buildTransferLoading();
  openTransferDialog();
  try {
    const result = await requestTransferredResource(item);
    body.innerHTML = isMobileDevice()
      ? buildTransferMobile(result)
      : buildTransferDesktop(result);
    bindTransferActions(body);
    if (!isMobileDevice()) {
      void loadTransferQRCodeAsync(body, result);
    }
  } catch (error) {
    if (isSeedItem(item) && !shareLinkFor(item)) {
      closeTransferDialog();
      openSeedItem(item);
      return;
    }
    body.innerHTML = buildTransferError(error.message || "资源获取失败，请稍后重试");
  }
}

function shareLinkFor(item) {
  return pickFirst(item?.link, item?.share_link, item?.shareLink, item?.url, item?.href);
}

async function hydrateResourceLink(item) {
  if (!item || shareLinkFor(item)) return item;
  const resourceId = String(item.resource_id || item.original_id || item.id || "").trim();
  if (!resourceId) return item;
  const source = String(item.source || item.source_type || "").trim().toLowerCase();
  const endpoints = source === "tg"
    ? [`${API_BASE}/tg/resources/${encodeURIComponent(resourceId)}`, `${API_BASE}/resources/${encodeURIComponent(resourceId)}`]
    : [`${API_BASE}/resources/${encodeURIComponent(resourceId)}`, `${API_BASE}/tg/resources/${encodeURIComponent(resourceId)}`];
  for (const endpoint of endpoints) {
    const response = await apiGet(endpoint, TRANSFER_REQUEST_TIMEOUT);
    if (!response || response.code !== 0 || !response.data) continue;
    const data = response.data;
    const link = shareLinkFor(data);
    if (!link) continue;
    Object.assign(item, data, {
      id: item.id || data.id,
      resource_id: item.resource_id || data.resource_id || data.original_id || resourceId,
      link,
      share_link: link,
      shareLink: link
    });
    return item;
  }
  return item;
}

async function requestTransferredResource(item) {
  const site = (window.__YD_CONTEXT && window.__YD_CONTEXT.site) || (window.__ydTheme && window.__ydTheme.site) || {};
  const hydratedItem = await hydrateResourceLink(item);
  const fallbackLink = shareLinkFor(hydratedItem);
  const payload = {
    id: hydratedItem.id || hydratedItem.resource_id || "",
    resource_id: hydratedItem.resource_id || hydratedItem.original_id || hydratedItem.id || "",
    search_id: searchId,
    searchId,
    site_id: String(site.id || site.site_id || "").trim(),
    siteId: String(site.id || site.site_id || "").trim(),
    source: hydratedItem.source || hydratedItem.source_type || hydratedItem.source_label || "",
    drive_type: driveFor(hydratedItem) || detectDriveTypeFromLink(fallbackLink),
    title: hydratedItem.title || "",
    share_link: fallbackLink,
    shareLink: fallbackLink
  };
  const response = await apiPost(`${API_BASE}/transfer`, payload, TRANSFER_REQUEST_TIMEOUT);
  if (!response || response.code !== 0 || !response.data) {
    throw new Error((response && response.message) || "资源获取失败");
  }
  return normalizeTransferResult(response.data, item);
}

function normalizeTransferResult(data, item) {
  const raw = data || {};
  const link = String(raw.share_link || raw.shareLink || raw.link || "").trim();
  if (!link) throw new Error("转存成功但未返回分享链接");
  return {
    title: String(item?.title || raw.title || "转存资源").trim(),
    link,
    shareCode: String(raw.share_code || raw.shareCode || "").trim(),
    driveType: String(driveFor(item) || raw.drive_type || raw.driveType || "").trim()
  };
}

function buildTransferLoading() {
  return `
    <div class="transfer-panel transfer-panel--loading">
      <span class="transfer-loader" aria-hidden="true"></span>
      <h3>正在为您获取资源，请稍等！</h3>
      <p>系统正在处理资源链接，请勿关闭当前窗口。</p>
    </div>
  `;
}

function buildTransferDesktop(result) {
  return `
    <div class="transfer-panel transfer-panel--result">
      <h3>已转存，请扫码保存</h3>
      <p class="transfer-lead">${escapeHTML(buildDesktopTransferLead(result.driveType))}</p>
      <div class="transfer-qr-wrap"><div class="transfer-qr-placeholder">二维码生成中...</div></div>
      <strong class="transfer-title">${escapeHTML(result.title)}</strong>
      <div class="transfer-link-line">资源地址：<a href="${escapeHTML(result.link)}" target="_blank" rel="noopener">${escapeHTML(result.link)}</a></div>
      ${result.shareCode ? `<div class="transfer-code-line">提取码：${escapeHTML(result.shareCode)}</div>` : ""}
      ${buildTransferNotice()}
    </div>
  `;
}

function buildTransferMobile(result) {
  return `
    <div class="transfer-panel transfer-panel--result transfer-panel--mobile">
      <h3>已转存，请及时保存</h3>
      <p class="transfer-lead">${escapeHTML(buildMobileTransferLead(result.driveType))}</p>
      <strong class="transfer-title">${escapeHTML(result.title)}</strong>
      <div class="transfer-link-box">${escapeHTML(result.link)}</div>
      ${result.shareCode ? `<div class="transfer-code-line">提取码：${escapeHTML(result.shareCode)}</div>` : ""}
      <div class="transfer-action-row">
        <button type="button" class="transfer-copy" data-copy-link="${escapeHTML(result.link)}">复制链接</button>
        <a class="transfer-open" href="${escapeHTML(result.link)}" target="_blank" rel="noopener">立即访问</a>
      </div>
      ${buildTransferNotice()}
    </div>
  `;
}

function buildTransferError(message) {
  return `
    <div class="transfer-panel transfer-panel--error">
      <h3>资源获取失败</h3>
      <p>${escapeHTML(message || "请稍后重试")}</p>
    </div>
  `;
}

function buildTransferNotice() {
  return `
    <div class="transfer-notice">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l7 3v5.2c0 4-2.3 7.7-7 9.8-4.7-2.1-7-5.8-7-9.8V6.5l7-3z"></path><path d="M12 8.3v4.4"></path><circle cx="12" cy="16.1" r="0.9"></circle></svg>
      <span>声明：本站仅对公开网盘链接进行整理展示，不存储、不上传任何文件资源。跳转链接指向网盘官网，文件内容请自行甄别。</span>
    </div>
  `;
}

function bindTransferActions(container) {
  container.querySelectorAll("[data-copy-link]").forEach((button) => {
    button.addEventListener("click", async () => {
      await copyText(button.dataset.copyLink || "", button);
    });
  });
}

async function loadTransferQRCodeAsync(container, result) {
  const target = container.querySelector(".transfer-qr-wrap");
  if (!target || !result?.link) return;
  try {
    const qrImage = await generateTransferQRCode(result.link);
    target.innerHTML = qrImage
      ? `<img class="transfer-qr" src="${escapeHTML(qrImage)}" alt="资源二维码">`
      : '<div class="transfer-qr-placeholder">二维码生成失败</div>';
  } catch (error) {
    target.innerHTML = `<div class="transfer-qr-placeholder">${escapeHTML(error.message || "二维码生成失败")}</div>`;
  }
}

function loadQrLib() {
  if (window.QRCode) return Promise.resolve(window.QRCode);
  if (qrLibPromise) return qrLibPromise;
  qrLibPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/themes/wechat-cinehunt/assets/qrcode.min.js?v=20260504-r1";
    script.async = true;
    script.onload = () => resolve(window.QRCode);
    script.onerror = () => reject(new Error("二维码库加载失败"));
    document.head.appendChild(script);
  });
  return qrLibPromise;
}

async function generateTransferQRCode(link) {
  const text = String(link || "").trim();
  if (!text) return "";
  const qr = await loadQrLib();
  const qrLib = qr && (qr.default || qr);
  if (!qrLib) throw new Error("二维码库加载失败");
  const options = { width: 220, margin: 1 };
  return new Promise((resolve, reject) => {
    if (typeof qrLib.toDataURL === "function") {
      qrLib.toDataURL(text, options, (error, url) => {
        if (error || !url) reject(error || new Error("二维码生成失败"));
        else resolve(url);
      });
      return;
    }
    if (typeof qrLib.toCanvas === "function") {
      const canvas = document.createElement("canvas");
      qrLib.toCanvas(canvas, text, options, (error) => {
        if (error) reject(error);
        else resolve(canvas.toDataURL("image/png"));
      });
      return;
    }
    reject(new Error("二维码生成失败"));
  });
}

function isMobileDevice() {
  const ua = String(navigator.userAgent || "").toLowerCase();
  return window.matchMedia("(max-width: 760px)").matches || /android|iphone|ipad|ipod|mobile|harmony|micromessenger/.test(ua);
}

function buildDesktopTransferLead(driveType) {
  return `打开${driveAppName(driveType)}APP，使用扫码功能访问资源。`;
}

function buildMobileTransferLead(driveType) {
  return `当前为移动端访问，可直接复制链接或前往${driveAppName(driveType)}APP中打开使用。`;
}

function driveAppName(driveType) {
  const names = {
    quark: "夸克",
    baidu: "百度网盘",
    uc: "UC网盘",
    xunlei: "迅雷网盘",
    seed: "迅雷",
    play: "播放器"
  };
  const key = normalizeDrive(driveType);
  return names[key] || driveLabel({ drive_type: key }) || "网盘";
}

function detectDriveTypeFromLink(link) {
  const text = String(link || "").trim().toLowerCase();
  if (/pan\.quark\.cn|quark/.test(text)) return "quark";
  if (/pan\.baidu\.com|baidu/.test(text)) return "baidu";
  if (/drive\.uc\.cn|pan\.uc\.cn|uc/.test(text)) return "uc";
  if (/pan\.xunlei\.com|xunlei|leecher|fastcloud/.test(text)) return "xunlei";
  return "";
}

async function copyText(text, button) {
  const value = String(text || "");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else if (!fallbackCopyText(value)) {
      throw new Error("clipboard unavailable");
    }
    if (button) {
      const oldText = button.textContent;
      button.textContent = "已复制";
      window.setTimeout(() => {
        button.textContent = oldText;
      }, 1200);
    }
  } catch (error) {
    alert("复制失败，请长按链接手动复制");
  }
}

function fallbackCopyText(value) {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.readOnly = true;
    textarea.setAttribute("aria-hidden", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const success = document.execCommand && document.execCommand("copy");
    document.body.removeChild(textarea);
    return Boolean(success);
  } catch (error) {
    return false;
  }
}

async function apiPost(url, body, timeout = 12000) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), timeout) : null;
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      ...(controller ? { signal: controller.signal } : {})
    });
    const text = await response.text();
    if (!text) return { code: response.ok ? 0 : response.status, data: {} };
    try {
      return JSON.parse(text);
    } catch (error) {
      return { code: response.status || 1005, message: "服务响应格式异常" };
    }
  } catch (error) {
    if (error?.name === "AbortError") return { code: 1008, message: "资源获取超时，请稍后重试" };
    return { code: 1005, message: error?.message || "请求失败" };
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

async function apiGet(url, timeout = 12000) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), timeout) : null;
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      ...(controller ? { signal: controller.signal } : {})
    });
    const text = await response.text();
    if (!text) return { code: response.ok ? 0 : response.status, data: {} };
    try {
      return JSON.parse(text);
    } catch (error) {
      return { code: response.status || 1005, message: "服务响应格式异常" };
    }
  } catch (error) {
    if (error?.name === "AbortError") return { code: 1008, message: "资源获取超时，请稍后重试" };
    return { code: 1005, message: error?.message || "请求失败" };
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

function resourceCheckPayload(item) {
  const link = shareLinkFor(item);
  const driveType = driveFor(item);
  return {
    id: item.id || item.resource_id || item.title || "",
    resource_id: item.resource_id || item.id || "",
    source: item.source || item.source_type || item.source_label || "",
    drive_type: driveType,
    disk_type: driveType,
    share_link: link,
    shareLink: link,
    link
  };
}

async function checkResourceValidity(item) {
  const routes = (window.__YD_CONTEXT && window.__YD_CONTEXT.routes) || (window.__ydTheme && window.__ydTheme.routes) || {};
  const url = routes.resource_check_api || routes.resourceCheckApi || routes.check_api || routes.checkApi || `${API_BASE}/resource-check`;
  const response = await apiPost(url, resourceCheckPayload(item), RESOURCE_CHECK_TIMEOUT);
  if (!response || response.code !== 0) {
    throw new Error((response && response.message) || "资源检测失败");
  }
  return response.data || {};
}

function canCheckResource(item) {
  if (isSeedItem(item)) return false;
  return Boolean(item && (shareLinkFor(item) || item.resource_id || item.id));
}

function applyResourceCheckState(item, text, statusClass, result = {}) {
  item._checkText = text;
  item._checkClass = statusClass;
  if (result && typeof result === "object") {
    Object.assign(item, {
      validity_text: pickFirst(result.validity_text, result.validityText, result.status_text, result.statusText, item.validity_text),
      check_status: pickFirst(result.check_status, result.checkStatus, result.status, item.check_status),
      checked_at: pickFirst(result.checked_at, result.checkedAt, result.check_time, item.checked_at),
      valid: result.valid ?? result.is_valid ?? item.valid,
      available: result.available ?? item.available
    });
  }
}

function scheduleResourceChecks() {
  items.forEach((item) => {
    const key = resourceKeyFor(item);
    if (!key || resourceCheckQueuedKeys.has(key) || resourceCheckDoneKeys.has(key)) return;
    if (!canCheckResource(item)) return;
    resourceCheckQueuedKeys.add(key);
    if (!item._checkClass || item._checkClass === "is-pending") {
      applyResourceCheckState(item, "检测中", "is-checking");
    }
    resourceCheckQueue.push(item);
  });
  renderSummary();
  renderResults();
  while (resourceCheckRunning < RESOURCE_CHECK_CONCURRENCY && resourceCheckQueue.length) {
    void processResourceCheckQueue();
  }
}

async function processResourceCheckQueue() {
  resourceCheckRunning += 1;
  try {
    while (resourceCheckQueue.length) {
      const item = resourceCheckQueue.shift();
      if (!item) continue;
      const key = resourceKeyFor(item);
      try {
        applyResourceCheckState(item, "检测中", "is-checking");
        const result = await checkResourceValidity(item);
        const text = checkedStatusText(result);
        const statusClass = checkedStatusClass(text);
        applyResourceCheckState(item, text, statusClass, result);
      } catch (error) {
        applyResourceCheckState(item, "资源有效", "is-valid", {
          checked_at: new Date().toISOString(),
          status: "valid",
          valid: true
        });
      } finally {
        resourceCheckQueuedKeys.delete(key);
        resourceCheckDoneKeys.add(key);
        renderSummary();
        renderResults();
      }
    }
  } finally {
    resourceCheckRunning = Math.max(0, resourceCheckRunning - 1);
    if (resourceCheckQueue.length) {
      while (resourceCheckRunning < RESOURCE_CHECK_CONCURRENCY && resourceCheckQueue.length) {
        void processResourceCheckQueue();
      }
    }
  }
}

function updateURL() {
  writeSearchState(query, activeDrive);
  cleanSearchAddress();
}

function setActiveDrive(drive) {
  activeDrive = drive || "";
  sourceChips.forEach((chip) => {
    chip.classList.toggle("is-active", (chip.dataset.drive || "") === activeDrive);
  });
}

function filteredItems() {
  const list = (!activeDrive || activeDrive === "play")
    ? items
    : items.filter((item) => driveFor(item) === activeDrive);
  return sortByValidity(list);
}

function renderSummary(data = {}) {
  const visibleItems = filteredItems();
  const shown = visibleItems.length;
  const total = Number(data.total ?? items.length ?? 0);
  const elapsed = startedAt ? ((performance.now() - startedAt) / 1000).toFixed(2) : "0.00";
  const invalidCount = visibleItems.filter(isInvalidItem).length;
  const validCount = visibleItems.filter(isValidItem).length;
  const torrentCount = visibleItems.filter(isSeedItem).length;
  const label = summary.querySelector(".serp-count__label");
  if (label) {
    label.textContent = complete
    ? `sou.gs 为你找到约 ${total || shown} 条相关资源，用时 ${elapsed} 秒`
    : `正在搜索“${query}”，已找到 ${shown} 条资源...`;
  }
  const stats = summary.querySelector(".serp-count__stats");
  stats.innerHTML = `
    <span>有效资源 ${validCount} 条</span>
    <span class="is-invalid">已失效 ${invalidCount} 条</span>
    <span>磁力线路 ${torrentCount} 条</span>
  `;
}

function blockedStateMeta(type) {
  if (type === "copyright") {
    return {
      className: "is-copyright",
      eyebrow: "版权保护提示",
      title: "该关键词已进入版权保护屏蔽范围",
      note: "建议通过官方正版渠道观看或下载，平台不会展示可能存在侵权风险的资源。",
      icon: "copyright"
    };
  }
  return {
    className: "is-forbidden",
    eyebrow: "合规检索提示",
    title: "该关键词包含平台禁止展示的内容",
    note: "请调整为合规、清晰的关键词后再次检索。",
    icon: "shield"
  };
}

function blockedStateIcon(type) {
  if (type === "copyright") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5"></circle>
        <path d="M14.7 9.3a4 4 0 1 0 0 5.4"></path>
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.2 19 6v5.4c0 4.2-2.8 7.7-7 9.4-4.2-1.7-7-5.2-7-9.4V6l7-2.8Z"></path>
      <path d="M12 8v4.2"></path>
      <path d="M12 15.8h.01"></path>
    </svg>
  `;
}

function renderBlockedState(message, type) {
  const meta = blockedStateMeta(type);
  const keyword = query || searchInput?.value || "";
  return `
    <section class="serp-empty serp-empty--blocked ${escapeHTML(meta.className)}" role="status" aria-live="polite">
      <div class="blocked-card__glow" aria-hidden="true"></div>
      <div class="blocked-card__icon">${blockedStateIcon(meta.icon)}</div>
      <div class="blocked-card__body">
        <span class="blocked-card__eyebrow">${escapeHTML(meta.eyebrow)}</span>
        <h2>${escapeHTML(meta.title)}</h2>
        <p>${escapeHTML(message || meta.note)}</p>
        <div class="blocked-card__tips">
          <span>关键词：${escapeHTML(keyword || "--")}</span>
          <span>系统已自动停止本次展示</span>
        </div>
        <div class="blocked-card__actions">
          <button type="button" class="blocked-card__primary" data-focus-search>修改关键词</button>
          <a class="blocked-card__secondary" href="/">返回首页</a>
        </div>
      </div>
    </section>
  `;
}

function renderLoadingState() {
  const keyword = query || searchInput?.value || "";
  return `
    <section class="serp-empty serp-loading" role="status" aria-live="polite">
      <div class="serp-loading__ring" aria-hidden="true">
        <span></span>
        <i></i>
      </div>
      <div class="serp-loading__body">
        <h2>正在全网搜索</h2>
        <p>${keyword ? `正在检索“${escapeHTML(keyword)}”，请稍候...` : "正在搜索，请稍候..."}</p>
      </div>
      <div class="serp-loading__dots" aria-hidden="true">
        <b></b><b></b><b></b>
      </div>
    </section>
  `;
}

function renderResults() {
  const list = filteredItems();
  const totalPages = Math.max(Math.ceil(list.length / PAGE_SIZE), 1);
  if (currentPage > totalPages) currentPage = totalPages;
  if (!list.length) {
    if (complete && blockedMessage) {
      updateResultsHTML(renderBlockedState(blockedMessage, blockedType));
      renderPagination(0);
      return;
    }
    if (!complete) {
      updateResultsHTML(renderLoadingState());
    } else {
      const message = blockedMessage || (items.length ? "当前资源类型暂时没有匹配结果，请切换其他类型看看。" : "没有找到相关资源，请换个关键词试试。");
      updateResultsHTML(`<div class="serp-empty">${escapeHTML(message)}</div>`);
    }
    renderPagination(0);
    return;
  }
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);
  const compactMeta = window.matchMedia && window.matchMedia("(max-width: 720px)").matches;
  const nextHTML = pageItems.map((item) => {
    const driveName = driveLabel(item);
    const sourceLabel = item.source_label || driveName;
    const isSeed = isSeedItem(item);
    const invalid = isInvalidItem(item);
    const statusLabel = statusTextFor(item);
    const statusClass = statusClassFor(item);
    const sizeLabel = item.size || (item.file_count ? `${item.file_count} 个文件` : "");
    const hotLabel = item.hot ? `热度 ${item.hot}` : "热度 0";
    const resourceKey = resourceKeyFor(item);
    const timeText = displayTime(item);
    const sourceTime = timeText && timeText !== "时间待检测" ? ` · ${escapeHTML(timeText)}` : "";
    const summaryText = pickFirst(
      item.description,
      item.desc,
      item.summary,
      item.content,
      item.resource_description,
      item.resourceDesc,
      item.resource_title,
      "温馨风险提示：本站仅检索公开网盘链接，不存储任何资源。资源内各类私域引流、付费交易广告均与本站无关，请勿转账、扫码、私下交易，谨防诈骗；版权资源请获得官方授权后使用，侵权资源可提交举报屏蔽，使用本站服务即视为同意完整免责声明。"
    );
    const poster = posterHTML(item);
    const sourceMetaText = compactMeta ? sourceLabel : `资源来自 ${sourceLabel}`;
    const openMetaText = compactMeta ? (isSeed ? (sizeLabel || "--") : (item.link ? "打开" : "详情")) : (isSeed ? (sizeLabel || "文件大小 --") : (item.link ? "打开资源" : "资源详情"));
    const statusMetaText = compactMeta ? statusLabel : `状态 ${statusLabel}`;
    return `
      <article class="serp-item${poster ? " has-poster" : ""}${isSeed ? " is-seed-item" : ""}${invalid ? " is-invalid" : ""}" data-resource-key="${escapeHTML(resourceKey)}">
        <div class="serp-item__content">
          <div class="serp-item__source">${iconFor(item)}${escapeHTML(driveName)}${sourceTime}</div>
          <h2>${timeBadgeHTML(item)}<a href="javascript:void(0)" data-resource-key="${escapeHTML(resourceKey)}">${escapeHTML(item.title || "未命名资源")}</a></h2>
          <p>${escapeHTML(summaryText)}</p>
          <div class="serp-meta">
            <span>${metaIcon("source")}${escapeHTML(sourceMetaText)}</span>
            <span>${metaIcon("file")}${escapeHTML(openMetaText)}</span>
            <span class="resource-status ${escapeHTML(statusClass)}">${metaIcon("hot")}${escapeHTML(statusMetaText)}</span>
          </div>
        </div>
        ${poster}
      </article>
    `;
  }).join("");
  updateResultsHTML(nextHTML);
  renderPagination(list.length);
  syncTopbarShadow();
}

function updateResultsHTML(nextHTML) {
  if (lastResultsHTML === nextHTML) return;
  lastResultsHTML = nextHTML;
  resultsList.innerHTML = nextHTML;
}

function paginationPages(totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }
  const sorted = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  return sorted.reduce((result, page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push("ellipsis");
    result.push(page);
    return result;
  }, []);
}

function renderPagination(totalItems) {
  if (!pagination) return;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  if (totalPages <= 1) {
    pagination.classList.add("is-hidden");
    pagination.innerHTML = "";
    return;
  }
  pagination.classList.remove("is-hidden");
  const pages = paginationPages(totalPages);
  pagination.innerHTML = `
    <button class="pager-nav" type="button" data-page="${Math.max(currentPage - 1, 1)}" ${currentPage === 1 ? "disabled" : ""}>上一页</button>
    ${pages.map((page) => page === "ellipsis"
      ? "<span>...</span>"
      : `<button class="pager-page ${page === currentPage ? "is-active" : ""}" type="button" data-page="${page}" ${page === currentPage ? 'aria-current="page"' : ""}>${page}</button>`
    ).join("")}
    <button class="pager-nav" type="button" data-page="${Math.min(currentPage + 1, totalPages)}" ${currentPage === totalPages ? "disabled" : ""}>下一页</button>
  `;
}

resultsList.addEventListener("click", (event) => {
  const resourceTarget = event.target.closest("[data-resource-key]");
  if (!resourceTarget || !resultsList.contains(resourceTarget)) return;
  event.preventDefault();
  const key = resourceTarget.dataset.resourceKey || "";
  const item = findItemByResourceKey(key);
  if (isSeedItem(item)) {
    openSeedItem(item);
    return;
  }
  openTransferResourceFlow(item);
});

pagination?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-page]");
  if (!button || button.disabled) return;
  const nextPage = Number(button.dataset.page);
  if (!Number.isFinite(nextPage) || nextPage === currentPage) return;
  currentPage = nextPage;
  renderResults();
  document.getElementById("resultBoard")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

function appendItems(nextItems) {
  const seen = new Set(items.map((item) => item.resource_id || item.id || item.link || item.share_link || item.url || item.title));
  nextItems.forEach((rawItem) => {
    const item = { ...rawItem };
    item._serpOrder = itemSerial + 1;
    item.link = pickFirst(item.link, item.share_link, item.url, item.href);
    item.share_link = pickFirst(item.share_link, item.link);
    item.description = pickFirst(
      item.description,
      item.desc,
      item.summary,
      item.content,
      item.resource_description,
      item.resourceDesc,
      item.resource_title
    );
    item.desc = pickFirst(item.desc, item.description);
    if (!item.share_time && item.time) item.share_time = item.time;
    const drive = driveFor(item);
    if (drive !== "default") {
      item.drive_type = pickFirst(item.drive_type, drive);
      item.disk_type = pickFirst(item.disk_type, drive);
    }
    const key = item.resource_id || item.id || item.link || item.share_link || item.url || item.title;
    if (!key || seen.has(key)) return;
    seen.add(key);
    resourceKeyFor(item);
    items.push(item);
  });
}

async function fetchJSON(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body.code && body.code !== 0) throw new Error(body.message || "请求失败");
  return body.data || {};
}

function loadHotSearches() {
  renderHotSearches(FIXED_HOT_SEARCH_WORDS);
}

async function runSearch() {
  currentPage = 1;
  if (!query) {
    resultsList.innerHTML = `<div class="serp-empty">请输入关键词开始搜索。</div>`;
    renderPagination(0);
    renderSummary({ total: 0, counts: {} });
    return;
  }
  startedAt = performance.now();
  items = [];
  itemSerial = 0;
  resourceCheckQueue = [];
  resourceCheckQueuedKeys.clear();
  resourceCheckDoneKeys.clear();
  resourceCheckRunning = 0;
  complete = false;
  blockedMessage = "";
  blockedType = "";
  searchId = "";
  renderSummary();
  resultsList.innerHTML = renderLoadingState();
  renderPagination(0);

  const api = new URL("/api/frontend/search", window.location.origin);
  api.searchParams.set("q", query);
  if (activeDrive && activeDrive !== "play") api.searchParams.set("drive", activeDrive);
  const data = await fetchJSON(api.toString());
  searchId = data.search_id || data.searchId || "";
  complete = Boolean(data.complete);
  blockedMessage = data.blocked ? (data.message || "当前关键词已被平台屏蔽，请更换后再试。") : "";
  blockedType = data.block_type || data.blockType || "";
  appendItems(data.items || data.list || []);
  renderSummary(data);
  renderResults();
  scheduleResourceChecks();
  if (searchId && !complete) pollSearch();
}

async function pollSearch() {
  const maxPollMs = 120000;
  const pollStartedAt = performance.now();
  for (let index = 0; !complete && performance.now() - pollStartedAt < maxPollMs; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const api = new URL("/api/frontend/search/poll", window.location.origin);
    api.searchParams.set("id", searchId);
    const data = await fetchJSON(api.toString());
    complete = Boolean(data.complete);
    appendItems(data.items || data.list || []);
    renderSummary(data);
    renderResults();
    scheduleResourceChecks();
  }
  if (!complete) {
    renderSummary();
    renderResults();
  }
}

applyTheme(localStorage.getItem("yunSouTheme") || "light");
syncTopbarShadow();
window.addEventListener("scroll", syncTopbarShadow, { passive: true });
document.addEventListener("error", (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.closest(".serp-item__poster")) return;
  const poster = image.closest(".serp-item__poster");
  poster.classList.add("is-broken");
  image.remove();
}, true);

if (searchInput) searchInput.value = query;
setActiveDrive(activeDrive);
loadHotSearches();
scheduleThunderWarmup();

themeToggle?.addEventListener("click", (event) => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("yunSouTheme", nextTheme);
  applyTheme(nextTheme);
  showThemeFeedback(nextTheme, event);
});

sourceChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const drive = chip.dataset.drive || "";
    if (drive === "play") {
      const parser = JSON.parse(localStorage.getItem("yunSouPlayerParser") || "{}");
      if (!parser.url) {
        window.YunSouDialogs?.open("player");
        window.YunSouDialogs?.setStatus("player", "请先在右上角播放设置中配置解析接口。");
        return;
      }
      window.open(`./player.html?url=${encodeURIComponent(query)}`, "_blank", "noopener");
      return;
    }
    currentPage = 1;
    setActiveDrive(drive);
    updateURL();
    runSearch().catch((error) => {
      resultsList.innerHTML = `<div class="serp-empty">${escapeHTML(error.message)}</div>`;
      renderPagination(0);
    });
  });
});

clearSearch?.addEventListener("click", () => {
  searchInput.value = "";
  searchInput.focus();
});

hotSearchList?.addEventListener("click", (event) => {
  const link = event.target.closest("[data-hot-keyword]");
  if (!link) return;
  event.preventDefault();
  const nextQuery = link.dataset.hotKeyword || link.textContent || "";
  writeSearchState(nextQuery, "");
  window.location.href = "/search";
});

resultsList?.addEventListener("click", (event) => {
  const focusButton = event.target.closest("[data-focus-search]");
  if (!focusButton) return;
  searchInput?.focus();
  searchInput?.select();
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  query = searchInput.value.trim();
  if (!query) {
    searchInput.focus();
    return;
  }
  currentPage = 1;
  updateURL();
  runSearch().catch((error) => {
    resultsList.innerHTML = `<div class="serp-empty">${escapeHTML(error.message)}</div>`;
    renderPagination(0);
  });
});

runSearch().catch((error) => {
  resultsList.innerHTML = `<div class="serp-empty">${escapeHTML(error.message)}</div>`;
  renderPagination(0);
  renderSummary({ total: 0, counts: {} });
});
