// Exception rules: objects in an area or with a label are left out of the findings; mixed into the panel in 99-register.js.
Object.assign(TEXT.de, {
  allLabels: "Alle Labels", lblTitle: "Labels", lblHint: "Housekeeper kennt drei feste Labels. Du legst sie in Home Assistant mit genau diesem Namen an und weist sie Objekten zu; Housekeeper erstellt sie nicht selbst.",
  lblOpenHa: "Labels in Home Assistant öffnen", lblCreated: "angelegt", lblMissing: "nicht angelegt", lblNoUse: "an keinem Objekt", lblUse: "an", lblShow: "Objekte anzeigen", lblCopy: "Name kopieren", lblCopied: "Kopiert",
  lblKind_keep: "Nicht entfernen", lblKind_ignore: "Ignorieren", lblKind_critical: "Kritisch",
  lblFx_keep_1: "Sperrt alle Bereinigungsschritte (deaktivieren, entfernen); das Gerät fehlt in „Bereinigen → Geräte deaktivieren“", lblFx_keep_0: "Blendet keine Befunde aus: Ein Ausfall wird weiter gemeldet",
  lblFx_ignore_1: "Blendet die Befunde der Entität, Automation oder des Geräts (samt seiner Entitäten) aus", lblFx_ignore_2: "Nimmt das Objekt aus Richtlinien, Zuverlässigkeit, Ausfallstürmen und Exposition und sperrt Bereinigungsschritte", lblFx_ignore_0: "Auch Ausfälle werden nicht mehr gemeldet",
  lblFx_critical_1: "Das Objekt zählt als wichtig; Ausfälle werden höher eingestuft", lblFx_critical_2: "Bereinigungsschritte müssen einzeln bestätigt werden; wirkt an Entität, Gerät oder Bereich", lblFx_critical_0: "Schlösser, Alarme, Rauch- und Wassermelder sind auch ohne Label kritisch",
  lblN_entity: "{n} Entitäten", lblN_entity1: "1 Entität", lblN_device: "{n} Geräten", lblN_device1: "1 Gerät", lblN_automation: "{n} Automationen", lblN_automation1: "1 Automation", lblN_script: "{n} Skripten", lblN_script1: "1 Skript", lblN_scene: "{n} Szenen", lblN_scene1: "1 Szene", lblN_area: "{n} Bereichen", lblN_area1: "1 Bereich",
  lblHow: "So legst du ein fehlendes Label an: In Home Assistant unter Einstellungen → Bereiche, Labels & Zonen → Labels ein Label mit genau diesem Namen erstellen, dann Geräte oder Entitäten (auch mehrere auf einmal) auswählen und das Label zuweisen. Danach neu scannen.",
  lblFoot: "Soll nur nichts aufgeräumt werden, nimm housekeeper_keep. Soll Housekeeper ein Objekt ganz in Ruhe lassen, nimm housekeeper_ignore oder einen Vermerk. Für Geräte, die oft aus sind, passen der Vermerk „Absichtlich offline“ und Ausnahmeregeln mit Frist besser. Die Zahlen stammen aus dem letzten Scan.",
  excTitle: "Ausnahmeregeln", excHint: "Housekeeper meldet Objekte nicht, auf die eine Regel passt: nach Bereich, Label, Integration, Typ (Domain), Gerät oder Entität. Die Regeln gelten nur in Housekeeper; Home Assistant bleibt unverändert. Das Label housekeeper_ignore wirkt zusätzlich fest.",
  excFormNew: "Regel anlegen", excFormEdit: "Regel bearbeiten", excAdd: "Regel hinzufügen", excEdit: "Ändern", excDelete: "Löschen", excLoading: "Regeln werden geladen …",
  excKind: "Art", excKind_area: "Bereich", excKind_label: "Label", excKind_integration: "Integration", excKind_domain: "Domain (Typ)", excTargets: "Auswahl", excNoTargets: "In Home Assistant gibt es dafür noch nichts zur Auswahl.",
  excAction: "Aktion", excAction_hide: "Ausblenden", excAction_delay: "Erst melden nach", excDays: "Tage nicht verfügbar", excNote: "Notiz (optional)",
  excInherit: "Trifft Geräte und Entitäten. Eine Entität ohne eigenen Bereich erbt den Bereich ihres Geräts, ein Label am Gerät gilt auch für seine Entitäten. „Integration“ und „Domain“ treffen alle Entitäten dieser Integration oder dieses Typs (etwa media_player); eine breite Domain wie sensor deckt auch echte Störungen zu, die Vorschau zeigt die Treffer vorher.",
  excDelayHint: "Hält nur „nicht verfügbar“, „unbekannt“ und „veraltet“ zurück. Alle anderen Befunde dieser Objekte (leere Batterie, defekter Verweis) erscheinen weiter normal; wer alles unterdrücken will, wählt „Ausblenden“. Nach Ablauf der Frist erscheint der Befund mit der Stufe seiner Ausfalldauer. Gemessen ab dem Ausfallbeginn, soweit bekannt; nach einem Neustart kann die Meldung später kommen, nie früher.",
  excWinner: "Passen mehrere Regeln, schlägt „Ausblenden“ die Fristen; bei mehreren Fristen gilt die längste.",
  excRuleArea: "Bereich {names}", excRuleLabel: "Label {names}", excRuleIntegration: "Integration {names}", excRuleDomain: "Domain {names}", excRuleDelayLine: "Erst melden nach {n} Tagen", excRuleHideLine: "Ausblenden",
  excEffectHide: "{objects} Objekte, {n} Befunde ausgeblendet", excEffectDelay: "{hold} Befunde zurückgehalten, {due} fällig", excEffectNone: "Trifft gerade nichts",
  excPreview: "Vorschau", excPreviewHide: "{objects} Objekte, {n} Befunde würden ausgeblendet", excPreviewDelay: "{hold} Befunde würden zurückgehalten, {due} wären sofort fällig (schon länger ausgefallen)",
  excImportant: "Dabei sind Befunde mit hoher Wirkung: {names}. Prüfe, ob sie wirklich ausgenommen sein sollen.",
  excSave: "Regel speichern", excCancel: "Abbrechen", excNeedTarget: "Wähle mindestens einen Eintrag.", excDaysInvalid: "Die Frist muss eine ganze Zahl von 1 bis {max} Tagen sein.", excFailed: "Nicht gespeichert: {reason}",
  excOn: "Regel aktiv", excDue: "Frist abgelaufen",
  hidByRule: "Durch eine Regel", ignoredByRule: "Ausgeblendet durch eine Ausnahmeregel: {rule}", heldByRule: "Zurückgehalten durch eine Ausnahmeregel: {rule}, wird ab {date} gemeldet", dueByRule: "Frist abgelaufen · Ausnahmeregel: {rule}",
  excKind_device: "Gerät", excKind_entity: "Entität", excRuleDevice: "Gerät {names}", excRuleEntity: "Entität {names}", excSearch: "Suchen …", excMore: "Weitere über die Suche",
  excColRule: "Regel", excColAction: "Aktion", excColEffect: "Wirkung jetzt", excColOn: "An", excColActions: "Aktionen", excKind_any: "Alle Typen", excAnyHint: "Sucht über alle Typen: Bereiche, Labels, Integrationen, Geräte und Entitäten. Beim Speichern entsteht je Art eine Regel ({n}).", excGroupAlways: "Immer", excGroupVacation: "Im Urlaubsmodus", excAddShort: "Regel hinzufügen", excChosen: "{n} gewählt",
  excEmptyAlways: "Noch keine dauerhafte Regel", excEmptyAlwaysNext: "Zum Beispiel einen Bereich oder ein Label dauerhaft ausblenden.", excEmptyVacation: "Noch keine Regel für den Urlaubsmodus", excEmptyVacationNext: "Zum Beispiel das Gewächshaus ausblenden, solange du weg bist.", excVacNoEntity: "Ohne Entität für den Urlaubsmodus greifen diese Regeln nie. Wähle sie unten bei „Urlaubsmodus“.",
  excForLabel: "Wofür", excFor_objects: "Nur {name}", excFor_objects_n: "Nur diese {n} Objekte", excFor_devices: "Gerät {name}", excFor_devices_n: "Ihre {n} Geräte", excFor_areas: "Bereich {name}", excFor_areas_n: "Ihre {n} Bereiche", excFor_integrations: "Integration {name}", excFor_integrations_n: "Ihre {n} Integrationen",
  excForSub_devices: "mit allen seinen Entitäten", excForSub_areas: "alle Geräte und Entitäten im Bereich", excForSub_integrations: "alle ihre Entitäten",
  excForMore: "Ein einzelnes Objekt mit Grund oder Zeitfenster: dafür ist der Vermerk da. Label, Typ oder eine andere Auswahl:", excForSettings: "in den Einstellungen bearbeiten",
  excScope: "Gilt", excScope_always: "Immer", excScope_vacation: "Nur im Urlaubsmodus", excScopeChip_vacation: "nur im Urlaub", excScopeChip_always: "immer",
  excScopeHint: "Im Urlaubsmodus bleiben diese Objekte still, auch wenn ein Gerät kaputtgeht. Nach dem Urlaub zählt der Ausfall neu: mit eigener Frist deren Tage, sonst die Nachfrist.",
  excOverlap: "Diese Objekte trifft schon: {rules}. Im Urlaub gilt das Ausblenden, danach wieder die Frist der anderen Regel, gezählt ab dem Ende des Urlaubs.",
  vacTitle: "Urlaubsmodus", vacHint: "Solange die gewählte Entität „an“ ist, gelten die Regeln „nur im Urlaubsmodus“. Ist sie nicht verfügbar oder unbekannt, gilt der Modus als aus. Schalten kannst du sie in Home Assistant, zum Beispiel per Kalender oder Automation.",
  vacEntity: "Entität für den Urlaubsmodus", vacEntityHint: "Jede Entität, die „an“ sein kann: Helfer, Schalter, Binärsensor, Zeitplan, Kalender. Leer lassen schaltet den Urlaubsmodus aus.",
  vacAuto: "Vorschlag, weil es diese Entität gibt. Sie gilt erst, wenn du speicherst; ändere oder leere das Feld, wenn du sie nicht willst.", vacKeyword: "Stichwort im Termin", vacKeywordExample: "Urlaub", vacKeywordHint: "Nur Termine, deren Titel dieses Wort enthält, schalten den Urlaubsmodus ein, so lässt sich dein normaler Kalender nutzen. Leer: jeder laufende Termin zählt, für einen eigenen Urlaubskalender.",
  vacGrace: "Nachfrist nach dem Urlaub", vacGraceUnit: "Stunden", vacGraceHint: "Standard 24 Stunden. Wie lange Befunde nach dem Ende zurückgehalten werden, wenn für das Objekt keine eigene Frist gilt.",
  vacSave: "Speichern", vacUnsaved: "Nicht gespeichert", vacEntityInvalid: "Eine Entität hat die Form bereich.name, zum Beispiel input_boolean.urlaub.", vacGraceInvalid: "Die Nachfrist muss eine ganze Zahl von 0 bis {max} Stunden sein.", vacStateOn: "Aktuell: an", vacStateNone: "Nicht eingerichtet", vacStateOff: "Aktuell: aus", vacStateMissing: "Aktuell: nicht verfügbar", vacEnded: "Zuletzt beendet am {date}.", vacFailed: "Nicht gespeichert: {reason}",
  vacBarOn: "Urlaubsmodus aktiv", vacBarHeld: "{n} Befunde zurückgehalten", vacBarNothing: "hält gerade nichts zurück", vacBarNoRule: "keine Regel dafür", vacBarNewRule: "Regel anlegen", vacBarHeld1: "1 Befund zurückgehalten",
  vacBarAfter: "Urlaub beendet", vacBarAfterLine: "Frist bis {date} · {n} Befunde noch zurückgehalten", vacBarAfterLine1: "Frist bis {date} · 1 Befund noch zurückgehalten",
  vacBarMissing: "Urlaubsmodus-Entität nicht verfügbar", vacBarMissingLine: "{entity} meldet keinen Zustand. Der Modus gilt als aus.", vacBarShow: "Zurückgehaltene anzeigen", vacBarRules: "Regeln", vacBarSettings: "Einstellung",
  vacRuleAfter: "Urlaub beendet, zurückgehalten bis {date}", vacRuleActive: "Urlaubsmodus aktiv",
});
Object.assign(TEXT.en, {
  allLabels: "All labels", lblTitle: "Labels", lblHint: "Housekeeper knows three fixed labels. You create them in Home Assistant with exactly this name and assign them to objects; Housekeeper does not create them itself.",
  lblOpenHa: "Open labels in Home Assistant", lblCreated: "created", lblMissing: "not created", lblNoUse: "on no object", lblUse: "on", lblShow: "Show objects", lblCopy: "Copy name", lblCopied: "Copied",
  lblKind_keep: "Do not remove", lblKind_ignore: "Ignore", lblKind_critical: "Critical",
  lblFx_keep_1: "Blocks every cleanup step (disable, remove); the device is missing from “Cleanup → Disable devices”", lblFx_keep_0: "Hides no findings: an outage is still reported",
  lblFx_ignore_1: "Hides the findings of the entity, automation or device (and its entities)", lblFx_ignore_2: "Takes the object out of policies, reliability, outage storms and exposure and blocks cleanup steps", lblFx_ignore_0: "Outages are no longer reported either",
  lblFx_critical_1: "The object counts as important; outages are rated higher", lblFx_critical_2: "Cleanup steps must be confirmed one by one; works on an entity, device or area", lblFx_critical_0: "Locks, alarms, smoke and water sensors are critical without the label too",
  lblN_entity: "{n} entities", lblN_entity1: "1 entity", lblN_device: "{n} devices", lblN_device1: "1 device", lblN_automation: "{n} automations", lblN_automation1: "1 automation", lblN_script: "{n} scripts", lblN_script1: "1 script", lblN_scene: "{n} scenes", lblN_scene1: "1 scene", lblN_area: "{n} areas", lblN_area1: "1 area",
  lblHow: "How to create a missing label: in Home Assistant under Settings → Areas, labels & zones → Labels, create a label with exactly this name, then select devices or entities (several at once) and assign the label. Then scan again.",
  lblFoot: "If you only want nothing cleaned up, use housekeeper_keep. If Housekeeper should leave an object completely alone, use housekeeper_ignore or a mark. For devices that are often off, the mark “Offline on purpose” and exception rules with a delay fit better. The numbers come from the last scan.",
  excTitle: "Exception rules", excHint: "Housekeeper does not report objects that a rule matches: by area, label, integration, type (domain), device or entity. The rules apply only in Housekeeper; Home Assistant stays unchanged. The label housekeeper_ignore keeps working on top.",
  excFormNew: "Add rule", excFormEdit: "Edit rule", excAdd: "Add rule", excEdit: "Change", excDelete: "Delete", excLoading: "Loading rules …",
  excKind: "Kind", excKind_area: "Area", excKind_label: "Label", excKind_integration: "Integration", excKind_domain: "Domain (type)", excTargets: "Selection", excNoTargets: "Home Assistant has nothing to choose from yet.",
  excAction: "Action", excAction_hide: "Hide", excAction_delay: "Report only after", excDays: "days not available", excNote: "Note (optional)",
  excInherit: "Covers devices and entities. An entity without an area of its own takes the area of its device, and a label on the device counts for its entities. “Integration” and “Domain” cover all entities of that integration or type (such as media_player); a broad domain like sensor also covers real faults, the preview shows the matches first.",
  excDelayHint: "Holds back only “not available”, “unknown” and “stale”. All other findings of these objects (empty battery, broken reference) still show as usual; to suppress everything choose “Hide”. When the time has passed the finding shows with the level of its outage. Counted from the start of the outage as far as known; after a restart the report can come later, never earlier.",
  excWinner: "Where several rules match, “Hide” beats the delays; of several delays the longest counts.",
  excRuleArea: "Area {names}", excRuleLabel: "Label {names}", excRuleIntegration: "Integration {names}", excRuleDomain: "Domain {names}", excRuleDelayLine: "Report only after {n} days", excRuleHideLine: "Hide",
  excEffectHide: "{objects} objects, {n} findings hidden", excEffectDelay: "{hold} findings held back, {due} due", excEffectNone: "Matches nothing right now",
  excPreview: "Preview", excPreviewHide: "{objects} objects, {n} findings would be hidden", excPreviewDelay: "{hold} findings would be held back, {due} would be due at once (down for longer already)",
  excImportant: "Findings with a high impact are among them: {names}. Check that they should really be left out.",
  excSave: "Save rule", excCancel: "Cancel", excNeedTarget: "Choose at least one entry.", excDaysInvalid: "The delay must be a whole number from 1 to {max} days.", excFailed: "Not saved: {reason}",
  excOn: "Rule active", excDue: "Time has passed",
  hidByRule: "By a rule", ignoredByRule: "Hidden by an exception rule: {rule}", heldByRule: "Held back by an exception rule: {rule}, reported from {date}", dueByRule: "Time has passed · exception rule: {rule}",
  excKind_device: "Device", excKind_entity: "Entity", excRuleDevice: "Device {names}", excRuleEntity: "Entity {names}", excSearch: "Search …", excMore: "More through the search",
  excColRule: "Rule", excColAction: "Action", excColEffect: "Effect now", excColOn: "On", excColActions: "Actions", excKind_any: "All types", excAnyHint: "Searches all types: areas, labels, integrations, devices and entities. Saving makes one rule per kind ({n}).", excGroupAlways: "Always", excGroupVacation: "In vacation mode", excAddShort: "Add rule", excChosen: "{n} chosen",
  excEmptyAlways: "No permanent rule yet", excEmptyAlwaysNext: "For example hide an area or a label for good.", excEmptyVacation: "No vacation mode rule yet", excEmptyVacationNext: "For example hide the greenhouse while you are away.", excVacNoEntity: "Without an entity for the vacation mode these rules never apply. Choose it below under “Vacation mode”.",
  excForLabel: "For what", excFor_objects: "Only {name}", excFor_objects_n: "Only these {n} objects", excFor_devices: "Device {name}", excFor_devices_n: "Their {n} devices", excFor_areas: "Area {name}", excFor_areas_n: "Their {n} areas", excFor_integrations: "Integration {name}", excFor_integrations_n: "Their {n} integrations",
  excForSub_devices: "with all its entities", excForSub_areas: "all devices and entities in the area", excForSub_integrations: "all its entities",
  excForMore: "A single object with a reason or a time window: that is what a mark is for. Label, type or another choice:", excForSettings: "edit in the settings",
  excScope: "Applies", excScope_always: "Always", excScope_vacation: "Only in vacation mode", excScopeChip_vacation: "vacation only", excScopeChip_always: "always",
  excScopeHint: "In vacation mode these objects stay quiet, even if a device breaks. After the vacation the outage counts anew: with a delay of its own that delay, otherwise the grace period.",
  excOverlap: "These objects are already hit by: {rules}. In the vacation hiding applies, afterwards the delay of the other rule, counted from the end of the vacation.",
  vacTitle: "Vacation mode", vacHint: "While the chosen entity is “on” the rules “only in vacation mode” apply. If it is unavailable or unknown the mode counts as off. You can switch it in Home Assistant, for example by calendar or automation.",
  vacEntity: "Entity for vacation mode", vacEntityHint: "Any entity that can be “on”: helper, switch, binary sensor, schedule, calendar. Leave empty to turn vacation mode off.",
  vacAuto: "Suggestion, because this entity exists. It counts only once you save; change or clear the field if you do not want it.", vacKeyword: "Keyword in the event", vacKeywordExample: "Vacation", vacKeywordHint: "Only events whose title contains this word switch vacation mode on, so your normal calendar works. Empty: every running event counts, for a calendar of its own.",
  vacGrace: "Grace period after the vacation", vacGraceUnit: "hours", vacGraceHint: "Default 24 hours. How long findings are held back after the end when the object has no delay of its own.",
  vacSave: "Save", vacUnsaved: "Not saved", vacEntityInvalid: "An entity looks like domain.name, for example input_boolean.vacation.", vacGraceInvalid: "The grace period must be a whole number from 0 to {max} hours.", vacStateOn: "Now: on", vacStateNone: "Not set up", vacStateOff: "Now: off", vacStateMissing: "Now: unavailable", vacEnded: "Last ended on {date}.", vacFailed: "Not saved: {reason}",
  vacBarOn: "Vacation mode on", vacBarHeld: "{n} findings held back", vacBarNothing: "holds nothing back right now", vacBarNoRule: "no rule for it", vacBarNewRule: "Add a rule", vacBarHeld1: "1 finding held back",
  vacBarAfter: "Vacation over", vacBarAfterLine: "Delay until {date} · {n} findings still held back", vacBarAfterLine1: "Delay until {date} · 1 finding still held back",
  vacBarMissing: "Vacation mode entity unavailable", vacBarMissingLine: "{entity} reports no state. The mode counts as off.", vacBarShow: "Show held back", vacBarRules: "Rules", vacBarSettings: "Settings",
  vacRuleAfter: "Vacation over, held back until {date}", vacRuleActive: "Vacation mode on",
});

