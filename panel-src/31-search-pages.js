// SearchPagesMixin: the top-bar search finds pages, settings tabs and finding filters, not only objects.
// The words are German and English together, so a page is found in either language. Mixed into the panel in 99-register.js.
Object.assign(TEXT.de, { quickGroupPages: "Seiten", quickGroupFilters: "Filter", quickGroupObjects: "Objekte", quickFilterHint: "Liste filtern" });
Object.assign(TEXT.en, { quickGroupPages: "Pages", quickGroupFilters: "Filters", quickGroupObjects: "Objects", quickFilterHint: "Filter the list" });

const SEARCH_WORDS = {
  overview: "start home status gesundheit zustand health",
  findingsNav: "befunde probleme fehler hinweise findings problems issues",
  cleanup: "aufräumen bereinigen löschen entfernen quarantäne cleanup delete remove quarantine",
  repair: "reparieren zähler umziehen ersetzen austauschen repair counter meter replace exchange",
  journal: "journal pläne rückgängig verlauf plans undo history",
  removedDevices: "entfernt gelöscht vergessen entfernte geräte removed deleted forgotten devices",
  maintenance: "wartung backup sicherung wiederherstellung update ziele maintenance restore goals",
  batteries: "batterien batterie akku schwach batteries battery low",
  reminders: "erinnerungen wartung filter reminders due",
  policies: "richtlinien regeln policies rules",
  reliability: "zuverlässigkeit ausfälle instabil reliability outages unstable",
  runs: "läufe automationen ausführungen runs automations traces",
  recorder: "recorder datenbank statistik größe database statistics size",
  storage: "speicher system festplatte arbeitsspeicher cpu storage disk memory",
  exposure: "freigabe assist sprachassistent exposure voice",
  dataflow: "zugriff datenfluss webhook zugang access data flow",
  secrets: "zugangsdaten passwörter schlüssel geheimnisse credentials secrets tokens passwords",
  inventory: "bestand objekte entitäten geräte inventory objects entities devices",
  components: "komponenten integrationen apps add-ons components integrations",
  graph: "abhängigkeiten beziehungen netz graph dependencies relations",
  changes: "änderungen vergleich scan-vergleich logbuch changes compare logbook",
  settings: "einstellungen optionen konfiguration settings options preferences",
  look: "darstellung theme dunkel hell schrift farbe appearance dark light font",
  protection: "schutz schutzmodus sicherheit protection mode",
  exceptions: "ausgeblendet ignoriert ausnahmen regeln urlaub urlaubsmodus hidden ignored exceptions rules vacation",
  scan: "scan schwellen intervall tage benachrichtigung meldung ereignisse threshold interval notification message events",
  goals: "ziele wartungsziele grenzen goals",
  backup: "backup backups sicherung wiederherstellung restore emergency kit verschlüsselung ablage protection aufräumen löschen eigene housekeeper tidy delete own",
  updates: "updates aktualisierungen vorab prüfen preflight speicher system apps hacs firmware check before",
  blueprints: "blueprints vorlagen fehlend defekt ungenutzt missing broken unused",
  info: "info version speichert daten diagnose prüfung quellen dauer about stored diagnostics coverage timing",
  compare: "scan-vergleich verlauf vergleich scans history compare",
  logbook: "logbuch notizen logbook notes",
};
// What a person may type for a finding status, besides its label.
const SEARCH_STATE_WORDS = {
  "": "offen open", new: "neu new", inwork: "in arbeit work", known: "bekannt behalten known keep",
  snoozed: "später zurückgestellt snoozed later", hidden: "ausgeblendet ignoriert hidden ignored", fixed: "behoben repariert fixed repaired",
};
const SEARCH_PAGE_LIMIT = 5, SEARCH_FILTER_LIMIT = 5;

