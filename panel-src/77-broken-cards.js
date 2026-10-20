// BrokenCardsMixin: where a broken dashboard reference sits (tab and card instead of a raw path), the close names that
// do exist, and one row per card instead of one per reference. Mixed into the panel in 99-register.js.
Object.assign(TEXT.de, {
  brokenView: "Tab „{view}“", brokenCard: "Karte {card}", brokenSection: "Abschnitt {n}", brokenMaybe: "Vielleicht: {ids}", brokenRuntimeScene: "Diese Szene legt eine Automation oder ein Skript selbst an (scene.create); sie existiert erst nach dem ersten Lauf und nach jedem Neustart wieder erst dann.",
  brokenCount: "{n} defekte Referenzen", brokenCardLabel: "Karte", brokenOrphanShort: "wirkt verwaist",
  brokenOrphanHint: "Die Karte {card} (Tab „{view}“) wirkt verwaist: {missing} von {total} Referenzen sind defekt. Prüfe, ob du sie ganz entfernen kannst, statt jede Zeile einzeln zu reparieren.",
  brokenOrphan: "Die Karte wirkt verwaist: {missing} von {total} Referenzen sind defekt. Prüfen, ob sie ganz entfernt werden kann, statt jede Zeile einzeln zu reparieren.",
});
Object.assign(TEXT.en, {
  brokenView: "Tab “{view}”", brokenCard: "Card {card}", brokenSection: "Section {n}", brokenMaybe: "Maybe: {ids}", brokenRuntimeScene: "An automation or script creates this scene itself (scene.create); it only exists after that action has run, and again only after the next run following a restart.",
  brokenCount: "{n} broken references", brokenCardLabel: "Card", brokenOrphanShort: "looks abandoned",
  brokenOrphanHint: "The card {card} (tab “{view}”) looks abandoned: {missing} of {total} references are broken. Check whether you can remove it as a whole instead of repairing each line.",
  brokenOrphan: "The card looks abandoned: {missing} of {total} references are broken. Check whether it can be removed as a whole instead of repairing each line.",
});

class BrokenCardsMixin {
  // Tab and card of a reference as text; inside a group the part below the card, because the card is the heading.
  placeText(f, inGroup = false) {
    const e = f.evidence?.[0], p = e?.place;
    if (!p) return e?.location || "";
    if (inGroup && p.card_path && e.location.startsWith(`${p.card_path}/`)) return e.location.slice(p.card_path.length + 1);
    return this.placeParts(p).join(" · ");
  }

  placeParts(p) {
    return [p.view != null ? this.t("brokenView", { view: p.view }) : "",
      p.card ? `${this.t("brokenCard", { card: p.card })}${p.section ? ` (${this.t("brokenSection", { n: p.section })})` : ""}` : ""].filter(Boolean);
  }

  suggestText(f) {
    if (f.runtime_created) return this.t("brokenRuntimeScene");
    return f.suggestions?.length ? this.t("brokenMaybe", { ids: f.suggestions.join(", ") }) : "";
  }

  // The same as HTML: each suggestion opens the replacement with the missing ID and this one filled in.
  suggestHtml(f) {
    if (f.runtime_created || !f.suggestions?.length || !f.affected_object) return this.esc(this.suggestText(f));
    const ids = f.suggestions.map(id => `<button type="button" class="linkbtn" data-act-replace="${this.esc(f.affected_object)}" data-repl-new="${this.esc(id)}">${this.esc(id)}</button>`);
    return this.t("brokenMaybe", { ids: ids.join(", ") });
  }

  // One entry per card for broken dashboard references with a known card; a card with a single one stays a plain row.
  groupBroken(list) {
    const groups = new Map(), out = [];
    for (const f of list) {
      const p = f.evidence?.[0]?.place;
      if (f.classification === "broken_reference" && f.rule_id.startsWith("dashboard.") && p?.card_path) {
        const id = `${f.object_id}|${p.card_path}`;
        let g = groups.get(id);
        if (!g) { g = { group: id, members: [] }; groups.set(id, g); out.push(g); }
        g.members.push(f);
      } else out.push(f);
    }
    return out.map(x => (x.members?.length === 1 ? x.members[0] : x));
  }

  // More than half of the card's references are gone (and at least two): the card itself is the problem.
  isOrphan(p) { return p.card_missing >= 2 && p.card_missing * 2 > p.card_refs; }

  // The diagnosis row of a card: one line for all its broken references instead of one each.
  brokenGroupRow(g) {
    const p = g.members[0].evidence[0].place;
    return this.check(this.t("brokenCardLabel"), "red", [...this.placeParts(p), this.t("brokenCount", { n: g.members.length })].join(" · "), this.t("missing"));
  }
}
