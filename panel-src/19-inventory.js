// InventoryMixin: methods of the panel element, mixed into the class in 99-register.js.
class InventoryMixin {
  // The state of the inventory list is the shared list state; the old names stay as accessors for the jumps and the tiles.
  invState() { return this.lvState("inventory", "name", "asc"); }
  invSetFilter(name, value) { const f = this.invState().f; if (value) f[name] = value; else delete f[name]; }

  get query() { return this.invState().q; }
  set query(v) { this.invState().q = v; }
  get typeFilter() { return this.invState().f.type || ""; }
  set typeFilter(v) { this.invSetFilter("type", v); if (v !== "config_entry") this.invSetFilter("origin", ""); if (v !== "helper") this.invSetFilter("idle", ""); }
  get statusFilter() { return this.invState().f.status || ""; }
  set statusFilter(v) { this.invSetFilter("status", v); }
  get labelFilter() { return this.invState().f.label || ""; }
  set labelFilter(v) { this.invSetFilter("label", v); }
  // The origin only means something for integrations: it is dropped with any other type.
  get originFilter() { return this.typeFilter === "config_entry" ? this.invState().f.origin || "" : ""; }
  set originFilter(v) { this.invSetFilter("origin", v); }
  get helperIdle() { return this.typeFilter === "helper" ? this.invState().f.idle || "" : ""; }
  set helperIdle(v) { this.invSetFilter("idle", v); }

  // The objects the inventory lists: an automation, script or scene is one object, not also its registry entity.
  invObjects() {
    return this.memo("invObjects", [], () => {
      const own = new Set(this.data.objects.filter(o => o.object_type === "automation" || o.object_type === "script" || o.object_type === "scene").map(o => o.object_id));
      return this.data.objects.filter(o => !(o.object_type === "entity" && own.has(o.object_id)));
    });
  }

  filtered() {
    if (!this.data) return [];
    const st = this.invState(), q = st.q.trim().toLowerCase(), sort = st.sort, desc = st.dir === "desc";
    const type = this.typeFilter, status = this.statusFilter, origin = this.originFilter, idle = this.helperIdle, label = this.labelFilter;
    return this.memo("inventory", [q, type, status, origin, idle, label, sort, st.dir, this.lang], () => {
      const { natural, ids } = this.collators();
      const reason = item => (item.reason ? this.t(item.reason) : item.missing_reference_count ? String(item.missing_reference_count) : "");
      const pick = item => sort === "status" ? item.status : sort === "type" ? item.object_type : sort === "since" ? item.status_since : sort === "version" ? item.integration_version : sort === "reason" ? reason(item) : sort === "entities" ? String(item.entity_count ?? "") : sort === "usedByCol" ? String(this.usedByCount(item) ?? "") : sort === "changedCol" ? (item.last_changed || "") : (item.name || item.object_id);
      const rows = this.invObjects().filter(item => (!q || this.haystack(item).includes(q)) && (!type || (type === "helper" ? this.isHelper(item) : type === RATED_TYPE ? HEALTH_TYPES.includes(item.object_type) : item.object_type === type))
        && (!status || item.status === status)
        && (!label || (item.labels || []).includes(label))
        && (!(type === "helper" && idle) || this.isIdleHelper(item, Number(idle)))
        && (!origin || (item.object_type === "config_entry" && !!item.custom === (origin === "custom")))).map(item => ({ item, key: pick(item) }));
      rows.sort((a, b) => {
        if (!a.key !== !b.key) return a.key ? -1 : 1; // missing values stay last in both directions
        const order = natural.compare(String(a.key ?? ""), String(b.key ?? ""));
        return (desc ? -order : order) || ids.compare(String(a.item.object_id), String(b.item.object_id));
      });
      return rows.map(row => row.item);
    });
  }

  // A helper is a config entry of a helper domain or an entity of a helper platform.
  isHelper(item) {
    return item.object_type === "config_entry" ? HELPER_DOMAINS.has(item.domain) : item.object_type === "entity" && (HELPER_PLATFORMS.has(item.platform) || HELPER_DOMAINS.has(item.platform));
  }

