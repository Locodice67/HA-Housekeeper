// FindingsMixin: methods of the panel element, mixed into the class in 99-register.js.
class FindingsMixin {
  sortedFindings(includeIgnored = false) {
    const { plain } = this.collators();
    return this.data.findings.filter(f => includeIgnored || !f.ignored).sort((a, b) => (this.impactScore(b) - this.impactScore(a))
      || plain.compare(String(a.object_id), String(b.object_id)));
  }

  // The reason of a finding as the person sees it: an outage of an integration, otherwise its class (unused, broken reference …).
  // An outage is whatever starts a chain (integration not loaded or asking for a login, device down, app stopped);
  // what is left of "problem" then are automations and scripts that cannot work.
  findingReason(f) { return CAUSE_OWN_RULES.includes(f.rule_id) ? "outage" : f.classification; }
  reasonLabel(r) { return r === "group:red" ? this.t("sumGroupUrgent") : r === "group:tidy" ? this.t("sumGroupTidy") : r === "outage" ? this.t("chip_outage") : r === "problem" ? this.t("reasonProblem") : this.statusLabel(r); }
  // The two groups of the tiles: red reasons are faults, the rest is tidying up.
  findingTileGroup(f) { return this.reasonTone(this.findingReason(f)) === "red" ? "red" : "tidy"; }
  // The tile filter: one reason (or rule), or a whole group as "group:red" / "group:tidy".
  matchesFindingFilter(f, filter = this.findingFilter) { return filter.startsWith("group:") ? this.findingTileGroup(f) === filter.slice(6) : this.findingReason(f) === filter || f.rule_id === filter; }
  reasonTone(r) { const tone = FAULT_REASONS.includes(r) ? "red" : this.tone(r); return tone === "red" ? "red" : tone === "warn" ? "warn" : "mute"; }

  // Impact first, then how sure the diagnosis is: the fraction keeps the certainty from outranking a level.
  impactScore(f) { return (IMPACT_RANK[f.impact] ?? 0) + (f.confidence || 0) / 2; }

  // The level and the facts behind it, as text: "High impact (critical · used by 3 automations)".
  impactLine(f, withFacts = true) {
    if (!f.impact) return "";
    const facts = withFacts ? (f.impact_facts || []).map(x => this.t(`impactFact_${x.fact}`, { n: x.n ?? "", id: x.id ?? "", why: this.t(`impactWhy_${x.why}`) })) : [];
    return `${this.t(`impact_${f.impact}`)}${facts.length ? ` (${facts.join(" · ")})` : ""}`;
  }

  // The entries of the findings list, as impact levels: every outage chain once at its top, every finding without a cause.
  // Followers are not entries of their own; hidden, known and snoozed findings do not count.
  entryLevels() {
    const top = this.causeList().filter(c => !c.parent_id).map(c => c.impact || "none");
    const single = this.data.findings.filter(f => !f.ignored && !f.cause_id).map(f => f.impact || "none");
    return [...top, ...single];
  }

  // The state of the house in points: the rated objects, minus the weight of each object that has a finding (high 2,
  // medium 1, low a half, info nothing), scaled to 100 and never below 0. An object counts once, with its worst level;
  // the follow-ups of a cause are objects like any other and count with their own level. The colour does not come
  // from the number but from what is open: red while an urgent topic is, yellow while another topic or an object
  // with high or medium impact is, green otherwise. Maintenance (goals, reminders, quarantine) never colours it.
  health() {
    // As the inventory lists them: an automation, script or scene is one object, not also its registry entity.
    const objects = this.invObjects().filter(o => HEALTH_TYPES.includes(o.object_type));
    const base = objects.length;
    const known = new Set(objects.map(o => this.objectKey(o)));
    // The same number in every view: what it counts is fetched here, not only when the overview opens. The database
    // check stays out of it, because it reads the recorder and only runs once Maintenance is opened.
    this.ensureBackup?.(); this.ensureTrend?.();
    const open = this.todoItems().filter(i => i.key !== "db"), red = open.filter(i => i.tone === "red").length, tasks = open.length;
    const stateRed = open.filter(i => i.area === "state" && i.tone === "red").length;
    const worst = new Map(), order = ["info", "low", "medium", "high"];
    const note = (key, level) => {
      if (!known.has(key) || !order.includes(level)) return;
      if (!worst.has(key) || order.indexOf(level) > order.indexOf(worst.get(key))) worst.set(key, level);
    };
    for (const c of this.causeList().filter(c => !c.parent_id)) note(`${c.object_type}:${c.object_id}`, c.impact);
    for (const f of this.data.findings.filter(f => !f.ignored)) note(this.findingKey(f), f.impact);
    const levels = [...worst.values()];
    const lines = [...order].reverse().map(level => {
      const n = levels.filter(l => l === level).length;
      return { level, n, weight: HEALTH_WEIGHTS[level], points: Math.round(n * HEALTH_WEIGHTS[level] * 10) / 10 };
    }).filter(l => l.n);
    const load = Math.round(lines.reduce((sum, l) => sum + l.points, 0) * 10) / 10;
    // Rounded down, so that a house with a finding never reads 100.
    const percent = base > 0 ? Math.max(0, Math.floor(Math.round(1000 * (1 - load / base) * 1e6) / 1e6) / 10) : 100;
    const affected = levels.filter(l => l !== "info").length;
    const pending = open.some(i => i.area !== "care") || levels.includes("high") || levels.includes("medium");
    const tone = red ? "red" : pending ? "warn" : "ok";
    const label = tone === "ok" ? "healthGood" : tone === "warn" ? "healthCheck" : "healthBad";
    return { percent, tone, label, affected, base, tasks, red, later: tasks - red, load, ok: Math.max(0, Math.round((base - load) * 10) / 10), lines, stateRed, entries: levels.length };
  }

