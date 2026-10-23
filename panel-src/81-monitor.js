// User-selected direct dependencies of important home functions.
const MONITOR_MEMBER_TYPES = ["entity", "device", "automation", "config_entry", "scene", "script", "app"];
class MonitorMixin {
  monitorFunctions() { return this.data?.monitor || []; }

  monitorReason(reason) { if (!reason) return ""; return this.t(`monitorReason_${reason}`) === `monitorReason_${reason}` ? reason : this.t(`monitorReason_${reason}`); }

  monitorState(item) {
    const key = item.enabled === false ? "monitorDisabled" : item.incident_open && item.state === "unverified" ? "monitorUnresolved" : `monitor${item.state === "ok" ? "Ok" : item.state === "problem" ? "Problem" : "Unverified"}`;
    return this.t(key);
  }

  monitorObjectContext(item) {
    const device = item.device_id ? this.findObject(`device:${item.device_id}`) : null;
    const area = this.findObject(`area:${item.area_id || device?.area_id}`);
    const floor = area?.floor_id ? this.findObject(`floor:${area.floor_id}`) : null;
    const labels = (item.labels || []).map(id => this.findObject(`label:${id}`)?.name || id);
    return [area?.name, floor?.name, ...labels].filter(Boolean).join(" · ");
  }

  monitorRuleText(rule, object) {
    const value = this.formatNumber(rule.value);
    if (rule.kind === "freshness") return this.t("monitorRuleFreshnessText", { value });
    if (rule.kind === "unavailable_for") return this.t("monitorRuleUnavailableText", { value });
    return this.t("monitorRuleMinimumText", { value, unit: object?.unit || "" });
  }

  monitorSuggestions() {
    const chosen = new Set(this.monitorForm.members.map(m => m.object_key));
    const edges = this.data?.edges || [];
    const outgoing = new Map(), incoming = new Map();
    for (const edge of edges) {
      if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
      if (!incoming.has(edge.target)) incoming.set(edge.target, []);
      outgoing.get(edge.source).push(edge);
      incoming.get(edge.target).push(edge);
    }
    const found = new Map();
    const add = (key, score, reason, probable) => {
      const kind = key?.split(":")[0];
      if (!MONITOR_MEMBER_TYPES.includes(kind) || chosen.has(key)) return;
      const object = this.findObject(key);
      if (!object || object.status === "ignored" || found.get(key)?.score >= score) return;
      found.set(key, { key, object, score, reason, probable });
    };
    for (const key of chosen) {
      const object = this.findObject(key), name = object?.name || key;
      const targets = (outgoing.get(key) || []).filter(edge => ["TRIGGERS_ON", "USES_AS_CONDITION", "TARGETS", "REFERENCES", "INCLUDES", "CONNECTED"].includes(edge.relation));
      for (const edge of targets) {
        add(edge.target, 3, this.t("monitorSuggestionUsedBy", { name }), edge.confidence !== "certain");
        for (const provider of incoming.get(edge.target) || []) {
          if (!["PROVIDES", "OWNS"].includes(provider.relation)) continue;
          add(provider.source, 2, this.t("monitorSuggestionProvides", { name: this.findObject(edge.target)?.name || edge.target }), provider.confidence !== "certain");
          for (const app of outgoing.get(provider.source) || []) {
            if (app.relation === "CONNECTED") add(app.target, 1, this.t("monitorSuggestionConnected"), true);
          }
        }
      }
      for (const provider of incoming.get(key) || []) {
        if (["PROVIDES", "OWNS", "VIA_DEVICE"].includes(provider.relation)) add(provider.source, 2, this.t("monitorSuggestionProvides", { name }), provider.confidence !== "certain");
      }
    }
    return [...found.values()].sort((a, b) => b.score - a.score || String(a.object.name || a.key).localeCompare(String(b.object.name || b.key), this.lang)).slice(0, 8);
  }

  monitorPreviewHtml() {
    if (!this.monitorForm?.members.length) return "";
    const preview = this.monitorPreview;
    const state = preview?.state;
    const tone = state === "problem" ? "red" : state === "unverified" ? "warn" : "ok";
    const title = !preview ? this.t("monitorPreviewLoading") : preview.error ? this.t("monitorPreviewError", { reason: preview.error }) : this.monitorState(preview);
    const detail = preview?.reason_key ? this.findObject(preview.reason_key)?.name || preview.reason_key : "";
    const members = preview?.members?.map(member => `<div class="monitor-preview-row"><span>${this.esc(this.findObject(member.object_key)?.name || member.object_key)}</span><span class="pill ${member.state === "problem" ? "red" : member.state === "unverified" ? "warn" : "ok"}">${this.t(member.state === "problem" ? "monitorProblem" : member.state === "unverified" ? "monitorUnverified" : "monitorOk")}</span><small>${this.esc(this.monitorReason(member.reason))}</small></div>`).join("") || "";
    return `<section class="panel u-mb14"><div class="panelhead"><div><h2>${this.t("monitorPreview")}</h2><p>${this.t("monitorPreviewHint")}</p></div>${state ? `<span class="pill ${tone}">${title}</span>` : ""}</div><div class="monitor-preview-body">${state ? `<strong>${this.esc([detail, this.monitorReason(preview.reason)].filter(Boolean).join(" · "))}</strong>${preview.scanned_at ? `<small>${this.t("monitorLastScan", { date: this.formatDate(preview.scanned_at) })}</small>` : ""}${members}` : `<p>${this.esc(title)}</p>`}</div></section>`;
  }