class SearchPagesMixin {
  // Every page of the menu, the tabs of Settings and of Changes, as { view, tab?, label, path, words }.
  searchPages() {
    const pages = [];
    for (const [group, views] of NAV_GROUPS) {
      for (const view of views) pages.push({ view, label: this.t(view), path: group === NAV_GROUPS[0][0] ? "" : this.t(group), words: SEARCH_WORDS[view] || "" });
    }
    pages.push({ view: "settings", label: this.t("settings"), path: "", words: SEARCH_WORDS.settings });
    for (const [id, , labelKey] of this.settingsTabs()) pages.push({ view: "settings", settingsTab: id, label: this.t(labelKey), path: this.t("settings"), words: SEARCH_WORDS[id] || "" });
    for (const [id, label] of [["backup", "backupsTab"], ["updates", "updatesTab"], ["blueprints", "bpTab"], ["goals", "goalsTitle"]]) pages.push({ view: "maintenance", viewTab: id, label: this.t(label), path: this.t("maintenance"), words: SEARCH_WORDS[id] });
    pages.push({ view: "journal", viewTab: "devices", label: this.t("lifeRemovedTab"), path: this.t("journal"), words: SEARCH_WORDS.removedDevices });
    pages.push({ view: "changes", viewTab: "compare", label: this.t("tabScans"), path: this.t("changes"), words: SEARCH_WORDS.compare });
    pages.push({ view: "changes", viewTab: "logbook", label: this.t("logbook"), path: this.t("changes"), words: SEARCH_WORDS.logbook });
    return pages;
  }

  // The filters a person could set by hand: a status of the findings and a status of the objects, with how many each shows.
  searchFilters() {
    const filters = [];
    const states = ["", "new", "inwork", "known", "snoozed", "hidden", "fixed"];
    for (const state of states) {
      const count = state === "" ? this.findingTotal() : state === "fixed" ? this.doneCount() : this.statusCount(state);
      if (count) filters.push({ findingStatus: state, label: `${this.t("findingsNav")}: ${this.t(state === "" ? "stateOpen" : `state_${state}`)}`, count, words: SEARCH_STATE_WORDS[state] });
    }
    for (const [status, count] of Object.entries(this.data?.meta?.status_counts || {})) {
      if (count && status !== "active") filters.push({ objectStatus: status, label: `${this.t("inventory")}: ${this.t(status)}`, count, words: `${status} ${SEARCH_WORDS.inventory}` });
    }
    return filters;
  }

  // Matching entries of one list, best first: the label starts with the first word, contains it, or only the extra words do.
  searchMatch(list, query, limit) {
    const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const found = [];
    for (const entry of list) {
      const label = String(entry.label).toLowerCase(), hay = `${label} ${String(entry.path || "").toLowerCase()} ${entry.words || ""}`;
      if (terms.every(term => hay.includes(term))) found.push({ entry, rank: label.startsWith(terms[0]) ? 0 : label.includes(terms[0]) ? 1 : 2 });
    }
    return found.sort((a, b) => a.rank - b.rank).slice(0, limit).map(f => ({ ...f.entry, rank: f.rank }));
  }

  // The list the search box shows and the keyboard walks: pages and filters (the better matching block first), then objects.
  quickEntries() {
    const query = this.quickQuery;
    if (query.trim().length < 2) return [];
    const pages = this.searchMatch(this.searchPages(), query, SEARCH_PAGE_LIMIT).map(e => ({ ...e, kind: "page" }));
    const filters = this.searchMatch(this.searchFilters(), query, SEARCH_FILTER_LIMIT).map(e => ({ ...e, kind: "filter" }));
    const objects = this.quickResults().map(item => ({ kind: "object", item }));
    const filtersFirst = filters.length && (!pages.length || filters[0].rank < pages[0].rank);
    return [...(filtersFirst ? [...filters, ...pages] : [...pages, ...filters]), ...objects];
  }

  quickGo(entry) {
    if (entry.kind === "object") return this.quickPick(this.objectKey(entry.item));
    this.quickQuery = ""; this.quickOpen = false; this.quickIndex = 0; this.menuOpen = null; this.navOpen = false;
    const view = entry.kind === "filter" ? (entry.objectStatus ? "inventory" : "findingsNav") : entry.view;
    if (view !== this.view) this.noteJump(view);
    this.view = view; this.pages = {}; this.selected = null; this.trail = []; this.graphTrail = []; this.graphOrigin = null;
    if (entry.settingsTab) this.settingsTab = entry.settingsTab;
    if (entry.viewTab) (this.viewTab ||= {})[view] = entry.viewTab;
    if (entry.kind === "filter" && entry.objectStatus) { this.statusFilter = entry.objectStatus; this.typeFilter = ""; this.originFilter = ""; }
    if (entry.kind === "filter" && !entry.objectStatus) {
      this.findingStatus = entry.findingStatus; // new and in work are chips of the status row like the others
    }
    this.render();
    if (view === "changes" && !this.compare) this.loadCompare();
  }
}