class ExceptionsMixin {
  // "Area Lager" or "Label ignore_status, other": what a rule names, in the words of Home Assistant.
  excRuleName(rule) {
    const list = this.data?.objects || [], lookup = ["area", "label", "device", "entity"].includes(rule.kind);
    const names = rule.targets.map(id => (lookup ? list.find(x => x.object_type === rule.kind && x.object_id === id)?.name : "") || id).join(", ");
    return this.t({ area: "excRuleArea", label: "excRuleLabel", integration: "excRuleIntegration", domain: "excRuleDomain", device: "excRuleDevice", entity: "excRuleEntity" }[rule.kind], { names });
  }

  // What a rule did to a finding: hidden, held back until a date, or its time has passed; "" for a finding no rule touched.
  findingRuleLine(f) {
    const info = f.ignore_rule;
    if (!info) return "";
    if (info.phase === "after" && !f.rule_due) return this.t("vacRuleAfter", { date: this.formatDate(info.until) });
    if (info.phase === "vacation" && f.ignored_by === "rule") return this.t("vacRuleActive");
    const rule = this.excRuleName(info);
    if (f.rule_due) return this.t("dueByRule", { rule });
    return f.ignored_by === "rule" ? this.t(info.action === "delay" ? "heldByRule" : "ignoredByRule", { rule, date: info.until ? this.formatDate(info.until) : "" }) : "";
  }