  queueMonitorPreview() {
    globalThis.clearTimeout?.(this._monitorPreviewTimer);
    const token = this._monitorPreviewToken = (this._monitorPreviewToken || 0) + 1;
    if (!this.monitorForm?.members.length) { this.monitorPreview = null; return; }
    this.monitorPreview = null;
    const refresh = () => { const host = this.shadowRoot?.querySelector?.("[data-monitor-preview]"); if (host) host.innerHTML = this.monitorPreviewHtml(); };
    refresh();
    this._monitorPreviewTimer = globalThis.setTimeout?.(async () => {
      try {
        const response = await this._hass.callWS({ type: "ha_housekeeper/monitor_preview", members: this.monitorForm.members });
        if (this._monitorPreviewToken === token && this.monitorForm) { this.monitorPreview = response.preview; refresh(); }
      } catch (err) {
        if (this._monitorPreviewToken === token && this.monitorForm) { this.monitorPreview = { error: this.errText(err) }; refresh(); }
      }
    }, 250);
  }

  monitorView() {
    if (this.monitorForm) return this.monitorEditor();
    if (this.monitorSelected) return this.monitorDetail();
    const rank = { problem: 0, unverified: 1, ok: 2, disabled: 3 };
    // The deep links and the overview set `monitorFilter`; from there on the filter of the list is the one source.
    const st = this.lvState("monitor", "state", "asc");
    if (this._monitorFilterSeen !== this.monitorFilter) { if (this.monitorFilter) st.f.state = this.monitorFilter; else delete st.f.state; }
    this.monitorFilter = this._monitorFilterSeen = st.f.state || "";
    const toneOf = item => (item.enabled === false ? "mute" : item.incident_open || item.state === "problem" ? "red" : item.state === "unverified" ? "warn" : "ok");
    const reasonOf = item => {
      const key = item.incident_open && item.state === "unverified" ? item.last_problem_key : item.reason_key;
      const object = key ? this.findObject(key)?.name || key : "";
      const detail = item.incident_open && item.state === "unverified" ? `${this.t("monitorUnresolved")}: ${this.monitorReason(item.last_problem_reason)}` : this.apMonitorReason(key, item.reason);
      return [object, detail].filter(Boolean).join(" · ");
    };
    const sorts = [
      { key: "state", label: "sysColState", dir: "asc", get: item => (item.enabled === false ? rank.disabled : item.incident_open && item.state !== "problem" ? rank.problem : rank[item.state] ?? 9) },
      { key: "name", label: "sortName", dir: "asc", get: item => item.name },
      { key: "problem", label: "monitorColLastProblem", dir: "desc", get: item => (item.last_problem_at ? Date.parse(item.last_problem_at) : 0) },
      { key: "scan", label: "monitorColScan", dir: "desc", get: item => (item.scanned_at ? Date.parse(item.scanned_at) : 0) },
    ];
    const list = this.monitorFunctions().length ? this.sysList("monitor", this.monitorFunctions(), {
      sort: "state", sorts, tie: item => item.name, empty: "monitorEmpty",
      text: item => [item.name, item.description, reasonOf(item)].join(" "),
      filters: [{ name: "state", all: this.t("monitorAll"), options: [["problem", this.t("monitorProblem")], ["unverified", this.t("monitorUnverified")], ["ok", this.t("monitorOk")], ["disabled", this.t("monitorDisabled")]] }],
      filterFns: { state: (item, v) => (v === "disabled" ? item.enabled === false || item.state === "disabled" : item.state === v || (v === "problem" && item.incident_open)) },
      rowAttrs: item => `data-monitor-open="${this.esc(item.id)}" tabindex="0" role="button" aria-label="${this.esc(item.name)}"`,
      columns: [
        // The description is text a person wrote, not an ID: a plain line below the name.
        { key: "name", label: "sortName", dir: "asc", cell: item => `${this.nameCell(item.name, "")}${item.description ? `<small class="muted u-block">${this.esc(item.description)}</small>` : ""}` },
        { key: "state", label: "sysColState", dir: "asc", cell: item => `<span class="pill ${toneOf(item)}">${this.monitorState(item)}</span>` },
        { key: "reason", label: "monitorColReason", sortable: false, cell: item => this.esc(reasonOf(item) || "—") },
        { key: "problem", label: "monitorColLastProblem", dir: "desc", cell: item => (item.last_problem_at ? `${this.esc(this.agoText(item.last_problem_at))}<small class="agestamp">${this.esc(this.formatDate(item.last_problem_at))}</small>` : "—") },
        { key: "scan", label: "monitorColScan", dir: "desc", cell: item => (item.scanned_at ? this.esc(this.formatDate(item.scanned_at)) : "—") },
      ],
    }) : `<div class="emptymsg"><ha-icon icon="mdi:home-heart"></ha-icon>${this.t("monitorEmpty")}</div>`;
    // How many are in which state, as tiles that filter the list; the page head already names and explains the view.
    const all = this.monitorFunctions(), n = test => all.filter(test).length;
    const problem = n(i => i.enabled !== false && (i.state === "problem" || i.incident_open)), unverified = n(i => i.enabled !== false && i.state === "unverified" && !i.incident_open), ok = n(i => i.enabled !== false && i.state === "ok" && !i.incident_open), off = n(i => i.enabled === false || i.state === "disabled");
    const tiles = all.length ? this.sumTiles([
      { label: this.t("monitorProblem"), value: this.formatNumber(problem), tone: problem ? "red" : "ok", lf: ["monitor", "state", "problem"] },
      { label: this.t("monitorUnverified"), value: this.formatNumber(unverified), tone: unverified ? "warn" : "ok", lf: ["monitor", "state", "unverified"] },
      { label: this.t("monitorOk"), value: this.formatNumber(ok), tone: "ok", lf: ["monitor", "state", "ok"] },
      off ? { label: this.t("monitorDisabled"), value: this.formatNumber(off), tone: "mute", lf: ["monitor", "state", "disabled"] } : null,
    ]) : "";
    return `<div class="stack">${tiles}<section class="panel"><div class="panelhead"><div><h2>${this.t("monitorListTitle")}</h2></div><button class="btn primary" data-monitor-add><ha-icon icon="mdi:plus"></ha-icon>${this.t("monitorAdd")}</button></div>${list}</section></div>`;
  }

