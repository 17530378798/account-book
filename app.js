const STORAGE_KEY = "offline-ledger-users-v1";
const ACCOUNT = "我的账本";
const CATEGORIES = {
  "房租水电": ["房租", "水费", "电费", "燃气", "物业"], "饮食": ["早餐", "午餐", "晚餐", "买菜", "零食"],
  "娱乐": ["电影", "游戏", "演出", "会员"], "交通": ["公交", "地铁", "打车", "加油", "停车"],
  "饮品": ["咖啡", "奶茶", "果汁", "酒水"], "休闲": ["旅行", "健身", "兴趣", "户外"],
  "服饰美妆": ["服装", "鞋包", "护肤", "美妆"], "日用": ["家居", "清洁", "数码", "药品"], "人情": ["红包", "礼物", "聚会"]
};
const TITLES = { overview: "月度总览", records: "明细记录", analysis: "分类分析", months: "月份归档" };
const COLORS = ["#1f8f78", "#e09f3e", "#457b9d", "#d66565", "#5f7f72", "#9c6f9e", "#5c8dbe", "#a17c52", "#6b7280"];
const $ = (selector) => document.querySelector(selector);
let selectedMonth = localMonth(); let activeView = "overview";
function localMonth() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; }
function localDateTime() { const now = new Date(); return new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function readStore() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; } }
function currentAccount() { const store = readStore(); if (!store[ACCOUNT]) store[ACCOUNT] = { records: [], budgets: {} }; store[ACCOUNT].records ||= []; store[ACCOUNT].budgets ||= {}; localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); return { store, account: store[ACCOUNT] }; }
function persist(store) { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }
function money(value) { return `¥${Number(value || 0).toFixed(2)}`; }
function monthText(value) { const [year, month] = value.split("-"); return `${year}年${Number(month)}月`; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
function monthRecords() { return currentAccount().account.records.filter((record) => record.date.slice(0, 7) === selectedMonth).sort((a, b) => b.date.localeCompare(a.date)); }
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2000); }
function setImportStatus(message, type = "show") { const element = $("#importStatus"); if (!element) return; element.textContent = message; element.className = `import-status ${type}`; }
function setView(view) { activeView = view; $("#viewTitle").textContent = TITLES[view]; document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view)); document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.id === `${view}View`)); renderActiveView(); window.scrollTo({ top: 0, behavior: "instant" }); }
function renderActiveView() { $("#monthInput").value = selectedMonth; if (activeView === "overview") renderOverview(); if (activeView === "records") renderRecords(); if (activeView === "analysis") renderAnalysis(); if (activeView === "months") renderMonths(); }
function renderOverview() {
  const records = monthRecords(), total = records.reduce((sum, record) => sum + record.amount, 0), dailyTotal = records.filter((record) => !record.oneTime).reduce((sum, record) => sum + record.amount, 0), necessary = records.filter((record) => record.necessity === "必要").reduce((sum, record) => sum + record.amount, 0), days = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5)), 0).getDate();
  $("#overviewView").innerHTML = `<div class="stats-grid"><article class="stat-card stat-primary"><small>本月支出</small><strong>${money(total)}</strong><span>${records.length} 笔记录</span></article><article class="stat-card"><small>日均支出</small><strong>${money(dailyTotal / days)}</strong><span>不含大额单次支出</span></article><article class="stat-card"><small>必要支出</small><strong>${money(necessary)}</strong><span>占比 ${total ? Math.round(necessary / total * 100) : 0}%</span></article><article class="stat-card"><small>剩余天数</small><strong>${selectedMonth === localMonth() ? Math.max(0, days - new Date().getDate()) : 0}</strong><span>${monthText(selectedMonth)}</span></article></div><section class="panel recent-panel"><div class="panel-head"><h2>最近记录</h2><button class="ghost-btn" data-open-records>查看全部</button></div>${recordCards(records.slice(0, 6))}</section>`;
  $("[data-open-records]")?.addEventListener("click", () => setView("records"));
}
function recordCards(records) { if (!records.length) return `<div class="empty"><strong>这个月还没有记录</strong><span>点击“记一笔”开始使用</span></div>`; return `<div class="record-list">${records.map((record) => `<article class="record-row"><div class="record-main"><strong>${escapeHtml(record.major)} · ${escapeHtml(record.minor || "未分类")}</strong><small>${record.date.replace("T", " ")} · ${escapeHtml(record.necessity)}${record.oneTime ? " · 单次支出" : ""}</small>${record.note ? `<small>${escapeHtml(record.note)}</small>` : ""}</div><div class="record-side"><strong>${money(record.amount)}</strong>${record.id ? `<button class="delete-btn" data-delete="${escapeHtml(record.id)}">删除</button>` : ""}</div></article>`).join("")}</div>`; }
function renderRecords() { const records = monthRecords(); $("#recordsView").innerHTML = `<section class="panel"><div class="panel-head"><div><h2>${monthText(selectedMonth)}</h2><span class="muted">共 ${records.length} 笔</span></div><button class="primary-btn" data-add-record>+ 记一笔</button></div>${recordCards(records)}</section>`; $("[data-add-record]")?.addEventListener("click", openExpenseDialog); document.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteRecord(button.dataset.delete))); }
function dailyBarChart(records) {
  const days = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5)), 0).getDate();
  const totals = Array.from({ length: days }, (_, index) => records.filter((record) => Number(record.date.slice(8, 10)) === index + 1).reduce((sum, record) => sum + record.amount, 0));
  const maximum = Math.max(...totals, 0);
  return `<div class="chart-scroll"><div class="bars daily-bars" style="--chart-days:${days}">${totals.map((total, index) => `<div class="bar-wrap" title="${index + 1}日：${money(total)}"><small>${total ? money(total) : ""}</small><i class="bar" style="height:${maximum ? Math.max(3, total / maximum * 100) : 2}%"></i><span>${index + 1}日</span></div>`).join("")}</div></div>`;
}
function categoryPieChart(records) {
  const totals = Object.keys(CATEGORIES).map((category, index) => ({ category, color: COLORS[index], total: records.filter((record) => record.major === category).reduce((sum, record) => sum + record.amount, 0) })).filter((item) => item.total > 0);
  const total = totals.reduce((sum, item) => sum + item.total, 0);
  let angle = 0;
  const gradient = totals.map((item) => { const start = angle; angle += item.total / total * 360; return `${item.color} ${start}deg ${angle}deg`; }).join(", ") || "#e7eeeb 0deg 360deg";
  return `<div class="donut-layout"><div class="donut" style="background:conic-gradient(${gradient})"><span>${money(total)}</span></div><div class="legend">${totals.length ? totals.map((item) => `<div class="legend-row"><span class="legend-label"><i class="dot" style="background:${item.color}"></i>${escapeHtml(item.category)}</span><strong>${money(item.total)} · ${Math.round(item.total / total * 100)}%</strong></div>`).join("") : `<span class="muted">本月暂无支出数据</span>`}</div></div>`;
}
function renderAnalysis() {
  const records = monthRecords(), total = records.reduce((sum, record) => sum + record.amount, 0), { account } = currentAccount(); account.budgets[selectedMonth] ||= {};
  $("#analysisView").innerHTML = `<div class="analysis-charts"><section class="panel"><div class="panel-head"><div><h2>每日支出</h2><span class="muted">${monthText(selectedMonth)}每日金额</span></div></div>${dailyBarChart(records)}</section><section class="panel"><div class="panel-head"><div><h2>分类占比</h2><span class="muted">每一类支出占比</span></div></div>${categoryPieChart(records)}</section></div><section class="panel budget-panel"><div class="panel-head"><div><h2>分类预算</h2><span class="muted">${monthText(selectedMonth)}</span></div><strong>${money(total)}</strong></div><div class="category-grid">${Object.keys(CATEGORIES).map((category, index) => { const spent = records.filter((record) => record.major === category).reduce((sum, record) => sum + record.amount, 0), budget = Number(account.budgets[selectedMonth][category] || 0), percent = budget ? Math.min(100, spent / budget * 100) : 0; return `<article class="category-card"><div class="category-title"><span class="dot" style="background:${COLORS[index]}"></span><h3>${category}</h3><strong>${money(spent)}</strong></div><div class="progress"><i style="width:${percent}%"></i></div><div class="budget-row"><input type="number" inputmode="decimal" min="0" step="0.01" value="${budget || ""}" placeholder="设置月预算" data-budget="${category}"><button class="ghost-btn" data-save-budget="${category}">保存</button></div></article>`; }).join("")}</div></section>`;
  document.querySelectorAll("[data-save-budget]").forEach((button) => button.addEventListener("click", () => saveBudget(button.dataset.saveBudget)));
}
function renderMonths() { const records = currentAccount().account.records, months = [...new Set(records.map((record) => record.date.slice(0, 7)).concat(selectedMonth))].sort().reverse(); $("#monthsView").innerHTML = `<section class="panel"><div class="panel-head"><div><h2>月份归档</h2><span class="muted">点击月份查看详情</span></div></div><div class="month-grid">${months.map((value) => { const list = records.filter((record) => record.date.slice(0, 7) === value), total = list.reduce((sum, record) => sum + record.amount, 0), necessary = list.filter((record) => record.necessity === "必要").reduce((sum, record) => sum + record.amount, 0); return `<button class="month-card${value === selectedMonth ? " selected" : ""}" data-month="${value}"><span>${monthText(value)}</span><strong>${money(total)}</strong><small>${list.length} 笔 · 必要支出 ${total ? Math.round(necessary / total * 100) : 0}%</small></button>`; }).join("")}</div></section>`; document.querySelectorAll("[data-month]").forEach((button) => button.addEventListener("click", () => { selectedMonth = button.dataset.month; setView("overview"); })); }
function fillMinorCategories() { const major = $("#majorInput").value; $("#minorInput").innerHTML = CATEGORIES[major].map((minor) => `<option>${minor}</option>`).join("") + `<option value="__custom">自定义...</option>`; $("#customMinorField").classList.add("hidden"); }
function openExpenseDialog() { $("#dateInput").value = localDateTime(); $("#expenseDialog").showModal(); setTimeout(() => $("#amountInput").focus(), 100); }
function deleteRecord(id) { if (!confirm("确定删除这条记录吗？")) return; const { store, account } = currentAccount(); account.records = account.records.filter((record) => String(record.id) !== String(id)); persist(store); renderActiveView(); showToast("记录已删除"); }
function saveBudget(category) { const { store, account } = currentAccount(); account.budgets[selectedMonth] ||= {}; account.budgets[selectedMonth][category] = Number(document.querySelector(`[data-budget="${CSS.escape(category)}"]`).value || 0); persist(store); renderAnalysis(); showToast("预算已保存"); }
function backupPayload() {
  return { format: "emotion-ledger-backup", version: 1, exportedAt: new Date().toISOString(), account: currentAccount().account };
}
async function deliverFile(file, title) {
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ title, files: [file] }); return; }
    catch (error) { if (error.name === "AbortError") return; }
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file); link.download = file.name; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast("文件已导出");
}
async function exportBackup() {
  const fileName = `情绪稳定-${localMonth()}.json`;
  await deliverFile(new File([JSON.stringify(backupPayload(), null, 2)], fileName, { type: "application/json" }), "情绪稳定完整备份");
}
function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
async function exportCsv() {
  const headers = ["ID", "日期时间", "金额", "大类", "小类", "必要性", "大额单次支出", "备注"];
  const rows = currentAccount().account.records.map((record) => [record.id, record.date, record.amount, record.major, record.minor, record.necessity, record.oneTime ? "是" : "否", record.note]);
  const content = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  await deliverFile(new File([content], `情绪稳定-${localMonth()}.csv`, { type: "text/csv;charset=utf-8" }), "情绪稳定 CSV 账本");
}
function normalizeBudgets(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized = {};
  const legacy = Object.keys(value).some((key) => CATEGORIES[key] && Number.isFinite(Number(value[key])));
  const sources = legacy ? { [selectedMonth]: value } : value;
  Object.entries(sources).forEach(([month, categories]) => {
    if (!/^\d{4}-\d{2}$/.test(month) || !categories || typeof categories !== "object") return;
    normalized[month] = {};
    Object.keys(CATEGORIES).forEach((category) => {
      const amount = Number(categories[category]);
      if (Number.isFinite(amount) && amount >= 0) normalized[month][category] = amount;
    });
  });
  return normalized;
}
function normalizeBackup(parsed) {
  const source = parsed?.format === "emotion-ledger-backup" ? parsed.account : parsed;
  if (!source || !Array.isArray(source.records)) throw new Error("这不是有效的账本备份文件");
  const records = source.records.map((record, index) => {
    const amount = Number(String(record?.amount ?? "").replace(/[¥￥,\s]/g, ""));
    if (!record || typeof record.date !== "string" || !(amount > 0) || typeof record.major !== "string") throw new Error(`第 ${index + 1} 条记录格式不正确`);
    const seed = `${record.date}|${amount}|${record.major}|${record.minor || ""}|${record.note || ""}`;
    let hash = 2166136261; for (const char of seed) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    const rawDate = String(record.date).trim().replace(/[/.]/g, "-").replace(/\s+/, "T");
    const dateMatch = rawDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T(\d{1,2})(?::(\d{1,2}))?)?/);
    if (!dateMatch) throw new Error(`第 ${index + 1} 条记录日期格式不正确`);
    const normalizedDate = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}T${String(dateMatch[4] || "00").padStart(2, "0")}:${String(dateMatch[5] || "00").padStart(2, "0")}`;
    return { id: String(record.id || `import-${hash >>> 0}`), date: normalizedDate, amount, major: record.major.slice(0, 20), minor: String(record.minor || "未分类").slice(0, 20), necessity: ["必要", "可减少", "非必要"].includes(record.necessity) ? record.necessity : "必要", oneTime: Boolean(record.oneTime), note: String(record.note || "").slice(0, 80) };
  });
  return { records, budgets: normalizeBudgets(source.budgets) };
}
function parseCsv(text) {
  const rows = []; let row = [], field = "", quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  if (quoted) throw new Error("CSV 文件中的引号不完整");
  return rows;
}
function normalizeCsv(text) {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 1) throw new Error("CSV 文件没有内容");
  const headers = rows.shift().map((header) => header.trim());
  const position = (name) => headers.indexOf(name);
  const firstPosition = (...names) => names.map((name) => position(name)).find((index) => index >= 0) ?? -1;
  const datePosition = firstPosition("日期时间", "日期");
  if ([datePosition, position("金额"), position("大类")].some((index) => index < 0)) throw new Error("CSV 缺少日期/金额/大类列");
  const records = rows.map((row) => ({ id: position("ID") >= 0 ? row[position("ID")] : "", date: row[datePosition], amount: row[position("金额")], major: row[position("大类")], minor: position("小类") >= 0 ? row[position("小类")] : "未分类", necessity: position("必要性") >= 0 ? row[position("必要性")] : "必要", oneTime: position("大额单次支出") >= 0 && ["是", "true", "1"].includes(String(row[position("大额单次支出")]).toLowerCase()), note: position("备注") >= 0 ? row[position("备注")] : "" }));
  return normalizeBackup({ records, budgets: {} });
}
async function importBackup() {
  const file = $("#importFileInput").files[0];
  const button = $("#importBackupBtn");
  if (!file) { setImportStatus("请先选择文件", "error"); return; }
  setImportStatus("正在读取文件…", "show"); button.disabled = true;
  try {
    const text = await file.text();
    const isCsv = /\.csv$/i.test(file.name) || file.type.includes("csv") || !text.trimStart().startsWith("{");
    const incoming = isCsv ? normalizeCsv(text) : normalizeBackup(JSON.parse(text));
    const mode = $("#importModeInput").value;
    if (mode === "replace" && !confirm("替换会覆盖当前账本，确定继续吗？")) { setImportStatus("已取消导入", "show"); return; }
    const { store, account } = currentAccount();
    let added = 0; let updated = 0;
    if (mode === "replace") {
      store[ACCOUNT] = { records: incoming.records, budgets: isCsv ? account.budgets : incoming.budgets };
      added = incoming.records.length;
    } else {
      const recordsById = new Map(account.records.map((record) => [String(record.id), record]));
      incoming.records.forEach((record) => { if (recordsById.has(String(record.id))) updated += 1; else added += 1; recordsById.set(String(record.id), record); });
      account.records = [...recordsById.values()];
      Object.entries(incoming.budgets).forEach(([month, categories]) => { account.budgets[month] = { ...(account.budgets[month] || {}), ...categories }; });
    }
    persist(store);
    const latest = incoming.records.map((record) => record.date.slice(0, 7)).sort().pop();
    if (latest) selectedMonth = latest;
    setView("records");
    setImportStatus(`导入完成：新增 ${added} 条，更新 ${updated} 条`, "show");
    showToast(`导入完成，共 ${incoming.records.length} 条记录`);
    setTimeout(() => $("#dataDialog")?.close(), 1200);
  } catch (error) {
    setImportStatus(error.message || "备份文件无法读取", "error");
  } finally { button.disabled = false; }
}
function openDataDialog() { $("#importFileInput").value = ""; setImportStatus("", "hide"); $("#dataDialog").showModal(); }
document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$("#monthInput").addEventListener("change", (event) => { selectedMonth = event.target.value || localMonth(); renderActiveView(); });
$("#openAddBtn").addEventListener("click", openExpenseDialog); $("#closeExpenseBtn").addEventListener("click", () => $("#expenseDialog").close());
$("#exportBtn").addEventListener("click", openDataDialog); $("#mobileDataBtn").addEventListener("click", openDataDialog); $("#closeDataBtn").addEventListener("click", () => $("#dataDialog").close());
$("#downloadCsvBtn").addEventListener("click", exportCsv); $("#downloadBackupBtn").addEventListener("click", exportBackup); $("#importBackupBtn").addEventListener("click", importBackup);
$("#majorInput").innerHTML = Object.keys(CATEGORIES).map((category) => `<option>${category}</option>`).join(""); $("#majorInput").addEventListener("change", fillMinorCategories); $("#minorInput").addEventListener("change", (event) => $("#customMinorField").classList.toggle("hidden", event.target.value !== "__custom"));
$("#expenseForm").addEventListener("submit", (event) => { event.preventDefault(); const form = new FormData(event.currentTarget), amount = Number(form.get("amount")); if (!(amount > 0)) return showToast("请输入有效金额"); const minor = form.get("minor") === "__custom" ? $("#minorCustomInput").value.trim() : form.get("minor"); if (!minor) return showToast("请输入小类名称"); const { store, account } = currentAccount(); account.records.push({ id: crypto.randomUUID?.() || String(Date.now()), date: form.get("date"), amount, major: form.get("major"), minor, necessity: form.get("necessity"), oneTime: form.get("oneTime") === "on", note: form.get("note").trim() }); persist(store); event.currentTarget.reset(); fillMinorCategories(); $("#expenseDialog").close(); renderActiveView(); showToast("记录已保存"); });
currentAccount(); fillMinorCategories(); setView("overview");
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
