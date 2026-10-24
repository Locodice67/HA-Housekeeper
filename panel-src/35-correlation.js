// CorrelationMixin: findings that began at about the time of an update or restart; mixed in by 99-register.js.
// Always worded "at about the same time as", never as a cause.
class CorrelationMixin {
  async loadCorrelations() {
    try { this.corr = await this._hass.callWS({ type: "ha_housekeeper/correlations" }); }
    catch (_) { this.corr = { groups: [], by_key: {} }; }
    this.render();
  }

  // Loads once, and again after every new scan.
  ensureCorrelations() {
    const key = this.data?.meta?.scanned_at || "";
    if (!this.data || (this._corrKey === key && this._corrRequested)) return;
    this._corrRequested = true; this._corrKey = key;
    setTimeout(() => this.loadCorrelations(), 0);
  }

  corrText(group) {
    const vars = { title: this.esc(group.title || ""), domain: this.esc(group.domain || ""), from: this.esc(group.from ?? ""), to: this.esc(group.to ?? "") };
    return this.t(`corr_${group.kind}`, vars) + (group.events > 1 ? ` ×${this.formatNumber(group.events)}` : "");
  }

  // The sentence on one finding, or "" when it began with nothing the log knows.
  corrLine(key) {
    const id = this.corr?.by_key?.[key];
    const group = id && this.corr.groups.find(g => g.id === id);
    return group ? this.t("corrAfter", { what: this.corrText(group), when: this.formatDate(group.at) }) : "";
  }

  corrFindingCount() { return Object.keys(this.corr?.by_key || {}).length; }

