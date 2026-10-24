// ListsMixin: methods of the panel element, mixed into the class in 99-register.js.
const VIEWS_KEY = "ha_housekeeper.views";
const VIEWS_LIMIT = 10;
const DENSE_LISTS_KEY = "ha_housekeeper.dense_lists";
const DENSE_LIST_ID = /^[\w:.-]{1,80}$/, DENSE_LISTS_MAX = 80; // any list that offers compact rows
const DENSE_LEGACY_IDS = ["unreferenced", "batteries", "runs"];

// Lists whose export has a guided dialog next to the CSV download.
const GUIDED_EXPORT_LISTS = ["inventory"];

class ListsMixin {

  // Shared list controls: per-list search, filters and sort kept in this.lv[id].
  // The sort and the filters of a list come back at the next visit (this browser only); the search text does not.
  lvState(id, sort, dir) {
    if (this.lv[id]) return this.lv[id];
    const kept = this.lvStored()[id];
    const ok = kept && typeof kept.sort === "string" && (kept.dir === "asc" || kept.dir === "desc");
    const pending = this._lfPending?.[id];
    if (pending) delete this._lfPending[id];
    return (this.lv[id] = { q: "", sort: ok ? kept.sort : sort, dir: ok ? kept.dir : dir, f: pending ? pending : ok && kept.f && typeof kept.f === "object" ? Object.fromEntries(Object.entries(kept.f).filter(([, v]) => typeof v === "string")) : {}, view: "", base: { sort, dir } });
  }

  lvStored() {
    if (this._lvStored) return this._lvStored;
    let stored = {};
    try { stored = JSON.parse(globalThis.localStorage?.getItem("ha_housekeeper.lv") || "{}"); } catch (_) { stored = {}; }
    return (this._lvStored = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {});
  }

  // A jump to a list with one filter set: the search and the other filters of that list are cleared.
  // A list not shown yet takes it when it is first built (lvState).
  setListFilter(id, name, value) {
    const st = this.lv[id];
    if (!st) { (this._lfPending ||= {})[id] = { [name]: value }; return; }
    st.q = ""; st.f = { [name]: value };
    this.persistLv(id);
  }

  persistLv(id) {
    const st = this.lv[id];
    if (!st) return;
    this.lvStored()[id] = { sort: st.sort, dir: st.dir, f: Object.fromEntries(Object.entries(st.f).filter(([, v]) => v)) };
    try { globalThis.localStorage?.setItem("ha_housekeeper.lv", JSON.stringify(this._lvStored)); } catch (_) { /* kept until the page closes */ }
  }

  areaName(item) {
    const device = item.device_id ? this.findObject(`device:${item.device_id}`) : null;
    return this.findObject(`area:${item.area_id || device?.area_id}`)?.name || "";
  }

  // Filter by search text and select filters, then sort. Empty values always sort last.
  refine(id, items, { text, filters = {}, sorts, tie }) {
    const st = this.lv[id], q = st.q.trim().toLowerCase();
    const get = sorts.find(x => x.key === st.sort)?.get || sorts[0].get;
    const sign = st.dir === "desc" ? -1 : 1;
    const empty = v => v === null || v === undefined || v === "";
    const { natural, ids } = this.collators();
    const rows = items.filter(it => (!q || text(it).toLowerCase().includes(q))
      && Object.entries(st.f).every(([name, value]) => !value || !filters[name] || filters[name](it, value)))
      .map(it => ({ it, key: get(it) })); // the sort key is read once per item, not per comparison
    rows.sort((a, b) => {
      const x = a.key, y = b.key;
      if (empty(x) !== empty(y)) return empty(x) ? 1 : -1;
      const order = typeof x === "number" && typeof y === "number" ? x - y : natural.compare(String(x ?? ""), String(y ?? ""));
      return order * sign || ids.compare(String(tie(a.it)), String(tie(b.it))) * sign; // equal keys turn around with the direction too
    });
    return rows.map(row => row.it);
  }

  // A short message at the bottom of the page for small actions; it goes away by itself.
  toast(text, error = false, ms = 0) {
    const root = this.shadowRoot;
    if (!root?.querySelector || typeof document === "undefined") return;
    try {
      root.querySelector(".toast")?.remove();
      const el = document.createElement("div");
      el.className = error ? "toast bad" : "toast"; el.setAttribute("role", error ? "alert" : "status"); el.textContent = text;
      root.appendChild(el);
      setTimeout(() => el.remove(), ms || (error ? 8000 : 2600));
    } catch (_) { /* a missing message is no loss */ }
  }

  // A click that failed says so and leaves the page as it is; only a failed load replaces the page.
  // A message in a box: "err" (something failed), "warn" (check this before you go on) or "info". `text` is escaped here.
  notice(tone, text, { attrs = "" } = {}) {
    const icon = { err: "mdi:alert-circle-outline", warn: "mdi:alert-outline", info: "mdi:information-outline" }[tone] || "mdi:information-outline";
    return `<div class="notice ${tone}" role="${tone === "err" ? "alert" : "status"}" ${attrs}><ha-icon icon="${icon}"></ha-icon><span>${this.esc(text)}</span></div>`;
  }

