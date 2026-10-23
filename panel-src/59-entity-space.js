// Space per entity: which entities fill the states and their attributes (measured on request in the background), and
// which attributes of one entity take the space. Shown below the rows "states" and "state_attributes" of the largest
// tables, on the page of an entity and from the recorder load; mixed into the panel in 99-register.js.
Object.assign(TEXT.de, {
  spaceIntro: "Welche Entitäten hier den Platz belegen und welche Attribute dahinterstecken. Housekeeper liest dafür die Tabellen states und state_attributes ganz. Das läuft im Hintergrund, kann einige Minuten dauern und liest nur.",
  spaceStart: "Messen", spaceAgain: "Platz je Entität messen", spaceStop: "Abbrechen", spaceLoading: "Wird geladen …",
  spaceRunning: "Wird gemessen · {pct} %", spaceStopping: "Wird abgebrochen · {pct} %", spacePhaseStates: "Zustände", spacePhaseAttrs: "Attribute",
  spaceLeft: "noch etwa {left}", spaceLeftUnknown: "Restzeit wird geschätzt", spaceSeconds: "{n} Sekunden", spaceLeave: "Du kannst die Seite verlassen.", spaceInterim: "Vorläufig, bisher gelesen",
  spaceAt: "Gemessen {when} · dauerte {took} s", spaceStopped: "Abgebrochen nach {pct} %. Die Liste zeigt, was bis dahin gelesen war.", spaceFailed: "Nicht fertig geworden ({pct} % gelesen). Die Liste zeigt, was bis dahin gelesen war.",
  spaceScaled: "Gezählt sind Zeilen und Längen. Verteilt auf die Größe, die die Datenbank für beide Tabellen meldet; die Werte sind Schätzungen. Gleiche Attribute zählen einmal, geteilte zu gleichen Teilen.",
  spaceScaledEstimated: "Gezählt sind Zeilen und Längen. Verteilt auf die Größe, die MariaDB/MySQL für beide Tabellen schätzt; die Werte sind daher grob. Gleiche Attribute zählen einmal, geteilte zu gleichen Teilen.",
  spaceUnscaled: "Die Datenbank meldet keine Tabellengrößen. Die Werte sind die gemessenen Längen ohne Indizes und Verwaltung, also zu klein.",
  spaceLoose: "Nicht zugeordnet: {size} in {n} Attribut-Zeilen, die kein Zustand mehr benutzt. Der Recorder räumt sie beim nächsten Aufräumen weg.",
  spaceMore: "Gezeigt: die {shown} größten von {total} Entitäten.",
  spaceColSize: "Platz", spaceColRows: "Zustände", spaceColVariants: "Attribut-Zeilen", spaceColKey: "Attribut", spaceColShare: "Anteil", spaceColChanges: "Ändert sich",
  spaceAttrsLoading: "Attribute werden gelesen …", spaceAttrsNone: "Für diese Entität sind keine Attribute gespeichert.", spaceAttrsFailed: "Das Lesen ist fehlgeschlagen: {reason}",
  spaceAttrsTitle: "Attribute von {name}", spaceAttrsRead: "{read} Attribut-Zeilen gelesen", spaceAttrsNewest: "die neuesten {read} von {total} Attribut-Zeilen",
  spaceAttrsHint: "Ändert sich ein Attribut, legt Home Assistant eine neue Attribut-Zeile an, mit allen anderen Attributen darin. Markiert ist, was sich in mindestens der Hälfte der Zeilen ändert: Das verursacht die neuen Zeilen, auch wenn es selbst klein ist.",
  spaceAttrsRest: "Dazu {n} kleinere Attribute mit zusammen {pct} %.",
  spaceDriver: "verursacht neue Zeilen", spaceConstant: "gleichbleibend", spaceAlone: "In {n} Zeilen hat sich nur dieses Attribut geändert.",
  spaceExAdd: "Zum Ausschluss vormerken", spaceExOn: "Zum Ausschluss vorgemerkt", spaceExWhere: "YAML unter Recorder → Last", spaceTrim: "Verlauf kürzen",
  spaceFact: "Belegter Platz", spaceSplit: "Zustände {states} · Attribute {attrs}", spaceNotTop: "nicht unter den {n} größten", spaceGoto: "Messen unter Recorder → Datenbank", spaceFactRunning: "wird gemessen ({pct} %)",
  spaceAttrsOpen: "Nach Attributen aufschlüsseln", spaceLook: "Platz ansehen",
});
Object.assign(TEXT.en, {
  spaceIntro: "Which entities take the space here and which attributes are behind it. Housekeeper reads the tables states and state_attributes in full for it. It runs in the background, can take a few minutes and only reads.",
  spaceStart: "Measure", spaceAgain: "Measure space per entity", spaceStop: "Stop", spaceLoading: "Loading …",
  spaceRunning: "Measuring · {pct} %", spaceStopping: "Stopping · {pct} %", spacePhaseStates: "states", spacePhaseAttrs: "attributes",
  spaceLeft: "about {left} left", spaceLeftUnknown: "estimating the time left", spaceSeconds: "{n} seconds", spaceLeave: "You can leave the page.", spaceInterim: "Interim, read so far",
  spaceAt: "Measured {when} · took {took} s", spaceStopped: "Stopped at {pct} %. The list shows what was read until then.", spaceFailed: "Did not finish ({pct} % read). The list shows what was read until then.",
  spaceScaled: "Rows and lengths are counted, then spread over the size the database reports for both tables; the values are estimates. Identical attributes count once, shared ones in equal parts.",
  spaceScaledEstimated: "Rows and lengths are counted, then spread over the size MariaDB/MySQL estimates for both tables; the values are rough. Identical attributes count once, shared ones in equal parts.",
  spaceUnscaled: "The database reports no table sizes. The values are the measured lengths without indexes and overhead, so they are too small.",
  spaceLoose: "Not assigned: {size} in {n} attribute rows no state uses any more. The recorder removes them at its next purge.",
  spaceMore: "Shown: the {shown} largest of {total} entities.",
  spaceColSize: "Space", spaceColRows: "States", spaceColVariants: "Attribute rows", spaceColKey: "Attribute", spaceColShare: "Share", spaceColChanges: "Changes",
  spaceAttrsLoading: "Reading the attributes …", spaceAttrsNone: "No attributes are stored for this entity.", spaceAttrsFailed: "Reading failed: {reason}",
  spaceAttrsTitle: "Attributes of {name}", spaceAttrsRead: "{read} attribute rows read", spaceAttrsNewest: "the newest {read} of {total} attribute rows",
  spaceAttrsHint: "When an attribute changes, Home Assistant makes a new attribute row that holds all the other attributes again. Marked is what changes in at least half of the rows: it causes the new rows, even when it is small itself.",
  spaceAttrsRest: "Plus {n} smaller attributes with {pct} % together.",
  spaceDriver: "causes new rows", spaceConstant: "constant", spaceAlone: "In {n} rows only this attribute changed.",
  spaceExAdd: "Mark for exclusion", spaceExOn: "Marked for exclusion", spaceExWhere: "YAML under Recorder → Load", spaceTrim: "Trim history",
  spaceFact: "Space taken", spaceSplit: "states {states} · attributes {attrs}", spaceNotTop: "not among the {n} largest", spaceGoto: "Measure under Recorder → Database", spaceFactRunning: "being measured ({pct} %)",
  spaceAttrsOpen: "Break down by attributes", spaceLook: "Look at the space",
});

