// SystemMixin: the pages "Storage & system", "Access & data flow" and "Credentials" under Operation and Security; mixed in by 99-register.js.
// All three only read. A page loads on its first visit; its refresh button reads again.
// A page and the WebSocket command it asks.
const SYS_COMMANDS = { storage: "system_usage", dataflow: "access", secrets: "sensitive_fields", flows: "open_flows", hacs: "hacs_repositories" };
// What a tile of the credentials page opens: [tab, list, state filter]; "" clears the filters.
const SEC_SHOWS = { "": ["entries", "seclist", ""], gap: ["entries", "seclist", "gap"], reauth: ["entries", "seclist", "reauth"], disabled: ["entries", "seclist", "disabled"], nomfa: ["accounts", "secusers", "nomfa"], tokens: ["tokens", "sectokens", ""] };
const SYS_WARN_PERCENT = 75, SYS_RED_PERCENT = 90;

class SystemMixin {
  sysState(name) {
    return ((this._sys ||= {})[name] ||= { data: null, loading: false, error: "", requested: false, at: null });
  }

  // `fresh` is the refresh button: the server then reads the folders and the disk use again, unless it did a moment ago.
  // `quick` (opening the storage page): the server answers at once with the sizes it kept, however old;
  // when it says they are `stale`, the page asks once more and shows the new ones when they are in.
  async sysLoad(name, fresh = false, quick = !fresh) {
    const st = this.sysState(name);
    st.loading = true; st.error = ""; st.requested = true; this.render();
    const extra = name !== "storage" ? {} : fresh ? { fresh: true } : quick ? { quick: true } : {};
    try {
      st.data = await this._hass.callWS({ type: `ha_housekeeper/${SYS_COMMANDS[name]}`, ...extra });
      // The sizes carry the time they were read; the rest of the page is live.
      st.at = (name === "storage" && st.data?.read_at) || new Date().toISOString();
    } catch (err) { st.error = this.errText(err); }
    st.loading = false;
    this.render();
    if (extra.quick && st.data?.stale) return this.sysLoad(name, false, false);
  }

  // Loads on the first visit only; later visits show what was read until the person refreshes.
  sysEnsure(name) {
    const st = this.sysState(name);
    if (!st.loading && !st.requested) { st.requested = true; setTimeout(() => this.sysLoad(name), 0); }
    return st;
  }

  // The introduction sits behind an (i) after the title instead of in a paragraph of its own.
  // `warn` colours it in the tone of the "can change" label: for a promise about what is changed.
  infoTip(text, warn = false) {
    return `<button type="button" class="infotip${warn ? " warn" : ""}" data-tip="${this.esc(text)}" data-tip-plain="1" aria-label="${this.esc(text)}"><ha-icon icon="mdi:information-outline"></ha-icon></button>`;
  }

  // Loading, error or the page: the frame every one of the three pages shares. build(data, bar) puts the bar on top.
  sysFrame(name, loading, build, left = () => "") {
    const st = this.sysEnsure(name);
    const bar = this.pageBar({ left: st.data ? left(st.data) : "", at: st.at, loading: st.loading, attr: `data-sys-refresh="${name}"` });
    if (st.error) return `<div class="stack">${bar}<div class="panel">${this.notice("err", st.error)}</div></div>`;
    if (!st.data) return `<div class="stack">${bar}<div class="panel">${this.skeleton(loading)}</div></div>`;
    return build(st.data, bar);
  }

  sysTone(percent) {
    if (percent === null || percent === undefined) return "mute";
    return percent >= SYS_RED_PERCENT ? "red" : percent >= SYS_WARN_PERCENT ? "warn" : "ok";
  }

  sysPercent(value) {
    return value === null || value === undefined ? "–" : `${this.formatNumber(Math.round(value * 10) / 10)} %`;
  }

  // A thin bar under a key figure.
  sysMeter(percent) {
    if (percent === null || percent === undefined) return "";
    const width = Math.max(0, Math.min(100, Number(percent) || 0));
    return `<span class="sysmeter ${this.sysTone(percent)}" role="img" aria-label="${this.esc(this.sysPercent(percent))}"><i style="width:${width}%"></i></span>`;
  }

