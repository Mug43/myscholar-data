// ==UserScript==
// @name         MyScholar 学术分级助手 (自建多数据集远程同步版)
// @namespace    https://local.myscholar.pro/
// @version      2.2.0
// @description  仿 easyScholar 多数据集开关面板 + 远程JSON定时同步 + 分库存储优化 + 3种样式 + Excel粘贴导入 + OpenAlex实时兜底 + 调试模式
// @author       You
// @match        https://scholar.google.com/*
// @match        https://scholar.google.com.hk/*
// @match        https://scholar.google.com.tw/*
// @match        https://scholar.google.co.jp/*
// @match        https://*.cnki.net/*
// @match        https://pubmed.ncbi.nlm.nih.gov/*
// @match        https://www.webofscience.com/*
// @match        https://ieeexplore.ieee.org/*
// @match        https://www.sciencedirect.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      api.openalex.org
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // ===================== 1. 默认数据集框架、配置与分库存储 =====================
  const STORAGE_KEYS = {
    LEGACY_DATASETS: "ms2_datasets_v1",   // v2.1 旧版单 key（用于平滑迁移）
    DS_META: "ms2_ds_meta_v2",            // 分库存储：数据集元信息表
    DS_ITEM_PREFIX: "ms2_ds_items_v2_",   // 分库存储：单个数据集 items 前缀
    CONFIG: "ms2_config_v2",
    OA_CACHE: "ms2_oa_cache_v1"
  };

  const DEFAULT_DATASETS = {
    cas_up:  { name: "SCI (中科院升级版)", group: "core", color: "#d93025", items: { "nature": "中科院1区", "science": "中科院1区", "cell": "中科院1区", "nature communications": "中科院1区", "nat commun": "中科院1区", "ieee transactions on pattern analysis and machine intelligence": "中科院1区" } },
    cas_top: { name: "SCI中科院TOP期刊",  group: "core", color: "#c2185b", items: { "nature": "TOP", "science": "TOP", "cell": "TOP", "nature communications": "TOP", "nat commun": "TOP" } },
    cas_warn:{ name: "SCI (中科院预警)",   group: "core", color: "#1f1f1f", items: {} },
    sci_if:  { name: "SCI影响因子",        group: "core", color: "#188038", items: { "nature": "IF:50.5", "science": "IF:44.7", "cell": "IF:45.5", "nature communications": "IF:14.7", "nat commun": "IF:14.7" } },
    jcr:     { name: "SCI (Clarivate-JCR)",group: "core", color: "#1a73e8", items: { "nature": "JCR Q1", "science": "JCR Q1", "cell": "JCR Q1" } },
    ei:      { name: "EI",                 group: "core", color: "#00838f", items: { "ieee transactions on pattern analysis and machine intelligence": "EI" } },
    ccf:     { name: "中国计算机学会(CCF)",group: "core", color: "#e37400", items: { "advances in neural information processing systems": "CCF-A", "ieee transactions on pattern analysis and machine intelligence": "CCF-A", "proceedings of the ieee/cvf conference on computer vision and pattern recognition": "CCF-A", "proceedings of the ieee conference on computer vision and pattern recognition": "CCF-A", "international conference on machine learning": "CCF-A", "计算机学报": "CCF中文-A", "软件学报": "CCF中文-A" } },
    pku:     { name: "北大中文核心",       group: "core", color: "#b71c1c", items: { "计算机学报": "北大核心", "软件学报": "北大核心", "经济研究": "北大核心", "管理世界": "北大核心" } },
    cssci:   { name: "CSSCI南大核心",      group: "core", color: "#ad1457", items: { "经济研究": "CSSCI", "管理世界": "CSSCI", "中国社会科学": "CSSCI" } },
    cscd:    { name: "中国科学引文(CSCD)", group: "core", color: "#2e7d32", items: { "计算机学报": "CSCD", "软件学报": "CSCD" } },
    cstpcd:  { name: "中国科技核心",       group: "core", color: "#0277bd", items: {} },

    ssci:    { name: "SSCI (Clarivate)",   group: "more", color: "#3949ab", items: { "academy of management journal": "SSCI Q1" } },
    ahci:    { name: "A&HCI检索",          group: "more", color: "#5e35b1", items: {} },
    esci:    { name: "ESCI (Clarivate)",   group: "more", color: "#546e7a", items: {} },
    ft50:    { name: "FT50",               group: "more", color: "#00695c", items: { "academy of management journal": "FT50", "management science": "FT50", "american economic review": "FT50", "journal of finance": "FT50" } },
    utd24:   { name: "UTD24",              group: "more", color: "#00796b", items: { "academy of management journal": "UTD24", "management science": "UTD24", "journal of finance": "UTD24" } },
    fms:     { name: "FMS",                group: "more", color: "#00897b", items: { "管理世界": "FMS-T1", "management science": "FMS-A" } },
    abs:     { name: "AJG (原ABS)",        group: "more", color: "#6d4c41", items: { "academy of management journal": "ABS 4*", "management science": "ABS 4*" } },
    sjr:     { name: "SCImago (SJR)",      group: "more", color: "#455a64", items: {} },

    custom_school: { name: "我的高校目录(示例)", group: "custom", color: "#7b1fa2", items: {} }
  };

  const DEFAULT_CONFIG = {
    enabled: {
      cas_up: true, cas_top: true, cas_warn: true, sci_if: true, jcr: true,
      ei: true, ccf: true, pku: true, cssci: true, cscd: true, cstpcd: true,
      sjr: true, ft50: true, utd24: true, fms: true, abs: true, custom_school: true
    },
    style: "soft",
    enableOpenAlex: true,
    openAlexKey: "",
    debugMode: false,
    // v2.2 远程同步配置
    syncUrl: "https://raw.githubusercontent.com/Mug43/myscholar-data/main/my_journals.json",
    syncToken: "",
    syncHours: 168,
    lastSyncTime: 0,
    remoteVersion: ""
  };

  const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

  function safeDeleteValue(key) {
    if (typeof GM_deleteValue === "function") {
      GM_deleteValue(key);
    } else {
      GM_setValue(key, null);
    }
  }

  /**
   * 按数据集分 key 加载：避免 3 万+ 条目在单 key 下反复全量序列化导致卡顿。
   * 首次升级自动从 v2.1 的 ms2_datasets_v1 迁移。
   */
  function loadDatasets() {
    const metaMap = GM_getValue(STORAGE_KEYS.DS_META, null);
    if (metaMap && typeof metaMap === "object") {
      const loaded = {};
      for (const [id, meta] of Object.entries(metaMap)) {
        const items = GM_getValue(STORAGE_KEYS.DS_ITEM_PREFIX + id, {}) || {};
        loaded[id] = Object.assign({}, meta, { items });
      }
      return loaded;
    }

    // 兼容迁移 v2.1 单 key 存储
    const legacy = GM_getValue(STORAGE_KEYS.LEGACY_DATASETS, null);
    const initial = legacy && typeof legacy === "object" ? legacy : deepClone(DEFAULT_DATASETS);
    saveAllDatasets(initial);
    return initial;
  }

  function saveDatasetMeta(dsMap) {
    const metaMap = {};
    for (const [id, ds] of Object.entries(dsMap)) {
      metaMap[id] = {
        name: ds.name,
        group: ds.group || "custom",
        color: ds.color || "#1a73e8",
        remote: Boolean(ds.remote)
      };
    }
    GM_setValue(STORAGE_KEYS.DS_META, metaMap);
  }

  function saveSingleDataset(id) {
    if (!datasets[id]) return;
    saveDatasetMeta(datasets);
    GM_setValue(STORAGE_KEYS.DS_ITEM_PREFIX + id, datasets[id].items || {});
  }

  function deleteSingleDatasetStorage(id) {
    safeDeleteValue(STORAGE_KEYS.DS_ITEM_PREFIX + id);
  }

  function saveAllDatasets(dsMap = datasets) {
    saveDatasetMeta(dsMap);
    for (const [id, ds] of Object.entries(dsMap)) {
      GM_setValue(STORAGE_KEYS.DS_ITEM_PREFIX + id, ds.items || {});
    }
  }

  let datasets = loadDatasets();
  const savedCfg = GM_getValue(STORAGE_KEYS.CONFIG, null) || {};
  let config = Object.assign(deepClone(DEFAULT_CONFIG), savedCfg);
  config.enabled = Object.assign(deepClone(DEFAULT_CONFIG.enabled), savedCfg.enabled || {});
  let oaCache = GM_getValue(STORAGE_KEYS.OA_CACHE, null) || {};
  let syncStatusNote = "";

  function saveConfig() { GM_setValue(STORAGE_KEYS.CONFIG, config); }

  // ===================== 2. 归一化与按需/增量本地索引 =====================
  function normalize(str) {
    if (!str) return "";
    return str
      .replace(/\u00a0/g, " ")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/^the\s+/, "")
      .replace(/[^a-z0-9\u4e00-\u9fa5\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // 惰性索引：仅在数据集启用且首次查询，或该数据集更新后才构建其 Map，大幅降低启动耗时
  let normalizedIndex = {};

  function buildIndexForDataset(dsId) {
    const ds = datasets[dsId];
    if (!ds) {
      delete normalizedIndex[dsId];
      return null;
    }
    const map = new Map();
    const items = ds.items || {};
    for (const [k, v] of Object.entries(items)) {
      const nk = normalize(k);
      if (nk) map.set(nk, v);
    }
    normalizedIndex[dsId] = map;
    return map;
  }

  function invalidateIndex(dsIds) {
    if (!dsIds) {
      normalizedIndex = {};
      return;
    }
    for (const id of dsIds) {
      delete normalizedIndex[id];
    }
  }

  function rebuildIndex() {
    normalizedIndex = {};
    for (const dsId of Object.keys(datasets)) {
      if (config.enabled[dsId]) {
        buildIndexForDataset(dsId);
      }
    }
  }

  function queryLocalTags(rawVenue) {
    if (!rawVenue) return [];
    const trimmed = rawVenue.trim();
    const isTruncated = trimmed.endsWith("…") || trimmed.endsWith("...");
    const clean = normalize(trimmed.replace(/(…|\.\.\.)$/, ""));
    if (!clean) return [];

    const matchedTags = [];
    for (const [dsId, ds] of Object.entries(datasets)) {
      if (!config.enabled[dsId]) continue;
      let map = normalizedIndex[dsId];
      if (!map) {
        map = buildIndexForDataset(dsId);
      }
      if (!map || map.size === 0) continue;

      let val = map.get(clean);
      if (!val && isTruncated && clean.length >= 8) {
        for (const [nk, label] of map.entries()) {
          if (nk.startsWith(clean)) {
            val = label;
            break;
          }
        }
      }
      if (val) {
        matchedTags.push({
          dsName: ds.name,
          text: val,
          color: ds.color || "#1a73e8",
          isWarn: dsId === "cas_warn"
        });
      }
    }
    return matchedTags;
  }

  // ===================== 2.5 远程 JSON 定时同步 =====================
  let syncInflight = null;

  function formatSyncTime(ts) {
    if (!ts) return "从未同步";
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function syncRemote(force = false) {
    const url = (config.syncUrl || "").trim();
    if (!url) {
      if (force) {
        console.warn("[MyScholar] 未配置同步地址，已跳过同步。");
        syncStatusNote = "未配置同步地址";
        if (panelHost && panelHost.style.display !== "none") renderPanelUI();
      }
      return Promise.resolve({ ok: false, skipped: true, reason: "no_url" });
    }

    const intervalMs = Math.max(1, Number(config.syncHours) || 168) * 3600 * 1000;
    if (!force && config.lastSyncTime && (Date.now() - config.lastSyncTime) < intervalMs) {
      return Promise.resolve({ ok: true, skipped: true, reason: "within_interval" });
    }

    if (syncInflight) return syncInflight;

    const headers = { Accept: "application/json" };
    if (config.syncToken && config.syncToken.trim()) {
      headers.Authorization = `token ${config.syncToken.trim()}`;
    }

    syncInflight = new Promise((resolve) => {
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          headers,
          timeout: 15000,
          onload(res) {
            syncInflight = null;
            if (res.status < 200 || res.status >= 300) {
              console.warn(`[MyScholar] 远程同步失败 (HTTP ${res.status}): ${url}`);
              syncStatusNote = `同步失败 (HTTP ${res.status})`;
              if (panelHost && panelHost.style.display !== "none") renderPanelUI();
              resolve({ ok: false, status: res.status });
              return;
            }
            try {
              const payload = JSON.parse(res.responseText);
              if (!payload || typeof payload !== "object" || !payload.datasets || typeof payload.datasets !== "object") {
                throw new Error("远程 JSON 缺少 datasets 对象");
              }

              const remoteVer = String(payload.version || "");
              const now = Date.now();

              // 远程版本与本地一致时仅更新时间戳（非强制模式）
              if (!force && remoteVer && remoteVer === config.remoteVersion) {
                config.lastSyncTime = now;
                saveConfig();
                syncStatusNote = "已是最新版本";
                if (panelHost && panelHost.style.display !== "none") renderPanelUI();
                resolve({ ok: true, unchanged: true, version: remoteVer });
                return;
              }

              const remoteIds = new Set(Object.keys(payload.datasets));
              const changedIds = [];

              // 1) 删除远程已移除且本地带有 remote: true 标记的数据集；本地自定义库不受影响
              for (const [id, ds] of Object.entries(datasets)) {
                if (ds && ds.remote === true && !remoteIds.has(id)) {
                  delete datasets[id];
                  deleteSingleDatasetStorage(id);
                  changedIds.push(id);
                }
              }

              // 2) 按 id 整体覆盖远程数据集并打上 remote: true 标记
              for (const [id, rds] of Object.entries(payload.datasets)) {
                if (!rds || typeof rds !== "object") continue;
                datasets[id] = {
                  name: rds.name || id,
                  group: rds.group || "more",
                  color: rds.color || "#1a73e8",
                  items: (rds.items && typeof rds.items === "object") ? rds.items : {},
                  remote: true
                };
                if (typeof config.enabled[id] === "undefined") {
                  config.enabled[id] = datasets[id].group === "core" || datasets[id].group === "custom";
                }
                GM_setValue(STORAGE_KEYS.DS_ITEM_PREFIX + id, datasets[id].items);
                changedIds.push(id);
              }

              saveDatasetMeta(datasets);
              config.lastSyncTime = now;
              config.remoteVersion = remoteVer;
              saveConfig();

              // 仅对变更的数据集失效索引并按需重建，然后刷新页面徽章
              invalidateIndex(changedIds);
              syncStatusNote = `同步成功 (${remoteVer || "无版本号"})`;
              if (panelHost && panelHost.style.display !== "none") renderPanelUI();
              refreshAllBadges();
              resolve({ ok: true, version: remoteVer, updated: changedIds.length });
            } catch (err) {
              console.warn("[MyScholar] 远程同步数据解析失败:", err);
              syncStatusNote = "同步数据解析失败";
              if (panelHost && panelHost.style.display !== "none") renderPanelUI();
              resolve({ ok: false, error: err.message });
            }
          },
          onerror(err) {
            syncInflight = null;
            console.warn("[MyScholar] 远程同步网络异常:", err);
            syncStatusNote = "同步网络异常";
            if (panelHost && panelHost.style.display !== "none") renderPanelUI();
            resolve({ ok: false, error: "network_error" });
          },
          ontimeout() {
            syncInflight = null;
            console.warn("[MyScholar] 远程同步超时:", url);
            syncStatusNote = "同步超时";
            if (panelHost && panelHost.style.display !== "none") renderPanelUI();
            resolve({ ok: false, error: "timeout" });
          }
        });
      } catch (e) {
        syncInflight = null;
        console.warn("[MyScholar] 远程同步调用失败:", e);
        resolve({ ok: false, error: e.message });
      }
    });

    return syncInflight;
  }

  function promptSyncSettings() {
    const newUrl = prompt(
      "请输入远程 JSON 同步地址（如 GitHub raw URL，留空则关闭远程同步）：",
      config.syncUrl || ""
    );
    if (newUrl === null) return;
    config.syncUrl = newUrl.trim();

    const newToken = prompt(
      "请输入 GitHub 只读 Token（公开仓库请留空，私有仓库填写 Fine-grained PAT）：",
      config.syncToken || ""
    );
    if (newToken !== null) {
      config.syncToken = newToken.trim();
    }

    const newHours = prompt(
      "自动同步间隔（小时，默认 168 即 7 天）：",
      String(config.syncHours || 168)
    );
    if (newHours !== null) {
      const parsed = Number(newHours.trim());
      if (!Number.isNaN(parsed) && parsed > 0) {
        config.syncHours = parsed;
      }
    }

    saveConfig();
    if (panelHost && panelHost.style.display !== "none") renderPanelUI();
    if (config.syncUrl) {
      syncRemote(true);
    }
  }

  // ===================== 3. OpenAlex 实时兜底（带本地缓存+限速队列） =====================
  const oaQueue = [];
  let oaBusy = false;
  const oaInflight = new Map();

  function queryOpenAlex(rawVenue) {
    if (!config.enableOpenAlex) return Promise.resolve([]);
    const trimmed = rawVenue.trim();
    const isTruncated = trimmed.endsWith("…") || trimmed.endsWith("...");
    const clean = normalize(trimmed.replace(/(…|\.\.\.)$/, ""));
    // 跳过中文、过短文本或 arXiv 预印本
    if (!clean || clean.length < 3 || /[\u4e00-\u9fa5]/.test(clean) || clean.startsWith("arxiv")) {
      return Promise.resolve([]);
    }
    if (Object.prototype.hasOwnProperty.call(oaCache, clean)) {
      return Promise.resolve(oaCache[clean] || []);
    }
    if (oaInflight.has(clean)) return oaInflight.get(clean);

    const p = new Promise((resolve) => {
      oaQueue.push({ rawVenue, clean, isTruncated, resolve });
      runOaQueue();
    });
    oaInflight.set(clean, p);
    return p;
  }

  function runOaQueue() {
    if (oaBusy || oaQueue.length === 0) return;
    oaBusy = true;
    const { rawVenue, clean, isTruncated, resolve } = oaQueue.shift();
    const q = rawVenue.replace(/(…|\.\.\.)$/, "").trim();
    let url = `https://api.openalex.org/sources?search=${encodeURIComponent(q)}&per-page=3&select=display_name,abbreviated_title,alternate_titles,summary_stats,is_oa`;
    if (config.openAlexKey) url += `&api_key=${encodeURIComponent(config.openAlexKey)}`;

    GM_xmlhttpRequest({
      method: "GET",
      url,
      timeout: 8000,
      onload(res) {
        let tags = [];
        try {
          if (res.status === 200) {
            const results = (JSON.parse(res.responseText).results) || [];
            const hit = results.find((src) => {
              const names = [src.display_name, src.abbreviated_title, ...(src.alternate_titles || [])]
                .filter(Boolean).map(normalize);
              return names.some((n) => n === clean || (isTruncated && clean.length >= 8 && n.startsWith(clean)));
            });
            if (hit && hit.summary_stats) {
              const c2 = hit.summary_stats["2yr_mean_citedness"];
              const h = hit.summary_stats["h_index"];
              if (typeof c2 === "number" && c2 > 0) {
                tags.push({ dsName: "OpenAlex", text: `近似IF ${c2.toFixed(1)}`, color: "#455a64" });
              }
              if (typeof h === "number" && h > 0) {
                tags.push({ dsName: "OpenAlex", text: `H指数:${h}`, color: "#607d8b" });
              }
              if (hit.is_oa) {
                tags.push({ dsName: "OpenAlex", text: "开源OA", color: "#7b1fa2" });
              }
            }
            oaCache[clean] = tags;
            GM_setValue(STORAGE_KEYS.OA_CACHE, oaCache);
          }
        } catch (e) {
          console.warn("[MyScholar] OpenAlex 解析失败:", e);
        }
        oaInflight.delete(clean);
        resolve(tags);
        setTimeout(() => { oaBusy = false; runOaQueue(); }, 260);
      },
      onerror() { oaInflight.delete(clean); resolve([]); setTimeout(() => { oaBusy = false; runOaQueue(); }, 350); },
      ontimeout() { oaInflight.delete(clean); resolve([]); setTimeout(() => { oaBusy = false; runOaQueue(); }, 350); }
    });
  }

  // ===================== 4. 样式（兼容所有浏览器） =====================
  GM_addStyle(`
    .ms2-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin: 4px 0 3px 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .ms2-tag {
      display: inline-flex;
      align-items: center;
      font-size: 11px;
      font-weight: 600;
      line-height: 1.45;
      padding: 1px 7px;
      user-select: none;
    }
    .ms2-style-classic .ms2-tag {
      background-color: var(--ms-c);
      color: #ffffff;
      border-radius: 3px;
    }
    .ms2-style-soft .ms2-tag {
      background-color: #f0f4fa;
      background-color: color-mix(in srgb, var(--ms-c) 12%, #ffffff);
      color: var(--ms-c);
      border: 1px solid var(--ms-c);
      border-color: color-mix(in srgb, var(--ms-c) 38%, #ffffff);
      border-radius: 12px;
    }
    .ms2-style-block .ms2-tag {
      background-color: #f8f9fa;
      background-color: color-mix(in srgb, var(--ms-c) 9%, #f8f9fa);
      color: #202124;
      border: 1px solid #e0e3e7;
      border-left: 3px solid var(--ms-c);
      border-radius: 3px;
    }
    .ms2-style-pastel .ms2-tag {
      background-color: color-mix(in srgb, var(--ms-c) 26%, #ffffff);
      color: #111111;
      border: none;
      border-radius: 14px;
      font-size: 12px;
      font-weight: 500;
      padding: 2px 10px;
    }
    .ms2-tag.ms2-warn {
      background-color: #111 !important;
      color: #ff4d4f !important;
      border: 1px solid #ff4d4f !important;
    }
    .ms2-tag.ms2-debug {
      background-color: #f1f3f4 !important;
      color: #5f6368 !important;
      border: 1px dashed #bdc1c6 !important;
      font-weight: 400;
    }
    #ms2-float-btn {
      position: fixed;
      right: 18px;
      bottom: 24px;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: linear-gradient(135deg, #2b85e4, #5cadff);
      color: #fff;
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(43, 133, 228, 0.4);
      z-index: 999990;
      user-select: none;
    }
    #ms2-float-btn:hover { transform: scale(1.08); }
  `);

  // ===================== 5. 渲染引擎 =====================
  function drawBadges(anchorEl, tags, venue, pos) {
    if (!anchorEl || !anchorEl.isConnected) return;
    const next = anchorEl.nextElementSibling;
    if (next && next.classList.contains("ms2-badges")) next.remove();

    const finalTags = [...tags];
    if (finalTags.length === 0 && config.debugMode) {
      finalTags.push({ dsName: "调试", text: `🔍 识别为: ${venue} (未收录)`, color: "#5f6368", isDebug: true });
    }
    if (finalTags.length === 0) return;

    const wrap = document.createElement("div");
    wrap.className = `ms2-badges ms2-style-${config.style || "soft"}`;
    finalTags.forEach((t) => {
      const span = document.createElement("span");
      span.className = `ms2-tag ${t.isWarn ? "ms2-warn" : ""} ${t.isDebug ? "ms2-debug" : ""}`;
      span.style.setProperty("--ms-c", t.color);
      span.textContent = t.text;
      span.title = `数据集：${t.dsName}\n识别来源：${venue}`;
      wrap.appendChild(span);
    });
    anchorEl.insertAdjacentElement(pos, wrap);
  }

  async function renderForAnchor(anchorEl, venue, pos = "afterend") {
    if (!anchorEl || !venue) return;
    anchorEl.dataset.ms2Venue = venue;
    anchorEl.dataset.ms2Pos = pos;

    // 1. 先秒出本地库命中的标签
    const localTags = queryLocalTags(venue);
    if (localTags.length > 0) {
      drawBadges(anchorEl, localTags, venue, pos);
    }

    // 2. 若开启 OpenAlex：本地未命中时全量兜底；已命中但缺少影响因子/均引指标时补充近似IF
    const hasImpactMetric = localTags.some((t) => /IF|均引/i.test(t.text));
    if (config.enableOpenAlex && (localTags.length === 0 || !hasImpactMetric)) {
      const oaTags = await queryOpenAlex(venue);
      if (anchorEl.dataset.ms2Venue === venue) {
        const extra = localTags.length === 0
          ? oaTags
          : oaTags.filter((t) => t.text.startsWith("近似IF"));
        drawBadges(anchorEl, [...localTags, ...extra], venue, pos);
      }
    } else if (localTags.length === 0) {
      drawBadges(anchorEl, [], venue, pos);
    }
  }

  function refreshAllBadges() {
    document.querySelectorAll("[data-ms2-venue]").forEach((el) => {
      renderForAnchor(el, el.dataset.ms2Venue, el.dataset.ms2Pos || "afterend");
    });
  }

  // ===================== 6. 增强版多站点适配器 =====================
  const ADAPTERS = [
    {
      test: () => location.hostname.startsWith("scholar.google."),
      run() {
        document.querySelectorAll(".gs_ri").forEach((item) => {
          const titleEl = item.querySelector(".gs_rt");
          const metaEl = item.querySelector(".gs_a");
          if (!titleEl || !metaEl || titleEl.dataset.ms2Venue) return;

          const text = (metaEl.textContent || "").replace(/\u00a0/g, " ");
          const parts = text.split(/\s[-–—]\s/);
          if (parts.length < 2) return;
          const rawPart = parts.length >= 3 ? parts.slice(1, -1).join(" - ") : parts[1];
          const venue = rawPart.replace(/,?\s*\b(19|20)\d{2}\b.*$/, "").trim();
          if (venue) renderForAnchor(titleEl, venue, "afterend");
        });

        document.querySelectorAll("tr.gsc_a_tr").forEach((row) => {
          const titleEl = row.querySelector("a.gsc_a_at");
          const grays = row.querySelectorAll(".gsc_a_t .gs_gray");
          if (!titleEl || grays.length < 2 || titleEl.dataset.ms2Venue) return;
          const raw = (grays[1].textContent || "").trim();
          const venue = raw.replace(/\s+\d+.*$/, "").replace(/,\s*\d{4}.*$/, "").trim();
          if (venue) renderForAnchor(titleEl, venue, "afterend");
        });
      }
    },
    {
      test: () => location.hostname.endsWith("cnki.net"),
      run() {
        document.querySelectorAll("table.result-table-list tbody tr").forEach((row) => {
          const sourceEl = row.querySelector("td.source a") || row.querySelector("td.source");
          const nameLink = row.querySelector("td.name a.fz14") || row.querySelector("td.name a");
          if (!sourceEl || !nameLink || nameLink.dataset.ms2Venue) return;
          const venue = (sourceEl.textContent || "")
            .split(/[\r\n]/)[0]
            .replace(/(网络首发|优先出版|录用定稿|增强出版).*$/, "")
            .trim();
          if (venue) renderForAnchor(nameLink, venue, "afterend");
        });
      }
    },
    {
      test: () => location.hostname === "pubmed.ncbi.nlm.nih.gov",
      run() {
        document.querySelectorAll(".docsum-content").forEach((item) => {
          const titleEl = item.querySelector(".docsum-title");
          const citEl = item.querySelector(".docsum-journal-citation.short-journal-citation") || item.querySelector(".docsum-journal-citation");
          if (!titleEl || !citEl || titleEl.dataset.ms2Venue) return;
          const venue = (citEl.textContent || "").split(".")[0].trim();
          if (venue) renderForAnchor(titleEl, venue, "afterend");
        });
        const jBtn = document.querySelector("#full-view-journal-trigger");
        const hTitle = document.querySelector(".heading-title");
        if (jBtn && hTitle && !hTitle.dataset.ms2Venue) {
          const venue = (jBtn.textContent || "").trim();
          if (venue) renderForAnchor(hTitle, venue, "afterend");
        }
      }
    },
    {
      test: () => location.hostname.includes("webofscience.com"),
      run() {
        document.querySelectorAll("app-record").forEach((rec) => {
          const titleEl = rec.querySelector("a.title");
          const srcEl = rec.querySelector('[data-ta="summary-source-title-link"], .source-title');
          if (!titleEl || !srcEl || titleEl.dataset.ms2Venue) return;
          const venue = (srcEl.textContent || "").trim();
          if (venue) renderForAnchor(titleEl, venue, "afterend");
        });
      }
    },
    {
      test: () => location.hostname.includes("ieeexplore.ieee.org"),
      run() {
        document.querySelectorAll("xpl-results-item").forEach((item) => {
          const titleEl = item.querySelector("h3, h2");
          const srcEl = item.querySelector('.description a[href*="/xpl/RecentIssue"], .description a[href*="/xpl/conhome"]');
          if (!titleEl || !srcEl || titleEl.dataset.ms2Venue) return;
          const venue = (srcEl.textContent || "").trim();
          if (venue) renderForAnchor(titleEl, venue, "afterend");
        });
      }
    },
    {
      test: () => location.hostname.includes("sciencedirect.com"),
      run() {
        document.querySelectorAll(".ResultItem").forEach((item) => {
          const titleEl = item.querySelector("h2");
          const srcEl = item.querySelector(".subtype-srctitle-link, .srctitle-prospects");
          if (!titleEl || !srcEl || titleEl.dataset.ms2Venue) return;
          const venue = (srcEl.textContent || "").trim();
          if (venue) renderForAnchor(titleEl, venue, "afterend");
        });
      }
    }
  ];

  function scanPage() {
    const adapter = ADAPTERS.find((a) => a.test());
    if (adapter) adapter.run();
  }

  // ===================== 7. 控制面板 =====================
  let panelHost = null;

  function openPanel() {
    if (panelHost) {
      panelHost.style.display = "block";
      renderPanelUI();
      return;
    }
    panelHost = document.createElement("div");
    panelHost.style.cssText = "position:fixed;inset:0;z-index:999999;";
    const shadow = panelHost.attachShadow({ mode: "open" });

    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
        .mask { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; }
        .modal {
          width: 660px; max-width: 94vw; max-height: 88vh; overflow-y: auto;
          background: linear-gradient(160deg, #eef6ff 0%, #f9fbff 45%, #fff6eb 100%);
          border-radius: 12px; box-shadow: 0 12px 36px rgba(0,0,0,0.28);
          padding: 16px 20px 18px; color: #333;
        }
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .logo { font-size: 19px; font-weight: 800; color: #1976d2; display: flex; align-items: center; gap: 8px; }
        .ver { background: #ff8a80; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 6px; font-weight: 600; }
        .close-btn { border: none; background: #fff; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
        .section-title { display: flex; align-items: center; gap: 10px; margin: 12px 0 7px; font-size: 12px; font-weight: 700; color: #444; }
        .section-title::before, .section-title::after { content: ""; flex: 1; border-top: 1px dashed #bbb; }
        .chip-grid { display: flex; flex-wrap: wrap; gap: 6px; }
        .chip {
          border: 1px solid #d9dce0; background: #fff; color: #555;
          padding: 4px 9px; border-radius: 5px; font-size: 12px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 4px;
        }
        .chip.active { background: #2196f3; color: #fff; border-color: #2196f3; font-weight: 600; }
        .chip .cnt { font-size: 10px; opacity: 0.78; }
        .footer-bar { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 6px; }
        .action-btn { background: #ffe0b2; color: #4e342e; border: none; border-radius: 6px; padding: 6px 10px; font-size: 12px; font-weight: 600; cursor: pointer; }
        .action-btn:hover { background: #ffcc80; }
        .sync-btn { background: #bbdefb; color: #0d47a1; }
        .sync-btn:hover { background: #90caf9; }
        .sync-meta {
          margin-top: 8px; font-size: 11px; color: #546e7a;
          background: rgba(255,255,255,0.75); border: 1px solid #dde3ea;
          border-radius: 6px; padding: 6px 10px; display: flex; flex-wrap: wrap; gap: 12px;
        }
        .subpanel { margin-top: 12px; background: #fff; border: 1px solid #dde3ea; border-radius: 8px; padding: 12px; display: none; }
        .subpanel.show { display: block; }
        .form-row { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; align-items: center; font-size: 12px; }
        select, input[type="text"], textarea { border: 1px solid #ccc; border-radius: 5px; padding: 5px 8px; font-size: 12px; }
        textarea { width: 100%; height: 110px; font-family: monospace; resize: vertical; }
        .primary-btn { background: #1976d2; color: #fff; border: none; border-radius: 5px; padding: 6px 14px; font-size: 12px; cursor: pointer; font-weight: 600; }
        .danger-btn { background: #e53935; color: #fff; border: none; border-radius: 5px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
        .tip { font-size: 11px; color: #666; line-height: 1.5; margin-bottom: 6px; }
      </style>

      <div class="mask" id="mask">
        <div class="modal">
          <div class="header">
            <div class="logo">📚 MyScholar <span class="ver">v2.2 远程同步版</span></div>
            <button class="close-btn" id="closeBtn">✕ 关闭</button>
          </div>

          <div class="section-title">核心数据集（括号内为本地已收录条数）</div>
          <div class="chip-grid" id="group-core"></div>

          <div class="section-title">更多数据集（商科 / 国际体系）</div>
          <div class="chip-grid" id="group-more"></div>

          <div class="section-title">自定义 / 高校数据集</div>
          <div class="chip-grid" id="group-custom"></div>

          <div class="section-title">显示样式与引擎开关</div>
          <div class="chip-grid" id="style-row"></div>

          <div class="section-title">数据管理与远程同步</div>
          <div class="footer-bar">
            <button class="action-btn sync-btn" id="btn-sync-url">🔗 设置同步地址</button>
            <button class="action-btn sync-btn" id="btn-sync-now">🔄 立即同步</button>
            <button class="action-btn" id="btn-toggle-import">📥 批量导入/粘贴数据</button>
            <button class="action-btn" id="btn-new-ds">➕ 新建自定义库</button>
            <button class="action-btn" id="btn-oa-key">🔑 OpenAlex Key</button>
            <button class="action-btn" id="btn-export-all">💾 导出全量备份</button>
            <button class="action-btn" id="btn-import-backup">📂 恢复备份JSON</button>
          </div>
          <div class="sync-meta" id="sync-meta"></div>

          <div class="subpanel" id="import-subpanel">
            <div class="form-row">
              <label>目标数据集：</label>
              <select id="import-target"></select>
              <select id="import-mode">
                <option value="merge">增量合并</option>
                <option value="replace">清空覆盖</option>
              </select>
              <input type="text" id="default-tag-input" placeholder="单列默认标签(如: 北大核心)" style="width:165px;">
            </div>
            <div class="tip">💡 支持直接从 Excel 复制两列（期刊名 + 等级）粘贴，或单列纯名单粘贴。</div>
            <textarea id="import-textarea" placeholder="在此粘贴 Excel 两列或单列期刊名单..."></textarea>
            <div class="form-row" style="margin-top:8px; justify-content: space-between;">
              <div>
                <button class="primary-btn" id="btn-do-import">✅ 确认导入并生效</button>
                <button class="close-btn" id="btn-load-csv-file">📄 读取CSV/TXT</button>
              </div>
              <button class="danger-btn" id="btn-clear-target">🗑️ 清空该库</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(panelHost);
    const $ = (id) => shadow.getElementById(id);

    $("closeBtn").onclick = () => { panelHost.style.display = "none"; };
    $("mask").onclick = (e) => { if (e.target === $("mask")) panelHost.style.display = "none"; };
    $("btn-toggle-import").onclick = () => $("import-subpanel").classList.toggle("show");
    $("btn-sync-url").onclick = () => promptSyncSettings();
    $("btn-sync-now").onclick = () => {
      syncStatusNote = "正在同步...";
      renderPanelUI();
      syncRemote(true);
    };

    $("btn-new-ds").onclick = () => {
      const name = prompt("新数据集名称（如：本校A类目录）：");
      if (!name || !name.trim()) return;
      const color = prompt("标签颜色 HEX：", "#7b1fa2") || "#7b1fa2";
      const id = "custom_" + Date.now();
      datasets[id] = { name: name.trim(), group: "custom", color: color.trim(), items: {}, remote: false };
      config.enabled[id] = true;
      saveSingleDataset(id); saveConfig(); invalidateIndex([id]); renderPanelUI();
      $("import-subpanel").classList.add("show");
      $("import-target").value = id;
    };

    $("btn-oa-key").onclick = () => {
      const k = prompt("输入 OpenAlex 免费 API Key（在 openalex.org 免费注册可提高10倍每日查询额度，留空则用默认测试额度）：", config.openAlexKey || "");
      if (k !== null) { config.openAlexKey = k.trim(); saveConfig(); alert("已保存！"); }
    };

    $("btn-do-import").onclick = () => {
      const targetId = $("import-target").value;
      const mode = $("import-mode").value;
      const defaultTag = $("default-tag-input").value.trim() || datasets[targetId].name;
      const raw = $("import-textarea").value;
      if (!raw.trim()) return alert("请先粘贴数据！");
      if (mode === "replace") datasets[targetId].items = {};
      let added = 0;

      raw.split(/\r?\n/).forEach((line) => {
        const cleanLine = line.trim();
        if (!cleanLine) return;
        let sep = cleanLine.includes("\t") ? "\t" : (cleanLine.includes(",") ? "," : (cleanLine.includes(";") ? ";" : null));
        let jName = cleanLine, label = defaultTag;
        if (sep) {
          const cols = cleanLine.split(sep).map((s) => s.replace(/^"|"$/g, "").trim());
          jName = cols[0];
          if (cols[1]) label = cols[1];
        }
        const key = normalize(jName);
        if (key && !["title", "journal", "期刊名", "刊名"].includes(key)) {
          datasets[targetId].items[key] = label;
          added++;
        }
      });

      config.enabled[targetId] = true;
      saveSingleDataset(targetId); saveConfig(); invalidateIndex([targetId]); renderPanelUI(); refreshAllBadges();
      $("import-textarea").value = "";
      alert(`已导入 ${added} 条到「${datasets[targetId].name}」，页面已更新！`);
    };

    $("btn-load-csv-file").onclick = () => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = ".csv,.txt,.tsv";
      inp.onchange = (e) => {
        const f = e.target.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => { $("import-textarea").value = r.result; };
        r.readAsText(f, "utf-8");
      };
      inp.click();
    };

    $("btn-clear-target").onclick = () => {
      const targetId = $("import-target").value;
      if (!confirm(`确定清空「${datasets[targetId].name}」？`)) return;
      datasets[targetId].items = {};
      saveSingleDataset(targetId); invalidateIndex([targetId]); renderPanelUI(); refreshAllBadges();
    };

    $("btn-export-all").onclick = () => {
      const blob = new Blob([JSON.stringify({ datasets, config }, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `MyScholar_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    };

    $("btn-import-backup").onclick = () => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = ".json";
      inp.onchange = (e) => {
        const f = e.target.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          try {
            const p = JSON.parse(r.result);
            if (p.datasets) datasets = p.datasets;
            if (p.config) {
              config = Object.assign(deepClone(DEFAULT_CONFIG), p.config);
              config.enabled = Object.assign(deepClone(DEFAULT_CONFIG.enabled), p.config.enabled || {});
            }
            saveAllDatasets(); saveConfig(); rebuildIndex(); renderPanelUI(); refreshAllBadges();
            alert("备份恢复成功！");
          } catch (err) { alert("JSON错误：" + err.message); }
        };
        r.readAsText(f, "utf-8");
      };
      inp.click();
    };

    renderPanelUI();
  }

  function renderPanelUI() {
    if (!panelHost) return;
    const shadow = panelHost.shadowRoot;
    const $ = (id) => shadow.getElementById(id);

    ["core", "more", "custom"].forEach((g) => { $(`group-${g}`).innerHTML = ""; });
    const select = $("import-target");
    const prevSel = select.value;
    select.innerHTML = "";

    for (const [id, ds] of Object.entries(datasets)) {
      const cnt = Object.keys(ds.items || {}).length;
      const btn = document.createElement("button");
      btn.className = `chip ${config.enabled[id] ? "active" : ""}`;
      btn.innerHTML = `${ds.name}${ds.remote ? " ☁️" : ""} <span class="cnt">(${cnt})</span>`;
      btn.onclick = () => {
        config.enabled[id] = !config.enabled[id];
        saveConfig(); renderPanelUI(); refreshAllBadges();
      };
      ($(`group-${ds.group}`) || $("group-custom")).appendChild(btn);

      const opt = document.createElement("option");
      opt.value = id; opt.textContent = `${ds.name} (${cnt}条)`;
      select.appendChild(opt);
    }
    if (prevSel && datasets[prevSel]) select.value = prevSel;

    const styleRow = $("style-row");
    styleRow.innerHTML = "";
    [
      { id: "classic", label: "样式一（经典）" },
      { id: "soft",    label: "样式二（柔和）" },
      { id: "block",   label: "样式三（方块柔和）" },
      { id: "pastel",  label: "样式四（马卡龙胶囊）" }
    ].forEach((s) => {
      const b = document.createElement("button");
      b.className = `chip ${config.style === s.id ? "active" : ""}`;
      b.textContent = s.label;
      b.onclick = () => { config.style = s.id; saveConfig(); renderPanelUI(); refreshAllBadges(); };
      styleRow.appendChild(b);
    });

    const oaBtn = document.createElement("button");
    oaBtn.className = `chip ${config.enableOpenAlex ? "active" : ""}`;
    oaBtn.textContent = `🌐 OpenAlex实时兜底 (${Object.keys(oaCache).length}缓存)`;
    oaBtn.onclick = () => { config.enableOpenAlex = !config.enableOpenAlex; saveConfig(); renderPanelUI(); refreshAllBadges(); };
    styleRow.appendChild(oaBtn);

    const dbgBtn = document.createElement("button");
    dbgBtn.className = `chip ${config.debugMode ? "active" : ""}`;
    dbgBtn.textContent = "🐛 调试模式(显示识别到的刊名)";
    dbgBtn.onclick = () => { config.debugMode = !config.debugMode; saveConfig(); renderPanelUI(); refreshAllBadges(); };
    styleRow.appendChild(dbgBtn);

    const syncMeta = $("sync-meta");
    if (syncMeta) {
      const verText = config.remoteVersion || "未知";
      const urlStatus = config.syncUrl ? "已配置" : "未配置";
      const note = syncStatusNote ? `<span>状态：${syncStatusNote}</span>` : "";
      syncMeta.innerHTML =
        `<span>同步源：${urlStatus}（每 ${config.syncHours || 168}h）</span>` +
        `<span>上次同步：${formatSyncTime(config.lastSyncTime)}</span>` +
        `<span>数据版本：${verText}</span>` +
        note;
    }
  }

  // ===================== 8. 启动 =====================
  const floatBtn = document.createElement("div");
  floatBtn.id = "ms2-float-btn";
  floatBtn.textContent = "📚";
  floatBtn.title = "打开 MyScholar 控制面板";
  floatBtn.onclick = openPanel;
  document.body.appendChild(floatBtn);

  GM_registerMenuCommand("⚙️ 打开 MyScholar 控制面板", openPanel);
  GM_registerMenuCommand("🔗 设置同步地址", promptSyncSettings);
  GM_registerMenuCommand("🔄 立即同步远程数据", () => syncRemote(true));

  scanPage();
  syncRemote(false);

  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scanPage, 450);
  }).observe(document.body, { childList: true, subtree: true });
})();
