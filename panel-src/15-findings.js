// FindingsMixin: methods of the panel element, mixed into the class in 99-register.js.
class FindingsMixin {
  sortedFindings(includeIgnored = false) {
    const { plain } = this.collators();
    return this.data.findings.filter(f => includeIgnored || !f.ignored).sort((a, b) => (this.impactScore(b) - this.impactScore(a))
      || plain.compare(String(a.object_id), String(b.object_id)));
  }

  // The reason of a finding as the person sees it: an outage of an integration, otherwise its class (unused, broken reference …).
  findingReason(f) { return f.rule_id === "config_entry.not_loaded" ? "outage" : f.classification; }
  reasonLabel(r) { return r === "outage" ? this.t("chip_outage") : this.statusLabel(r); }

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
    const objects = this.data.objects.filter(o => HEALTH_TYPES.includes(o.object_type));
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
    return { key, object, title, subtitle: `${subtitle}${finding.ignored ? ` · ${this.esc(finding.mark ? this.markLine(finding.mark) : this.decisionLabel(finding))}` : ""}${finding.resurfaced ? ` · ${this.t("dueLabel")}` : ""}${finding.mark_outside_window ? ` · ${this.t("markOutside")}` : ""}<span class="fextra">${this.statusTags(finding)}${this.followOf(finding)}${this.oftenChip(finding)}</span>` };
  }

  // pick = false outside the findings list: there is no bar for the actions on a selection there.
  findingRow(finding, inGroup = false, pick = true) {
    const { key, object, title, subtitle } = this.findingRowContent(finding, inGroup);
    const button = `<button class="row ${finding.ignored ? "dim" : ""}" data-object="${this.esc(key)}">${this.tile(object?.object_type || "entity", this.tone(finding.classification))}<span class="row-text"><strong>${this.esc(title)}</strong><small>${subtitle}${finding.first_detected_at ? `<span class="msince"> · ${this.t("sortSince")} ${this.formatDate(finding.first_detected_at)}</span>` : ""}</small></span>${this.kindChip(this.reasonLabel(this.findingReason(finding)))}${this.impactChip(finding.impact)}</button>`;
    return `<div class="rowwrap">${pick ? `<input type="checkbox" class="selbox" data-fsel="${this.esc(finding.key)}" ${this.findSel.has(finding.key) ? "checked" : ""} aria-label="${this.esc(title)}">` : ""}${button}${this.rowMenu(finding)}</div>${this.rowDecide(finding)}`;
  }

  findingsTable(items) {
    const st = this.lv.findings, header = (key, label, dir = "asc") => {
      const on = st.sort === key;
      return `<th scope="col" aria-sort="${on ? (st.dir === "desc" ? "descending" : "ascending") : "none"}"><button type="button" class="thbtn" data-lsort="findings|${key}|${dir}">${this.t(label)}${on ? ` <span aria-hidden="true">${st.dir === "desc" ? "↓" : "↑"}</span>` : ""}</button></th>`;
    };
    const idSort = `<button type="button" class="thbtn th-alt" data-lsort="findings|id|asc">${this.t("sortId")}${st.sort === "id" ? ` <span aria-hidden="true">${st.dir === "desc" ? "↓" : "↑"}</span>` : ""}</button>`;
    const head = `<thead><tr><th scope="col" class="selcol"><span class="sr-only">${this.t("selectPage")}</span></th><th scope="col" aria-sort="${["name", "id"].includes(st.sort) ? (st.dir === "desc" ? "descending" : "ascending") : "none"}"><button type="button" class="thbtn" data-lsort="findings|name|asc">${this.t("sortName")}${st.sort === "name" ? ` <span aria-hidden="true">${st.dir === "desc" ? "↓" : "↑"}</span>` : ""}</button>${idSort}</th>${header("impact", "sortImpact", "desc")}${header("certainty", "sortCertainty", "desc")}${header("since", "sortSince", "desc")}${header("rule", "sortRule")}<th scope="col"><span class="sr-only">${this.t("rowMenu")}</span></th></tr></thead>`;
    // In the grouped view every row keeps the room of the fold arrow, so that symbols and names stand in one line.
    const gap = items.some(i => i.members || (i.cause && this.causeTotal(i.cause))) ? `<span class="finding-fold-gap" aria-hidden="true"></span>` : "";
    const rows = items.map(item => {
      if (item.cause) return this.causeTableRow(item.cause, gap);
      if (item.members) return this.brokenGroupTableRow(item);
      const f = item, { key, object, title, subtitle } = this.findingRowContent(f);
      const pick = `<input type="checkbox" class="selbox" data-fsel="${this.esc(f.key)}" ${this.findSel.has(f.key) ? "checked" : ""} aria-label="${this.esc(title)}">`;
      const link = `<button type="button" class="finding-link" data-object="${this.esc(key)}">${this.tile(object?.object_type || "entity", this.tone(f.classification))}<span class="finding-name"><strong>${this.esc(title)}</strong><span class="id">${this.esc(f.object_id)}</span><small>${subtitle}</small></span></button>`;
      const name = gap ? `<div class="finding-link-group">${gap}${link}</div>` : link;
      const detail = this.rowDecide(f);
      return `<tr class="finding-data${f.ignored ? " dim" : ""}"><td class="selcol">${pick}</td><td>${name}</td><td data-label="${this.t("sortImpact")}">${this.impactChip(f.impact) || `<span class="muted">–</span>`}</td><td data-label="${this.t("sortCertainty")}">${f.confidence == null ? "–" : `${Math.round(f.confidence * 100)} %`}</td><td data-label="${this.t("sortSince")}">${this.ageCell(f.first_detected_at)}</td><td data-label="${this.t("sortRule")}"><span class="finding-rule">${this.esc(f.rule_id)}</span><small>${this.esc(this.reasonLabel(this.findingReason(f)))}</small></td><td class="finding-action">${this.rowMenu(f)}</td></tr>${detail ? `<tr class="finding-detail"><td colspan="7">${detail}</td></tr>` : ""}`;
    }).join("");
    return `<div class="tablewrap lt findings-table${this.isDenseList("findings") ? " dense-list" : ""}"><table>${head}<tbody>${rows}</tbody></table></div>`;
  }

  causeTableRow(c, gap = "") {
    const total = this.causeTotal(c), own = c.finding_key && this.data.findings.find(f => f.key === c.finding_key);
    const id = `cause_${c.id}`, open = total && this.foldOpen(id, false);
    const link = `${c.object_type}:${c.object_id}`, title = this.t(`cause_${c.kind}`, { name: c.name });
    const summary = [total ? this.t("causeExplains", { n: this.formatNumber(total) }) : "", this.causeShort(c)].filter(Boolean).join(" · ");
    const fold = total ? `<button type="button" class="finding-fold" data-fold="${this.esc(id)}" aria-expanded="${Boolean(open)}" aria-label="${this.esc(this.t(open ? "foldGroupClose" : "foldGroupOpen", { name: c.name }))}"><ha-icon class="foldarrow" icon="mdi:chevron-${open ? "down" : "right"}"></ha-icon></button>` : gap;
    const name = `<div class="finding-link-group">${fold}<button type="button" class="finding-link" data-object="${this.esc(link)}">${this.tile(c.object_type, "red")}<span class="finding-name"><strong>${this.esc(title)}</strong><small>${this.esc(summary)}</small></span>${total ? `<span class="pill red">${this.esc(this.t("causeFollowers", { n: this.formatNumber(total) }))}</span>` : ""}</button></div>`;
    const row = `<tr class="finding-data finding-cause"><td class="selcol">${this.causeBox(c)}</td><td>${name}</td><td data-label="${this.t("sortImpact")}">${this.impactChip(c.impact) || "–"}</td><td data-label="${this.t("sortCertainty")}">${own?.confidence == null ? "–" : `${Math.round(own.confidence * 100)} %`}</td><td data-label="${this.t("sortSince")}">${this.ageCell(own?.first_detected_at)}</td><td data-label="${this.t("sortRule")}"><span class="finding-rule">${this.esc(own?.rule_id || c.kind)}</span><small>${this.t("chip_outage")}</small></td><td class="finding-action">${this.causeMenu(c, own)}</td></tr>`;
    const decision = this.rowDecide(own);
    const detail = open || decision ? `<tr class="finding-detail"><td colspan="7">${decision}${open ? this.causeChildren(c, false) : ""}</td></tr>` : "";
    return row + detail;
  }

  brokenGroupTableRow(g) {
    const f = g.members[0], p = f.evidence[0].place, object = this.findObject(this.findingKey(f));
    const keys = g.members.map(m => m.key), id = `bg:${g.group}`, open = this.foldOpen(id, false);
    (this._findGroups ||= {})[g.group] = keys;
    const title = `${object?.name || f.object_id}${p.view != null ? ` › ${p.view}` : ""}`;
    const sub = [...this.placeParts({ card: p.card, section: p.section }), this.t("brokenCount", { n: keys.length })].join(" · ");
    const name = `<div class="finding-link-group"><button type="button" class="finding-fold" data-fold="${this.esc(id)}" aria-expanded="${open}" aria-label="${this.esc(this.t(open ? "foldGroupClose" : "foldGroupOpen", { name: title }))}"><ha-icon class="foldarrow" icon="mdi:chevron-${open ? "down" : "right"}"></ha-icon></button><button type="button" class="finding-link" data-object="${this.esc(this.findingKey(f))}">${this.tile(object?.object_type || "dashboard", "red")}<span class="finding-name"><strong>${this.esc(title)}</strong><small>${this.esc(sub)}</small></span><span class="pill red">${keys.length}</span></button></div>`;
    const row = `<tr class="finding-data finding-cause"><td class="selcol"><input type="checkbox" class="selbox" data-fsel-group="${this.esc(g.group)}" ${keys.every(k => this.findSel.has(k)) ? "checked" : ""} aria-label="${this.esc(title)}"></td><td>${name}</td><td data-label="${this.t("sortImpact")}">${this.impactChip(f.impact) || "–"}</td><td data-label="${this.t("sortCertainty")}">${f.confidence == null ? "–" : `${Math.round(f.confidence * 100)} %`}</td><td data-label="${this.t("sortSince")}">${this.ageCell(f.first_detected_at)}</td><td data-label="${this.t("sortRule")}"><span class="finding-rule">${this.esc(f.rule_id)}</span><small>${this.esc(this.reasonLabel(this.findingReason(f)))}</small></td><td></td></tr>`;
    const orphan = this.isOrphan(p);
    const hint = orphan ? `<div class="hintbox"><ha-icon icon="mdi:lightbulb-on-outline"></ha-icon><div><p>${this.esc(this.t("brokenOrphan", { missing: p.card_missing, total: p.card_refs }))}</p></div></div>` : "";
    return row + (open ? `<tr class="finding-detail"><td colspan="7">${hint}<div class="kids">${g.members.map(m => this.findingRow(m, true)).join("")}</div></td></tr>` : "");
  }

  sortFindingEntries(items) {
    const st = this.lv.findings, { natural, ids } = this.collators(), sign = st.dir === "desc" ? -1 : 1;
    const findingOf = item => item.cause ? this.data.findings.find(f => f.key === item.cause.finding_key) : item.members ? item.members[0] : item;
    const value = item => {
      const c = item.cause, f = findingOf(item);
      switch (st.sort) {
        case "name": return c ? c.name : this.findObject(this.findingKey(f))?.name || f.object_id;
        case "id": return c ? c.object_id : f.object_id;
        case "since": return f?.first_detected_at;
        case "rule": return c ? f?.rule_id || c.kind : f.rule_id;
        case "certainty": return f?.confidence;
        default: return c ? (IMPACT_RANK[c.impact] ?? 0) + (f?.confidence || 0) / 2 : this.impactScore(f);
      }
    };
    return items.map(item => ({ item, key: value(item) })).sort((a, b) => {
      const emptyA = a.key == null || a.key === "", emptyB = b.key == null || b.key === "";
      if (emptyA !== emptyB) return emptyA ? 1 : -1;
      const order = typeof a.key === "number" && typeof b.key === "number" ? a.key - b.key : natural.compare(String(a.key ?? ""), String(b.key ?? ""));
      const id = item => item.cause?.id || item.members?.[0]?.key || item.key || item.object_id;
      return order * sign || ids.compare(String(id(a.item)), String(id(b.item))) * sign;
    }).map(x => x.item);
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
    const classed = this.findingFilter ? all.filter(f => this.findingReason(f) === this.findingFilter || f.rule_id === this.findingFilter) : all;
    const afterOnly = this.findingAfter ? classed.filter(f => this.corr?.by_key?.[f.key]) : classed;
    const byClass = this.findingDue ? afterOnly.filter(f => f.resurfaced) : afterOnly;
    this.lvState("findings", "impact", "desc");
    return this.refine("findings", byClass, {
      text: f => [this.findObject(this.findingKey(f))?.name, f.object_id, f.rule_id, f.affected_object].join(" "),
      filters: { type: (f, v) => this.findingType(f) === v, fresh: (f, v) => this.freshMatch(f, v), impact: (f, v) => (f.impact || "none") === v },
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

  // The filters the tiles above set (class, "after"); the list bar shows its own.
  findingNote() {
    return this.filterNote([this.findingFilter ? this.reasonLabel(this.findingFilter) : "", this.findingAfter ? this.t("corrTile") : ""].filter(Boolean), "data-finding-reset");
  }

  // Opens or closes every chain and group of the findings list at once.
  foldAllFindings(open) {
    const ids = [...this.causeList().filter(c => this.causeTotal(c)).map(c => `cause_${c.id}`), ...Object.keys(this._findGroups || {}).map(g => `bg:${g}`)];
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

  // Grouped (follow-ups under their cause) or one by one; with any filter the list is one by one anyway, so the switch is locked there.
  viewSwitch(grouped, free) {
    const btn = (flat, label) => `<button type="button" class="chip ${flat === !grouped ? "active" : ""}" data-toggle-followers="${flat ? "flat" : "grouped"}" aria-pressed="${flat === !grouped}"${free ? "" : " disabled"}>${label}</button>`;
    return `<span class="viewswitch" role="group" aria-label="${this.esc(this.t("viewLabel"))}"${free ? "" : ` title="${this.esc(this.t("viewLocked"))}"`}>${btn(false, this.t("viewGrouped"))}${btn(true, this.t("viewFlat"))}</span>`;
  }

  findingsView() {
    if (this._impactOnce) { this.visibleFindings(); if (this.lv.findings) { this.lv.findings.f.impact = this._impactOnce; this.persistLv("findings"); } this._impactOnce = ""; }
    const all = this.sortedFindings(true).filter(f => this.statusMatch(f));
    const classes = [...new Set(all.map(f => this.findingReason(f)))];
    const open = !this.findingStatus && !this.findingFilter && !this.findingAfter && !this.lv.findings?.q && !Object.values(this.lv.findings?.f || {}).some(Boolean);
    const sorted = this.visibleFindings();
    const grouped = open && !this.showFollowers;
    const list = this.groupBroken(this.collapseFollowers(sorted, !grouped));
    const types = [...new Set(all.map(f => this.findingType(f)))].sort();
    const bar = this.listBar("findings", { table: true, dense: true, sorts: this.findingSorts(), filters: [{ name: "type", all: this.t("allTypes"), options: types.map(x => [x, this.t(x)]) }, this.freshFilter(), { name: "impact", all: this.t("allSeverities"), options: ["high", "medium", "low", "info"].map(x => [x, this.t(`chip_${x}`)]) }] });
    this.ensureSeries();
    const spark = (key, rising) => this.series ? this.sparkline(key, rising) : "";
    const classTone = c => { const tone = c === "outage" ? "red" : this.tone(c); return tone === "red" ? "red" : tone === "warn" ? "warn" : "mute"; };
    this.ensureCorrelations();
    const isFollower = f => f.cause_id && !CAUSE_OWN_RULES.includes(f.rule_id);
    const afterAll = all.filter(f => this.corr?.by_key?.[f.key]);
    const afterCount = afterAll.filter(f => !isFollower(f)).length, afterFollows = afterAll.length - afterCount;
    // A reason counts what the list shows under it: the follow-ups of an outage hang on their cause. The number beside them is the whole count.
    const tile = c => { const mine = all.filter(f => this.findingReason(f) === c), follows = mine.filter(isFollower).length; return { label: this.reasonLabel(c), value: this.formatNumber(mine.length - follows), sub: follows ? this.esc(this.t("findingsOfFollow", { total: this.formatNumber(mine.length), n: this.formatNumber(follows) })) : undefined, tone: classTone(c), filter: c, active: this.findingFilter === c, spark: spark(`lead:${c}`, "bad") }; };
    const rank = c => { const i = [...FINDING_URGENT, ...FINDING_TIDY].indexOf(c); return i < 0 ? FINDING_URGENT.length : i; };
    const sorted2 = [...classes].sort((a, b) => rank(a) - rank(b));
    const tidy = sorted2.filter(c => FINDING_TIDY.includes(c)), urgent = sorted2.filter(c => !FINDING_TIDY.includes(c));
    const total = { label: this.t("allFindings"), value: this.formatNumber(this.findingTotal()), sub: this.followerCount() ? this.esc(this.t("findingsOfFollow", { total: this.formatNumber(this.findingTotal() + this.followerCount()), n: this.formatNumber(this.followerCount()) })) : undefined, tone: this.findingTotal() ? "warn" : "ok", filter: "", active: !this.findingFilter, spark: spark("lead", "bad") };
    const group = (title, list, make, row) => list.length ? `<div class="sumgroup${row ? ` row${row}` : ""}" style="--n:${list.length};flex:${list.length} 1 ${list.length * 150}px"><div class="sumgrouphead">${this.t(title)}</div>${this.sumTiles(list.map(make))}</div>` : "";
    const tiles = `<div class="sumgroups" style="--cols:${Math.max(1 + tidy.length, urgent.length)}">${group("sumGroupAll", [total], x => x, 1)}${group("sumGroupTidy", tidy, tile, 1)}${group("sumGroupUrgent", urgent, tile, 2)}</div>`;
    const dueCount = this.data.findings.filter(f => f.resurfaced).length;
    const followers = this.followerCount();
    const fixedView = this.findingStatus === "fixed";
    const entries = this.causeEntries(), withFollowers = entries.filter(c => this.causeTotal(c));
    // Chains and single findings share the chosen order. Under a filter or in the flat list every finding stands for itself.
    let items = grouped ? this.sortFindingEntries([...entries.map(cause => ({ cause })), ...list]) : list;
    if (this.findingWithFollowers) items = grouped ? items.filter(i => i.cause && this.causeTotal(i.cause)) : items.filter(i => CAUSE_OWN_RULES.includes(i.rule_id) && entries.some(c => c.id === i.cause_id && this.causeTotal(c)));
    const pg = this.paginate("findings", items);
    const body = fixedView ? this.fixedList() : `${this.findSelBar(pg.rows, items.length)}${items.length ? this.findingsTable(pg.rows) : `<div class="emptymsg"><ha-icon icon="mdi:check-circle-outline"></ha-icon>${all.length ? this.noMatches("findings") : this.t("noFindings")}</div>`}${pg.footer}`;
    return `<div class="stack">${this.foldOpen("findings_help", false) ? this.findingsHelp() : ""}${tiles}${fixedView ? "" : this.oftenCard()}${fixedView ? "" : this.corrGroupsCard(afterCount, afterFollows)}<div class="panel"><div class="chips">${this.statusChips()}${followers ? this.viewSwitch(grouped, open) : ""}${followers ? `<button class="chip ${this.findingWithFollowers ? "active" : ""}" data-with-followers>${this.t("withFollowers")} (${withFollowers.length})</button>` : ""}${(followers && grouped) || Object.keys(this._findGroups || {}).length ? `<button class="chip" data-fold-all="open">${this.t("foldAll")}</button><button class="chip" data-fold-all="close">${this.t("foldNone")}</button>` : ""}${dueCount ? `<button class="chip ${this.findingDue ? "active" : ""}" data-finding-due>${this.t("dueFilter")} (${dueCount})</button>` : ""}<span class="spacer"></span><button class="chip" data-export="csv" title="${this.t("exportTitle")}">${this.t("exportCsv")}</button><button class="chip" data-export="json" title="${this.t("exportTitle")}">${this.t("exportJson")}</button></div>
      ${this.findingNote()}${fixedView ? "" : bar}${body}</div></div>`;
  }

  // The selection of findings: hide several at once, or export just those. Kept across pages until cleared.
  // A label does not mend a missing reference: the button stays away while only such findings are picked.
  selectionOnlyBroken() {
    const picked = [...this.findSel].map(key => this.data.findings.find(f => f.key === key)).filter(Boolean);
    return picked.length > 0 && picked.every(f => f.classification === "broken_reference");
  }

  findSelBar(pageRows, total = 0) {
    const n = this.findSel.size;
    this._findPage = pageRows.flatMap(f => (f.cause ? [{ key: f.cause.finding_key }] : f.members ? f.members : [f])).map(f => f.key).filter(Boolean);
    if (!pageRows.length && !n) return "";
    // Nothing picked: only the box that picks the page. The actions appear with the first pick.
    if (!n) return `<div class="toolbar selhead"><label class="selall"><input type="checkbox" class="selbox" data-fsel-page> ${this.t("selectPage")}</label><span class="toolgap"></span>${this.viewCount(total)}</div>`;
    return `<div class="toolbar"><button class="btn quiet" data-fsel-page>${this.t("selectPage")}</button><button class="btn quiet" data-fsel-clear>${this.t("clearSelection")}</button><span class="selcount" role="status">${this.t("selectedCount", { count: n })}</span><span class="toolgap"></span>${["hidden", "known", "snoozed"].includes(this.findingStatus) ? `<div class="fbtns"><button class="btn accent" data-fsel-unhide><ha-icon icon="mdi:eye-outline"></ha-icon>${this.t("findUnhide")}</button></div>` : `<div class="fbtns"><button class="btn" data-fsel-state="known">${this.t("fselKnown")}</button><button class="btn" data-fsel-state="snoozed">${this.t("fselSnooze")}</button>${this.selectionOnlyBroken() ? "" : `<button class="btn" data-fsel-state="label">${this.t("fselLabel")}</button>`}${this.markTargets().size ? `<button class="btn" data-fsel-state="mark">${this.t("markSet")}</button>` : ""}<button class="btn" data-fsel-hide>${this.t("findHideSelected")}</button></div>`}${this.viewCount(total)}</div>${this.bulkForm()}`;
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
    if (sub.startsWith("missing_")) return `${this.t(sub)}: ${f.affected_object}`;
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

  // The small form that asks what to do with a finding: hide it, keep it on purpose, or look again later.
  decideForm(f) {
    const d = this.decide, snooze = d.kind === "snooze";
    const kinds = ["ignore", "keep", "snooze"].map(k => `<option value="${k}" ${d.kind === k ? "selected" : ""}>${this.t(`decideKind_${k}`)}</option>`).join("");
    const days = [...(snooze ? [] : [0]), 7, 30, 90, 365].map(n => `<option value="${n}" ${Number(d.days) === n ? "selected" : ""}>${n ? this.t("decideDays", { n }) : this.t("decideForever")}</option>`).join("");
    return `<form class="polform" data-decide-form="${this.esc(f.key)}"><select data-decide-kind aria-label="${this.esc(this.t("decideKind"))}">${kinds}</select>
      <input data-decide-reason maxlength="200" autocomplete="off" value="${this.esc(d.reason)}" aria-label="${this.esc(this.t("decideReason"))}" placeholder="${this.esc(this.t(d.kind === "keep" ? "decideReasonNeeded" : "decideReason"))}">
      <select data-decide-days aria-label="${this.esc(this.t("decideHow"))}">${days}</select>
      <button type="submit" class="btn primary">${this.t("saveOptions")}</button><button type="button" class="btn quiet" data-decide-cancel>${this.t("cancelRun")}</button>
      ${d.error ? `${this.notice("err", this.t(d.error))}` : ""}</form>`;
  }

  openDecide(key, kind = "ignore") { this.decide = { key, kind, days: kind === "snooze" ? 30 : 0, reason: "", error: "" }; this.render(); this.shadowRoot?.querySelector?.("[data-decide-kind]")?.focus?.(); }

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
      : `<div class="fbtns">${steps(f)}${f.rule_id === "entity.possible_duplicate" ? `<button class="btn" data-notdup="${this.esc(f.key)}"><ha-icon icon="mdi:check-circle-outline"></ha-icon>${this.t("notDuplicate")}</button><button class="btn" data-object="entity:${this.esc(f.affected_object)}"><ha-icon icon="mdi:open-in-new"></ha-icon>${this.t("openTwin")}</button>` : ""}<button class="btn" data-decide-open="${this.esc(f.key)}" data-decide-preset="keep"><ha-icon icon="mdi:bookmark-check-outline"></ha-icon>${this.t("markKnown")}</button><button class="btn" data-decide-open="${this.esc(f.key)}" data-decide-preset="snooze"><ha-icon icon="mdi:clock-outline"></ha-icon>${this.t("fselSnooze")}</button><button class="btn" data-decide-open="${this.esc(f.key)}"><ha-icon icon="mdi:eye-off-outline"></ha-icon>${this.t("hideFinding")}</button></div>`;
    const rows = list.map(f => `<div class="finding"><div><strong>${this.esc(this.findingTitle(f))}</strong><small class="fmeta">${this.pill(f.classification)}<span class="nw">${this.t("certainty")}: ${Math.round(f.confidence * 100)} %</span>${f.ignored ? ` · ${this.esc(f.mark ? this.markLine(f.mark) : this.decisionLabel(f))}` : ""}${f.resurfaced ? ` · ${this.t("dueLabel")}` : ""}</small>${f.impact ? `<small>${this.esc(this.impactLine(f))}</small>` : ""}${this.corrLine(f.key) ? `<small>${this.corrLine(f.key)}</small>` : ""}${f.ignored_by === "label" ? `<small>${this.t("ignoredByLabel")}</small>` : ""}${f.ignore_rule ? `<small>${this.esc(this.findingRuleLine(f))}</small>` : ""}</div>${f.ignored_by === "label" || f.ignored_by === "mark" || f.ignored_by === "rule" ? "" : f.ignored ? `<button class="btn" data-ignore="${this.esc(f.key)}" data-ignore-value="0"><ha-icon icon="mdi:eye-outline"></ha-icon>${this.t("showFinding")}</button>` : hideButton(f)}</div>`).join("");
    return rows;
  }
}
