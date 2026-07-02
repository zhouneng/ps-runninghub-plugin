let entrypoints;
let storage;
let shell;
let photoshop;

try {
  const uxp = require("uxp");
  entrypoints = uxp.entrypoints;
  storage = uxp.storage;
  shell = uxp.shell;
  photoshop = require("photoshop");
} catch (error) {
  console.info("RunningHub web mode: UXP APIs are not available.");
}

const IS_UXP = !!(storage && storage.localFileSystem && photoshop);

const API = {
  account: "https://www.runninghub.cn/uc/openapi/accountStatus",
  detail: "https://www.runninghub.cn/api/webapp/detail",
  upload: "https://www.runninghub.cn/openapi/v2/media/upload/binary",
  run: "https://www.runninghub.cn/task/openapi/ai-app/run",
  query: "https://www.runninghub.cn/openapi/v2/query"
};

const IMAGE_MODELS = {
  nanobanano2: {
    name: "nanobanano2低价渠道版",
    imageEndpoint: "https://www.runninghub.cn/openapi/v2/rhart-image-n-g31-flash/image-to-image",
    textEndpoint: "https://www.runninghub.cn/openapi/v2/rhart-image-n-g31-flash/text-to-image",
    requiresResolution: true
  },
  chatgptimage2: {
    name: "ChatgptImage2低价渠道版",
    imageEndpoint: "https://www.runninghub.cn/openapi/v2/rhart-image-g-2/image-to-image",
    textEndpoint: "https://www.runninghub.cn/openapi/v2/rhart-image-g-2/text-to-image",
    requiresResolution: false
  }
};

const APP = {
  id: "8k-upscale",
  name: "8K高清修复放大",
  webappId: "2069244113970614273",
  nodeId: "914",
  nodeName: "LoadImage",
  fieldName: "image"
};

const APP_PRESETS = {
  "8k-upscale": APP
};

const STORAGE_KEYS = {
  apiKey: "runninghub.apiKey",
  instanceType: "runninghub.instanceType",
  appConfig: "runninghub.appConfig",
  autoOpenResult: "runninghub.autoOpenResult",
  history: "runninghub.history",
  imageGenHistory: "runninghub.imageGenHistory"
};

const state = {
  inputNodes: [],
  paramFiles: {},
  paramPreviews: {},
  appDetail: null,
  taskId: "",
  resultUrl: "",
  activeImageKey: "",
  busy: false,
  pollTimer: null,
  accountPollTimer: null,
  accountTaskRunning: false,
  galleryView: "timeline",
  selectedHistoryId: "",
  imageModal: {
    scale: 1,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    scrollLeft: 0,
    scrollTop: 0
  },
  imageGen: {
    references: [],
    referenceSeq: 0,
    resultUrl: "",
    taskId: "",
    pollTimer: null,
    busy: false
  }
};

function el(id) {
  return document.getElementById(id);
}

function getInstanceType() {
  const instanceInput = el("instance-type");
  return (instanceInput && instanceInput.value) || localStorage.getItem(STORAGE_KEYS.instanceType) || "plus";
}

function setBusy(value) {
  state.busy = value;
  ["load-app-detail", "save-app-config", "run-task", "query-task", "import-result", "open-result", "open-url", "copy-result-url", "clear-history", "image-gen-send"].forEach((id) => {
    const node = el(id);
    if (node) node.disabled = value;
  });
}

function setStatus(message, isError = false) {
  const node = el("status");
  const dot = el("status-dot");
  node.textContent = message;
  node.classList.toggle("error", isError);
  if (dot) {
    const text = String(message || "");
    dot.classList.toggle("error", isError);
    dot.classList.toggle("running", !isError && /(正在|处理中|等待|上传|查询|发送)/.test(text));
  }
}

function setImageGenStatus(message, isError = false) {
  const card = el("image-gen-status");
  if (!card) return;
  const text = card.querySelector("span:last-child");
  const dot = card.querySelector(".status-dot");
  if (text) text.textContent = message;
  card.classList.toggle("error", isError);
  if (dot) {
    dot.classList.toggle("error", isError);
    dot.classList.toggle("running", !isError && /(正在|处理中|等待|上传|查询|发送|生成)/.test(String(message || "")));
  }
}

function setImageGenBusy(value) {
  state.imageGen.busy = value;
  ["image-gen-send", "image-gen-ref-button", "image-gen-model"].forEach((id) => {
    const node = el(id);
    if (node) node.disabled = value;
  });
}

function findParentMatch(node, predicate) {
  let current = node;
  while (current && current !== document) {
    if (predicate(current)) return current;
    current = current.parentNode;
  }
  return null;
}

function getActions() {
  return {
    "load-app-detail": loadAppDetail,
    "save-app-config": saveAppConfig,
    "run-task": runTask,
    "query-task": queryCurrentTask,
    "import-result": importResultToPhotoshop,
    "open-result": openResultInPhotoshop,
    "open-url": openResultUrl,
    "copy-result-url": copyResultUrl,
    "clear-history": clearHistory,
    "clear-image-history": clearImageGenHistory,
    "open-image-gallery": openImageGallery,
    "open-image-gallery-popover": openImageGallery,
    "close-image-gallery": closeImageGallery,
    "gallery-view-timeline": () => setImageGalleryView("timeline"),
    "gallery-view-cluster": () => setImageGalleryView("cluster"),
    "close-gallery-detail": closeGalleryDetail,
    "account-status": refreshAccountStatus,
    "open-settings": openSettings,
    "close-settings": closeSettings,
    "save-settings": saveSettingsAndClose,
    "zoom-preview": openImageModal,
    "close-image-modal": closeImageModal,
    "zoom-in-image": () => changeImageModalZoom(0.25),
    "zoom-out-image": () => changeImageModalZoom(-0.25),
    "zoom-reset-image": () => setImageModalZoom(1),
    "close-generator-settings": closeGeneratorSettings,
    "image-gen-ref-button": pickImageGenReference,
    "image-gen-send": runImageGeneration,
    "image-gen-zoom": openImageGenerationModal,
    "image-gen-download": downloadImageGenerationResult,
    "image-gen-copy-image": copyImageGenerationImage,
    "image-gen-copy": copyImageGenerationResult
  };
}