  findingRowContent(finding, inGroup = false) {
    const key = this.findingKey(finding), object = this.findObject(key);
    const title = object?.name || finding.object_id;
    const subtitle = finding.rule_id === "entity.possible_duplicate"
      ? `${this.t("duplicateOf")} ${this.esc(finding.affected_object)}`
      : ["automation.blocked", "automation.dead_actions", "script.dead_actions", "automation.dead_condition"].includes(finding.rule_id)
        ? this.esc((finding.evidence?.[0]?.entities || []).slice(0, 3).join(", ") + ((finding.evidence?.[0]?.total || 0) > 3 ? " …" : ""))
      : finding.rule_id === "automation.goal_missed"
        ? this.esc(this.goalLine(finding))
        : finding.rule_id === "entity.stale"
        ? this.esc(this.staleLine(finding))
        : finding.affected_object
          ? [this.esc(finding.affected_object), this.esc(this.placeText(finding, inGroup)), this.esc(this.suggestText(finding))].filter(Boolean).join(" · ")
          : this.esc(object?.reason ? this.t(object.reason) : this.findingTitle(finding));
    return { key, object, title, subtitle: `${subtitle}${finding.ignored ? ` · ${this.hiddenWhy(finding)}` : ""}${finding.resurfaced ? ` · ${this.t("dueLabel")}` : ""}${finding.mark_outside_window ? ` · ${this.t("markOutside")}` : ""}<span class="fextra">${this.statusTags(finding)}${this.followOf(finding)}${this.ownerNote(finding)}${this.oftenChip(finding)}</span>` };
  }

  // pick = false outside the findings list: there is no bar for the actions on a selection there.
  findingRow(finding, inGroup = false, pick = true) {
    const { key, object, title, subtitle } = this.findingRowContent(finding, inGroup);
    const button = `<button class="row ${finding.ignored ? "dim" : ""}" data-object="${this.esc(key)}">${this.tile(object?.object_type || "entity", this.tone(finding.classification))}<span class="row-text"><strong>${this.esc(title)}</strong><small>${subtitle}${finding.first_detected_at ? `<span class="msince"> · ${this.t("sortSince")} ${this.formatDate(finding.first_detected_at)}</span>` : ""}</small></span>${this.kindChip(this.reasonLabel(this.findingReason(finding)))}${this.impactChip(finding.impact)}</button>`;
    return `<div class="rowwrap">${pick ? `<input type="checkbox" class="selbox" data-fsel="${this.esc(finding.key)}" ${this.findSel.has(finding.key) ? "checked" : ""} aria-label="${this.esc(title)}">` : ""}${button}${this.rowMenu(finding)}</div>${this.rowDecide(finding)}`;
  }

  // `body`: rows already rendered, as a grouped list pages them.
  findingsTable(items, body = null) {
    const st = this.lv.findings, header = (key, label, dir = "asc") => {
      const on = st.sort === key;
      return `<th scope="col" aria-sort="${on ? (st.dir === "desc" ? "descending" : "ascending") : "none"}"><button type="button" class="thbtn" data-lsort="findings|${key}|${dir}">${this.t(label)}${on ? ` <span aria-hidden="true">${st.dir === "desc" ? "↓" : "↑"}</span>` : ""}</button></th>`;
    };
    const idSort = `<button type="button" class="thbtn th-alt" data-lsort="findings|id|asc">${this.t("sortId")}${st.sort === "id" ? ` <span aria-hidden="true">${st.dir === "desc" ? "↓" : "↑"}</span>` : ""}</button>`;
    const head = `<thead><tr><th scope="col" class="selcol"><span class="sr-only">${this.t("selectPage")}</span></th><th scope="col" aria-sort="${["name", "id"].includes(st.sort) ? (st.dir === "desc" ? "descending" : "ascending") : "none"}"><button type="button" class="thbtn" data-lsort="findings|name|asc">${this.t("sortName")}${st.sort === "name" ? ` <span aria-hidden="true">${st.dir === "desc" ? "↓" : "↑"}</span>` : ""}</button>${idSort}</th>${header("impact", "sortImpact", "desc")}${header("certainty", "sortCertainty", "desc")}${header("since", "sortSince", "desc")}${header("rule", "sortRuleGrouped")}<th scope="col"><span class="sr-only">${this.t("rowMenu")}</span></th></tr></thead>`;
    // In the grouped view every row is a head of an object; in the flat one every row is a finding.
    const rows = body ?? items.map(item => (item.findings ? this.nodeRows(item) : this.findingTableRow(item))).join("");
    return `<div class="tablewrap lt findings-table${this.isDenseList("findings") ? " dense-list" : ""}"><table>${head}<tbody>${rows}</tbody></table></div>`;
  }

  // One finding as a row of the table; below a head (depth) it is indented and keeps the room of the fold arrow.
  findingTableRow(f, depth = 0, inGroup = false) {
    const { key, object, title, subtitle } = this.findingRowContent(f, inGroup);
    const pick = `<input type="checkbox" class="selbox" data-fsel="${this.esc(f.key)}" ${this.findSel.has(f.key) ? "checked" : ""} aria-label="${this.esc(title)}">`;
    const link = `<button type="button" class="finding-link" data-object="${this.esc(key)}">${this.tile(object?.object_type || "entity", this.tone(f.classification))}<span class="finding-name"><strong>${this.esc(title)}</strong><span class="id">${this.esc(f.object_id)}</span><small>${subtitle}</small></span></button>`;
    const name = depth ? `<div class="finding-link-group"><span class="finding-fold-gap" aria-hidden="true"></span>${link}</div>` : link;
    const detail = this.rowDecide(f);
    return `<tr class="finding-data${f.ignored ? " dim" : ""}${depth ? ` og lvl${Math.min(depth, 3)}` : ""}"><td class="selcol">${pick}</td><td>${name}</td><td data-label="${this.t("sortImpact")}">${this.impactChip(f.impact) || `<span class="muted">–</span>`}</td><td data-label="${this.t("sortCertainty")}">${f.confidence == null ? "–" : `${Math.round(f.confidence * 100)} %`}</td><td data-label="${this.t("sortSince")}">${this.ageCell(f.first_detected_at)}</td><td data-label="${this.t("sortRule")}"><span class="finding-label">${this.esc(this.reasonLabel(this.findingReason(f)))}</span><small class="finding-rule">${this.esc(f.rule_id)}</small></td><td class="finding-action">${this.rowMenu(f)}</td></tr>${detail ? `<tr class="finding-detail"><td colspan="7">${detail}</td></tr>` : ""}`;
  }

