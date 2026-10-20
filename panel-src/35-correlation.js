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

  corrGroupBody(group) {
    const findings = group.keys.map(k => this.data.findings.find(x => x.key === k)).filter(Boolean);
    const pg = this.paginate(`corr_${group.id}`, findings);
    return `${this.corrAlso(group)}${this.corrSummary(group, findings)}${pg.rows.map(f => this.findingRow(f, false, false)).join("")}${pg.footer}`;
  }

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
    if (item.watch) parts.push(`<div class="incsec obs"><h4>${this.t("incObs")}</h4>${this.watchBody(item.watch)}</div>`);
    if (item.group) parts.push(`<div class="incsec"><h4>${this.t("incFindings", { n: this.formatNumber(item.group.total) })}</h4>${this.corrGroupBody(item.group)}</div>`);
    return parts.join("");
  }

  incidentRow(item) {
    const { group, watch } = item, id = this.incidentId(item), open = this.foldOpen(id, false);
    const running = watch && !watch.closed_at;
    const icon = !group ? "mdi:package-up" : group.kind === "start" ? "mdi:restart" : group.kind === "plan" ? "mdi:broom" : group.kind === "purge" ? "mdi:database-remove" : group.kind === "note" ? "mdi:pin-outline" : "mdi:package-up";
    const title = group ? this.corrText(group) + (group.also?.length ? ` <span class="pill warn alsopill" title="${this.esc(this.t("corrAlsoLabel"))}">+${group.also.length}</span>` : "") : this.watchWhat(watch);
    const when = [this.formatDate(item.at)];
    if (running) when.push(this.t("incLeft", { hours: Math.max(0, Math.ceil((Date.parse(watch.until) - Date.now()) / 3600000)) }));
    else if (watch?.closed_at) when.push(this.t("watchEnded", { when: this.formatDate(watch.closed_at) }));
    const tones = { worse: "red", stable: "ok", transient: "mute", unknown: "mute", pending: "warn" };
    const pills = [group ? `<span class="pill ${group.only_group ? "mute" : "warn"}">${this.esc(this.t("corrCount", { n: this.formatNumber(group.total) }))}</span>` : (watch ? `<span class="pill mute">${this.esc(this.t("incNoFindings"))}</span>` : ""),
      watch ? `<span class="pill ${tones[watch.result?.verdict] || "mute"}">${this.esc(this.t(`watchV_${watch.result?.verdict || "unknown"}`))}</span>` : ""].join("");
    const endBtn = running ? `<button class="btn quiet" data-watch-end><ha-icon icon="mdi:eye-off-outline"></ha-icon>${this.t("watchEnd")}</button>` : "";
    const tile = group && group.only_group ? "mute" : "warn";
    const head = `<div class="incidenthead"><button class="row foldhead" data-fold="${this.esc(id)}" aria-expanded="${open}"><span class="tile ${tile}"><ha-icon icon="${open ? "mdi:chevron-down" : icon}"></ha-icon></span><span class="row-text"><strong>${title}</strong><small>${this.esc(when.join(" · "))}</small></span>${pills}</button>${endBtn}</div>`;
    return `<div class="fold${open ? " open" : ""}">${head}${open ? `<div class="foldbody">${this.incidentBody(item)}</div>` : ""}</div>`;
  }

  // One card for what began or stopped after an update or restart. Closed by default; the filter line stays in view.
  corrGroupsCard(afterCount = 0, follows = 0) {
    this.ensureWatches?.();
    const items = this.incidents();
    if (!items.length) return "";
    const pg = this.paginate("corr", items);
    const open = this.foldOpen("corr", false);
    const rows = pg.rows.map(it => this.incidentRow(it)).join("");
    const pill = `<span class="pill warn">${this.esc(this.t("corrIncidents", { n: this.formatNumber(items.length) }))}</span>`;
    const top = `<button class="row foldhead" data-fold="corr" aria-expanded="${open}"><span class="tile warn"><ha-icon icon="mdi:${open ? "chevron-down" : "chevron-right"}"></ha-icon></span><span class="row-text"><strong>${this.t("corrTitle")}</strong><small>${this.esc(this.t("corrHint"))}</small></span>${pill}</button>`;
    const on = Boolean(this.findingAfter);
    const strip = afterCount ? `<div class="incfilter${on ? " on" : ""}"><span><b>${this.esc(this.t("corrStrip", { n: this.formatNumber(afterCount) }))}</b>${follows ? ` <span class="muted">· ${this.esc(this.t("findingsOfFollow", { n: this.formatNumber(follows) }))}</span>` : ""}</span><button class="chip" data-finding-after="1" aria-pressed="${on}"><ha-icon icon="mdi:${on ? "close" : "filter-variant"}"></ha-icon>${this.t(on ? "corrFilterOff" : "corrFilterOn")}</button></div>` : "";
    return `<div class="panel"><div class="fold${open ? " open" : ""}">${top}${strip}${open ? `<div class="foldbody">${rows}${pg.footer}</div>` : ""}</div></div>`;
  }
}