  failed(err) {
    this.noteError("action", err);
    this.toast(this.t("actionFailed", { detail: this.errText(err) }), true);
  }

  // The last ten errors of this session, for the diagnostics: where, when and the message only.
  noteError(where, err) {
    (this._recentErrors ||= []).push({ at: new Date().toISOString(), where, message: String(err?.message || err).slice(0, 300) });
    if (this._recentErrors.length > 10) this._recentErrors.shift();
  }

  // "No matches" with a way out: clears search text and filters of that list.
  noMatches(id) {
    return `${this.t("noMatches")} <button class="btn quiet" data-lreset="${this.esc(id)}">${this.t("resetFilters")}</button>`;
  }

  // Shows only what is ticked in a list (the box is the proof before something is deleted).
  // What a selection offers (clear it, show only it, how many) appears with the first tick, as on the findings page;
  // "only the selected" stays while it is on, so the way back is there.
  // The menu behind the three dots of a row: [icon, label key, attributes] per entry; a null entry draws a line; attributes that start with href= make an external link. Nothing without entries.
  rowMenuHtml(entries) {
    const list = entries.filter((e, i, all) => e === null ? i > 0 && i < all.length - 1 && all[i - 1] !== null : true);
    if (!list.some(Boolean)) return "";
    return `<details class="rowmenu"><summary aria-label="${this.esc(this.t("rowMenu"))}"><ha-icon icon="mdi:dots-vertical"></ha-icon></summary><div class="menupop">${list.map(e => (!e ? '<hr class="menusep">' : e[2].startsWith("href=") ? `<a class="menuitem" ${e[2]} target="_blank" rel="noopener noreferrer"><ha-icon icon="${e[0]}"></ha-icon>${this.t(e[1])}</a>` : `<button type="button" class="menuitem" ${e[2]}><ha-icon icon="${e[0]}"></ha-icon>${this.t(e[1])}</button>`)).join("")}</div></details>`;
  }

  selTools(id, count, clearAttr) {
    if (!count) return this.selOnly?.[id] ? this.selOnlyButton(id, count) : "";
    return `<button class="btn quiet" ${clearAttr}>${this.t("clearSelection")}</button>${this.selOnlyButton(id, count)}<span class="selcount" role="status">${this.t("selectedCount", { count })}</span>`;
  }

  selOnlyButton(id, count) {
    const on = Boolean(this.selOnly?.[id]);
    return `<button class="btn quiet" data-sel-only="${this.esc(id)}" aria-pressed="${on}" ${count || on ? "" : "disabled"}>${this.t(on ? "showAll" : "showSelectedOnly")}</button>`;
  }

  // A range of ticks with Shift-click: from the last ticked row to this one, within the shown page.
  pickRows(key, id, checked, set, page) {
    const last = this._lastPick?.[key], list = page || [];
    const a = list.indexOf(last), b = list.indexOf(id);
    const ids = this._shift && a >= 0 && b >= 0 && last !== id ? list.slice(Math.min(a, b), Math.max(a, b) + 1) : [id];
    ids.forEach(x => (checked ? set.add(x) : set.delete(x)));
    (this._lastPick ||= {})[key] = id;
  }

  // A search box over a list that keeps its own order. The box shows from `min` items on, or while a text is set.
  searchList(id, items, text, min = 6, barOptions = {}) {
    const st = this.lvState(id, "", "asc"), q = st.q.trim().toLowerCase();
    const rows = q ? items.filter(item => text(item).toLowerCase().includes(q)) : items;
    return { rows, bar: items.length >= min || st.q ? this.listBar(id, { sorts: [], ...barOptions }) : "", none: q && !rows.length ? `<div class="emptymsg">${this.t("noMatches")}</div>` : "" };
  }

  // The line above a list that tells which filters are on and clears them: labels = texts of the filters, resetAttr = attribute of the button.
  filterNote(labels, resetAttr) {
    if (!labels.length) return "";
    return `<div class="filteron" role="status"><ha-icon icon="mdi:filter-variant"></ha-icon><span>${this.t("filterOn")}: ${labels.map(l => `<b>${this.esc(l)}</b>`).join(" · ")}</span><button class="btn quiet" ${resetAttr}>${this.t("filterReset")}</button></div>`;
  }

  // After a tile set a filter: bring the list below into view when it is off screen (it never moves a list that already shows).
  showList() {
    requestAnimationFrame(() => this.shadowRoot?.querySelector(".filteron, .listbar")?.scrollIntoView?.({ block: "nearest" }));
  }