const SPACE_TABLES = ["states", "state_attributes"];

class EntitySpaceMixin {
  // mode: "" only looks, "start" or "stop" also starts or stops the measurement. While one runs, look again every two seconds.
  async loadSpace(mode = "") {
    this._spaceRequested = true;
    try { this.space = await this._hass.callWS({ type: "ha_housekeeper/entity_space", ...(mode ? { [mode]: true } : {}) }); this.spaceError = ""; }
    catch (err) { this.spaceError = this.errText(err); }
    this.render();
    globalThis.clearTimeout?.(this._spaceTimer);
    if (this.space?.running) this._spaceTimer = setTimeout(() => this.loadSpace(), 2000);
  }

  ensureSpace() {
    if (this._spaceRequested) return;
    this._spaceRequested = true;
    setTimeout(() => this.loadSpace(), 0);
  }

  async loadSpaceAttrs(id, retry = 0) {
    this.spaceAttrs = { ...this.spaceAttrs, [id]: { loading: true } };
    this.render();
    let next;
    try {
      const r = await this._hass.callWS({ type: "ha_housekeeper/entity_attributes", entity_id: id });
      // Another recorder query holds the lock (a step of the measurement, often): try again shortly.
      if (r?.busy && retry < 5) { setTimeout(() => this.loadSpaceAttrs(id, retry + 1), 2000); return; }
      next = r?.busy || !r?.available ? { message: this.t("erecBusy") } : { data: r };
    } catch (err) { next = { message: this.t("spaceAttrsFailed", { reason: this.errText(err) }) }; }
    this.spaceAttrs = { ...this.spaceAttrs, [id]: next };
    this.render();
  }