  findingSorts() {
    return [
      { key: "impact", label: "sortImpact", dir: "desc", get: f => this.impactScore(f) },
      { key: "certainty", label: "sortCertainty", dir: "desc", get: f => f.confidence },
      { key: "name", label: "sortName", dir: "asc", get: f => this.findObject(this.findingKey(f))?.name || f.object_id },
      { key: "id", label: "sortId", dir: "asc", get: f => f.object_id },
      { key: "since", label: "sortSince", dir: "desc", get: f => f.first_detected_at },
      { key: "rule", label: "sortRule", dir: "asc", get: f => f.rule_id },
    ];
  }

  // The findings as shown (classification chip, search, type filter, sort); the export uses the same list.
  visibleFindings() {
    const all = this.sortedFindings(true).filter(f => this.statusMatch(f));
    const classed = this.findingFilter ? all.filter(f => this.matchesFindingFilter(f)) : all;
    const follows = this.findingFollowers ? classed.filter(f => this.isFollowUp(f)) : classed;
    const afterOnly = this.findingAfter ? follows.filter(f => this.corr?.by_key?.[f.key]) : follows;
    const scanNew = this.findingScanNew ? this.scanNewKeys() : null;
    const outages = this.findingOutages ? this.outageKeys(this.findingOutages === true ? "" : this.findingOutages) : null;
    const held = this.findingHeld ? this.heldKeys() : null;
    const cause = this.findingCause ? this.causeKeys(this.findingCause) : null;
    const byClass = [scanNew, outages, held, cause].reduce((list, keys) => (keys ? list.filter(f => keys.has(f.key)) : list), afterOnly);
    const kept = this.lvState("findings", "impact", "desc").f;
    delete kept.fresh; // new and in work are chips of the status row now
    if (kept.type === "_causes") delete kept.type; // "causes only" is gone: the outage tile and the grouped list show them
    return this.refine("findings", byClass, {
      text: f => [this.findObject(this.findingKey(f))?.name, f.object_id, f.rule_id, f.affected_object].join(" "),
      filters: { type: (f, v) => this.findingType(f) === v, area: (f, v) => this.findingArea(f) === v, integration: (f, v) => this.findingIntegrations(f).includes(v), impact: (f, v) => (f.impact || "none") === v, by: (f, v) => (["mark", "rule", "label"].includes(f.ignored_by) ? f.ignored_by : "user") === v },
      sorts: this.findingSorts(), tie: f => f.object_id,
    });
  }

  exportRows() {
    const shown = this.visibleFindings();
    const list = this.findSel.size ? shown.filter(f => this.findSel.has(f.key)) : shown;
    return list.map(f => {
      const key = this.findingKey(f), object = this.findObject(key);
      return {
        rule_id: f.rule_id, classification: f.classification, confidence: f.confidence, impact: f.impact || "", cause: f.cause_id || "",
        object_id: f.object_id, name: object?.name || "", affected_object: f.affected_object || "",
        first_detected_at: f.first_detected_at || "", location: f.evidence?.[0]?.location || "",
      };
    });
  }