  listBar(id, { sorts, filters = [], columns = [], dense = false, table = false, note = true }) {
    const st = this.lv[id];
    for (const f of filters) if (st.f[f.name] && !f.options.some(([v]) => v === st.f[f.name])) delete st.f[f.name]; // a kept value this list no longer offers
    (this.lvDirs ||= {})[id] = Object.fromEntries(sorts.map(x => [x.key, x.dir]));
    const selects = filters.map(f => `<select data-lf="${id}|${f.name}" aria-label="${this.esc(f.all)}"><option value="">${this.esc(f.all)}</option>${f.options.map(([v, label]) => `<option value="${this.esc(v)}" ${st.f[f.name] === v ? "selected" : ""}>${this.esc(label)}</option>`).join("")}</select>`).join("");
    const desc = st.dir === "desc";
    const sortOptions = sorts.map(x => `<option value="${x.key}" ${st.sort === x.key ? "selected" : ""}>${this.t(x.label)}${st.sort === x.key ? (desc ? " ↓" : " ↑") : ""}</option>`).join("");
    const on = filters.filter(f => st.f[f.name]).map(f => `${f.all}: ${(f.options.find(([v]) => v === st.f[f.name]) || [])[1] ?? st.f[f.name]}`);
    const noteHtml = note ? this.filterNote(on, `data-lf-set="${id}||"`) : ""; // a list with notes of its own leaves this out
    return `${noteHtml}<div class="listbar"><input type="search" data-lq="${id}" value="${this.esc(st.q)}" placeholder="${this.t("searchList")}" aria-label="${this.t("searchList")}">${selects}${sorts.length ? `<span class="sortgroup${table ? " table-sort" : ""}"><select data-ls="${id}" aria-label="${this.t("sortBy")}" title="${this.t("sortBy")}">${sortOptions}</select><button class="dirbtn" data-ld="${id}" title="${this.t(desc ? "sortDescending" : "sortAscending")}" aria-label="${this.t(desc ? "sortDescending" : "sortAscending")}"><ha-icon icon="${desc ? "mdi:sort-descending" : "mdi:sort-ascending"}"></ha-icon></button></span>` : ""}<span class="listbar-actions">${this.viewsControl(id)}${dense ? this.denseButton(id) : ""}${this.listTools(id, columns)}</span></div>`;
  }

  // Column picker and export menu of a list; both are optional. `columns` are the switchable columns: { key, label }.
  listTools(id, columns = []) {
    const open = this._colOpen === id;
    const picker = columns.length ? `<span class="colwrap"><button type="button" class="dirbtn ${open ? "on" : ""}" data-col-open="${id}" aria-expanded="${open}" title="${this.esc(this.t("colsLabel"))}" aria-label="${this.esc(this.t("colsLabel"))}"><ha-icon icon="mdi:table-column"></ha-icon></button>${open ? `<span class="colpop" role="group" aria-label="${this.esc(this.t("colsLabel"))}">${columns.map(c => `<label><span>${this.t(c.label)}</span><input type="checkbox" data-col="${id}|${c.key}" ${this.colHidden(id, c.key) ? "" : "checked"}></label>`).join("")}</span>` : ""}</span>` : "";
    return picker + this.exportMenu(id);
  }

  // Hidden columns per list, kept in this browser only.
  colState() {
    if (this._cols) return this._cols;
    let stored = {};
    try { stored = JSON.parse(globalThis.localStorage?.getItem("ha_housekeeper.cols") || "{}"); } catch (_) { stored = {}; }
    const clean = {};
    if (stored && typeof stored === "object") for (const [id, keys] of Object.entries(stored)) if (Array.isArray(keys)) clean[id] = keys.filter(k => typeof k === "string").slice(0, 20);
    return (this._cols = clean);
  }

  colHidden(id, key) { return (this.colState()[id] || []).includes(key); }

  toggleCol(id, key) {
    const state = this.colState(), list = state[id] || [];
    state[id] = list.includes(key) ? list.filter(k => k !== key) : [...list, key];
    try { globalThis.localStorage?.setItem("ha_housekeeper.cols", JSON.stringify(state)); } catch (_) { /* kept until the page closes */ }
    this.render();
  }