  // What the findings of one group have in common: how many, which classes, and over what time they began.
  corrSummary(group, findings) {
    const reasons = {};
    findings.forEach(f => { const r = this.findingReason(f); reasons[r] = (reasons[r] || 0) + 1; });
    const parts = Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([r, n]) => `<span class="pill mute">${this.esc(this.t("corrReason", { n: this.formatNumber(n), what: this.reasonLabel(r) }))}</span>`).join(" ");
    const times = findings.map(f => Date.parse(f.first_detected_at)).filter(Number.isFinite).sort((a, b) => a - b);
    const span = times.length ? this.t("corrSpan", { first: this.formatDate(new Date(times[0]).toISOString()), last: this.formatDate(new Date(times[times.length - 1]).toISOString()) }) : "";
    const more = group.total > findings.length ? ` ${this.t("corrMore", { n: this.formatNumber(group.total - findings.length) })}` : "";
    return `<p class="sub u-mb14">${this.esc(span)}${more}</p><div class="chips u-mb14">${parts}</div>`;
  }

  // The other updates of an incident, as one line under the title.
  corrAlso(group) {
    const list = (group.also || []).map(a => `<li><ha-icon icon="mdi:package-up"></ha-icon><span>${this.corrText(a)}</span></li>`);
    return list.length ? `<div class="corralso u-mb14"><strong>${this.t("corrAlsoLabel")}</strong><ul>${list.join("")}</ul></div>` : "";
  }

  // The findings of an incident are not listed again here: one button narrows the findings list below to them.
  corrGroupBody(group) {
    const findings = group.keys.map(k => this.data.findings.find(x => x.key === k)).filter(Boolean), n = this.corrKeys(group.id).size;
    const show = n ? `<button type="button" class="btn" data-corr-show="${this.esc(group.id)}"><ha-icon icon="mdi:filter-variant"></ha-icon>${this.t("corrShowN", { n: this.formatNumber(n) })}</button>` : "";
    return `${this.corrAlso(group)}${this.corrSummary(group, findings)}${show}`;
  }

  // The open findings that began with one incident: the filter its button sets.
  corrKeys(id) { const by = this.corr?.by_key || {}; return new Set((this.data?.findings || []).filter(f => !f.ignored && by[f.key] === id).map(f => f.key)); }

  // The incidents of the findings page: every update or restart that has findings, and every watch after a system
  // update. A watch belongs to the incident that holds the same update (kind, from, to); one without findings stands alone.
  incidents() {
    const groups = this.corr?.groups || [], watches = this.watch?.watches || [];
    const system = ["ha_version", "os_version", "supervisor_version"];
    const same = t => `${t.kind}|${t.from ?? ""}|${t.to ?? ""}`;
    const used = new Set();
    const items = groups.map(group => {
      const mine = new Set([group, ...(group.also || [])].filter(e => system.includes(e.kind)).map(same));
      const watch = watches.find(w => !used.has(w.id) && w.triggers.some(t => mine.has(same(t)))) || null;
      if (watch) used.add(watch.id);
      return { group, watch, at: group.at };
    });
    watches.filter(w => !used.has(w.id)).forEach(watch => items.push({ group: null, watch, at: watch.started_at }));
    const running = it => (it.watch && !it.watch.closed_at ? 1 : 0);
    // What only stands for itself (restart, plan, deleted statistics) comes after the updates, which can be a reason for findings.
    const alone = it => (it.group?.only_group && !it.watch ? 1 : 0);
    return items.sort((a, b) => running(b) - running(a) || alone(a) - alone(b) || (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  }

  incidentId(item) { return item.group ? `corr_${item.group.id}` : `corr_w_${item.watch.id}`; }

  // The fold of the incident that holds a watch, so the band in the page head can open it.
  incidentFoldId(watchId) {
    const item = this.incidents().find(it => it.watch && it.watch.id === watchId);
    return item ? this.incidentId(item) : `corr_w_${watchId}`;
  }

  incidentBody(item) {
    const parts = [];
    if (item.watch) parts.push(`<div class="incsec obs"><div class="sectionlabel">${this.t("incObs")}</div>${this.watchBody(item.watch)}</div>`);
    if (item.group) parts.push(`<div class="incsec"><div class="sectionlabel">${this.t("incFindings", { n: this.formatNumber(item.group.total) })}</div>${this.corrGroupBody(item.group)}</div>`);
    return parts.join("");
  }

  incidentIcon(group) { return !group ? "mdi:package-up" : group.kind === "start" ? "mdi:restart" : group.kind === "plan" ? "mdi:broom" : group.kind === "purge" ? "mdi:database-remove" : group.kind === "note" ? "mdi:pin-outline" : "mdi:package-up"; }

  // One card for what began or stopped after an update or restart. Closed by default; the filter line stays in view.
  corrGroupsCard(afterCount = 0, follows = 0) {
    this.ensureWatches?.();
    const items = this.incidents();
    if (!items.length) return "";
    const pg = this.paginate("corr", items);
    const open = this.foldOpen("corr", false);
    // The incidents as a list like the backups: a row opens its details below it, running watches first.
    this.lvState("corr", "at", "desc");
    const tones = { worse: "red", stable: "ok", transient: "mute", unknown: "mute", pending: "warn" };
    const isOpen = it => this.foldOpen(this.incidentId(it), false), running = it => it.watch && !it.watch.closed_at;
    const columns = [
      { key: "what", label: "incColWhat", sortable: false, cell: it => {
        const { group, watch } = it, id = this.incidentId(it), also = group?.also?.length ? ` <span class="pill warn alsopill" title="${this.esc(this.t("corrAlsoLabel"))}">+${group.also.length}</span>` : "";
        return `<div class="statcell">${this.expandBtn("data-inc-more", id, isOpen(it), this.t(isOpen(it) ? "incClose" : "incOpen"))}<ha-icon class="incicon" icon="${this.incidentIcon(group)}"></ha-icon><div><strong>${group ? this.corrText(group) : this.watchWhat(watch)}</strong>${also}</div></div>`;
      } },
      { key: "at", label: "incColAt", sortable: false, cell: it => this.ageCell(it.at) },
      { key: "findings", label: "incColFindings", sortable: false, cell: it => (it.group ? `<span class="pill ${it.group.only_group ? "mute" : "warn"}">${this.esc(this.formatNumber(it.group.total))}</span>` : "–") },
      { key: "watch", label: "incColWatch", sortable: false, cell: it => {
        const w = it.watch;
        if (!w) return "–";
        const left = running(it) ? `<small class="muted">${this.esc(this.t("incLeft", { hours: Math.max(0, Math.ceil((Date.parse(w.until) - Date.now()) / 3600000)) }))}</small>` : "";
        return `<span class="pill ${tones[w.result?.verdict] || "mute"}">${this.esc(this.t(`watchV_${w.result?.verdict || "unknown"}`))}</span>${left}`;
      } },
      { key: "menu", label: "rowMenu", menu: true, narrow: true, sortable: false, cell: it => (running(it) ? `<details class="rowmenu"><summary aria-label="${this.esc(this.t("rowMenu"))}"><ha-icon icon="mdi:dots-vertical"></ha-icon></summary><div class="menupop"><button type="button" class="menuitem" data-watch-end><ha-icon icon="mdi:eye-off-outline"></ha-icon>${this.t("watchEnd")}</button></div></details>` : "") },
    ];
    const table = this.listTable("corr", columns, pg.rows, { cls: "inc", rowAttrs: it => `data-inc-row="${this.esc(this.incidentId(it))}" tabindex="0" role="button" aria-expanded="${isOpen(it)}"`,
      after: it => (isOpen(it) ? `<tr class="static remhist"><td colspan="${columns.length}"><div class="incdetail">${this.incidentBody(it)}</div></td></tr>` : "") });
    const pill = `<span class="pill warn">${this.esc(this.t("corrIncidents", { n: this.formatNumber(items.length) }))}</span>`;
    const top = `<button class="row foldhead" data-fold="corr" aria-expanded="${open}"><span class="tile warn"><ha-icon icon="mdi:${open ? "chevron-down" : "chevron-right"}"></ha-icon></span><span class="row-text"><strong>${this.t("corrTitle")}</strong><small>${this.esc(this.t("corrHint"))}</small></span>${pill}</button>`;
    const on = Boolean(this.findingAfter);
    const strip = afterCount ? `<div class="incfilter${on ? " on" : ""}"><span><b>${this.esc(this.t("corrStrip", { n: this.formatNumber(afterCount) }))}</b>${follows ? ` <span class="muted">· ${this.esc(this.t("findingsOfFollow", { n: this.formatNumber(follows) }))}</span>` : ""}</span><button class="chip" data-finding-after="1" aria-pressed="${on}"><ha-icon icon="mdi:${on ? "close" : "filter-variant"}"></ha-icon>${this.t(on ? "corrFilterOff" : "corrFilterOn")}</button></div>` : "";
    return `<div class="panel"><div class="fold${open ? " open" : ""}">${top}${strip}${open ? `<div class="foldbody">${table}${pg.footer}</div>` : ""}</div></div>`;
  }
}