  // How many objects use this one (incoming edges of the usage kinds); a config entry adds up its entities.
  usedByIndex() {
    return this.memo("usedBy", [], () => {
      const own = new Map(), perEntry = new Map(), newest = new Map();
      for (const o of this.data.objects) {
        if (o.object_type !== "entity") continue;
        const n = this.edgesTo(this.objectKey(o)).filter(e => USAGE_RELATIONS.includes(e.relation)).length;
        own.set(o.object_id, n);
        if (o.config_entry_id) {
          perEntry.set(o.config_entry_id, (perEntry.get(o.config_entry_id) || 0) + n);
          if (o.last_changed && o.last_changed > (newest.get(o.config_entry_id) || "")) newest.set(o.config_entry_id, o.last_changed);
        }
      }
      return { own, perEntry, newest };
    });
  }

  usedByCount(item) {
    const counts = this.usedByIndex();
    if (item.object_type === "config_entry") return counts.perEntry.get(item.object_id) ?? 0;
    return item.object_type === "entity" ? counts.own.get(item.object_id) ?? 0 : null;
  }

  // A hint, not a finding: nobody uses this helper in what the scan reads and it has not changed for `days` days.
  // Dashboards outside the scan, apps and YAML can still use it, so nothing here suggests deleting it.
  isIdleHelper(item, days) {
    if (!this.isHelper(item) || this.usedByCount(item) !== 0) return false;
    const changed = item.object_type === "config_entry" ? this.usedByIndex().newest.get(item.object_id) : item.last_changed;
    const time = changed ? Date.parse(changed) : NaN;
    return Number.isFinite(time) && Date.now() - time >= days * 86400000;
  }

  // The text a search looks in, built once per object.
  haystack(item) {
    const cache = this._haystacks ||= new WeakMap();
    let text = cache.get(item);
    if (text === undefined) { text = [item.name, item.object_id, item.platform, item.domain, item.unique_id].join(" ").toLowerCase(); cache.set(item, text); }
    return text;
  }