  spaceName(id) {
    return this.findObject(`entity:${id}`)?.name || id;
  }

  spacePct(share) {
    return this.formatNumber(Math.round((share || 0) * 100));
  }

  spaceLeft(seconds) {
    return seconds < 90 ? this.t("spaceSeconds", { n: this.formatNumber(Math.max(1, Math.round(seconds))) }) : this.relDuration(seconds);
  }

  // The entities by the space they take; outside a running measurement a row opens its attributes below it.
  spaceList(result, interim = false) {
    const items = result.entities || [], max = Math.max(0, ...items.map(e => e.bytes));
    const num = v => this.esc(this.formatNumber(v ?? 0));
    return this.sysList(interim ? "spaceinterim" : "spaceents", items, {
      sort: "size", dir: "desc",
      sorts: [
        { key: "size", label: "spaceColSize", dir: "desc", get: e => e.bytes },
        { key: "name", label: "utName", dir: "asc", get: e => this.spaceName(e.entity_id) },
        { key: "rows", label: "spaceColRows", dir: "desc", get: e => e.rows },
        { key: "variants", label: "spaceColVariants", dir: "desc", get: e => e.variants },
      ],
      text: e => `${this.spaceName(e.entity_id)} ${e.entity_id}`, tie: e => e.entity_id, empty: "dbSeriesNone",
      columns: [
        { key: "name", label: "utName", dir: "asc", cell: e => this.nameCell(this.spaceName(e.entity_id), e.entity_id) },
        { key: "size", label: "spaceColSize", dir: "desc", cell: e => `<span class="dbshare">${this.sysShare(e.bytes, max)}<b>${this.esc(this.formatBytes(e.bytes))}</b></span>` },
        { key: "rows", label: "spaceColRows", dir: "desc", cell: e => num(e.rows) },
        { key: "variants", label: "spaceColVariants", dir: "desc", cell: e => num(e.variants) },
      ],
      rowAttrs: e => (interim ? 'class="static"' : `data-space-ent="${this.esc(e.entity_id)}" tabindex="0" role="button" aria-expanded="${this.spaceSel === e.entity_id}"`),
      after: e => (!interim && !this.spaceSelTop && this.spaceSel === e.entity_id ? `<tr class="static"><td colspan="4"><div class="spacekeys">${this.spaceAttrsBlock(e.entity_id, e)}</div></td></tr>` : ""),
      bare: true,
      ...(interim ? {} : { exportName: "entity-space", header: ["Name", "Entity", "Bytes", this.t("spaceColRows"), this.t("spaceColVariants")], rows: e => [this.spaceName(e.entity_id), e.entity_id, e.bytes, e.rows, e.variants] }),
    });
  }

  // What opens below the rows states and state_attributes: the button, the running measurement or its result.
  spaceBlock() {
    const s = this.space;
    if (this.spaceError) return this.notice("err", this.spaceError);
    if (!s) return `<p class="factnote">${this.t("spaceLoading")}</p>`;
    if (!s.available) return `<p class="factnote">${this.t("relNoRecorder")}</p>`;
    if (s.running) {
      const p = s.progress || {}, pct = Math.round((p.share || 0) * 100);
      const left = p.left === null || p.left === undefined ? this.t("spaceLeftUnknown") : this.t("spaceLeft", { left: this.spaceLeft(p.left) });
      const list = s.interim?.entities?.length ? `<div class="sectionlabel">${this.t("spaceInterim")}</div>${this.spaceList(s.interim, true)}` : "";
      return `<div class="spacehead"><span>${this.t(p.stopping ? "spaceStopping" : "spaceRunning", { pct: this.formatNumber(pct) })} · ${this.t(p.phase === "attrs" ? "spacePhaseAttrs" : "spacePhaseStates")}</span><button class="btn quiet" data-space-stop ${p.stopping ? "disabled" : ""}>${this.t("spaceStop")}</button></div>
        <div class="wzprog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div><p class="factnote">${left} · ${this.t("spaceLeave")}</p>${list}`;
    }
    // Opened from the load view for an entity without a page: its attributes stand on top, whatever the list shows.
    const top = this.spaceSelTop && this.spaceSel ? `<div class="spacekeys">${this.spaceAttrsBlock(this.spaceSel, (s.result?.entities || []).find(e => e.entity_id === this.spaceSel))}</div>` : "";
    const r = s.result;
    if (!r) return `${top}<div class="spacehead"><p class="factnote">${this.t("spaceIntro")}</p></div>`;
    const when = this.relTime(new Date(r.computed_at * 1000).toISOString()), took = this.formatNumber(Math.round((r.took_ms || 0) / 1000));
    const partial = r.state === "stopped" || r.state === "failed" ? this.notice("warn", this.t(r.state === "stopped" ? "spaceStopped" : "spaceFailed", { pct: this.spacePct(r.read_share) })) : "";
    const notes = [
      this.t(!r.scaled ? "spaceUnscaled" : r.estimated ? "spaceScaledEstimated" : "spaceScaled"),
      r.loose_attrs_bytes ? this.t("spaceLoose", { size: this.formatBytes(r.loose_attrs_bytes), n: this.formatNumber(r.loose_attrs_rows) }) : "",
      r.entities_total > r.entities.length ? this.t("spaceMore", { shown: this.formatNumber(r.entities.length), total: this.formatNumber(r.entities_total) }) : "",
    ].filter(Boolean).map(x => `<p class="factnote">${this.esc(x)}</p>`).join("");
    return `${top}<div class="spacehead"><span>${this.esc(this.t("spaceAt", { when, took }))}</span></div>${partial}${this.spaceList(r)}${notes}`;
  }

