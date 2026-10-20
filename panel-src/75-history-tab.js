// HistoryTabMixin: the tab "History" of an object: its logbook, the plans of the journal that touched it and, for a
// device, its life. Mixed into the panel in 99-register.js.
Object.assign(TEXT.de, {
  tabHistory: "Verlauf", histPlans: "Pläne zu diesem Objekt", histPlansHint: "Bestätigte und geplante Änderungen aus dem Journal, die dieses Objekt betrafen.", histPlansNone: "Bisher kein Plan zu diesem Objekt.", histPlansLoading: "Journal wird geladen …",
  lifeTitle: "Lebenslauf", histNoticed: "Von Housekeeper bemerkt", histNoticedHint: "Was Housekeeper aus Scan, Registry und Zuverlässigkeit zu diesem Objekt weiß, neueste zuerst.", histNoticedNone: "Noch nichts bemerkt.",
  histSeen: "Beobachtet seit", histFinding: "Befund erkannt: {kind}", histQuarantine: "In Quarantäne seit {days} Tagen", histOpenNow: "Zurzeit", histUnstable: "Instabil im Zeitfenster der Zuverlässigkeit", histFlapping: "Flatternd im Zeitfenster der Zuverlässigkeit", histOpen: "Verlauf ansehen ({n})",
});
Object.assign(TEXT.en, {
  tabHistory: "History", histPlans: "Plans for this object", histPlansHint: "Confirmed and planned changes from the journal that concerned this object.", histPlansNone: "No plan for this object so far.", histPlansLoading: "Loading the journal …",
  lifeTitle: "Life", histNoticed: "Noticed by Housekeeper", histNoticedHint: "What Housekeeper knows about this object from the scan, the registry and the reliability, newest first.", histNoticedNone: "Nothing noticed yet.",
  histSeen: "Observed since", histFinding: "Finding detected: {kind}", histQuarantine: "In quarantine for {days} days", histOpenNow: "Right now", histUnstable: "Unstable in the reliability window", histFlapping: "Flapping in the reliability window", histOpen: "Show history ({n})",
});

class HistoryTabMixin {
  // The plans of the journal that name this object (the journal list carries the object IDs of each plan).
  plansOf(item) { return (this.journal || []).filter(p => (p.objects || []).includes(item.object_id)); }

  historyCount(item) {
    const key = this.objectKey(item);
    return this.notesList().filter(n => n.target === key).length + this.plansOf(item).length;
  }

  plansCard(item) {
    const plans = this.plansOf(item);
    const head = `<div class="panelhead"><div><h2>${this.t("histPlans")}</h2><p>${this.t("histPlansHint")}</p></div></div>`;
    if (this.journal === null || this.journal === undefined) return `<section class="panel">${head}${this.skeleton("histPlansLoading")}</section>`;
    // A small table like the Journal: date, state, result and follow-up; a click on a row opens the plan.
    const fuState = plan => plan.followup?.state ?? plan.followup ?? "";
    const rows = plans.length ? this.sysList("histplans", plans, {
      sort: "date", dir: "desc", tie: plan => plan.plan_id, empty: "histPlansNone",
      sorts: [{ key: "date", label: "journalColDate", dir: "desc", get: plan => plan.created_at || "" }],
      rowAttrs: plan => `data-plan-open="${this.esc(plan.plan_id)}" tabindex="0" role="button" aria-label="${this.esc(this.formatDate(plan.created_at))}"`,
      columns: [
        { key: "date", label: "journalColDate", dir: "desc", cell: plan => `<span class="statcell"><span class="tile mute"><ha-icon icon="mdi:clipboard-text-clock-outline"></ha-icon></span><strong>${this.esc(this.formatDate(plan.created_at))}</strong></span>` },
        { key: "status", label: "sortStatus", sortable: false, cell: plan => `<span class="pill ${plan.status === "verified" ? "ok" : plan.status === "dry_run" ? "mute" : "warn"}">${this.t(`plan_status_${plan.status || "dry_run"}`)}</span>` },
        { key: "total", label: "journalColActions", sortable: false, cell: plan => `<span class="jsum">${this.esc(this.t("planSummary", { total: plan.summary?.total ?? 0, ok: plan.summary?.ok ?? 0, review: plan.summary?.review ?? 0, blocked: plan.summary?.blocked ?? 0 }))}</span>` },
        { key: "follow", label: "journalColFollow", sortable: false, cell: plan => (fuState(plan) ? `<span class="pill ${this.followupTone(fuState(plan))}">${this.t(`fu_${fuState(plan)}`)}</span>` : "–") },
      ],
    }) : "";
    return `<section class="panel">${head}${rows || `<div class="emptymsg"><ha-icon icon="mdi:clipboard-text-outline"></ha-icon>${this.t("histPlansNone")}</div>`}</section>`;
  }