  excRuleLine(rule) {
    return rule.action === "delay" ? this.t("excRuleDelayLine", { n: rule.days }) : this.t("excRuleHideLine");
  }

  async loadExceptions() {
    if (this._excLoading) return;
    this._excLoading = true;
    try { this.exc = await this._hass.callWS({ type: "ha_housekeeper/exceptions" }); } catch (err) { this.failed(err); this.exc = this.exc || { rules: [], areas: [], labels: [] }; }
    this._excLoading = false;
    this.render();
  }

  excEffect(rule) {
    const e = rule.effect || {};
    if (rule.action === "delay") return e.hold || e.due ? this.t("excEffectDelay", { hold: e.hold, due: e.due }) : this.t("excEffectNone");
    return e.hide ? this.t("excEffectHide", { objects: e.objects, n: e.hide }) : this.t("excEffectNone");
  }

  // One rule as the cells of a table row: what it names, what it does, what that does now, the switch and the two buttons.
  excRuleCells(rule) {
    const icons = { area: "mdi:floor-plan", label: "mdi:label-outline", integration: "mdi:puzzle-outline", domain: "mdi:shape-outline", device: "mdi:devices", entity: "mdi:shape-outline" };
    const id = this.esc(rule.id), tone = rule.enabled ? (rule.effect?.due ? "warn" : "ok") : "mute";
    return [
      { key: "target", label: "excColRule", cell: () => `<div class="statcell"><span class="tile ${tone}"><ha-icon icon="${icons[rule.kind]}"></ha-icon></span><div><strong>${this.esc(this.excRuleName(rule))}</strong>${rule.note ? `<small>${this.esc(rule.note)}</small>` : ""}</div></div>` },
      { key: "action", label: "excColAction", cell: () => this.esc(this.excRuleLine(rule)) },
      { key: "effect", label: "excColEffect", cell: () => this.esc(this.excEffect(rule)) },
      { key: "on", label: "excColOn", cell: () => `<input type="checkbox" class="policyswitch" data-exc-toggle="${id}" ${rule.enabled ? "checked" : ""} aria-label="${this.esc(this.t("excOn"))}">` },
      { key: "acts", label: "excColActions", cell: () => `<span class="excacts"><button class="iconbtn" data-exc-edit="${id}" aria-label="${this.esc(this.t("excEdit"))}" title="${this.esc(this.t("excEdit"))}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button><button class="iconbtn" data-exc-delete="${id}" aria-label="${this.esc(this.t("excDelete"))}" title="${this.esc(this.t("excDelete"))}"><ha-icon icon="mdi:delete-outline"></ha-icon></button></span>` },
    ];
  }

