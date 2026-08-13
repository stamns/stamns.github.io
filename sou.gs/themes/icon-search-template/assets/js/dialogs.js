const dialogRoot = document.getElementById("dialogRoot");
const dialogOpeners = document.querySelectorAll("[data-dialog-open]");
const dialogClosers = document.querySelectorAll("[data-dialog-close]");
const dialogPanels = document.querySelectorAll("[data-dialog-panel]");
const playerForm = document.querySelector('[data-dialog-form="player"]');
let activeDialog = null;

const driveMap = {
  "种子": "seed",
  "磁力": "seed",
  "夸克": "quark",
  "百度": "baidu",
  "迅雷": "xunlei",
  "UC": "uc",
  "播放": "play"
};

function setDialogStatus(form, message) {
  const status = form.querySelector(".dialog-form__status");
  if (status) status.textContent = message;
}

function setPanelStatus(name, message) {
  if (!dialogRoot) return;
  const panel = dialogRoot.querySelector(`[data-dialog-panel="${name}"]`);
  const status = panel?.querySelector(".dialog-form__status");
  if (status) status.textContent = message;
}

function openDialog(name) {
  if (!dialogRoot) return;
  const panel = dialogRoot.querySelector(`[data-dialog-panel="${name}"]`);
  if (!panel) return;
  dialogPanels.forEach((item) => item.classList.remove("is-active"));
  const status = panel.querySelector(".dialog-form__status");
  if (status) status.textContent = "";
  panel.classList.add("is-active");
  dialogRoot.hidden = false;
  document.body.classList.add("dialog-open");
  activeDialog = panel;
  const firstField = panel.querySelector("input, select, textarea, button");
  window.setTimeout(() => firstField?.focus(), 40);
}

function closeDialog() {
  if (!dialogRoot) return;
  dialogPanels.forEach((item) => item.classList.remove("is-active"));
  dialogRoot.hidden = true;
  document.body.classList.remove("dialog-open");
  activeDialog = null;
}

function loadPlayerSettings() {
  if (!playerForm) return;
  try {
    const saved = JSON.parse(localStorage.getItem("yunSouPlayerParser") || "{}");
    if (saved.name) playerForm.elements.parserName.value = saved.name;
    if (saved.url) playerForm.elements.parserUrl.value = saved.url;
  } catch (error) {
    localStorage.removeItem("yunSouPlayerParser");
  }
}

async function postJSON(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || (body.code && body.code !== 0)) {
    throw new Error(body.message || "提交失败");
  }
  return body.data || body;
}

dialogOpeners.forEach((opener) => {
  opener.addEventListener("click", (event) => {
    event.preventDefault();
    openDialog(opener.dataset.dialogOpen);
  });
});

dialogClosers.forEach((closer) => {
  closer.addEventListener("click", closeDialog);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeDialog) closeDialog();
});

document.querySelectorAll("[data-dialog-form]").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    if (form.dataset.dialogForm === "player") {
      localStorage.setItem("yunSouPlayerParser", JSON.stringify({
        name: form.elements.parserName.value.trim(),
        url: form.elements.parserUrl.value.trim()
      }));
      window.dispatchEvent(new CustomEvent("yunSouPlayerParserUpdated"));
      setDialogStatus(form, "播放解析接口已保存到本地。");
      return;
    }

    const panelName = form.closest("[data-dialog-panel]")?.dataset.dialogPanel || "";
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setDialogStatus(form, "正在提交...");

    try {
      if (panelName === "resource") {
        const sourceText = form.elements.source.value.trim();
        await postJSON("/api/frontend/submissions/resources", {
          title: form.elements.title.value.trim(),
          pan_type: driveMap[sourceText] || sourceText,
          link: form.elements.link.value.trim(),
          description: form.elements.from.value.trim(),
          contact: "frontend"
        });
      } else if (panelName === "demand") {
        await postJSON("/api/frontend/submissions/demands", {
          title: form.elements.name.value.trim(),
          description: form.elements.description.value.trim(),
          contact: form.elements.contact.value.trim() || "frontend"
        });
      }
      setDialogStatus(form, "已提交，感谢反馈。");
      window.setTimeout(() => {
        form.reset();
        setDialogStatus(form, "");
        closeDialog();
      }, 700);
    } catch (error) {
      setDialogStatus(form, error.message || "提交失败，请稍后再试。");
    } finally {
      submitButton.disabled = false;
    }
  });
});

loadPlayerSettings();

window.YunSouDialogs = {
  open: openDialog,
  close: closeDialog,
  setStatus: setPanelStatus
};