  // What the scan, the registry and the reliability say about the object over time: dated lines newest first, the undated ones on top.
  noticedLines(item, key) {
    const t = (k, v) => this.t(k, v), device = item.object_type === "device", dated = [], open = [];
    const add = (at, text, src) => { if (at) dated.push({ at, text, src }); };
    if (!device) add(item.status_since, t("histSeen"), "knownSrcScan");
    const finding = this.data.findings.find(f => this.findingKey(f) === key);
    if (finding?.first_detected_at) add(finding.first_detected_at, t("histFinding", { kind: t(finding.classification) }), "knownSrcRules");
    const quarantined = device ? null : this.quarantineOf(item.object_id);
    if (quarantined) add(quarantined.since, t("histQuarantine", { days: this.daysSince(quarantined.since) }), "knownSrcDecisions");
    if (this.realTime(item.created_at)) add(item.created_at, t("propCreated"), "knownSrcScan");
    if (this.realTime(item.modified_at)) add(item.modified_at, t("propModified"), "knownSrcScan");
    if (item.object_type === "entity") {
      add(item.last_changed, t("propLastChanged"), "knownSrcScan");
      add(item.last_reported || item.last_updated, t("propLastReported"), "knownSrcScan");
      const stable = this.stabilityOf(item);
      if (stable?.info) open.push({ text: t(stable.info.level === "flapping" ? "histFlapping" : "histUnstable"), src: "knownSrcReliability", tone: stable.info.level === "flapping" ? "red" : "warn" });
    }
    const again = device ? (this.data.recurring_devices || []).find(r => r.device_id === item.object_id) : null;
    if (again) add(again.forgotten_at, t("knownAgainText", { date: this.formatDate(again.forgotten_at) }), "knownSrcJournal");
    dated.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return [...open, ...dated];
  }

  noticedCard(item, key) {
    const lines = this.noticedLines(item, key);
    const head = `<div class="panelhead"><div><h2>${this.t("histNoticed")}</h2><p>${this.t("histNoticedHint")}</p></div></div>`;
    const rows = lines.map(l => `<div class="row rel"><span class="tile ${l.tone || "mute"}"><ha-icon icon="${l.at ? "mdi:clock-outline" : "mdi:alert-outline"}"></ha-icon></span><span class="row-text"><strong>${this.esc(l.text)}</strong><small>${l.at ? `${this.esc(this.formatDate(l.at))} · ${this.esc(this.relTime(l.at))}` : this.esc(this.t("histOpenNow"))}</small></span><span class="pill mute">${this.t(l.src)}</span></div>`).join("");
    return `<section class="panel">${head}${rows || `<div class="emptymsg"><ha-icon icon="mdi:eye-outline"></ha-icon>${this.t("histNoticedNone")}</div>`}</section>`;
  }

  // The line in "Known about …" that sends to the tab.
  knownHistoryLink(item, key) {
    return this.knownLine("mute", this.t("knownHistory"), `<button type="button" class="link" data-goto-tab="history">${this.t("histOpen", { n: this.formatNumber(this.historyCount(item)) })}</button>`, "knownSrcLog");
  }

  historyTab(item, key = this.objectKey(item)) {
    const right = `${this.noticedCard(item, key)}${item.object_type === "device" ? this.lifeCard(item) : ""}${this.plansCard(item)}`;
    return `<div class="detailgrid"><div class="stack">${this.noteCard(item)}</div><div class="stack">${right}</div></div>`;
  }
}