  // The rules of one group as a table; the columns are the same for every row, the cells come from the rule.
  excTable(scope, rules) {
    const id = `exc-${scope}`;
    this.lvState(id, "target", "asc");
    const columns = this.excRuleCells(rules[0]).map((c, i) => ({ key: c.key, label: c.label, sortable: false, cell: rule => this.excRuleCells(rule)[i].cell() }));
    return this.listTable(id, columns, rules, { cls: "excrules", rowAttrs: () => 'class="static"' });
  }

  // Nothing yet in this group: the same empty state as the reminders, with the way to the first rule.
  excEmpty(scope) {
    const vacation = scope === "vacation";
    return `<div class="emptymsg mute"><ha-icon icon="${vacation ? "mdi:beach" : "mdi:eye-off-outline"}"></ha-icon><strong>${this.t(vacation ? "excEmptyVacation" : "excEmptyAlways")}</strong>${this.t(vacation ? "excEmptyVacationNext" : "excEmptyAlwaysNext")}<button class="btn" data-exc-edit="" data-exc-new="${scope}">${this.t("excAddShort")}</button></div>`;
  }

  // One card for all rules: a switch between the two groups, then the form, the table or the empty state.
  excRulesCard() {
    const form = this.excForm, scope = form ? form.scope || "always" : this.excScope || "always";
    const count = s => this.exc.rules.filter(r => (r.scope || "always") === s).length;
    const rules = this.exc.rules.filter(r => (r.scope || "always") === scope);
    const v = this.exc.vacation || {};
    const seg = `<div class="pad"><div class="seg">${["always", "vacation"].map(s => `<button type="button" class="chip${scope === s ? " active" : ""}" data-exc-scope="${s}" aria-pressed="${scope === s}">${this.t(s === "vacation" ? "excGroupVacation" : "excGroupAlways")} (${count(s)})</button>`).join("")}</div></div>`;
    const add = form ? "" : `<button class="btn" data-exc-edit="" data-exc-new="${scope}"><ha-icon icon="mdi:plus"></ha-icon>${this.t("excAddShort")}</button>`;
    const warn = scope === "vacation" && !v.entity ? `<div class="pad">${this.notice("warn", this.t("excVacNoEntity"))}</div>` : "";
    const body = `${form ? this.excFormHtml(form) : ""}${rules.length ? this.excTable(scope, rules) : form ? "" : this.excEmpty(scope)}`;
    const foot = rules.length ? `<div class="pad"><p class="factnote">${this.t("excWinner")}</p></div>` : "";
    return `<section class="panel excgroup"><div class="panelhead"><div><h2>${this.t("excTitle")}</h2><p>${this.t("excHint")}</p></div>${add}</div>${seg}${warn}${body}${foot}</section>`;
  }