function switchTab(name) {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === name);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${name}`);
  });
}

function forceVisibleLayout() {
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.remove("collapsed", "is-collapsed", "collapsible");
    panel.style.height = "auto";
    panel.style.maxHeight = "none";
    panel.style.overflow = "visible";
  });
}

function handleRootClick(event) {
  const tabButton = findParentMatch(event.target, (node) => node.dataset && node.dataset.tab);
  if (tabButton) {
    event.preventDefault();
    switchTab(tabButton.dataset.tab);
    return;
  }

  const ratioButton = findParentMatch(event.target, (node) => node.dataset && node.dataset.ratio);
  if (ratioButton) {
    event.preventDefault();
    selectAipRatio(ratioButton);
    closeGeneratorSettings();
    return;
  }

  const qualityButton = findParentMatch(event.target, (node) => node.dataset && node.dataset.quality);
  if (qualityButton) {
    event.preventDefault();
    selectAipQuality(qualityButton);
    closeGeneratorSettings();
    return;
  }

  const settingsButton = findParentMatch(event.target, (node) => node.dataset && node.dataset.openGeneratorSettings);
  if (settingsButton) {
    event.preventDefault();
    openGeneratorSettings(settingsButton.dataset.openGeneratorSettings);
    return;
  }

  const button = findParentMatch(event.target, (node) => String(node.tagName || "").toLowerCase() === "button");
  if (!button || button.disabled) return;

  const action = getActions()[button.id];
  if (!action) return;
  event.preventDefault();
  action();
}

function openGeneratorSettings(focus) {
  const panel = el("generator-settings");
  if (!panel) return;
  panel.hidden = false;
  panel.dataset.focus = focus || "";
}

function closeGeneratorSettings() {
  const panel = el("generator-settings");
  if (panel) panel.hidden = true;
}

function selectAipRatio(button) {
  document.querySelectorAll(".ratio-option").forEach((item) => {
    item.classList.toggle("active", item === button);
  });
  const ratio = button.dataset.ratio || "";
  const width = button.dataset.width || "";
  const height = button.dataset.height || "";
  const summary = el("aip-ratio-summary");
  const widthNode = el("aip-width");
  const heightNode = el("aip-height");
  if (summary) summary.textContent = ratio;
  if (widthNode) widthNode.textContent = width;
  if (heightNode) heightNode.textContent = height;
}

function selectAipQuality(button) {
  document.querySelectorAll(".quality-option").forEach((item) => {
    item.classList.toggle("active", item === button);
  });
  const summary = el("aip-quality-summary");
  if (summary) {
    summary.textContent = button.dataset.quality || "";
    summary.dataset.resolution = button.dataset.resolution || String(button.dataset.quality || "").toLowerCase();
  }
}

function bindDirectButtons(root) {
  const actions = getActions();
  Object.keys(actions).forEach((id) => {
    const button = el(id);
    if (!button) return;
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!button.disabled) actions[id]();
    };
  });
}

function readSettings() {
  el("api-key").value = localStorage.getItem(STORAGE_KEYS.apiKey) || "";
  const instanceInput = el("instance-type");
  if (instanceInput) instanceInput.value = localStorage.getItem(STORAGE_KEYS.instanceType) || "plus";
  const autoOpen = el("auto-open-result");
  if (autoOpen) autoOpen.checked = localStorage.getItem(STORAGE_KEYS.autoOpenResult) === "true";
  applyAppConfig(loadStoredAppConfig() || APP);
  renderHistory();
  renderImageGenHistory();
  startAccountPolling();
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.apiKey, el("api-key").value.trim());
  localStorage.setItem(STORAGE_KEYS.instanceType, getInstanceType());
  const autoOpen = el("auto-open-result");
  if (autoOpen) localStorage.setItem(STORAGE_KEYS.autoOpenResult, String(autoOpen.checked));
}

function saveSettingsAndClose() {
  saveSettings();
  closeSettings();
  setStatus("API 设置已保存。");
  startAccountPolling({ immediate: true });
}

function formatAccountNumber(value) {
  if (value == null || value === "") return "--";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number.toLocaleString("zh-CN", { maximumFractionDigits: 3 });
}

function setAccountStatus(data, isError = false) {
  const root = el("account-status");
  const coins = el("account-coins");
  const money = el("account-money");
  const tasks = el("account-tasks");
  if (!root || !coins || !money || !tasks) return;

  root.classList.toggle("error", isError);
  root.classList.toggle("loading", false);
  root.classList.toggle("running", state.accountTaskRunning);
  if (isError) {
    root.title = data || "账户信息读取失败，点击重试";
    coins.textContent = "--";
    money.textContent = "--";
    tasks.textContent = "--";
    return;
  }

  coins.textContent = formatAccountNumber(data.remainCoins);
  money.textContent = formatAccountNumber(data.remainMoney);
  const currentTaskCounts = Number(data.currentTaskCounts);
  const displayTasks = state.accountTaskRunning && Number.isFinite(currentTaskCounts) ? Math.max(1, currentTaskCounts) : data.currentTaskCounts;
  tasks.textContent = formatAccountNumber(displayTasks);
  root.title = `API 类型：${data.apiType || "--"}；货币：${data.currency || "--"}；点击刷新`;
}

function setAccountTaskRunning(isRunning) {
  const root = el("account-status");
  const tasks = el("account-tasks");
  if (!root || !tasks) return;
  state.accountTaskRunning = isRunning;
  root.classList.toggle("running", isRunning);
  if (isRunning) {
    const current = Number(String(tasks.textContent || "0").replace(/,/g, ""));
    if (Number.isFinite(current)) tasks.textContent = formatAccountNumber(Math.max(1, current + 1));
    root.title = "任务已提交，正在等待 RunningHub 同步账户状态。";
  }
}

async function fetchAccountStatus(apiKey) {
  const response = await fetch(API.account, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ apikey: apiKey })
  });
  const json = await response.json();
  if (!response.ok || json.code !== 0 || !json.data) {
    throw new Error(json.msg || json.message || `账户信息读取失败：HTTP ${response.status}`);
  }
  return json.data;
}

async function refreshAccountStatus() {
  const root = el("account-status");
  const apiKey = (el("api-key") && el("api-key").value.trim()) || localStorage.getItem(STORAGE_KEYS.apiKey) || "";
  if (!apiKey) {
    setAccountStatus("请先填写 RunningHub API Key。", true);
    return;
  }

  if (root) root.classList.add("loading");
  try {
    const data = await fetchAccountStatus(apiKey);
    setAccountStatus(data);
  } catch (error) {
    setAccountStatus(error.message || String(error), true);
  }
}

function startAccountPolling(options = {}) {
  if (state.accountPollTimer) {
    clearInterval(state.accountPollTimer);
    state.accountPollTimer = null;
  }

  const apiKey = (el("api-key") && el("api-key").value.trim()) || "";
  if (!apiKey) {
    setAccountStatus("请先填写 RunningHub API Key。", true);
    return;
  }

  refreshAccountStatus();
  state.accountPollTimer = setInterval(refreshAccountStatus, 30000);
}

function openSettings() {
  const modal = el("settings-modal");
  if (!modal) return;
  modal.hidden = false;
  const input = el("api-key");
  if (input) input.focus();
}

function closeSettings() {
  const modal = el("settings-modal");
  if (modal) modal.hidden = true;
}

function openImageModal() {
  const src = state.resultUrl || (el("preview") && el("preview").src);
  if (!src) {
    setStatus("还没有可以放大的结果图片。", true);
    return;
  }
  const modal = el("image-modal");
  const image = el("zoomed-preview");
  if (!modal || !image) return;
  image.src = src;
  modal.hidden = false;
  setImageModalZoom(1);
}

function closeImageModal() {
  const modal = el("image-modal");
  if (modal) modal.hidden = true;
  state.imageModal.dragging = false;
}

function setImageModalZoom(scale) {
  state.imageModal.scale = Math.min(5, Math.max(0.25, scale));
  const image = el("zoomed-preview");
  const level = el("image-zoom-level");
  if (image) {
    image.style.transform = `scale(${state.imageModal.scale})`;
    image.classList.toggle("is-zoomed", state.imageModal.scale > 1.01);
  }
  if (level) level.textContent = `${Math.round(state.imageModal.scale * 100)}%`;
}

function changeImageModalZoom(delta) {
  setImageModalZoom(state.imageModal.scale + delta);
}

function bindImageModalZoom() {
  const card = document.querySelector(".image-modal-card");
  const image = el("zoomed-preview");
  if (!card || !image || card.dataset.zoomBound === "true") return;
  card.dataset.zoomBound = "true";

  card.addEventListener("wheel", (event) => {
    if (el("image-modal").hidden) return;
    event.preventDefault();
    const step = event.deltaY > 0 ? -0.15 : 0.15;
    changeImageModalZoom(step);
  }, { passive: false });

  image.addEventListener("dblclick", () => {
    setImageModalZoom(state.imageModal.scale > 1.01 ? 1 : 2);
  });

  image.addEventListener("pointerdown", (event) => {
    if (state.imageModal.scale <= 1.01) return;
    state.imageModal.dragging = true;
    state.imageModal.dragStartX = event.clientX;
    state.imageModal.dragStartY = event.clientY;
    state.imageModal.scrollLeft = card.scrollLeft;
    state.imageModal.scrollTop = card.scrollTop;
    image.setPointerCapture(event.pointerId);
  });

  image.addEventListener("pointermove", (event) => {
    if (!state.imageModal.dragging) return;
    card.scrollLeft = state.imageModal.scrollLeft - (event.clientX - state.imageModal.dragStartX);
    card.scrollTop = state.imageModal.scrollTop - (event.clientY - state.imageModal.dragStartY);
  });

  image.addEventListener("pointerup", () => {
    state.imageModal.dragging = false;
  });

  image.addEventListener("pointercancel", () => {
    state.imageModal.dragging = false;
  });
}

function getApiKey() {
  const apiKey = el("api-key").value.trim();
  if (!apiKey) throw new Error("请先填写 RunningHub API Key。");
  return apiKey;
}

function loadStoredAppConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.appConfig);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readAppConfigFromForm() {
  const webappId = extractAppId(el("webapp-id").value.trim());
  const config = {
    id: "custom",
    name: el("app-name").value.trim(),
    webappId
  };

  if (!config.webappId) throw new Error("请填写 Webapp ID。");
  if (!/^\d+$/.test(config.webappId)) throw new Error("Webapp ID 应该是一串数字。");
  return config;
}

function extractAppId(value) {
  if (!value) return "";
  const match = String(value).match(/(\d{12,})/);
  return match ? match[1] : value.trim();
}

function applyAppConfig(config) {
  el("app-name").value = config.name || "";
  el("webapp-id").value = String(config.webappId || "");
  el("app-type").value = config.type || "";
  el("app-badge").textContent = config.name || "AI 应用";
  el("app-badge").title = config.name || "AI 应用";
}

function saveAppConfig() {
  try {
    const config = readAppConfigFromForm();
    localStorage.setItem(STORAGE_KEYS.appConfig, JSON.stringify({
      ...config,
      type: el("app-type").value.trim()
    }));
    saveSettings();
    applyAppConfig(config);
    setStatus("应用已保存。");
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

function readHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.history);
    const history = raw ? JSON.parse(raw) : [];
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function writeHistory(history) {
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history.slice(0, 20)));
}

function addHistory(item) {
  const history = readHistory();
  writeHistory([
    {
      ...item,
      createdAt: new Date().toLocaleString()
    },
    ...history.filter((entry) => entry.taskId !== item.taskId)
  ]);
  renderHistory();
}

function renderHistory() {
  const container = el("history-list");
  if (!container) return;
  const history = readHistory();
  if (!history.length) {
    container.innerHTML = '<div class="hint">暂无历史记录。</div>';
    return;
  }
  container.innerHTML = "";
  for (const item of history) {
    const row = document.createElement("div");
    row.className = "history-item";
    row.innerHTML = `
      <div class="history-thumb">${item.resultUrl ? `<img src="${item.resultUrl}" alt="" />` : ""}</div>
      <div>
        <div class="history-title">${item.appName || "AI 应用"}</div>
        <div class="history-meta">${item.createdAt || ""} · ${item.taskId || ""}</div>
      </div>
      <button class="ghost-button" type="button">载入</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      state.taskId = item.taskId || "";
      state.resultUrl = item.resultUrl || "";
      el("task-id").value = state.taskId;
      if (state.resultUrl) showResult(state.resultUrl);
      setStatus("已载入历史记录。");
    });
    container.appendChild(row);
  }
}