  inventory() {
    if (this.xp?.open) return this.xpView();
    const st = this.invState();
    const rows = this.filtered();
    const pg = this.paginate("inventory", rows);
    this._invPage = pg.rows.filter(item => this.invSelectable(item)).map(item => item.object_id);
    const { types, statuses, labels } = this.memo("facets", [], () => ({
      types: [...new Set(this.invObjects().map(x => x.object_type))].sort(),
      statuses: [...new Set(this.invObjects().map(x => x.status))].sort(),
      labels: [...new Set(this.invObjects().flatMap(x => x.labels || []))].map(id => [id, this.findObject(`label:${id}`)?.name || id]).sort((a, b) => a[1].localeCompare(b[1])),
    }));
    const all = this.invObjects();
    const tiles = this.invTypesCard(all);
    // Version and entity count only mean something for integrations; the helper columns for helpers.
    const integ = this.typeFilter === "config_entry", helperMode = this.typeFilter === "helper";
    const integCols = [...(integ ? ["version", "entities"] : []), ...(helperMode ? ["usedByCol", "changedCol"] : [])];
    const colValue = (item, k) => k === "version" ? (item.object_type === "config_entry" ? item.integration_version || "" : "") : k === "entities" ? (item.object_type === "config_entry" ? item.entity_count ?? 0 : "") : k === "usedByCol" ? this.usedByCount(item) ?? "" : item.last_changed || "";
    const reasonText = item => (item.reason ? this.t(item.reason) : item.missing_reference_count ? `${item.missing_reference_count} ${this.t("missingReferences")}` : item.entity_status && item.entity_status !== "active" && item.entity_reason ? this.t(item.entity_reason) : "");
    this.setExporter("inventory", "inventory", [this.t("name"), "ID", this.t("type"), this.t("status"), this.t("reason"), this.t("since"), ...(integ ? [this.t("origin")] : []), ...integCols.map(k => this.t(k))], () => rows.map(i => [i.name, i.object_id, this.t(i.object_type), this.statusLabel(i.status), reasonText(i), i.status_since || "", ...(integ ? [i.object_type === "config_entry" ? this.t(i.custom ? "originKindCustom" : "originKindCore") : ""] : []), ...integCols.map(k => colValue(i, k))]));
    const sorts = [
      { key: "name", label: "sortName", dir: "asc" }, { key: "type", label: "sortType", dir: "asc" }, { key: "status", label: "sortStatus", dir: "asc" },
      { key: "reason", label: "reason", dir: "asc" }, { key: "since", label: "sortSince", dir: "desc" },
      ...integCols.map(k => ({ key: k, label: k, dir: k === "version" ? "asc" : "desc" })),
    ];
    if (!sorts.some(x => x.key === st.sort)) st.sort = "name";
    const filters = [
      { name: "type", all: this.t("allTypes"), options: [[RATED_TYPE, this.t("ratedObjects")], ["helper", this.t("helperKind")], ...types.map(x => [x, this.t(x)])] },
      { name: "status", all: this.t("allStatus"), options: statuses.map(x => [x, this.statusLabel(x)]) },
      ...(labels.length ? [{ name: "label", all: this.t("allLabels"), options: labels }] : []),
      ...(integ ? [{ name: "origin", all: this.t("allOrigins"), options: [["core", this.t("originKindCore")], ["custom", this.t("originKindCustom")]] }] : []),
      ...(helperMode ? [{ name: "idle", all: this.t("helperIdleAny"), options: ["30", "90", "180"].map(d => [d, this.t("helperIdleOpt", { days: d })]) }] : []),
    ];
    const bar = this.listBar("inventory", { table: true, dense: true, sorts, filters, columns: ["type", "status", "reason", "since", ...integCols].map(k => ({ key: k, label: k === "reason" ? "reason" : k })) });
    const idleHint = helperMode && this.helperIdle ? `<div class="hintbox"><ha-icon icon="mdi:lightbulb-on-outline"></ha-icon><div><p>${this.esc(this.t("helperIdleHint"))}</p></div></div>` : "";
    const columns = [
      { key: "sel", label: "selectPage", narrow: true, sortable: false, allBox: () => this.invHeadBox(), cell: item => this.invSelBox(item) },
      { key: "name", label: "name", dir: "asc", cell: item => `<span class="object">${this.tile(item.object_type, this.tone(item.status) === "ok" ? "" : this.tone(item.status))}${this.nameCell(item.name, item.object_id, "span")}</span>` },
      { key: "type", label: "type", dir: "asc", cell: item => this.esc(this.t(item.object_type)) },
      { key: "status", label: "status", dir: "asc", cell: item => this.pill(item.status) },
      { key: "reason", label: "reason", dir: "asc", cell: item => this.esc(reasonText(item) || "—") },
      { key: "since", label: "since", dir: "desc", cell: item => this.formatDate(item.status_since) },
      ...integCols.map(k => ({ key: k, label: k, dir: k === "version" ? "asc" : "desc", cell: item => this.esc(k === "usedByCol" ? (this.usedByCount(item) == null ? "—" : this.formatNumber(this.usedByCount(item))) : k === "changedCol" ? (item.last_changed ? this.formatDate(item.last_changed) : "—") : item.object_type !== "config_entry" ? "—" : k === "version" ? (item.integration_version || "—") : this.formatNumber(item.entity_count ?? 0)) })),
    ];
    const table = rows.length ? this.listTable("inventory", columns, pg.rows, { cls: "inv", rowAttrs: item => `data-object="${this.esc(this.objectKey(item))}" tabindex="0" role="button" aria-label="${this.esc(item.name)}"` }) : `<div class="emptymsg">${this.t("noResults")}</div>`;
    return `<div class="stack">${tiles}<div class="panel">${bar}${idleHint}${this.invSelBar(rows)}${table}${pg.footer || `<div class="tablefoot"><span>${this.formatNumber(rows.length)} ${this.t("of_total")} ${this.formatNumber(all.length)} ${this.t("shown")}</span></div>`}</div></div>`;
  }