  // The three labels Housekeeper reads: what each does, whether it exists in Home Assistant and how many objects carry it.
  labelsCard() {
    const rows = ["keep", "ignore", "critical"].map(kind => {
      const id = `housekeeper_${kind}`, counts = new Map();
      for (const o of this.invObjects()) if ((o.labels || []).includes(id)) counts.set(o.object_type, (counts.get(o.object_type) || 0) + 1);
      const total = [...counts.values()].reduce((a, b) => a + b, 0), made = !!this.findObject(`label:${id}`);
      // "on 2 devices, 5 entities"; a type without its own words keeps "Type: n".
      const parts = [...counts].map(([type, n]) => { const key = `lblN_${type}`; return this.t(key) === key ? `${this.esc(this.t(type))}: ${n}` : this.esc(this.tCount(key, n)); }).join(", ");
      const fx = (kind === "keep" ? [1, 0] : [1, 2, 0]).map(n => `<li${n ? "" : ' class="no"'}>${this.esc(this.t(`lblFx_${kind}_${n}`))}</li>`).join("");
      const show = total ? `<button class="btn" data-jump="inventory" data-jump-lf="inventory|label|${id}">${this.t("lblShow")}</button>` : "";
      const copy = `<button type="button" class="iconbtn" data-copy="${id}" title="${this.esc(this.t("lblCopy"))}" aria-label="${this.esc(this.t("lblCopy"))}"><ha-icon icon="mdi:content-copy"></ha-icon></button>`;
      return `<div class="labrow"><div><div class="statcell"><code>${id}</code>${copy}<span class="pill ${made ? "ok" : "warn"}">${this.t(made ? "lblCreated" : "lblMissing")}</span></div><p class="factnote">${this.esc(this.t(`lblKind_${kind}`))} · ${total ? `${this.t("lblUse")} ${parts}` : this.t("lblNoUse")}</p></div>
        <ul class="labfx">${fx}</ul>
        <div class="actions">${show}</div></div>`;
    }).join("");
    // How to create a label is said once, below the rows, while one of them is missing.
    const missing = ["keep", "ignore", "critical"].some(kind => !this.findObject(`label:housekeeper_${kind}`));
    return `<section class="panel"><div class="panelhead"><div><h2>${this.t("lblTitle")}</h2><p>${this.t("lblHint")}</p></div><button class="btn" data-ha-path="/config/labels"><ha-icon icon="mdi:open-in-new"></ha-icon>${this.t("lblOpenHa")}</button></div>${rows}<div class="pad labfoot">${missing ? `<p class="factnote">${this.esc(this.t("lblHow"))}</p>` : ""}<p class="factnote">${this.t("lblFoot")}</p></div></section>`;
  }

  excCard() {
    if (!this.exc) { this.loadExceptions(); return `<section class="panel"><div class="panelhead"><div><h2>${this.t("excTitle")}</h2><p>${this.t("excHint")}</p></div></div><div class="pad"><p class="factnote">${this.t("excLoading")}</p></div></section>`; }
    const v = this.exc.vacation || {};
    const state = !v.entity ? "vacStateNone" : v.state === "on" ? "vacStateOn" : v.state && v.state !== "unavailable" && v.state !== "unknown" ? "vacStateOff" : "vacStateMissing";
    const pill = state ? ` <span class="pill ${!v.entity ? "warn" : v.state === "on" ? "ok" : "mute"}">${this.t(state)}</span>` : "";
    // In the order of the actions of a finding: status, mark, exception (with the vacation mode), label.
    return `${this.decisionsBar()}${this.statusCard()}${this.marksCard()}<div id="hk-sec-rules" class="stack">${this.excRulesCard()}<section class="panel"><div class="panelhead"><div><h2>${this.t("vacTitle")}${pill}</h2><p>${this.t("vacHint")}</p></div></div>${this.vacationHtml()}</section></div><div id="hk-sec-labels">${this.labelsCard()}</div>`;
  }

  vacationHtml() {
    const v = this.exc.vacation || {}, form = this.vacForm || (this.vacForm = { entity: v.entity || v.suggestion || "", keyword: v.keyword || "", grace: v.grace_hours ?? 24, error: "" });
    const dirty = this.vacDirty();
    const ids = Object.keys(this._hass?.states || {}).filter(id => /^(input_boolean|binary_sensor|switch|schedule|calendar)\./.test(id)).sort();
    return `<form data-vac-form><div class="setrow"><div><strong>${this.t("vacEntity")}</strong><small>${this.t("vacEntityHint")}</small></div>
        <div><input list="hk-vac-ids" data-vac-entity autocomplete="off" value="${this.esc(form.entity)}"><datalist id="hk-vac-ids">${ids.map(id => `<option value="${this.esc(id)}">`).join("")}</datalist>
        ${v.suggestion && !v.entity && form.entity === v.suggestion ? `<small role="status">${this.t("vacAuto")}</small>` : ""}${v.entity && v.ended_at ? `<small role="status">${this.t("vacEnded", { date: this.formatDate(v.ended_at) })}</small>` : ""}</div></div>
      ${form.entity.trim().startsWith("calendar.") ? `<div class="setrow"><div><strong>${this.t("vacKeyword")}</strong><small>${this.t("vacKeywordHint")}</small></div>
        <div><input data-vac-keyword maxlength="60" autocomplete="off" placeholder="${this.esc(this.t("vacKeywordExample"))}" value="${this.esc(form.keyword)}"></div></div>` : ""}
      <div class="setrow"><div><strong>${this.t("vacGrace")}</strong><small>${this.t("vacGraceHint")}</small></div>
        <div class="excnum"><input type="number" min="0" max="${v.grace_max || 720}" data-vac-grace value="${this.esc(form.grace)}"> <span>${this.t("vacGraceUnit")}</span></div></div>
      ${form.error ? `<div class="pad">${this.notice("err", form.error)}</div>` : ""}
      <div class="formfoot"><small class="vacdirty" data-vac-dirty ${dirty ? "" : "hidden"}>${this.t("vacUnsaved")}</small><button type="button" class="btn quiet" data-vac-cancel ${dirty ? "" : "hidden"}>${this.t("excCancel")}</button><button type="submit" class="btn primary" data-vac-save ${dirty ? "" : "hidden"}>${this.t("vacSave")}</button></div></form>`;
  }

  // Whether the vacation fields differ from what is saved; reverting a change makes it clean again.
  vacDirty() {
    const v = this.exc?.vacation || {}, f = this.vacForm;
    return Boolean(f) && (f.entity.trim() !== (v.entity || "") || f.keyword.trim() !== (v.keyword || "") || Number(f.grace) !== (v.grace_hours ?? 24));
  }

  async saveVacation() {
    const form = this.vacForm, v = this.exc?.vacation || {}, max = v.grace_max || 720, grace = Number(form.grace);
    const entity = form.entity.trim();
    if (entity && !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(entity)) { form.error = this.t("vacEntityInvalid"); this.render(); return; }
    if (String(form.grace).trim() === "" || !Number.isInteger(grace) || grace < 0 || grace > max) { form.error = this.t("vacGraceInvalid", { max }); this.render(); return; }
    try {
      await this._hass.callWS({ type: "ha_housekeeper/vacation_set", entity: entity || null, grace_hours: grace, keyword: entity.startsWith("calendar.") ? form.keyword.trim() : "" });
      this.vacForm = null;
      this.exc = await this._hass.callWS({ type: "ha_housekeeper/exceptions" });
      await this.refreshData();
    } catch (err) { form.error = this.t("vacFailed", { reason: this.errText(err) }); }
    this.render();
  }