  monitorDetail() {
    const item = this.monitorFunctions().find(f => f.id === this.monitorSelected);
    if (!item) { this.monitorSelected = null; return this.monitorView(); }
    const tone = item.enabled === false ? "mute" : item.incident_open || item.state === "problem" ? "red" : item.state === "unverified" ? "warn" : "ok";
    const cache = (this.monitorHistory ||= {})[item.id];
    const meta = [
      this.t("monitorLastScan", { date: this.formatDate(item.scanned_at) }),
      item.last_verified_at ? this.t("monitorLastVerified", { date: this.formatDate(item.last_verified_at) }) : this.t("monitorNeverVerified"),
      this.t("monitorHistObjects", { n: item.members.length }),
    ].map(text => this.esc(text)).join(" · ");
    const unverified = item.state === "unverified" ? `<div class="row"><span class="tile warn"><ha-icon icon="mdi:help-circle-outline"></ha-icon></span><span class="row-text"><strong>${this.t(item.incident_open ? "monitorUnresolved" : "monitorNoProof")}</strong>${item.incident_open && item.last_problem_reason ? `<small>${this.esc(this.monitorReason(item.last_problem_reason))}</small>` : ""}</span></div>` : "";
    const head = `<div class="panelhead"><div><h2>${this.esc(item.name)} <span class="pill ${tone}">${this.monitorState(item)}</span></h2>${item.description ? `<p>${this.esc(item.description)}</p>` : ""}<p class="monitor-meta">${meta}</p></div><button class="btn" data-monitor-edit>${this.t("monitorEdit")}</button></div>`;
    const history = this.monitorHistoryHtml(item);
    return `<div class="u-mb14"><button class="btn" data-monitor-back><ha-icon icon="mdi:arrow-left"></ha-icon>${this.t("monitorBack")}</button></div><section class="panel u-mb14">${head}${unverified}${this.monitorAvailabilityHtml(cache?.availability, item)}<div class="monitor-sec"><h3>${this.t("monitorMembers")}</h3><small>${this.t("monitorMembersCount", { n: item.members.length, required: item.members.filter(m => m.required).length })}</small></div>${this.monitorMembersTable(item)}</section>${history}`;
  }

  // The objects of one function as a table: a row opens the object.
  monitorMembersTable(item) {
    const rows = item.members.map(member => ({ member, object: this.findObject(member.object_key) }));
    const toneOf = ({ member }) => (member.state === "disabled" ? "mute" : member.state === "problem" ? "red" : member.state === "unverified" ? "warn" : "ok");
    const stateText = ({ member }) => this.t(member.state === "disabled" ? "monitorDisabled" : member.state === "problem" ? "monitorProblem" : member.state === "unverified" ? "monitorUnverified" : "monitorOk");
    const titleOf = ({ member, object }) => object?.name || member.object_key;
    const rulesOf = ({ member, object }) => (member.rules || []).map(rule => this.monitorRuleText(rule, object)).join("; ");
    const sorts = [
      { key: "name", label: "sortName", dir: "asc", get: titleOf },
      { key: "role", label: "monitorColRole", dir: "asc", get: r => (r.member.required ? 0 : 1) },
      { key: "state", label: "sysColState", dir: "asc", get: r => ({ problem: 0, unverified: 1, ok: 2, disabled: 3 }[r.member.state] ?? 9) },
    ];
    return this.sysList("monitor-members", rows, {
      sort: "state", sorts, tie: titleOf, empty: "monitorEmpty", pageSizes: [10, 20, 50],
      text: r => [titleOf(r), r.member.object_key, this.monitorReason(r.member.reason), rulesOf(r)].join(" "),
      rowAttrs: r => (r.object ? `data-object="${this.esc(r.member.object_key)}" tabindex="0" role="button" aria-label="${this.esc(titleOf(r))}"` : 'class="static"'),
      columns: [
        { key: "name", label: "sortName", dir: "asc", cell: r => `<div class="statcell">${this.tile(r.member.object_key.split(":")[0], "")}<div>${this.nameCell(titleOf(r), r.member.object_key)}</div></div>` },
        { key: "role", label: "monitorColRole", dir: "asc", cell: r => this.t(r.member.required ? "monitorRequired" : "monitorAdditional") },
        { key: "state", label: "sysColState", dir: "asc", cell: r => `<span class="pill ${toneOf(r)}">${stateText(r)}</span>` },
        { key: "reason", label: "monitorColReason", sortable: false, cell: r => this.esc(this.monitorReason(r.member.reason) || "—") },
      ],
    });
  }