  // The attributes of one entity by their share; `measured` is its row of the measurement (bytes instead of lengths), `page` leaves out the way to the page.
  spaceAttrsBlock(id, measured = null, page = false) {
    const st = this.spaceAttrs?.[id];
    if (!st || st.loading) return `<p class="factnote">${this.t("spaceAttrsLoading")}</p>`;
    if (!st.data) return `<p class="factnote">${this.esc(st.message || "")}</p>`;
    const d = st.data;
    if (!d.found || !d.read) return `<p class="factnote">${this.t("spaceAttrsNone")}</p>`;
    const steps = Math.max(d.read - 1, 1), scale = measured?.attrs_bytes ? measured.attrs_bytes : d.chars;
    const changed = k => (d.read > 1 ? Math.round((k.changes / steps) * 100) : null);
    const hint = k => (k.driver ? `<span class="pill warn"${k.alone ? ` title="${this.esc(this.t("spaceAlone", { n: this.formatNumber(k.alone) }))}"` : ""}>${this.t("spaceDriver")}</span>` : d.read > 1 && !k.changes ? `<span class="pill mute">${this.t("spaceConstant")}</span>` : "");
    const list = this.sysList(page ? "spacekeyspage" : "spacekeys", d.keys, {
      sort: "share", dir: "desc",
      sorts: [
        { key: "share", label: "spaceColShare", dir: "desc", get: k => k.chars },
        { key: "key", label: "spaceColKey", dir: "asc", get: k => k.key },
        { key: "changes", label: "spaceColChanges", dir: "desc", get: k => k.changes },
      ],
      text: k => k.key, tie: k => k.key, empty: "spaceAttrsNone",
      columns: [
        { key: "key", label: "spaceColKey", dir: "asc", cell: k => `<code>${this.esc(k.key)}</code> ${hint(k)}` },
        { key: "share", label: "spaceColShare", dir: "desc", cell: k => `<span class="dbshare">${this.sysShare(k.share, 1)}<b>${this.esc(`${this.formatNumber(Math.round(k.share * 1000) / 10)} %`)}</b></span>` },
        { key: "size", label: "spaceColSize", sortable: false, cell: k => this.esc(this.formatBytes(Math.round(k.share * scale))) },
        { key: "changes", label: "spaceColChanges", dir: "desc", cell: k => (changed(k) === null ? "–" : this.esc(`${this.formatNumber(changed(k))} %`)) },
      ],
    });
    const read = d.read < d.total ? this.t("spaceAttrsNewest", { read: this.formatNumber(d.read), total: this.formatNumber(d.total) }) : this.t("spaceAttrsRead", { read: this.formatNumber(d.read) });
    const rest = d.rest?.keys ? `<p class="factnote">${this.t("spaceAttrsRest", { n: this.formatNumber(d.rest.keys), pct: this.formatNumber(Math.round((d.rest.chars / (d.chars || 1)) * 1000) / 10) })}</p>` : "";
    const marked = this.excludeSel.has(id);
    const actions = `<div class="spaceacts"><button class="btn quiet${marked ? " on" : ""}" data-space-ex="${this.esc(id)}" aria-pressed="${marked}"><ha-icon icon="mdi:database-off-outline"></ha-icon>${this.t(marked ? "spaceExOn" : "spaceExAdd")}</button>${marked ? `<button type="button" class="btn quiet" data-space-goto="load">${this.t("spaceExWhere")}</button>` : ""}${page || !this.findObject(`entity:${id}`) ? "" : `<button class="btn quiet" data-object="entity:${this.esc(id)}"><ha-icon icon="mdi:content-cut"></ha-icon>${this.t("spaceTrim")}</button>`}</div>`;
    return `<div class="sectionlabel">${this.esc(this.t("spaceAttrsTitle", { name: this.spaceName(id) }))} · ${this.esc(read)}</div>${list}${rest}<p class="factnote">${this.t("spaceAttrsHint")}</p>${actions}`;
  }