  // The bar under the top bar: on every page while the vacation mode holds something back.
  vacationBar() {
    const v = this.data?.meta?.vacation;
    if (!v) return "";
    const date = value => this.formatDate(value), n = v.held;
    const go = `<a href="#" data-vac-go="hidden">${this.t("vacBarShow")}</a><a href="#" data-vac-go="rules">${this.t("vacBarRules")}</a>`;
    if (v.missing) return `<div class="vacbar warn" role="status"><b>${this.t("vacBarMissing")}</b><span>${this.esc(this.t("vacBarMissingLine", { entity: v.entity }))}</span><span class="sp"></span><a href="#" data-vac-go="rules">${this.t("vacBarSettings")}</a></div>`;
    // With nothing held back there is nothing to show: the bar says why, and offers the rules or a first one.
    if (v.active && !n) {
      const none = v.rules === 0, link = none ? `<a href="#" data-vac-go="new">${this.t("vacBarNewRule")}</a>` : `<a href="#" data-vac-go="rules">${this.t("vacBarRules")}</a>`;
      return `<div class="vacbar" role="status"><b>${this.t("vacBarOn")}</b><span>${this.t(none ? "vacBarNoRule" : "vacBarNothing")} · ${this.esc(v.entity)}</span><span class="sp"></span>${link}</div>`;
    }
    if (v.active) return `<div class="vacbar" role="status"><b>${this.t("vacBarOn")}</b><span>${n === 1 ? this.t("vacBarHeld1") : this.t("vacBarHeld", { n })} · ${this.esc(v.entity)}</span><span class="sp"></span>${go}</div>`;
    if (v.after_until && n) return `<div class="vacbar after" role="status"><b>${this.t("vacBarAfter")}</b><span>${n === 1 ? this.t("vacBarAfterLine1", { date: date(v.after_until) }) : this.t("vacBarAfterLine", { date: date(v.after_until), n })}</span><span class="sp"></span>${go}</div>`;
    return "";
  }

  // What a rule can take from an object of the search: its kind and the id the rule stores; null for objects no rule can name.
  excTargetOf(o) {
    if (["area", "label", "device"].includes(o.object_type)) return { kind: o.object_type, id: o.object_id };
    if (o.object_type === "config_entry") return o.domain ? { kind: "integration", id: o.domain } : null;
    return ["entity", "automation", "scene", "script"].includes(o.object_type) && String(o.object_id).includes(".") ? { kind: "entity", id: o.object_id } : null;
  }

  // Kinds with few entries are chips to tap; devices and entities use the shared search field of the panel.
  excFormHtml(f) {
    const all = { area: this.exc.areas, label: this.exc.labels, integration: this.exc.integrations, domain: this.exc.domains, device: this.exc.devices, entity: this.exc.entities }[f.kind] || [];
    const any = f.kind === "any", lookup = any || f.kind === "device" || f.kind === "entity";
    const nameOf = id => all.find(x => x.id === id)?.name || this.findObject(`${f.kind}:${id}`)?.name || id;
    const chip = (id, on, extra = "") => `<button type="button" class="chip${on ? " active" : ""}" data-exc-target="${this.esc(id)}" aria-pressed="${on}">${this.esc(nameOf(id))}${extra}</button>`;
    const needle = (f.search || "").trim().toLowerCase();
    const shown = needle ? all.filter(x => `${x.name} ${x.id}`.toLowerCase().includes(needle)) : all;
    const search = !lookup && all.length > 12 ? `<input type="search" data-exc-search placeholder="${this.esc(this.t("excSearch"))}" autocomplete="off" value="${this.esc(f.search || "")}">` : "";
    const picked = any ? f.picks.map(p => `<button type="button" class="chip active" data-exc-pick="${this.esc(`${p.kind}:${p.id}`)}" aria-pressed="true">${this.esc(p.name)} · ${this.t(`excKind_${p.kind}`)} <ha-icon icon="mdi:close"></ha-icon></button>`).join("") : f.targets.map(id => chip(id, true, ` <ha-icon icon="mdi:close"></ha-icon>`)).join("");
    const count = any ? f.picks.length : f.targets.length;
    const choices = lookup ? `${picked ? `<div class="chips bare">${picked}</div>` : ""}${this.pickerBox("exc", this.t("excSearch"))}`
      : `${search}<div class="chips bare">${shown.map(x => chip(x.id, f.targets.includes(x.id))).join("") || `<small class="factnote">${this.t("excNoTargets")}</small>`}</div>`;
    const kinds = ["any", "area", "label", "integration", "domain", "device", "entity"].map(k => `<button type="button" class="chip${f.kind === k ? " active" : ""}" data-exc-kind="${k}" aria-pressed="${f.kind === k}">${this.t(`excKind_${k}`)}</button>`).join("");
    const pv = f.preview;
    const preview = pv ? `<div class="excprev" role="status"><strong>${this.t("excPreview")}:</strong> ${f.action === "delay" ? this.t("excPreviewDelay", { hold: pv.hold, due: pv.due }) : this.t("excPreviewHide", { objects: pv.objects, n: pv.hide })}
        ${pv.overlap?.length ? `<br><small class="factnote">${this.esc(this.t("excOverlap", { rules: pv.overlap.map(id => { const r = this.exc.rules.find(x => x.id === id); return r ? this.excRuleName(r) : id; }).join(", ") }))}</small>` : ""}</div>${pv.important?.length ? this.notice("warn", this.t("excImportant", { names: pv.important.map(x => x.name).join(", ") })) : ""}` : "";
    const action = f.scope === "vacation" ? `<small class="factnote">${this.t("excScopeHint")}</small>`
      : `<div class="mfield"><span>${this.t("excAction")}</span><div class="excact"><button type="button" class="chip${f.action === "hide" ? " active" : ""}" data-exc-action="hide" aria-pressed="${f.action === "hide"}">${this.t("excAction_hide")}</button><button type="button" class="chip${f.action === "delay" ? " active" : ""}" data-exc-action="delay" aria-pressed="${f.action === "delay"}">${this.t("excAction_delay")}</button>
        ${f.action === "delay" ? `<input type="number" min="1" max="${this.exc.days_max || 365}" data-exc-days value="${this.esc(f.days)}" aria-label="${this.esc(this.t("excDays"))}"> <span>${this.t("excDays")}</span>` : ""}</div>
        ${f.action === "delay" ? `<small class="factnote">${this.t("excDelayHint")}</small>` : ""}</div>`;
    const scopeChips = `<div class="mfield"><span>${this.t("excScope")}</span><div class="chips bare">${["always", "vacation"].map(s => `<button type="button" class="chip${(f.scope || "always") === s ? " active" : ""}" data-exc-scope-set="${s}" aria-pressed="${(f.scope || "always") === s}">${this.t(`excScope_${s}`)}</button>`).join("")}</div></div>`;
    const what = f.scopes ? `${this.excScopeCards(f)}${scopeChips}`
      : `<div class="mfield"><span>${this.t("excKind")}</span><div class="chips bare">${kinds}</div></div>
      <div class="mfield"><span>${this.t("excTargets")}${count ? ` (${this.t("excChosen", { n: count })})` : ""}</span>${choices}<small class="factnote">${any ? this.t("excAnyHint", { n: new Set(f.picks.map(p => p.kind)).size || 1 }) : this.t("excInherit")}</small></div>`;
    const more = f.scopes ? `<small class="factnote">${this.t("excForMore")} <button type="button" class="link" data-exc-settings>${this.t("excForSettings")}</button></small>` : "";
    return `<form class="excform markform" data-exc-form>
      <strong>${this.t(f.id ? "excFormEdit" : "excFormNew")}</strong>
      ${what}
      ${action}
      <label class="mfield"><span>${this.t("excNote")}</span><input data-exc-note maxlength="200" autocomplete="off" value="${this.esc(f.note)}"></label>
      ${preview}${more}${f.error ? this.notice("err", f.error) : ""}
      <div class="mbtns"><button type="button" class="btn quiet" data-exc-cancel>${this.t("excCancel")}</button><button type="submit" class="btn primary">${this.t("excSave")}</button></div></form>`;
  }

