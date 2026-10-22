// "In the recorder": rows and time span of one entity per table, counted on request; mixed into the panel in 99-register.js.
Object.assign(TEXT.de, {
  erecTitle: "Im Recorder", erecHint: "Was für diese Entität in der Datenbank liegt. Das Zählen kann bei großen Datenbanken einige Sekunden dauern.",
  erecCount: "Zählen", erecRunning: "Zählt …", erecBusy: "Der Recorder ist gerade beschäftigt. Bitte gleich noch einmal versuchen.", erecFailed: "Das Zählen ist fehlgeschlagen: {reason}",
  erecStates: "Rohdaten (Zustände)", erecShort: "Kurzzeitstatistik (5 Min.)", erecLong: "Langzeitstatistik (1 Std.)",
  erecRows: "{count} Datensätze", erecFirst: "erster: {date}", erecLast: "letzter: {date}", erecNone: "nichts gespeichert",
  erecKeep: "Rohdaten reichen {days} Tage zurück; Aufbewahrung des Recorders: {keep} Tage.", erecKeepOff: "Rohdaten reichen {days} Tage zurück.",
});
Object.assign(TEXT.en, {
  erecTitle: "In the recorder", erecHint: "What the database holds for this entity. Counting can take a few seconds on large databases.",
  erecCount: "Count", erecRunning: "Counting …", erecBusy: "The recorder is busy. Please try again in a moment.", erecFailed: "Counting failed: {reason}",
  erecStates: "Raw data (states)", erecShort: "Short-term statistics (5 min)", erecLong: "Long-term statistics (1 h)",
  erecRows: "{count} records", erecFirst: "first: {date}", erecLast: "last: {date}", erecNone: "nothing stored",
  erecKeep: "Raw data reaches back {days} days; recorder retention: {keep} days.", erecKeepOff: "Raw data reaches back {days} days.",
});

class EntityRecorderMixin {
  entityRecorderCard(item) {
    if (item.object_type !== "entity" || !this.data.meta.recorder_available) return "";
    const id = item.object_id, state = this.entityRec?.[id];
    let body;
    if (state?.loading) body = `<p class="factnote">${this.t("erecRunning")}</p>`;
    else if (state?.data) body = this.entityRecorderRows(state.data, id);
    else body = `${state?.message ? `<p class="factnote">${this.esc(state.message)}</p>` : ""}<div class="pad"><button class="btn" data-erec="${this.esc(id)}">${this.t("erecCount")}</button></div>`;
    return `<section class="panel"><div class="panelhead"><div><h2>${this.t("erecTitle")}</h2><p>${this.t("erecHint")}</p></div></div>${body}${this.spaceEntityPart(id)}</section>`;
  }

  // The write rate of the entity (from the recorder load numbers) is the last row; it needs the numbers of the whole recorder.
  entityWriteRate(id) {
    const storms = this.storms?.available && !this.storms.busy ? this.storms : null;
    if (!storms) return "";
    const t = (k, v) => this.t(k, v), idx = (storms.entities || []).findIndex(e => e.entity_id === id), row = storms.entities?.[idx];
    let value;
    if (row?.excluded) value = t("knownExcluded");
    else if (row) {
      const share = storms.per_day ? Math.round((1000 * row.per_day) / storms.per_day) / 10 : null;
      value = `<b>${t("knownRate", { n: this.formatNumber(row.per_day) })}</b><small>${t("knownRank", { n: idx + 1 })}${share !== null ? ` · ${t("knownShare", { share: this.formatNumber(share) })}` : ""}</small>`;
    } else if ((storms.entities || []).length >= 100) value = t("knownQuiet", { n: 100 });
    else return "";
    return `<div class="fact"><span>${t("knownWriteRate")}</span><b>${value}</b></div>`;
  }

  entityRecorderRows(d, id = "") {
    const date = ts => this.esc(this.formatDate(new Date(ts * 1000).toISOString()));
    const row = (label, part) => `<div class="fact"><span>${this.t(label)}</span><b>${part.rows
      ? `${this.t("erecRows", { count: this.formatNumber(part.rows) })}<small>${this.t("erecFirst", { date: date(part.first) })} · ${this.t("erecLast", { date: date(part.last) })}</small>`
      : this.t("erecNone")}</b></div>`;
    let keep = "";
    if (d.states.rows && d.states.first) {
      const days = Math.max(1, Math.round((Date.now() / 1000 - d.states.first) / 86400));
      keep = `<p class="factnote">${d.keep_days ? this.t("erecKeep", { days, keep: d.keep_days }) : this.t("erecKeepOff", { days })}</p>`;
    }
    return `<div class="facts">${row("erecStates", d.states)}${row("erecShort", d.short)}${row("erecLong", d.long)}${id ? this.entityWriteRate(id) : ""}</div>${keep}`;
  }

  async loadEntityRecorder(entityId) {
    if (!this.storms && !this.stormsLoading) this.loadStorms();
    this.entityRec = { ...this.entityRec, [entityId]: { loading: true } };
    this.render();
    let next;
    try {
      const r = await this._hass.callWS({ type: "ha_housekeeper/entity_recorder", entity_id: entityId });
      next = r?.busy || !r?.available ? { message: this.t("erecBusy") } : { data: r };
    } catch (err) { next = { message: this.t("erecFailed", { reason: this.errText(err) }) }; }
    this.entityRec = { ...this.entityRec, [entityId]: next };
    this.render();
  }

  bindEntityRecorder(root) {
    root.querySelectorAll("[data-erec]").forEach(el => el.onclick = () => this.loadEntityRecorder(el.dataset.erec));
  }
}