  exportFindings(format) {
    const rows = this.exportRows();
    let body, type;
    if (format === "json") {
      body = JSON.stringify({ scanned_at: this.data.meta.scanned_at, findings: rows }, null, 2);
      type = "application/json";
    } else {
      const cols = Object.keys(rows[0] || { rule_id: 0, classification: 0, confidence: 0, object_id: 0, name: 0, affected_object: 0, first_detected_at: 0, location: 0 });
      // Leading =,+,-,@ would be evaluated as a formula by spreadsheet tools.
      body = "\ufeff" + [cols.join(","), ...rows.map(r => cols.map(c => csvCell(r[c])).join(","))].join("\r\n");
      type = "text/csv";
    }
    const url = URL.createObjectURL(new Blob([body], { type: `${type};charset=utf-8` }));
    const a = document.createElement("a");
    a.href = url; a.download = `ha-housekeeper-findings.${format}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // The area and the integrations of the object of a finding, for the filters of the list bar.
  findingArea(f) { const o = this.findObject(this.findingKey(f)); return o ? this.areaName(o) : ""; }
  findingIntegrations(f) {
    const o = this.findObject(this.findingKey(f));
    if (!o) return [];
    if (o.object_type === "config_entry") return [o.domain].filter(Boolean);
    const device = o.object_type === "device" ? o : o.device_id ? this.findObject(`device:${o.device_id}`) : null;
    return [...new Set([o.object_type === "entity" ? o.platform : null, ...(device?.config_entry_ids || []).map(id => this.findObject(`config_entry:${id}`)?.domain)].filter(Boolean))];
  }

  // Every filter that narrows the list, each as a note with its own ✕, and one button that clears them all. The status
  // row is not a filter here: the tiles count within it.
  findingNote(filters = []) {
    const st = this.lv.findings || { q: "", f: {} }, notes = [];
    if (this.findingFilter) notes.push(["class", this.reasonLabel(this.findingFilter)]);
    if (this.findingFollowers) notes.push(["followers", this.t("followersFilter")]);
    if (this.findingAfter) notes.push(["after", this.t("corrTile")]);
    if (this.findingScanNew) notes.push(["scanNew", this.t("scanNewFilter", { n: this.formatNumber(this.scanNewKeys().size) })]);
    if (this.findingCause) { const c = this.causeById(this.findingCause); notes.push(["cause", c ? this.t(`cause_${c.kind}`, { name: c.name }) : this.findingCause]); }
    if (this.findingHeld) notes.push(["held", this.t("heldFilter", { n: this.formatNumber(this.heldKeys().size) })]);
    // The note names the row of the overview it came from: Outages (high) or Further outages (the others).
    if (this.findingOutages) notes.push(["outages", this.t(this.findingOutages === "high" ? "outagesFilterHigh" : this.findingOutages === "medium" ? "outagesFilterMedium" : "outagesFilter", { n: this.formatNumber(this.countedOutages(this.findingOutages === true ? "" : this.findingOutages).length) })]);
    if (st.q?.trim()) notes.push(["q", `„${st.q.trim()}“`]);
    for (const f of filters) if (st.f[f.name]) notes.push([`lf:${f.name}`, `${f.all}: ${(f.options.find(([v]) => v === st.f[f.name]) || [])[1] ?? st.f[f.name]}`]);
    if (!notes.length) return "";
    const chips = notes.map(([key, label]) => `<button type="button" class="chip fchip" data-fclear="${this.esc(key)}" aria-label="${this.esc(this.t("filterRemove", { name: label }))}">${this.esc(label)} <ha-icon icon="mdi:close"></ha-icon></button>`).join("");
    return `<div class="filteron fnotes" role="status"><ha-icon icon="mdi:filter-variant"></ha-icon>${chips}<span class="spacer"></span><button class="btn quiet" data-finding-reset>${this.t("filterResetAll")}</button></div>`;
  }

  // Back to the plain list of the chosen status: the tiles, the notes and the list bar start empty.
  clearFindingFilters() {
    this.findingFilter = ""; this.findingFollowers = false; this.findingAfter = false; this.findingScanNew = false; this.findingOutages = false; this.findingHeld = false; this.findingCause = "";
    const st = this.lvState("findings", "impact", "desc");
    st.q = ""; st.f = {}; this.persistLv("findings");
  }

  // Opens or closes every head of the grouped list at once, the ones below a closed head too.
  foldAllFindings(open) {
    const ids = [...(this._nodeFoldIds || []), ...Object.keys(this._findGroups || {}).filter(g => g.startsWith("bg:"))];
    const next = { ...this.folds };
    ids.forEach(id => { next[id] = open; });
    this.folds = next; this.render();
  }

  // The help under the title of the findings page: the terms, and what each number counts.
  findingsHelp() {
    const t = k => this.t(k);
    const terms = ["Finding", "Followups", "Watch", "Together"].map(k => `<div><h3>${t(`help${k}T`)}</h3><p>${t(`help${k}`)}</p></div>`).join("");
    const nums = ["All", "Trend", "Tabs", "Follow", "Level", "Cert", "Since", "Watched", "Incidents", "Often"].map(k => `<b>${t(`helpN${k}T`)}</b><span>${t(`helpN${k}`)}</span>`).join("");
    return `<section class="panel pad helpcard"><div class="helphead"><strong>${t("helpTitle")}</strong><button class="btn quiet" data-fold="findings_help" aria-expanded="true"><ha-icon icon="mdi:close"></ha-icon>${t("helpClose")}</button></div><div class="helpgrid">${terms}</div><div class="helpnums">${nums}</div></section>`;
  }

  // Grouped (every finding below its object, the objects below their causes) or flat (every finding a row of its own).
  // The choice holds with filters too.
  viewSwitch(grouped) {
    const btn = (flat, label) => `<button type="button" class="chip ${flat === !grouped ? "active" : ""}" data-toggle-followers="${flat ? "flat" : "grouped"}" aria-pressed="${flat === !grouped}">${label}</button>`;
    return `<span class="viewswitch seg" role="group" aria-label="${this.esc(this.t("viewLabel"))}">${btn(false, this.t("viewGrouped"))}${btn(true, this.t("viewFlat"))}</span>`;
  }

  findingsView() {
    if (this._impactOnce) { this.visibleFindings(); if (this.lv.findings) { this.lv.findings.f.impact = this._impactOnce; this.persistLv("findings"); } this._impactOnce = ""; }
    const all = this.sortedFindings(true).filter(f => this.statusMatch(f));
    const sorted = this.visibleFindings();
    const st = this.lv.findings;
    const open = !this.findingFilter && !this.findingFollowers && !this.findingAfter && !this.findingScanNew && !this.findingOutages && !this.findingHeld && !this.findingCause && !st.q && !Object.values(st.f || {}).some(Boolean);
    const grouped = !this.showFollowers;
    const values = pick => [...new Set(all.flatMap(f => [].concat(pick(f))).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
    // Each filter asks its own question: what kind of object, where, from which integration, how much it matters.
    const filters = [
      { name: "type", all: this.t("allObjectTypes"), options: values(f => this.findingType(f)).map(x => [x, this.t(x)]) },
      { name: "area", all: this.t("allAreas"), options: values(f => this.findingArea(f)).map(a => [a, a]) },
      { name: "integration", all: this.t("allIntegrations"), options: values(f => this.findingIntegrations(f)).map(d => [d, d]) },
      { name: "impact", all: this.t("allSeverities"), options: ["high", "medium", "low", "info"].map(x => [x, this.t(`chip_${x}`)]) },
      ...(this.findingStatus === "hidden" ? [{ name: "by", all: this.t("hiddenByAll"), options: ["user", "mark", "rule", "label"].map(x => [x, this.t(`hiddenBy_${x}`)]) }] : []),
    ];
    // The export button of the list bar, as on every list: the rows as shown, or only the selected ones.
    const cols = ["rule_id", "classification", "confidence", "impact", "cause", "object_id", "name", "affected_object", "first_detected_at", "location"];
    this.setExporter("findings", "ha-housekeeper-findings", cols, () => this.exportRows().map(r => cols.map(c => r[c])));
    const bar = this.listBar("findings", { table: true, dense: true, note: false, sorts: this.findingSorts(), filters });
    this.ensureSeries();
    const spark = (key, rising) => this.series ? this.sparkline(key, rising) : "";
    this.ensureCorrelations();
    const isFollower = f => this.isFollowUp(f);
    const afterAll = all.filter(f => this.corr?.by_key?.[f.key]);
    const afterFollows = afterAll.filter(isFollower).length, afterCount = afterAll.length;
    // The tiles are fixed: they count the open findings whatever status the list shows, every finding of a reason with
    // the follow-ups, and every reason keeps its place; one without open findings stays as a quiet 0 that filters nothing.
    const openAll = this.data.findings.filter(f => !f.ignored);
    const tile = c => {
      const mine = openAll.filter(f => this.findingReason(f) === c), follows = mine.filter(isFollower).length;
      if (!mine.length) return { label: this.reasonLabel(c), value: "0", tone: "zero", spark: spark(`reason:${c}`, "bad") };
      return { label: this.reasonLabel(c), value: this.formatNumber(mine.length), sub: follows ? this.esc(this.t("findingsOfFollow", { n: this.formatNumber(follows) })) : undefined, tone: this.reasonTone(c), filter: c, active: this.findingFilter === c, spark: spark(`reason:${c}`, "bad") };
    };
    // A fixed order, from the cause to what it does; a reason no list names comes last.
    const ordered = [...FINDING_ORDER, ...new Set(openAll.map(f => this.findingReason(f)).filter(c => !FINDING_ORDER.includes(c)))];
    // The groups follow the colour of a reason: red ones are faults, the rest is tidying up, also a reason no list names.
    const faults = ordered.filter(c => this.reasonTone(c) === "red"), tidy = ordered.filter(c => this.reasonTone(c) !== "red");
    const followers = openAll.filter(isFollower).length;
    const allObjects = this.countObjects(this.objectTree(openAll, openAll, true));
    // "All findings" clears the filters; it is not marked itself, only a filter that is on is.
    const total = { label: this.t("allFindings"), value: this.formatNumber(openAll.length), sub: this.esc(this.t(allObjects === 1 ? "findingsOnObjects1" : "findingsOnObjects", { m: this.formatNumber(allObjects) })), tone: openAll.length ? "warn" : "ok", filter: "", active: false, spark: spark("open", "bad") };
    const followLink = followers ? `<button type="button" class="link sumfollow${this.findingFollowers ? " on" : ""}" data-finding-followers aria-pressed="${Boolean(this.findingFollowers)}">${this.esc(this.t("findingsOfFollow", { n: this.formatNumber(followers) }))}</button>` : "";
    // The head of a group filters the list to the whole group, like a tile to one reason; without open findings it is a quiet label.
    const group = (title, list, tone, id, row) => {
      const n = openAll.filter(f => this.findingTileGroup(f) === id).length, on = this.findingFilter === `group:${id}`;
      const text = this.esc(this.t("sumGroupCount", { group: this.t(title), n: this.formatNumber(n) }));
      const head = n ? `<button type="button" class="sumgrouphead ${tone}" data-finding-filter="group:${id}" aria-pressed="${on}"><ha-icon icon="mdi:filter-variant"></ha-icon>${text}</button>` : `<span class="sumgrouphead zero">${text}</span>`;
      return `<div class="sumhead" style="grid-row:${row}">${head}</div><div class="sumrow" style="--r:${row + 1}">${this.sumTileCells(list.map(c => ({ ...tile(c), hint: this.reasonLabel(c) })))}</div>`;
    };
    // "All findings" stands left over both rows; the follow-ups are named inside it. The whole tile clears the filters,
    // the link to the follow-ups lies above that.
    const totalTile = `<div class="sumall"><div class="sumtile sumtotal ${total.tone}"><button type="button" class="sumstretch" data-finding-filter="" aria-label="${this.esc(this.t("allFindings"))}"></button><span class="sumlabel">${this.esc(total.label)}</span><b class="sumvalue">${total.value}</b><span class="sumsubs"><small>${total.sub}</small>${followLink}</span>${total.spark ? `<span class="spark-row">${total.spark}</span>` : ""}</div></div>`;
    // One grid: the faults in the first row, the tidying up in the second, every tile of the same width and height.
    const tiles = `<div class="findsum" role="group" aria-label="${this.esc(this.t("sumLabel"))}" style="--k:${Math.max(faults.length, tidy.length)}">${totalTile}${group("sumGroupUrgent", faults, "red", "red", 1)}${group("sumGroupTidy", tidy, "warn", "tidy", 3)}</div>`;
    const fixedView = this.findingStatus === "fixed";
    // Every head starts folded, however few the filter leaves; a head opened or closed by hand stays so.
    // Grouped: the heads of the objects, sorted by the chosen column. Flat: every finding for itself, in the same order.
    const nodes = grouped ? this.sortNodes(this.objectTree(sorted, all, open)) : [];
    this._nodeFoldIds = this.nodeFoldIds(nodes);
    const items = grouped ? nodes : sorted;
    // The same count in both views: findings and the objects they belong to.
    const objects = this.countObjects(grouped ? nodes : this.objectTree(sorted, all, open));
    // The head counts what is shown; narrowed further, it names the number of the active tile beside it.
    const base = this.findingFilter ? all.filter(f => this.matchesFindingFilter(f)).length : this.findingFollowers ? followers : this.findingOutages ? all.filter(f => this.outageKeys(this.findingOutages === true ? "" : this.findingOutages).has(f.key)).length : this.findingScanNew ? all.filter(f => this.scanNewKeys().has(f.key)).length : this.findingAfter ? all.filter(f => this.corr?.by_key?.[f.key]).length : this.findingHeld ? all.filter(f => this.heldKeys().has(f.key)).length : this.findingCause ? all.filter(f => this.causeKeys(this.findingCause).has(f.key)).length : all.length;
    const of = sorted.length < base ? { total: this.formatNumber(base) } : null;
    // Filtered to outages, the head counts them as the overview does (chains at their top) instead of every object below.
    const outageN = this.findingOutages && !of ? this.countedOutages(this.findingOutages === true ? "" : this.findingOutages).length : 0;
    const count = outageN ? this.t(outageN === 1 ? (sorted.length === 1 ? "ogViewOutageOne" : "ogViewOutage1") : "ogViewOutages", { o: this.formatNumber(outageN), n: this.formatNumber(sorted.length) })
      : this.t(of ? (objects === 1 ? "ogViewCountOf1" : "ogViewCountOf") : sorted.length === 1 ? "ogViewCountOne" : objects === 1 ? "ogViewCount1" : "ogViewCount", { n: this.formatNumber(sorted.length), m: this.formatNumber(objects), ...of });
    // Grouped, the pages count the rows shown, heads and what is open below them, not only the heads.
    const units = grouped ? nodes.map(item => { const [head, ...rows] = this.nodeRows(item).split(/(?=<tr class="finding-data)/); return { item, head, rows }; }) : null;
    const pg = grouped ? this.paginateUnits("findings", units) : this.paginate("findings", items);
    const pageItems = grouped ? pg.rows.map(u => u.item) : pg.rows;
    const body = fixedView ? this.fixedList() : `${this.findSelBar(pageItems, count)}${items.length ? this.findingsTable(pageItems, grouped ? pg.rows.map(u => u.head + u.rows.join("")).join("") : null) : `<div class="emptymsg"><ha-icon icon="mdi:check-circle-outline"></ha-icon>${all.length ? this.noMatches("findings") : this.t("noFindings")}</div>`}${pg.footer}`;
    const anyOpen = this._nodeFoldIds.some(id => this.foldOpen(id, false));
    const foldBtn = grouped && nodes.length ? `<button class="chip" data-fold-all="${anyOpen ? "close" : "open"}">${this.t(anyOpen ? "foldNone" : "foldAll")}</button>` : "";
    const decisions = ["known", "snoozed", "hidden"].includes(this.findingStatus) ? `<button class="link" data-goto-decisions>${this.t("decAllLink")} <ha-icon icon="mdi:chevron-right"></ha-icon></button>` : "";
    return `<div class="stack">${this.foldOpen("findings_help", false) ? this.findingsHelp() : ""}${tiles}${fixedView ? "" : this.findingHints(afterCount, afterFollows)}<div class="panel"><div class="chips"><span class="seg statusseg">${this.statusChips()}</span>${decisions}<span class="spacer"></span>${fixedView ? "" : `${foldBtn}${this.viewSwitch(grouped)}`}</div>
      ${this.statusNote()}${fixedView ? "" : this.findingNote(filters)}${fixedView ? "" : bar}${body}</div></div>`;
  }

  // Another status than open: the list shows it, the tiles above still count the open findings. One button goes back.
  statusNote() {
    const s = this.findingStatus;
    if (!s) return "";
    const name = s === "new" ? this.t("freshNew", { days: NEW_FINDING_DAYS }) : s === "inwork" ? this.t("freshInwork") : s === "due" ? this.t("stateDue") : this.t(`state_${s}`);
    return `<div class="filteron statusnote" role="status"><ha-icon icon="mdi:information-outline"></ha-icon><span>${this.esc(this.t("statusNoteText", { status: name }))}</span><span class="spacer"></span><button class="btn quiet" data-fstatus="open">${this.t("statusNoteBack")}</button></div>`;
  }

  // The objects of a grouped list: every head that is an object, the ones below a cause too, not the causes themselves.
  countObjects(nodes) { return nodes.filter(n => !n.key.startsWith("cause:")).length + nodes.reduce((s, n) => s + this.nodeFoldIds(n.kids).filter(id => !id.startsWith("og:cause:")).length, 0); }

  // The two hints above the list as one row: suggestions for marks and incidents after updates. A button opens its card below.
  findingHints(afterCount, afterFollows) {
    this.ensureStability?.(); this.ensureWatches?.();
    const often = this.oftenSuggestions?.() || [], incidents = this.incidents?.() || [];
    if (!often.length && !incidents.length) return "";
    const btn = (fold, icon, text, tone) => `<button type="button" class="hintbtn ${tone}${this.foldOpen(fold, false) ? " on" : ""}" data-fold="${fold}" aria-expanded="${this.foldOpen(fold, false)}"><ha-icon icon="${icon}"></ha-icon>${this.esc(text)}<ha-icon icon="mdi:chevron-${this.foldOpen(fold, false) ? "down" : "right"}"></ha-icon></button>`;
    const row = `<div class="panel hintrow"><span class="hintlabel">${this.t("hintsLabel")}</span>${often.length ? btn("often", "mdi:lightbulb-on-outline", this.t("hintOften", { n: this.formatNumber(often.length) }), "warn") : ""}${incidents.length ? btn("corr", "mdi:update", this.t("hintCorr", { n: this.formatNumber(incidents.length) }), "mute") : ""}</div>`;
    return `${row}${this.foldOpen("often", false) ? this.oftenCard() : ""}${this.foldOpen("corr", false) ? this.corrGroupsCard(afterCount, afterFollows) : ""}`;
  }


  // The selection of findings: hide several at once, or export just those. Kept across pages until cleared.
  // A label does not mend a missing reference: the button stays away while only such findings are picked.
  selectionOnlyBroken() {
    const picked = [...this.findSel].map(key => this.data.findings.find(f => f.key === key)).filter(Boolean);
    return picked.length > 0 && picked.every(f => f.classification === "broken_reference");
  }

  findSelBar(pageRows, count = "") {
    const n = this.findSel.size;
    this._findPage = pageRows.flatMap(f => (f.findings ? this.nodeFindings(f) : [f])).map(f => f.key).filter(Boolean);
    const total = `<span class="viewcount" role="status">${this.esc(count)}</span>`;
    // A mixed pick: the buttons that fit only some of the findings say how many.
    const picked = [...this.findSel].map(key => this.data.findings.find(f => f.key === key)).filter(Boolean);
    const labels = picked.filter(f => LABEL_TYPES.includes(this.findObject(this.findingKey(f))?.object_type)).length, marks = this.markTargets().size;
    const part = k => (k < n ? ` (${this.t("fselPart", { n: this.formatNumber(k), m: this.formatNumber(n) })})` : "");
    const excs = picked.filter(f => { const o = this.findObject(this.findingKey(f)); return o && this.excTargetOf(o); }).length;
    // The same actions in the same order as the menu of a row: first about the findings, then about their objects.
    const btn = (icon, label, attr, extra = "") => `<button ${attr.includes("class=") ? "" : 'class="btn" '}${attr}><ha-icon icon="${FSEL_ICONS[icon]}"></ha-icon>${this.t(label)}${extra}</button>`;
    const exc = this.excForm?.here && this.exc ? `<div class="pad">${this.excFormHtml(this.excForm)}</div>` : "";
    if (!pageRows.length && !n) return exc;
    // Nothing picked: only the box that picks the page. The actions appear with the first pick.
    if (!n) return `<div class="toolbar selhead"><label class="selall"><input type="checkbox" class="selbox" data-fsel-page> ${this.t("selectPage")}</label><span class="toolgap"></span>${total}</div>${exc}`;
    return `<div class="toolbar"><button class="btn quiet" data-fsel-page>${this.t("selectPage")}</button><button class="btn quiet" data-fsel-clear>${this.t("clearSelection")}</button><span class="selcount" role="status">${this.t("selectedCount", { count: n })}</span><span class="toolgap"></span>${["hidden", "known", "snoozed"].includes(this.findingStatus) ? `<div class="fbtns"><button class="btn accent" data-fsel-unhide><ha-icon icon="mdi:eye-outline"></ha-icon>${this.t("findUnhide")}</button></div>` : `<div class="fbtns">${btn("status", "fselStatus", 'data-fsel-state="status"')}${marks ? btn("mark", "markSet", 'data-fsel-state="mark"', part(marks)) : ""}${excs ? btn("exc", "excCreate", "data-fsel-exc", part(excs)) : ""}${this.selectionOnlyBroken() ? "" : btn("label", "fselLabel", 'data-fsel-state="label" class="btn ha"', part(labels))}</div>`}${total}</div>${this.bulkForm()}${exc}`;
  }

  // Takes the selected findings that the person had hidden, marked as known or snoozed back into the open list.
  async unhideSelectedFindings() {
    const keys = [...this.findSel].filter(key => this.data.findings.some(f => f.key === key && f.ignored && f.ignored_by === "user"));
    let done = 0;
    const failed = await this.runBulk(keys, async key => {
      await this._hass.callWS({ type: "ha_housekeeper/ignore", finding_key: key, ignored: false });
      const finding = this.data.findings.find(f => f.key === key);
      if (finding) { finding.ignored = false; finding.ignored_by = null; finding.ignore_info = null; done += 1; }
    });
    this.render();
    if (!failed) this.toast(this.t("findUnhidden", { n: done }));
  }

  async hideSelectedFindings() {
    const keys = [...this.findSel].filter(key => this.data.findings.some(f => f.key === key && !f.ignored));
    await this.runBulk(keys, async key => {
      await this._hass.callWS({ type: "ha_housekeeper/ignore", finding_key: key, ignored: true });
      const finding = this.data.findings.find(f => f.key === key);
      if (finding) { finding.ignored = true; finding.ignored_by = "user"; }
    });
    this.render();
  }

  findingTitle(f) {
    const sub = f.rule_id.split(".")[1] || f.rule_id;
    // A reference that leads nowhere: "Refers to entity sensor.x".
    if (sub.startsWith("missing_")) return this.t("refersTo", { kind: this.lang === "en" ? this.t(sub).toLowerCase() : this.t(sub), target: f.affected_object });
    if (f.rule_id === "entity.possible_duplicate") return `${this.t("duplicateOf")} ${f.affected_object}`;
    const text = this.t(f.rule_id);
    return text === f.rule_id ? this.t(sub) : text;
  }

  // What was decided about a hidden finding, as one line: kind, until when, why.
  decisionLabel(f) {
    const info = f.ignore_info;
    if (!info) return this.t("ignoredLabel");
    const until = info.until ? ` · ${this.t("decideUntil", { date: this.formatDate(info.until) })}` : "";
    return `${this.t(`decideKind_${info.kind}`)}${until}${info.reason ? ` · ${info.reason}` : ""}${info.via === "mcp" ? ` · ${this.t("viaMcp")}` : ""}`;
  }

  // The status of one finding or of the selection: known, snoozed or hidden, each with what it means. Row and bar share it.
  statusFields(d, p, kind = d.kind) {
    const opt = k => `<label class="statusopt${kind === k ? " on" : ""}"><input type="radio" name="${p}-kind" value="${k}" data-${p}-kind ${kind === k ? "checked" : ""}><span><b>${this.t(`decideKind_${k}`)}</b><small>${this.t(`decideKindHint_${k}`)}</small></span></label>`;
    const days = [...(kind === "snooze" ? [] : [0]), 7, 30, 90, 365].map(n => `<option value="${n}" ${Number(d.days) === n ? "selected" : ""}>${n ? this.t("decideDays", { n }) : this.t("decideForever")}</option>`).join("");
    return `<div class="statusopts" role="radiogroup" aria-label="${this.esc(this.t("decideKind"))}">${["keep", "snooze", "ignore"].map(opt).join("")}</div>
      <div class="statusrow"><input data-${p}-reason maxlength="200" autocomplete="off" value="${this.esc(d.reason)}" aria-label="${this.esc(this.t("decideReason"))}" placeholder="${this.esc(this.t(kind === "keep" ? "decideReasonNeeded" : "decideReason"))}">
      <select data-${p}-days aria-label="${this.esc(this.t("decideHow"))}">${days}</select></div>
      <small class="factnote">${this.t("statusScopeHint")}</small>`;
  }

  decideForm(f) {
    const d = this.decide;
    return `<form class="polform statusform" data-decide-form="${this.esc(f.key)}">${this.statusFields(d, "decide")}
      <div class="mbtns"><button type="button" class="btn quiet" data-decide-cancel>${this.t("cancelRun")}</button><button type="submit" class="btn primary">${this.t("saveOptions")}</button></div>
      ${d.error ? `${this.notice("err", this.t(d.error))}` : ""}</form>`;
  }

  openDecide(key, kind = "ignore") { this.decide = { key, kind, days: kind === "snooze" ? 30 : 0, reason: "", error: "" }; this.render(); this.shadowRoot?.querySelector?.("[data-decide-kind]:checked")?.focus?.(); }

  async commitDecide() {
    const d = this.decide;
    if (!d) return;
    if (d.kind === "keep" && !d.reason.trim()) { d.error = "decideNeedReason"; this.render(); return; }
    if (d.kind === "snooze" && !Number(d.days)) d.days = 30;
    try {
      const msg = { type: "ha_housekeeper/ignore", finding_key: d.key, ignored: true, kind: d.kind, reason: d.reason.trim() };
      if (Number(d.days)) msg.days = Number(d.days);
      await this._hass.callWS(msg);
      if (d.key.startsWith("policy.")) { this.decide = null; await this.loadPolicies(); return; }  // a policy violation is no finding
      const finding = this.data.findings.find(f => f.key === d.key);
      if (finding) {
        const until = msg.days ? new Date(Date.now() + msg.days * 864e5).toISOString() : null;
        finding.ignored = true; finding.ignored_by = "user"; finding.resurfaced = false;
        finding.ignore_info = { kind: d.kind, reason: msg.reason, until, at: new Date().toISOString() };
        this._rev++;
      }
      this.decide = null;
    } catch (err) { this.failed(err); this.decide = null; }
    this.render();
  }

  // The findings of one object with what can be decided about each; the detail page shows them in the card of actions.
  findingRows(key, item = this.findObject(key)) {
    const list = this.data.findings.filter(f => this.findingKey(f) === key);
    if (!list.length) return "";
    // The step that answers a finding comes first in its row, as the primary button.
    const fixes = item ? this.fixItems(item, key).items : [];
    const steps = f => fixes.filter(it => it.finding === f.key).map(it => `<button class="btn primary" ${it.attr} title="${this.esc(this.t(it.hint))}"><ha-icon icon="${it.icon}"></ha-icon>${it.label}</button>`).join("");
    const hideButton = f => this.decide && this.decide.key === f.key ? this.decideForm(f)
      : `<div class="fbtns">${steps(f)}${f.rule_id === "entity.possible_duplicate" ? `<button class="btn" data-notdup="${this.esc(f.key)}"><ha-icon icon="mdi:check-circle-outline"></ha-icon>${this.t("notDuplicate")}</button><button class="btn" data-object="entity:${this.esc(f.affected_object)}"><ha-icon icon="mdi:open-in-new"></ha-icon>${this.t("openTwin")}</button>` : ""}<button class="btn" data-decide-open="${this.esc(f.key)}" data-decide-preset="keep"><ha-icon icon="${FSEL_ICONS.status}"></ha-icon>${this.t("fselStatus")}</button></div>`;
    const rows = list.map(f => `<div class="finding"><div><strong>${this.esc(this.findingTitle(f))}</strong><small class="fmeta">${this.pill(f.classification)}<span class="nw">${this.t("certainty")}: ${Math.round(f.confidence * 100)} %</span>${f.ignored ? ` · ${this.esc(f.mark ? this.markLine(f.mark) : this.decisionLabel(f))}` : ""}${f.resurfaced ? ` · ${this.t("dueLabel")}` : ""}</small>${f.impact ? `<small>${this.esc(this.impactLine(f))}</small>` : ""}${this.corrLine(f.key) ? `<small>${this.corrLine(f.key)}</small>` : ""}${f.ignored_by === "label" ? `<small>${this.t("ignoredByLabel")}</small>` : ""}${f.ignore_rule ? `<small>${this.esc(this.findingRuleLine(f))}</small>` : ""}</div>${f.ignored_by === "label" || f.ignored_by === "mark" || f.ignored_by === "rule" ? "" : f.ignored ? `<button class="btn" data-ignore="${this.esc(f.key)}" data-ignore-value="0"><ha-icon icon="mdi:eye-outline"></ha-icon>${this.t("showFinding")}</button>` : hideButton(f)}</div>`).join("");
    return rows;
  }
}
Object.assign(TEXT.de, {
  refersTo: "Verweist auf {kind} {target}",
  statusNoteText: "Die Liste zeigt den Status „{status}“. Die Kacheln oben zählen die offenen Befunde; ein Klick darauf schaltet zurück auf „Offen“.", statusNoteBack: "Zu den offenen",
});
Object.assign(TEXT.en, {
  refersTo: "Refers to {kind} {target}",
  statusNoteText: "The list shows the status “{status}”. The tiles above count the open findings; a click on one goes back to “Open”.", statusNoteBack: "To the open ones",
});
