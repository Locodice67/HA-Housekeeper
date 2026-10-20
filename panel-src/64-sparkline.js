// SparklineMixin: the small history lines in the overview tiles. The series comes from the stored
// scan history (one point per day); the number beside it is the change over the whole period.
const SPARK_MIN_POINTS = 3;

class SparklineMixin {
  // The series is fetched once per data set, like the comparison with the previous scan.
  ensureSeries() {
    if (this._seriesFor === this.data || !this._hass?.callWS) return;
    this._seriesFor = this.data;
    this.loadSeries(this.data);
  }

  async loadSeries(data) {
    try {
      const result = await this._hass.callWS({ type: "ha_housekeeper/history_series" });
      if (this.data !== data) return;
      this.series = Array.isArray(result?.points) ? result : null;
      if (["overview", "findingsNav"].includes(this.view) && !this.selected) this.render();
    } catch (_) { if (this.data === data) this.series = null; }
  }

  // The end point is a zero-length line with round caps and a non-scaling stroke: the SVG is stretched
  // (preserveAspectRatio none), which would turn a circle into an ellipse.
  // Line, end point and the change over the period for one key of the series ("objects", "findings",
  // "unavailable"). "rising" says whether more is worse; without it the colour stays neutral.
  sparkline(key, rising) {
    // "class:<name>" reads the open findings of one class, "lead:<name>" the same without follow-ups; a day that stored
    // classes without it had none, and a day from before the follow-ups were told apart has no such series at all.
    // "reason:<name>" reads the open findings of one tile of the findings page (all of them, the outage rules as one).
    const read = p => key.startsWith("reason:") ? (p.reasons ? p.reasons[key.slice(7)] || 0 : undefined)
      : key.startsWith("class:") ? (p.classes ? p.classes[key.slice(6)] || 0 : undefined)
      : key.startsWith("lead:") ? (p.lead_classes ? p.lead_classes[key.slice(5)] || 0 : undefined) : p[key];
    const points = (this.series?.points || []).filter(p => Number.isFinite(read(p)));
    if (points.length < SPARK_MIN_POINTS) return `<span class="spark-hint">${this.t("sparkBuilding")}</span>`;
    const values = points.map(read), n = values.length;
    const first = values[0], last = values[n - 1], change = last - first;
    const days = Math.max(1, Math.round((new Date(points[n - 1].at) - new Date(points[0].at)) / 864e5));
    const w = 200, h = 36, pad = 4;
    let lo = Math.min(...values), hi = Math.max(...values);
    const span = key === "health" ? 1 : Math.max(4, hi * 0.1); // the state of the house moves in tenths of a point
    if (hi - lo < span) { const mid = (hi + lo) / 2; lo = mid - span / 2; hi = mid + span / 2; }
    const x = i => pad + ((w - 2 * pad) * i) / (n - 1), y = v => h - pad - ((h - 2 * pad) * (v - lo)) / (hi - lo);
    const tone = !rising || !change ? "" : (change > 0) === (rising === "bad") ? "red" : "ok";
    const sign = change > 0 ? "+" : change < 0 ? "−" : "±";
    const text = this.t("sparkChange", { change: `${sign}${this.formatNumber(Math.abs(change))}`, days: this.formatNumber(days) });
    const label = this.t("sparkLabel", { from: this.formatNumber(first), to: this.formatNumber(last), days: this.formatNumber(days) });
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${this.esc(label)}"><polyline fill="none" stroke="var(--hk-muted)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" points="${values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/><line class="spark-halo" x1="${x(n - 1).toFixed(1)}" y1="${y(last).toFixed(1)}" x2="${x(n - 1).toFixed(1)}" y2="${y(last).toFixed(1)}"/><line class="spark-end ${tone}" x1="${x(n - 1).toFixed(1)}" y1="${y(last).toFixed(1)}" x2="${x(n - 1).toFixed(1)}" y2="${y(last).toFixed(1)}"/></svg><span class="spark-cap ${tone}">${this.esc(text)}</span>`;
  }
}
