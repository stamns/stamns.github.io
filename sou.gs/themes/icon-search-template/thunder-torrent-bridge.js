(function () {
  "use strict";

  var PARTNER_ID = "2549689805";
  var FIXED_REFERER = "/sou.gs/bt.sou.gs/";
  var SDK_URL = "/sou.gs/open.thunderurl.com/thunder-link.js";
  var sdkPromise = null;
  var localProbeGuarded = false;

  function text(value) {
    return String(value || "").trim();
  }

  function isMagnetURL(url) {
    return /^magnet:\?/i.test(text(url));
  }

  function isTorrentLaunchURL(url) {
    var value = text(url);
    return /(^|\/)go\/torrent(?:[?#/]|$)/i.test(value) || /\/go\/torrent\?/i.test(value);
  }

  function isThunderLocalProbeURL(url) {
    return /^http:\/\/127\.0\.0\.1:(28317|36759)\/get_thunder_version\//i.test(text(url));
  }

  function setXHRValue(xhr, key, value) {
    try {
      Object.defineProperty(xhr, key, { configurable: true, get: function () { return value; } });
    } catch (error) {
      try { xhr[key] = value; } catch (_) {}
    }
  }

  function dispatchXHRLikeEvent(xhr, type) {
    try { xhr.dispatchEvent(new Event(type)); } catch (_) {}
  }

  function installThunderLocalProbeGuard() {
    if (localProbeGuarded) return;
    if (window.fetch) {
      var originalFetch = window.fetch.bind(window);
      window.fetch = function guardedThunderFetch(input, init) {
        var url = typeof input === "string" ? input : (input && input.url ? input.url : "");
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
      var proto = window.XMLHttpRequest.prototype;
      var originalOpen = proto.open;
      var originalSend = proto.send;
      proto.open = function guardedThunderXHROpen(method, url) {
        this.__ydThunderProbeBlocked = isThunderLocalProbeURL(url);
        if (this.__ydThunderProbeBlocked) {
          this.__ydThunderProbeResponse = JSON.stringify({ ret: 0, version: "" });
          return;
        }
        return originalOpen.apply(this, arguments);
      };
      proto.send = function guardedThunderXHRSend() {
        if (!this.__ydThunderProbeBlocked) return originalSend.apply(this, arguments);
        var xhr = this;
        window.setTimeout(function () {
          setXHRValue(xhr, "readyState", 4);
          setXHRValue(xhr, "status", 200);
          setXHRValue(xhr, "statusText", "OK");
          setXHRValue(xhr, "responseText", xhr.__ydThunderProbeResponse || "{}");
          setXHRValue(xhr, "response", xhr.__ydThunderProbeResponse || "{}");
          if (typeof xhr.onreadystatechange === "function") xhr.onreadystatechange();
          dispatchXHRLikeEvent(xhr, "readystatechange");
          dispatchXHRLikeEvent(xhr, "load");
          dispatchXHRLikeEvent(xhr, "loadend");
        }, 0);
      };
    }
    localProbeGuarded = true;
  }

  function loadThunderSDK() {
    installThunderLocalProbeGuard();
    if (window.thunderLink && typeof window.thunderLink.newTask === "function") {
      return Promise.resolve(window.thunderLink);
    }
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-thunder-sdk="open-thunderurl"]');
      if (existing) {
        existing.addEventListener("load", function () { resolve(window.thunderLink); }, { once: true });
        existing.addEventListener("error", function () { reject(new Error("迅雷下载组件加载失败")); }, { once: true });
        return;
      }
      var script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.dataset.thunderSdk = "open-thunderurl";
      script.onload = function () { resolve(window.thunderLink); };
      script.onerror = function () { reject(new Error("迅雷下载组件加载失败")); };
      document.head.appendChild(script);
    });
    return sdkPromise;
  }

  function configureThunderPartner(options) {
    if (!window.thunderLink || typeof window.thunderLink.config !== "function") return;
    window.thunderLink.config({
      pid: PARTNER_ID,
      custom: PARTNER_ID,
      referer: options && options.referer ? options.referer : FIXED_REFERER
    });
  }

  function buildTaskOptions(task) {
    var name = text(task && (task.title || task.name)) || "磁力资源";
    var url = text(task && task.url);
    var extra = Object.assign({}, task && task.extra ? task.extra : {}, {
      custom: PARTNER_ID,
      pid: PARTNER_ID,
      thunderPid: PARTNER_ID
    });
    return {
      referer: FIXED_REFERER,
      custom: PARTNER_ID,
      pid: PARTNER_ID,
      thunderPid: PARTNER_ID,
      extra: extra,
      tasks: [{
        url: url,
        name: name,
        referer: FIXED_REFERER,
        custom: PARTNER_ID,
        pid: PARTNER_ID,
        thunderPid: PARTNER_ID,
        extra: extra
      }]
    };
  }

  async function taskFromLaunchURL(launchURL) {
    var url = new URL(launchURL, window.location.href);
    url.searchParams.set("referer", FIXED_REFERER);
    url.searchParams.set("custom", PARTNER_ID);
    url.searchParams.set("format", "json");
    var response = await fetch(url.toString(), { credentials: "same-origin" });
    var data = await response.json();
    if (!response.ok || !data || !data.url) throw new Error("磁力任务缺少可用下载链接");
    return data;
  }

  async function openThunderTask(input, title) {
    var url = text(input);
    if (!url) return false;
    var task = isTorrentLaunchURL(url)
      ? await taskFromLaunchURL(url)
      : { url: url, title: title || "磁力资源", referer: FIXED_REFERER, custom: PARTNER_ID };
    await loadThunderSDK();
    if (typeof window.thunderLink === "function" && typeof window.thunderLink.newTask !== "function") {
      window.thunderLink();
    }
    if (!window.thunderLink || typeof window.thunderLink.newTask !== "function") {
      throw new Error("迅雷下载组件未就绪");
    }
    var options = buildTaskOptions(task);
    configureThunderPartner(options);
    window.thunderLink.newTask(options);
    return true;
  }

  function shouldHandleAnchor(anchor) {
    if (!anchor) return false;
    var href = text(anchor.getAttribute("href"));
    return isMagnetURL(href) || isTorrentLaunchURL(href);
  }

  document.addEventListener("click", function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!shouldHandleAnchor(anchor)) return;
    var href = anchor.getAttribute("href");
    event.preventDefault();
    openThunderTask(href, anchor.textContent || anchor.getAttribute("title") || "")
      .catch(function () {
        window.location.href = href;
      });
  }, true);

  window.YunSouThunderBridge = {
    open: openThunderTask,
    config: {
      custom: PARTNER_ID,
      pid: PARTNER_ID,
      thunderPid: PARTNER_ID,
      referer: FIXED_REFERER
    }
  };
})();