  // The types as a ring with a table beside it: the largest few, the rest behind a button. A row filters the list below (a
  // second click lifts it); the columns for unavailable and orphaned objects filter by type and state together.
  invTypesCard(all) {
    const SHOWN = 5;
    const by = new Map(), origins = { core: { n: 0, un: 0, or: 0 }, custom: { n: 0, un: 0, or: 0 } };
    for (const x of all) {
      const r = by.get(x.object_type) || { type: x.object_type, n: 0, un: 0, or: 0 };
      r.n += 1; if (x.status === "unavailable") r.un += 1; else if (x.status === "orphaned") r.or += 1;
      by.set(x.object_type, r);
      if (x.object_type === "config_entry") {
        const o = origins[x.custom ? "custom" : "core"];
        o.n += 1; if (x.status === "unavailable") o.un += 1; else if (x.status === "orphaned") o.or += 1;
      }
    }
    const sorted = [...by.values()].sort((a, b) => b.n - a.n || a.type.localeCompare(b.type));
    let rows = this.invAllTypes ? sorted : sorted.slice(0, SHOWN);
    const picked = sorted.find(r => r.type === this.typeFilter);
    if (picked && !rows.includes(picked)) rows = [...rows, picked]; // a chosen type is never hidden
    const rest = sorted.filter(r => !rows.includes(r));
    const total = all.length || 1, sum = key => sorted.reduce((a, r) => a + r[key], 0);
    const colors = ["var(--hk-blue)", "var(--hk-green)", "var(--hk-amber)", "var(--hk-violet)", "color-mix(in srgb,var(--hk-blue) 50%,var(--hk-green))", "color-mix(in srgb,var(--hk-violet) 55%,var(--hk-red))", "color-mix(in srgb,var(--hk-amber) 55%,var(--hk-red))", "color-mix(in srgb,var(--hk-green) 55%,var(--hk-amber))", "color-mix(in srgb,var(--hk-blue) 55%,var(--hk-violet))", "color-mix(in srgb,var(--hk-blue) 40%,var(--hk-gray))", "color-mix(in srgb,var(--hk-green) 40%,var(--hk-gray))"];
    const color = i => colors[i % colors.length];
    const pct = n => `${this.formatNumber(Math.round((n / total) * 1000) / 10)} %`;
    // Ring: one segment per shown type and one grey one for the rest.
    const R = 70, C = 2 * Math.PI * R;
    let acc = 0;
    const seg = (n, stroke, attrs, on) => { const len = Math.max((n / total) * C, 1.5), at = acc; acc += (n / total) * C; return `<circle cx="100" cy="100" r="${R}" fill="none" style="stroke:${stroke}" stroke-width="${on ? 30 : 22}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-at}" transform="rotate(-90 100 100)" ${attrs}/>`; };
    const picks = r => this.typeFilter === r.type && !this.statusFilter && !this.originFilter;
    const ring = rows.map((r, i) => seg(r.n, color(i), `class="invseg${this.typeFilter && !picks(r) ? " dim" : ""}" data-seg="${i}" data-inv-filter="${this.esc(r.type)}|" tabindex="0" role="button" aria-label="${this.esc(this.t(r.type))}: ${this.formatNumber(r.n)}"`, picks(r))).join("")
      + (rest.length ? seg(rest.reduce((a, r) => a + r.n, 0), "var(--hk-gray)", `class="invseg${this.typeFilter ? " dim" : ""}" data-seg="rest"`, false) : "");
    const mid = picked && !this.statusFilter ? [this.formatNumber(picked.n), this.t(picked.type)] : [this.formatNumber(all.length), this.t("objects")];
    const donut = `<svg class="invring" viewBox="0 0 200 200" role="img" aria-label="${this.esc(this.t("byType"))}">${ring}<text x="100" y="100" text-anchor="middle" class="invmid">${this.esc(mid[0])}</text><text x="100" y="120" text-anchor="middle" class="invsub">${this.esc(mid[1])}</text></svg>`;
    const num = (n, attr, label) => n ? `<button class="linkbtn" ${attr} aria-label="${this.esc(label)}">${this.formatNumber(n)}</button>` : `<span class="muted">–</span>`;
    const line = (r, i) => `<tr data-seg="${i}"${picks(r) ? ' class="sel"' : ""}><td><button class="linkbtn invtype" data-inv-filter="${this.esc(r.type)}|" aria-pressed="${picks(r)}"><span class="sw" style="background:${color(i)}"></span>${this.esc(this.t(r.type))}</button></td><td data-label="${this.t("invColCount")}">${this.formatNumber(r.n)}</td><td data-label="${this.t("invColShare")}">${pct(r.n)}</td><td data-label="${this.statusLabel("unavailable")}">${num(r.un, `data-inv-filter="${this.esc(r.type)}|unavailable"`, `${this.t(r.type)}: ${this.statusLabel("unavailable")}`)}</td><td data-label="${this.statusLabel("orphaned")}">${num(r.or, `data-inv-filter="${this.esc(r.type)}|orphaned"`, `${this.t(r.type)}: ${this.statusLabel("orphaned")}`)}</td></tr>`;
    // Under "integration": how many are built in and how many are custom; a click sets the type and the origin together.
    const sub = (kind, o) => { const on = this.typeFilter === "config_entry" && this.originFilter === kind && !this.statusFilter; return `<tr class="invsubrow${on ? " sel" : ""}"><td><button class="linkbtn invtype invsub" data-inv-filter="config_entry||${kind}" aria-pressed="${on}">${this.esc(this.t(kind === "core" ? "invOfCore" : "invOfCustom"))}</button></td><td data-label="${this.t("invColCount")}">${this.formatNumber(o.n)}</td><td data-label="${this.t("invColShare")}">${pct(o.n)}</td><td data-label="${this.statusLabel("unavailable")}">${num(o.un, `data-inv-filter="config_entry|unavailable|${kind}"`, `${this.t(kind === "core" ? "invOfCore" : "invOfCustom")}: ${this.statusLabel("unavailable")}`)}</td><td data-label="${this.statusLabel("orphaned")}">${num(o.or, `data-inv-filter="config_entry|orphaned|${kind}"`, `${this.t(kind === "core" ? "invOfCore" : "invOfCustom")}: ${this.statusLabel("orphaned")}`)}</td></tr>`; };
    const lineWithSub = (r, i) => line(r, i) + (r.type === "config_entry" && origins.custom.n ? sub("core", origins.core) + sub("custom", origins.custom) : "");
    const others = rest.length ? `<tr class="dim" data-seg="rest"><td><span class="sw" style="background:var(--hk-gray)"></span>${this.esc(this.t("invOthers", { n: rest.length }))}</td><td data-label="${this.t("invColCount")}">${this.formatNumber(rest.reduce((a, r) => a + r.n, 0))}</td><td data-label="${this.t("invColShare")}">${pct(rest.reduce((a, r) => a + r.n, 0))}</td><td data-label="${this.statusLabel("unavailable")}">${rest.reduce((a, r) => a + r.un, 0) || "–"}</td><td data-label="${this.statusLabel("orphaned")}">${rest.reduce((a, r) => a + r.or, 0) || "–"}</td></tr>` : "";
    const allRow = `<tr class="invall"><td><button class="linkbtn invtype" data-inv-filter="|" aria-pressed="${!this.typeFilter && !this.statusFilter}">${this.esc(this.t("all"))}</button></td><td data-label="${this.t("invColCount")}">${this.formatNumber(all.length)}</td><td data-label="${this.t("invColShare")}">100 %</td><td data-label="${this.statusLabel("unavailable")}">${num(sum("un"), `data-inv-filter="|unavailable"`, this.statusLabel("unavailable"))}</td><td data-label="${this.statusLabel("orphaned")}">${num(sum("or"), `data-inv-filter="|orphaned"`, this.statusLabel("orphaned"))}</td></tr>`;
    const more = sorted.length > SHOWN ? `<button type="button" class="btn quiet" data-inv-more>${this.esc(this.invAllTypes ? this.t("invFewer", { n: SHOWN }) : this.t("invMore", { n: sorted.length }))}</button>` : "";
    const table = `<table class="invtypes"><thead><tr><th>${this.t("type")}</th><th>${this.t("invColCount")}</th><th>${this.t("invColShare")}</th><th>${this.statusLabel("unavailable")}</th><th>${this.statusLabel("orphaned")}</th></tr></thead><tbody>${rows.map(lineWithSub).join("")}${others}${allRow}</tbody></table>${more}`;
    const filtered = this.typeFilter || this.statusFilter;
    const shown = this.filtered().length;
    return `<div class="panel">${this.fold("inv_types", { title: this.esc(this.t("byType")), pill: filtered ? this.t("invOfAll", { n: this.formatNumber(shown), total: this.formatNumber(all.length) }) : "" }, `<div class="invbody">${donut}<div class="tablewrap">${table}</div></div>`, true)}</div>`;
  }