  // The line of one figure over the last days (column of a history point: 1 disk, 2 RAM, 3 CPU, 4 swap); the CPU also
  // shows its highest value. Under an hour of samples there is no line yet.
  sysLine(history, column) {
    const rows = (history?.points || []).filter(p => Number.isFinite(p[column]));
    if (rows.length < 3 || (history?.span || 0) < 3600) return `<span class="spark-hint">${this.t("sysLineBuilding")}</span>`;
    const values = rows.map(p => p[column]), n = values.length, w = 200, h = 36, pad = 4;
    let lo = Math.min(...values), hi = Math.max(...values);
    if (hi - lo < 10) { const mid = (hi + lo) / 2; lo = Math.max(0, mid - 5); hi = lo + 10; }
    const x = i => pad + ((w - 2 * pad) * i) / (n - 1), y = v => h - pad - ((h - 2 * pad) * (v - lo)) / (hi - lo);
    const hours = Math.round(history.span / 3600), days = Math.round(history.span / 86400);
    const span = hours < 48 ? this.t("sysLineHours", { n: this.formatNumber(hours) }) : this.t("sysLineDays", { n: this.formatNumber(days) });
    const peak = column === 3 ? Math.max(...rows.map(p => p[5] ?? 0)) : null;
    const cap = [span, peak ? this.t("sysLinePeak", { n: this.sysPercent(peak) }) : ""].filter(Boolean).join(" · ");
    const label = this.t("sysLineLabel", { span, from: this.sysPercent(values[0]), to: this.sysPercent(values[n - 1]) });
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${this.esc(label)}"><polyline fill="none" stroke="var(--hk-muted)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" points="${values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/><line class="spark-end sys-spark-end" x1="${x(n - 1).toFixed(1)}" y1="${y(values[n - 1]).toFixed(1)}" x2="${x(n - 1).toFixed(1)}" y2="${y(values[n - 1]).toFixed(1)}"/></svg><span class="spark-cap">${this.esc(cap)}</span>`;
  }

  // The share of a row against the largest one of its list, as a bar.
  sysShare(value, max) {
    const width = max > 0 && value > 0 ? Math.max(1, Math.round((value / max) * 100)) : 0;
    return `<span class="sysshare" role="img" aria-label="${width} %"><i style="width:${width}%"></i></span>`;
  }

  // One sortable, searchable list with paging and CSV export: the way every list of Housekeeper works.
  // opt: { sort, dir, sorts, text, tie, filters, filterFns, columns, exportName, header, rows, empty, cls, rowAttrs }
  sysList(id, items, opt) {
    this.lvState(id, opt.sort, opt.dir || "asc");
    if (opt.exportName) this.setExporter(id, opt.exportName, opt.header, () => refined.map(opt.rows));
    const bar = items.length >= 6 || this.lv[id].q || Object.values(this.lv[id].f).some(Boolean) ? this.listBar(id, { table: true, dense: true, sorts: opt.sorts, filters: opt.filters || [] }) : "";
    const refined = this.refine(id, items, { text: opt.text, filters: opt.filterFns || {}, sorts: opt.sorts, tie: opt.tie });
    const pg = this.paginate(id, refined, opt.pageSizes);
    this.lv[id].shown = refined.length;
    const table = refined.length
      ? this.listTable(id, opt.columns, pg.rows, { cls: opt.cls || "", rowAttrs: opt.rowAttrs || (() => 'class="static"'), ...(opt.after ? { after: opt.after } : {}) })
      : `<div class="emptymsg">${items.length ? this.noMatches(id) : `<ha-icon icon="mdi:check-circle-outline"></ha-icon>${this.t(opt.empty)}`}</div>`;
    return `${bar}${table}${pg.footer}`;
  }

  // ---------------------------------------------------------------- Storage & system

  storageView() {
    return this.sysFrame("storage", "sysLoading", (r, head) => {
      const disk = r.disk || {}, ram = r.ram || {}, cpu = r.cpu || {}, swap = r.swap || {}, load = r.load;
      const of = (used, total) => this.esc(this.t("sysOf", { used: this.formatBytes(used), total: this.formatBytes(total) }));
      const ramSub = [ram.total ? of(ram.used, ram.total) : "", r.apps_memory ? this.esc(this.t("sysAppsRam", { n: this.formatBytes(r.apps_memory) })) : ""].filter(Boolean).join(" · ");
      const cpuSub = [cpu.count ? this.esc(this.t("sysCores", { n: cpu.count })) : "", load ? this.esc(this.t("sysLoad", { a: this.formatNumber(load["1m"]), b: this.formatNumber(load["5m"]), c: this.formatNumber(load["15m"]) })) : ""].filter(Boolean).join(" · ");
      const diskSub = disk.total ? [of(disk.used, disk.total), disk.free !== undefined && disk.free !== null ? this.esc(this.t("sysFree", { n: this.formatBytes(disk.free) })) : ""].filter(Boolean).join(" · ") : this.esc(this.t("sysUnknown"));
      const tiles = this.sumTiles([
        { label: this.t("sysDiskUsed"), value: this.esc(this.sysPercent(disk.percent)), sub: diskSub, hint: disk.source ? this.t(`sysSrc_${disk.source}`) : "", tone: this.sysTone(disk.percent), spark: `${this.sysMeter(disk.percent)}${this.sysLine(r.history, 1)}` },
        { label: this.t("sysRam"), value: this.esc(this.sysPercent(ram.percent)), sub: ramSub || this.esc(this.t("sysUnknown")), tone: this.sysTone(ram.percent), spark: `${this.sysMeter(ram.percent)}${this.sysLine(r.history, 2)}` },
        { label: this.t("sysCpu"), value: this.esc(this.sysPercent(cpu.percent)), sub: cpuSub || this.esc(this.t("sysUnknown")), tone: this.sysTone(cpu.percent), spark: `${this.sysMeter(cpu.percent)}${this.sysLine(r.history, 3)}` },
        swap.total ? { label: this.t("sysSwapLabel"), value: this.esc(this.sysPercent(swap.percent)), sub: of(swap.used, swap.total), hint: this.t("sysSwapHint"), tone: "mute", spark: `${this.sysMeter(swap.percent)}${this.sysLine(r.history, 4)}` } : null,
      ]);
      const cats = r.categories?.children || [];
      const sup = Boolean(r.supervisor) && cats.length > 0;
      const miss = r.cards.some(c => c.status === "missing");
      const chips = [
        ...(sup ? [["category", "sysByCategory", cats.length]] : []),
        ["folder", "sysByFolder", r.breakdown.length],
        ["misc", "sysByMisc", r.cards.length + r.blueprints.length + (r.other || []).length + (r.other_rest?.count || 0)],
      ];
      const tabs = chips.map(([id, key, n]) => ({ id, label: this.t(key), count: n, tone: id === "misc" && miss ? "red" : "" }));
      const by = this.viewTabOf("storage", tabs, chips[0][0]);
      const choice = this.viewTabBar("storage", tabs, by);
      const title = key => `<h3 class="syssec">${this.esc(this.t(key))}</h3>`;
      const apps = `<p class="factnote">${this.t("sysAppsHint")} <button type="button" class="link" data-view="components">${this.t("components")}</button></p>`;
      const list = by === "misc" ? this.sysMisc(r) : `${title(by === "category" ? "sysHeadCategory" : "sysHeadFolder")}${by === "category" ? this.sysCategories(cats, r.categories?.used) : this.sysConsumers(r.breakdown)}${apps}`;
      const cut = r.truncated ? `<p class="factnote">${this.esc(this.t("sysTruncated"))}</p>` : "";
      return `<div class="stack">${head}${tiles}<div class="panel">${choice}${cut}${list}${this.howCounted("sysFootnote")}</div></div>`;
    });
  }

  sysSizeColumns(max) {
    return [
      { key: "size", label: "sysColSize", dir: "desc", cell: x => (x.bytes === null || x.bytes === undefined ? `<span class="muted">${this.t("sysExternal")}</span>` : this.esc(this.formatBytes(x.bytes))) },
      { key: "share", label: "sysColShare", sortable: false, cell: x => this.sysShare(x.bytes || 0, max) },
    ];
  }

  sysBySize() { return [{ key: "size", label: "sysColSize", dir: "desc", get: x => x.bytes ?? null }]; }

  // The categories of the disk in words, with the name the system gives them below; the share is against the space
  // in use, as bar and number, like the tables of the database.
  sysCategories(cats, used = cats.reduce((sum, c) => sum + (c.bytes || 0), 0)) {
    const max = Math.max(0, ...cats.map(c => c.bytes));
    const label = c => { const key = `sysCat_${c.id}`, text = this.t(key); return text === key ? c.label : text; };
    const share = c => (used ? Math.round((c.bytes || 0) / used * 100) : 0);
    return this.sysList("syscat", cats, {
      sort: "size", dir: "desc", sorts: [...this.sysBySize(), { key: "name", label: "sysColCategory", dir: "asc", get: label }],
      text: c => `${label(c)} ${c.label} ${c.id}`, tie: c => c.id, empty: "sysNoCategories",
      columns: [
        { key: "name", label: "sysColCategory", cell: c => this.nameCell(label(c), label(c) !== c.label ? c.label : "") },
        this.sysSizeColumns(max)[0],
        { key: "share", label: "sysColShare", sortable: false, cell: c => `<span class="dbshare">${this.sysShare(c.bytes || 0, used)}<b>${this.esc(`${this.formatNumber(share(c))} %`)}</b></span>` },
      ],
      exportName: "storage-categories", header: [this.t("sysColCategory"), "ID", "Bytes", "%"], rows: c => [label(c), c.id, c.bytes, share(c)],
    });
  }


  sysConsumers(items) {
    const max = Math.max(0, ...items.map(x => x.bytes));
    const name = x => this.t(`sysTarget_${x.id}`);
    return this.sysList("syscons", items, {
      sort: "size", dir: "desc", sorts: [...this.sysBySize(), { key: "name", label: "sysColPlace", dir: "asc", get: name }],
      text: x => `${name(x)} ${x.path}`, tie: x => x.id, empty: "sysNoConsumers",
      columns: [{ key: "name", label: "sysColPlace", cell: x => this.nameCell(name(x), `/config/${x.path}`) }, ...this.sysSizeColumns(max)],
      exportName: "storage-consumers", header: [this.t("sysColPlace"), "Path", "Bytes"], rows: x => [name(x), `/config/${x.path}`, x.bytes],
    });
  }

  // The load of an app as the Supervisor measured it, for the two app lists.
  sysAppRam(a) { return a.memory_usage === null || a.memory_usage === undefined ? "–" : `${this.formatBytes(a.memory_usage)}${a.memory_limit ? ` / ${this.formatBytes(a.memory_limit)}` : ""}`; }

  sysAppCpu(a) { return a.cpu_percent === null || a.cpu_percent === undefined ? "–" : `${this.formatNumber(Math.round(a.cpu_percent * 10) / 10)} %`; }

  cardStatus(c) {
    const tone = { missing: "red", unused: "warn", used: "ok" }[c.status] || "mute";
    const names = (c.elements || []).join(", ");
    return `<span class="pill ${tone}" title="${this.esc(this.t(`cardStatusHint_${c.status}`) + (names ? ` (${names})` : ""))}">${this.t(`cardStatus_${c.status}`)}</span>`;
  }

  sysCards(cards) {
    const max = Math.max(0, ...cards.map(c => c.bytes || 0));
    const file = c => (String(c.url).split("?")[0].split("/").filter(Boolean).pop() || c.url);
    const cols = this.sysSizeColumns(max);
    cols[0] = { ...cols[0], cell: c => (c.bytes === null || c.bytes === undefined ? `<span class="muted">${this.t("sysExternal")}</span>` : `${this.esc(this.formatBytes(c.bytes))}${c.scope === "folder" ? ` <span class="pill mute" title="${this.esc(this.t("sysFolderHint"))}">${this.t("sysFolder")}</span>` : ""}`) };
    return this.sysList("syscards", cards, {
      sort: "size", dir: "desc", sorts: [...this.sysBySize(), { key: "name", label: "sysColUrl", dir: "asc", get: file }],
      text: c => `${c.url} ${c.type}`, tie: c => c.url, empty: "sysNoCards",
      columns: [{ key: "name", label: "sysColUrl", cell: c => this.nameCell(file(c), c.url) }, { key: "type", label: "sysColType", sortable: false, cell: c => `<span class="pill mute">${this.esc(c.type || "–")}</span>` }, { key: "status", label: "sysColState", sortable: false, cell: c => this.cardStatus(c) }, ...cols],
      exportName: "storage-custom-cards", header: [this.t("sysColUrl"), this.t("sysColType"), this.t("sysColState"), "Bytes"], rows: c => [c.url, c.type, c.status, c.bytes ?? ""],
    });
  }

  // Everything that is not a place of its own: the dashboard cards, the blueprints and the other entries under /config.
  sysMisc(r) {
    const part = (title, body, count, index) => this.fold(`sysmisc_${index}`, { tone: index === 0 && r.cards.some(c => c.status === "missing") ? "red" : "mute", title: this.esc(this.t(title)), pill: this.formatNumber(count) }, body, index === 0);
    const other = r.other || [];
    return `${part("sysTabCards", this.sysCards(r.cards), r.cards.length, 0)}${part("sysTabBlueprints", this.sysBlueprints(r.blueprints), r.blueprints.length, 1)}${part("sysSecOther", this.sysOther(other, r.other_rest), other.length + (r.other_rest?.count || 0), 2)}`;
  }

  sysOther(items, rest) {
    const max = Math.max(0, ...items.map(x => x.bytes));
    const more = rest?.count ? `<p class="factnote">${this.esc(this.t("sysOtherMore", { n: this.formatNumber(rest.count), size: this.formatBytes(rest.bytes) }))}</p>` : "";
    return `${this.sysList("sysother", items, {
      sort: "size", dir: "desc", sorts: [...this.sysBySize(), { key: "name", label: "sysColName", dir: "asc", get: x => x.name }],
      text: x => x.name, tie: x => x.name, empty: "sysNoOther",
      columns: [{ key: "name", label: "sysColName", cell: x => this.nameCell(x.name, this.t(x.dir ? "sysKindFolder" : "sysKindFile")) }, ...this.sysSizeColumns(max)],
      exportName: "storage-other", header: [this.t("sysColName"), this.t("sysColType"), "Bytes"], rows: x => [x.name, x.dir ? "folder" : "file", x.bytes],
    })}${more}`;
  }

  sysBlueprints(items) {
    const max = Math.max(0, ...items.map(b => b.bytes || 0));
    return this.sysList("sysbp", items, {
      sort: "size", dir: "desc",
      sorts: [...this.sysBySize(), { key: "name", label: "sysColName", dir: "asc", get: b => b.name }, { key: "author", label: "sysColAuthor", dir: "asc", get: b => b.author }],
      filters: [{ name: "domain", all: this.t("sysColDomain"), options: [...new Set(items.map(b => b.domain))].sort().map(d => [d, d]) }],
      filterFns: { domain: (b, v) => b.domain === v },
      text: b => `${b.name} ${b.path} ${b.author || ""}`, tie: b => `${b.domain}/${b.path}`, empty: "sysNoBlueprints",
      columns: [
        { key: "name", label: "sysColName", cell: b => this.nameCell(b.name, `${b.domain}/${b.path}`) },
        { key: "domain", label: "sysColDomain", sortable: false, cell: b => `<span class="pill mute">${this.esc(b.domain)}</span>` },
        { key: "author", label: "sysColAuthor", cell: b => this.esc(b.author || "–") },
        ...this.sysSizeColumns(max),
      ],
      exportName: "storage-blueprints", header: [this.t("sysColName"), this.t("sysColDomain"), "Path", this.t("sysColAuthor"), "Bytes"], rows: b => [b.name, b.domain, b.path, b.author || "", b.bytes ?? ""],
    });
  }

  // ---------------------------------------------------------------- Access & data flow

  accPills(list, tone = "") { return `<span class="pills">${list.map(text => `<span class="pill ${tone}">${this.esc(text)}</span>`).join("")}</span>`; }

  accAccessLabels(e) {
    const labels = e.access.map(a => `${this.t(`accKind_${a.kind}`)}${a.detail ? ` (${a.detail})` : ""}`);
    if (e.gps && !e.access.some(a => a.kind === "location")) labels.push(this.t("accGps"));
    if (e.camera && !e.access.some(a => a.kind === "camera")) labels.push(this.t("accCamera"));
    if (e.presence) labels.push(this.t("accPresence"));
    return labels;
  }

  // The risk level; `why` (text) shows when the pointer rests on it.
  accRiskPill(risk, why = "") { return `<span class="pill ${{ high: "red", medium: "warn", low: "ok" }[risk] || "mute"}"${why ? ` title="${this.esc(why)}"` : ""}>${this.t(`accRisk_${risk}`)}</span>`; }

  // Why a level was given: the reasons the backend names, with the detail of the access ("Zigbee"); nothing when it names none.
  accWhy(risk, labels, low = "accWhyLow") {
    if (risk === "low") return this.t(low);
    return labels.length ? this.t(risk === "high" ? "accWhyHigh" : "accWhyMedium", { list: labels.join(", ") }) : "";
  }

  accEntryWhy(e) {
    const label = token => {
      if (token === "gps") return this.t("accGps");
      if (token === "camera") return this.t("accCamera");
      if (token === "cloud") return this.t("accReasonCloud");
      const a = e.access.find(x => x.kind === token);
      return `${this.t(`accKind_${token}`)}${a?.detail ? ` (${a.detail})` : ""}`;
    };
    return this.accWhy(e.risk, (e.risk_reasons || []).map(label));
  }

  accAppWhy(a) { return a.risk ? this.accWhy(a.risk, a.access.filter(x => x.level === a.risk).map(x => this.accAppRight(x)), "accWhyLowApp") : ""; }

  accIntegrationCell(e) {
    const disabled = e.disabled ? ` <span class="pill mute">${this.t("accDisabled")}</span>` : "";
    return `${this.nameCell(e.title || e.domain, e.domain)}${disabled}`;
  }

  // A row opens the integration's page in Housekeeper when the inventory knows it.
  accRowAttrs(e) {
    const key = `config_entry:${e.entry_id}`;
    return this.findObject(key) ? `data-object="${this.esc(key)}" tabindex="0" role="button" aria-label="${this.esc(e.title || e.domain)}"` : 'class="static"';
  }

  dataflowView() {
    return this.sysFrame("dataflow", "accLoading", (r, head) => {
      const entries = r.entries || [];
      const sys = entries.filter(e => e.access.length || e.gps || e.camera || e.presence);
      const cloud = entries.filter(e => e.external);
      const appList = r.apps || [];
      const hooks = r.webhooks || [], hooksOpen = hooks.filter(w => !w.local_only && w.enabled !== false).length;
      const inbound = r.inbound || [], inboundWarn = inbound.filter(i => i.level === "warn").length;
      const open = this.viewTabOf("dataflow", [{ id: "sys" }, { id: "cloud" }, ...(r.apps_available ? [{ id: "apps" }] : []), { id: "inbound" }, ...(hooks.length ? [{ id: "hooks" }] : [])], "sys");
      const risks = [["high", this.t("accRisk_high")], ["medium", this.t("accRisk_medium")], ["low", this.t("accRisk_low")]];
      const riskOrder = { high: 0, medium: 1, low: 2 };
      const flows = e => e.flows.map(f => this.t(`accFlow_${f}`));
      const base = {
        tie: e => e.entry_id, rowAttrs: e => this.accRowAttrs(e), cls: "acc",
        filters: [{ name: "risk", all: this.t("accAllRisks"), options: risks }], filterFns: { risk: (e, v) => e.risk === v },
        text: e => `${e.domain} ${e.title} ${this.accAccessLabels(e).join(" ")} ${flows(e).join(" ")}`,
      };
      const sorts = [{ key: "risk", label: "accColRisk", dir: "asc", get: e => riskOrder[e.risk] }, { key: "name", label: "accColIntegration", dir: "asc", get: e => `${e.domain} ${e.title}` }];
      const sysTable = this.sysList("accsys", sys, {
        ...base, sort: "risk", sorts, empty: "accNoneSys",
        columns: [
          { key: "name", label: "accColIntegration", cell: e => this.accIntegrationCell(e) },
          { key: "access", label: "accColAccess", sortable: false, cell: e => this.accPills(this.accAccessLabels(e), "warn") },
          { key: "flow", label: "accColFlow", sortable: false, cell: e => this.accPills(flows(e)) },
          { key: "risk", label: "accColRisk", cell: e => this.accRiskPill(e.risk, this.accEntryWhy(e)) },
        ],
        exportName: "system-access", header: [this.t("accColIntegration"), "Domain", this.t("accColAccess"), this.t("accColFlow"), this.t("accColRisk")], rows: e => [e.title, e.domain, this.accAccessLabels(e).join("; "), flows(e).join("; "), this.t(`accRisk_${e.risk}`)],
      });
      const target = e => {
        const named = e.access.filter(a => a.kind === "cloud_api" || a.kind === "cloud").map(a => `${this.t(`accKind_${a.kind}`)}${a.detail ? ` (${a.detail})` : ""}`);
        return named.length ? named : [this.t("accExternal")];
      };
      const iot = e => (e.iot_class ? (TEXT[this.lang][`accIot_${e.iot_class}`] ? this.t(`accIot_${e.iot_class}`) : e.iot_class) : "–");
      const cloudTable = this.sysList("acccloud", cloud, {
        ...base, sort: "name", sorts, empty: "accNoneCloud",
        columns: [
          { key: "name", label: "accColIntegration", cell: e => this.accIntegrationCell(e) },
          { key: "target", label: "accColTarget", sortable: false, cell: e => this.accPills(target(e)) },
          { key: "iot", label: "accColIot", sortable: false, cell: e => this.esc(iot(e)) },
          { key: "flow", label: "accColFlow", sortable: false, cell: e => this.accPills(flows(e), "mute") },
          { key: "risk", label: "accColRisk", cell: e => this.accRiskPill(e.risk, this.accEntryWhy(e)) },
        ],
        exportName: "cloud-data-flow", header: [this.t("accColIntegration"), "Domain", this.t("accColTarget"), this.t("accColIot"), this.t("accColFlow"), this.t("accColRisk")], rows: e => [e.title, e.domain, target(e).join("; "), iot(e), flows(e).join("; "), this.t(`accRisk_${e.risk}`)],
      });
      const hookTable = this.sysList("acchooks", hooks, {
        sort: "open", dir: "asc", cls: "acc", tie: w => w.object_id, empty: "accNoneHooks",
        sorts: [{ key: "open", label: "accColReach", dir: "asc", get: w => Number(w.local_only) }, { key: "name", label: "accColAutomation", dir: "asc", get: w => w.name }],
        text: w => `${w.name} ${w.object_id}`,
        rowAttrs: w => `data-object="automation:${this.esc(w.object_id)}" tabindex="0" role="button" aria-label="${this.esc(w.name)}"`,
        columns: [
          { key: "name", label: "accColAutomation", cell: w => this.nameCell(w.name, w.object_id) + (w.enabled === false ? ` <span class="pill mute">${this.t("accDisabled")}</span>` : "") },
          { key: "methods", label: "accColMethods", sortable: false, cell: w => this.accPills(w.methods.length ? w.methods : [this.t("accAnyMethod")], "mute") },
          { key: "open", label: "accColReach", cell: w => `<span class="pill ${w.local_only ? "ok" : w.enabled === false ? "mute" : "warn"}">${this.t(w.local_only ? "accHookLocal" : "accHookOpen")}</span>` },
        ],
        exportName: "webhooks", header: [this.t("accColAutomation"), "ID", this.t("accColReach")], rows: w => [w.name, w.object_id, this.t(w.local_only ? "accHookLocal" : "accHookOpen")],
      });
      const panel = (id, body, legend = "accLegend") => `<div class="panel">${legend ? `<p class="factnote">${this.t(legend)}</p>` : ""}${body}${this.howCounted("accFootnote")}</div>`;
      const hi = list => list.filter(e => e.risk === "high").length;
      const tone = (n, level = "red") => (n ? level : "ok");
      const tabs = [
        { id: "sys", icon: "mdi:shield-key-outline", label: this.t("accSysTitle"), hint: this.t("accSysHint"), count: sys.length, tone: tone(hi(sys)), ...(hi(sys) ? { pill: this.t("accTabHigh", { n: this.formatNumber(hi(sys)) }), pillTone: "red" } : {}) },
        { id: "cloud", icon: "mdi:cloud-outline", label: this.t("accCloudTitle"), hint: this.t("accCloudHint"), count: cloud.length, tone: tone(hi(cloud)), ...(hi(cloud) ? { pill: this.t("accTabHigh", { n: this.formatNumber(hi(cloud)) }), pillTone: "red" } : {}) },
        r.apps_available ? { id: "apps", icon: "mdi:package-variant-closed", label: this.t("accAppsTitle"), hint: this.t("accAppsHint"), count: appList.length, tone: tone(hi(appList)), ...(hi(appList) ? { pill: this.t("accTabHigh", { n: this.formatNumber(hi(appList)) }), pillTone: "red" } : {}) } : { id: "apps", icon: "mdi:package-variant-closed", label: this.t("accAppsTitle"), hint: this.t("accAppsNoSupervisor"), disabled: true },
      ];
      tabs.push({ id: "inbound", icon: "mdi:earth", label: this.t("accInTitle"), hint: this.t("accInHint"), count: inbound.length, tone: tone(inboundWarn, "warn"), ...(inboundWarn ? { pill: this.t("accTabOpen", { n: this.formatNumber(inboundWarn) }), pillTone: "warn" } : {}) });
      if (hooks.length) tabs.push({ id: "hooks", icon: "mdi:webhook", label: this.t("accHooksTitle"), hint: this.t("accHooksHint"), count: hooks.length, tone: tone(hooksOpen, "warn"), ...(hooksOpen ? { pill: this.t("accTabOpen", { n: this.formatNumber(hooksOpen) }), pillTone: "warn" } : {}) });
      const body = open === "hooks" ? panel("acchooks", hookTable, "")
        : open === "inbound" ? panel("accin", `${this.accInboundTable(inbound)}<p class="factnote">${this.t("accInNote")}</p>`, "accInLegend")
        : open === "cloud" ? panel("acccloud", cloudTable)
        : open === "apps" ? panel("accapps", this.accAppsTable(appList, risks, sorts.find(x => x.key === "risk")), "accLegendApps")
        : panel("accsys", sysTable);
      return `<div class="stack">${head}${this.navTiles("dataflow", tabs, open, this.t("dataflow"), true)}${body}</div>`;
    }, e => `<span>${this.esc(this.t("sysChecked", { n: this.formatNumber((e.entries || []).length) }))}</span>`);
  }

  // Ways in from outside. A row opens the app, the integration, the cloud settings or the webhook tab.
  accInboundTable(list) {
    const rowAttrs = i => {
      const label = `aria-label="${this.esc(i.name)}" tabindex="0"`;
      if (i.slug) return `data-ha-path="${this.esc(`/hassio/addon/${encodeURIComponent(i.slug)}/info`)}" role="link" ${label}`;
      if (i.domain) return `data-ha-path="${this.esc(`/config/integrations/integration/${encodeURIComponent(i.domain)}`)}" role="link" ${label}`;
      if (i.kind === "nabu_casa") return `data-ha-path="/config/cloud/account" role="link" ${label}`;
      return i.kind === "webhooks" ? `data-view-tab="dataflow|hooks" role="button" ${label}` : "";
    };
    const tone = { warn: "warn", ok: "ok", mute: "mute" };
    return this.sysList("accin", list, {
      sort: "level", dir: "asc", cls: "acc", tie: i => `${i.kind} ${i.name}`, empty: "accInNone",
      sorts: [{ key: "level", label: "accInColState", dir: "asc", get: i => ({ warn: 0, mute: 1, ok: 2 })[i.level] ?? 3 }, { key: "name", label: "accInColWay", dir: "asc", get: i => i.name }],
      text: i => `${i.name} ${this.t(`accIn_${i.kind}`)}`,
      rowAttrs,
      columns: [
        { key: "name", label: "accInColWay", cell: i => this.nameCell(i.name, this.t(`accInKind_${i.kind}`)) },
        { key: "what", label: "accInColWhat", sortable: false, cell: i => this.esc(this.t(`accIn_${i.kind}`, { n: this.formatNumber(i.count || 0) })) },
        { key: "level", label: "accInColState", cell: i => `<span class="pill ${tone[i.level] || "mute"}">${this.esc(this.t(`accInState_${i.state}`, { n: this.formatNumber(i.count || 0) }))}</span>` },
      ],
      exportName: "inbound", header: [this.t("accInColWay"), this.t("accInColWhat"), this.t("accInColState")], rows: i => [i.name, this.t(`accIn_${i.kind}`, { n: i.count || 0 }), this.t(`accInState_${i.state}`, { n: i.count || 0 })],
    });
  }

  // A row of an app opens its detail page when the scan knows it, else the app in Home Assistant.
  appRowAttrs(a) {
    const key = `app:${a.slug}`;
    return this.findObject(key) ? `data-object="${this.esc(key)}" tabindex="0" role="button" aria-label="${this.esc(a.name)}"` : `data-ha-path="${this.esc(`/hassio/addon/${encodeURIComponent(a.slug)}/info`)}" tabindex="0" role="link" aria-label="${this.esc(a.name)}"`;
  }

  // The rights of the installed apps (add-ons), as the Supervisor describes them. A row opens the app in Home Assistant.
  accAppRight(a) { return `${this.t(`accApp_${a.kind}`)}${a.detail ? ` (${a.detail})` : ""}`; }

  accAppsTable(apps, risks, riskSort) {
    const order = { high: 0, medium: 1, low: 2 };
    const tone = { high: "red", medium: "warn", low: "mute" };
    const rights = a => `<span class="pills">${a.access.map(x => `<span class="pill ${tone[x.level] || "mute"}">${this.esc(this.accAppRight(x))}</span>`).join("") || `<span class="muted">${this.t(a.checked ? "accAppNoRights" : "accAppUnchecked")}</span>`}</span>`;
    const running = a => a.state === "started";
    const originText = a => [a.origin ? this.t(`accOrigin_${a.origin}`) : "", a.stage ? this.t(`accStage_${a.stage}`) : ""].filter(Boolean).join(" · ");
    const origin = a => (originText(a) ? `${this.esc(originText(a))}` : `<span class="muted">–</span>`);
    return this.sysList("accapps", apps, {
      sort: "risk", dir: "asc", cls: "acc",
      sorts: [{ ...riskSort, get: a => order[a.risk] ?? 3 }, { key: "name", label: "accColApp", dir: "asc", get: a => a.name }],
      filters: [{ name: "risk", all: this.t("accAllRisks"), options: risks }], filterFns: { risk: (a, v) => a.risk === v },
      text: a => `${a.name} ${a.slug} ${a.access.map(x => this.accAppRight(x)).join(" ")}`, tie: a => a.slug, empty: "accNoneApps",
      rowAttrs: a => this.appRowAttrs(a),
      columns: [
        { key: "name", label: "accColApp", cell: a => this.nameCell(a.name, a.slug) },
        { key: "state", label: "sysColState", sortable: false, cell: a => `<span class="pill ${running(a) ? "ok" : "mute"}">${this.t(running(a) ? "sysAppRunning" : "sysAppStopped")}</span>` },
        { key: "origin", label: "accColOrigin", sortable: false, cell: origin },
        { key: "rights", label: "accColRights", sortable: false, cell: rights },
        { key: "risk", label: "accColRisk", cell: a => (a.risk ? this.accRiskPill(a.risk, this.accAppWhy(a)) : `<span class="pill mute">${this.t("accAppUncheckedShort")}</span>`) },
      ],
      exportName: "app-rights", header: [this.t("accColApp"), "Slug", this.t("sysColState"), this.t("accColOrigin"), this.t("accColRights"), this.t("accColRisk")], rows: a => [a.name, a.slug, a.state || "", originText(a), a.access.map(x => this.accAppRight(x)).join("; "), a.risk ? this.t(`accRisk_${a.risk}`) : ""],
    });
  }

  // ---------------------------------------------------------------- Detail page of an app

  appRights(item) { return (this.sysState("dataflow").data?.apps || []).find(a => a.slug === item.object_id) || null; }

  appUsage(item) { return (this.sysState("storage").data?.apps || []).find(a => a.slug === item.object_id) || null; }

  // The dot at the rights tab: red for a high risk, once the report is read.
  appAccessTone(item) { return this.appRights(item)?.risk === "high" ? "red" : ""; }

  appOverview(item) {
    const fact = (k, v) => `<div class="fact"><span>${this.t(k)}</span><b>${v}</b></div>`;
    const update = item.update_available ? `<span class="pill warn">${this.esc(this.t("appUpdate", { version: item.version_latest || "?" }))}</span>` : "";
    const rows = [
      item.status_since ? fact("since", `${this.esc(this.formatDate(item.status_since))}<small>${this.esc(this.relTime(item.status_since))}</small>`) : "",
      item.version ? fact("appVersion", `${this.esc(item.version)} ${update}`) : "",
      item.repository ? fact("appRepository", this.esc(item.repository)) : "",
      item.stage && item.stage !== "stable" ? fact("appStage", this.esc(item.stage)) : "",
    ].join("");
    const text = item.description ? `<div class="pad"><p class="factnote">${this.esc(item.description)}</p></div>` : "";
    return `<div class="stack"><section class="panel"><div class="panelhead"><div><h2>${this.t("app")}</h2><p>${this.t("appHint")}</p></div></div><div class="facts">${rows}</div>${text}</section></div>`;
  }

  appAccessCard(item) {
    const df = this.sysState("dataflow");
    if (df.error) return `<div class="panel">${this.notice("err", df.error)}</div>`;
    if (!df.data) return `<div class="panel">${this.skeleton("accLoading")}</div>`;
    const app = this.appRights(item);
    if (!df.data.apps_available || !app) return `<div class="panel"><div class="emptymsg">${this.t("accAppsNoSupervisor")}</div></div>`;
    const tone = { high: "red", medium: "warn", low: "mute" };
    const rights = app.access.length
      ? app.access.map(x => `<div class="row static"><span class="row-text"><strong>${this.esc(this.accAppRight(x))}</strong></span><span class="pill ${tone[x.level] || "mute"}">${this.t(`accRisk_${x.level}`)}</span></div>`).join("")
      : `<div class="emptymsg">${this.t(app.checked ? "accAppNoRights" : "accAppUnchecked")}</div>`;
    const head = `<div class="panelhead"><div><h2>${this.t("accColRights")}</h2><p>${this.t("accAppsHint")}</p></div>${app.risk ? this.accRiskPill(app.risk, this.accAppWhy(app)) : ""}</div>`;
    return `<div class="stack"><section class="panel">${head}${rights}</section><section class="panel"><div class="pad"><small><button class="link" data-jump="dataflow">${this.t("accDetAllFlow")}</button></small></div></section></div>`;
  }

  appLoadCard(item) {
    const st = this.sysState("storage");
    if (st.error) return `<div class="panel">${this.notice("err", st.error)}</div>`;
    if (!st.data) return `<div class="panel">${this.skeleton("sysLoading")}</div>`;
    const app = this.appUsage(item);
    if (!st.data.supervisor || !app) return `<div class="panel"><div class="emptymsg">${this.t("accAppsNoSupervisor")}</div></div>`;
    const fact = (k, v) => `<div class="fact"><span>${this.t(k)}</span><b>${this.esc(v)}</b></div>`;
    const dash = v => (v === null || v === undefined ? "–" : v);
    const cpu = app.cpu_percent === null || app.cpu_percent === undefined ? "–" : `${this.formatNumber(Math.round(app.cpu_percent * 10) / 10)} %`;
    const ram = app.memory_usage === null || app.memory_usage === undefined ? "–" : `${this.formatBytes(app.memory_usage)}${app.memory_limit ? ` / ${this.formatBytes(app.memory_limit)}` : ""}`;
    const size = b => (b === null || b === undefined ? "–" : this.formatBytes(b));
    const rows = fact("sysColCpu", cpu) + fact("sysColRam", ram) + fact("sysColData", size(app.data_bytes)) + fact("accAppConfig", size(app.config_bytes)) + (app.size_bytes !== null && app.size_bytes !== undefined ? fact("accAppTotal", size(app.size_bytes)) : "");
    return `<div class="stack"><section class="panel"><div class="panelhead"><div><h2>${this.t("accAppLoad")}</h2><p>${this.t("sysTabAppsHint")}</p></div></div><div class="facts">${rows}</div></section><section class="panel"><div class="pad"><small><button class="link" data-jump="storage">${this.t("storage")}</button></small></div></section></div>`;
  }

  // ---------------------------------------------------------------- Detail page of an integration

  // The entry of the reports that are already read; null while they are not.
  accessEntryOf(item) { return (this.sysState("dataflow").data?.entries || []).find(e => e.entry_id === item.object_id) || null; }

  credentialsOf(item) { return (this.sysState("secrets").data?.entries || []).find(e => e.entry_id === item.object_id) || null; }

  // The dot at the tab: red for a high risk, amber for a field without a value; nothing before the reports are read.
  accessTone(item) {
    if (this.accessEntryOf(item)?.risk === "high") return "red";
    return (this.credentialsOf(item)?.fields || []).some(f => !f.set) ? "warn" : "";
  }

  // Overview of the integration: one red line for a high system access, once the report has been read.
  accessAlert(item) {
    const e = item.object_type === "config_entry" ? this.accessEntryOf(item) : null;
    if (!e || e.risk !== "high" || !(e.access.length || e.gps || e.camera)) return "";
    return `<div class="outcome warn" role="status"><ha-icon icon="mdi:shield-alert-outline"></ha-icon><span><strong>${this.esc(this.t("accAlertHigh", { list: this.accAccessLabels(e).join(", ") }))}</strong> <button class="link" data-detail-tab-go="access">${this.t("accAlertMore")}</button></span></div>`;
  }

  accessDetailCard(item) {
    const df = this.sysState("dataflow"), se = this.sysState("secrets");
    const err = df.error || se.error;
    if (err) return `<div class="panel">${this.notice("err", err)}</div>`;
    if (!df.data || !se.data) return `<div class="panel">${this.skeleton("accLoading")}</div>`;
    const e = this.accessEntryOf(item), cred = this.credentialsOf(item);
    const section = (title, body) => `<section class="panel"><div class="panelhead"><h2>${this.t(title)}</h2></div>${body}</section>`;
    const none = key => `<div class="emptymsg">${this.t(key)}</div>`;
    const access = e && (e.access.length || e.gps || e.camera)
      ? `<div class="facts"><div class="fact"><span>${this.t("accColAccess")}</span><b>${this.accPills(this.accAccessLabels(e), "warn")}</b></div><div class="fact"><span>${this.t("accColRisk")}</span><b>${this.accRiskPill(e.risk, this.accEntryWhy(e))}</b></div></div>${this.accEntryWhy(e) ? `<p class="factnote">${this.esc(this.accEntryWhy(e))}</p>` : ""}`
      : none("accDetNoAccess");
    const flows = e && e.flows?.length ? e.flows.map(f => this.t(`accFlow_${f}`)) : [];
    const iot = e?.iot_class ? (TEXT[this.lang][`accIot_${e.iot_class}`] ? this.t(`accIot_${e.iot_class}`) : e.iot_class) : "";
    const flow = e && (flows.length || e.external)
      ? `<div class="facts"><div class="fact"><span>${this.t("accDetConnection")}</span><b>${this.esc(this.t(e.external ? "accDetCloud" : "accDetLocal"))}</b></div>${flows.length ? `<div class="fact"><span>${this.t("accColFlow")}</span><b>${this.accPills(flows, "mute")}</b></div>` : ""}${iot ? `<div class="fact"><span>${this.t("accColIot")}</span><b>${this.esc(iot)}</b></div>` : ""}</div>`
      : none("accDetNoFlow");
    const fields = cred ? cred.fields.map(f => `<div class="row static"><span class="row-text"><strong>${this.esc(this.t(`secKind_${f.kind}`))}</strong><small>${this.esc(f.key)}</small></span><span class="pill ${f.set ? "ok" : "warn"}">${this.t(f.set ? "accDetSet" : "accDetEmpty")}</span></div>`).join("") : none("accDetNoCredentials");
    const links = `<div class="pad"><small>${this.t("accDetNever")} · <button class="link" data-jump="dataflow">${this.t("accDetAllFlow")}</button> · <button class="link" data-jump="secrets">${this.t("accDetAllSecrets")}</button></small></div>`;
    return `<div class="stack">${section("accSysTitle", access)}${section("accDetFlow", flow)}${section("accDetCredentials", fields)}<section class="panel">${links}</section></div>`;
  }

  // ---------------------------------------------------------------- Credentials

  // Which integrations hold credentials, of what kind, and whether a value is set, and the accounts. Never a value.
  // Tiles in even rows of three; each one opens its tab with its filter.
  secretsView() {
    return this.sysFrame("secrets", "secLoading", (r, head) => {
      const entries = r.entries || [], users = r.accounts || [], tokens = r.tokens || [];
      const count = (e, set) => e.fields.filter(f => f.set === set).length;
      const kinds = e => [...new Set(e.fields.map(f => f.kind))];
      const empty = entries.reduce((n, e) => n + count(e, false), 0), reauth = entries.filter(e => e.reauth).length;
      // A switched-off integration keeps what it stored; worth a look only when a value is set.
      const kept = e => e.disabled && count(e, true) > 0, disabled = entries.filter(kept).length;
      const tabs = [{ id: "entries", label: this.t("secListTitle"), count: entries.length }, ...(r.accounts ? [{ id: "accounts", label: this.t("secTabAccounts"), count: users.length }] : []), ...(r.tokens ? [{ id: "tokens", label: this.t("secTabTokens"), count: tokens.length }] : [])];
      const open = this.viewTabOf("secrets", tabs, "entries");
      const on = (tab, list, value) => open === tab && (value ? this.lv?.[list]?.f?.state === value : !Object.values(this.lv?.[list]?.f || {}).some(Boolean));
      const admins = users.filter(u => u.active && u.admin), noMfa = admins.filter(u => !u.mfa);
      const tile = (label, value, sub, tone, show, active) => ({ label: this.t(label), value: this.esc(this.formatNumber(value)), sub: this.esc(sub), tone, attr: ["data-sec-show", show], active });
      const rowOne = [
        tile("secSumEntries", entries.length, this.t("secSumEntriesSub", { n: this.formatNumber(entries.reduce((n, e) => n + count(e, true), 0)) }), "mute", "", on("entries", "seclist")),
        tile("secSumEmpty", empty, this.t("secSumEmptySub"), empty ? "warn" : "ok", "gap", on("entries", "seclist", "gap")),
        tile("secSumReauth", reauth, this.t("secSumReauthSub"), reauth ? "red" : "ok", "reauth", on("entries", "seclist", "reauth")),
      ];
      const old = tokens.filter(x => x.old || !x.account_active).length;
      const rowTwo = [
        tile("secSumDisabled", disabled, this.t("secSumDisabledSub"), disabled ? "warn" : "ok", "disabled", on("entries", "seclist", "disabled")),
        r.accounts && tile("secSumNoMfa", noMfa.length, this.t("secSumNoMfaSub", { n: this.formatNumber(admins.length) }), noMfa.length ? "warn" : "ok", "nomfa", on("accounts", "secusers", "nomfa")),
        r.tokens && tile("secSumTokens", tokens.length, this.t("secSumTokensSub", { n: this.formatNumber(old) }), old ? "warn" : "mute", "tokens", on("tokens", "sectokens")),
      ];
      const tiles = `<div class="tilerows"><div class="sumgrouphead">${this.t("secListTitle")}</div>${this.sumTiles(rowOne, "even")}${this.sumTiles(rowTwo, "even")}</div>`;
      const bar = tabs.length > 1 ? this.viewTabBar("secrets", tabs, open) : "";
      if (open === "tokens") return `<div class="stack">${head}${tiles}<div class="panel">${bar}<div class="panelhead"><div><h2>${this.t("secTabTokens")}</h2><p>${this.t("secTokHint")}</p></div></div>${this.secTokens(tokens)}${this.howCounted("secTokFootnote")}</div></div>`;
      if (open === "accounts") return `<div class="stack">${head}${tiles}<div class="panel">${bar}<div class="panelhead"><div><h2>${this.t("secTabAccounts")}</h2><p>${this.t("secAccHint")}</p></div></div>${this.secAccounts(users)}${this.howCounted("secAccFootnote")}</div></div>`;
      const state = e => (count(e, false) === 0 ? "set" : count(e, true) === 0 ? "empty" : "part");
      const stateCell = e => `${e.fields.length ? `<span class="pill ${{ set: "ok", part: "warn", empty: "warn" }[state(e)]}">${this.esc(this.t("secState", { n: count(e, true), total: e.fields.length }))}</span>` : ""}${e.reauth ? `<span class="pill red">${this.t("secReauth")}</span>` : ""}`;
      const kindNames = e => kinds(e).map(k => this.t(`secKind_${k}`));
      const names = e => e.fields.map(f => f.key).join(", ");
      const table = this.sysList("seclist", entries, {
        sort: "name", dir: "asc", cls: "acc", tie: e => e.entry_id,
        sorts: [{ key: "name", label: "accColIntegration", dir: "asc", get: e => `${e.domain} ${e.title}` }, { key: "state", label: "secColState", dir: "desc", get: e => (e.reauth ? 3 : ({ empty: 2, part: 1, set: 0 })[state(e)]) }],
        filters: [
          { name: "kind", all: this.t("secAllKinds"), options: ["password", "token", "api_key", "secret", "webhook", "pin"].map(k => [k, this.t(`secKind_${k}`)]) },
          { name: "state", all: this.t("secAllStates"), options: [["reauth", this.t("secReauth")], ["disabled", this.t("secStateDisabled")], ["gap", this.t("secStateGap")], ["set", this.t("secStateSet")], ["part", this.t("secStatePart")], ["empty", this.t("secStateEmpty")]] },
        ],
        filterFns: { kind: (e, v) => kinds(e).includes(v), state: (e, v) => (v === "reauth" ? Boolean(e.reauth) : v === "disabled" ? kept(e) : v === "gap" ? state(e) !== "set" : state(e) === v) },
        text: e => `${e.domain} ${e.title} ${names(e)} ${kindNames(e).join(" ")}`, empty: "secNone",
        rowAttrs: e => `data-ha-path="${this.esc(`/config/integrations/integration/${encodeURIComponent(e.domain)}`)}" tabindex="0" role="link" aria-label="${this.esc(this.t("secOpen", { name: e.title || e.domain }))}"`,
        columns: [
          { key: "name", label: "accColIntegration", cell: e => this.accIntegrationCell(e) },
          { key: "kind", label: "secColKind", sortable: false, cell: e => this.accPills(kindNames(e)) },
          { key: "fields", label: "secColFields", sortable: false, cell: e => `<span class="muted">${this.esc(names(e))}</span>` },
          { key: "state", label: "secColState", dir: "desc", cell: stateCell },
          { key: "open", label: "secColOpen", sortable: false, cell: () => `<ha-icon icon="mdi:open-in-new"></ha-icon>` },
        ],
        exportName: "credential-fields", header: [this.t("accColIntegration"), "Domain", this.t("secColKind"), this.t("secColFields"), this.t("secColSetCount"), this.t("secColEmptyCount")],
        rows: e => [e.title, e.domain, kindNames(e).join("; "), names(e), count(e, true), count(e, false)],
      });
      return `<div class="stack">${head}${tiles}<div class="panel">${bar}<div class="panelhead"><div><h2>${this.t("secListTitle")}</h2><p>${this.t("secListHint")}</p></div></div>${table}${this.howCounted("secFootnote")}</div></div>`;
    });
  }

  // The people of this Home Assistant: role, two-factor login and last login. A click opens the user settings.
  secAccounts(users) {
    const roles = u => [u.owner ? this.t("secRoleOwner") : "", this.t(u.admin ? "secRoleAdmin" : "secRoleUser"), u.local_only ? this.t("secRoleLocal") : "", u.active ? "" : this.t("secRoleOff")].filter(Boolean);
    const mfa = u => `<span class="pill ${u.mfa ? "ok" : u.admin && u.active ? "warn" : "mute"}">${this.t(u.mfa ? "secMfaOn" : "secMfaOff")}</span>`;
    const login = u => (!u.logins && u.token_count ? this.t("secLoginTokens") : u.last_login ? this.formatDate(u.last_login) : this.t("secLoginNever"));
    const state = u => (u.active && u.admin && !u.mfa ? "nomfa" : u.inactive ? "inactive" : "");
    return this.sysList("secusers", users, {
      sort: "name", dir: "asc", cls: "acc", tie: u => u.id,
      sorts: [{ key: "name", label: "secColAccount", dir: "asc", get: u => u.name }, { key: "login", label: "secColLogin", dir: "desc", get: u => u.last_login || "" }],
      filters: [{ name: "state", all: this.t("secAllStates"), options: [["nomfa", this.t("secStateNoMfa")], ["inactive", this.t("secStateInactive")]] }],
      filterFns: { state: (u, v) => state(u) === v || (v === "inactive" && u.inactive) },
      text: u => `${u.name} ${roles(u).join(" ")}`, empty: "secNoAccounts",
      rowAttrs: () => `data-ha-path="/config/users" tabindex="0" role="link" aria-label="${this.esc(this.t("secOpenUsers"))}"`,
      columns: [
        { key: "name", label: "secColAccount", cell: u => `<strong>${this.esc(u.name)}</strong>` },
        { key: "role", label: "secColRole", sortable: false, cell: u => this.accPills(roles(u)) },
        { key: "mfa", label: "secColMfa", sortable: false, cell: mfa },
        { key: "login", label: "secColLogin", dir: "desc", cell: u => (u.inactive ? `<span class="pill warn">${this.esc(login(u))}</span>` : this.esc(login(u))) },
        { key: "tokens", label: "secColTokens", sortable: false, cell: u => this.esc(this.formatNumber(u.token_count)) },
      ],
      exportName: "accounts", header: [this.t("secColAccount"), this.t("secColRole"), this.t("secColMfa"), this.t("secColLogin"), this.t("secColTokens")],
      rows: u => [u.name, roles(u).join("; "), this.t(u.mfa ? "secMfaOn" : "secMfaOff"), u.last_login || "", u.token_count],
    });
  }

  // The long-lived tokens by name, account and age. Home Assistant does not record their use, so the age is all there is.
  secTokens(tokens) {
    const state = x => (!x.account_active ? "dead" : x.old ? "old" : "");
    const hint = x => ({ dead: this.t("secTokDead"), old: this.t("secTokOld") })[state(x)] || "";
    return this.sysList("sectokens", tokens, {
      sort: "age", dir: "desc", cls: "acc", tie: x => `${x.account} ${x.name} ${x.created}`,
      sorts: [{ key: "age", label: "secColAge", dir: "desc", get: x => x.days }, { key: "name", label: "secColToken", dir: "asc", get: x => x.name }, { key: "account", label: "secColAccount", dir: "asc", get: x => x.account }],
      filters: [{ name: "state", all: this.t("secAllStates"), options: [["old", this.t("secTokOld")], ["dead", this.t("secTokDead")]] }],
      filterFns: { state: (x, v) => state(x) === v },
      text: x => `${x.name} ${x.account}`, empty: "secNoTokens",
      columns: [
        { key: "name", label: "secColToken", cell: x => `<strong>${this.esc(x.name)}</strong>` },
        { key: "account", label: "secColAccount", cell: x => `${this.esc(x.account)}${x.account_active ? "" : ` <span class="pill mute">${this.t("secRoleOff")}</span>`}` },
        { key: "age", label: "secColAge", dir: "desc", cell: x => `<span class="pill ${state(x) ? "warn" : "mute"}">${this.esc(this.t("secTokDays", { n: this.formatNumber(x.days) }))}</span>` },
        { key: "hint", label: "secColHint", sortable: false, cell: x => `<span class="muted">${this.esc(hint(x))}</span>` },
      ],
      exportName: "long-lived-tokens", header: [this.t("secColToken"), this.t("secColAccount"), this.t("secColAge"), this.t("secColHint")],
      rows: x => [x.name, x.account, x.days, hint(x)],
    });
  }

  // ---------------------------------------------------------------- bindings

  bindSystem(root) {
    root.querySelectorAll("[data-comp-open]").forEach(el => el.addEventListener("click", () => {
      const open = this.compOpen || [];
      this.compOpen = open.includes(el.dataset.compOpen) ? open.filter(x => x !== el.dataset.compOpen) : [...open, el.dataset.compOpen];
      this.render();
    }));
    root.querySelectorAll("[data-sys-refresh]").forEach(el => el.onclick = () => this.sysLoad(el.dataset.sysRefresh, true));
    // A tap on the (i) shows its text for a few seconds, as touch has no hover.
    root.querySelectorAll(".infotip").forEach(el => el.addEventListener("click", () => {
      this.showTip(el); globalThis.clearTimeout?.(this._tipHide);
      this._tipHide = globalThis.setTimeout?.(() => this.hideTip(), 6000);
    }));
    root.querySelectorAll("[data-detail-tab-go]").forEach(el => el.onclick = () => { this.detailTab = el.dataset.detailTabGo; this.render(); });
    // A key figure of the credential overview opens its tab and sets its state filter, or clears all filters.
    root.querySelectorAll("[data-sec-show]").forEach(el => el.onclick = () => {
      const [tab, list, value] = SEC_SHOWS[el.dataset.secShow] || SEC_SHOWS[""];
      (this.viewTab ||= {}).secrets = tab;
      // A tile shows what it counts: the list starts without the search and the other filters kept before.
      const st = this.lvState(list, "name", "asc");
      st.q = ""; st.f = value ? { state: value } : {};
      this.persistLv(list); this.pages = {}; this.render();
    });
    root.querySelector("[data-ha-menu]")?.addEventListener("click", () => this.toggleHaSidebar());
    // Rows that lead into Home Assistant (apps) open with Enter and Space like the other rows.
    root.querySelectorAll("tr[data-ha-path]").forEach(el => el.onkeydown = ev => {
      if (ev.target !== el || (ev.key !== "Enter" && ev.key !== " ")) return;
      ev.preventDefault(); this.navigateHA(el.dataset.haPath);
    });
  }
}