  // On the page of an entity, inside "In the recorder": its space from the last measurement and the breakdown on request.
  spaceEntityPart(id) {
    this.ensureSpace();
    const s = this.space, r = s?.result, row = r?.entities?.find(e => e.entity_id === id);
    let value;
    if (row) value = `${this.esc(this.formatBytes(row.bytes))}<small>${this.esc(this.t("spaceSplit", { states: this.formatBytes(row.states_bytes), attrs: this.formatBytes(row.attrs_bytes) }))}</small>`;
    else if (s?.running) value = this.t("spaceFactRunning", { pct: this.spacePct(s.progress?.share) });
    else if (r) value = this.t("spaceNotTop", { n: this.formatNumber(r.entities.length) });
    else value = `<button type="button" class="btn quiet" data-space-goto="db">${this.t("spaceGoto")}</button>`;
    const st = this.spaceAttrs?.[id];
    const open = st ? `<div class="pad">${this.spaceAttrsBlock(id, row, true)}</div>` : `<div class="pad"><button class="btn" data-space-attrs="${this.esc(id)}"><ha-icon icon="mdi:format-list-bulleted-square"></ha-icon>${this.t("spaceAttrsOpen")}</button></div>`;
    return `<div class="facts"><div class="fact"><span>${this.t("spaceFact")}</span><b>${value}</b></div></div>${open}`;
  }

  // The tables that open the measurement; the name cell gets the arrow.
  spaceTable(name) {
    return SPACE_TABLES.includes(name);
  }

  bindSpace(root) {
    root.querySelectorAll("[data-space-start]").forEach(el => el.onclick = () => this.loadSpace("start"));
    root.querySelectorAll("[data-space-stop]").forEach(el => el.onclick = () => this.loadSpace("stop"));
    root.querySelectorAll("[data-space-toggle]").forEach(el => el.onclick = () => {
      this.spaceOpen = this.spaceOpen === el.dataset.spaceToggle ? "" : el.dataset.spaceToggle;
      if (this.spaceOpen) this.ensureSpace();
      this.render();
    });
    root.querySelectorAll("[data-space-ent]").forEach(el => el.onclick = ev => {
      if (ev?.target?.closest?.("button, a, input") && ev.target.closest("tr") === el) return;
      const id = el.dataset.spaceEnt;
      this.spaceSel = this.spaceSel === id && !this.spaceSelTop ? "" : id;
      this.spaceSelTop = false;
      if (this.spaceSel && !this.spaceAttrs?.[id]?.data) this.loadSpaceAttrs(id);
      else this.render();
    });
    root.querySelectorAll("[data-space-attrs]").forEach(el => el.onclick = () => this.loadSpaceAttrs(el.dataset.spaceAttrs));
    root.querySelectorAll("[data-space-ex]").forEach(el => el.onclick = () => {
      const id = el.dataset.spaceEx;
      this.excludeSel.has(id) ? this.excludeSel.delete(id) : this.excludeSel.add(id);
      this.render();
    });
    // To a tab of the Recorder, also from the page of an entity: the database tab opens with the measurement unfolded.
    root.querySelectorAll("[data-space-goto]").forEach(el => el.onclick = ev => {
      ev?.stopPropagation();
      const tab = el.dataset.spaceGoto;
      this.noteJump?.("recorder");
      this.view = "recorder"; (this.viewTab ||= {}).recorder = tab; this.pages = {}; this.selected = null; this.trail = [];
      if (tab === "db") { this.spaceOpen = "states"; this.ensureSpace(); }
      this.render();
    });
    root.querySelectorAll("[data-space-look]").forEach(el => el.onclick = ev => {
      ev?.stopPropagation();
      const id = el.dataset.spaceLook, obj = this.findObject(`entity:${id}`);
      this.loadSpaceAttrs(id);
      if (obj) { this.openObject(obj); return; }
      // An entity the inventory does not know has no page: its attributes open below the measurement instead.
      (this.viewTab ||= {}).recorder = "db"; this.spaceOpen = "states"; this.spaceSel = id; this.spaceSelTop = true; this.ensureSpace(); this.render();
    });
  }
}