  // The dated state changes and edits of one function; asked for again whenever the function was evaluated anew.
  monitorHistoryHtml(item) {
    const sig = `${item.state}|${item.scanned_at}|${item.enabled}`;
    const cache = (this.monitorHistory ||= {})[item.id];
    if (!cache || cache.sig !== sig) this.loadMonitorHistory(item.id, sig);
    const days = cache?.retention_days;
    const head = `<div class="panelhead"><div><h2>${this.t("monitorHistory")}</h2><p>${this.t("monitorHistoryHint", { days: days ?? "…" })}</p></div></div>`;
    if (!cache?.entries) return `<section class="panel">${head}${this.skeleton("monitorHistoryLoading")}</section>`;
    const name = key => this.findObject(key)?.name || key;
    const stateKinds = ["ok", "problem", "unverified"];
    const stateLabel = kind => this.t(kind === "ok" ? "monitorOk" : kind === "problem" ? "monitorProblem" : "monitorUnverified");
    const items = cache.entries.map(entry => {
      const state = stateKinds.includes(entry.kind), flap = entry.kind === "flapping";
      const tone = entry.kind === "problem" ? "red" : entry.kind === "unverified" || flap ? "warn" : entry.kind === "ok" ? "ok" : "mute";
      const label = state ? stateLabel(entry.kind) : this.t(`monitorHist_${entry.kind}`);
      const parts = [];
      if (flap) parts.push(this.t("monitorHistFlap", { n: entry.count, until: this.formatDate(entry.until), state: stateLabel(entry.state) }));
      if (state || flap) parts.push(this.monitorReason(entry.reason));
      if (entry.kind === "created" && entry.added?.length) parts.push(this.t("monitorHistObjects", { n: entry.added.length }));
      for (const [list, text] of [["added", "monitorHistAdded"], ["removed", "monitorHistRemoved"], ["changed", "monitorHistChanged"]]) if (entry[list]?.length) parts.push(`${this.t(text)}: ${entry[list].map(name).join(", ")}`);
      if (entry.fields?.length) parts.push(`${this.t("monitorHistFields")}: ${entry.fields.map(f => this.t(`monitorHistField_${f}`)).join(", ")}`);
      const key = (state || flap) && entry.key ? entry.key : "";
      return { entry, tone, label, details: parts.filter(Boolean).join(" · "), object: key ? name(key) : "", target: key && this.findObject(key) ? key : "", planId: "" };
    });
    // Plans of the journal that touched an object of this function, within the same period: they often explain a change.
    if (this.journal === null && !this._journalRequested) { this._journalRequested = true; this.loadJournal(); }
    const memberOf = new Map(item.members.map(m => [m.object_key.split(":").slice(1).join(":"), m.object_key]));
    const cutoff = Date.now() - (cache.retention_days ?? 0) * 86400000;
    for (const plan of this.journal || []) {
      const touched = [...new Set((plan.objects || []).filter(id => memberOf.has(id)).map(id => memberOf.get(id)))];
      if (!touched.length || !(Date.parse(plan.created_at) >= cutoff)) continue;
      const details = [this.t(`plan_status_${plan.status || "dry_run"}`), this.t("planSummary", { total: plan.summary?.total ?? 0, ok: plan.summary?.ok ?? 0, review: plan.summary?.review ?? 0, blocked: plan.summary?.blocked ?? 0 })].join(" · ");
      items.push({ entry: { kind: "plan", at: plan.created_at }, tone: "mute", label: this.t("monitorHist_plan"), details, object: touched.map(name).join(", "), target: "", planId: plan.plan_id });
    }
    const hasPlan = items.some(item => item.planId);
    const inKind = (item, kind) => (kind === "state" ? [...stateKinds, "flapping"].includes(item.entry.kind) : kind === "config" ? ["created", "edited", "enabled", "disabled"].includes(item.entry.kind) : item.entry.kind === kind);
    const sorts = [
      { key: "time", label: "monitorColWhen", dir: "desc", get: item => Date.parse(item.entry.at) },
      { key: "event", label: "monitorColEvent", dir: "asc", get: item => item.label },
    ];
    const list = items.length ? this.sysList("monitor-history", items, {
      sort: "time", dir: "desc", sorts, tie: item => Date.parse(item.entry.at), empty: "monitorHistoryEmpty",
      text: item => [this.formatDate(item.entry.at), item.label, item.details, item.object].join(" "),
      filters: [{ name: "kind", all: this.t("monitorHistAll"), options: [["state", this.t("monitorHistStates")], ["problem", this.t("monitorProblem")], ["unverified", this.t("monitorUnverified")], ["ok", this.t("monitorOk")], ["flapping", this.t("monitorHist_flapping")], ["config", this.t("monitorHistConfig")], ["plan", this.t("monitorHist_plan")]] }],
      filterFns: { kind: inKind },
      rowAttrs: item => (item.target ? `data-object="${this.esc(item.target)}" tabindex="0" role="button" aria-label="${this.esc(item.label)}"` : 'class="static"'),
      columns: [
        { key: "time", label: "monitorColWhen", dir: "desc", cell: item => this.esc(this.formatDate(item.entry.at)) },
        { key: "event", label: "monitorColEvent", dir: "asc", cell: item => `<span class="pill ${item.tone}">${this.esc(item.label)}</span>` },
        { key: "details", label: "monitorColDetails", sortable: false, cell: item => this.esc(item.details || "—") },
        { key: "object", label: "monitorColObject", sortable: false, cell: item => this.esc(item.object || "—") },
        ...(hasPlan ? [{ key: "act", label: "btColAct", sortable: false, cell: item => (item.planId ? `<button class="btn small" data-plan-open="${this.esc(item.planId)}">${this.t("openPlan")}</button>` : "") }] : []),
      ],
    }) : `<div class="emptymsg"><ha-icon icon="mdi:history"></ha-icon>${this.t("monitorHistoryEmpty")}</div>`;
    return `<section class="panel">${head}${list}</section>`;
  }