function clearHistory() {
  localStorage.removeItem(STORAGE_KEYS.history);
  renderHistory();
  setStatus("历史记录已清空。");
}

function readImageGenHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.imageGenHistory);
    const history = raw ? JSON.parse(raw) : [];
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function writeImageGenHistory(history) {
  localStorage.setItem(STORAGE_KEYS.imageGenHistory, JSON.stringify(history.slice(0, 100)));
}

function addImageGenHistory(item) {
  const history = readImageGenHistory();
  const historyId = item.historyId || item.taskId || `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  writeImageGenHistory([
    {
      ...item,
      historyId,
      createdAt: new Date().toLocaleString()
    },
    ...history.filter((entry) => (item.taskId ? entry.taskId !== item.taskId : entry.historyId !== historyId))
  ]);
  renderImageGenHistory();
}

function renderImageGenHistory() {
  const container = el("image-gen-history-list");
  const count = el("image-history-count");
  const galleryCount = el("image-gallery-count");
  const history = readImageGenHistory();
  if (count) count.textContent = String(history.length);
  if (galleryCount) galleryCount.textContent = `(${history.length})`;
  if (!container) return;
  if (!history.length) {
    container.innerHTML = '<div class="image-history-empty">暂无历史记录</div>';
    renderImageGallery();
    return;
  }

  container.innerHTML = "";
  for (const item of history.slice(0, 24)) {
    const card = document.createElement("article");
    card.className = "image-history-card";
    card.innerHTML = `
      <button class="image-history-thumb" type="button" title="查看详情">
        ${item.resultUrl ? `<img src="${item.resultUrl}" alt="" />` : ""}
      </button>
      <button class="image-history-delete" type="button" title="删除这条记录">×</button>
      <div class="image-history-body">
        <div class="image-history-title">${item.modelName || "图片生成"}</div>
        <div class="image-history-meta">${item.createdAt || ""}</div>
        <div class="image-history-prompt">${item.prompt || ""}</div>
      </div>
      <div class="image-history-actions">
        <button class="image-history-load" type="button">载入</button>
        <button class="image-history-copy" type="button">复制链接</button>
      </div>
    `;
    card.querySelector(".image-history-thumb").addEventListener("click", () => openImageGalleryDetail(item, { openGallery: true }));
    card.querySelector(".image-history-delete").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteImageGenHistoryItem(item);
    });
    card.querySelector(".image-history-load").addEventListener("click", () => loadImageGenHistoryItem(item));
    card.querySelector(".image-history-copy").addEventListener("click", async () => {
      if (!item.resultUrl) return;
      try {
        await navigator.clipboard.writeText(item.resultUrl);
      } catch {
        const input = el("image-gen-result-url");
        if (input) {
          input.hidden = false;
          input.value = item.resultUrl;
          input.select();
          document.execCommand("copy");
          input.hidden = true;
        }
      }
    });
    container.appendChild(card);
  }
  renderImageGallery();
}

function getFilteredImageGenHistory() {
  const history = readImageGenHistory();
  const query = (el("image-gallery-search") && el("image-gallery-search").value.trim().toLowerCase()) || "";
  if (!query) return history;
  return history.filter((item) => {
    return [item.prompt, item.modelName, item.createdAt, item.taskId].some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function openImageGallery() {
  const modal = el("image-gallery-modal");
  if (!modal) return;
  modal.hidden = false;
  renderImageGallery();
  const search = el("image-gallery-search");
  if (search) search.focus();
}

function closeImageGallery() {
  const modal = el("image-gallery-modal");
  if (modal) modal.hidden = true;
  closeGalleryDetail();
}

function setImageGalleryView(view) {
  state.galleryView = view === "cluster" ? "cluster" : "timeline";
  const timeline = el("gallery-view-timeline");
  const cluster = el("gallery-view-cluster");
  if (timeline) timeline.classList.toggle("active", state.galleryView === "timeline");
  if (cluster) cluster.classList.toggle("active", state.galleryView === "cluster");
  renderImageGallery();
}

function renderImageGallery() {
  const content = el("image-gallery-content");
  const galleryCount = el("image-gallery-count");
  const main = el("image-gallery-main");
  if (!content) return;
  const history = getFilteredImageGenHistory();
  if (galleryCount) galleryCount.textContent = `(${readImageGenHistory().length})`;
  content.classList.toggle("cluster", state.galleryView === "cluster");
  content.classList.toggle("timeline", state.galleryView !== "cluster");

  if (!history.length) {
    if (main) main.classList.remove("has-detail");
    content.innerHTML = '<div class="gallery-empty"><span>▧</span><strong>暂无图片</strong></div>';
    state.selectedHistoryId = "";
    const detail = el("image-gallery-detail");
    if (detail) {
      detail.classList.remove("active");
      detail.innerHTML = '<div class="gallery-detail-empty">选择一条历史记录查看详情</div>';
    }
    renderGalleryFilmstrip([]);
    return;
  }

  renderGalleryFilmstrip(history);

  const selected = history.find((item) => (item.historyId || item.taskId) === state.selectedHistoryId);
  if (selected) {
    renderGalleryStage(selected);
    renderImageGallerySelection();
    return;
  }

  if (main) main.classList.remove("has-detail");

  if (state.galleryView === "cluster") {
    const groups = history.reduce((acc, item) => {
      const key = item.modelName || "图片生成";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
    content.innerHTML = "";
    for (const [groupName, items] of Object.entries(groups)) {
      const group = document.createElement("section");
      group.className = "gallery-group";
      group.innerHTML = `<h3>${groupName} <span>${items.length}</span></h3><div class="gallery-grid"></div>`;
      const grid = group.querySelector(".gallery-grid");
      items.forEach((item) => grid.appendChild(createGalleryItem(item)));
      content.appendChild(group);
    }
    renderImageGallerySelection();
    return;
  }

  content.innerHTML = '<div class="gallery-grid"></div>';
  const grid = content.querySelector(".gallery-grid");
  history.forEach((item) => grid.appendChild(createGalleryItem(item)));
  renderImageGallerySelection();
}

function createGalleryItem(item) {
  const card = document.createElement("article");
  card.className = "gallery-item";
  card.dataset.historyId = item.historyId || item.taskId || "";
  card.innerHTML = `
    <button class="gallery-item-delete" type="button" title="删除这条记录">×</button>
    <button class="gallery-thumb" type="button" title="查看详情">
      ${item.resultUrl ? `<img src="${item.resultUrl}" alt="" />` : ""}
    </button>
    <div class="gallery-item-info">
      <div class="gallery-item-title">${item.modelName || "图片生成"}</div>
      <div class="gallery-item-meta">${item.createdAt || ""}</div>
      <div class="gallery-item-prompt">${item.prompt || ""}</div>
    </div>
  `;
  card.querySelector(".gallery-thumb").addEventListener("click", () => {
    openImageGalleryDetail(item);
  });
  card.querySelector(".gallery-item-delete").addEventListener("click", (event) => {
    event.stopPropagation();
    deleteImageGenHistoryItem(item);
  });
  return card;
}

function renderGalleryStage(item) {
  const content = el("image-gallery-content");
  const main = el("image-gallery-main");
  if (!content) return;
  if (main) main.classList.add("has-detail");
  content.classList.remove("cluster");
  content.classList.add("stage");
  content.innerHTML = `
    <div class="gallery-stage">
      <button class="gallery-stage-image" type="button" title="点击放大">
        ${item.resultUrl ? `<img src="${item.resultUrl}" alt="" />` : ""}
      </button>
    </div>
  `;
  const stageButton = content.querySelector(".gallery-stage-image");
  if (stageButton) {
    stageButton.addEventListener("click", () => {
      state.imageGen.resultUrl = item.resultUrl || "";
      openImageGenerationModal();
    });
  }
}

function renderGalleryFilmstrip(history) {
  const strip = el("image-gallery-filmstrip");
  if (!strip) return;
  if (!history.length) {
    strip.innerHTML = "";
    return;
  }
  strip.innerHTML = "";
  history.forEach((item, index) => {
    const id = item.historyId || item.taskId || "";
    const button = document.createElement("button");
    button.className = "filmstrip-item";
    button.dataset.historyId = id;
    button.type = "button";
    button.title = item.prompt || item.modelName || "历史记录";
    button.innerHTML = `
      <span class="filmstrip-index">${index + 1}</span>
      ${item.resultUrl ? `<img src="${item.resultUrl}" alt="" />` : ""}
    `;
    button.addEventListener("click", () => openImageGalleryDetail(item));
    strip.appendChild(button);
  });
  renderImageGallerySelection();
}

function loadImageGenHistoryItem(item) {
  if (!item || !item.resultUrl) return;
  state.imageGen.resultUrl = item.resultUrl;
  state.imageGen.taskId = item.taskId || "";
  if (item.taskId) el("task-id").value = item.taskId;
  showImageGenerationResult(item.resultUrl, { skipHistory: true });
  if (item.prompt && el("image-gen-prompt")) el("image-gen-prompt").value = item.prompt;
}

function deleteImageGenHistoryItem(item) {
  const id = item && (item.historyId || item.taskId);
  if (!id) return;
  const history = readImageGenHistory().filter((entry) => (entry.historyId || entry.taskId) !== id);
  writeImageGenHistory(history);
  if (state.selectedHistoryId === id) closeGalleryDetail();
  renderImageGenHistory();
}

function openImageGalleryDetail(item, options = {}) {
  if (!item) return;
  if (options.openGallery) openImageGallery();
  const detail = el("image-gallery-detail");
  if (!detail) return;
  state.selectedHistoryId = item.historyId || item.taskId || "";
  renderGalleryStage(item);
  detail.classList.add("active");
  detail.innerHTML = `
    <button id="close-gallery-detail" class="gallery-detail-close" type="button">×</button>
    <button class="gallery-detail-delete" type="button" title="删除这条记录">×</button>
    <div class="gallery-detail-info">
      <div class="gallery-detail-title">${item.modelName || "图片生成"}</div>
      <div class="gallery-detail-meta">${item.createdAt || ""}${item.taskId ? ` · Task ${item.taskId}` : ""}</div>
      <label>提示词</label>
      <div class="gallery-detail-prompt">${item.prompt || "无提示词记录"}</div>
      <div class="gallery-detail-actions">
        <button class="gallery-detail-load" type="button">载入到预览</button>
        <button class="gallery-detail-copy" type="button">复制链接</button>
      </div>
    </div>
  `;
  detail.querySelector("#close-gallery-detail").addEventListener("click", closeGalleryDetail);
  detail.querySelector(".gallery-detail-delete").addEventListener("click", () => deleteImageGenHistoryItem(item));
  detail.querySelector(".gallery-detail-load").addEventListener("click", () => loadImageGenHistoryItem(item));
  detail.querySelector(".gallery-detail-copy").addEventListener("click", async () => {
    if (item.resultUrl) await navigator.clipboard.writeText(item.resultUrl);
  });
  renderImageGallerySelection();
}

function closeGalleryDetail() {
  state.selectedHistoryId = "";
  const detail = el("image-gallery-detail");
  if (!detail) return;
  detail.classList.remove("active");
  detail.innerHTML = `
    <button id="close-gallery-detail" class="gallery-detail-close" type="button">×</button>
    <div class="gallery-detail-empty">选择一条历史记录查看详情</div>
  `;
  const close = detail.querySelector("#close-gallery-detail");
  if (close) close.addEventListener("click", closeGalleryDetail);
  renderImageGallery();
  renderImageGallerySelection();
}

function renderImageGallerySelection() {
  document.querySelectorAll(".gallery-item").forEach((card) => {
    card.classList.toggle("selected", !!state.selectedHistoryId && card.dataset.historyId === state.selectedHistoryId);
  });
  document.querySelectorAll(".filmstrip-item").forEach((card) => {
    card.classList.toggle("selected", !!state.selectedHistoryId && card.dataset.historyId === state.selectedHistoryId);
  });
}

function clearImageGenHistory() {
  localStorage.removeItem(STORAGE_KEYS.imageGenHistory);
  renderImageGenHistory();
  renderImageGallery();
}

function getFileExtension(name) {
  const fallback = "png";
  if (!name || !name.includes(".")) return fallback;
  return name.split(".").pop().toLowerCase() || fallback;
}

function guessMimeType(name) {
  const ext = getFileExtension(name);
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

function isImageNode(node) {
  const type = String(node.fieldType || "").toUpperCase();
  const fieldName = String(node.fieldName || "").toLowerCase();
  const nodeName = String(node.nodeName || "").toLowerCase();
  return type === "IMAGE" || fieldName.includes("image") || nodeName.includes("loadimage");
}

function getNodeKey(node) {
  return `${node.nodeId || ""}:${node.fieldName || ""}`;
}

function getNodeLabel(node) {
  return node.description || node.descriptionCn || node.descriptionEn || node.fieldName || node.nodeName || "参数";
}

function parseFieldData(value) {
  if (!value || typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function collectOptionValues(source, values = []) {
  if (source == null) return values;

  if (Array.isArray(source)) {
    for (const item of source) collectOptionValues(item, values);
    return values;
  }

  if (typeof source === "object") {
    const likelyLists = [
      source.values,
      source.options,
      source.choices,
      source.items,
      source.enum,
      source.list
    ];
    for (const list of likelyLists) {
      if (Array.isArray(list)) collectOptionValues(list, values);
    }

    for (const key of Object.keys(source)) {
      if (/^(value|label|name|text|title)$/i.test(key)) {
        collectOptionValues(source[key], values);
      }
    }
    return values;
  }

  if (typeof source === "string" || typeof source === "number" || typeof source === "boolean") {
    const option = String(source).trim();
    if (option && option !== "None" && option !== "keep_this_dic") values.push(option);
  }

  return values;
}

function getNodeOptions(node) {
  const parsed = parseFieldData(node.fieldData);
  const options = collectOptionValues(parsed)
    .filter((value) => value && value !== String(node.fieldName || "") && value !== String(node.nodeName || ""));

  const unique = [];
  for (const option of options) {
    if (!unique.includes(option)) unique.push(option);
  }

  const current = String(node.fieldValue || "").trim();
  if (unique.length && current && !unique.includes(current)) {
    unique.unshift(current);
  }

  return unique;
}

function shouldRenderSelect(node, options) {
  const type = String(node.fieldType || "").toUpperCase();
  return options.length > 1 || ["COMBO", "SELECT", "DROPDOWN", "ENUM", "BOOLEAN"].includes(type);
}

function renderInputNodes(nodes) {
  const container = el("dynamic-params");
  const empty = el("params-empty");
  state.inputNodes = Array.isArray(nodes) ? nodes : [];
  state.paramFiles = {};
  state.paramPreviews = {};
  container.innerHTML = "";

  if (!state.inputNodes.length) {
    empty.textContent = "这个应用没有公开输入参数，或需要在 RunningHub 后台查看 API 示例。";
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  for (const node of state.inputNodes) {
    const key = getNodeKey(node);
    const label = getNodeLabel(node);
    const field = document.createElement("div");
    field.className = "param-field";
    field.dataset.key = key;

    const meta = document.createElement("div");
    meta.className = "param-meta";
    meta.innerHTML = `<span>${label}</span><span>nodeId ${node.nodeId} / ${node.fieldName}</span>`;
    field.appendChild(meta);

    if (isImageNode(node)) {
      const dropZone = document.createElement("div");
      dropZone.className = "drop-zone";
      dropZone.dataset.key = key;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "pick-image-button";
      button.textContent = "选择图片";
      button.addEventListener("click", () => pickParamFile(key));
      dropZone.appendChild(button);

      const dropHint = document.createElement("div");
      dropHint.className = "drop-hint";
      dropHint.textContent = "也可以拖拽图片到这里，或复制图片后粘贴";
      dropZone.appendChild(dropHint);

      const name = document.createElement("div");
      name.id = `param-file-${cssEscape(key)}`;
      name.className = "file-name";
      name.textContent = "暂未选择图片";
      dropZone.appendChild(name);

      const previewWrap = document.createElement("div");
      previewWrap.id = `param-preview-wrap-${cssEscape(key)}`;
      previewWrap.className = "input-preview-wrap";
      previewWrap.style.display = "none";
      previewWrap.innerHTML = `
        <img id="param-preview-${cssEscape(key)}" class="input-preview" alt="" />
        <div id="param-upload-status-${cssEscape(key)}" class="upload-chip">本地待上传</div>
      `;
      dropZone.appendChild(previewWrap);
      bindDropZone(dropZone, key);
      field.appendChild(dropZone);
    } else {
      const options = getNodeOptions(node);
      if (shouldRenderSelect(node, options)) {
        const select = document.createElement("select");
        select.id = `param-value-${cssEscape(key)}`;
        select.className = "param-input";
        const current = String(node.fieldValue || "").trim();
        const selectOptions = options.length ? options : current ? [current] : [];
        for (const optionValue of selectOptions) {
          const option = document.createElement("option");
          option.value = optionValue;
          option.textContent = optionValue;
          select.appendChild(option);
        }
        if (current) select.value = current;
        field.appendChild(select);
        if (!selectOptions.length) {
          const hint = document.createElement("div");
          hint.className = "hint";
          hint.textContent = "没有读取到可选项，请在 AI 应用详情页确认该参数。";
          field.appendChild(hint);
        }
        container.appendChild(field);
        continue;
      }

      const input = document.createElement("textarea");
      input.id = `param-value-${cssEscape(key)}`;
      input.className = "param-input";
      input.placeholder = node.fieldValue || `填写${label}`;
      input.value = node.fieldValue || "";
      field.appendChild(input);
    }

    container.appendChild(field);
  }
}

function cssEscape(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function pickParamFile(key) {
  try {
    state.activeImageKey = key;
    if (!storage || !storage.localFileSystem) {
      const file = await pickBrowserFile();
      if (!file) return;
      await setParamFile(key, file);
      return;
    }

    const file = await storage.localFileSystem.getFileForOpening({
      types: ["png", "jpg", "jpeg", "webp"],
      allowMultiple: false
    });
    if (!file) return;
    await setParamFile(key, file);
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

async function setParamFile(key, file) {
  state.activeImageKey = key;
  state.paramFiles[key] = file;
  const label = el(`param-file-${cssEscape(key)}`);
  if (label) label.textContent = file.name || file.nativePath || "已选择图片";
  await showLocalFilePreview(key, file);
  setStatus("图片已选择，可以提交到 RunningHub。");
}

function bindDropZone(dropZone, key) {
  dropZone.addEventListener("click", () => {
    state.activeImageKey = key;
  });
  dropZone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    state.activeImageKey = key;
    dropZone.classList.add("is-dragging");
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("is-dragging");
  });
  dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
    const file = getImageFileFromList(event.dataTransfer && event.dataTransfer.files);
    if (!file) {
      setStatus("没有找到可用的图片文件。", true);
      return;
    }
    await setParamFile(key, file);
  });
}

function getImageFileFromList(files) {
  if (!files) return null;
  for (const file of Array.from(files)) {
    if (file && String(file.type || "").startsWith("image/")) return file;
  }
  return null;
}

function getImageFilesFromList(files) {
  if (!files) return [];
  return Array.from(files).filter((file) => file && String(file.type || "").startsWith("image/"));
}

async function handlePaste(event) {
  if (isTabActive("aip")) {
    const items = event.clipboardData && event.clipboardData.items ? Array.from(event.clipboardData.items) : [];
    for (const item of items) {
      if (item.type && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          await addImageGenReferences([file]);
        }
        return;
      }
    }
  }

  const key = state.activeImageKey || getFirstImageNodeKey();
  if (!key) return;
  const items = event.clipboardData && event.clipboardData.items ? Array.from(event.clipboardData.items) : [];
  for (const item of items) {
    if (item.type && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        event.preventDefault();
        await setParamFile(key, file);
      }
      return;
    }
  }
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    closeImageGallery();
  }
}

function isTabActive(name) {
  const panel = el(`tab-${name}`);
  return !!(panel && panel.classList.contains("active"));
}

function getFirstImageNodeKey() {
  const node = state.inputNodes.find(isImageNode);
  return node ? getNodeKey(node) : "";
}

function pickBrowserFile() {
  return new Promise((resolve) => {
    const input = el("web-file-picker") || createBrowserFileInput();
    input.value = "";
    input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
    input.click();
  });
}

function createBrowserFileInput() {
  const input = document.createElement("input");
  input.id = "web-file-picker";
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp";
  input.hidden = true;
  document.body.appendChild(input);
  return input;
}

async function readBinaryFile(file) {
  if (file && typeof file.arrayBuffer === "function") {
    return file.arrayBuffer();
  }
  if (file && typeof file.read === "function" && storage && storage.formats) {
    return file.read({ format: storage.formats.binary });
  }
  throw new Error("无法读取选择的图片文件。");
}

async function showLocalFilePreview(key, file) {
  const wrap = el(`param-preview-wrap-${cssEscape(key)}`);
  const image = el(`param-preview-${cssEscape(key)}`);
  const chip = el(`param-upload-status-${cssEscape(key)}`);
  if (!wrap || !image) return;

  if (state.paramPreviews[key]) {
    URL.revokeObjectURL(state.paramPreviews[key]);
    delete state.paramPreviews[key];
  }

  const buffer = await readBinaryFile(file);
  const blob = new Blob([buffer], { type: guessMimeType(file.name) });
  const url = URL.createObjectURL(blob);
  state.paramPreviews[key] = url;
  image.src = url;
  wrap.style.display = "block";
  if (chip) {
    chip.textContent = "本地待上传";
    chip.classList.remove("uploaded");
  }
}

function markParamUploaded(key) {
  const chip = el(`param-upload-status-${cssEscape(key)}`);
  if (!chip) return;
  chip.textContent = "已上传";
  chip.classList.add("uploaded");
}

async function loadAppDetail() {
  setBusy(true);
  try {
    saveSettings();
    const { webappId } = readAppConfigFromForm();
    setStatus("正在读取 AI 应用参数...");
    const response = await fetch(API.detail, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ webappId })
    });
    const json = await response.json();
    if (!response.ok || json.code !== 0 || !json.data) {
      throw new Error(json.msg || json.message || `读取应用失败：HTTP ${response.status}`);
    }

    const detail = json.data;
    state.appDetail = detail;
    const type = Array.isArray(detail.tags) ? detail.tags.map((tag) => tag.name || tag.nameEn).filter(Boolean).join(" / ") : "";
    applyAppConfig({
      name: decodeText(detail.name || ""),
      webappId: String(detail.id || webappId),
      type: decodeText(type)
    });
    localStorage.setItem(STORAGE_KEYS.appConfig, JSON.stringify({
      name: decodeText(detail.name || ""),
      webappId: String(detail.id || webappId),
      type: decodeText(type)
    }));
    renderInputNodes((detail.inputNodes || []).map(normalizeNodeText));

    const seconds = detail.avgRunningSeconds ? `\n预估时间：约 ${detail.avgRunningSeconds} 秒` : "";
    setStatus(`应用参数已读取。${seconds}\n费用以 RunningHub 实际扣费为准。`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    setBusy(false);
  }
}

function normalizeNodeText(node) {
  return {
    ...node,
    nodeName: decodeText(node.nodeName || ""),
    fieldName: decodeText(node.fieldName || ""),
    fieldValue: decodeText(node.fieldValue || ""),
    fieldData: decodeText(node.fieldData || ""),
    description: decodeText(node.description || ""),
    descriptionCn: decodeText(node.descriptionCn || ""),
    descriptionEn: decodeText(node.descriptionEn || "")
  };
}

function decodeText(value) {
  if (typeof value !== "string") return value;
  if (!/[ÃÂ]|æ|é|å|ä|ç|å/.test(value)) return value;
  try {
    return decodeURIComponent(escape(value));
  } catch {
    return value;
  }
}

async function uploadImage(apiKey, file) {
  const buffer = await readBinaryFile(file);
  const blob = new Blob([buffer], { type: guessMimeType(file.name) });
  const form = new FormData();
  form.append("file", blob, file.name || `runninghub-input.${getFileExtension(file.name)}`);

  const response = await fetch(API.upload, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  const json = await response.json();
  if (!response.ok || json.code !== 0) {
    throw new Error(json.message || json.msg || `上传失败：HTTP ${response.status}`);
  }
  if (!json.data || !json.data.fileName) {
    throw new Error("上传成功，但没有返回 fileName。");
  }
  return json.data;
}

async function pickImageGenReference() {
  try {
    const input = el("image-gen-file-picker");
    if (!input) throw new Error("没有找到图片选择器。");
    input.value = "";
    input.onchange = async () => {
      const files = getImageFilesFromList(input.files);
      if (files.length) await addImageGenReferences(files);
    };
    input.click();
  } catch (error) {
    setImageGenStatus(error.message || String(error), true);
  }
}

async function addImageGenReferences(files) {
  for (const file of files) {
    await setImageGenReference(file);
  }
  renderImageGenReferences();
  setImageGenStatus(`${state.imageGen.references.length} 张参考图已选择，可以输入提示词并生成。`);
}

async function setImageGenReference(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new Error("请选择图片文件。");
  }

  const buffer = await readBinaryFile(file);
  const blob = new Blob([buffer], { type: guessMimeType(file.name) });
  state.imageGen.referenceSeq += 1;
  state.imageGen.references.push({
    id: `ref-${Date.now()}-${state.imageGen.referenceSeq}`,
    file,
    previewUrl: URL.createObjectURL(blob)
  });
}

function getImageReferenceLabel(index) {
  const labels = ["图一", "图二", "图三", "图四", "图五", "图六", "图七", "图八", "图九"];
  return labels[index] || `图${index + 1}`;
}

function renderImageGenReferences() {
  const list = el("image-gen-reference-list");
  const addButton = el("image-gen-ref-button");
  const name = el("image-gen-file-name");
  if (!list || !addButton) return;

  list.querySelectorAll(".reference-thumb").forEach((node) => node.remove());
  state.imageGen.references.forEach((reference, index) => {
    const item = document.createElement("div");
    item.className = "reference-thumb";
    item.draggable = true;
    item.dataset.referenceId = reference.id;
    item.title = "按住 Ctrl 点击可插入引用，拖拽可调整顺序";
    item.innerHTML = `
      <img class="reference-preview" src="${reference.previewUrl}" alt="${getImageReferenceLabel(index)}" />
      <span class="reference-index">${index + 1}</span>
      <button class="reference-remove" type="button" title="删除参考图">×</button>
    `;
    item.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        insertImageReferenceToken(reference.id);
      }
    });
    item.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", reference.id);
      item.classList.add("is-dragging");
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("is-dragging");
    });
    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      item.classList.add("is-drop-target");
    });
    item.addEventListener("dragleave", () => {
      item.classList.remove("is-drop-target");
    });
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      item.classList.remove("is-drop-target");
      reorderImageReference(event.dataTransfer.getData("text/plain"), reference.id);
    });
    const remove = item.querySelector(".reference-remove");
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeImageGenReference(reference.id);
    });
    list.insertBefore(item, addButton);
  });

  if (name) {
    const count = state.imageGen.references.length;
    name.textContent = count ? `已选择 ${count} 张参考图；Ctrl+点击缩略图可插入 @图一` : "未选择参考图，将使用文生图模式";
  }
  renderPromptReferenceChips();
}

function removeImageGenReference(id) {
  const index = state.imageGen.references.findIndex((reference) => reference.id === id);
  if (index < 0) return;
  const [removed] = state.imageGen.references.splice(index, 1);
  if (removed && removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
  renderImageGenReferences();
}

function reorderImageReference(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const sourceIndex = state.imageGen.references.findIndex((reference) => reference.id === sourceId);
  const targetIndex = state.imageGen.references.findIndex((reference) => reference.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [moved] = state.imageGen.references.splice(sourceIndex, 1);
  state.imageGen.references.splice(targetIndex, 0, moved);
  renderImageGenReferences();
}

function insertImageReferenceToken(id) {
  const index = state.imageGen.references.findIndex((reference) => reference.id === id);
  if (index < 0) return;
  const prompt = el("image-gen-prompt");
  if (!prompt) return;
  const token = `@${getImageReferenceLabel(index)}`;
  const start = prompt.selectionStart || 0;
  const end = prompt.selectionEnd || start;
  const prefix = start > 0 && !/\s/.test(prompt.value[start - 1]) ? " " : "";
  const suffix = end < prompt.value.length && !/\s/.test(prompt.value[end]) ? " " : "";
  prompt.value = `${prompt.value.slice(0, start)}${prefix}${token}${suffix}${prompt.value.slice(end)}`;
  const cursor = start + prefix.length + token.length + suffix.length;
  prompt.focus();
  prompt.setSelectionRange(cursor, cursor);
  renderPromptReferenceChips();
}

function renderPromptReferenceChips() {
  const chips = el("prompt-reference-chips");
  const prompt = el("image-gen-prompt");
  if (!chips || !prompt) return;
  chips.innerHTML = "";
  state.imageGen.references.forEach((reference, index) => {
    const token = `@${getImageReferenceLabel(index)}`;
    if (!prompt.value.includes(token)) return;
    const chip = document.createElement("span");
    chip.className = "prompt-reference-chip";
    chip.innerHTML = `<img src="${reference.previewUrl}" alt="" /><span>${token}</span>`;
    chips.appendChild(chip);
  });
  chips.hidden = !chips.childElementCount;
}

function normalizeUploadedImageUrl(data) {
  const value = data && (data.download_url || data.downloadUrl || data.url || data.fileName);
  if (!value) throw new Error("上传成功，但没有返回可用于 imageUrls 的图片地址。");
  return String(value);
}

function getImageGenerationPayload(uploadedUrls) {
  const prompt = el("image-gen-prompt").value.trim();
  if (!prompt) throw new Error("请先输入提示词。");

  const ratio = (el("aip-ratio-summary") && el("aip-ratio-summary").textContent.trim()) || "";
  const quality = el("aip-quality-summary");
  const resolution = (quality && (quality.dataset.resolution || quality.textContent || "")).trim().toLowerCase();
  const payload = {
    prompt
  };

  if (uploadedUrls && uploadedUrls.length) payload.imageUrls = uploadedUrls;
  if (ratio && ratio !== "智能") payload.aspectRatio = ratio;
  if (resolution) payload.resolution = resolution;
  return payload;
}

async function submitImageGenerationTask(apiKey, endpoint, payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.errorMessage || json.message || `任务提交失败：HTTP ${response.status}`);
  }
  if (!json.taskId) {
    throw new Error(json.errorMessage || "任务提交成功，但没有返回 taskId。");
  }
  return json;
}

async function runImageGeneration() {
  setImageGenBusy(true);
  try {
    saveSettings();
    const apiKey = getApiKey();
    const modelKey = el("image-gen-model").value;
    const model = IMAGE_MODELS[modelKey] || IMAGE_MODELS.nanobanano2;
    const references = state.imageGen.references;
    const hasReference = references.length > 0;
    const uploadedUrls = [];

    if (hasReference) {
      for (let index = 0; index < references.length; index += 1) {
        setImageGenStatus(`正在上传参考图 ${index + 1}/${references.length}...`);
        const uploaded = await uploadImage(apiKey, references[index].file);
        uploadedUrls.push(normalizeUploadedImageUrl(uploaded));
      }
    }

    const payload = getImageGenerationPayload(uploadedUrls);

    if (model.requiresResolution && !payload.resolution) {
      throw new Error(`${model.name} 需要选择分辨率。`);
    }

    const endpoint = hasReference ? model.imageEndpoint : model.textEndpoint;
    const modeName = hasReference ? "图生图" : "文生图";
    setImageGenStatus(`正在提交到 ${model.name}（${modeName}）...`);
    const task = await submitImageGenerationTask(apiKey, endpoint, payload);
    state.imageGen.taskId = String(task.taskId);
    el("task-id").value = state.imageGen.taskId;
    setImageGenStatus(`${modeName}任务已提交，正在等待结果。Task ID: ${state.imageGen.taskId}`);
    setAccountTaskRunning(true);
    refreshAccountStatus();
    startImageGenerationPoll(apiKey, state.imageGen.taskId, `${model.name} ${modeName}`);
  } catch (error) {
    setImageGenStatus(error.message || String(error), true);
    setImageGenBusy(false);
  }
}

function stopImageGenerationPoll() {
  if (state.imageGen.pollTimer) {
    clearTimeout(state.imageGen.pollTimer);
    state.imageGen.pollTimer = null;
  }
}

function startImageGenerationPoll(apiKey, taskId, modelName) {
  stopImageGenerationPoll();
  const startedAt = Date.now();
  const poll = async () => {
    try {
      const result = await queryTask(apiKey, taskId);
      const status = result.status || "UNKNOWN";

      if (status === "SUCCESS") {
        const first = Array.isArray(result.results) ? result.results.find((item) => item && item.url) : null;
        if (!first || !first.url) throw new Error("任务成功，但没有返回图片结果。");
        showImageGenerationResult(first.url);
        setImageGenStatus(`${modelName} 生成完成。Task ID: ${taskId}`);
        setAccountTaskRunning(false);
        refreshAccountStatus();
        setImageGenBusy(false);
        stopImageGenerationPoll();
        return;
      }

      if (status === "FAILED") {
        setAccountTaskRunning(false);
        throw new Error(result.errorMessage || "图片生成任务失败。");
      }

      if (Date.now() - startedAt > 10 * 60 * 1000) {
        setImageGenStatus(`任务仍在处理中，已停止自动查询。Task ID: ${taskId}`);
        setImageGenBusy(false);
        return;
      }

      setImageGenStatus(`任务处理中：${status}。Task ID: ${taskId}`);
      state.imageGen.pollTimer = setTimeout(poll, 5000);
    } catch (error) {
      stopImageGenerationPoll();
      setImageGenBusy(false);
      setImageGenStatus(error.message || String(error), true);
    }
  };
  state.imageGen.pollTimer = setTimeout(poll, 5000);
}

function showImageGenerationResult(url, options = {}) {
  state.imageGen.resultUrl = url;
  const image = el("image-gen-result-img");
  const empty = el("image-gen-empty");
  const urlInput = el("image-gen-result-url");
  if (image) {
    image.src = url;
    image.hidden = false;
  }
  if (empty) empty.hidden = true;
  if (urlInput) {
    urlInput.hidden = false;
    urlInput.value = url;
  }
  ["image-gen-zoom", "image-gen-download", "image-gen-copy-image", "image-gen-copy"].forEach((id) => {
    const button = el(id);
    if (button) button.disabled = false;
  });
  if (!options.skipHistory) {
    const modelKey = el("image-gen-model") ? el("image-gen-model").value : "";
    const model = IMAGE_MODELS[modelKey] || {};
    addImageGenHistory({
      resultUrl: url,
      taskId: state.imageGen.taskId,
      modelName: model.name || "图片生成",
      prompt: el("image-gen-prompt") ? el("image-gen-prompt").value.trim() : ""
    });
  }
}

function openImageGenerationModal() {
  const url = state.imageGen.resultUrl || (el("image-gen-result-url") && el("image-gen-result-url").value.trim());
  if (!url) {
    setImageGenStatus("还没有可以放大的图片结果。", true);
    return;
  }
  const modal = el("image-modal");
  const image = el("zoomed-preview");
  if (!modal || !image) return;
  image.src = url;
  modal.hidden = false;
  setImageModalZoom(1);
}

async function downloadImageGenerationResult() {
  const url = state.imageGen.resultUrl || (el("image-gen-result-url") && el("image-gen-result-url").value.trim());
  if (!url) {
    setImageGenStatus("还没有可下载的图片结果。", true);
    return;
  }
  setImageGenBusy(true);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
    const blob = await response.blob();
    downloadBlob(blob, `runninghub-image-${Date.now()}.${getFileExtension(new URL(url).pathname)}`);
    setImageGenStatus("结果图片已开始下载。");
  } catch (error) {
    setImageGenStatus(error.message || String(error), true);
  } finally {
    setImageGenBusy(false);
  }
}

async function copyImageGenerationResult() {
  const url = state.imageGen.resultUrl || (el("image-gen-result-url") && el("image-gen-result-url").value.trim());
  if (!url) {
    setImageGenStatus("还没有可复制的结果链接。", true);
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    setImageGenStatus("结果链接已复制。");
  } catch {
    const input = el("image-gen-result-url");
    if (input) {
      input.hidden = false;
      input.select();
      document.execCommand("copy");
    }
    setImageGenStatus("结果链接已复制。");
  }
}

async function copyImageGenerationImage() {
  const url = state.imageGen.resultUrl || (el("image-gen-result-url") && el("image-gen-result-url").value.trim());
  if (!url) {
    setImageGenStatus("还没有可复制的图片结果。", true);
    return;
  }
  if (!navigator.clipboard || !window.ClipboardItem) {
    setImageGenStatus("当前环境不支持直接复制图片，已尝试复制图片链接。", true);
    await copyImageGenerationResult();
    return;
  }

  setImageGenBusy(true);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`复制图片失败：HTTP ${response.status}`);
    const blob = await response.blob();
    const type = blob.type || guessMimeType(new URL(url).pathname);
    await navigator.clipboard.write([
      new ClipboardItem({
        [type]: blob
      })
    ]);
    setImageGenStatus("图片已复制。");
  } catch (error) {
    setImageGenStatus(error.message || String(error), true);
  } finally {
    setImageGenBusy(false);
  }
}

async function buildNodeInfoList(apiKey) {
  if (!state.inputNodes.length) {
    throw new Error("请先点击“获取应用参数”。");
  }

  const list = [];
  let imageIndex = 0;

  for (const node of state.inputNodes) {
    const key = getNodeKey(node);
    let fieldValue = "";

    if (isImageNode(node)) {
      const file = state.paramFiles[key];
      if (!file) throw new Error(`请为「${getNodeLabel(node)}」选择图片。`);
      imageIndex += 1;
      setStatus(`正在上传图片参数 ${imageIndex}：${getNodeLabel(node)}...`);
      const uploaded = await uploadImage(apiKey, file);
      fieldValue = uploaded.fileName;
      markParamUploaded(key);
    } else {
      const input = el(`param-value-${cssEscape(key)}`);
      fieldValue = input ? input.value.trim() : "";
      if (!fieldValue) {
        fieldValue = node.fieldValue || "";
      }
    }

    list.push({
      nodeId: String(node.nodeId || ""),
      nodeName: node.nodeName || "",
      fieldName: node.fieldName || "",
      fieldValue,
      fieldData: node.fieldData || "",
      description: node.description || "",
      descriptionEn: node.descriptionEn || ""
    });
  }

  return list;
}

async function runAiApp(apiKey, nodeInfoList) {
  const appConfig = readAppConfigFromForm();
  const body = {
    apiKey,
    webappId: appConfig.webappId,
    instanceType: getInstanceType(),
    nodeInfoList
  };

  const response = await fetch(API.run, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const json = await response.json();
  if (!response.ok || json.code !== 0) {
    throw new Error(json.msg || json.message || `任务提交失败：HTTP ${response.status}`);
  }
  if (!json.data || !json.data.taskId) {
    throw new Error("任务提交成功，但没有返回 taskId。");
  }
  return json.data;
}

async function queryTask(apiKey, taskId) {
  const response = await fetch(API.query, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ taskId })
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`查询失败：HTTP ${response.status}`);
  }
  return json;
}

async function runTask() {
  setBusy(true);
  try {
    saveSettings();
    const apiKey = getApiKey();
    const nodeInfoList = await buildNodeInfoList(apiKey);
    setStatus("参数已准备，正在发送请求到 RunningHub...");
    const task = await runAiApp(apiKey, nodeInfoList);
    state.taskId = String(task.taskId);
    el("task-id").value = state.taskId;
    setStatus(`任务已提交。\nTask ID: ${state.taskId}\n当前状态: ${task.taskStatus || "RUNNING"}\n正在等待处理...`);
    setAccountTaskRunning(true);
    refreshAccountStatus();
    startAutoPoll();
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    setBusy(false);
  }
}

function showResult(url) {
  state.resultUrl = url;
  el("result-url").value = url;
  el("preview").src = url;
  el("result").classList.add("visible");
}

function stopAutoPoll() {
  if (state.pollTimer) {
    clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }
}

function startAutoPoll() {
  stopAutoPoll();
  const startedAt = Date.now();
  const poll = async () => {
    try {
      const done = await queryCurrentTask({ silent: true });
      if (done) return;
      if (Date.now() - startedAt > 10 * 60 * 1000) {
        setStatus("任务仍在处理中。已停止自动查询，你可以稍后手动点击“查询结果”。");
        return;
      }
      state.pollTimer = setTimeout(poll, 5000);
    } catch (error) {
      setStatus(error.message || String(error), true);
    }
  };
  state.pollTimer = setTimeout(poll, 5000);
}

async function queryCurrentTask(options = {}) {
  const silent = !!options.silent;
  if (!silent) setBusy(true);
  try {
    saveSettings();
    const apiKey = getApiKey();
    const taskId = el("task-id").value.trim() || state.taskId;
    if (!taskId) throw new Error("没有可查询的 Task ID。");

    if (!silent) setStatus("正在查询任务结果...");
    const result = await queryTask(apiKey, taskId);
    const status = result.status || result.data || "UNKNOWN";

    if (status === "SUCCESS") {
      const first = Array.isArray(result.results) ? result.results[0] : null;
      if (!first || !first.url) throw new Error("任务成功，但没有返回结果图片。");
      showResult(first.url);
      addHistory({
        taskId,
        resultUrl: first.url,
        appName: el("app-name").value.trim() || el("app-badge").textContent,
        webappId: extractAppId(el("webapp-id").value)
      });
      stopAutoPoll();
      setStatus(`任务完成。\nTask ID: ${taskId}\n可以从预览区下载或打开结果。`);
      setAccountTaskRunning(false);
      refreshAccountStatus();
      const autoOpen = el("auto-open-result");
      if (autoOpen && autoOpen.checked) {
        await importResultToPhotoshop();
      }
      return true;
    }

    if (status === "FAILED") {
      stopAutoPoll();
      setAccountTaskRunning(false);
      throw new Error(result.errorMessage || "任务失败。");
    }

    setStatus(`任务还在处理中。\nTask ID: ${taskId}\n当前状态: ${status}\n费用以 RunningHub 实际扣费为准。`);
    return false;
  } catch (error) {
    setStatus(error.message || String(error), true);
    return true;
  } finally {
    if (!silent) setBusy(false);
  }
}

async function openResultInPhotoshop() {
  const url = state.resultUrl || el("result-url").value.trim();
  if (!url) {
    setStatus("还没有结果图片。", true);
    return;
  }

  if (!IS_UXP) {
    window.open(url, "_blank");
    setStatus("结果已在浏览器新标签页打开。");
    return;
  }

  setBusy(true);
  try {
    setStatus("正在下载结果图片并打开到 Photoshop...");
    const file = await downloadResultToTempFile(url);
    await photoshop.core.executeAsModal(async () => {
      await photoshop.app.open(file);
    }, { commandName: "Open RunningHub Result" });
    setStatus("结果图片已在 Photoshop 中打开。");
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    setBusy(false);
  }
}

async function downloadResultToTempFile(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载结果失败：HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();

  if (!storage || !storage.localFileSystem) {
    return new Blob([buffer], { type: guessMimeType(new URL(url).pathname) });
  }

  const tempFolder = await storage.localFileSystem.getTemporaryFolder();
  const ext = getFileExtension(new URL(url).pathname);
  const file = await tempFolder.createFile(`runninghub-result-${Date.now()}.${ext}`, {
    overwrite: true
  });
  await file.write(buffer, { format: storage.formats.binary });
  return file;
}

async function importResultToPhotoshop() {
  const url = state.resultUrl || el("result-url").value.trim();
  if (!url) {
    setStatus("还没有结果图片。", true);
    return;
  }

  if (!IS_UXP) {
    setBusy(true);
    try {
      setStatus("正在下载结果图片...");
      const blob = await downloadResultToTempFile(url);
      downloadBlob(blob, `runninghub-result-${Date.now()}.${getFileExtension(new URL(url).pathname)}`);
      setStatus("结果图片已开始下载。");
    } catch (error) {
      setStatus(error.message || String(error), true);
    } finally {
      setBusy(false);
    }
    return;
  }

  setBusy(true);
  try {
    setStatus("正在导入结果到 Photoshop 当前文档...");
    const file = await downloadResultToTempFile(url);

    const hasDocument = photoshop && photoshop.app && photoshop.app.documents && photoshop.app.documents.length > 0;
    if (!hasDocument) {
      await photoshop.core.executeAsModal(async () => {
        await photoshop.app.open(file);
      }, { commandName: "Open RunningHub Result" });
      setStatus("当前没有打开文档，结果已作为新文档打开。");
      return;
    }

    const token = storage.localFileSystem.createSessionToken(file);
    const action = photoshop.action;
    await photoshop.core.executeAsModal(async () => {
      await action.batchPlay(
        [
          {
            _obj: "placeEvent",
            null: {
              _path: token,
              _kind: "local"
            },
            freeTransformCenterState: {
              _enum: "quadCenterState",
              _value: "QCSAverage"
            },
            _options: {
              dialogOptions: "dontDisplay"
            }
          }
        ],
        {}
      );
    }, { commandName: "Import RunningHub Result" });

    setStatus("结果已导入当前 Photoshop 文档。");
  } catch (error) {
    setStatus(`导入为图层失败，尝试打开为新文档。\n${error.message || String(error)}`, true);
    try {
      await openResultInPhotoshop();
    } catch {}
  } finally {
    setBusy(false);
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName || "runninghub-result.png";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function openResultUrl() {
  const url = state.resultUrl || el("result-url").value.trim();
  if (!url) {
    setStatus("还没有结果链接。", true);
    return;
  }
  if (shell && shell.openExternal) {
    await shell.openExternal(url);
  } else {
    window.open(url, "_blank");
  }
}

async function copyResultUrl() {
  const url = state.resultUrl || el("result-url").value.trim();
  if (!url) {
    setStatus("还没有结果链接。", true);
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    setStatus("结果链接已复制。");
  } catch {
    el("result-url").select();
    document.execCommand("copy");
    setStatus("结果链接已复制。");
  }
}

function bindImageGeneratorInputs() {
  const box = document.querySelector(".generator-box");
  if (!box || box.dataset.dropBound === "true") return;
  box.dataset.dropBound = "true";
  box.addEventListener("dragenter", (event) => {
    event.preventDefault();
    box.classList.add("is-dragging");
  });
  box.addEventListener("dragover", (event) => {
    event.preventDefault();
    box.classList.add("is-dragging");
  });
  box.addEventListener("dragleave", () => {
    box.classList.remove("is-dragging");
  });
  box.addEventListener("drop", async (event) => {
    event.preventDefault();
    box.classList.remove("is-dragging");
    const files = getImageFilesFromList(event.dataTransfer && event.dataTransfer.files);
    if (!files.length) {
      setImageGenStatus("没有找到可用的图片文件。", true);
      return;
    }
    try {
      await addImageGenReferences(files);
    } catch (error) {
      setImageGenStatus(error.message || String(error), true);
    }
  });
}

function render(root) {
  forceVisibleLayout();
  readSettings();
  root.addEventListener("click", handleRootClick);
  document.addEventListener("paste", handlePaste);
  document.addEventListener("keydown", handleKeydown);
  const settingsBackdrop = document.querySelector("#settings-modal .modal-backdrop");
  if (settingsBackdrop) settingsBackdrop.addEventListener("click", closeSettings);
  const imageBackdrop = document.querySelector("#image-modal .modal-backdrop");
  if (imageBackdrop) imageBackdrop.addEventListener("click", closeImageModal);
  bindDirectButtons(root);
  el("api-key").addEventListener("change", () => {
    saveSettings();
    startAccountPolling({ immediate: true });
  });
  const instanceInput = el("instance-type");
  if (instanceInput) instanceInput.addEventListener("change", saveSettings);
  const imagePrompt = el("image-gen-prompt");
  if (imagePrompt) imagePrompt.addEventListener("input", renderPromptReferenceChips);
  const imageGenResult = el("image-gen-result-img");
  if (imageGenResult) imageGenResult.addEventListener("click", openImageGenerationModal);
  const gallerySearch = el("image-gallery-search");
  if (gallerySearch) gallerySearch.addEventListener("input", renderImageGallery);
  const autoOpen = el("auto-open-result");
  if (autoOpen) autoOpen.addEventListener("change", saveSettings);
  bindImageGeneratorInputs();
  bindImageModalZoom();
}

function boot() {
  const root = document.getElementById("root");
  if (!root) return;
  if (root.dataset.bound === "true") return;
  root.dataset.bound = "true";

  try {
    render(root);
    setStatus("网站版已启动。请粘贴 AppID，并点击“获取应用参数”。");
  } catch (error) {
    const status = document.getElementById("status");
    if (status) {
      status.textContent = error.message || String(error);
      status.classList.add("error");
    }
    console.error(error);
  }
}

class PanelController {
  constructor() {
    this.root = null;
    this.create = this.create.bind(this);
    this.show = this.show.bind(this);
    this.hide = this.hide.bind(this);
    this.destroy = this.destroy.bind(this);
  }

  create() {
    this.root = document.getElementById("root");
    if (!this.root) return null;
    boot();
    return this.root;
  }

  show() {
    if (!this.root) this.create();
  }

  hide() {}

  destroy() {
    this.root = null;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

if (entrypoints && entrypoints.setup) {
  try {
    entrypoints.setup({
      panels: {
        "runninghub-panel": new PanelController()
      }
    });
  } catch (error) {
    console.error("E_WinAI entrypoints setup failed:", error);
  }
}