  // The rules a form makes: one, or with "all types" one per kind of the objects picked.
  excDrafts(f) {
    if (f.kind !== "any") return [this.excDraft(f, f.kind, f.targets, Boolean(f.id))];
    const groups = new Map();
    f.picks.forEach(p => groups.set(p.kind, [...(groups.get(p.kind) || []), p.id]));
    return [...groups].map(([kind, targets]) => this.excDraft(f, kind, targets, false));
  }

  excDraft(f, kind, targets, keepId) {
    return { ...(keepId ? { id: f.id } : {}), kind, targets, action: f.scope === "vacation" ? "hide" : f.action, scope: f.scope || "always", ...(f.scope !== "vacation" && f.action === "delay" ? { days: Math.max(1, Number(f.days) || 7) } : {}), enabled: f.enabled !== false, note: f.note.trim() };
  }

  // The stored rules as the server takes them back: no effect, and days only where a delay has them.
  excRules() {
    return this.exc.rules.map(({ effect, days, ...rule }) => (days == null ? rule : { ...rule, days }));
  }

  openException(id, scope) {
    const rule = this.exc.rules.find(r => r.id === id);
    this.excForm = rule ? { id, kind: rule.kind, targets: [...rule.targets], picks: [], action: rule.action, scope: rule.scope || "always", search: "", days: rule.days || 7, enabled: rule.enabled, note: rule.note || "", error: "", preview: null }
      : { id: "", kind: "any", targets: [], picks: [], action: "hide", scope: scope || "always", search: "", days: 7, enabled: true, note: "", error: "", preview: null };
    this.render();
    this.excPreview();
  }

  // A new rule from the findings, the form above the list: "for what" offers the objects themselves, their devices,
  // areas and integrations, so a rule can reach beyond the object. Other kinds are set in the settings.
  async openExceptionFor(objectKeys) {
    if (!this.exc) await this.loadExceptions();
    const objects = objectKeys.map(key => this.findObject(key)).filter(Boolean);
    const device = o => (o.object_type === "device" ? o : o.device_id ? this.findObject(`device:${o.device_id}`) : null);
    const named = (list, id) => (list || []).find(x => x.id === id)?.name || id;
    const domains = o => (o.object_type === "entity" ? [o.platform] : o.object_type === "config_entry" ? [o.domain] : (device(o)?.config_entry_ids || []).map(e => this.findObject(`config_entry:${e}`)?.domain));
    const uniq = picks => picks.filter((p, i) => p && picks.findIndex(q => q && q.kind === p.kind && q.id === p.id) === i);
    const scopes = [
      ["objects", uniq(objects.map(o => { const t = this.excTargetOf(o); return t && { ...t, name: o.name || t.id }; }))],
      ["devices", uniq(objects.map(device).filter(Boolean).map(d => ({ kind: "device", id: d.object_id, name: d.name || d.object_id })))],
      ["areas", uniq(objects.map(o => o.area_id || device(o)?.area_id).filter(Boolean).map(id => ({ kind: "area", id, name: named(this.exc?.areas, id) })))],
      ["integrations", uniq(objects.flatMap(domains).filter(Boolean).map(id => ({ kind: "integration", id, name: named(this.exc?.integrations, id) })))],
    ].filter(([, picks], i, all) => picks.length && !all.slice(0, i).some(([, other]) => other.length === picks.length && other.every(p => picks.some(q => q.kind === p.kind && q.id === p.id))))
      .map(([id, picks]) => ({ id, picks }));
    if (!scopes.length) return;
    this.excForm = { id: "", kind: "any", targets: [], picks: scopes[0].picks, action: "hide", scope: "always", search: "", days: 7, enabled: true, note: "", error: "", preview: null, here: true, scopes, scopeSel: scopes[0].id };
    this.render();
    this.shadowRoot?.querySelector?.("[data-exc-form]")?.scrollIntoView?.({ block: "nearest" });
    this.excPreview();
  }

  // "For what" of a rule made from findings: one card per reach, the names below.
  excScopeCards(f) {
    const card = s => {
      const names = s.picks.map(p => p.name), many = s.picks.length > 1;
      const title = this.t(`excFor_${s.id}${many ? "_n" : ""}`, { n: s.picks.length, name: names[0] });
      const sub = many ? names.slice(0, 3).join(", ") + (names.length > 3 ? ", …" : "") : s.id === "objects" ? s.picks[0].id : this.t(`excForSub_${s.id}`);
      return `<label class="statusopt${f.scopeSel === s.id ? " on" : ""}"><input type="radio" name="exc-for" value="${s.id}" data-exc-for-pick ${f.scopeSel === s.id ? "checked" : ""}><span><b>${this.esc(title)}</b><small>${this.esc(sub)}</small></span></label>`;
    };
    return `<div class="mfield"><span>${this.t("excForLabel")}</span><div class="statusopts">${f.scopes.map(card).join("")}</div></div>`;
  }

  async excPreview() {
    const f = this.excForm;
    if (!f || !(f.kind === "any" ? f.picks.length : f.targets.length)) { if (f) { f.preview = null; this.render(); } return; }
    const seq = (this._excSeq = (this._excSeq || 0) + 1);
    try {
      const preview = await this._hass.callWS({ type: "ha_housekeeper/exceptions_preview", rules: this.excDrafts(f).map(({ id, ...rule }) => rule) });
      if (seq !== this._excSeq || this.excForm !== f) return;
      f.preview = preview;
    } catch (_) { f.preview = null; }
    this.render();
  }

  async saveExceptions(rules, form) {
    try {
      await this._hass.callWS({ type: "ha_housekeeper/exceptions_set", rules });
      this.excForm = null;
      this.exc = await this._hass.callWS({ type: "ha_housekeeper/exceptions" });
      await this.refreshData();
    } catch (err) { if (form) form.error = this.t("excFailed", { reason: this.errText(err) }); else this.failed(err); }
    this.render();
  }

  commitException() {
    const f = this.excForm;
    if (!f) return;
    if (!(f.kind === "any" ? f.picks.length : f.targets.length)) { f.error = this.t("excNeedTarget"); this.render(); return; }
    const max = this.exc.days_max || 365, days = Number(f.days);
    if (f.scope !== "vacation" && f.action === "delay" && !(Number.isInteger(days) && days >= 1 && days <= max)) { f.error = this.t("excDaysInvalid", { max }); this.render(); return; }
    const drafts = this.excDrafts(f), rules = this.excRules();
    const at = rules.findIndex(r => r.id === f.id);
    if (at >= 0 && f.kind !== "any") rules[at] = drafts[0];
    else { if (at >= 0) rules.splice(at, 1); rules.push(...drafts); }
    this.saveExceptions(rules, f);
  }

