const STORAGE_KEY = "offline-ledger-users-v1";
const BACKUP_STORAGE_KEY = "offline-ledger-users-v1-backup";
const HISTORY_KEY = "offline-ledger-history-v1";
const THEME_KEY = "offline-ledger-theme-v1";
const BRAND_KEY = "offline-ledger-brand-v1";
const APP_VERSION = "35";
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
let selectedMonth = localMonth(); let activeView = "overview"; let editingRecordId = null; let editingIncomeId = null;
const recordFilters = { query: "", category: "", necessity: "", min: "", max: "" };
function localMonth() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; }
function localDateTime() { const now = new Date(); return new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
class LedgerStorageError extends Error {}
function storageNotice(message) { const notice = $("#storageNotice"); if (notice) { notice.textContent = message; notice.hidden = !message; } }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function parseStoredValue(key) {
  let raw;
  try { raw = localStorage.getItem(key); }
  catch { throw new LedgerStorageError("无法读取设备存储，请检查浏览器权限；现有账本未被覆盖。"); }
  if (raw === null) return { state: "missing" };
  try {
    const value = JSON.parse(raw);
    if (!isObject(value) || !Object.values(value).every((account) => isObject(account) && Array.isArray(account.records) && account.records.every((record) => isObject(record) && typeof record.date === "string" && Number.isFinite(record.amount)) && (account.budgets === undefined || isObject(account.budgets)) && (account.deletedRecords === undefined || Array.isArray(account.deletedRecords)) && (account.savings === undefined || Array.isArray(account.savings) && account.savings.every((saving) => isObject(saving) && /^\d{4}-\d{2}$/.test(saving.month) && Number.isFinite(saving.amount))) && (account.incomes === undefined || Array.isArray(account.incomes) && account.incomes.every((income) => isObject(income) && typeof income.date === "string" && Number.isFinite(income.amount))))) return { state: "invalid" };
    return { state: "valid", value };
  } catch { return { state: "invalid" }; }
}
function readStore() {
  const primary = parseStoredValue(STORAGE_KEY);
  if (primary.state === "valid") return primary.value;
  const backup = parseStoredValue(BACKUP_STORAGE_KEY);
  if (backup.state === "valid") {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(backup.value)); }
    catch { storageNotice("已读取本机备份，但暂时无法修复主存储。请先导出完整备份。"); }
    return backup.value;
  }
  if (primary.state === "missing" && backup.state === "missing") return {};
  throw new LedgerStorageError("本机账本暂时无法读取，已停止写入以保护原数据。请勿清除网站数据。");
}
function currentAccount() { const store = readStore(); if (!store[ACCOUNT]) store[ACCOUNT] = { records: [], budgets: {}, deletedRecords: [], savings: [], incomes: [] }; store[ACCOUNT].budgets ||= {}; store[ACCOUNT].deletedRecords ||= []; store[ACCOUNT].savings ||= []; store[ACCOUNT].incomes ||= []; return { store, account: store[ACCOUNT] }; }
function readHistory() { try { const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
function saveHistorySnapshot(serialized) {
  if (!serialized) return;
  try {
    const history = readHistory();
    if (history[0]?.data === serialized) return;
    history.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, savedAt: new Date().toISOString(), data: serialized });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
  } catch { /* History failure must never block the main ledger save. */ }
}
function persist(store) {
  const serialized = JSON.stringify(store);
  let previous = null;
  try { previous = localStorage.getItem(STORAGE_KEY); } catch { /* Primary write below reports storage errors. */ }
  try { localStorage.setItem(STORAGE_KEY, serialized); }
  catch { throw new LedgerStorageError("保存失败，可能是存储空间不足或浏览器限制。请先导出备份，当前操作尚未保存。"); }
  try { localStorage.setItem(BACKUP_STORAGE_KEY, serialized); storageNotice(""); }
  catch { storageNotice("账本已保存，但本机备用副本未能更新。请导出完整备份。"); }
  if (previous && previous !== serialized) saveHistorySnapshot(previous);
}
window.addEventListener("error", (event) => { if (event.error instanceof LedgerStorageError) { event.preventDefault(); storageNotice(event.error.message); alert(event.error.message); } });
function money(value) { return `¥${Number(value || 0).toFixed(2)}`; }
function monthText(value) { const [year, month] = value.split("-"); return `${year}年${Number(month)}月`; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
function monthRecords() { return currentAccount().account.records.filter((record) => record.date.slice(0, 7) === selectedMonth).sort((a, b) => b.date.localeCompare(a.date)); }
function monthIncomes(month = selectedMonth) { return currentAccount().account.incomes.filter((income) => income.date.slice(0, 7) === month).sort((a, b) => b.date.localeCompare(a.date)); }
function monthSavings(month = selectedMonth) { return currentAccount().account.savings.find((saving) => saving.month === month) || null; }
function normalizeSaving(value) {
  const month = String(value?.month || "").trim();
  const amount = Number(String(value?.amount ?? "").replace(/[¥￥,\s]/g, ""));
  if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(amount) || !(amount > 0)) throw new Error("存款记录格式不正确");
  const rawDate = String(value?.date || `${month}-01`).trim().replace(/[/.]/g, "-").replace(/\s+/, "T");
  const dateMatch = rawDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T(\d{1,2})(?::(\d{1,2}))?)?/);
  const date = dateMatch ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}T${String(dateMatch[4] || "00").padStart(2, "0")}:${String(dateMatch[5] || "00").padStart(2, "0")}` : `${month}-01T00:00`;
  return { id: String(value?.id || `saving-${month}`), month, amount, date, note: String(value?.note || "").slice(0, 80) };
}
function normalizeSavings(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("存款数据格式不正确");
  const byMonth = new Map();
  value.forEach((saving) => { const normalized = normalizeSaving(saving); byMonth.set(normalized.month, normalized); });
  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
}
function normalizeIncome(value, index = 0) {
  const amount = Number(String(value?.amount ?? "").replace(/[¥￥,\s]/g, ""));
  const rawDate = String(value?.date || "").trim().replace(/[/.]/g, "-").replace(/\s+/, "T");
  const dateMatch = rawDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T(\d{1,2})(?::(\d{1,2}))?)?/);
  if (!dateMatch || !Number.isFinite(amount) || !(amount > 0)) throw new Error(`第 ${index + 1} 条收入记录格式不正确`);
  const date = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}T${String(dateMatch[4] || "00").padStart(2, "0")}:${String(dateMatch[5] || "00").padStart(2, "0")}`;
  return { id: String(value?.id || crypto.randomUUID?.() || `income-${Date.now()}-${index}`), date, amount, category: String(value?.category || "其他收入").slice(0, 20), note: String(value?.note || "").slice(0, 80) };
}
function normalizeIncomes(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("收入数据格式不正确");
  const ids = new Set();
  return value.map((income, index) => { const normalized = normalizeIncome(income, index); if (ids.has(normalized.id)) throw new Error("收入记录 ID 重复"); ids.add(normalized.id); return normalized; });
}
function recordedDayAverage(records) {
  const ordinaryRecords = records.filter((record) => !record.oneTime);
  const recordedDays = new Set(ordinaryRecords.map((record) => record.date.slice(0, 10))).size;
  const total = ordinaryRecords.reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
  return { amount: recordedDays ? total / recordedDays : 0, recordedDays };
}
function calendarHeatmap(records) {
  const year = Number(selectedMonth.slice(0, 4)), month = Number(selectedMonth.slice(5)), days = new Date(year, month, 0).getDate(), leading = new Date(year, month - 1, 1).getDay();
  const totals = Array.from({ length: days }, () => 0);
  records.forEach((record) => { const day = Number(record.date.slice(8, 10)); if (day >= 1 && day <= days) totals[day - 1] += Number(record.amount) || 0; });
  const maximum = Math.max(...totals, 0), today = localDateTime().slice(0, 10);
  const blanks = Array.from({ length: leading }, () => `<span class="heatmap-blank" aria-hidden="true"></span>`).join("");
  const cells = totals.map((total, index) => { const day = index + 1, date = `${selectedMonth}-${String(day).padStart(2, "0")}`, intensity = maximum ? Math.ceil(total / maximum * 5) : 0; return `<button type="button" class="heatmap-day level-${intensity}${date === today ? " is-today" : ""}" data-heatmap-day="${day}" data-heatmap-total="${total}" aria-label="${monthText(selectedMonth)}${day}日支出${money(total)}"><span>${day}</span><small>${total ? money(total) : ""}</small></button>`; }).join("");
  return `<section class="panel heatmap-panel"><div class="panel-head"><div><h2>每日消费日历热力图</h2><span class="muted">本月每日支出分布</span></div><span class="heatmap-total">${monthText(selectedMonth)}</span></div><div class="heatmap-weekdays" aria-hidden="true"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div class="heatmap-grid">${blanks}${cells}</div><div class="heatmap-scale"><span>少</span>${[0, 1, 2, 3, 4, 5].map((level) => `<i class="level-${level}"></i>`).join("")}<span>多</span></div></section>`;
}
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2000); }
function savedTheme() { try { return localStorage.getItem(THEME_KEY); } catch { return "jade"; } }
function normalizeBrand(value) {
  const name = String(value?.name || "").trim().slice(0, 12) || "情绪稳定";
  return { name, mark: [...name][0] || "情" };
}
function savedBrand() {
  try { return normalizeBrand(JSON.parse(localStorage.getItem(BRAND_KEY) || "null")); }
  catch { return normalizeBrand(null); }
}
function applyBrand(value) {
  const brand = normalizeBrand(value);
  const brandMark = $("#brandMark"), nameInput = $("#brandNameInput");
  if (brandMark) brandMark.textContent = brand.mark;
  document.querySelectorAll("[data-brand-name]").forEach((element) => { element.textContent = brand.name; });
  document.title = brand.name;
  $("meta[name=\"apple-mobile-web-app-title\"]")?.setAttribute("content", brand.name);
  if (nameInput) nameInput.value = brand.name;
  return brand;
}
let brandSaveTimer;
function setBrandSaveStatus(message, type = "success") {
  const status = $("#brandSaveStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `brand-save-status ${type}`;
  status.hidden = false;
}
function saveBrand() {
  const nameInput = $("#brandNameInput"), button = $("#saveBrandBtn");
  if (!nameInput || !button) return;
  const rawName = nameInput.value.trim();
  if (!rawName) { setBrandSaveStatus("请输入账本名称", "error"); nameInput.focus(); return; }
  const brand = applyBrand({ name: rawName });
  try {
    localStorage.setItem(BRAND_KEY, JSON.stringify(brand));
    storageNotice("");
    setBrandSaveStatus(`已保存为“${brand.name}”`);
    button.textContent = "已保存";
    clearTimeout(brandSaveTimer);
    brandSaveTimer = setTimeout(() => { button.textContent = "保存修改"; }, 1600);
    showToast(`名称已改为“${brand.name}”`);
  } catch {
    storageNotice("名称已修改，但设备未能保存这项设置。");
    setBrandSaveStatus("本次修改未能保存到设备，请检查 Safari 存储权限。", "error");
    showToast("名称未能保存");
  }
}
async function latestAppVersion() {
  try {
    const response = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return APP_VERSION;
    const version = String((await response.json()).version || "");
    return /^\d+$/.test(version) ? version : APP_VERSION;
  } catch { return APP_VERSION; }
}
function applyTheme(theme) {
  const themes = ["jade", "apricot", "slate", "ocean", "lavender", "rose", "amber", "graphite"], selected = themes.includes(theme) ? theme : "jade";
  document.documentElement.dataset.theme = selected;
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  $("meta[name=\"theme-color\"]")?.setAttribute("content", accent || "#147d68");
  try { localStorage.setItem(THEME_KEY, selected); } catch { storageNotice("外观已切换，但设备未能保存偏好设置。"); }
  document.querySelectorAll("[data-theme-choice]").forEach((button) => { button.classList.toggle("selected", button.dataset.themeChoice === selected); button.setAttribute("aria-pressed", String(button.dataset.themeChoice === selected)); });
}
function openThemeDialog() { $("#themeDialog").showModal(); }
function setImportStatus(message, type = "show") { const element = $("#importStatus"); if (!element) return; element.textContent = message; element.className = `import-status ${type}`; }
let viewScrollFrame;
function setView(view) {
  if (!Object.hasOwn(TITLES, view)) return;
  activeView = view;
  $("#viewTitle").textContent = TITLES[view];
  document.querySelectorAll(".nav-item").forEach((button) => { button.classList.toggle("active", button.dataset.view === view); if (button.dataset.view === view) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current"); });
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.id === `${view}View`));
  renderActiveView();
  const resetScroll = () => { $(".main").scrollTo({ top: 0, left: 0, behavior: "instant" }); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); };
  cancelAnimationFrame(viewScrollFrame);
  resetScroll();
  // Reset again after the new section has laid out, including iOS momentum scroll.
  viewScrollFrame = requestAnimationFrame(resetScroll);
}
function renderActiveView() { $("#monthInput").value = selectedMonth; if (activeView === "overview") renderOverview(); if (activeView === "records") renderRecords(); if (activeView === "analysis") renderAnalysis(); if (activeView === "months") renderMonths(); }
function renderOverview() {
  const records = monthRecords(), incomes = monthIncomes(), incomeTotal = incomes.reduce((sum, income) => sum + income.amount, 0), saving = monthSavings(), total = records.reduce((sum, record) => sum + record.amount, 0), necessary = records.filter((record) => record.necessity === "必要").reduce((sum, record) => sum + record.amount, 0), days = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5)), 0).getDate(), dailyAverage = recordedDayAverage(records);
  const incomePanel = $("#incomeDialog") ? `<section class="panel income-panel"><div class="panel-head"><div><h2>本月收入</h2><span class="muted">独立记录，不计入消费支出</span></div><div class="panel-actions"><strong>${money(incomeTotal)}</strong><button type="button" class="primary-btn" data-open-income>+ 记收入</button></div></div>${incomeCards(incomes.slice(0, 4))}</section>` : "";
  const savingsPanel = $("#savingDialog") ? `<section class="panel savings-panel"><div class="savings-copy"><small>每月存款</small><strong>${saving ? money(saving.amount) : "尚未记录"}</strong><span>${saving ? `${saving.date.slice(0, 10)}${saving.note ? ` · ${escapeHtml(saving.note)}` : ""}` : `${monthText(selectedMonth)}固定存款单独记录，不计入支出`}</span></div><button type="button" class="primary-btn" data-open-saving>${saving ? "修改存款" : "记录本月存款"}</button></section>` : "";
  $("#overviewView").innerHTML = `<div class="stats-grid"><article class="stat-card stat-primary"><small>本月支出</small><strong>${money(total)}</strong><span>${records.length} 笔记录</span></article><article class="stat-card"><small>日均支出</small><strong>${money(dailyAverage.amount)}</strong><span>记录 ${dailyAverage.recordedDays} 天 · 不含单次支出</span></article><article class="stat-card"><small>必要支出</small><strong>${money(necessary)}</strong><span>占比 ${total ? Math.round(necessary / total * 100) : 0}%</span></article><article class="stat-card"><small>剩余天数</small><strong>${selectedMonth === localMonth() ? Math.max(0, days - new Date().getDate()) : 0}</strong><span>${monthText(selectedMonth)}</span></article></div>${incomePanel}${savingsPanel}${calendarHeatmap(records)}<section class="panel recent-panel"><div class="panel-head"><h2>最近记录</h2><button class="ghost-btn" data-open-records>查看全部</button></div>${recordCards(records.slice(0, 6))}</section>`;
  document.querySelectorAll("[data-heatmap-day]").forEach((button) => button.addEventListener("click", () => showToast(`${button.dataset.heatmapDay}日支出 ${money(button.dataset.heatmapTotal)}`)));
  $("[data-open-saving]")?.addEventListener("click", openSavingDialog);
  $("[data-open-income]")?.addEventListener("click", () => openIncomeDialog());
  document.querySelectorAll("[data-edit-income]").forEach((button) => button.addEventListener("click", () => openIncomeDialog(button.dataset.editIncome)));
  document.querySelectorAll("[data-delete-income]").forEach((button) => button.addEventListener("click", () => deleteIncome(button.dataset.deleteIncome)));
  $("[data-open-records]")?.addEventListener("click", () => setView("records"));
  bindRecordActions();
}
function recordCards(records) { if (!records.length) return `<div class="empty"><strong>这个月还没有记录</strong><span>点击“记一笔”开始使用</span></div>`; return `<div class="record-list">${records.map((record) => `<article class="record-row"><div class="record-main"><strong>${escapeHtml(record.major)} · ${escapeHtml(record.minor || "未分类")}</strong><small>${record.date.replace("T", " ")} · ${escapeHtml(record.necessity)}${record.oneTime ? " · 单次支出" : ""}</small>${record.note ? `<small>${escapeHtml(record.note)}</small>` : ""}</div><div class="record-side"><strong>${money(record.amount)}</strong>${record.id ? `<div class="record-actions"><button class="edit-btn" data-edit="${escapeHtml(record.id)}">编辑</button><button class="delete-btn" data-delete="${escapeHtml(record.id)}">删除</button></div>` : ""}</div></article>`).join("")}</div>`; }
function incomeCards(incomes) { if (!incomes.length) return `<div class="empty compact-empty"><span>这个月还没有收入记录</span></div>`; return `<div class="record-list">${incomes.map((income) => `<article class="record-row income-row"><div class="record-main"><strong>${escapeHtml(income.category || "其他收入")}</strong><small>${income.date.replace("T", " ")}${income.note ? ` · ${escapeHtml(income.note)}` : ""}</small></div><div class="record-side"><strong>+${money(income.amount)}</strong><div class="record-actions"><button class="edit-btn" data-edit-income="${escapeHtml(income.id)}">编辑</button><button class="delete-btn" data-delete-income="${escapeHtml(income.id)}">删除</button></div></div></article>`).join("")}</div>`; }
function bindRecordActions() { document.querySelectorAll(".view.active [data-edit]").forEach((button) => button.addEventListener("click", () => openEditDialog(button.dataset.edit))); document.querySelectorAll(".view.active [data-delete]").forEach((button) => button.addEventListener("click", () => deleteRecord(button.dataset.delete))); }
function filteredMonthRecords() {
  const query = recordFilters.query.trim().toLowerCase(), min = recordFilters.min === "" ? null : Number(recordFilters.min), max = recordFilters.max === "" ? null : Number(recordFilters.max);
  return monthRecords().filter((record) => (!query || [record.major, record.minor, record.note].some((value) => String(value || "").toLowerCase().includes(query))) && (!recordFilters.category || record.major === recordFilters.category) && (!recordFilters.necessity || record.necessity === recordFilters.necessity) && (min === null || record.amount >= min) && (max === null || record.amount <= max));
}
function applyRecordFilters() {
  const minInput = $("[data-filter-min]"), minValue = minInput.value.trim();
  if (minValue !== "" && Number(minValue) < 0.01) { showToast("最低金额至少为 ¥0.01"); minInput.focus({ preventScroll: true }); return; }
  recordFilters.query = $("[data-filter-query]").value; recordFilters.category = $("[data-filter-category]").value; recordFilters.necessity = $("[data-filter-necessity]").value; recordFilters.min = minValue; recordFilters.max = $("[data-filter-max]").value; renderRecords();
}
function renderRecords() { const allRecords = monthRecords(), records = filteredMonthRecords(), filterCategories = [...new Set([...Object.keys(CATEGORIES), ...allRecords.map((record) => record.major)])], deletedCount = currentAccount().account.deletedRecords.length, filtering = Object.values(recordFilters).some(Boolean); $("#recordsView").innerHTML = `<section class="panel"><div class="panel-head"><div><h2>${monthText(selectedMonth)}</h2><span class="muted">${filtering ? `筛选到 ${records.length} / ${allRecords.length} 笔` : `共 ${records.length} 笔`}</span></div><div class="panel-actions"><button class="ghost-btn" data-open-trash>最近删除${deletedCount ? ` (${deletedCount})` : ""}</button><button class="primary-btn" data-add-record>+ 记一笔</button></div></div><div class="record-filters"><input type="search" value="${escapeHtml(recordFilters.query)}" placeholder="搜索分类或备注" data-filter-query><select data-filter-category><option value="">全部分类</option>${filterCategories.map((category) => `<option value="${escapeHtml(category)}"${recordFilters.category === category ? " selected" : ""}>${escapeHtml(category)}</option>`).join("")}</select><select data-filter-necessity><option value="">全部必要性</option>${["必要", "可减少", "非必要"].map((value) => `<option${recordFilters.necessity === value ? " selected" : ""}>${value}</option>`).join("")}</select><input type="number" inputmode="decimal" min="0.01" step="0.01" value="${escapeHtml(recordFilters.min)}" placeholder="最低金额" data-filter-min><input type="number" inputmode="decimal" min="0" step="0.01" value="${escapeHtml(recordFilters.max)}" placeholder="最高金额" data-filter-max><button class="primary-btn" type="button" data-apply-filters>筛选</button><button class="ghost-btn" type="button" data-clear-filters>清除</button></div>${recordCards(records)}</section>`; $("[data-add-record]")?.addEventListener("click", openExpenseDialog); $("[data-open-trash]")?.addEventListener("click", openTrashDialog); $("[data-apply-filters]")?.addEventListener("click", applyRecordFilters); $("[data-filter-query]")?.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); applyRecordFilters(); } }); $("[data-clear-filters]")?.addEventListener("click", () => { Object.keys(recordFilters).forEach((key) => { recordFilters[key] = ""; }); renderRecords(); }); bindRecordActions(); }
function dailyBarChart(records) {
  const days = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5)), 0).getDate();
  const totals = Array.from({ length: days }, () => 0);
  records.forEach((record) => { const day = Number(record.date.slice(8, 10)); if (day >= 1 && day <= days) totals[day - 1] += Number(record.amount) || 0; });
  const maximum = Math.max(...totals, 0);
  const total = totals.reduce((sum, amount) => sum + amount, 0), peakDay = maximum ? totals.indexOf(maximum) + 1 : 0;
  return `<div class="chart-summary"><span>本月合计 <strong>${money(total)}</strong></span><span>最高单日 <strong>${maximum ? `${peakDay}日 · ${money(maximum)}` : "暂无"}</strong></span></div><div class="chart-scroll"><div class="bars daily-bars${maximum ? "" : " is-empty"}">${totals.map((amount, index) => { const day = index + 1, showLabel = day === 1 || day === days || day % 5 === 0; return `<button type="button" class="bar-wrap" data-chart-day="${day}" data-chart-total="${amount}" aria-label="${day}日支出${money(amount)}"><span class="bar-track"><i class="bar${amount ? "" : " empty"}" style="--bar-height:${maximum ? Math.max(4, amount / maximum * 100) : 0}%"></i></span><span class="bar-day">${showLabel ? day : ""}</span></button>`; }).join("")}${maximum ? "" : `<div class="chart-empty">本月还没有支出记录</div>`}</div></div>`;
}
function categoryTotals(records) {
  const grouped = new Map();
  records.forEach((record) => { const category = String(record.major || "未分类").trim() || "未分类"; grouped.set(category, (grouped.get(category) || 0) + (Number(record.amount) || 0)); });
  return [...grouped.entries()].map(([category, amount]) => ({ category, total: amount })).filter((item) => item.total > 0).sort((a, b) => b.total - a.total).map((item, index) => ({ ...item, color: COLORS[index % COLORS.length] }));
}
function donutChart(items, emptyMessage, label) {
  const totals = items.filter((item) => item.total > 0);
  const total = totals.reduce((sum, item) => sum + item.total, 0);
  let angle = 0;
  const gradient = totals.map((item) => { const start = angle; angle += item.total / total * 360; return `${item.color} ${start}deg ${angle}deg`; }).join(", ") || "#e7eeeb 0deg 360deg";
  return `<div class="donut-layout"><div class="donut${total ? "" : " is-empty"}" role="img" aria-label="${escapeHtml(label)}，总额${money(total)}" style="background:conic-gradient(${gradient})"><span>${money(total)}</span></div><div class="legend">${totals.length ? totals.map((item) => `<div class="legend-row"><span class="legend-label"><i class="dot" style="background:${item.color}"></i>${escapeHtml(item.category)}</span><strong>${money(item.total)} · ${Math.round(item.total / total * 100)}%</strong></div>`).join("") : `<span class="muted">${escapeHtml(emptyMessage)}</span>`}</div></div>`;
}
function categoryPieChart(records) { return donutChart(categoryTotals(records), "本月还没有可分析的分类支出", "分类支出占比"); }
function categoryTrendChart(records) {
  const days = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5)), 0).getDate(), categories = categoryTotals(records).slice(0, 5);
  if (!categories.length) return `<div class="report-empty">本月还没有分类趋势数据</div>`;
  const series = categories.map((item) => {
    const totals = Array.from({ length: days }, () => 0);
    records.filter((record) => String(record.major || "未分类").trim() === item.category).forEach((record) => { const day = Number(record.date.slice(8, 10)); if (day >= 1 && day <= days) totals[day - 1] += Number(record.amount) || 0; });
    return { ...item, totals };
  });
  const maximum = Math.max(...series.flatMap((item) => item.totals), 0), ticks = [1, 5, 10, 15, 20, 25, days].filter((day, index, list) => day <= days && list.indexOf(day) === index);
  const grid = [10, 50, 90, 130, 170].map((y) => `<line x1="0" y1="${y}" x2="360" y2="${y}"></line>`).join("");
  const lines = series.map((item) => `<polyline aria-label="${escapeHtml(item.category)}" points="${item.totals.map((amount, index) => `${index / Math.max(1, days - 1) * 360},${170 - amount / maximum * 160}`).join(" ")}" style="--series-color:${item.color}"></polyline>`).join("");
  return `<div class="trend-chart" role="img" aria-label="本月支出最高五类的每日折线趋势"><svg viewBox="0 0 360 180" preserveAspectRatio="none" aria-hidden="true"><g class="trend-grid">${grid}</g><g class="trend-lines">${lines}</g></svg></div><div class="trend-axis">${ticks.map((day) => `<span>${day}日</span>`).join("")}</div><div class="trend-legend">${series.map((item) => `<span><i class="dot" style="background:${item.color}"></i>${escapeHtml(item.category)} <strong>${money(item.total)}</strong></span>`).join("")}</div>`;
}
function budgetExecutionReport(records, budgets) {
  const spentByCategory = new Map(categoryTotals(records).map((item) => [item.category, item.total]));
  const categories = [...new Set([...Object.keys(CATEGORIES), ...Object.keys(budgets), ...spentByCategory.keys()])];
  const rows = categories.map((category, index) => {
    const budget = Math.max(0, Number(budgets[category]) || 0), spent = spentByCategory.get(category) || 0, remaining = budget - spent, percent = budget ? spent / budget * 100 : 0, over = budget > 0 && remaining < 0;
    return { category, budget, spent, remaining, percent, over, color: COLORS[index % COLORS.length] };
  }).sort((a, b) => Number(Boolean(b.budget)) - Number(Boolean(a.budget)) || Number(b.over) - Number(a.over) || b.spent - a.spent || a.category.localeCompare(b.category, "zh-CN"));
  return `<div class="execution-list">${rows.map((item) => `<article class="execution-row${item.over ? " is-over" : ""}"><div class="execution-head"><span class="execution-category"><i class="dot" style="background:${item.color}"></i><strong>${escapeHtml(item.category)}</strong></span><span class="execution-state">${item.budget ? (item.over ? `超支 ${money(Math.abs(item.remaining))}` : `剩余 ${money(item.remaining)}`) : "未设置预算"}</span></div><div class="execution-values"><span>预算 ${item.budget ? money(item.budget) : "--"}</span><span>支出 ${money(item.spent)}</span><strong>${item.budget ? `${Math.round(item.percent)}%` : "--"}</strong></div><div class="execution-meter${item.over ? " is-over" : ""}"><i style="width:${item.budget ? Math.min(100, item.percent) : 0}%"></i></div></article>`).join("")}</div>`;
}
function necessityPieChart(records) {
  const definitions = [{ category: "必要", color: "#1f8f78" }, { category: "可减少", color: "#e09f3e" }, { category: "非必要", color: "#d66565" }];
  const items = definitions.map((item) => ({ ...item, total: records.filter((record) => record.necessity === item.category).reduce((sum, record) => sum + (Number(record.amount) || 0), 0) }));
  return donutChart(items, "本月还没有必要性数据", "支出必要性占比");
}
function renderAnalysis() {
  const records = monthRecords(), total = records.reduce((sum, record) => sum + record.amount, 0), { account } = currentAccount(); account.budgets[selectedMonth] ||= {};
  $("#analysisView").innerHTML = `<div class="analysis-charts"><section class="panel"><div class="panel-head"><div><h2>每日支出</h2><span class="muted">${monthText(selectedMonth)}每日金额</span></div></div>${dailyBarChart(records)}</section><section class="panel"><div class="panel-head"><div><h2>分类占比</h2><span class="muted">每一类支出占比</span></div></div>${categoryPieChart(records)}</section></div><section class="panel report-panel"><div class="panel-head"><div><h2>分类趋势</h2><span class="muted">支出最高的 5 类每日变化</span></div></div>${categoryTrendChart(records)}</section><div class="analysis-charts report-row"><section class="panel"><div class="panel-head"><div><h2>预算执行</h2><span class="muted">${monthText(selectedMonth)}预算使用情况</span></div></div>${budgetExecutionReport(records, account.budgets[selectedMonth])}</section><section class="panel"><div class="panel-head"><div><h2>必要性占比</h2><span class="muted">必要、可减少与非必要</span></div></div>${necessityPieChart(records)}</section></div><section class="panel budget-panel"><div class="panel-head"><div><h2>分类预算</h2><span class="muted">${monthText(selectedMonth)}</span></div><strong>${money(total)}</strong></div><div class="category-grid">${Object.keys(CATEGORIES).map((category, index) => { const spent = records.filter((record) => record.major === category).reduce((sum, record) => sum + record.amount, 0), budget = Number(account.budgets[selectedMonth][category] || 0), percent = budget ? Math.min(100, spent / budget * 100) : 0; return `<article class="category-card"><div class="category-title"><span class="dot" style="background:${COLORS[index]}"></span><h3>${category}</h3><strong>${money(spent)}</strong></div><div class="progress"><i style="width:${percent}%"></i></div><div class="budget-row"><input type="number" inputmode="decimal" min="0" step="0.01" value="${budget || ""}" placeholder="设置月预算" data-budget="${category}"><button class="ghost-btn" data-save-budget="${category}">保存</button></div></article>`; }).join("")}</div></section>`;
  document.querySelectorAll("[data-chart-day]").forEach((button) => button.addEventListener("click", () => showToast(`${button.dataset.chartDay}日支出 ${money(button.dataset.chartTotal)}`)));
  document.querySelectorAll("[data-save-budget]").forEach((button) => button.addEventListener("click", () => saveBudget(button.dataset.saveBudget)));
}
function renderMonths() { const { account } = currentAccount(), records = account.records, savings = account.savings, incomes = account.incomes, savingsByMonth = new Map(savings.map((saving) => [saving.month, saving])), months = [...new Set(records.map((record) => record.date.slice(0, 7)).concat(savings.map((saving) => saving.month), incomes.map((income) => income.date.slice(0, 7)), selectedMonth))].sort().reverse(); $("#monthsView").innerHTML = `<section class="panel"><div class="panel-head"><div><h2>月份归档</h2><span class="muted">每月收入、支出与存款分开显示</span></div></div><div class="month-grid">${months.map((value) => { const list = records.filter((record) => record.date.slice(0, 7) === value), total = list.reduce((sum, record) => sum + record.amount, 0), incomeTotal = incomes.filter((income) => income.date.slice(0, 7) === value).reduce((sum, income) => sum + income.amount, 0), necessary = list.filter((record) => record.necessity === "必要").reduce((sum, record) => sum + record.amount, 0), saving = savingsByMonth.get(value); return `<button class="month-card${value === selectedMonth ? " selected" : ""}" data-month="${value}"><span>${monthText(value)}</span><strong>支出 ${money(total)}</strong><span class="month-income">收入 ${money(incomeTotal)}</span><span class="month-saving">存款 ${saving ? money(saving.amount) : "未记录"}</span><small>${list.length} 笔 · 必要支出 ${total ? Math.round(necessary / total * 100) : 0}%</small></button>`; }).join("")}</div></section>`; document.querySelectorAll("[data-month]").forEach((button) => button.addEventListener("click", () => { selectedMonth = button.dataset.month; setView("overview"); })); }
function openSavingDialog() {
  const saving = monthSavings();
  $("#savingDialogTitle").textContent = saving ? "修改本月存款" : "记录本月存款";
  $("#savingMonthInput").value = selectedMonth;
  $("#savingAmountInput").value = saving?.amount || "";
  $("#savingDateInput").value = saving?.date || localDateTime();
  $("#savingNoteInput").value = saving?.note || "";
  $("#savingDialog").showModal();
  setTimeout(() => $("#savingAmountInput").focus(), 100);
}
function saveSaving(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  let saving;
  try { saving = normalizeSaving({ month: form.get("month"), amount: form.get("amount"), date: form.get("date"), note: form.get("note") }); }
  catch (error) { showToast(error.message || "请输入有效的存款记录"); return; }
  const { store, account } = currentAccount(), index = account.savings.findIndex((item) => item.month === saving.month);
  if (index >= 0) account.savings[index] = saving; else account.savings.push(saving);
  account.savings.sort((a, b) => b.month.localeCompare(a.month));
  persist(store);
  selectedMonth = saving.month;
  $("#savingDialog").close();
  renderActiveView();
  showToast("本月存款已保存");
}
function openIncomeDialog(id = null) {
  const income = id ? currentAccount().account.incomes.find((item) => String(item.id) === String(id)) : null;
  editingIncomeId = income ? String(income.id) : null;
  $("#incomeDialogTitle").textContent = income ? "编辑收入" : "新增收入";
  $("#incomeDateInput").value = income?.date || localDateTime();
  $("#incomeAmountInput").value = income?.amount || "";
  $("#incomeCategoryInput").value = income?.category || "工资";
  $("#incomeNoteInput").value = income?.note || "";
  $("#incomeDialog").showModal();
  setTimeout(() => $("#incomeAmountInput").focus(), 100);
}
function saveIncome(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  let income;
  try { income = normalizeIncome({ id: editingIncomeId || undefined, date: form.get("date"), amount: form.get("amount"), category: form.get("category"), note: form.get("note") }); }
  catch (error) { showToast(error.message || "请输入有效的收入记录"); return; }
  const { store, account } = currentAccount(), index = editingIncomeId ? account.incomes.findIndex((item) => String(item.id) === editingIncomeId) : -1;
  if (index >= 0) account.incomes[index] = income; else account.incomes.push(income);
  persist(store); selectedMonth = income.date.slice(0, 7); editingIncomeId = null; $("#incomeDialog").close(); renderActiveView(); showToast(index >= 0 ? "收入已更新" : "收入已保存");
}
function deleteIncome(id) {
  if (!confirm("确定删除这条收入记录吗？")) return;
  const { store, account } = currentAccount(), index = account.incomes.findIndex((income) => String(income.id) === String(id));
  if (index < 0) return;
  account.incomes.splice(index, 1); persist(store); renderActiveView(); showToast("收入记录已删除");
}
function fillMinorCategories() { const major = $("#majorInput").value; $("#minorInput").innerHTML = CATEGORIES[major].map((minor) => `<option>${minor}</option>`).join("") + `<option value="__custom">自定义...</option>`; $("#customMinorField").classList.add("hidden"); }
function resetExpenseDialog() { editingRecordId = null; $("#expenseDialogTitle").textContent = "新增支出"; $("#saveContinueBtn").hidden = false; $("#expenseForm").reset(); fillMinorCategories(); }
function openExpenseDialog() { resetExpenseDialog(); $("#dateInput").value = localDateTime(); $("#expenseDialog").showModal(); setTimeout(() => $("#amountInput").focus(), 100); }
function openEditDialog(id) { const record = currentAccount().account.records.find((item) => String(item.id) === String(id)); if (!record) return; editingRecordId = String(id); $("#expenseDialogTitle").textContent = "编辑支出"; $("#saveContinueBtn").hidden = true; $("#dateInput").value = record.date; $("#amountInput").value = record.amount; $("#majorInput").value = record.major; fillMinorCategories(); if (CATEGORIES[record.major]?.includes(record.minor)) $("#minorInput").value = record.minor; else { $("#minorInput").value = "__custom"; $("#customMinorField").classList.remove("hidden"); $("#minorCustomInput").value = record.minor || ""; } $("#necessityInput").value = record.necessity; $("#expenseForm [name=oneTime]").checked = Boolean(record.oneTime); $("#noteInput").value = record.note || ""; $("#expenseDialog").showModal(); }
function deleteRecord(id) { if (!confirm("确定删除这条记录吗？")) return; const { store, account } = currentAccount(), index = account.records.findIndex((record) => String(record.id) === String(id)); if (index < 0) return; const [record] = account.records.splice(index, 1); account.deletedRecords.unshift({ ...record, deletedAt: new Date().toISOString() }); persist(store); renderActiveView(); showToast("记录已删除，可在最近删除中恢复"); }
function renderTrash() { const records = currentAccount().account.deletedRecords; $("#trashList").innerHTML = records.length ? `<div class="record-list">${records.map((record) => `<article class="record-row"><div class="record-main"><strong>${escapeHtml(record.major)} · ${escapeHtml(record.minor || "未分类")}</strong><small>${record.date.replace("T", " ")} · ${money(record.amount)}</small></div><button class="restore-btn" data-restore="${escapeHtml(record.id)}">恢复</button></article>`).join("")}</div>` : `<div class="empty"><strong>最近没有删除记录</strong></div>`; document.querySelectorAll("[data-restore]").forEach((button) => button.addEventListener("click", () => restoreRecord(button.dataset.restore))); }
function openTrashDialog() { renderTrash(); $("#trashDialog").showModal(); }
function restoreRecord(id) { const { store, account } = currentAccount(), index = account.deletedRecords.findIndex((record) => String(record.id) === String(id)); if (index < 0) return; const [record] = account.deletedRecords.splice(index, 1); delete record.deletedAt; account.records.push(record); persist(store); renderTrash(); showToast("记录已恢复"); }
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
  await deliverFile(new File([content], `支付记录-${localMonth()}.csv`, { type: "text/csv;charset=utf-8" }), "支付记录 CSV");
}
async function exportSavingsCsv() {
  const content = savingsCsvContent(currentAccount().account.savings);
  await deliverFile(new File([content], `每月存款-${localMonth()}.csv`, { type: "text/csv;charset=utf-8" }), "每月存款记录 CSV");
}
function savingsCsvContent(savings) {
  const headers = ["月份", "存款日期", "存款金额", "备注"];
  const rows = [...savings].sort((a, b) => b.month.localeCompare(a.month)).map((saving) => [saving.month, saving.date, saving.amount, saving.note]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
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
  const normalizeRecords = (items) => {
  const occurrences = new Map(), ids = new Set();
  return items.map((record, index) => {
    const amount = Number(String(record?.amount ?? "").replace(/[¥￥,\s]/g, ""));
    if (!record || typeof record.date !== "string" || !Number.isFinite(amount) || !(amount > 0) || typeof record.major !== "string") throw new Error(`第 ${index + 1} 条记录格式不正确`);
    // Keep the first generated ID compatible with earlier CSV imports.
    const seed = `${record.date}|${amount}|${record.major}|${record.minor || ""}|${record.note || ""}`;
    let hash = 2166136261; for (const char of seed) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    const occurrence = (occurrences.get(hash) || 0) + 1; occurrences.set(hash, occurrence);
    const id = String(record.id || `import-${hash >>> 0}${occurrence > 1 ? `-${occurrence}` : ""}`);
    if (ids.has(id)) throw new Error(`第 ${index + 1} 条记录的 ID 重复，请检查备份文件`);
    ids.add(id);
    const rawDate = String(record.date).trim().replace(/[/.]/g, "-").replace(/\s+/, "T");
    const dateMatch = rawDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T(\d{1,2})(?::(\d{1,2}))?)?/);
    if (!dateMatch) throw new Error(`第 ${index + 1} 条记录日期格式不正确`);
    const normalizedDate = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}T${String(dateMatch[4] || "00").padStart(2, "0")}:${String(dateMatch[5] || "00").padStart(2, "0")}`;
    return { id, date: normalizedDate, amount, major: record.major.slice(0, 20), minor: String(record.minor || "未分类").slice(0, 20), necessity: ["必要", "可减少", "非必要"].includes(record.necessity) ? record.necessity : "必要", oneTime: Boolean(record.oneTime), note: String(record.note || "").slice(0, 80), ...(typeof record.deletedAt === "string" ? { deletedAt: record.deletedAt } : {}) };
  });
  };
  if (source.deletedRecords !== undefined && !Array.isArray(source.deletedRecords)) throw new Error("最近删除数据格式不正确");
  return { records: normalizeRecords(source.records), budgets: normalizeBudgets(source.budgets), deletedRecords: source.deletedRecords === undefined ? undefined : normalizeRecords(source.deletedRecords), savings: normalizeSavings(source.savings), incomes: normalizeIncomes(source.incomes) };
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
function normalizeSavingsCsv(text) {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 1) throw new Error("CSV 文件没有内容");
  const headers = rows.shift().map((header) => header.trim());
  const position = (name) => headers.indexOf(name);
  if ([position("月份"), position("存款金额")].some((index) => index < 0)) throw new Error("存款 CSV 缺少月份/存款金额列");
  const savings = rows.map((row) => normalizeSaving({ id: position("ID") >= 0 ? row[position("ID")] : "", month: row[position("月份")], date: position("存款日期") >= 0 ? row[position("存款日期")] : row[position("月份")], amount: row[position("存款金额")], note: position("备注") >= 0 ? row[position("备注")] : "" }));
  return { records: [], budgets: {}, deletedRecords: [], savings };
}
function normalizeImport(text, type) {
  const trimmed = text.trimStart();
  if (type === "backup") {
    if (!trimmed.startsWith("{")) throw new Error("请选择完整备份 JSON 文件");
    return { kind: "backup", incoming: normalizeBackup(JSON.parse(text)) };
  }
  if (trimmed.startsWith("{")) throw new Error(type === "savings" ? "请选择存款记录 CSV 文件" : "请选择支付记录 CSV 文件");
  if (type === "savings") return { kind: "savings", incoming: normalizeSavingsCsv(text) };
  return { kind: "payments", incoming: normalizeCsv(text) };
}
async function importBackup() {
  const file = $("#importFileInput").files[0];
  const button = $("#importBackupBtn");
  if (!file) { setImportStatus("请先选择文件", "error"); return; }
  setImportStatus("正在读取文件…", "show"); button.disabled = true;
  try {
    const text = await file.text();
    const selectedType = $("#importTypeInput")?.value || (text.trimStart().startsWith("{") ? "backup" : "payments");
    const { kind, incoming } = normalizeImport(text, selectedType);
    const savingsCsv = kind === "savings", isCsv = kind !== "backup";
    const mode = $("#importModeInput").value;
    const replaceName = savingsCsv ? "现有存款记录" : kind === "payments" ? "现有支付记录" : "当前完整账本";
    if (mode === "replace" && !confirm(`替换会覆盖${replaceName}，确定继续吗？`)) { setImportStatus("已取消导入", "show"); return; }
    const { store, account } = currentAccount();
    let added = 0; let updated = 0;
    if (mode === "replace" && savingsCsv) {
      account.savings = incoming.savings;
      added = incoming.savings.length;
    } else if (mode === "replace") {
      store[ACCOUNT] = { records: incoming.records, budgets: isCsv ? account.budgets : incoming.budgets, deletedRecords: incoming.deletedRecords ?? account.deletedRecords, savings: isCsv ? account.savings : incoming.savings ?? account.savings, incomes: isCsv ? account.incomes : incoming.incomes ?? account.incomes };
      added = incoming.records.length;
    } else {
      if (savingsCsv) {
        const savingsByMonth = new Map(account.savings.map((saving) => [saving.month, saving]));
        incoming.savings.forEach((saving) => { if (savingsByMonth.has(saving.month)) updated += 1; else added += 1; savingsByMonth.set(saving.month, saving); });
        account.savings = [...savingsByMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
      } else {
        const recordsById = new Map(account.records.map((record) => [String(record.id), record]));
        incoming.records.forEach((record) => { if (recordsById.has(String(record.id))) updated += 1; else added += 1; recordsById.set(String(record.id), record); });
        account.records = [...recordsById.values()];
        account.deletedRecords = [...new Map([...account.deletedRecords, ...(incoming.deletedRecords || [])].map((record) => [String(record.id), record])).values()];
        Object.entries(incoming.budgets).forEach(([month, categories]) => { account.budgets[month] = { ...(account.budgets[month] || {}), ...categories }; });
        if (!isCsv) account.savings = [...new Map([...account.savings, ...(incoming.savings || [])].map((saving) => [saving.month, saving])).values()].sort((a, b) => b.month.localeCompare(a.month));
        if (!isCsv) account.incomes = [...new Map([...account.incomes, ...(incoming.incomes || [])].map((income) => [String(income.id), income])).values()];
      }
    }
    const activeIds = new Set(store[ACCOUNT].records.map((record) => String(record.id)));
    store[ACCOUNT].deletedRecords = store[ACCOUNT].deletedRecords.filter((record) => !activeIds.has(String(record.id)));
    persist(store);
    const latest = savingsCsv ? incoming.savings.map((saving) => saving.month).sort().pop() : incoming.records.map((record) => record.date.slice(0, 7)).sort().pop();
    if (latest) selectedMonth = latest;
    setView(savingsCsv ? "overview" : "records");
    setImportStatus(`${savingsCsv ? "存款" : "账单"}导入完成：新增 ${added} 条，更新 ${updated} 条`, "show");
    showToast(`${savingsCsv ? "存款" : "账单"}导入完成，共 ${savingsCsv ? incoming.savings.length : incoming.records.length} 条记录`);
    setTimeout(() => $("#dataDialog")?.close(), 1200);
  } catch (error) {
    setImportStatus(error.message || "备份文件无法读取", "error");
  } finally { button.disabled = false; }
}
function updateImportType() {
  const type = $("#importTypeInput")?.value || "payments", input = $("#importFileInput");
  if (!input) return;
  input.accept = type === "backup" ? ".json,application/json" : ".csv,text/csv";
  input.value = "";
  setImportStatus("", "hide");
}
function renderHistory() {
  const list = $("#historyList"); if (!list) return;
  const history = readHistory();
  list.innerHTML = history.length ? history.map((entry) => `<article class="history-row"><div><strong>${new Date(entry.savedAt).toLocaleString("zh-CN", { hour12: false })}</strong><small>保存前的账本版本</small></div><button type="button" class="ghost-btn" data-restore-history="${escapeHtml(entry.id)}">恢复</button></article>`).join("") : `<div class="empty compact-empty"><span>保存账本后，这里会自动保留历史版本</span></div>`;
  document.querySelectorAll("[data-restore-history]").forEach((button) => button.addEventListener("click", () => restoreHistory(button.dataset.restoreHistory)));
}
function restoreHistory(id) {
  const entry = readHistory().find((item) => item.id === id);
  if (!entry) return showToast("这个历史版本已不存在");
  let restored;
  try { restored = JSON.parse(entry.data); if (!isObject(restored)) throw new Error(); Object.values(restored).forEach((account) => normalizeBackup(account)); }
  catch { return showToast("历史版本无法读取"); }
  if (!confirm("恢复后会替换当前账本，当前版本会先自动保留。确定继续吗？")) return;
  const current = localStorage.getItem(STORAGE_KEY); if (current) saveHistorySnapshot(current);
  persist(restored); selectedMonth = localMonth(); $("#dataDialog")?.close(); setView("overview"); showToast("历史版本已恢复");
}
function openDataDialog() { updateImportType(); renderHistory(); $("#dataDialog").showModal(); }
document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$("#monthInput").addEventListener("change", (event) => { selectedMonth = event.target.value || localMonth(); renderActiveView(); });
$("#openAddBtn").addEventListener("click", openExpenseDialog); $("#closeExpenseBtn").addEventListener("click", () => { $("#expenseDialog").close(); resetExpenseDialog(); });
$("#closeIncomeBtn")?.addEventListener("click", () => { editingIncomeId = null; $("#incomeDialog")?.close(); }); $("#incomeForm")?.addEventListener("submit", saveIncome);
$("#closeSavingBtn")?.addEventListener("click", () => $("#savingDialog")?.close()); $("#savingForm")?.addEventListener("submit", saveSaving);
$("#closeTrashBtn").addEventListener("click", () => { $("#trashDialog").close(); if (activeView === "records") renderRecords(); });
$("#exportBtn").addEventListener("click", openDataDialog); $("#mobileDataBtn").addEventListener("click", openDataDialog); $("#closeDataBtn").addEventListener("click", () => $("#dataDialog").close());
$("#themeBtn").addEventListener("click", openThemeDialog); $("#mobileThemeBtn").addEventListener("click", openThemeDialog); $("#closeThemeBtn").addEventListener("click", () => $("#themeDialog").close()); document.querySelectorAll("[data-theme-choice]").forEach((button) => button.addEventListener("click", () => { applyTheme(button.dataset.themeChoice); showToast("外观已切换"); }));
$("#saveBrandBtn")?.addEventListener("click", saveBrand);
$("#brandNameInput")?.addEventListener("input", () => { const status = $("#brandSaveStatus"); if (status) status.hidden = true; });
$("#importTypeInput")?.addEventListener("change", updateImportType);
$("#downloadCsvBtn").addEventListener("click", exportCsv); $("#downloadSavingsCsvBtn")?.addEventListener("click", exportSavingsCsv); $("#downloadBackupBtn").addEventListener("click", exportBackup); $("#importBackupBtn").addEventListener("click", importBackup);
$("#majorInput").innerHTML = Object.keys(CATEGORIES).map((category) => `<option>${category}</option>`).join(""); $("#majorInput").addEventListener("change", fillMinorCategories); $("#minorInput").addEventListener("change", (event) => $("#customMinorField").classList.toggle("hidden", event.target.value !== "__custom"));
$("#expenseForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget), amount = Number(form.get("amount"));
  if (!(amount > 0)) return showToast("请输入有效金额");
  const minor = form.get("minor") === "__custom" ? $("#minorCustomInput").value.trim() : form.get("minor");
  if (!minor) return showToast("请输入小类名称");
  const keepOpen = event.submitter?.dataset.saveAction === "continue" && !editingRecordId;
  const { store, account } = currentAccount();
  const record = { id: editingRecordId || crypto.randomUUID?.() || String(Date.now()), date: form.get("date"), amount, major: form.get("major"), minor, necessity: form.get("necessity"), oneTime: form.get("oneTime") === "on", note: form.get("note").trim() };
  const editIndex = editingRecordId ? account.records.findIndex((item) => String(item.id) === editingRecordId) : -1;
  if (editIndex >= 0) account.records[editIndex] = record; else account.records.push(record);
  const wasEditing = editIndex >= 0;
  persist(store);
  renderActiveView();
  if (keepOpen) {
    $("#dateInput").value = localDateTime();
    $("#amountInput").value = "";
    $("#noteInput").value = "";
    $("#expenseForm [name=oneTime]").checked = false;
    showToast("已保存，可以继续记账");
    setTimeout(() => $("#amountInput").focus(), 50);
    return;
  }
  resetExpenseDialog();
  $("#expenseDialog").close();
  showToast(wasEditing ? "记录已更新" : "记录已保存");
});
applyTheme(savedTheme()); applyBrand(savedBrand()); fillMinorCategories();
try { const { store } = currentAccount(); setView("overview"); persist(store); }
catch (error) { if (error instanceof LedgerStorageError) storageNotice(error.message); else throw error; }
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", async () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    const hasPendingEdits = () => Boolean(document.querySelector("dialog[open]")) || [...document.querySelectorAll("[data-budget]")].some((input) => input.value !== input.defaultValue) || document.activeElement?.matches("input, textarea, select");
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController) return;
      if (!hasPendingEdits()) location.reload();
      else $("#updateAppBtn").hidden = false;
    });
    $("#updateAppBtn").addEventListener("click", () => { if (hasPendingEdits()) showToast("请先保存正在编辑的内容，再更新应用"); else location.reload(); });
    const updateApp = async () => {
      try {
        const version = await latestAppVersion();
        const registration = await navigator.serviceWorker.register(`sw.js?v=${version}`, { updateViaCache: "none" });
        await registration.update().catch(() => {});
      } catch { /* The ledger remains usable when offline or service workers are unavailable. */ }
    };
    await updateApp();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") updateApp(); });
  });
}