  nodeButton(key, label, tone = "") {
    const obj = this.findObject(key);
    const [type, ...rest] = key.split(":");
    const id = rest.join(":");
    return `<button class="node" data-graph="${this.esc(key)}">${this.tile(type, tone)}<span><small>${this.t(type)}</small><strong>${this.esc(obj?.name || id)}</strong><span class="meta">${this.esc(label || (obj ? obj.object_id : this.t("missing")))}</span></span>${obj ? this.pill(obj.status) : `<span class="pill red">${this.t("missing")}</span>`}</button>`;
  }

  graph() {
    const search = `<div class="panel searchpanel"><div class="search">${this.pickerBox("graph", this.t("searchObject"), 'id="graphQuery"')}</div></div>`;
    if (!this.graphSelected) {
      return `${search}<div class="panel"><div class="emptymsg"><ha-icon icon="mdi:graph-outline"></ha-icon>${this.t("graphHint")}</div></div>`;
    }
    const item = this.graphSelected, key = this.objectKey(item);
    const head = `<div class="panel pathcard">${this.tile(item.object_type, this.tone(item.status) === "ok" ? "" : this.tone(item.status))}<div><h2>${this.esc(item.name)} ${this.pill(item.status)}</h2><span class="id">${this.esc(item.object_id)}</span></div><button class="btn" data-object="${this.esc(key)}">${this.t("details")}</button></div>`;
    if (this.useGraph()) return `${search}${head}${this.graphBar(item, key)}${this.graphPanel(item, key)}`;
    const USAGE = USAGE_RELATIONS;
    const incoming = this.edgesTo(key), outgoing = this.edgesFrom(key);
    const originEdges = incoming.filter(e => !USAGE.includes(e.relation));
    const usageEntries = [
      ...incoming.filter(e => USAGE.includes(e.relation)).map(e => ({ key: e.source, edge: e, label: `${this.t("usedBy")} · ${this.t(e.relation)}` })),
      ...outgoing.map(e => ({ key: e.target, edge: e, label: this.t(e.relation) })),
    ];
    const edgeNote = edge => `${this.t(edge.confidence)}${edge.location && edge.location !== "runtime_extraction" ? ` · ${edge.location}` : ""}`;
    const origin = originEdges.map(e => `${this.nodeButton(e.source, edgeNote(e))}<div class="link-label"><ha-icon icon="mdi:arrow-down" class="u-ic14"></ha-icon>${this.t(e.relation)}</div>`).join("");
    const usage = usageEntries.length
      ? `<div class="branch">${usageEntries.map(u => `<div><div class="link-label flat">${u.label}</div>${this.nodeButton(u.key, edgeNote(u.edge))}</div>`).join("")}</div>`
      : `<p class="emptyrel sm">${this.t("noRelations")}</p>`;
    return `${search}${head}${this.graphBar(item, key)}
      <div class="panel"><div class="panelhead"><h2>${this.t("origin")} → ${this.t("usage")}</h2><span class="date">${this.t("origin")} ${originEdges.length} · ${this.t("usage")} ${usageEntries.length}</span></div>
      <div class="path">${origin}<div class="node current">${this.tile(item.object_type, this.tone(item.status) === "ok" ? "" : this.tone(item.status))}<span><small>${this.t(item.object_type)}</small><strong>${this.esc(item.name)}</strong><span class="meta">${this.esc(item.object_id)}</span></span>${this.pill(item.status)}</div>${usage}</div></div>`;
  }
}