  bindExceptions(root) {
    root.querySelectorAll("[data-copy]").forEach(el => el.onclick = async () => {
      try {
        await globalThis.navigator?.clipboard?.writeText(el.dataset.copy);
        const icon = el.querySelector("ha-icon");
        if (icon) { icon.setAttribute("icon", "mdi:check"); el.title = this.t("lblCopied"); el.setAttribute("aria-label", this.t("lblCopied")); } else el.textContent = this.t("lblCopied");
      } catch (_) { /* no clipboard: the name stays selectable */ }
    });
    const rules = () => this.excRules();
    // "Open rule" from a hidden finding: the rule in its form in the settings.
    root.querySelectorAll("[data-exc-goto]").forEach(el => el.onclick = async ev => {
      ev.stopPropagation();
      this.noteJump?.("settings"); this.view = "settings"; this.settingsTab = "exceptions"; this.pages = {};
      if (!this.exc) await this.loadExceptions();
      const rule = this.exc?.rules?.find(r => r.id === el.dataset.excGoto);
      if (rule) this.excScope = rule.scope || "always";
      this.openException(el.dataset.excGoto);
    });
    root.querySelectorAll("[data-sec-go]").forEach(el => el.onclick = () => { const sec = root.querySelector(`#hk-sec-${el.dataset.secGo}`); sec?.scrollIntoView?.({ block: "start", behavior: "smooth" }); });
    root.querySelectorAll("[data-goto-decisions]").forEach(el => el.onclick = () => { this.noteJump?.("settings"); this.view = "settings"; this.settingsTab = "exceptions"; this.pages = {}; this.render(); });
    root.querySelectorAll("[data-exc-edit]").forEach(el => el.onclick = () => this.openException(el.dataset.excEdit, el.dataset.excNew));
    root.querySelectorAll("[data-exc-delete]").forEach(el => el.onclick = () => this.saveExceptions(rules().filter(r => r.id !== el.dataset.excDelete), null));
    root.querySelectorAll("[data-exc-toggle]").forEach(el => el.onchange = () => this.saveExceptions(rules().map(r => (r.id === el.dataset.excToggle ? { ...r, enabled: el.checked } : r)), null));
    root.querySelectorAll("[data-vac-form]").forEach(form => {
      const v = this.vacForm;
      form.onsubmit = ev => { ev.preventDefault(); this.saveVacation(); };
      const sync = () => {
        v.error = ""; form.querySelector(".notice")?.remove();
        const dirty = this.vacDirty();
        form.querySelector("[data-vac-dirty]").hidden = !dirty; form.querySelector("[data-vac-save]").hidden = !dirty; form.querySelector("[data-vac-cancel]").hidden = !dirty;
      };
      form.querySelector("[data-vac-cancel]").onclick = () => { this.vacForm = null; this.render(); };
      form.querySelector("[data-vac-entity]").oninput = ev => {
        const calendar = x => x.trim().startsWith("calendar.");
        const switched = calendar(v.entity) !== calendar(ev.target.value);
        v.entity = ev.target.value;
        if (switched) { this.render(); this.shadowRoot.querySelector("[data-vac-entity]")?.focus(); } else sync();
      };
      const keyword = form.querySelector("[data-vac-keyword]");
      if (keyword) keyword.oninput = ev => { v.keyword = ev.target.value; sync(); };
      form.querySelector("[data-vac-grace]").oninput = ev => { v.grace = ev.target.value; sync(); };
    });
    root.querySelectorAll("[data-vac-go]").forEach(el => el.onclick = async ev => {
      ev.preventDefault();
      this.selected = null; this.pages = {};
      // The findings held back are on the findings page, hidden for an exception; the rules in the settings.
      // The held findings are hidden ones, and only those of the vacation mode: other rules hide findings as well.
      if (el.dataset.vacGo === "hidden") { this.noteJump?.("findingsNav"); this.view = "findingsNav"; this.clearFindingFilters(); this.findingStatus = "hidden"; this.findingHeld = true; } else { this.view = "settings"; this.settingsTab = "exceptions"; this.excScope = "vacation"; }
      if (el.dataset.vacGo === "new") { this.render(); if (!this.exc) await this.loadExceptions(); this.openException("", "vacation"); return; }
      this.render();
    });
    root.querySelectorAll("[data-exc-scope]").forEach(el => el.onclick = () => { this.excScope = el.dataset.excScope; this.render(); });
    root.querySelectorAll("[data-exc-cancel]").forEach(el => el.onclick = () => { this.excForm = null; this.render(); });
    root.querySelectorAll("[data-exc-form]").forEach(form => {
      const f = this.excForm;
      form.onsubmit = ev => { ev.preventDefault(); this.commitException(); };
      form.querySelectorAll("[data-exc-for-pick]").forEach(el => el.onchange = () => { const s = f.scopes.find(x => x.id === el.value); f.scopeSel = s.id; f.picks = s.picks; f.error = ""; f.preview = null; this.render(); this.excPreview(); });
      form.querySelectorAll("[data-exc-scope-set]").forEach(el => el.onclick = () => { f.scope = el.dataset.excScopeSet; f.error = ""; this.render(); this.excPreview(); });
      const settings = form.querySelector("[data-exc-settings]");
      if (settings) settings.onclick = () => { f.here = false; f.scopes = null; this.excScope = f.scope; this.noteJump?.("settings"); this.view = "settings"; this.settingsTab = "exceptions"; this.pages = {}; this.render(); };
      form.querySelectorAll("[data-exc-kind]").forEach(el => el.onclick = () => { f.error = ""; f.kind = el.dataset.excKind; f.targets = []; f.picks = []; f.search = ""; f.preview = null; this._picker = null; this.render(); });
      const search = form.querySelector("[data-exc-search]");
      if (search) search.oninput = ev => { f.search = ev.target.value; this.render(); this.shadowRoot.querySelector("[data-exc-search]")?.focus(); };
      form.querySelector("[data-exc-note]").oninput = ev => { f.error = ""; f.note = ev.target.value; };
      form.querySelectorAll("[data-exc-action]").forEach(el => el.onclick = () => { f.error = ""; f.action = el.dataset.excAction; this.render(); this.excPreview(); });
      const days = form.querySelector("[data-exc-days]");
      if (days) days.onchange = ev => { f.error = ""; f.days = ev.target.value; this.excPreview(); };
      form.querySelectorAll("[data-exc-pick]").forEach(el => el.onclick = () => {
        f.error = ""; f.picks = f.picks.filter(p => `${p.kind}:${p.id}` !== el.dataset.excPick);
        this.render(); this.excPreview();
      });
      form.querySelectorAll("[data-exc-target]").forEach(el => el.onclick = () => {
        const id = el.dataset.excTarget;
        f.error = "";
        f.targets = f.targets.includes(id) ? f.targets.filter(x => x !== id) : [...f.targets, id];
        this.render(); this.excPreview();
      });
      form.onkeydown = ev => { if (ev.key === "Escape") { ev.preventDefault(); this.excForm = null; this.render(); } };
    });
  }
}