  // A list as CSV: every row of the current search and filters, all columns. Same formula guard as the findings export.
  downloadRows(name, header, rows) {
    const body = "\ufeff" + [header, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `ha-housekeeper-${name}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // The view registers what its export holds before it draws the list bar: { name, header, rows() }, or, for a whole page,
  // { name, title, sections: [{ name, title, header, rows }] } (see setPageExporter). A list exports the rows of its search and filters.
  exportParts(ex) { return ex.sections || [{ name: "", title: "", header: ex.header, rows: ex.rows }]; }

  exportList(id, fmt = "csv") {
    const ex = this._exporters?.[id];
    if (!ex) return;
    const st = this.lv?.[id], filtered = Boolean(!ex.sections && st && (st.q?.trim() || Object.values(st.f || {}).some(Boolean)));
    const name = filtered ? `${ex.name}-filtered` : ex.name;
    const parts = this.exportParts(ex).map(p => ({ ...p, rows: typeof p.rows === "function" ? p.rows() : p.rows }));
    if (fmt === "md") {
      const cell = v => String(v ?? "").replace(/\|/g, "\\|").replace(/\s*\r?\n\s*/g, " ");
      const table = p => [`| ${p.header.map(cell).join(" | ")} |`, `| ${p.header.map(() => "---").join(" | ")} |`, ...p.rows.map(r => `| ${r.map(cell).join(" | ")} |`)].join("\n");
      const body = parts.map(p => `${p.title ? `## ${p.title}\n\n` : ""}${table(p)}`).join("\n\n");
      this.downloadText(`${name}.md`, `${ex.title ? `# ${ex.title}\n\n` : ""}${body}\n`, "text/markdown");
    } else if (fmt === "json") {
      const objects = p => p.rows.map(r => Object.fromEntries(p.header.map((h, i) => [h, r[i] ?? null])));
      const data = ex.sections ? Object.fromEntries(parts.map(p => [p.name, objects(p)])) : objects(parts[0]);
      this.downloadText(`${name}.json`, JSON.stringify(data, null, 2), "application/json");
    } else {
      parts.forEach((p, i) => { const save = () => this.downloadRows(p.name ? `${name}-${p.name}` : name, p.header, p.rows); if (i) setTimeout(save, i * 300); else save(); });
    }
  }

  setExporter(id, name, header, rows) { (this._exporters ||= {})[id] = { name, header, rows }; }

  // A page that exports everything it shows: one section per list or table, rows as arrays or as a function.
  setPageExporter(id, name, title, sections) { (this._exporters ||= {})[id] = { name, title, sections }; }

  // Texts built for the screen carry HTML entities; a file wants the plain characters.
  plainText(text) { return String(text ?? "").replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" }[e])); }

  // The one export button of lists and pages: CSV, Markdown and JSON, and for the inventory the guided export as well.
  exportMenu(id) {
    const ex = this._exporters?.[id];
    if (!ex) return "";
    const open = this._expOpen === id, parts = this.exportParts(ex).length;
    const item = (attr, label, hint) => `<button type="button" class="expitem" role="menuitem" ${attr}><strong>${label}</strong><small>${hint}</small></button>`;
    const menu = open ? `<span class="colpop exppop" role="menu">${item(`data-exp-fmt="${id}|csv"`, this.t("xpFmtCsv"), parts > 1 ? this.t("expCsvMulti", { n: parts }) : this.t("exportCsvHint"))}${item(`data-exp-fmt="${id}|md"`, this.t("xpFmtMd"), this.t("expMdD"))}${item(`data-exp-fmt="${id}|json"`, this.t("xpFmtJson"), this.t("xpFmtJsonD"))}${GUIDED_EXPORT_LISTS.includes(id) ? item("data-exp-guided", this.t("xpGuided"), this.t("xpGuidedHint")) : ""}</span>` : "";
    return `<span class="colwrap"><button type="button" class="btn expbtn ${open ? "on" : ""}" data-exp-menu="${id}" aria-haspopup="menu" aria-expanded="${open}"><ha-icon icon="mdi:export-variant"></ha-icon>${this.t("xpButton")}<ha-icon icon="mdi:chevron-down"></ha-icon></button>${menu}</span>`;
  }

  // Tables offer compact rows (one line, no ID line), saved separately per list.
  denseLists() {
    if (this._denseLists) return this._denseLists;
    let saved = {};
    try {
      const raw = globalThis.localStorage?.getItem(DENSE_LISTS_KEY);
      saved = raw ? JSON.parse(raw) : globalThis.localStorage?.getItem("ha_housekeeper.dense") === "1" ? Object.fromEntries(DENSE_LEGACY_IDS.map(id => [id, true])) : {};
    } catch (_) { saved = {}; }
    return (this._denseLists = saved && typeof saved === "object" && !Array.isArray(saved) ? Object.fromEntries(Object.entries(saved).filter(([id, on]) => on === true && DENSE_LIST_ID.test(id)).slice(0, DENSE_LISTS_MAX)) : {});
  }

  isDenseList(id) { return this.denseLists()[id] === true; }

  toggleDenseList(id) {
    if (!DENSE_LIST_ID.test(id)) return;
    const lists = this.denseLists();
    if (lists[id]) delete lists[id]; else if (Object.keys(lists).length < DENSE_LISTS_MAX) lists[id] = true;
    try { globalThis.localStorage?.setItem(DENSE_LISTS_KEY, JSON.stringify(lists)); } catch (_) { /* kept until the page closes */ }
    this.render();
  }

  denseButton(id) {
    const on = this.isDenseList(id), label = this.t(on ? "denseOff" : "denseOn");
    return `<button type="button" class="dirbtn" data-dense="${this.esc(id)}" aria-pressed="${on}" title="${label}" aria-label="${label}"><ha-icon icon="${on ? "mdi:format-line-spacing" : "mdi:view-agenda-outline"}"></ha-icon></button>`;
  }

  // A sortable table for a list built with lvState/refine: header buttons set sort and direction, the phone shows cards.
  // columns: [{ key, label, cell(item) -> html, sortable, dir, narrow, allBox(rows) }]; narrow is a checkbox column with a fixed small width; allBox puts a box that ticks the page in its head; rowAttrs(item) adds attributes to the row.
  listTable(id, columns, rows, { rowAttrs = () => "", cls = "", after = () => "" } = {}) {
    const st = this.lv[id];
    columns = columns.filter((c, i) => !i || !this.colHidden(id, c.key));
    const head = columns.map(c => {
      const on = st.sort === c.key, sortedHere = on || c.sortKeys?.includes(st.sort);
      const inner = c.allBox ? c.allBox(rows) : c.menu ? `<span class="sr-only">${this.t(c.label)}</span>` : c.narrow ? `<ha-icon icon="mdi:checkbox-marked-outline" title="${this.esc(this.t(c.label))}"></ha-icon><span class="sr-only">${this.t(c.label)}</span>` : c.sortable === false ? this.t(c.label) : `<button type="button" class="thbtn" data-lsort="${id}|${c.key}|${c.dir || "asc"}">${this.t(c.label)}${on ? ` <span aria-hidden="true">${st.dir === "desc" ? "↓" : "↑"}</span>` : ""}</button>`;
      return `<th scope="col"${c.narrow ? ' class="selcol"' : ""} aria-sort="${sortedHere ? (st.dir === "desc" ? "descending" : "ascending") : "none"}">${c.headPrefix ? `<span class="headsel">${c.headPrefix()}${inner}</span>` : inner}${c.headSuffix ? c.headSuffix() : ""}</th>`;
    }).join("");
    const body = rows.map(item => {
      const attrs = rowAttrs(item);
      return `<tr ${attrs}>${columns.map((c, i) => `<td${c.narrow ? ' class="selcol"' : ""}${i ? ` data-label="${this.esc(this.t(c.label))}"` : ""}>${c.cell(item)}</td>`).join("")}</tr>${after(item)}`;
    }).join("");
    return `<div class="${["tablewrap", "lt", cls, this.isDenseList(id) ? "dense-list" : ""].filter(Boolean).join(" ")}"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  // A table of objects (entities, entries, automations): name with id, type when mixed, state, plus extra columns.
  // rows: [{ key: "entity:light.a", type, name, sub, tone, state, stateLabel, pill, rank, open }]; open: false makes a row that opens nothing; bar: false leaves the bar to the caller (the header still sorts); extras: [{ key, label, dir, get, cell(row) }].
  // The bar shows from `min` rows on; a row opens its object.
  // Options: menu(row) -> entries of rowMenuHtml puts the three dots in a column of their own; stripe marks the red rows at their edge;
  // sort: the first sort ("status" puts the problems on top, the names after them); statusFirst puts the state next to the name.
  objectTable(id, rows, { extras = [], min = 6, bar: withBar = true, empty = "", menu = null, stripe = false, sort = "name", statusFirst = false, tile = row => this.tile(row.type, row.tone === "ok" ? "" : row.tone) } = {}) {
    if (!rows.length) return empty ? `<div class="emptymsg">${empty}</div>` : "";
    this.lvState(id, sort, "asc");
    const types = [...new Set(rows.map(r => r.type))].sort();
    const tones = ["red", "warn", "violet", "blue", "mute", "ok"], rank = r => (r.rank ?? tones.indexOf(r.tone));
    const sorts = [
      { key: "name", label: "sortName", dir: "asc", get: r => r.name },
      ...(types.length > 1 ? [{ key: "type", label: "sortType", dir: "asc", get: r => this.t(r.type) }] : []),
      { key: "status", label: "sortStatus", dir: "asc", get: rank },
      ...extras.map(x => ({ key: x.key, label: x.label, dir: x.dir || "asc", get: x.get })),
    ];
    const filters = [
      ...(types.length > 1 ? [{ name: "type", all: this.t("allTypes"), options: types.map(x => [x, this.t(x)]) }] : []),
      { name: "state", all: this.t("objAllStatus"), options: [...new Map(rows.map(r => [r.state, r.stateLabel])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), this.lang)) },
    ];
    const st = this.lv[id];
    const bar = withBar && (rows.length >= min || st.q) ? this.listBar(id, { table: true, dense: true, sorts, filters }) : "";
    const shown = this.refine(id, rows, { text: r => [r.name, r.sub, ...extras.map(x => String(x.get(r) ?? ""))].join(" "), filters: { type: (r, v) => r.type === v, state: (r, v) => r.state === v }, sorts, tie: r => (sort === "status" ? `${r.name}\u0000${r.key}` : r.key) });
    const pg = this.paginate(id, shown);
    const stateCol = { key: "status", label: "sortStatus", dir: "asc", cell: r => r.pill };
    const columns = [
      { key: "name", label: "sortName", dir: "asc", cell: r => `<div class="statcell">${tile(r)}<div>${this.nameCell(r.name, r.sub)}</div></div>` },
      ...(statusFirst ? [stateCol] : []),
      ...(types.length > 1 ? [{ key: "type", label: "sortType", dir: "asc", cell: r => this.esc(this.t(r.type)) }] : []),
      ...extras.map(x => ({ key: x.key, label: x.label, dir: x.dir || "asc", cell: x.cell })),
      ...(statusFirst ? [] : [stateCol]),
      ...(menu && shown.some(r => this.rowMenuHtml(menu(r))) ? [{ key: "menu", label: "rowMenu", menu: true, narrow: true, sortable: false, cell: r => this.rowMenuHtml(menu(r)) }] : []),
    ];
    const tone = r => (stripe && r.tone === "red" ? ' data-rowtone="red"' : "");
    const table = shown.length ? this.listTable(id, columns, pg.rows, { cls: "objs", rowAttrs: r => (r.open === false ? 'class="static"' : `data-object="${this.esc(r.key)}" tabindex="0" role="button" aria-label="${this.esc(r.name)}"`) + tone(r) }) : `<div class="emptymsg">${this.noMatches(id)}</div>`;
    return `${bar}${table}${pg.footer}`;
  }

  // The arrow of a row that unfolds in place (a history, a detail): the look of a fold's arrow, as a button of its own; attr is the data attribute the click handler listens to.
  expandBtn(attr, key, open, label) {
    const text = this.esc(label);
    return `<span class="tile mute"><button type="button" class="chevbtn" ${attr}="${this.esc(key)}" aria-expanded="${open}" aria-label="${text}" title="${text}"><ha-icon icon="mdi:chevron-${open ? "down" : "right"}"></ha-icon></button></span>`;
  }

  // Name over id for a table cell: both are cut at the column width and shown in full in the tooltip (see showTip).
  // The one delete button of a list row: the bin only, with the name as tooltip and for screen readers. `why` disables it and says why.
  deleteButton(attr, label, { small = false, why = "" } = {}) {
    const text = this.esc(why || label);
    return `<button type="button" class="btn dangersoft delbtn${small ? " small" : ""}" ${why ? "disabled" : attr} title="${text}" aria-label="${this.esc(label)}"><ha-icon icon="mdi:delete-outline"></ha-icon></button>`;
  }

  nameCell(name, id, tag = "div", tipSub = null) {
    const sub = id || "";
    return `<${tag} class="namecell" data-tip="${this.esc(name)}" data-tip-sub="${this.esc(tipSub ?? sub)}"><strong class="cut">${this.esc(name)}</strong>${sub ? `<span class="id cut">${this.esc(sub)}</span>` : ""}</${tag}>`;
  }

  // The id line of a list row: the id in mono under the name, extra facts in a line of their own below it.
  rowId(id, extra = "") {
    return `<span class="id">${this.esc(id)}</span>${extra ? `<small>${this.esc(extra)}</small>` : ""}`;
  }

  // The date of a table cell: how long ago with the exact time in small type below (hidden in compact rows) and as a tooltip; empty when unknown.
  ageCell(iso) {
    if (!iso) return `<span class="muted">–</span>`;
    return `<span title="${this.esc(this.formatDate(iso))}">${this.esc(this.relTime(iso))}</span><small class="agestamp">${this.esc(this.formatDate(iso))}</small>`;
  }

  // Saved list views: search text, filters and sort under a name, kept in this browser only.
  viewsStore() {
    if (this._views) return this._views;
    let stored = {};
    try { stored = JSON.parse(globalThis.localStorage?.getItem(VIEWS_KEY) || "{}"); } catch (_) { stored = {}; }
    const clean = {};
    if (stored && typeof stored === "object") {
      for (const [id, list] of Object.entries(stored)) {
        if (!Array.isArray(list)) continue;
        clean[id] = list.filter(v => v && typeof v.name === "string" && v.name && typeof v.q === "string" && v.f && typeof v.f === "object" && typeof v.sort === "string" && (v.dir === "asc" || v.dir === "desc"))
          .slice(0, VIEWS_LIMIT).map(v => ({ name: v.name.slice(0, 40), q: v.q, f: Object.fromEntries(Object.entries(v.f).filter(([, x]) => typeof x === "string")), sort: v.sort, dir: v.dir }));
      }
    }
    return (this._views = clean);
  }

  persistViews() {
    try { globalThis.localStorage?.setItem(VIEWS_KEY, JSON.stringify(this._views || {})); } catch (_) { /* a private window: the views last until the page closes */ }
  }

  viewsControl(id) {
    const st = this.lv[id], saved = this.viewsStore()[id] || [];
    // Worth saving when the search, a filter, the sort or its direction differs from the chosen view, or from the list's own default.
    const shape = (q, f, sort, dir) => JSON.stringify([q.trim(), Object.entries(f).filter(([, v]) => v).sort(([a], [b]) => (a < b ? -1 : 1)), sort, dir]);
    const view = saved.find(v => v.name === st.view);
    const dirty = shape(st.q, st.f, st.sort, st.dir) !== (view ? shape(view.q, view.f, view.sort, view.dir) : shape("", {}, st.base?.sort ?? st.sort, st.base?.dir ?? st.dir));
    if (!saved.length && !dirty) return "";
    if (this.viewNaming === id) {
      return `<span class="colwrap viewwrap"><button type="button" class="dirbtn on" data-lview-cancel="${id}" aria-expanded="true" title="${this.esc(this.t("cancelRun"))}" aria-label="${this.esc(this.t("cancelRun"))}"><ha-icon icon="mdi:star-outline"></ha-icon></button><form class="viewform" data-lview-form="${id}"><strong>${this.t("viewSave")}</strong><label for="view-name-${id}">${this.t("viewName")}</label><input id="view-name-${id}" data-lview-name="${id}" maxlength="40" autocomplete="off" value="${this.esc(this.viewDraft)}" placeholder="${this.esc(this.t("viewName"))}"><small>${this.t("viewLocalHint")}</small><span class="viewform-actions"><button type="button" class="btn quiet" data-lview-cancel="${id}">${this.t("cancelRun")}</button><button type="submit" class="btn accent">${this.t("viewSave")}</button></span></form></span>`;
    }
    const save = `<button type="button" class="viewitem" data-lview-save="${id}"><ha-icon icon="mdi:star-plus-outline"></ha-icon>${this.t("viewSave")}</button>`;
    // Nothing saved yet: the star is the save button itself.
    if (!saved.length) return `<button type="button" class="dirbtn" data-lview-save="${id}" title="${this.esc(this.t("viewSave"))}" aria-label="${this.esc(this.t("viewSave"))}"><ha-icon icon="mdi:star-outline"></ha-icon></button>`;
    const open = this._viewOpen === id, name = view ? view.name : "";
    const item = v => `<span class="viewrow"><button type="button" class="viewitem ${v.name === name ? "on" : ""}" data-lview-pick="${id}" data-name="${this.esc(v.name)}" ${v.name === name ? 'aria-current="true"' : ""}>${this.esc(v.name)}</button><button type="button" class="viewdel" data-lview-delete="${id}" data-name="${this.esc(v.name)}" title="${this.esc(this.t("viewDelete"))}" aria-label="${this.esc(this.t("viewDelete"))}: ${this.esc(v.name)}"><ha-icon icon="mdi:delete-outline"></ha-icon></button></span>`;
    const pop = open ? `<span class="colpop viewpop" role="group" aria-label="${this.esc(this.t("viewsLabel"))}">${saved.map(item).join("")}${name ? `<button type="button" class="viewitem" data-lview-pick="${id}" data-name="">${this.t("viewsClear")}</button>` : ""}${dirty ? save : ""}</span>` : "";
    return `<span class="colwrap"><button type="button" class="dirbtn ${name ? "withname" : ""} ${open || name ? "on" : ""}" data-lview-open="${id}" aria-expanded="${open}" title="${this.esc(this.t("viewsLabel"))}" aria-label="${this.esc(this.t("viewsLabel"))}${name ? `: ${this.esc(name)}` : ""}"><ha-icon icon="${name ? "mdi:star" : "mdi:star-outline"}"></ha-icon>${name ? `<span class="viewname">${this.esc(name)}</span>` : ""}</button>${pop}</span>`;
  }

  applyView(id, name) {
    const st = this.lv[id], view = (this.viewsStore()[id] || []).find(v => v.name === name);
    st.view = view ? view.name : ""; this._viewOpen = "";
    if (view) { st.q = view.q; st.f = { ...view.f }; st.sort = view.sort; st.dir = view.dir; }
    this.pages = {}; this.render();
  }

  // Naming a view happens in a small inline form (name, save, cancel), not in a browser prompt.
  saveView(id) {
    this.viewNaming = id; this._viewOpen = ""; this.viewDraft = this.lv[id].view || "";
    this.render();
    this.shadowRoot?.querySelector?.(`[data-lview-name="${id}"]`)?.focus?.();
  }

  cancelView(id) {
    this.viewNaming = null;
    this.render();
    this.shadowRoot?.querySelector?.(`[data-lview-save="${id}"], [data-lview-open="${id}"]`)?.focus?.();
  }

  commitView(id, text) {
    const st = this.lv[id], name = String(text || "").trim().slice(0, 40);
    if (!name) return;
    const store = this.viewsStore(), list = (store[id] ||= []);
    const view = { name, q: st.q, f: Object.fromEntries(Object.entries(st.f).filter(([, v]) => v)), sort: st.sort, dir: st.dir };
    const at = list.findIndex(v => v.name === name);
    // A full list never loses a saved view silently: the form stays open until one is deleted or a name is reused.
    if (at < 0 && list.length >= VIEWS_LIMIT) { this.toast(this.t("viewsFull", { n: VIEWS_LIMIT }), true); return; }
    if (at >= 0) list[at] = view; else list.push(view);
    st.view = name; this.viewNaming = null; this.persistViews(); this.render();
    this.shadowRoot?.querySelector?.(`[data-lview-save="${id}"], [data-lview-open="${id}"]`)?.focus?.();
  }

  deleteView(id, name = this.lv[id]?.view) {
    const st = this.lv[id], store = this.viewsStore();
    store[id] = (store[id] || []).filter(v => v.name !== name);
    if (st.view === name) st.view = "";
    this.persistViews(); this.render();
  }

  // Long explanations of how a number is counted fold away, so the lists end earlier.
  howCounted(key, vars) {
    return `<details class="howto"><summary>${this.t("howCounted")}</summary><p class="factnote">${this.t(key, vars)}</p></details>`;
  }

  // Hands a text to the browser as a download.
  downloadText(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
    const a = document.createElement("a");
    a.href = url; a.download = `ha-housekeeper-${name}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Shared paging for long lists: returns the visible slice and the footer markup.
  // `own` gives a short list its own page sizes (the first is the default, kept per list) instead of the global setting.
  paginate(id, items, own) {
    const size = own ? (this.listSizes?.[id] || own[0]) : this.pageSize;
    const count = Math.max(1, Math.ceil(items.length / size));
    const page = Math.min(Math.max(1, this.pages[id] || 1), count);
    this.pages[id] = page;
    const from = (page - 1) * size;
    const rows = items.slice(from, from + size);
    if (items.length <= (own ? own[0] : 20)) return { rows, footer: "" };
    return { rows, footer: this.pageFooter(id, { page, count, from, shown: rows.length, total: items.length, size, own }) };
  }

  // The bar below a paged list: which rows of how many, the page size, and the way to the other pages.
  pageFooter(id, { page, count, from, shown, total, size, own }) {
    const sizes = (own || PAGE_SIZES).map(n => `<option value="${n}" ${n === size ? "selected" : ""}>${n}</option>`).join("");
    return `<div class="tablefoot" data-lpage-footer="${this.esc(id)}" data-page-count="${count}"><span>${this.formatNumber(from + 1)}–${this.formatNumber(from + shown)} ${this.t("of")} ${this.formatNumber(total)} · ${this.t("perPage")} <select ${own ? `data-lpagesize="${this.esc(id)}"` : "data-pagesize"} aria-label="${this.t("perPage")}">${sizes}</select></span>${count > 1 ? `<span class="pager"><button data-lpage="${id}|${page - 1}" ${page === 1 ? "disabled" : ""}>${this.t("previous")}</button> ${this.t("page")} ${page} ${this.t("of")} ${count} <button data-lpage="${id}|${page + 1}" ${page === count ? "disabled" : ""}>${this.t("next")}</button></span>` : ""}</div>`;
  }

  // A fold: the head always shows, the body only while open. `def` is the state until the person toggles it.
  // head: { tone, title, sub, pill, count }; the state lives in this.folds and survives a render.
  foldOpen(id, def) { return this.folds?.[id] ?? def; }

  // The size of the current view at the right end of a selection row: what the filters and search leave over.
  viewCount(n) { return `<span class="viewcount" role="status">${this.t("viewCount", { n: this.formatNumber(n) })}</span>`; }

  fold(id, head, body, def, force) {
    const open = force ?? this.foldOpen(id, def);
    const pill = `${head.count ? `<span class="pill mute">${this.esc(head.count)}</span>` : ""}${head.pill ? `<span class="pill ${head.tone || "mute"}">${this.esc(head.pill)}</span>` : ""}`;
    const top = `<button class="row foldhead" data-fold="${this.esc(id)}" aria-expanded="${open}"><span class="tile ${head.tone || "mute"}"><ha-icon icon="mdi:${open ? "chevron-down" : "chevron-right"}"></ha-icon></span><span class="row-text"><strong>${head.title}</strong>${head.sub ? `<small>${this.esc(head.sub)}</small>` : ""}</span>${head.meter || ""}${pill}</button>`;
    return `<div class="fold${open ? " open" : ""}">${top}${open ? `<div class="foldbody">${body}</div>` : ""}</div>`;
  }
}