  monitorDuration(seconds) {
    const minutes = Math.round(seconds / 60), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
    if (seconds > 0 && minutes < 1) return this.t("monitorDurLess");
    if (days) return this.t("monitorDurDays", { d: days, h: hours % 24 });
    return hours ? this.t("monitorDurHours", { h: hours, m: minutes % 60 }) : this.t("monitorDurMinutes", { n: minutes });
  }

  // The shares of time in each state over the last days and one square per day (the worst state of that day).
  monitorAvailabilityHtml(a, item) {
    if (!a) return "";
    if (!a.observed_seconds) return `<div class="emptymsg"><ha-icon icon="mdi:chart-timeline-variant"></ha-icon>${this.t("monitorAvailNone")}</div>`;
    const pct = Math.floor((a.ok_seconds / a.observed_seconds) * 1000) / 10; // a fault never rounds up to 100 %
    const percent = new Intl.NumberFormat(this.lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(pct);
    const tile = (value, label, tone = "") => `<div class="avail-tile"><b class="${tone}">${this.esc(value)}</b><span>${this.esc(label)}</span></div>`;
    const tiles = [
      tile(`${percent} %`, this.t("monitorAvailOkDays", { days: a.window_days }), "ok"),
      a.problem_seconds
        ? tile(this.monitorDuration(a.problem_seconds), `${this.t("monitorAvailProblem")} · ${this.t(a.incidents === 1 ? "monitorAvailIncidents" : "monitorAvailIncidentsN", { n: a.incidents })}`)
        : tile("–", this.t("monitorAvailNoProblem")),
      a.problem_seconds ? tile(this.monitorDuration(a.longest_seconds), this.t("monitorAvailLongest")) : "",
      a.unknown_seconds ? tile(this.monitorDuration(a.unknown_seconds), this.t("monitorAvailUnknown")) : "",
      a.unstable_seconds ? tile(this.monitorDuration(a.unstable_seconds), this.t("monitorAvailUnstable")) : "",
      item?.last_problem_at ? tile(this.agoText(item.last_problem_at), this.t("monitorLastProblemLine")) : "",
    ].filter(Boolean).join("");
    const labels = { ok: "monitorOk", problem: "monitorProblem", unverified: "monitorUnverified", flapping: "monitorHist_flapping" };
    // A day with less than 1 % of impaired time reads amber, not red; unknown and unstable days are amber too.
    const dayClass = day => (day.state === "problem" && (day.problem_seconds || 0) < 864 ? "problem short" : day.state || "none");
    const dayTitle = day => `${day.date}: ${day.state ? (day.state === "problem" && day.problem_seconds ? this.t("monitorAvailDayProblem", { state: this.t(labels.problem), time: this.monitorDuration(day.problem_seconds) }) : this.t(labels[day.state])) : this.t("monitorAvailNoData")}`;
    const days = a.days.map(day => `<i class="${dayClass(day)}" title="${this.esc(dayTitle(day))}"></i>`).join("");
    const swatch = (cls, key) => `<span><i class="${cls}"></i>${this.esc(this.t(key))}</span>`;
    const legend = `<div class="monitor-legend">${swatch("ok", "monitorAvailOk")}${swatch("problem short", "monitorAvailShort")}${swatch("problem", "monitorAvailLong")}${swatch("none", "monitorAvailUnobserved")}</div>`;
    const axis = `<div class="monitor-axis"><span>${this.t("monitorAvailFrom", { days: a.window_days })}</span><span>${this.t("monitorAvailToday")}</span></div>`;
    const since = `<div class="avail-since">${this.esc(this.t("monitorAvailSince", { date: this.formatDate(a.since) }))} <ha-icon class="avail-info" icon="mdi:information-outline" title="${this.esc(this.t("monitorAvailInfo"))}"></ha-icon></div>`;
    return `<div class="avail-tiles">${tiles}</div><div class="monitor-days" role="img" aria-label="${this.esc(this.t("monitorAvail"))}">${days}</div>${axis}${legend}${since}`;
  }

  async loadMonitorHistory(id, sig) {
    const cache = this.monitorHistory[id] = { ...this.monitorHistory[id], sig };
    try {
      const response = await this._hass.callWS({ type: "ha_housekeeper/monitor_history", function_id: id });
      Object.assign(cache, { entries: response.entries, retention_days: response.retention_days, availability: response.availability });
    } catch (_) { Object.assign(cache, { entries: cache.entries || [] }); }
    if (this.view === "monitor" && this.monitorSelected === id && !this.monitorForm && !this.selected) this.render();
  }

  monitorEditor() {
    const form = this.monitorForm;
    const chosen = new Set(form.members.map(m => m.object_key));
    const query = this.monitorQuery.trim().toLowerCase();
    const groups = [["entity", "monitorTypeEntity"], ["device", "monitorTypeDevice"], ["automation", "monitorTypeAutomation"], ["scene", "monitorTypeScene"], ["config_entry", "monitorTypeIntegration"], ["other", "monitorTypeOther"]];
    const objects = this.data?.objects || [];
    const specialKeys = new Set(objects.filter(o => ["automation", "script", "scene"].includes(o.object_type)).map(o => o.object_id));
    const typeOf = o => ["script", "app"].includes(o.object_type) ? "other" : o.object_type;
    const available = objects.filter(o => groups.some(([kind]) => kind === typeOf(o)) && o.status !== "ignored" && !(o.object_type === "entity" && specialKeys.has(o.object_id)));
    const matches = query.length < 2 ? [] : available.filter(o => `${o.name} ${o.object_id} ${o.aliases?.join?.(" ") || ""} ${this.monitorObjectContext(o)}`.toLowerCase().includes(query));
    const grouped = groups.map(([kind]) => [kind, matches.filter(o => typeOf(o) === kind)]);
    const candidates = grouped.flatMap(([kind, items]) => !this.monitorType || this.monitorType === kind ? items.slice(0, this.monitorType ? 50 : 10) : []);
    // The type of the search results as chips, like the status chips of the findings page.
    const tabs = [["", "monitorTypeAll"], ...groups].map(([kind, label]) => { const on = this.monitorType === kind || (!this.monitorType && !kind); return `<button class="chip${on ? " active" : ""}" type="button" data-monitor-type="${kind}" aria-pressed="${on}">${this.t(label)}</button>`; }).join("");
    const selected = form.members.map((member, i) => {
      const object = this.findObject(member.object_key);
      const kind = member.object_key.split(":")[0];
      const rules = member.rules || [];
      const ruleFields = kind !== "entity" ? "" : `<details class="monitor-rules" ${rules.length ? "open" : ""}><summary>${this.t("monitorRules")} ${rules.length ? `(${rules.length})` : ""}</summary><p>${this.t("monitorRulesHint")}</p>${[["freshness", 24, 1, 720, "monitorRuleFreshness", "monitorRuleHours"], ["min_value", 20, -1000000000, 1000000000, "monitorRuleMinimum", object?.unit || ""], ["unavailable_for", 10, 1, 1440, "monitorRuleUnavailable", "monitorRuleMinutes"]].map(([ruleKind, fallback, min, max, label, unit]) => {
        const rule = rules.find(r => r.kind === ruleKind), enabled = Boolean(rule);
        return `<div class="monitor-rule"><label><input type="checkbox" data-monitor-rule-toggle="${i}:${ruleKind}" ${enabled ? "checked" : ""}>${this.t(label)}</label><input type="number" data-monitor-rule-value="${i}:${ruleKind}" aria-label="${this.t(label)}" value="${rule?.value ?? fallback}" min="${min}" max="${max}" step="${ruleKind === "min_value" ? "any" : "1"}" ${enabled ? "" : "disabled"}><span>${this.esc(this.t(unit))}</span></div>`;
      }).join("")}</details>`;
      return `<div class="monitor-member-wrap"><div class="row monitor-member"${object ? ` data-object="${this.esc(member.object_key)}"` : ""}><span class="tile mute"><ha-icon icon="${ICONS[kind] || "mdi:help-circle-outline"}"></ha-icon></span><span class="row-text"><strong>${this.esc(object?.name || member.object_key)}</strong><small>${this.t(`monitorType_${kind}`)} · ${this.esc(member.object_key.split(":").slice(1).join(":"))}${rules.length ? ` · ${this.esc(rules.map(rule => this.monitorRuleText(rule, object)).join("; "))}` : ""}</small></span><label class="monitor-check"><input type="checkbox" data-monitor-required="${i}" ${member.required ? "checked" : ""}>${this.t("monitorRequired")}</label><button type="button" class="iconbtn" data-monitor-remove="${i}" aria-label="${this.t("monitorRemove")}" title="${this.t("monitorRemove")}"><ha-icon icon="mdi:close"></ha-icon></button></div>${ruleFields}</div>`;
    }).join("");
    const suggestions = form.members.length ? this.monitorSuggestions() : [];
    const suggested = suggestions.length ? `<div class="monitor-suggest"><span>${this.t("monitorSuggestions")}:</span>${suggestions.map(({ key, object, reason, probable }) => `<button type="button" class="chip dashed" data-monitor-pick="${this.esc(key)}" title="${this.esc([reason, probable ? this.t("monitorSuggestionProbable") : ""].filter(Boolean).join(" · "))}">+ ${this.esc(object.name || object.object_id)}</button>`).join("")}</div>` : "";
    const picks = groups.map(([kind, label]) => {
      const items = candidates.filter(o => typeOf(o) === kind);
      if (!items.length) return "";
      return `<div class="monitor-group"><h3>${this.t(label)} <span>${grouped.find(([type]) => type === kind)[1].length}</span></h3>${items.map(o => {
        const key = this.objectKey(o), added = chosen.has(key);
        const context = this.monitorObjectContext(o);
        return `<div class="row monitor-choice" data-object="${this.esc(key)}"><span class="tile mute"><ha-icon icon="${ICONS[o.object_type] || "mdi:help-circle-outline"}"></ha-icon></span><span class="row-text"><strong>${this.esc(o.name || o.object_id)}</strong><small>${this.t(`monitorType_${o.object_type}`)} · ${this.esc(o.object_id)}${context ? ` · ${this.esc(context)}` : ""}</small></span><button class="btn small ${added ? "quiet" : ""}" type="button" data-monitor-pick="${this.esc(key)}" ${added ? "disabled" : ""}>${this.t(added ? "monitorAdded" : "monitorPick")}</button></div>`;
      }).join("")}${grouped.find(([type]) => type === kind)[1].length > items.length ? `<p class="monitor-search-note">${this.t("monitorMoreResults")}</p>` : ""}</div>`;
    }).join("");
    const searchResult = query.length < 2 ? this.t("monitorSearchStart") : candidates.length ? picks : this.t("monitorSearchNone");
    const needs = !form.name.trim() ? "monitorNeedName" : !form.members.length ? "monitorNeedMembers" : "";
    return `<div class="page-editor"><section class="panel u-mb14"><div class="panelhead"><h2>${this.t(form.id ? "monitorEditTitle" : "monitorAdd")}</h2></div><div class="monitor-fields monitor-twocol"><label>${this.t("monitorName")}<input data-monitor-name maxlength="80" value="${this.esc(form.name)}"></label><label>${this.t("monitorDescription")}<textarea data-monitor-description maxlength="240" rows="1">${this.esc(form.description)}</textarea></label></div><label class="row monitor-notify"><span class="row-text"><strong>${this.t("monitorEnabled")}</strong><small>${this.t("monitorEnabledHint")}</small></span><input class="policyswitch" type="checkbox" role="switch" data-monitor-enabled ${form.enabled !== false ? "checked" : ""}></label><label class="row monitor-notify"><span class="row-text"><strong>${this.t("monitorNotify")}</strong><small>${this.t("monitorNotifyHint")}</small></span><input class="policyswitch" type="checkbox" role="switch" data-monitor-notify ${form.notify ? "checked" : ""}></label><div class="monitor-sec"><h3>${this.t("monitorMembers")}</h3><small>${this.t("monitorRequiredCount", { n: form.members.filter(m => m.required).length, m: form.members.filter(m => !m.required).length })}</small></div>${selected || `<div class="emptymsg">${this.t("monitorChoose")}</div>`}<div class="monitor-add"><input type="search" data-monitor-search aria-label="${this.t("monitorSearch")}" placeholder="${this.t("monitorSearch")}" value="${this.esc(this.monitorQuery)}"><div class="monitor-tabs" role="group" aria-label="${this.t("monitorTypeFilter")}">${tabs}</div>${suggested}<div class="monitor-results">${candidates.length ? searchResult : `<p class="monitor-search-note">${searchResult}</p>`}</div></div></section><div data-monitor-preview aria-live="polite">${this.monitorPreviewHtml()}</div><div class="toolbar savebar">${form.id ? `<button class="btn dangersoft" data-monitor-delete><ha-icon icon="mdi:delete-outline"></ha-icon>${this.t("monitorDelete")}</button>` : ""}<span class="error" role="alert">${this.esc(this.monitorError)}</span><span class="toolgap"></span><button class="btn" data-monitor-cancel>${this.t("monitorCancel")}</button><button class="btn primary" data-monitor-save data-need="${needs}">${this.t("monitorSave")}</button></div></div>`;
  }

  bindMonitor(root) {
    this._monitorDescriptionObserver?.disconnect();
    this._monitorDescriptionObserver = null;
    root.querySelector("[data-monitor-add]")?.addEventListener("click", () => { this.monitorForm = { name: "", description: "", enabled: true, notify: true, members: [] }; this.monitorQuery = ""; this.monitorType = ""; this.monitorPreview = null; this.monitorError = ""; this.render(); });
    root.querySelectorAll("[data-monitor-filter]").forEach(el => el.onclick = () => { this.monitorFilter = el.dataset.monitorFilter; this.render(); });
    root.querySelectorAll("[data-monitor-last]").forEach(el => el.onclick = () => { this.noteJump?.("monitor"); this.view = "monitor"; this.selected = null; this.trail = []; this.pages = {}; this.monitorForm = null; this.monitorSelected = el.dataset.monitorLast; this.render(); });
    root.querySelectorAll("[data-monitor-open]").forEach(el => el.onclick = () => { this.monitorSelected = el.dataset.monitorOpen; this.pages = {}; this.render(); });
    root.querySelector("[data-monitor-back]")?.addEventListener("click", () => { this.monitorSelected = null; this.render(); });
    root.querySelector("[data-monitor-edit]")?.addEventListener("click", () => { const item = this.monitorFunctions().find(f => f.id === this.monitorSelected); this.monitorForm = { id: item.id, name: item.name, description: item.description, enabled: item.enabled !== false, notify: item.notify, members: item.members.map(m => ({ object_key: m.object_key, required: m.required, rules: m.rules || [] })) }; this.monitorQuery = ""; this.monitorType = ""; this.monitorPreview = null; this.monitorError = ""; this.render(); this.queueMonitorPreview(); });
    root.querySelectorAll("[data-monitor-cancel]").forEach(el => el.onclick = () => { globalThis.clearTimeout?.(this._monitorPreviewTimer); this._monitorPreviewToken = (this._monitorPreviewToken || 0) + 1; this.monitorForm = null; this.monitorError = ""; this.render(); });
    root.querySelector("[data-monitor-name]")?.addEventListener("input", ev => { this.monitorForm.name = ev.target.value; const save = root.querySelector("[data-monitor-save]"); if (save) save.dataset.need = !this.monitorForm.name.trim() ? "monitorNeedName" : !this.monitorForm.members.length ? "monitorNeedMembers" : ""; });
    const description = root.querySelector("[data-monitor-description]");
    if (description) {
      const resize = () => {
        description.style.height = "auto";
        description.style.height = `${description.scrollHeight + description.offsetHeight - description.clientHeight}px`;
      };
      resize();
      description.addEventListener("input", ev => { this.monitorForm.description = ev.target.value; resize(); });
      if (globalThis.ResizeObserver) {
        let width = description.parentElement?.clientWidth;
        this._monitorDescriptionObserver = new globalThis.ResizeObserver(entries => {
          const next = entries[0]?.contentRect.width;
          if (next !== width) { width = next; resize(); }
        });
        this._monitorDescriptionObserver.observe(description.parentElement);
      }
    }
    root.querySelector("[data-monitor-enabled]")?.addEventListener("change", ev => { this.monitorForm.enabled = ev.target.checked; });
    root.querySelector("[data-monitor-notify]")?.addEventListener("change", ev => { this.monitorForm.notify = ev.target.checked; });
    root.querySelector("[data-monitor-search]")?.addEventListener("input", ev => { this.monitorQuery = ev.target.value; const at = ev.target.selectionStart; globalThis.clearTimeout?.(this._monitorTimer); this._monitorTimer = globalThis.setTimeout?.(() => { this.render(); const input = this.shadowRoot.querySelector("[data-monitor-search]"); input?.focus(); input?.setSelectionRange?.(at, at); }, SEARCH_DEBOUNCE_MS); });
    root.querySelectorAll("[data-monitor-type]").forEach(el => el.onclick = () => { this.monitorType = el.dataset.monitorType; this.render(); this.shadowRoot.querySelector(`[data-monitor-type="${this.monitorType}"]`)?.focus(); });
    root.querySelectorAll("[data-monitor-pick]").forEach(el => el.onclick = () => { if (this.monitorForm.members.some(m => m.object_key === el.dataset.monitorPick)) return; this.monitorForm.members.push({ object_key: el.dataset.monitorPick, required: true, rules: [] }); this.render(); this.queueMonitorPreview(); });
    root.querySelectorAll("[data-monitor-remove]").forEach(el => el.onclick = () => { this.monitorForm.members.splice(Number(el.dataset.monitorRemove), 1); this.render(); this.queueMonitorPreview(); });
    root.querySelectorAll("[data-monitor-required]").forEach(el => el.onchange = () => { this.monitorForm.members[Number(el.dataset.monitorRequired)].required = el.checked; this.render(); this.queueMonitorPreview(); });
    root.querySelectorAll("[data-monitor-rule-toggle]").forEach(el => el.onchange = () => {
      const [index, kind] = el.dataset.monitorRuleToggle.split(":");
      const member = this.monitorForm.members[Number(index)];
      member.rules ||= [];
      member.rules = member.rules.filter(rule => rule.kind !== kind);
      if (el.checked) member.rules.push({ kind, value: kind === "freshness" ? 24 : kind === "min_value" ? 20 : 10 });
      this.render(); this.queueMonitorPreview();
    });
    root.querySelectorAll("[data-monitor-rule-value]").forEach(el => el.onchange = () => {
      const [index, kind] = el.dataset.monitorRuleValue.split(":");
      const member = this.monitorForm.members[Number(index)];
      const rule = member.rules?.find(value => value.kind === kind);
      if (!rule) return;
      if (!el.checkValidity() || !el.value.trim()) { el.value = rule.value; return; }
      rule.value = Number(el.value);
      this.queueMonitorPreview();
    });
    root.querySelector("[data-monitor-save]")?.addEventListener("click", () => this.saveMonitor());
    root.querySelector("[data-monitor-delete]")?.addEventListener("click", () => this.confirmAsk(this.t("monitorConfirmDelete", { name: this.monitorForm.name }), () => this.deleteMonitor()));
  }

  async saveMonitor() {
    const form = this.monitorForm;
    const need = !form.name.trim() ? "monitorNeedName" : !form.members.length ? "monitorNeedMembers" : "";
    if (need) { this.monitorError = this.t(need); this.render(); return; }
    globalThis.clearTimeout?.(this._monitorPreviewTimer);
    this._monitorPreviewToken = (this._monitorPreviewToken || 0) + 1;
    try {
      const response = await this._hass.callWS({ type: "ha_housekeeper/monitor_save", ...(form.id ? { function_id: form.id } : {}), name: form.name, description: form.description, enabled: form.enabled !== false, notify: form.notify, members: form.members });
      this.data.monitor = response.functions; this.monitorSelected = response.function_id; this.monitorForm = null; this.monitorError = ""; this.render();
    } catch (err) { this.monitorError = this.t("monitorSaveFailed", { reason: this.errText(err) }); this.render(); }
  }

  async deleteMonitor() {
    try {
      const response = await this._hass.callWS({ type: "ha_housekeeper/monitor_delete", function_id: this.monitorForm.id });
      this.data.monitor = response.functions; delete this.monitorHistory?.[this.monitorForm.id]; this.monitorSelected = null; this.monitorForm = null; this.monitorError = ""; this.render();
    } catch (err) { this.monitorError = this.t("monitorDeleteFailed", { reason: this.errText(err) }); this.render(); }
  }
}
