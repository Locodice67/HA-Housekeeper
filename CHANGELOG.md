# Changelog

## Unreleased

### Neu

- **Labels:**
  - Das Label `housekeeper_keep` an einem Gerät oder einer Entität wirkt wie der Vermerk „Nicht entfernen“: Es sperrt alle Bereinigungsschritte, blendet aber keinen Befund aus. In Home Assistant lässt es sich auf mehreren Objekten gleichzeitig setzen.
  - Unter Einstellungen → Ausnahmen zeigt ein Block die drei Labels `housekeeper_keep`, `housekeeper_ignore` und `housekeeper_critical`: was jedes bewirkt, ob es in Home Assistant angelegt ist und an wie vielen Objekten es hängt.
  - Das Inventar lässt sich nach Label filtern.
- **Entitäten, die die Integration nicht mehr bereitstellt:** Sie werden als verwaist erkannt statt als „nicht verfügbar“, auch bei YAML-Entitäten, nach derselben Wartezeit wie ein Ausfall. Sie lassen sich direkt entfernen, ohne Quarantäne, aber mit Vorschau, Backup und Wiederherstellen, auch unter Bereinigen; am ersten Tag fragt die Vorschau nach, ob die Entität wirklich weg ist.
- **Duplikate:**
  - Auch der umgekehrte Fall wird erkannt: Die alte `sensor.x` ist übrig, die neue `sensor.x_2` läuft (gleiches Gerät oder gleicher Name).
  - Beim Ersetzen ist die funktionierende Entität vorbelegt; Vorschläge bei fehlenden Verweisen öffnen das Ersetzen mit diesem Ziel.
- **Ausnahmen:** Regeln nach Integration gelten auch für den Befund „Integration nicht ladbar“, etwa für den Drucker-Eintrag, solange der Drucker aus ist (Diskussion 28).
- **Entität „Aktivität“:** Zeigt, ob Housekeeper gerade scannt, einen Plan ausführt, auf den Start von Home Assistant wartet oder bereit ist; passt auf ein Dashboard neben den Knopf „Scan starten“.

### Geändert

- **Ausfälle im Standby:**
  - Ein Gerät, dessen Entitäten alle keinen Wert mehr haben (etwa im Standby), gilt als „Gerät ganz ausgefallen“, nicht mehr nur bei „nicht verfügbar“. Seine Entitäten stehen als Folgen darunter, ein Vermerk am Gerät blendet alle aus. Entitäten, die nie einen Wert hatten, und deaktivierte zählen nicht mit.
- **Oberfläche:**
  - In der Ursachendiagnose öffnen Integration, Gerät und funktionierende Entität per Klick ihre Seite.
  - In der Kopfzeile der Detailseite sind Integration, Gerät und Bereich verlinkt.
  - Das Zeilenmenü eines Duplikat-Befunds öffnet die funktionierende Entität.
  - Im Reiter „Aktionen“ steht der Schritt, der einen Befund löst, als erster Knopf in dessen Zeile (zum Beispiel „Entfernen planen“ oder „Durch funktionierende Entität ersetzen“).
  - Der erwartete Endzustand eines Plans sagt, wann der Recorder verbliebene Zustände löscht und dass Langzeitstatistik bleibt (oder dass alles bleibt, wenn die automatische Bereinigung aus ist); „1 Entität“ statt „1 Entitäten (0 Geräte)“.

### Behoben

- **Aufräumen und Labels:**
  - Unter Bereinigen → „Geräte deaktivieren“ erscheinen Geräte mit dem Vermerk „Nicht entfernen“, dem Label `housekeeper_ignore` oder einer Ausnahmeregel nicht mehr; Geräte ganz ohne Entität (etwa Bluetooth-Proxy) sind als „Keine Entitäten“ gekennzeichnet (Diskussion).
  - Das Label `housekeeper_ignore` an einem Gerät blendet auch dessen Befunde und die seiner Entitäten aus, nicht nur bei Entitäten und Automationen.
- **Priorität:** „Wurde nie ausgelöst“ und „Lange nicht ausgelöst“ sind bei Automationen, die Kritisches steuern (Alarm, Überflutung), nicht mehr „Hoch“ (Diskussion 33).
- **Inventar:** Automationen, Skripte und Szenen erscheinen nur noch einmal und werden einmal gezählt, nicht zusätzlich als Entität; die Detailseite verlinkt beide (Issue 34).
- **Knopf „Scan starten“:** Er gilt während eines Scans nicht mehr als „nicht verfügbar“, darum meldet Housekeeper ihn nicht mehr selbst als flatternd (Issue 35).
- **Oberfläche:**
  - Das Menü am Zeilenende (⋮) wird nicht mehr am Rand der Karte abgeschnitten (Issue 32).
  - „In HA öffnen“ führt bei Szenen ohne Editor zur Geräteseite; „Entität öffnen“ gibt es auch für Szenen.
  - Bei einem ausgefallenen Gerät zeigt die Ursachendiagnose, dass alle Entitäten nicht verfügbar sind, statt „aktiv und stellt Entitäten bereit“; die Risiko-Zeile sagt, dass sie das Entfernen meint.
- **Backup-Schutz:**
  - Backups anderer Werkzeuge (zum Beispiel Google Drive Backup) stehen in der Tabelle als „Anderes Werkzeug“ statt „Manuell“, denn Home Assistant weiß nicht, ob sie geplant waren.
  - Die Ziele eines Backups stehen mit lesbaren Namen („Lokal“, „Netzwerkspeicher: …“, „Google Drive“) als Pillen statt als Kennungen; das Konto fällt weg.

### English

#### New

- **Labels:**
  - The label `housekeeper_keep` on a device or entity works like the mark “Do not remove”: it blocks every cleanup step but hides no finding. In Home Assistant it can be set on several objects at once.
  - Settings → Exceptions has a block with the three labels `housekeeper_keep`, `housekeeper_ignore` and `housekeeper_critical`: what each does, whether it exists in Home Assistant and how many objects carry it.
  - The inventory can be filtered by label.
- **Entities the integration no longer provides:** They are recognised as orphaned instead of "unavailable", YAML entities too, after the same wait as an outage. They can be removed straight away, without quarantine, but with preview, backup and restore, in Cleanup too; on the first day the preview asks whether the entity is really gone.
- **Duplicates:**
  - The reverse case is recognised as well: the old `sensor.x` is left over, the new `sensor.x_2` works (same device or same name).
  - When replacing, the working entity is filled in; suggestions for missing references open the replacement with that target.
- **Exceptions:** Rules by integration also cover the "integration cannot be loaded" finding, such as a printer's entry while the printer is off (discussion 28).
- **Entity “Activity”:** Shows whether Housekeeper is scanning, running a plan, waiting for Home Assistant to start or idle; fits on a dashboard next to the “Start scan” button.

#### Changed

- **Outages in standby:**
  - A device whose entities all lost their value (in standby, say) counts as "Device is down completely", no longer only when they are unavailable. Its entities are listed as follow-ups below it, and one mark on the device hides them all. Entities that never had a value and disabled ones do not count.
- **Interface:**
  - In the cause diagnosis, the integration, device and working entity open their page on click.
  - In the header of the detail page, integration, device and area are links.
  - The row menu of a duplicate finding opens the working entity.
  - In the "Actions" tab, the step that resolves a finding is the first button in that finding's row (for example "Plan to remove" or "Replace by the working entity").
  - The expected end state of a plan says when the recorder deletes the states left behind and that long-term statistics stay (or that everything stays when the automatic purge is off); "1 entity" instead of "1 entities (0 devices)".

#### Fixed

- **Cleanup and labels:**
  - Under Cleanup → “Disable devices”, devices with the “Do not remove” mark, the label `housekeeper_ignore` or an exception rule no longer appear; devices with no entity at all (such as a Bluetooth proxy) are marked “No entities” (discussion).
  - The label `housekeeper_ignore` on a device also hides its findings and those of its entities, no longer only for entities and automations.
- **Priority:** "Never triggered" and "Not triggered for a long time" are no longer "High" for automations that control something critical (alarm, flooding) (discussion 33).
- **Inventory:** Automations, scripts and scenes appear once and are counted once, no longer also as an entity; the detail page links both (issue 34).
- **“Start scan” button:** It is no longer “unavailable” during a scan, so Housekeeper no longer reports it as flapping itself (issue 35).
- **Interface:**
  - The row menu (⋮) is no longer cut off at the edge of the card (issue 32).
  - "Open in HA" leads to the device page for scenes without an editor; "Open entity" is offered for scenes too.
  - For a device that is down, the diagnosis shows that all its entities are unavailable instead of “active and provides entities”; the risk row says it is about removing.
- **Backup protection:**
  - Backups made by other tools (for example Google Drive Backup) show as “Other tool” instead of “Manual” in the table, because Home Assistant cannot tell whether they were scheduled.
  - The targets of a backup show readable names (“Local”, “Network storage: …”, “Google Drive”) as pills instead of IDs; the account part is left out.

## 1.10.2 - 2026-10-19

### Behoben

- **Scan:**
  - Ein Konfigurationseintrag mit einer Zahl als Titel ließ den ersten Scan scheitern („'int' object has no attribute 'lower'“).
  - Eine Szene, die etwas anderes als Namen auflistet, lässt den Scan nicht mehr scheitern; bei einem Fehler steht im Debug-Protokoll, wo er auftrat.
  - „Scan starten“ bleibt nach einem Scan nicht mehr nicht verfügbar.
- **Backup-Schutz:** Backups anderer Werkzeuge (zum Beispiel Google Drive Backup) werden erkannt und zählen für die Prüfungen.

### Geändert

- **Diagnose:** Der Download enthält jetzt die Markierungen der Backups (ohne Namen), das hilft bei Meldungen zum Backup-Schutz.

### English

#### Fixed

- **Scan:**
  - A config entry whose title is a number made the first scan fail (“'int' object has no attribute 'lower'”).
  - A scene that lists something other than names no longer makes the scan fail; on an error the debug log says where it happened.
  - “Start scan” no longer stays unavailable after a scan.
- **Backup protection:** Backups made by other tools (for example Google Drive Backup) are recognised and count for the checks.

#### Changed

- **Diagnostics:** The download now holds the flags of the backups (no names), which helps with reports about backup protection.

## 1.10.1 - 2026-10-19

### Behoben

- **Inventar und Detailseite:** Enthält die Antwort einen Wert, den Home Assistant nicht als JSON senden kann („Invalid JSON in response“), lädt die Seite trotzdem (zum Beispiel ein ungewöhnliches Attribut einer Entität); das Protokoll nennt die betroffenen Stellen.

### English

#### Fixed

- **Inventory and detail page:** If the reply holds a value Home Assistant cannot send as JSON (“Invalid JSON in response”), the page still loads (for example an unusual attribute of an entity); the log names the affected places.

## 1.10.0 - 2026-10-18

### Neu

- **KI-Zugriff:**
  - Neuer Reiter Einstellungen → KI-Zugriff, standardmäßig aus: Programme und KI-Agenten, die Home-Assistant-Dienste aufrufen können (zum Beispiel ha-mcp), lesen Housekeeper über die Dienste `status`, `findings`, `object` und `audit`.
  - Ein zweiter Schalter „Merkliste ändern“ erlaubt `finding_decide`, `mark`, `note_set` und `undo`; es ändern sich nur Housekeepers eigene Listen, nie Home Assistant.
  - „Automatisch ausschalten“ wählst du mit Chips (Nie, 1, 8, 24 Stunden).
  - Grenzen gegen Schleifen: standardmäßig 200 Änderungen in 5 Minuten und 120 Lesezugriffe pro Minute, im Reiter einstellbar.
  - Ein Protokoll zeigt jeden Aufruf mit Benutzer und Ergebnis, Änderungen lassen sich dort zurücknehmen. Es ist eine Standard-Tabelle wie die anderen Listen: Suche, Filter nach Art, Sortierung, Seiten, Export (CSV, Markdown, JSON) und aufklappbare Zeilen mit den Parametern. Nur Administratoren, nie Geheimnisse.
- **Urlaubsmodus:** Eine Entität deiner Wahl (z. B. `input_boolean.urlaub`) schaltet Regeln „nur im Urlaubsmodus“ ein. Dazu gibt es Regeln für einzelne Geräte und Entitäten, eine Nachfrist nach dem Urlaub (Standard 24 Stunden) und eine Leiste, solange etwas zurückgehalten wird.
  - Ist noch nichts gewählt und gibt es einen Helfer wie `input_boolean.urlaubsmodus` oder `vacation_mode`, steht er als Vorschlag im Feld und gilt nach dem Speichern.
  - Eine Kalender-Entität kann ein Stichwort bekommen: Dann schaltet in deinem normalen Kalender ein Termin mit „Urlaub“ im Titel den Modus ein, auch wenn gleichzeitig andere Termine laufen. Ohne Stichwort zählt jeder Termin.
- **Ausnahmeregeln:** Unter Einstellungen → Ausnahmen nimmst du Objekte nach Bereich, Label, Integration oder Typ (z. B. Bereich „Lager“, alle `media_player`) aus. Die Regel blendet ihre Befunde aus oder meldet einen Ausfall erst nach einer einstellbaren Zahl Tage.
  - Die Regeln stehen mit einem Umschalter „Immer“ und „Im Urlaubsmodus“ in einer Tabelle, darunter der Urlaubsmodus.
  - Die Art „Alle Typen“ (vorgewählt) findet Bereiche, Labels, Integrationen, Geräte und Entitäten gleichzeitig; beim Speichern entsteht je Art eine Regel.
  - Die Kachel „Ausnahmen“ in den Einstellungen zeigt die Zahl der Regeln, die Zahl der ausgeblendeten Befunde und den Urlaubsmodus: an, aus oder „nicht eingerichtet“.

### Geändert

- **HACS und Marketplace:** Ab Home Assistant 2026.11 ist HACS als „Marketplace“ eingebaut. Housekeeper liest installierte Integrationen, Updates, archivierte und entfernte Repositories aus beiden.
- **In HA öffnen:** Bei Entitäten mit Gerät öffnet der Knopf die Geräteseite statt der ganzen Entitätenliste.
- **Links nach Home Assistant:** Alle Sprünge nach Home Assistant (Apps, Integrationen, HACS, Benutzer, Cloud) öffnen in einem neuen Tab statt im selben.
- **Schutzmodus:** Der Schutzmodus nennt die Wirkung statt der Stufe: „Alles erlaubt“, „Ohne endgültiges Löschen“, „Nur Quarantäne“, „Nur lesen“.
- **Einstellungen, Kacheln:** Die Kacheln stehen in neuer Reihenfolge (Schutzmodus, Ausnahmen, Scan und Meldungen, KI-Zugriff, Darstellung, Info) in drei Spalten. Jede Kachel zeigt ihren Stand, der Randstreifen folgt ihm (z. B. KI-Zugriff: aus grau, Lesen grün, Ändern gelb).
- **Oberfläche, Fehlermeldungen:** Fehler stehen überall im selben Kasten mit Symbol (Seiten, die nicht laden, und Formulare). Die schmale Fehlerzeile in den Speicherleisten ist ohne Fehler unsichtbar.
- **Updates:** Die ausstehenden Updates stehen in der gewohnten Tabelle mit Suche, Sortierung, Filter nach Bereich und Seiten.

### Behoben

- **Mehr Infos:** Beim Schließen des Dialogs „Mehr Infos“ bleibt das Panel auf der Detailseite, statt zurück zur Liste zu springen.
- **Kopieren:** Die Kopier-Knöpfe (z. B. „Angaben für eine Fehlermeldung kopieren“) funktionieren auch ohne HTTPS und melden einen Fehlschlag statt „Kopiert“.

### English

#### New

- **AI access:**
  - New tab Settings → AI access, off by default: programs and AI agents that can call Home Assistant services (for example ha-mcp) read Housekeeper through the services `status`, `findings`, `object` and `audit`.
  - A second switch “Change the list” allows `finding_decide`, `mark`, `note_set` and `undo`; only Housekeeper's own lists change, never Home Assistant.
  - “Switch off automatically” uses chips (never, 1, 8, 24 hours).
  - Limits against loops: by default 200 changes in 5 minutes and 120 reads per minute, adjustable in the tab.
  - A log shows every call with user and result, and changes can be taken back there. It is a standard table like the other lists: search, filter by kind, sorting, pages, export (CSV, Markdown, JSON) and expandable rows with the parameters. Administrators only, never secrets.
- **Vacation mode:** An entity of your choice (e.g. `input_boolean.vacation`) turns on rules “only in vacation mode”. Also rules for single devices and entities, a grace period after the vacation (default 24 hours) and a bar while something is held back.
  - If nothing is chosen and a helper like `input_boolean.urlaubsmodus` or `vacation_mode` exists, it is offered as a suggestion in the field and counts once saved.
  - A calendar entity can get a keyword: an event with “Vacation” in its title in your normal calendar then switches the mode on, even while other events run. Without a keyword every event counts.
- **Exception rules:** Under Settings → Exceptions you leave out objects by area, label, integration or type (e.g. area “Storage”, all `media_player`). A rule hides their findings or reports an outage only after a number of days you set.
  - The rules sit in a table with a switch “Always” and “In vacation mode”, and below it the vacation mode.
  - The kind “All types” (preselected) finds areas, labels, integrations, devices and entities at once; saving makes one rule per kind.
  - The “Exceptions” tile in the settings shows the number of rules, the number of hidden findings and the vacation mode: on, off or “not set up”.

#### Changed

- **HACS and Marketplace:** From Home Assistant 2026.11 HACS is built in as “Marketplace”. Housekeeper reads installed integrations, updates, archived and removed repositories from both.
- **Open in HA:** For entities with a device the button opens the device page instead of the whole entity list.
- **Links into Home Assistant:** All jumps into Home Assistant (apps, integrations, HACS, users, cloud) now open in a new tab instead of the current one.
- **Protection mode:** The protection mode names the effect instead of the level: “Everything allowed”, “No irreversible deletions”, “Quarantine only”, “Read only”.
- **Settings, tiles:** The tiles come in a new order (protection mode, exceptions, scan and messages, AI access, appearance, info) in three columns. Every tile shows its state, and the edge stripe follows it (e.g. AI access: off grey, reads green, changes amber).
- **Interface, error messages:** Errors appear in the same box with an icon everywhere (pages that do not load, and forms). The narrow error line in the save bars is invisible when there is no error.
- **Updates:** The pending updates sit in the usual table with search, sorting, filter by area and pages.

#### Fixed

- **More info:** Closing the “More info” dialog keeps the panel on the detail page instead of jumping back to the list.
- **Copying:** The copy buttons (e.g. “Copy details for a bug report”) also work without HTTPS and report a failure instead of “Copied”.

## 1.9.0 - 2026-10-17

### Geändert

- **Wartung, Backups:**
  - „Backup-Schutz“ und „Backups aufräumen“ sind ein Reiter „Backups“; das Aufräumen steht eingeklappt ganz unten, die Zeile „Housekeeper-Backups“ führt dorthin.
  - Oben stehen ein Urteil (Belastbar, Erst ansehen, Problem) und vier Kennzahlen; die Prüfzeilen sind in vier Gruppen geordnet.
  - Neue Prüfungen: Inhalt des neuesten Backups (fehlgeschlagene Apps oder Ordner, fehlende Datenbank), Alter der Kopie je externem Ablageort und Platz fürs nächste Backup.
  - Eine Leiste zeigt die Größe der letzten Backups, so fällt Wachstum früh auf.
  - Fehlende Verschlüsselung lässt sich als gewollt bestätigen; die Zeile steht dann auf „In Ordnung“.
- **Journal:**
  - Das Journal hat Reiter: „Pläne“ und „Entfernte Geräte“ (bisher unter Wartung, jetzt mit einem Sprung zum Plan); ältere Löschungen von Statistiken stehen als dritter Reiter dort, wenn es sie gibt.
  - Ein Fehler beim Laden wird angezeigt statt „Noch keine Vorschau“, und die Seite hat „Aktualisieren“ und einen Zeitstempel.
  - Der Hinweis nennt die richtigen Grenzen (ausgeführte Pläne bis zu einem Jahr, höchstens 300).
  - Der Reiter „Entfernte Geräte“ heißt „Entfernt und gelöscht“ und zeigt auch entfernte Entitäten, gelöschte Automationen, Statistiken und Backups, mit Filter nach Art und dem Hinweis, was sich nicht rückgängig machen lässt.
- **Wartung, Updates:**
  - Der Reiter „Update-Preflight“ heißt jetzt „Updates“: ein Gesamturteil (Bereit, Erst ansehen, Stopp), die Prüfzeilen und die Liste der offenen Updates, gruppiert nach System, Apps, HACS und Geräten, mit Sprung nach Home Assistant.
  - Das Backup wird nach dem Backup-Schutz beurteilt (Zeitplan, letzter Lauf); neu ist die Zeile „Freier Speicher“; HACS-Updates, die HACS nicht installieren kann, sind gekennzeichnet.
  - Auf der Übersicht steht eine Zeile „n Updates offen“ (ohne Einfluss auf den Ring).
  - Ein Knopf prüft die Konfiguration (die Prüfung von Home Assistant, nur auf Knopfdruck); ist sie ungültig, steht das Urteil auf „Stopp“.
  - Die Liste ist übersichtlicher: jede Gruppe eine eigene Karte mit Anzahl, die Versionen als Chip, ruhige Knöpfe rechts, ein Ersatzsymbol, wenn Home Assistant kein Bild liefert.
- **Weniger CPU-Last:**
  - Zeitsteuerung und Code der Hintergrundarbeit sind optimiert.
  - Die Auswertungen aus der Recorder-Datenbank laufen seltener und verteilt, die Abfragen sind sparsamer (abgeschlossene Tage werden nur noch einmal gerechnet, unnötige Suchen entfallen), und Scans nach Ausfällen rücken bei langsamen Systemen weiter auseinander.
- **Speicher & System:** Die Seite lädt schneller: der Durchlauf über die Ordner läuft neben der Abfrage beim Supervisor statt danach, die Plattenbelegung nach Kategorien wird wie die Ordnergrößen einige Minuten wiederverwendet (Aktualisieren liest neu), und beim Öffnen stehen die zuletzt gelesenen Größen sofort da und werden bei Bedarf im Hintergrund erneuert.
- **Befunde, Anmeldung nötig:** Verlangt eine Integration eine neue Anmeldung, ist das ein Befund („Anmeldung nötig“, mindestens mittel) mit den betroffenen Entitäten als Folgen, auch wenn die Integration geladen bleibt. Er erscheint innerhalb etwa einer Minute und verschwindet nach der Anmeldung wieder. In „Was muss ich tun?“ steht er als eigene Zeile ganz oben.
- **Apps & Integrationen, offen in Home Assistant:** Über der Liste steht eine zugeklappte Info-Zeile mit den gefundenen Geräten, die noch auf ihre Einrichtung warten, und den Integrationen, die neu konfiguriert werden möchten. Sie ist ein Hinweis, kein Befund, und fehlt, wenn nichts offen ist.
- **Zuverlässigkeit:**
  - Integrationen, die den ganzen Zeitraum ausgefallen waren, stehen oben als „Ausgefallen“ (statt ohne Wert am Ende der Liste) und haben eine eigene Kachel.
  - Die Kachel „Ø je Integration“ zählt jede Integration einmal und lässt dauerhaft Ausgefallene weg; die Spalte heißt „Gemeinsame Ausfälle“, bei Integrationen mit weniger als drei Entitäten steht „zu klein“ statt einer 0.
  - Die Kacheln und Filter „Neue Anmeldung nötig“ und „Nicht geladen“ entfallen, die Anmeldung bleibt als Hinweis in der Zeile und führt zum Befund.
  - Neues Fenster „30 Tage“ (wie bei den Hausfunktionen); die Fußnote nennt die Farbgrenzen (grün ab 99,5 %, gelb ab 95 %) und dass die Tagesleiste einer Hausfunktion nach der Dauer färbt.
  - Die Detailseite einer Integration zeigt Kennzahlen, eine Tagesleiste mit den Ausfalltagen (wie bei den Hausfunktionen), die Ausfallzeiträume mit Beginn, Dauer und Zahl der betroffenen Entitäten und nennt die Hausfunktionen, die sich auf die Integration stützen; der Vergleich nennt seine Einheit (Prozentpunkte).
- **Zugangsdaten:**
  - Integrationen, die eine neue Anmeldung verlangen, tragen die Marke „Anmeldung nötig“ und haben eine eigene Kachel, ebenso deaktivierte Integrationen, die noch Zugangsdaten halten; mehr Feldnamen werden als Zugangsdaten erkannt (etwa Cookie, Session-ID, Einmalcode).
  - Neuer Reiter „Konten“ mit Rolle, Zwei-Faktor und letzter Anmeldung jedes Benutzers und eine Kachel „Admins ohne Zwei-Faktor“, ein Reiter „Langzeit-Tokens“ mit Name, Konto und Alter; die Kacheln stehen in gleich großen Reihen.
- **Übersicht, Inventarstatus:** Objekte mit einer Markierung (z. B. „Absichtlich offline“), auch die Entitäten eines markierten Geräts, stehen in einer eigenen Zeile „Markiert (erwartet)“ und zählen nicht mehr unter „Problematisch“ (Issue 25).
- **Oberfläche:**
  - Der Start-Hinweis ist eine kompakte Karte: vier Schritte als Leiste, „38 von 41 Integrationen geladen“ mit Balken und Wartezeit daneben, die Namen der noch ladenden Integrationen und beim Scan die aktuelle Phase.
  - Er aktualisiert sich selbst (alle 3 Sekunden) und verschwindet, sobald die endgültigen Befunde da sind.
- **Freigaben:**
  - Als sensibel gelten jetzt auch Kameras, Sirenen, Ventile und Türen.
  - Neue Warnung, wenn Google Assistant Schlösser, Alarmanlagen oder Tore ohne PIN öffnen darf, und ein Hinweis, wenn neue Entitäten automatisch an Alexa oder Google freigegeben werden.
  - Ein weiterer Hinweis nennt KI-Gesprächsagenten und den MCP-Server, die Home Assistant über Assist steuern dürfen und so die Assist-Freigaben an ein Sprachmodell oder verbundene Programme geben.
- **Zugriffe & Datenfluss:**
  - Mehr Integrationen werden erkannt, etwa Bluetooth und Thread als Funk, Frigate und UniFi Protect als Kamera, ESPHome und Matter als Netzwerk; Ollama gilt als lokal.
  - Integrationen aus HACS tragen „Fremdcode, volle Rechte“ und haben mindestens mittleres Risiko.
  - Bei den Apps: Schutzmodus aus (hohes Risiko), offene Ports am Host und eine Spalte zur Herkunft (offiziell, Community, lokal).
  - Neuer Reiter „Von außen erreichbar“: Nabu-Casa-Fernzugriff, Tunnel-, Proxy-, DynDNS- und VPN-Apps, der MCP-Server und offene Webhooks.

### Behoben

- **Oberfläche, Korrekturen:**
  - Ein Blueprint öffnet eine eigene Seite wie andere Objekte (mit „Zurück zu Wartung“ und Kopfkarte) statt unter den Wartungskacheln.
  - In der Liste der Erinnerungen steht der Aufklapp-Pfeil links neben dem Namen statt darüber.
  - Wartung: Untertitel und Hinweis nennen die Reiter richtig, jeder Reiter ist über die Suche zu finden, die Zahl am Reiter Blueprints steht schon beim Öffnen der Seite, es heißt „1 Hinweis“ und „3 Hinweise“, und der Reiter Wartungsziele zeigt einen Ladefehler und hat „Aktualisieren“.
  - Die Tabelle „Alle gezählten Läufe“ nimmt wie die anderen Listen die volle Breite.
  - Auf „Zugriffe & Datenfluss“ steht „Wie wird das gezählt?“ in der Liste wie auf den anderen Sicherheitsseiten statt als eigene Karte darunter.
  - Der Start-Hinweis zeigt nach dem Neuladen der Seite nicht mehr kurz die alten „5 Minuten“, sondern wartet auf die aktuelle Angabe.
  - Der Puffer von einer Minute fängt wegen einer kurz ladenden Integration nicht mehr mehrmals von vorn an.
  - Die Zeile „Beobachtung nach Update“ steht auf der Übersicht unter dem Gesundheitsring statt im Seitenkopf.
  - Der Info-Hinweis „ändert nichts von selbst“ oben auf der Befundseite entfällt; eine kurze Erklärung steht stattdessen unter „Über Housekeeper“ in den Einstellungen, die Zeile „Betriebsart“ entfällt dort.
  - Auf schmalen Bildschirmen (Handy) brechen Zeilen mit Knöpfen um, statt den Text auf eine Buchstabenspalte zu quetschen (z. B. der Hinweis zu den Ausfall-Stufen auf der Übersicht).
  - Die Zeilen der Blueprint-Liste lassen sich anklicken und öffnen eine Detailseite mit Übersicht, Eingaben, Nutzung (mit den dort gesetzten Werten) und Dateidaten.
  - Ein Wartungsziel führt zur passenden Liste mit gesetztem Filter (etwa „Defekte Referenzen“ zu den Befunden dieser Art).
  - Die Verfügbarkeit einer Hausfunktion zeigt Kennzahlen als Kacheln und eine Tagesleiste über die ganze Breite mit Achse; „1 Vorfälle“ heißt jetzt „1 Vorfall“.
  - In der Tagesleiste der Verfügbarkeit ist ein Tag mit weniger als 1 % Ausfallzeit bernsteinfarben statt rot; der Hinweis am Balken nennt die Dauer, darunter steht eine Legende.
  - Die Seite einer Hausfunktion ist kompakter: Kopf, Kennzahlen, Tagesleiste und die zugeordneten Objekte stehen in einer Karte, Scan und Prüfung in einer Zeile unter dem Namen. Die Objekte sind eine Tabelle mit Seiten (zunächst 10 pro Seite).
  - Das Bearbeiten einer Hausfunktion ist aufgeräumter: Allgemeines, Objekte, Suche und Vorschläge stehen in einer Karte, Vorschläge sind „+“-Knöpfe, Entfernen ein X. „Löschen“ ist wie überall der weich rote Knopf (auch bei Notizen). „Speichern“ bleibt aktiv und sagt, was fehlt.
  - Recorder: Die Reiter heißen „Schreiblast“ (wie oft etwas geschrieben wird), „Speicherbedarf“ (wie viel Platz jede Entität belegt) und „Datenbank“.
  - Recorder: „Empfohlen“ zum Ausschließen entscheidet in Schreiblast und Speicherbedarf dieselbe Regel (nirgends verwendet, keine Statistik, mindestens 100 Zeilen in den letzten 24 Stunden); vorher konnte eine Entität im einen Reiter empfohlen sein und im anderen nicht.
  - Recorder, Datenbank: Größe, Zuwachs pro Tag, Aufbewahrung und „Automatisch löschen“ stehen als Kacheln über der Liste statt in einer Textzeile darunter; was sich nicht messen lässt (etwa bei MySQL), steht weiter als kurzer Hinweis.
  - Recorder, Schreiblast: neues Fenster „30 Tage“ neben 24 Stunden und 7 Tagen.
  - Hinweistexte zu Konflikten, Backup-Zielen und Statistik-Nachfolgern sagen nicht mehr „Vermutung“, wo „mögliche“ schon dasteht.
  - Läufe: Die Fußnote „So wird gezählt“ nennt jetzt die Grenzen der Hinweise (Fehler, nie erfolgreich, Überschneidung, ohne Wirkung, sehr oft, lange Läufe) mit den Zahlen aus dem Backend.
  - Der Kurzüberblick einer Integration („Bekannt“) zeigt „Neue Anmeldung offen“ statt „Geladen“, wenn Home Assistant eine neue Anmeldung verlangt.
  - Zuverlässigkeit und Schreiblast: Behält der Recorder weniger Tage, als das gewählte Fenster umfasst, steht ein Hinweis, dass die Zahlen nicht weiter zurückreichen.
  - Apps & Integrationen: Der Pfeil zum Aufklappen steht neben dem Namen statt darüber; alle Namen beginnen auf einer Linie.
  - HACS: Housekeeper liest jetzt alle installierten Repositories (auch Karten und Themes) und erfährt aus den Reparaturen von Home Assistant, welche HACS aus seiner Liste genommen hat.
  - Apps & Integrationen: Neuer Reiter „HACS“ mit allen installierten Repositories (Integrationen, Karten, Themes), Version, offenem Update und dem Hinweis, wenn HACS ein Repository aus seiner Liste genommen hat oder es archiviert ist. Eine Zeile öffnet das Repository in HACS.
  - HACS: Wurde ein Repository aus HACS entfernt, steht in „Was muss ich tun?“ eine Zeile dazu, auf der Integrationsseite der Grund und im Reiter HACS eine Anleitung mit Link zu den Reparaturen. Eine ignorierte Reparatur zeigt der Reiter als „ignoriert“.
  - Freigaben, Datenfluss, Zugangsdaten und Läufe zeigen im Menü eine Zahl, wenn dort etwas anzusehen ist (der Scan zählt sie).
- **Zugriffe & Datenfluss:** Integrationen, deren Tracker nur die Anwesenheit über Router oder Bluetooth melden (etwa die FRITZ!Box), gelten nicht mehr als „Standort“ mit hohem Risiko, sondern zeigen „Anwesenheit im Netz“.
- **Freigaben:** Alexa und Google Assistant, die in den Nabu-Casa-Einstellungen ausgeschaltet sind, zählen nicht mehr als „freigegeben“ und erzeugen keine Befunde; ihre Kachel zeigt „in Nabu Casa ausgeschaltet“.

### English

#### Changed

- **Maintenance, backups:**
  - "Backup protection" and "Tidy up backups" are one "Backups" tab; the tidy-up is folded at the bottom, and the "Housekeeper backups" line leads there.
  - On top are a verdict (Reliable, Look first, Problem) and four figures; the check lines are sorted into four groups.
  - New checks: the content of the newest backup (failed apps or folders, missing database), the age of the copy on each external target and room for the next backup.
  - A strip shows the size of the last backups, so growth shows early.
- **Journal:**
  - The Journal has tabs: "Plans" and "Removed devices" (so far under Maintenance, now with a jump to the plan); older deletions of statistics are a third tab there when there are any.
  - A load error is shown instead of "No preview yet", and the page has "Refresh" and a time stamp.
  - The hint names the right limits (plans that ran up to a year, at most 300).
- **Maintenance, updates:**
  - The "Update preflight" tab is now called "Updates": a verdict (Ready, Look first, Stop), the check lines and the list of open updates, grouped into system, apps, HACS and devices, with a jump to Home Assistant.
  - The backup is judged like the backup protection does (schedule, last run); there is a new "Free space" line; HACS updates that HACS cannot install are marked.
  - The overview has an "n updates open" line (without effect on the ring).
  - A button checks the configuration (Home Assistant's own check, only on request); if it is invalid, the verdict says "Stop".
- **Less CPU load:**
  - The timing and the code of the background work are optimised.
  - The analyses of the recorder database run less often and spread out, the queries do less work (finished days are calculated only once, needless searches are skipped), and on slow systems the scans after outages are spaced further apart.
- **Storage & system:** The page loads faster: the walk over the folders runs beside the Supervisor query instead of after it, the disk use by category is reused for a few minutes like the folder sizes (refresh reads it again), and on opening the sizes read last show at once and are renewed in the background when due.
- **Findings, login needed:** An integration that asks for a new login is a finding ("Login needed", at least medium) with its affected entities as follow-ups, even while it stays loaded. It appears within about a minute and goes away after the login. On the overview it is a row of its own at the top of "What do I have to do?".
- **Apps & integrations, open in Home Assistant:** A collapsed info row above the list shows the devices found that still wait to be set up and the integrations that want to be reconfigured. It is a hint, not a finding, and is left out when nothing is open.
- **Reliability:**
  - Integrations that were down the whole period are listed first as "Down" (instead of without a value at the end) and have a tile of their own.
  - The tile "Avg per integration" counts each integration once and leaves out those down all the time; the column is called "Shared outages", and integrations with fewer than three entities say "too small" instead of 0.
  - The tiles and filters "Login needed" and "Not loaded" are gone; the login request stays a hint in the row and leads to the finding.
  - New window "30 days" (as with the house functions); the footnote names the color limits (green from 99.5 %, yellow from 95 %) and says that the day strip of a house function colors by duration.
  - The detail page of an integration shows figures, a day strip of the outage days (as with the house functions), the outage periods with start, duration and number of affected entities, and names the house functions that rely on the integration; the comparison names its unit (percentage points).
- **Credentials:**
  - Integrations that ask to sign in again carry a "Login needed" mark and have a tile of their own, as do disabled integrations that still hold credentials; more field names are recognised as credentials (such as cookie, session id, one-time code).
  - New "Accounts" tab with each user's role, two-factor and last login, an "Admins without two-factor" tile, and a "Long-lived tokens" tab with name, account and age; the tiles sit in rows of equal size.
- **Overview, inventory status:** Objects with a mark (e.g. “Offline on purpose”), including the entities of a marked device, sit in their own row “Marked (expected)” and no longer count as “Problematic” (issue 25).
- **Interface:**
  - The start notice is a compact card: four steps in one track, “38 of 41 integrations loaded” with a bar and the waiting time beside it, the names of the integrations still loading and, during the scan, the current phase.
  - It updates by itself (every 3 seconds) and goes away as soon as the final findings are in.
- **Exposure:**
  - Cameras, sirens, valves and doors now count as sensitive too.
  - New warning when Google Assistant may open locks, alarm panels or gates without a PIN, and a note when new entities are exposed to Alexa or Google automatically.
  - Another note names AI conversation agents and the MCP server that may control Home Assistant through Assist and so hand the Assist exposure to a language model or connected programs.
- **Access & data flow:**
  - More integrations are recognised, such as Bluetooth and Thread as radio, Frigate and UniFi Protect as camera, ESPHome and Matter as network; Ollama counts as local.
  - Integrations from HACS carry "custom code, full rights" and are at least medium risk.
  - For apps: protection mode off (high risk), open ports on the host and a column for the origin (official, community, local).
  - New "Reachable from outside" tab: Nabu Casa remote access, tunnel, proxy, DynDNS and VPN apps, the MCP server and open webhooks.

#### Fixed

- **Interface, corrections:**
  - A blueprint opens its own page like other objects (with "Back to Maintenance" and a header card) instead of under the Maintenance tiles.
  - In the reminders list the expand arrow sits to the left of the name instead of above it.
  - Maintenance: the subtitle and hint name the tabs correctly, every tab can be found by search, the number on the Blueprints tab is there when the page opens, it says "1 note" and "3 notes", and the Maintenance goals tab shows a load error and has "Refresh".
  - The table "All counted runs" uses the full width like the other lists.
  - On "Access & data flow", "How is this counted?" sits inside the list like on the other security pages instead of in a card of its own below.
  - After a page reload the start notice no longer shows the old “5 minutes” for a moment but waits for the current figure.
  - The one-minute buffer no longer starts over because an integration loads briefly.
  - The “Observation after update” line now sits on the overview below the health ring instead of in the page header.
  - The “changes nothing by itself” info notice at the top of the findings page is gone; a short explanation now sits under “About Housekeeper” in the settings, and the “Mode” row is dropped there.
  - On narrow screens (phones) rows with buttons now wrap instead of squeezing the text into a one-letter column (e.g. the notice about outage levels on the overview).
  - Rows of the blueprint list can be clicked and open a detail page with overview, inputs, usage (with the values set there) and file data.
  - A maintenance goal leads to the matching list with the filter set (for example "Broken references" to the findings of that kind).
  - The availability of a house function shows its figures as tiles and a day strip across the full width with an axis; "1 incidents" now reads "1 incident".
  - In the day strip of the availability, a day with less than 1 % of impaired time is amber instead of red; the tooltip names the duration and a legend sits below.
  - The page of a house function is more compact: header, figures, day strip and the assigned objects share one card, scan and check sit in one line under the name. The objects are a table with pages (10 per page to begin with).
  - Editing a house function is tidier: general settings, objects, search and suggestions share one card, suggestions are “+” buttons, remove is an X. “Delete” is the soft red button as everywhere else (notes too). “Save” stays enabled and says what is missing.
  - Recorder: the tabs are called "Write load" (how often things are written), "Storage use" (how much space each entity takes) and "Database".
  - Recorder: "Recommended" for exclusion is decided by the same rule in write load and storage use (used nowhere, no statistics, at least 100 rows in the last 24 hours); before, an entity could be recommended in one tab and not in the other.
  - Recorder, database: size, growth per day, retention and "Purge automatically" are tiles above the list instead of a line of text below; what cannot be measured (for example with MySQL) stays as a short note.
  - Recorder, write load: new window "30 days" next to 24 hours and 7 days.
  - Hint texts on conflicts, backup targets and statistics successors no longer say “guess” where “possible” already says it.
  - Runs: the “How this is counted” footnote now names the limits of the notes (errors, never succeeds, overlap, no effect, very often, long runs) with the numbers from the backend.
  - The short overview of an integration (“Known”) shows “New login open” instead of “Loaded” when Home Assistant asks for a new login.
  - Reliability and write load: if the recorder keeps fewer days than the chosen window, a note says the numbers reach back no further.
  - Apps & integrations: the arrow that unfolds a row sits beside the name instead of above it; all names start on one line.
  - HACS: Housekeeper now reads every installed repository (cards and themes too) and learns from Home Assistant's repairs which ones HACS took out of its list.
  - Apps & integrations: new “HACS” tab with every installed repository (integrations, cards, themes), version, open update and a note when HACS took a repository out of its list or it is archived. A row opens the repository in HACS.
  - HACS: if a repository was removed from HACS, “What do I need to do?” gets a row for it, the integration page shows the reason and the HACS tab has a guide with a link to the repairs. An ignored repair shows as “ignored” in the tab.
  - Exposure, data flow, credentials and runs show a number in the menu when there is something to look at (the scan counts it).
- **Access & data flow:** Integrations whose trackers only report presence through a router or Bluetooth (such as the FRITZ!Box) no longer count as "location" with a high risk but show "presence on the network".
- **Exposure:** Alexa and Google Assistant switched off in the Nabu Casa settings no longer count as "exposed" and raise no findings; their tile says "switched off in Nabu Casa".

## 1.8.2 - 2026-10-16

### Geändert

- **Oberfläche, Knöpfe:** Knöpfe, die einen Plan anlegen, heißen einheitlich „Vorschau erstellen (N)“; wer Daten löscht, heißt „Löschen vorbereiten (N)“ und ist dezent rot.
- **Oberfläche, Plan-Vorschau:** „Aus dem Recorder löschen“ führt direkt in die Vorschau. Die Wahl „Auch die gespeicherten Zustände löschen“ ist dort ein hervorgehobener Schiebeschalter unten (an, nur bei Plänen, die Statistiken löschen). „Erwarteter Endzustand“ ist hervorgehoben, nennt Statistik und Rohdaten getrennt und zeigt „bleiben bestehen“-Zeilen nur, wenn sie nicht 0 sind. Das Kästchen „zur Kenntnis genommen“ entfällt: Das Bestätigen-Popup ist die Bestätigung. „Abbrechen“ verwirft die Vorschau ganz und speichert sie nicht im Journal.

### Behoben

- **Start, Anlaufphase:** Sie endet eine Minute, nachdem keine Integration mehr lädt (spätestens nach 5 Minuten), statt immer 5 Minuten zu laufen. Das Banner nennt die Zahl der ladenden Integrationen oder den Sicherheitspuffer.
- **Oberfläche, Korrekturen:** „In HA öffnen“ (Befundseite, HACS-Knöpfe) öffnet Home Assistant in einem neuen Tab statt im selben. Das Schließen des Dialogs „Mehr Infos“ lässt die Seite, auf der man ist. „Ausgewählte zusammenführen“ ist bei mehr als 10 Plänen gesperrt (statt mit Serverfehler abzubrechen).

### English

#### Changed

- **Interface, buttons:** Buttons that create a plan are named alike, “Create preview (N)”; the ones that delete are “Prepare deletion (N)” and softly red.
- **Interface, plan preview:** “Delete from the recorder” goes straight to the preview. The choice “Also delete the stored states” is a highlighted switch at the foot of the preview (on, only for plans that delete statistics). “Expected end state” is highlighted, names statistics and raw data separately and shows the “remain” lines only when they are not 0. The “acknowledged” box is gone: the confirm dialog is the confirmation. “Cancel” drops the preview completely and does not keep it in the journal.

#### Fixed

- **Startup, warm-up:** It ends one minute after no integration is loading any more (5 minutes at most) instead of always running 5 minutes. The banner names the number of integrations still loading or the safety buffer.
- **Interface, corrections:** “Open in HA” (findings page, HACS buttons) opens Home Assistant in a new tab instead of the same one. Closing the “More info” dialog keeps you on the page you were on. “Merge selected” is disabled for more than 10 plans (instead of failing with a server error).

## 1.8.1 - 2026-10-16

### Geändert

- **Oberfläche:**
  - Befunde: „Entität öffnen“ im Menü „⋯“ und auf der Detailseite öffnet den Dialog „Mehr Infos“ von Home Assistant („In Home Assistant öffnen“ heißt jetzt „In HA öffnen“). Die Seite sagt oben, dass Housekeeper nichts von selbst ändert (schließbar).
  - Befundseite: Die Kacheln zählen alles samt Folgen und nennen die Folgen daneben. Die Chips „Gruppiert | Einzeln“ ersetzen „Alle einzeln“. „Nur Ursachen mit Folgen“ gilt in beiden Ansichten. Listen außerhalb der Befundseite zeigen keine Auswahlkästchen mehr. Die Kachel „Nicht verfügbar“ der Übersicht öffnet die Befunde gefiltert.
  - Plan: Ein neuer Plan öffnet sich auf einer eigenen Seite mit „← Zurück zu …“ und geht direkt in die Vorschau. Vier Stufen (Prüfen, Bestätigen, Ausführen, Ergebnis) in einer Leiste, die laufende Stufe ist offen. Verbietet der Schutzmodus den Plan, sagt die Seite es vor dem Bestätigen und verlinkt die Einstellung.
  - Journal: „Ausgewählte löschen“ entfernt mehrere Vorschauen auf einmal (ausgeführte Pläne bleiben). Nie gestartete Vorschauen werden nach 24 Stunden von selbst entfernt.
  - Tabellen: Unter „vor 1.119 Tagen“ steht der genaue Zeitstempel in kleiner Schrift (bei kompakten Zeilen ausgeblendet).
  - Aufräumen: Die Kachel „Nicht verwendet“ steht zuletzt und nennt sich einen Hinweis.
  - Logbuch: „Ins Logbuch eintragen“ im Menü „⋯“ eines Befunds; Objekte der Beobachtung ohne Befund bekommen dasselbe Menü.
  - Beobachtung nach Updates: Neue Reparaturen zeigen Titel, Schweregrad und Link. Die Gruppen „Wieder in Ordnung“ zeigen nicht mehr den heutigen Zustand. Ereignisse derselben Art, die kurz aufeinander folgen, sind ein Eintrag mit Anzahl.

### Behoben

- **Oberfläche, Korrekturen:** Das Häkchen „zur Kenntnis genommen“ im Plan löscht die Fehlermeldung, und „Bestätigen“ ist mit Hinweis gesperrt, solange kein Schritt ausgeführt würde. Auswahlkästchen stehen nur noch in der Befundliste, wo die Leiste für die Aktionen ist. Objekte ohne Befund haben dasselbe Zeilenmenü, und „Ins Logbuch eintragen“ heißt nicht mehr wie „Vermerk setzen“. Die Gruppen der Beobachtung über die Vergangenheit zeigen nicht mehr Befunde mit dem heutigen Zustand.
- **Scan bei ungewöhnlichem Skript:** Kann Home Assistant die Verweise eines Skripts oder einer Automation nicht lesen (zum Beispiel wegen eines Dicts in einer `entity_id`-Liste), nutzt Housekeeper für dieses Objekt nur dessen Konfiguration und warnt im Log, statt den ganzen Scan abzubrechen (Issue 19). Die Warnung zu `device_registry.devices` im Log entfällt (Issue 22).

### English

#### Changed

- **Interface:**
  - Findings: “Open entity” in the “⋯” menu and on the detail page opens Home Assistant’s “More info” dialog (“Open in Home Assistant” is now “Open in HA”). The page says at the top that Housekeeper changes nothing by itself (can be closed).
  - Findings page: The tiles count everything including follow-ups and name the follow-ups beside it. The chips “Grouped | One by one” replace “All one by one”. “Only causes with follow-ups” means the same in both views. Lists outside the findings page no longer show selection boxes. The “Unavailable” tile of the overview opens the findings filtered.
  - Plan: A new plan opens on a page of its own with “← Back to …” and goes straight into the preview. Four stages (review, confirm, run, result) in one track, the stage that is on is open. When the protection mode forbids the plan, the page says so before you confirm and links to the setting.
  - Journal: “Delete selected” removes several previews at once (plans that ran stay). Previews that were never started are removed by themselves after 24 hours.
  - Tables: The exact timestamp sits below “1,119 days ago” in small type (hidden with compact rows).
  - Cleanup: The “Not used” tile comes last and calls itself a hint.
  - Logbook: “Add to logbook” in the “⋯” menu of a finding; objects of the watch without a finding get the same menu.
  - Watch after updates: New repairs show title, severity and link. The “Fine again” groups no longer show today’s state. Events of one kind that follow each other closely are one entry with their count.

#### Fixed

- **Interface, corrections:** Ticking “acknowledged” in a plan clears the error message, and “Confirm” is locked with a hint while no step would run. Selection boxes show only in the findings list, where the bar for the actions is. Objects without a finding have the same row menu, and “Add to logbook” no longer shares a name with “Set a mark”. The watch groups about the past no longer show findings with today’s state.
- **Scan with an unusual script:** When Home Assistant cannot read the references of a script or automation (for example because of a dict in an `entity_id` list), Housekeeper uses only that object's configuration and warns in the log instead of aborting the whole scan (issue 19). The warning about `device_registry.devices` in the log is gone (issue 22).

## 1.8.0 - 2026-10-15

### Neu

- **Stand beim Start eines Updates:** Beginnt ein Update von Home Assistant, Betriebssystem oder Supervisor, scannt Housekeeper sofort. Die Beobachtung danach vergleicht mit diesem Stand statt mit dem letzten planmäßigen Scan.

- **Reparaturen nach Updates:** Die Beobachtung nach einem Update meldet auch Reparaturen, die seitdem neu aufgetaucht sind, und zählt sie als Verschlechterung.

- **Backup-Liste mit Details:** Die Liste zeigt bis zu 20 Backups (10 pro Seite, wählbar) mit Art (automatisch, manuell, von Housekeeper) und Inhalt. Eine Zeile klappt auf: Name, HA-Version, Datenbank, Apps, Ordner, Größe je Ziel und fehlgeschlagene Teile.

- **Zustand als Anteil der Objekte in Ordnung:** Der Status zählt jetzt Objekte statt Punkte. Ausgangswert ist die Zahl der geprüften Objekte, jedes Objekt mit Befund nimmt nach seiner schlimmsten Stufe ab (hoch voll, mittel halb, niedrig ein Fünftel, Info nichts), Folgen einer Ursache zählen nicht extra. Es gibt keine Obergrenzen mehr, jede Behebung zählt. Die Karte „Wie entsteht die Zahl?“ zeigt zum Beispiel „1575 von 2000 in Ordnung“, Ring und Kurve zeigen den Anteil. Der Verlauf des Zustands beginnt neu.

- **Ausfälle nach Dauer:** Nicht verfügbare Entitäten, Geräte, Integrationen und Apps werden nach 15 Minuten zum Befund und steigen mit der Dauer (Info, niedrig, mittel, hoch). Info und niedrig stehen nur auf der Befundseite; Übersicht, Sensoren und Reparaturhinweise zählen ab mittel. Die Einstellung „Nicht verfügbar nach Tagen“ ist durch vier einstellbare Schwellen ersetzt (ein alter Wert wird übernommen, bis du die neuen speicherst). Bei einem Ausfall scannt Housekeeper zu den Schwellen zusätzlich, ohne den Verlauf zu verändern. Entitäten werden dadurch viel früher gemeldet als bisher nach 7 Tagen.

- **Bewertung und Hinweise:** Die Detailseite zeigt die Bewertung eines Befunds mit Gründen und nächster Stufe. Fällt ein Objekt regelmäßig aus, nennt der Befund die übliche Tageszeit und schlägt einen Vermerk mit Zeitfenster vor.

- **Befundseite:** Eine Erklärung hinter der Überschrift, Kacheln in drei Gruppen, die wie die Liste zählen (die Kurven ebenfalls, ohne Folgen), ein Schweregrad für jeden Befund (Info zieht nichts ab), Folgen eingerückt unter ihrer Ursache, die Größe der Ansicht in der Auswahlzeile und die Filter „Alle einzeln“ und „Ursachen mit Folgen“ mit Anzahl. Auf dem Reiter „Technisch“ stehen Labels bei allen Objekten.

- **Nach Updates und Neustarts:** Eine Karte auf der Befundseite zeigt, was nach einem Update oder Neustart begann, eine Zeile je Vorfall; zeitlich zusammenliegende Updates bilden einen Vorfall. Die Beobachtung nach einem System-Update steht in der Zeile des Vorfalls, mit Urteil (Läuft, Verschlechtert, Stabil), getrennt nach dem, was seitdem nicht mehr läuft, und den Befunden, die dabei begannen. Sie startet nur noch bei Updates von Home Assistant, Betriebssystem und Supervisor, lässt sich vorzeitig beenden (mit Rückfrage; sie wird dann mit den bisherigen Messungen ausgewertet) und das Band im Seitenkopf führt zu ihr. Ein Filter zeigt nur die Befunde, die mit einem Update begannen.

- **Scan alle 6 Stunden:** Der Standard für den automatischen Scan ist 6 statt 24 Stunden (einstellbar; ein selbst gesetzter Wert bleibt). Der Verlauf behält einen Punkt pro Tag.

- **Schutz der Datenbank:** Vor dem Löschen im Recorder prüft Housekeeper die Datenbank vollständig (auch auf Wunsch und nach dem Löschen) und meldet einen Schaden als Befund und Reparaturmeldung, mit Hinweis auf `REINDEX` und das Backup (Issue 12). Dazu kommen Hinweise auf beiseitegelegte Datenbanken, wenig Speicherplatz und unsauberes Herunterfahren; Pläne warten auf einen ruhigen Recorder. Gelöscht wird dabei nichts.

- **Sicherere Pläne:** Das Backup vor einem Plan wird geprüft und mit Namen genannt. Veraltete Vorschauen sind markiert und lassen sich erneuern, große Löschungen zeigen einen deutlichen Hinweis, und zu viele Housekeeper-Backups werden gemeldet. Eine unlesbare Speicherdatei lässt nur ihren Teil leer starten.

- **Export überall:** Die Recorder-Seite hat einen Export-Knopf (CSV, Markdown, JSON) für alles, was ein Reiter zeigt. Alle Listen nutzen jetzt dasselbe Export-Menü statt des Download-Symbols.

- **Sieben neue Farbschemata:** Aurora, Honig, Lagune, Smaragd, Frost, Mitternacht und Olive, jeweils in Hell und Dunkel. Die Kacheln der Auswahl sind kleiner, „Lesbarkeit“ steht jetzt rechts.

### Geändert

- **Update-Preflight nur noch für vorher:** Der manuell gespeicherte Ausgangszustand und der Vergleich danach entfallen. Die Karte prüft den Zustand vor einem Update und sagt unten, was danach geschieht: Die Beobachtung nach Updates übernimmt das Nachher.

- **Wartungsfenster entfernt:** Das experimentelle, standardmäßig ausgeschaltete Wartungsfenster unter Wartung gibt es nicht mehr. Wer es eingeschaltet hatte, verliert den gespeicherten Stand. Nach einem Update zeigt die Beobachtung, was seitdem ausfiel.

- **Oberfläche:** Korrekturen und kleine Verbesserungen an Listen, Dialogen, Beschriftungen und Bedienung, darunter ein geöffnetes Panel, das neue Scans im Hintergrund selbst übernimmt (vorher zeigte die Übersicht danach alte Zahlen), die Kacheln der Befundseite (auf breiten Fenstern in zwei Zeilen, alle gleich hoch und breit), die Spaltenauswahl der Listen (Kästchen in einer Reihe am rechten Rand), die Karten der Schwellen unter Einstellungen (gruppiert, einheitlich aufgebaut, mit Link „Standard“), die Ereignisse für eigene Automationen als Tabelle mit Kopier-Knopf, die Wartungsziele (nur noch unter Wartung, nicht mehr doppelt in den Einstellungen), die Liste der letzten Backups (Pfeil neben dem Datum, Details ausgerichtet), die Einstellungen mit vier statt sieben Reitern (Darstellung, Scan und Meldungen, Schutz und Ausnahmen, Info); Speichern der Schwellen lässt die Seite offen, statt zum Home-Assistant-Dashboard zu springen und die Lesbarkeit der Vorfälle.

### Behoben

- **Nicht eingelöste Bestätigungen:** Abgelaufene Bestätigungen werden jetzt vergessen und sammeln sich nicht mehr im Speicher (Issue 18).

- **Bestätigung gehört dem Administrator, der sie erteilt hat:** Ein anderer Administrator kann sie nicht mehr einlösen, und im Verlauf steht immer der, der bestätigt und gestartet hat (Issue 17).

- **Löschen von Statistiken nur noch über einen Plan:** Ein alter Befehl löschte verwaiste Statistiken ohne Vorschau und Bestätigung. Das Panel nutzte ihn nicht mehr; er ist entfernt (Issue 16).

- **Backup-Prüfung:** Backups einzelner Apps, etwa vor einem App-Update, zählen nicht mehr als Backups von Home Assistant.

### English

#### New

- **State when an update starts:** When an update of Home Assistant, the operating system or the Supervisor begins, Housekeeper scans at once. The watch afterwards compares with that state instead of the last scheduled scan.

- **Repairs after updates:** The watch after an update also reports repairs that have appeared since, and counts them as worse.

- **Backup list with details:** The list shows up to 20 backups (10 per page, selectable) with type (automatic, manual, by Housekeeper) and contents. A row unfolds: name, HA version, database, apps, folders, size per target and failed parts.

- **State as the share of objects in order:** The status now counts objects instead of points. The starting value is the number of rated objects, each object with a finding takes off by its worst level (high fully, medium half, low a fifth, info nothing), follow-ups of a cause do not count extra. There are no caps any more, every fix counts. The card “How is this number made?” shows, for example, “1575 of 2000 in order”; the ring and the curve show the share. The history of the state starts afresh.

- **Outages by duration:** Unavailable entities, devices, integrations and apps become a finding after 15 minutes and rise with their duration (info, low, medium, high). Info and low appear only on the findings page; the overview, the sensors and the repair hints count from medium on. The setting “Unavailable after days” is replaced by four adjustable thresholds (an old value is kept until you save the new ones). During an outage Housekeeper scans additionally at the thresholds without changing the history. Entities are therefore reported much earlier than the former 7 days.

- **Rating and hints:** The detail page shows the rating of a finding with its reasons and the next level. If an object fails regularly, the finding names the usual time of day and suggests a mark with a time window.

- **Findings page:** An explanation behind the heading, tiles in three groups that count like the list (the curves too, without follow-ups), a severity for every finding (info takes nothing off), follow-ups indented under their cause, the size of the view in the selection row and the filters “All one by one” and “Causes with follow-ups” with their counts. The tab “Technical” shows labels for all objects.

- **After updates and restarts:** A card on the findings page shows what began after an update or restart, one row per incident; updates close in time form one incident. The watch after a system update sits in the row of its incident, with its verdict (Running, Worse, Stable), apart for what has stopped working since and the findings that began with it. It starts only for updates of Home Assistant, the operating system and the Supervisor, can be ended early (after a confirmation; it is then judged by the measurements so far), and the band in the page head leads to it. A filter shows only the findings that began with an update.

- **Scan every 6 hours:** The default for the automatic scan is 6 instead of 24 hours (adjustable; a value you set yourself stays). The history keeps one point per day.

- **Protecting the database:** Before deleting in the recorder, Housekeeper checks the database fully (also on request and after deleting) and reports damage as a finding and a repair hint, pointing to `REINDEX` and the backup (issue 12). Hints on databases set aside, little disk space and unclean shutdowns are added; plans wait for a calm recorder. Nothing is deleted by this.

- **Safer plans:** The backup before a plan is verified and named. Outdated previews are marked and can be renewed, large removals show a clear note, and too many Housekeeper backups are reported. An unreadable saved file only makes its own part start empty.

- **Export everywhere:** The recorder page has an export button (CSV, Markdown, JSON) for everything a tab shows. All lists now use the same export menu instead of the download icon.

- **Seven new color schemes:** Aurora, Honey, Lagoon, Emerald, Frost, Midnight and Olive, each in light and dark. The scheme tiles are smaller and "Readability" now sits on the right.

#### Changed

- **Update preflight only for before:** The manually saved starting state and the comparison afterwards are gone. The card checks the state before an update and says below what happens afterwards: the watch after updates takes over the time after.

- **Maintenance window removed:** The experimental maintenance window under Maintenance, off by default, is gone. If you had switched it on, its saved state is dropped. After an update, the watch shows what has failed since.

- **Interface:** Fixes and small improvements to lists, dialogs, labels and handling, an open panel that picks up scans from the background by itself (the overview used to show old numbers afterwards), among them the tiles of the findings page (in two rows on wide windows, all equally high and wide), the column picker of the lists (boxes in one line at the right edge), the threshold cards in Settings (grouped, uniformly built, with a “Default” link), the events for your own automations as a table with a copy button, the maintenance goals (only under Maintenance, no longer duplicated in Settings), the list of the latest backups (arrow next to the date, details aligned), the settings with four tabs instead of seven (Appearance, Scan and messages, Protection and exceptions, Info); saving the thresholds keeps the page open instead of jumping to the Home Assistant dashboard and the readability of incidents.

#### Fixed

- **Unredeemed confirmations:** Expired confirmations are now forgotten and no longer pile up in memory (issue 18).

- **A confirmation belongs to the administrator who gave it:** Another administrator can no longer redeem it, and the history always names the one who confirmed and started (issue 17).

- **Deleting statistics only through a plan:** An old command deleted orphaned statistics without a preview or confirmation. The panel no longer used it; it is removed (issue 16).

- **Backup check:** Backups of single apps, such as those made before an app update, no longer count as backups of Home Assistant.

## 1.7.0 - 2026-10-14

### Neu

- **Hausfunktionen:** Wichtige Funktionen des Hauses aus direkt gewählten Entitäten, Geräten, Automationen, Szenen, Skripten, Integrationen und Apps/Add-ons zusammenstellen. Die gemeinsame Objektsuche gruppiert Treffer nach Typ und schlägt bekannte Abhängigkeiten vor; nur ausdrücklich hinzugefügte Objekte werden überwacht. Für Entitäten lassen sich Aktualisierungsfrist, Mindestwert und eine Dauer für „nicht verfügbar“ festlegen. Der kompakte Editor hat eine mitwachsende Beschreibung, zeigt eine Vorschau der letzten Scanbewertung und lässt Funktionen vorübergehend deaktivieren. Die Seite unterscheidet belegte Defekte, Prüflücken, unauffällige und deaktivierte Funktionen; die Übersicht meldet aktive Probleme und nennt sonst die zuletzt beeinträchtigte Funktion. Zustandswechsel stehen als HA-Ereignis und Event-Entität bereit, jede Funktion hat einen Sensor, dessen Attribute auch letzten Defekt, Vorfälle, Ausfallminuten und Verfügbarkeit der letzten 30 Tage nennen. Dauerhafte HA-Mitteilungen sind pro Funktion einstellbar. Zugeordnete Objekte sind anklickbar, auch beim Anlegen und Bearbeiten. Jede Funktion hat einen Verlauf mit Zustandswechseln und Änderungen (mit Suche, Filter und Seiten, auch Pläne zu den Objekten; schnelles Hin und Her wird zu einer Zeile zusammengefasst) und zeigt die Verfügbarkeit der letzten 30 Tage mit Vorfällen und einem Feld je Tag; die Aufbewahrung (1 bis 365 Tage, Standard 30) gilt auch für den Scan-Verlauf und steht unter Einstellungen.

- **Vermerk mit Zeitfenster:** Ein Vermerk wie „Absichtlich offline“ gilt auf Wunsch nur zu festen Uhrzeiten oder bei Dunkelheit (Sonnenstand aus Home Assistant), mit einer Anlaufzeit danach (Standard 30 Minuten). Außerhalb des Fensters wird das Objekt wieder überwacht, zum Beispiel ein solarbetriebener Gartensensor tagsüber.

- **Beobachtung nach Updates:** Nach einem Update von Home Assistant oder einer Integration scannt Housekeeper einen Tag lang zusätzlich (30 Minuten, 2 und 6 Stunden danach und am Ende) und vergleicht mit dem Stand vor dem Neustart. Ein Band zeigt, solange es läuft, wie viele Objekte betroffen sind; die Karte auf der Befundseite nennt, was seither ausfiel, kurz gestört war oder wieder läuft, und sagt „unbekannt“, wenn ein Vergleich nicht möglich ist. Das ist ein zeitlicher Zusammenhang, keine Ursache. Dauer unter Einstellungen (0 schaltet aus).

- **Eigener Update-Status:** Unter Einstellungen, Info vergleicht Housekeeper seine tatsächlich geladene Version mit dem Stand von HACS. Die Karte erkennt ein verfügbares Update, abweichende oder fehlende HACS-Daten und besonders eine frühere Commit-Installation, bei der HACS den Wechsel auf Releases übersehen kann. Sie erklärt den passenden nächsten Schritt und öffnet das Housekeeper-Repository direkt in HACS; GitHub wird dafür nicht zusätzlich abgefragt.

- **Entitäten im Inventar gesammelt umschalten:** Die Entitätenzeilen des Inventars haben ein Kästchen. Die Leiste darüber deaktiviert, aktiviert, blendet aus oder ein, bis zu 200 Entitäten pro Plan, mit Vorschau und Rückgängig. Eine Entität, die etwas sicher benutzt, wird nicht deaktiviert; nur selbst Deaktiviertes wird wieder aktiviert.

### Behoben

- **Oberfläche:** Korrekturen und kleine Verbesserungen an Listen, Tabellen, Dialogen und der Bedienung: einheitlichere Listen und Tabellen auf allen Seiten (Suche, Sortierung, Filter, Seiten und CSV-Export, die ganze Zeile klickbar, kompakte Zeilen), Seitenauswahl im Inventar, ein Reiter „Aktionen“ mit festem Aufbau für alle Objekte (auch Apps), Pläne in einem Schritt bestätigen oder abbrechen, ein Menü „Exportieren“ im Inventar (Liste als CSV oder geführter Export), Spaltenauswahl mit Name links und Kästchen rechts, sauber ausgerichtete Aktionen sowie bessere Tastatur- und Screenreader-Unterstützung.

- **Speicher und System:** Die Messung der Ordner stoppt nach 20 Sekunden (etwa bei einer langsamen Netzfreigabe unter /config); die Seite nennt die Größen dann Mindestwerte.

- **Ausfälle:** Die Detailseite einer ausgefallenen Integration nennt, wie lange der Ausfall dauert und wann er schwerer wiegt.

- **Fehlender Blueprint:** Eine Automation oder ein Skript, dessen Blueprint nicht mehr existiert, wird als Befund gemeldet; fehlt er für mehrere, steht er als gemeinsame Ursache in der Liste. Die Blueprint-Seite zählt solche Pfade jetzt auch.

- **Scan von außen starten:** Neuer Dienst `ha_housekeeper.scan` (mit „Auf das Ende warten“ liefert er die Zahlen zurück) und ein Knopf „Scan starten“ für Dashboards. Mehrere Aufrufe ergeben einen Scan, kurz nach einem Scan startet keiner, und während eines Plans oder beim Start von Home Assistant wird abgelehnt.

### English

#### New

- **Home functions:** Group important functions of your home from directly selected entities, devices, automations, scenes, scripts, integrations and apps/add-ons. The shared object search groups results by type and suggests known dependencies; only explicitly added objects are monitored. Entities support update deadlines, minimum values and a grace period for unavailability. The compact editor has a description field that grows with its text, previews the latest scan evaluation and lets functions be temporarily disabled. The page distinguishes confirmed faults, check gaps, healthy and disabled functions; the overview highlights active problems and otherwise names the function impaired last. State changes are available as HA events and an event entity, with one sensor per function whose attributes also give the last fault, incidents, downtime minutes and availability of the last 30 days. Persistent HA notifications are configurable per function. Assigned objects are clickable, also while creating and editing. Each function has a history of state changes and edits (with search, filter and paging, also plans for the objects; quick back and forth is folded into one line) and shows the availability of the last 30 days with incidents and one square per day; the retention (1 to 365 days, default 30) also applies to the scan history and is set in Settings.

- **Mark with a time window:** A mark such as “Offline on purpose” can apply only at fixed hours or in the dark (position of the sun from Home Assistant), with a grace period after it (30 minutes by default). Outside the window the object is watched again, for example a solar-powered garden sensor by day.

- **Watch after updates:** After an update of Home Assistant or an integration, Housekeeper scans extra for a day (30 minutes, 2 and 6 hours later, and at the end) and compares with the state before the restart. A band shows how many objects are affected while it runs; the card on the findings page lists what failed since, was briefly disturbed or works again, and says "unknown" when no comparison is possible. This is a link in time, not a cause. The duration is in Settings (0 switches it off).

- **Own update status:** Under Settings, Info, Housekeeper compares the version actually loaded with the state stored by HACS. The card detects an available update, mismatching or missing HACS data and, in particular, an earlier commit installation for which HACS can miss the move to releases. It explains the appropriate next step and opens the Housekeeper repository directly in HACS; no additional GitHub request is made.

- **Switch entities in bulk from the inventory:** Entity rows of the Inventory have a checkbox. The bar above disables, enables, hides or shows them, up to 200 entities per plan, with a preview and undo. An entity that something certainly uses is not disabled; only what you disabled yourself is enabled again.

#### Fixed

- **Interface:** Corrections and small improvements to lists, tables, dialogs and handling: more consistent lists and tables on every page (search, sorting, filters, pages and CSV export, the whole row clickable, compact rows), page selection in the inventory, an Actions tab with a fixed layout for every object (apps too), confirming or cancelling plans in one step, an Export menu in the inventory (list as CSV or guided export), column pickers with the name left and the checkbox right, cleanly aligned actions and better keyboard and screen reader support.

- **Storage and system:** The folder measurement stops after 20 seconds (for example on a slow network share under /config); the page then calls the sizes minimums.

- **Outages:** The detail page of a failed integration says how long the outage has lasted and when it becomes more serious.

- **Missing blueprint:** An automation or script whose blueprint no longer exists is reported as a finding; when several lack it, it shows as a shared cause in the list. The blueprints page now counts such paths too.

- **Start a scan from outside:** New service `ha_housekeeper.scan` (with “Wait for the end” it returns the counts) and a “Start scan” button for dashboards. Several calls make one scan, none starts right after a scan, and it is refused during a plan or while Home Assistant starts.

## 1.6.0 - 2026-10-13

### Geändert

- **Aufklapp-Pfeile einheitlich:** Alle aufklappbaren Bereiche („Wie wird das gezählt?“, Dateigruppen, Details) haben denselben kleinen Pfeil, der nach rechts zeigt und sich beim Öffnen nach unten dreht, statt des groben Standard-Dreiecks.

- **Listenleiste ruhiger:** Die Suche ist 200 px breit, der Filter heißt „Schweregrad“ (Hoch, Mittel, Niedrig, Info, Keine) und die Sortierung zeigt ihre Richtung im Eintrag („Schweregrad ↓“). Gespeicherte Ansichten sind ein Stern-Knopf mit Auswahl, Löschen je Eintrag und „Ansicht speichern“. „Kompakte Zeilen“ wirkt jetzt auch in der Befundliste.

- **Ausfälle von Integrationen mit Schweregrad nach Dauer:** Eine nicht geladene Integration ist sofort ein Befund und wartet nicht mehr, bis die „Mindestdauer nicht verfügbar“ (Standard 7 Tage) vorbei ist. Die Dauer bestimmt die Auswirkung: unter 1 Stunde „Info“, ab 1 Stunde „Niedrig“, ab 1 Tag „Mittel“, ab der Mindestdauer „Hoch“. Neu ist die Stufe „Info“ (1 Punkt, höchstens 5); „Niedrig“ und „Mittel“ ziehen jetzt 2 und 3 Punkte statt 1 und 2 ab. Dadurch springt der Punktestand einmalig. In der Liste trägt jede Zeile ihre Auswirkung als Chip und ein „⋯“-Menü mit „Als bekannt markieren“, „Zurückstellen“, „Befund ausblenden“ (und „Löschen vorbereiten“, wo es passt); die breiten Knöpfe unter den Ausfällen und der Einzelknopf „Löschen vorbereiten“ entfallen. Im Detail stehen dieselben Aktionen jetzt auch bei Ausfällen. Die Zeile eines Ausfalls nennt nur noch, was betroffen ist und wie lange er dauert („seit 6 Std. · Mittel in 18 Std.“); Zustand und Fehlertext stehen im Detail. Jede Zeile hat zwei Chips: den Grund (grauer Umriss, zum Beispiel „Ausfall“, „Ungenutzt“) und die Auswirkung (farbig, Hoch rot bis Info grau); das Datum entfällt in der Zeile. Die Filter „Typ“ und „Auswirkung“ gelten jetzt auch für Ausfälle; neu ist der Filter „Grund“ (mit „Ausfall“ als eigener Kachel). Die Kachel „Housekeeping-Status“ der Befunde-Seite entfällt; ihr Verlauf („−27 in 2 Tagen“) steht in der Übersicht unter der Überschrift, der Link „Wie entsteht die Zahl?“ ist weg.

### Neu

- **Vollständige Prüfung nur noch als Hinweis:** Wurden alle Quellen gelesen, entfällt die Leiste „Prüfung“ in der Übersicht. Stattdessen steht „Prüfung vollständig“ in der Statusleiste unter dem Menü (ein Klick öffnet die Liste). Bei einer Lücke bleibt die gelbe Leiste.

- **Prüfung nennt nicht lesbare Dashboards:** Unter „Was zuletzt geprüft wurde“ steht bei Dashboards jetzt, welche nicht gelesen werden konnten und warum („Konfiguration ungültig“, „Konnte nicht geladen werden“). Ein Dashboard, das Home Assistant automatisch erzeugt und nie gespeichert wurde, gilt nicht mehr als Lücke. Jede gelesene Quelle nennt außerdem ihre Menge („412 Entitäten, 58 Geräte“).

- **Lücken in der Prüfung werden nachgeholt:** Konnte ein Scan eine Quelle nicht vollständig lesen (etwa Dashboards, weil Lovelace noch nicht bereit war), startet Housekeeper nach 5 Minuten einen neuen Scan, höchstens dreimal hintereinander. Die Leiste „Prüfung“ sagt dazu, dass es noch einmal versucht wird. Fehlt eine Komponente ganz, wird nicht wiederholt.

- **Vermerk für mehrere Objekte:** Die Auswahlleiste der Befunde hat den Knopf „Vermerk setzen“. Er setzt Art, Begründung und Prüffrist in einem Zug an allen angekreuzten Entitäten, Geräten, Integrationen und Apps; andere Objekte in der Auswahl (zum Beispiel Automationen) bleiben unberührt.

### Behoben

- **Backup vor dem Löschen ohne eingerichtete Backups:** Wer in Home Assistant noch keine automatischen Backups eingerichtet hat, musste dafür erst ein Backup-Ziel und einen Verschlüsselungsschlüssel anlegen. Housekeeper sichert jetzt in den lokalen Speicher von Home Assistant, ohne Passwort. Die Vorschau und der Backup-Schritt sagen, dass es lokal und unverschlüsselt liegt. Ein abgebrochener Plan nennt den Grund im roten Band („Es wurde nichts gelöscht und nichts geändert“).

- **„Szene fehlt“ bei Szenen, die eine Automation selbst anlegt:** Legt eine Automation oder ein Skript die Szene mit `scene.create` an, nennt der Befund das jetzt: Die Szene existiert erst nach dem ersten Lauf.

- **Richtlinien und andere Ansichten nach „Neu scannen“:** Die Liste der betroffenen Entitäten blieb nach einem neuen Scan auf dem alten Stand, bis man die Seite neu lud. Richtlinien, Freigaben, Automations-Qualität und Blueprints laden nach einem neuen Scan jetzt selbst neu (Issue #11).

- **Menü auf schmalen Fenstern:** Die geöffnete Menüliste ist höher als das Fenster, etwa bei großer Schrift, und scrollt jetzt, sodass auch die unteren Einträge erreichbar sind (Issue #10).

- **Sortierrichtung:** Bei gleichen Werten drehte der Pfeil „Aufsteigend/Absteigend“ die Reihenfolge nicht um; jetzt dreht er die ganze Liste.

- **Befunde:** Wer einen Status wie „Neu“ oder einen Filter wählte, sah die Ausfälle von Integrationen nicht, obwohl sie mitgezählt wurden. Sie stehen jetzt als eigene Zeilen in der Liste.

### English

#### Changed

- **Uniform expand arrows:** All collapsible sections ("How is this counted?", file groups, details) now share the same small chevron that points right and turns down when opened, instead of the coarse default triangle.

- **Calmer list bar:** The search is 200 px wide, the filter is called "Severity" (High, Medium, Low, Info, None) and the sort shows its direction in the entry ("Severity ↓"). Saved views are one star button with a pick list, delete per entry and "Save view". "Compact rows" now works in the findings list too.

- **Integration outages graded by duration:** An integration that is not loaded is a finding at once and no longer waits for “Minimum days unavailable” (default 7 days). How long it has lasted sets the impact: under 1 hour “Info”, from 1 hour “Low”, from 1 day “Medium”, from the minimum days “High”. “Info” is new (1 point, at most 5); “Low” and “Medium” now take off 2 and 3 points instead of 1 and 2, so the score jumps once. In the list every row carries its impact as a chip and a “⋯” menu with “Mark as known”, “Snooze”, “Hide finding” (and “Prepare deletion” where it fits); the wide buttons under outages and the single “Prepare deletion” button are gone. The detail page shows the same actions for outages now. The row of an outage only says what is affected and how long it has lasted (“for 6 h · Medium in 18 h”); state and error text are on the detail page. Each row has two chips: the reason (grey outline, for example “Outage”, “Unused”) and the impact (coloured, High red down to Info grey); the date is gone from the row. The filters “Type” and “Impact” now apply to outages too; there is a new filter “Reason” (with “Outage” as a tile of its own). The “Housekeeping status” tile of the Findings page is gone; its history (“−27 in 2 days”) sits under the headline of the overview, and the link “How is the number made?” is removed.

#### New

- **Gaps in the check are made up for:** If a scan could not read a source in full (dashboards, say, because Lovelace was not ready), Housekeeper starts a new scan after 5 minutes, at most three times in a row. The "Check" bar says that it will try again. A component that is missing altogether is not retried.

- **Mark for several objects:** The selection bar of the Findings page has a “Set a mark” button. It sets kind, reason and review date in one go on all ticked entities, devices, integrations and apps; other objects in the selection (for example automations) stay untouched.

#### Fixed

- **Backup before a deletion without set-up backups:** Anyone who had not set up automatic backups in Home Assistant first had to create a backup location and an encryption key. Housekeeper now saves to the local storage of Home Assistant, without a password. The preview and the backup step say that it is local and not encrypted. An aborted plan names the reason in the red band ("Nothing was deleted and nothing was changed").

- **"Scene missing" for scenes an automation creates itself:** If an automation or script creates the scene with `scene.create`, the finding now says so: the scene only exists after that action has run.

- **Policies and other views after “Scan now”:** The list of affected entities stayed at the old state after a new scan until the page was reloaded. Policies, exposure, automation quality and blueprints now load again by themselves after a new scan (issue #11).

- **Menu on narrow windows:** The open menu list is taller than the window, for example with large fonts, and now scrolls, so the lower entries can be reached (issue #10).

- **Sort direction:** With equal values the ascending/descending arrow did not reverse the order; it now reverses the whole list.

- **Findings:** Choosing a status such as “New” or a filter hid the outages of integrations although they were counted. They are rows of their own in the list now.

## 1.5.1 - 2026-10-12

### Geändert

- **Kompaktere Menüleiste:** Damit die Leiste oben schmaler wird und seltener in den „Menü“-Knopf wechseln muss, ist sie umgebaut: „Housekeeper“ mit dem Wort „Übersicht“ darunter ist jetzt der Weg zur Übersicht und ersetzt den Menüpunkt „Übersicht“, und die Einstellungen sind in der Leiste nur noch das Zahnrad (der Name steht als Tooltip und in der Liste des Menü-Knopfs). Das Suchfeld ist dafür etwas breiter.
- **Befunde als eine Liste:** Die Befunde-Seite hat keine getrennten Gruppen „Ausfälle“ und „Einzelne Befunde“ mehr. Jede Zeile ist ein Objekt mit seinem Typ; wer Folgen hat, trägt einen roten Zähler („12 Folgen“, darunter „erklärt 12 weitere Befunde“) und klappt seine Kette auf: App, Integration, Gerät, Entitäten, jeweils mit eigenem Zähler. Der Filter „Mit Folgen“ zeigt nur diese Einträge, „Flache Liste“ zeigt jeden Befund einzeln und nennt bei Folgen die Ursache („Folge von …“).
- **Übersicht „Was muss ich jetzt tun?“ in drei Bereichen:** **Befunde** zeigt die ersten fünf Einträge derselben Liste wie die Befunde-Seite (eine Kette als eine Zeile mit rotem Zähler, „Alle Befunde (n)“ führt zur Liste), **Zustand** Backup, Datenträger und veralteten Scan (dringende Punkte ziehen im Status ab) und **Wartung** Ziele, Erinnerungen und Quarantäne: nie dringend, eingeklappt mit Zahl, solange etwas anderes ansteht. Verfehlte Ziele stehen in Klartext („Schwache Batterien: jetzt 2 · erlaubt: keine“, Ziel verfehlt). Bereiche ohne Zeilen fehlen.
- **Reiter „Erledigt“:** „Zuletzt behoben“ heißt jetzt „Erledigt“ und zeigt Ereignisse statt Objekte, für 7, 30 oder 90 Tage: „Durch einen Plan behoben“ (mit Art der Änderung, Zahl der Objekte, Zeitpunkt und ob sie rückgängig zu machen ist) und „Von selbst beendet“. Dort stehen Befunde, die ohne Plan verschwanden: „Von selbst wieder in Ordnung“ zählt als erledigt, „Objekt entfernt“, „Quelle nicht gelesen“ und „Grund unbekannt“ nicht, denn dort ist nichts behoben. Die Zahl der Objekte eines Plans ist nicht mehr auf 300 begrenzt.
- **Status als Punktestand:** Der Housekeeping-Status ist jetzt ein Punktestand von 100. Jeder Eintrag der Befundliste nimmt je nach Auswirkung Punkte weg (hoch 5, mittel 2, niedrig 1, mit Obergrenze), dringende Zustandsthemen wie Backup oder ein fast voller Datenträger je 10; Folgen eines Ausfalls zählen nicht extra. Grün ab 90, gelb ab 70, darunter rot; ein Eintrag mit hoher Auswirkung färbt den Ring mindestens gelb. Die Zahl der Objekte mit Befund steht daneben, ein Klick auf den Ring zeigt die Rechnung. Der neue Wert ersetzt den alten ohne Übergang: Die Kurve der Übersicht macht an dieser Stelle einen Knick.
- **Speicher und Laufzeit:** Die Seite „Speicher & System“ liest die Ordnergrößen nicht mehr bei jedem Aufruf neu: ein Ergebnis wird bis zu 5 Minuten wiederverwendet, auch für mehrere Browser, und „Aktualisieren“ liest erst nach 30 Sekunden erneut. Die Seite zeigt, wann die Größen gemessen wurden. In Einstellungen, Info steht die Dauer des letzten Scans je Phase, die längste zuerst.
- **Detailseiten:** Was du über ein Objekt entschieden hast, steht jetzt in einem Band über den Reitern: ein als bekannt, zurückgestellt oder ausgeblendeter Befund mit Art, Frist und Grund (mit „Wieder aufnehmen“) und ein Vermerk (mit „Ändern“ und „Entfernen“). Die Karte „Bekannt über …“ nennt dieselbe Entscheidung statt „Der Befund ist ausgeblendet“.
- **Änderungen:** Der Verlauf der Scans zeigt zunächst nur die neuesten Zeilen, damit das Ergebnis des Vergleichs sichtbar bleibt; „Alle anzeigen“ öffnet die ganze Liste. Die Auswahl „Vergleichen mit“ sitzt im Kopf des Verlaufs, gespeicherte Scans tragen den Wochentag im Titel, und ein Satz erklärt den Balken.
- **Ende eines Befunds:** „Behobene Befunde“ zählt nur noch Befunde, deren Objekt weiter existiert. Verschwindet ein Befund, weil sein Objekt entfernt wurde, die Prüfung (zum Beispiel eines Dashboards oder der Apps) nicht lesen konnte oder sich eine Einstellung wie die Ausfalldauer geändert hat, steht er in einer eigenen Rubrik „Ohne Reparatur beendet“ mit dem Grund. Die Zahl „behoben“ kann dadurch kleiner ausfallen als bisher.
- **Kacheln der Unterseiten:** Aufräumen, Recorder und Apps & Integrationen zeigen unter der Beschreibung eine Zeile mit Hinweisen (zum Beispiel „2 mit Problem“, „9,5 GB“, „751 mit Statistik“). Die Kacheln sind dadurch gleich hoch und springen beim Laden nicht mehr; lange Beschreibungen enden mit „…“. In Aufräumen teilen sich die letzten zwei Kacheln die Zeile, und die Zahlenzeile von „Nicht verwendet“ ist in die Kachel gewandert.
- **Apps & Integrationen:** Die obere Kennzahlenreihe entfällt. Die drei Kacheln (Apps, Core, Custom) sind breiter, der Text bricht nicht mehr um, und sie tragen die Hinweise selbst: laufende Apps, belegter Platz, Updates und Integrationen mit Problem.
- **Bestand:** In der Ansicht „Nach Objekttyp“ hebt der Ring den Abschnitt hervor, über dem die Maus liegt oder dessen Tabellenzeile sie berührt; umgekehrt leuchtet die Zeile auf, wenn die Maus auf dem Ringabschnitt liegt.
- **Recorder, Datenbank:** „Fehlende Stunden in Statistiken“ ist verständlicher: ein kurzer Satz sagt, ob die Lücken alle Sensoren oder nur einzelne betreffen, darunter steht offen die Liste „Sensoren mit den meisten Lücken“ als sortierbare, durchsuchbare Tabelle wie die anderen Listen (Spalte „Gemeinsame“ nur, wenn es gemeinsame Lücken gibt).
- **Läufe:** Die Liste „Alle gezählten Läufe“ ist auf großen Bildschirmen besser lesbar: die Namensspalte ist schmaler, die Zahlen stehen näher am Namen.
- **Läufe:** Die Detailseite einer Automation oder eines Skripts zeigt den Verlauf der Läufe über 30 Tage statt 7 (die Zahlen und die Liste bleiben bei 7 Tagen).
- **Befunde:** Die Seite hat einen klareren Aufbau: ein Panel mit den Reitern Offen, Neu, Bekannt … und „Zuletzt behoben“ (statt eines Faltbereichs darüber). Suche und Filter stehen zuerst; im Reiter „Offen“ folgen zuerst die Ausfälle als aufklappbare Gruppe, dann die einzelnen Befunde. Die Auswahl-Knöpfe erscheinen erst nach dem ersten Markieren; vorher gibt es nur das Kästchen „Seite auswählen“.
- **Befunde:** Die Zahl der Befunde zählt jetzt jeden Ausfall einmal und jeden Befund ohne Ausfall dahinter („8 Ausfälle + 6 einzelne = 14“); die Folgebefunde der Ausfälle stehen als Unterzeile unter der Kachel „Alle“. Das gilt für die Zahl am Reiter, die Kachel „Offene Befunde“, den Link „Alle Befunde“ und die Befunde-Seite. Die Kacheln der Unterseiten (z. B. Komponenten) haben mehr Platz für den Text.
- **Recorder, Lauteste Entitäten:** Die Liste ist jetzt eine sortierbare Tabelle wie „Auffälligkeiten“ (Name, Einordnung, Zeilen, Zeilen pro Tag, ohne neuen Zustand, Attribute, lauteste Stunde) statt vierzeiliger Karten; auf dem Telefon wird sie zu Karten. Im Kopf der Auswahlspalte markiert ein Kästchen alle Zeilen der Seite (auch bei „Auffälligkeiten“ und in der Kostenliste).
- **Recorder:** Die Auswahlspalte der Tabellen („Auffälligkeiten“, Lauteste Entitäten) ist nur noch so breit wie das Kästchen; der Kopf zeigt ein Symbol statt des Worts „Auswahl“.
- **Übersicht:** Neue Karte „Backup-Schutz“ neben System und Datenbank: letztes Backup, letzter automatischer Lauf und Gesamtergebnis der Prüfungen, mit Link zu den Details.
- **Übersicht:** Hinweise, „Seit dem letzten Scan“ und der Inventarstatus stehen in einer dreispaltigen Zeile; darunter System und Datenbank.
- **Übersicht:** „Seit deinem letzten Besuch“ steht jetzt in der Fußzeile von „Was muss ich jetzt tun?“, rechts neben den Wartungszielen, und nicht mehr lose zwischen den Karten. Der Text hatte „vor“ doppelt („vor vor 41 Min.“).
- **Übersicht:** „Wichtigste Befunde“ ist in „Was muss ich jetzt tun?“ aufgegangen: die Zeile „Ausfälle“ klappt auf und zeigt die betroffenen Integrationen, „Einzelne Befunde“ steht als aufklappbarer Bereich unter „Bald“, und „Alle Befunde“ ist ein Link im Kopf der Karte.
- **Zugangsdaten:** Die Kachel „Felder mit Wert“ entfällt; die Zahl steht als Unterzeile unter „Integrationen mit Zugangsdaten“.
- **Recorder, Last:** Zeilen, Entitäten und Ereignisse stehen als drei beschriftete Kennzahlen statt in einem Satz; was nicht mitgezählt wird (ausgeblendet, deaktiviert, dauerhaft ausgefallen), steht als eigene Marken mit Erklärung darunter.
- **Reparieren:** Die Karte „Sensorfehler bereinigen“ hat jetzt ihren Titel wie die anderen, und die Titel der Karten tragen den Namen ihrer Kachel („Sensorfehler bereinigen“, „Zähler wechseln“).
- **Übersicht:** Drei Zonen statt zwei Spalten: oben Status und Aufgaben, in der Mitte „Wichtigste Befunde“ (höchstens fünf Zeilen) mit dem Inventarstatus darunter neben den Hinweisen, unten System, Datenbank und Vergleich als Zustandskarten. Die Karte „Nach Objekttyp“ entfällt (das Inventar zeigt die Typen). In der System-Karte steht der Wert jetzt rechts und der Balken darunter.
- **Inventar:** Statt der Kacheln zeigt ein Ring mit Tabelle die Objekttypen: die fünf größten, der Rest auf Knopfdruck. Eine Zeile filtert die Liste, ein zweiter Klick hebt den Filter auf; die Spalten „Nicht verfügbar“ und „Verwaist“ filtern nach Typ und Zustand zugleich.
- **Inventar:** Suche und die Filter Typ, Zustand und Herkunft stehen in einer Zeile; auf schmalen Bildschirmen brechen sie um.
- **Speicher:** Die Kacheln Speicher, Arbeitsspeicher, Prozessor und Swap zeigen eine Kurve der letzten Tage (ein Wert alle fünf Minuten, sieben Tage lang gehalten; beim Prozessor auch die Spitze). Eine Stunde nach der Installation erscheint die erste Kurve.
- **Speicher:** Die zwei Kacheln „Belegung“ und „Sonstiges“ sind weg; drei Chips (Nach Kategorie, Nach Ordner, Weitere) wählen die Liste, jede mit eigener Überschrift.
- **Start von Home Assistant:** Das Banner nennt den Schritt (Home Assistant lädt, Wartezeit mit Countdown, abschließender Scan mit Fortschritt) statt nur „startet noch“.
- **Blueprints und Detailseite:** Jede Blueprint-Art ist ein Bereich mit Zahl (offen nur, wenn es Funde gibt); auf der Detailseite einer Entität oder eines Geräts ist „Umbenennen und Bereich“ eingeklappt.
- **Übersicht:** „Braucht Aufmerksamkeit“ steht vor dem Zustand des Bestands.
- **Batterien in Reitern:** Die Liste steht allein, die Prognose und die Arten der Batterien sind eigene Reiter, sobald es etwas zu zeigen gibt.
- **Änderungen als Bereiche:** Jede Kategorie (Statuswechsel, neue und behobene Befunde, neue und entfernte Objekte) ist ein einklappbarer Bereich mit Zahl; die Kacheln oben öffnen genau diese Kategorie.
- **Ausfälle und Recorder-Kosten kürzer:** Bei vielen Ursachen lässt sich die Karte einklappen, und die Statistik unter den Recorder-Kosten ist ein eingeklappter Bereich mit Zahl.
- **Läufe ohne zweite Liste:** Die Befunde („nie erfolgreich“, „bricht ab“ …) stehen jetzt in der Tabelle unter dem Namen; die Kachel „Auffällig“ filtert sie. Die möglichen Konflikte stehen eingeklappt mit Zahl unter der Tabelle.
- **Kacheln erkennbar:** Eine Zahl ohne Klick ist flach, ein Filter trägt einen Trichter und ist markiert (mit Haken), solange er wirkt, ein Link auf eine andere Seite einen Pfeil. Ein zweiter Klick hebt jeden Filter wieder auf, die Liste kommt ins Bild, und über der Liste steht „Filter aktiv“ mit „Zurücksetzen“.
- **Reparieren wie Aufräumen:** Die Aufgaben stehen als kompakte Kacheln oben und bleiben beim Arbeiten stehen; ein Wechsel braucht kein „Zurück“ mehr. Der Hinweis zum bestätigten Plan sitzt auch hier hinter dem farbigen (i).
- **Kein Kopieren-Knopf mehr in den Listen:** Das Viereck beim Daraufzeigen verdeckte Namen und IDs; die ID lässt sich direkt markieren.
- **Automationen: Diagnose auf der Detailseite:** Die Spalte „Diagnose“ in der Übersicht entfällt; die Zeile öffnet die Detailseite, die einen Reiter „Diagnose“ hat (Blickwinkel, Erfolgskriterien, Verbessern, Ablaufverfolgung). Skripte zeigen dort ihre vier Blickwinkel.
- **Recorder-Kosten als Tabelle:** Die Einträge stehen in einer sortierbaren Liste mit Balken für den Anteil und Spalten für Gesamt, 24 Stunden, 7 Tage und Durchschnitt pro Tag; klickbare Kacheln (Alle, Vorschläge, Ausgeschlossen, Nicht verwendet), Filter und CSV-Export.
- **Schutzmodus startet schreibgeschützt:** Eine neue Installation beginnt im Modus „nur lesen“; Änderungen schaltest du unter Einstellungen → Sicherheit bewusst frei. Bestehende Installationen behalten „voll“.
- **Zuverlässigkeit: Setup-Fehler:** Die Integrationen-Tabelle hat eine sortierbare Spalte „Setup-Fehler“ und eine Kachel dazu; die Detailseite nennt einen möglichen Grund (Gerät offline, Zugang, zu früher Start, Neustart nötig).
- **Zuverlässigkeit als Tabellen:** Integrationen und instabile Entitäten stehen in sortierbaren Listen (Verfügbarkeit, Ausfälle, längster Ausfall, letzte Störung, Veränderung; Episoden, pro Tag, Dauer, Muster) mit klickbaren Kacheln, Filtern und CSV-Export.
- **Recorder: Auffälligkeiten als Tabelle:** Die Auffälligkeiten stehen in einer sortierbaren Liste (Zeilen pro Tag, lauteste Stunde, Anteil ohne neuen Zustand) mit klickbaren Kacheln und Filtern; ein Klick auf die Zeile öffnet die Details, mehrere Entitäten lassen sich per Checkbox für den Ausschluss auswählen.
- **Automationen: neue Übersicht:** Der Reiter „Übersicht“ (vorher „Qualität“) listet alle Automationen mit Status, Läufen, Fehlern und den sieben Blickwinkeln, auch deaktivierte und nie gelaufene. Die Liste hat Suche, Filter, Sortierung nach jeder Spalte, Seitenumbruch und CSV-Export; die Zeile öffnet die Detailseite. Die Kacheln oben sind klickbar und filtern, ebenso die Kacheln unter „Läufe“.
- **Ruhigere Seitenköpfe:** Speicher & System, Zugriffe & Datenfluss, Zugangsdaten, Zuverlässigkeit, Freigaben, Richtlinien, Läufe, Recorder und Wartung zeigen den Untertitel unter dem Titel und eine schmale Zeile mit „Stand“ und „Aktualisieren“; die Reiterkacheln sind flacher.

### Neu

- **Eigene Batterietypen:** Ein Typ, den du bei einem Sensor eintippst, bleibt gespeichert und steht bei allen Sensoren in der Auswahl. Unter der Batterieliste lassen sich eigene Typen hinzufügen, umbenennen und löschen; eingebaute und genutzte Typen bleiben. Die Einkaufsliste zählt sie wie bisher mit.
- **Ausfälle als Kette:** Eine gestoppte App, die Integration, die an ihr hängt, ein Gerät dieser Integration und dessen Entitäten bilden jetzt eine Kette: die Ursache steht oben und trägt die Folgen. Ein Gerät, dessen Entitäten alle nicht verfügbar sind (mindestens drei), ist ein eigener Befund „Gerät ganz ausgefallen“ und lässt sich wie eine Integration als bekannt, zurückgestellt oder ausgeblendet markieren. Eine fehlende Entität, ein fehlendes Gerät oder ein fehlender Bereich, auf den mindestens zwei Automationen, Skripte oder Dashboards verweisen, steht wie ein fehlender Dienst als eine Ursache.
- **Suche nach Seiten und Filtern:** Die Suche oben findet jetzt auch Seiten (auch die Reiter der Einstellungen, auf Deutsch und Englisch, mit Stichwörtern wie „Backup“ oder „dunkel“) und Filter („Befunde: Bekannt“, „Bestand: Nicht verfügbar“ mit der Zahl dahinter) vor den Objekten; Pfeiltasten und Enter gelten über alle Treffer.
- **Prüfabdeckung:** Housekeeper zeigt jetzt, welche Quellen der letzte Scan gelesen hat: eine Zeile in der Übersicht („Prüfung: 5 von 6 Quellen“, gelb mit den Namen, wenn etwas fehlt) und eine Liste in Einstellungen, Info mit Zustand und Grund je Quelle (Register, Automationen, Dashboards, Energie-Dashboard, Apps, Langzeitstatistik, Datenbank). Der Scan-Zustandssensor nennt die nicht gelesenen Quellen. Objekte einer Quelle, die ein Scan nicht lesen konnte, zählen im Vergleich weder als neu noch als entfernt; ein beendeter Befund nennt die nicht gelesene Quelle.
- **Gespeicherte Ansichten:** Auch eine reine Sortierung (Spalte oder Richtung) lässt sich jetzt als Ansicht speichern. Der Knopf erscheint, sobald sich Suche, Filter oder Sortierung von der Standardliste unterscheiden, bei gewählter Ansicht nur, wenn sich etwas gegenüber dieser Ansicht geändert hat.
- **Einstellungen, Info:** „Was Housekeeper speichert“ listet jetzt alle eigenen Dateien mit Zweck, Größe und letzter Änderung, in Gruppen und mit der Gesamtgröße. Es werden nur Art und Größe gezeigt, nie Inhalte.
- **Scan-Zustand:** Schlägt ein Scan fehl oder bleibt er lange aus, zeigt das Panel ein Band mit der Phase und dem letzten erfolgreichen Scan; die Zahlen stammen dann von einem älteren Stand. Ein neuer Diagnose-Sensor „Scan-Zustand“ (in Ordnung, veraltet, fehlgeschlagen, vorläufig) steht für Dashboards und Automationen bereit, und bei anhaltendem Problem erscheint ein Reparaturhinweis.
- **Skripte als eigener Reiter:** Unter „Automationen“ listet der Reiter „Skripte“ alle Skripte mit Läufen, Fehlern, vier Blickwinkeln und der Spalte „Aufgerufen von“ (Automationen und Skripte, die das Skript nutzen); Skripte ohne Aufrufer sind schnell zu finden.
- **Helfer im Inventar:** Der Typfilter hat die Auswahl „Helfer“ (Helfer mit Eintrag und Helfer-Entitäten) mit den Spalten „Verwendet von“ und „Zuletzt geändert“ und einer Auswahl für vermutlich ungenutzte Helfer; Schimmelindikator und Bayes-Sensor werden auf fehlende Quellen geprüft.
- **Risikostufe mit Begründung:** Bei Zugriffe & Datenfluss sagt eine Legende, was Hoch, Mittel und Niedrig bedeuten; die Stufe nennt beim Daraufzeigen den Grund, und die Detailseite einer Integration schreibt ihn aus.
- **Custom Cards mit Status:** Die Liste der Dashboard-Ressourcen zeigt, ob die Datei fehlt, ob ein Dashboard die Karte nutzt oder ob das nicht zu erkennen ist.
- **Speicher & System** (Betrieb): Belegung von Datenträger, RAM und CPU und ein Reiter „Belegung“ mit Umschalter zwischen Kategorie und Ordnern unter `/config`. Apps und Custom-Integrationen stehen unter „Apps & Integrationen“.
- **Zugriffe & Datenfluss** (Sicherheit): Systemzugriffe und Cloud-Datenfluss der Integrationen mit Risikostufe, mit Supervisor auch die Rechte der Apps.
- **Zugangsdaten** (Sicherheit): welche Integrationen Passwörter, Tokens oder Schlüssel gespeichert haben und ob ein Wert hinterlegt ist. Werte zeigt Housekeeper nie.
- **Ausfälle statt drei Listen:** Eine Integration mit Problem steht jetzt auch ohne auffällige Entitäten unter „Befunde“ (Block „Ausfälle“). Auf der Übersicht gibt es dafür eine Zeile, „Benötigt Aufmerksamkeit“ heißt „Wichtigste Befunde“ (Ausfälle zuerst), die Karte „Integrationen mit Problemen“ entfällt.
- **Menü neu geordnet:** Neue Gruppe „Sicherheit“ (Freigaben, Zugriffe & Datenfluss, Zugangsdaten). Speicher & System steht unter Betrieb. Aufräumen, Reparieren und Journal bilden die Gruppe „Bereinigen“, „Erkunden“ heißt „Bestand“ (Inventar, Abhängigkeiten, Änderungen). Die Leiste hat damit sieben Einträge.
- **Übersicht zeigt das System:** Neue Karte „System“ mit Datenträger, Speicher und Prozessor. Ab 75 % belegtem Datenträger steht eine Aufgabe in der Liste, ab 90 % eine dringende.
- **Reiter „Zugriffe & Daten“** auf der Detailseite einer Integration: Systemzugriff, Datenfluss und Zugangsdaten (nie ein Wert); bei hohem Systemzugriff eine rote Zeile in der Übersicht.
- **Apps als Objekte:** Mit Supervisor stehen installierte Apps im Inventar (Status, Version, Update) und haben eine Detailseite mit Rechten, Last und Speicher. Keine Befunde, keine Änderungen an Apps.
- **Apps und Integrationen:** Hängt eine Integration vermutlich an einer App (Hostname in der Konfiguration), zeigt die App den Reiter „Beziehungen“. Die Zuordnung ist immer „vermutet“.
- **Befund „App gestoppt“:** Ist eine App gestoppt und fällt eine Integration aus, die vermutlich daran hängt, meldet Housekeeper das.
- **Befund „Integration nicht geladen“:** Ein aktiver Eintrag, der länger als eine Stunde nicht geladen ist, steht jetzt in den Befunden, mit der Ursache von Home Assistant.
- **Vermerke für Integrationen und Apps:** „Absichtlich offline“, „Saisonal“ und „Reservegerät“ blenden die Ausfall-Befunde aus.
- **Ausfälle:** Die Karte „Ausfälle“ bietet „Bekannt“, „Zurückstellen“ und „Ausblenden“ für nicht geladene Integrationen; ein Befund steht nicht mehr doppelt in der Liste.
- **Zahlen im Menü:** Wartung (verfehlte Ziele) und Richtlinien (Verstöße) zeigen eine Zahl; Bestand nicht mehr.
- **Blockierte Automationen:** Eine Automation, deren Auslöser alle auf ausgefallene Entitäten zeigen, wird als Befund gemeldet.
- **Fehlende Dienste:** Automationen und Skripte, die einen Dienst aufrufen, den es nicht mehr gibt, werden als Befund gemeldet; rufen mehrere denselben auf, steht er als eine Ursache in den Ausfällen.
- **Fehlende Tags:** Eine Automation, die auf einen Tag (NFC/QR) wartet, den es nicht mehr gibt, wird als Befund gemeldet.
- **Richtlinien für den Zugang:** Drei neue Regeln (aus) weisen auf eine Anmeldung ohne Passwort für ein öffentliches Netz (`trusted_networks`), eine externe URL mit `http://` und vertrauenswürdige Proxys mit öffentlichem Netz hin. Normale private Netze werden nicht gemeldet.
- **Richtlinien für Benutzer:** Drei neue Regeln (aus): Benutzer, die sich lange nicht oder nie angemeldet haben, alte Langzeit-Tokens (nur das Alter, denn Home Assistant merkt sich die Nutzung nicht) und Langzeit-Tokens abgeschalteter Konten. Nie ein Token-Wert.
- **Richtlinie für Companion-App-Geräte:** Neue Regel (aus): ein Handy mit der Companion App, von dem seit mindestens 30 Tagen kein beobachteter Sensor etwas gemeldet hat, meist ein altes Handy mit stehengebliebenem Eintrag.
- **Richtlinien für HACS:** Zwei neue Regeln (aus): eine über HACS installierte Integration, deren GitHub-Repository archiviert ist, und eine mit wartendem Update, das eine neuere Home-Assistant-Version braucht. Die Integrationsseite zeigt beides am HACS-Kasten.
- **Fehler aus dem Log:** Bei einer nicht geladenen Integration und bei ausgefallenen Entitäten steht jetzt, wie oft Home Assistant für die Integration einen Fehler oder eine Warnung ins Log geschrieben hat und wann zuletzt. Nur Zahlen und Zeiten, nie der Text.
- **Verweise ersetzen prüft Automationen:** Home Assistant muss die geänderte Automation annehmen und nach dem Neuladen laden, sonst bleibt die Datei unverändert.
- **Automationen ohne Wirkung:** Befunde für Automationen und Skripte, deren Aktionen alle auf ausgefallene Entitäten zielen, und für Bedingungen, die nie wahr werden. Eine blockierte Automation lässt sich per Plan ausschalten.
- **Webhooks:** Zugriffe & Datenfluss zeigt, welche Automationen ein Webhook starten kann und ob er auch von außen erreichbar ist.
- **Vorher/nachher:** Der Reiter „Läufe“ vergleicht Fehler vor und nach einer Änderung der Konfiguration.
- **Seitenleisten-Knopf:** öffnet die Seitenleiste von Home Assistant, wenn sie ausgeblendet ist.
- **Apps & Integrationen** (Bestand): Apps (mit CPU, RAM und Daten) sowie Core- und Custom-Integrationen in eigenen Reitern, mit Version, Status, Entitäten und Geräten; der belegte Speicher der Apps und der Custom-Integrationen steht summiert in Kachel und Reiter. Im Inventar gibt es dazu einen Filter „Core / Custom“.
- **Seite einer Integration:** Core und Custom haben eine eigene Detailseite mit allen Einträgen, Entitäten und Geräten, Zuverlässigkeit sowie Zugriffen und Daten; bei Custom auch Ordner und Größe.
- **HACS-Updates:** Bei Custom-Integrationen, die HACS installiert hat, zeigen die Seite der Integration und die Liste „Apps & Integrationen“ die installierte und die neueste Version samt Hinweis auf ein Update; die Liste lässt sich danach filtern. Bei Apps zeigt die Liste die neueste Version, eine Kachel „App-Updates“ und einen Filter „Update verfügbar“.
- **Sonstiges** (Speicher & System): Custom Cards, Blueprints und die übrigen Ordner und Dateien unter `/config` stehen in einem Reiter.

### Behoben

- **Befunde:** Ausfälle (Integration, Gerät, App) lassen sich in der Liste wieder ankreuzen, um sie gesammelt auszublenden, als bekannt zu markieren oder zurückzustellen.
- **Abhängigkeiten:** Dieselbe Entität, die eine Automation an vielen Stellen nennt, steht nur noch einmal in der Liste („12 Stellen“, die Orte beim Darüberfahren). Objekte ohne eigenen Eintrag im Inventar (zum Beispiel `sun.sun`) zeigen „Nicht im Inventar“ statt „Fehlt“; „Fehlt“ steht nur noch, wo ein Befund es belegt.
- **Defekte Referenzen:** „Label ergänzen“ erscheint dort nicht mehr (Reiter „Aktionen“, Sammelleiste der Befunde). Die Ursache ist ein Satz: „Automation X verweist auf Y, das es nicht mehr gibt.“
- **Befunde:** Über dem Titel stand die Überschrift „Aktionen“, ein Rest der Menügruppe, die nur noch aus „Befunde“ besteht. Sie entfällt, ebenso als Pfad in der Suche.
- **Menüleiste:** Auf Fenstern, die für alle Menüpunkte zu schmal sind (etwa zwischen 860 und 1400 Pixeln), wurde die Leiste rechts abgeschnitten. Sie wechselt jetzt in den „Menü“-Knopf mit einer Liste darunter, sobald sie nicht passt, und zeigt wieder die volle Leiste, wenn der Platz reicht.
- **Scan-Verlauf:** „Je Tag der letzte Scan“ zählt den Tag jetzt in der Zeit von Home Assistant statt in UTC. Vorher konnten zwei Scans desselben Tages nebeneinander stehen und ein anderer Tag fehlen; bereits gespeicherte Doppel verschwinden beim Laden.
- **Sammelaktionen bei Befunden:** Scheitert eine Anfrage mitten in einer Auswahl, bleiben die fehlgeschlagenen Befunde ausgewählt und das Formular offen; die Meldung nennt „x von y erledigt“. Ein neuer Versuch sendet nur die übrigen.
- **Gespeicherte Ansichten:** Ist die Grenze von zehn Ansichten erreicht, überschreibt eine neue Ansicht nicht mehr still die letzte, sondern weist darauf hin.
- **Darstellung:** Gesperrte Knöpfe drehen ihr Symbol nur noch bei laufender Arbeit, nicht mehr bei fehlender Auswahl; Grün und Gelb folgen überall dem Theme; die Tabellen „Nach Objekttyp“ und Backups tragen auf dem Handy ihre Spaltenbezeichnungen.
- **Übersicht:** „Schwache Batterien: Ziel verfehlt“ führt jetzt zu „Pflegen → Batterien“ statt zum Inventar.
- **Recorder aufräumen:** Statistiken löschen und Verlauf kürzen laufen für jede Entität einzeln: Scheitert eine, laufen die übrigen weiter und der Grund steht bei der betroffenen. Vorher stoppte der Lauf nach dem ersten Fehler. Bei einem gemeinsamen Problem (Recorder beschäftigt oder nicht verfügbar) stoppt er weiter.
- **Verweise ersetzen, Umbenennen:** Betreffen mehrere Schritte eines Plans dieselbe Automation oder dieselbe Quelle, brach der Lauf nach dem ersten Schritt mit „Eine Konfiguration wurde nach der Vorschau geändert“ ab. Die eigenen Änderungen früherer Schritte zählen jetzt nicht mehr als fremde Änderung.
- **Kacheln der Unterseiten:** Das Symbol sitzt jetzt mittig in der Kachel und hat mehr Abstand zum Text.
- **Webhooks:** Hat eine Automation mehrere Webhook-Auslöser, gilt sie als offen, sobald einer von außen erreichbar ist (vorher zählte nur der erste). Deaktivierte Automationen sind gekennzeichnet und zählen nicht als offen.
- **Pläne:** Ein einzelner fehlgeschlagener Statusabruf beendet die Fortschrittsanzeige nicht mehr; sie versucht es erneut und weist darauf hin. Ein fehlgeschlagener Abbruch meldet das jetzt.
- **Reparaturhinweise:** Nur nicht verfügbare, verwaiste und defekte Verweise lösen noch einen Hinweis aus; andere Befunde (zum Beispiel eine nicht geladene Integration) erscheinen nicht mehr unter „nicht verfügbare Entitäten“.
- **Läufe: Klick auf „Fehler“:** Die Karte oben zeigte „Keine Treffer“, obwohl die Tabelle darunter die Automationen mit Fehlern auflistete; die leere Meldung entfällt jetzt.
- Unter einem Ausfall zeigte die Karte „Ausfälle“ höchstens 20 Folgebefunde, auch wenn die Zahl mehr nannte. Jetzt gibt es Seiten.

### English

#### Changed

- **More compact menu bar:** So the bar at the top gets narrower and has to switch to the “Menu” button less often, it was rebuilt: “Housekeeper” with the word “Overview” below it is now the way to the overview and replaces the “Overview” menu item, and Settings is only the gear in the bar (the name shows as a tooltip and in the list of the menu button). The search field is a little wider for that.
- **Findings as one list:** The Findings page no longer has the separate groups “Outages” and “Single findings”. Every row is an object with its type; one with follow-ups carries a red counter (“12 follow-ups”, below it “explains 12 more findings”) and opens its chain: app, integration, device, entities, each with its own counter. The filter “With follow-ups” shows only those entries, “Flat list” shows every finding on its own and names the cause (“Follow-up of …”).
- **Overview “What do I have to do now?” in three areas:** **Findings** shows the first five entries of the same list as the Findings page (a chain is one row with a red counter, “All findings (n)” leads to the list), **State** shows backup, disk and an outdated scan (urgent ones take points off the status) and **Maintenance** shows goals, reminders and quarantine: never urgent, folded with a count while something else needs attention. Missed goals read in plain text (“Weak batteries: now 2 · allowed: none”, goal missed). Areas without rows are left out.
- **“Done” tab:** “Fixed lately” is now “Done” and shows events instead of objects, for 7, 30 or 90 days: “Fixed by a plan” (with the kind of change, the number of objects, the time and whether it can be undone) and “Ended by itself”. The latter holds findings that vanished without a plan: “Back in order by itself” counts as done, “Object removed”, “Source not read” and “Reason unknown” do not, because nothing was fixed there. The number of objects of a plan is no longer capped at 300.
- **Status as a score:** The Housekeeping status is now a score out of 100. Every entry of the findings list takes points off by its impact (high 5, medium 2, low 1, each capped), urgent state topics such as the backup or a nearly full disk take 10 each; follow-ups of an outage do not count extra. Green from 90, yellow from 70, red below; an entry with high impact turns the ring at least yellow. The number of objects with a finding is shown beside it, and a click on the ring shows the calculation. The new value replaces the old one without a transition: the curve in the overview has a kink at this point.
- **Storage and runtime:** The "Storage & system" page no longer reads the folder sizes on every visit: a result is reused for up to 5 minutes, also across browsers, and "Refresh" reads again only after 30 seconds. The page shows when the sizes were measured. Settings, Info lists the duration of the last scan per phase, the longest first.
- **Detail pages:** What you decided about an object now shows in a band above the tabs: a finding marked as known, snoozed or hidden with kind, date and reason (with "Take back") and a mark (with "Change" and "Remove"). The card "Known about …" names the same decision instead of "The finding is hidden".
- **Changes:** The scan history first shows only the newest rows so the result of the comparison stays visible; "Show all" opens the whole list. The "Compare with" choice sits in the head of the history, stored scans carry the weekday in their title, and a sentence explains the bar.
- **End of a finding:** "Resolved findings" now counts only findings whose object still exists. A finding that disappears because its object was removed, the check (for example of a dashboard or the apps) could not read it, or a setting such as the outage duration changed is listed under "Ended without a repair" with the reason. The "resolved" number can therefore be smaller than before.
- **Recorder, load:** Rows, entities and events are three labelled figures instead of one sentence; what is not counted (hidden, disabled, down all the time) shows as marks of its own with an explanation.
- **Repair:** The “Repair sensor errors” card now has its title like the others, and the card titles carry the name of their tile (“Repair sensor errors”, “Replace a meter”).
- **Overview:** Three zones instead of two columns: status and tasks on top, “Top findings” (five rows at most) with the inventory status below it beside the notes in the middle, and system, database and comparison as state cards at the bottom. The “By object type” card is gone (the inventory shows the types). In the System card the value now sits on the right and the bar below it.
- **Inventory:** A ring with a table replaces the tiles and shows the object types: the five largest, the rest on request. A row filters the list and a second click lifts the filter; the unavailable and orphaned columns filter by type and state together.
- **Inventory:** The search and the type, state and origin filters sit in one row; on narrow screens they wrap.
- **Storage:** The disk, memory, CPU and swap tiles show a line of the last days (one value every five minutes, kept for seven days; the CPU also shows its peak). The first line appears an hour after installing.
- **Storage:** The two tiles “Usage” and “Other” are gone; three chips (By category, By folder, More) pick the list, each with its own heading.
- **Home Assistant start:** The banner names the step (Home Assistant loading, waiting time with a countdown, final scan with progress) instead of just “still starting”.
- **Blueprints and detail page:** Each blueprint kind is a section with its number (open only when there are findings); on the detail page of an entity or device "Rename and area" is folded.
- **Overview:** "Needs attention" comes before the state of the inventory.
- **Batteries in tabs:** The list stands alone; the forecast and the kinds of batteries are tabs of their own as soon as there is something to show.
- **Changes as sections:** Each category (status changes, new and resolved findings, new and removed objects) is a foldable section with its number; the tiles above open exactly that category.
- **Outages and recorder costs shorter:** With many causes the card can be folded, and the statistics under the recorder costs are a folded section with its number.
- **Runs without a second list:** The findings ("never succeeded", "fails" …) are shown in the table under the name; the "Flagged" tile filters them. The possible conflicts sit folded with their number under the table.
- **Recognisable tiles:** A number without a click is flat, a filter has a funnel and is marked (with a check) while it is on, a link to another page has an arrow. A second click lifts every filter, the list comes into view, and above the list "Filter on" with "Reset" says what is filtered.
- **Repair like cleanup:** The tasks are compact tiles on top and stay there while working; changing the task no longer needs "Back". The note about the confirmed plan sits behind the coloured (i) here too.
- **No copy button in the lists any more:** The square shown on hover covered names and IDs; the ID can be selected directly.
- **Automations: diagnosis on the detail page:** The "Diagnosis" column of the overview is gone; the row opens the detail page, which has a "Diagnosis" tab (views, success criteria, improve, trace tools). Scripts show their four views there.
- **Recorder costs as a table:** The entries are a sortable list with a bar for the share and columns for total, 24 hours, 7 days and average per day; clickable tiles (All, Suggestions, Excluded, Not used), filters and CSV export.
- **Protection mode starts read-only:** A new install begins in "read only"; you release changes on purpose under Settings → Security. Existing installs keep "full".
- **Reliability: setup failures:** The integrations table has a sortable "Setup failures" column and a tile for it; the detail page names a possible cause (device offline, access, starting too early, restart needed).
- **Reliability as tables:** Integrations and unstable entities are sortable lists (availability, outages, longest outage, last disruption, change; episodes, per day, duration, pattern) with clickable tiles, filters and CSV export.
- **Recorder: findings as a table:** The findings are a sortable list (rows per day, loudest hour, share without a new state) with clickable tiles and filters; clicking a row opens the details, and several entities can be ticked for exclusion.
- **Automations: new overview:** The "Overview" tab (formerly "Quality") lists every automation with state, runs, errors and the seven views, including disabled ones and ones that never ran. The list has search, filters, sorting by any column, paging and CSV export; a row opens the detail page. The tiles above are clickable and filter, and so are the tiles under "Runs".
- **Calmer page headers:** Storage & system, Access & data flow, Credentials, Reliability, Exposure, Policies, Runs, Recorder and Maintenance show the subtitle under the title and a slim line with "As of" and "Refresh"; the tab tiles are flatter.

#### New

- **Own battery types:** A type you enter for one sensor stays saved and is offered for every sensor. Below the battery list you can add, rename and delete own types; built-in and used types stay. The shopping list counts them as before.
- **Outages as a chain:** A stopped app, the integration that depends on it, a device of that integration and its entities now form a chain: the cause stands on top and carries the follow-ups. A device whose entities are all unavailable (at least three) is a finding of its own, “Device is down completely”, and can be marked as known, snoozed or hidden like an integration. A missing entity, device or area that at least two automations, scripts or dashboards point to stands as one cause, like a missing service. The Findings page still shows this as a flat list; the presentation follows.
- **Search for pages and filters:** The search at the top now also finds pages (including the tabs of Settings, in German and English, with keywords such as “backup” or “dark”) and filters (“Findings: Known”, “Inventory: Unavailable” with the count) ahead of the objects; arrow keys and Enter work across all hits.
- **Check coverage:** Housekeeper now shows which sources the last scan read: a line in the overview ("Check: 5 of 6 sources", yellow with the names when something is missing) and a list in Settings, Info with the state and reason per source (registry, automations, dashboards, Energy dashboard, apps, long-term statistics, database). The scan health sensor names the sources that were not read. Objects of a source a scan could not read count neither as new nor as removed in the comparison; an ended finding names the source that was not read.
- **Saved views:** A sort alone (column or direction) can now be saved as a view. The button appears as soon as the search, a filter or the sort differs from the default list, and with a view chosen only when something differs from that view.
- **Settings, Info:** "What Housekeeper stores" now lists all of its own files with purpose, size and last change, in groups and with the total size. Only kind and size are shown, never contents.
- **Scan health:** If a scan fails or does not run for a long time, the panel shows a banner with the phase and the last successful scan; the numbers then come from an older state. A new diagnostic sensor "Scan health" (OK, outdated, failed, preliminary) is available for dashboards and automations, and a lasting problem raises a repairs hint.
- **Scripts in a tab of their own:** Under "Automations" the "Scripts" tab lists every script with runs, errors, four views and a "Called by" column (the automations and scripts that use the script), so scripts nobody calls are easy to find.
- **Helpers in the inventory:** The type filter has a "Helpers" choice (helpers with a config entry and helper entities) with the columns "Used by" and "Last changed" and a choice for helpers that are probably unused; mold indicator and Bayesian sensor are checked for missing sources.
- **Risk level with a reason:** In Access & data flow a legend explains what High, Medium and Low mean; pointing at a level shows the reason, and the detail page of an integration spells it out.
- **Custom cards with a status:** The list of dashboard resources shows whether the file is missing, whether a dashboard uses the card, or that this cannot be told.
- **Storage & system** (Operation): disk, RAM and CPU use and a "Usage" tab that switches between category and folders under `/config`. Apps and custom integrations are under "Apps & integrations".
- **Access & data flow** (Security): system access and cloud data flow of the integrations with a risk level, with a Supervisor also the rights of the apps.
- **Credentials** (Security): which integrations store passwords, tokens or keys and whether a value is set. Housekeeper never shows the values.
- **Outages instead of three lists:** An integration with a problem now appears under "Findings" even when no entity is flagged (block "Outages"). The overview has one row for it, "Needs attention" is now "Most important findings" (outages first), and the card "Integrations with problems" is gone.
- **Menu reordered:** New group "Security" (Exposure, Access & data flow, Credentials). Storage & system is under Operation. Clean up, Repair and Journal form the group "Clean up", "Explore" is now "Catalog" (Inventory, Dependencies, Changes). The bar has seven entries.
- **Overview shows the system:** a new "System" card with disk, memory and processor. A task appears once the disk is 75 % full, an urgent one at 90 %.
- **Tab "Access & data"** on the detail page of an integration: system access, data flow and credentials (never a value); a red line in its overview for a high system access.
- **Apps as objects:** With a Supervisor, installed apps are in the inventory (status, version, update) and have a detail page with rights, load and storage. No findings, no changes to apps.
- **Apps and integrations:** If an integration probably depends on an app (host name in its configuration), the app shows the tab "Relations". The match is always "probable".
- **Finding "App stopped":** If an app is stopped and an integration that probably depends on it fails, Housekeeper reports it.
- **Finding "Integration not loaded":** An active entry that has not been loaded for more than an hour now appears in the findings, with the cause from Home Assistant.
- **Marks for integrations and apps:** "Offline on purpose", "Seasonal" and "Spare device" hide the outage findings.
- **Outages:** The "Outages" card offers "Mark as known", "Snooze" and "Hide" for integrations that are not loaded; a finding no longer appears twice in the list.
- **Numbers in the menu:** Maintenance (missed goals) and Policies (violations) show a number; Inventory no longer does.
- **Blocked automations:** An automation whose triggers all point to failed entities is reported as a finding.
- **Missing services:** Automations and scripts that call a service that no longer exists are reported as a finding; if several call the same one, it appears as one cause in the outages.
- **Missing tags:** An automation that waits for a tag (NFC/QR) that no longer exists is reported as a finding.
- **Access policies:** Three new rules (off) point out a login without password for a public network (`trusted_networks`), an external URL with `http://` and trusted proxies with a public network. Ordinary private networks are not reported.
- **User policies:** Three new rules (off): users who have not logged in for a long time or never, old long-lived tokens (the age only, because Home Assistant does not record their use) and long-lived tokens of switched-off accounts. Never a token value.
- **Companion app policy:** New rule (off): a phone with the companion app from which no watched sensor has reported for at least 30 days, usually an old phone with a leftover entry.
- **HACS policies:** Two new rules (off): an integration installed through HACS whose GitHub repository is archived, and one with an update waiting that needs a newer Home Assistant. The integration page shows both in the HACS box.
- **Errors from the log:** For an integration that is not loaded and for failed entities, the page now says how often Home Assistant logged an error or warning for the integration and when last. Numbers and times only, never the text.
- **Replace references checks automations:** Home Assistant has to accept the changed automation and load it after the reload, otherwise the file stays as it was.
- **Automations without effect:** Findings for automations and scripts whose actions all target failed entities, and for conditions that can never be true. A blocked automation can be switched off with a plan.
- **Webhooks:** Access & data flow shows which automations a webhook can start and whether it can also be reached from outside.
- **Before/after:** The "Runs" tab compares errors before and after a change to the configuration.
- **Sidebar button:** opens Home Assistant's sidebar when it is hidden.
- **Apps & integrations** (Inventory): apps (with CPU, RAM and data) and core and custom integrations in tabs of their own, with version, status, entities and devices; the disk space of the apps and of the custom integrations is shown as a sum in the tile and the tab. The inventory also has a "Core / Custom" filter.
- **Page of an integration:** core and custom integrations have their own detail page with all entries, entities and devices, reliability, and access and data; for custom ones also the folder and its size.
- **HACS updates:** For custom integrations installed by HACS, the integration page and the "Apps & integrations" list show the installed and the newest version with a note about an update; the list can be filtered by it. For apps the list shows the newest version, an "App updates" tile and an "Update available" filter.
- **Other** (Storage & system): custom cards, blueprints and the remaining folders and files under `/config` share one tab.

### Fixed

- **Findings:** Outages (integration, device, app) can be ticked in the list again, to hide, mark as known or snooze them together.
- **Relations:** An entity that an automation names in many places now appears once in the list ("12 places", the places on hover). Objects without an inventory entry of their own (for example `sun.sun`) show "Not in inventory" instead of "Missing"; "Missing" only appears where a finding backs it.
- **Broken references:** "Add label" no longer shows there (Actions tab, finding selection bar). The cause is one sentence: "Automation X points to Y, which no longer exists."
- **Findings:** The heading “Actions” above the title was a leftover of the menu group that now consists of “Findings” only. It is gone, also as the path in the search.
- **Menu bar:** On windows too narrow for all menu items (roughly between 860 and 1400 pixels) the bar was cut off on the right. It now changes into the "Menu" button with a list below it as soon as it does not fit, and shows the full bar again when there is room.
- **Scan history:** "the last scan of each day" now counts the day in Home Assistant's time zone instead of UTC. Before, two scans of the same day could sit side by side while another day was missing; doubles already stored disappear on load.
- **Bulk actions on findings:** If a request fails in the middle of a selection, the failed findings stay selected and the form stays open; the message says "x of y done". A retry sends only the rest.
- **Saved views:** When the limit of ten views is reached, a new view no longer silently replaces the last one, but says so.
- **Appearance:** Disabled buttons only spin their icon while work is running, no longer when a selection is missing; green and amber follow the theme everywhere; the "By type" and backup tables show their column labels on a phone.
- **Overview:** "Weak batteries: goal missed" now leads to "Maintain → Batteries" instead of the inventory.
- **Recorder cleanup:** Deleting statistics and trimming history now run per entity: if one fails, the others carry on and the reason is shown on the affected one. Before, the run stopped at the first failure. It still stops on a shared problem (recorder busy or unavailable).
- **Replace references, rename:** When several steps of a plan touched the same automation or source, the run stopped after the first step with "A configuration was changed after the preview". The changes made by earlier steps of the same run no longer count as foreign changes.
- **Sub-page tiles:** The icon is now vertically centred in the tile and has more room to the text.
- **Webhooks:** An automation with several webhook triggers now counts as open as soon as one of them is reachable from outside (before, only the first one counted). Disabled automations are marked and do not count as open.
- **Plans:** A single failed status request no longer ends the progress display; it retries and says so. A failed cancel now reports that.
- **Repairs hints:** Only unavailable, orphaned and broken-reference findings raise a hint; other findings (for example an integration that is not loaded) no longer show up as "unavailable entities".
- **Runs: click on "Errors":** The card on top said "No matches" although the table below listed the automations with errors; the empty message is gone.
- Under an outage the "Outages" card showed at most 20 follow-up findings even when the number said more. It now has pages.

## 1.5.0 - 2026-10-12

Die Änderungen stehen vollständig unter 1.5.1. / The changes are listed in full under 1.5.1.

## 1.4.0 - 2026-10-11

Defekte Referenzen in Dashboards sind jetzt lesbar und gruppiert.

### Neu

- **Defekte Dashboard-Referenzen:** Statt eines Pfads wie `views/12/sections/1/cards/0/…` stehen Tab, Abschnitt und Kartentyp da. Die Referenzen einer Karte sind eine aufklappbare Zeile, und die Diagnose hat eine Zeile je Karte.
- **Vorschläge:** Zu einer fehlenden Entität nennt Housekeeper vorhandene mit ähnlichem Namen („Vielleicht: …“), bei Dashboards, Automationen, Skripten, Szenen und Helfern.
- **Verwaiste Karten:** Ist mehr als die Hälfte der Referenzen einer Karte defekt, weist Housekeeper darauf hin, die Karte ganz zu entfernen.

### Behoben

- Lange Werte in der Diagnose werden nicht mehr mit „…“ abgeschnitten.

### English

Broken references in dashboards are now readable and grouped.

#### New

- **Broken dashboard references:** Instead of a path such as `views/12/sections/1/cards/0/…` you see the tab, section and card type. The references of one card are a single expandable row, and the diagnosis has one row per card.
- **Suggestions:** For a missing entity Housekeeper names existing ones with a similar name (“Maybe: …”), in dashboards, automations, scripts, scenes and helpers.
- **Abandoned cards:** When more than half of a card's references are broken, Housekeeper points out that the whole card can be removed.

#### Fixed

- Long values in the diagnosis are no longer cut off with “…”.

## 1.3.0 - 2026-10-11

Ein Logbuch für eigene Einträge, Objektseiten mit Reitern „Aktionen“ und „Verlauf“, Batterien mit Prognose und Knopfzellen in Volt, Richtlinien direkt am Objekt und ein überarbeiteter Recorder.

### Neu

- **Logbuch:** Die eigenen Einträge sind jetzt ein Logbuch: ein Dialog zum Schreiben, ein Reiter unter „Änderungen“, eine kompakte Karte je Objekt und ein Vorschlag nach einer Aktion. Wird ein Gerät entfernt oder vergessen, schreibt Housekeeper es ins Logbuch, und die Liste der entfernten Geräte zeigt den Eintrag. Der Reiter „Verlauf“ eines Geräts hat keine eigene Notiz mehr (alte Notizen entfallen).
- **Verlauf eines Objekts:** Objekte haben einen Reiter „Verlauf“ mit ihrem Logbuch, den Plänen, die sie nannten, und bei Geräten mit ihrem Lebenslauf; auch das, was Housekeeper bemerkt hat.
- **Scanpunkte:** Aus dem Verlauf der Scans lässt sich ein benannter Scanpunkt setzen. Er bleibt bis zum Löschen und dient als Vergleichsbasis.
- **Objektseiten:** Entität, Gerät, Integration, Automation, Skript und Szene lesen sich auf der Übersicht und ändern Dinge im Reiter „Aktionen“ (Formulare als Zeilen einer Karte, nach Zweck gruppiert). Die Karte „Bekannt“ fasst alles zusammen, mit der Quelle jeder Zeile; die technischen Daten stehen in zwei gleich breiten Spalten. Die Markierung wanderte in den Reiter „Aktionen“.
- **Verlauf kürzen** auch auf der Seite einer Entität: Zustände, Kurz- und Langzeitstatistik zum Anhaken, oder ein Stück Zustände.
- **Entfernen mit Recorder-Daten:** Beim Entfernen von Entitäten wählst du die Recorder-Daten je Entität, mit Voreinstellung, Sperre fürs Energie-Dashboard und Zusammenfassung im Plan.
- **Batterien:** eine Tabelle mit Prognose bis 90 Tage (Zeitfenster) und Bedarf der nächsten 30 Tage; jeder Sensor trägt den Namen seines Geräts. Der Typ kommt, wenn vorhanden, aus Battery Notes (dessen übrige Entitäten zählen nicht mit). Sensoren ohne Wechselbatterie werden aus den anderen Sensoren des Geräts vorgeschlagen und nicht gezählt. Knopfzellen in Volt (CR2016, CR2032, CR2450) zeigen Balken und Prozent aus einer Kurve; „Leer in“ sagt „nicht absehbar“ statt „stabil“.
- **Richtlinien:** Verstöße klappen mit einem Klick auf die Zeile auf, mit Grund und Abhilfe (Umbenennen, Bereich zuweisen, Objekt öffnen, Ausblenden). Die Sammelumbenennung entfällt. Die Übersicht eines Objekts zeigt seine Verstöße mit denselben Abhilfen. Beim Umbenennen startet das Feld leer, Vorschläge sind Knöpfe (der beste „empfohlen“, ein Klick wechselt oder leert).
- **Neue Richtlinie „Entitäts-ID mit Geräteadresse“:** meldet IDs, die aus einer Adresse bestehen (IP in privaten Bereichen, MAC, Funk- oder Zigbee-Adresse wie `eltako_gw1_ff_c2_4a_89`), weil sie nichts über das Gerät sagen und sich ändern können. Der erste Vorschlag ist der Name. Wie alle Richtlinien ist sie zunächst aus.
- **Geänderte Richtlinie „Entitäts-ID mit angehängter Zahl“:** zählt nur noch Zähler bis drei Stellen (`_2` bis `_999`) und überspringt Adress-IDs; `switch.schedule_878149` ist damit kein Fund mehr.
- **Recorder:** Reiter „Auffälligkeiten“ (eine Karte je Entität mit allen Gründen und Schwellen, Filter, Markieren zum Ausschließen) und „Ereignisse“ (Balken, Anteil, Rate pro Tag). Empfohlene Ausschlüsse sind erkennbar, „Nur Vorschläge“ blendet den Rest aus. Integrationen zeigen ihre lautesten Entitäten. Alten Verlauf kürzen sagt, was geht und was bleibt.
- **Gerät austauschen, Zähler wechseln, Verweise ersetzen:** Auswahl per Tippen statt Browser-Liste; Prüfzeilen im Formular, Zusammenfassung der Paare, Modi als Karten mit Folgen und Zeitleiste; die Vorschau zeigt jede Quelle mit alter und neuer Zeile. Reparaturen von Zählern und Zeiträumen sagen, was geprüft wurde und was sich ändert.
- **Wartung:** Erinnerungen mit Fälligkeitstag und Verlauf, als Tabelle; Erinnerungen und Logbuch-Einträge entstehen in einem Dialog. Löschen von Erinnerung, Eintrag, Plan, Ansicht oder Vorlage fragt vorher nach. Die Bestätigungen im Backup-Schutz öffnen per Knopf in der Zeile.
- **Status:** Der Ring zählt Themen; nur dringende ziehen Punkte ab, ein Klick erklärt die Zahl.
- **Übersicht und Graph:** ohne die Kachelkarte „Was möchtest du tun?“; auf dem Handy stehen die drei Kennzahlen in einer Reihe, „Neu scannen“ ist kleiner. Der Graph hat feste Höhe, einklappbare Legende, umbrechende Namen und einen Hinweis auf dem Handy.
- **Export:** zeigt, wie viele Entitäten gewählt sind, und kehrt zur Seite zurück, von der er kam.

### Behoben

- „Keine Wechselbatterie“ aktualisiert die Liste sofort, auch bei Volt-Sensoren; die Batterietabelle öffnet mit allen Batterien statt nur den niedrigen.
- Der Klick auf einen Umbenennen-Vorschlag in den Richtlinien tat nichts.
- Der Rahmen eines Dialogfelds überdeckte den Feldtitel; die Chips in den Dialogen sind gleich groß, haben einen Zeiger, und die gewählte ist erkennbar.
- Backup-Schutz: Pillen stehen in einer Linie, der Knopf unter dem Text.
- Die Automationsseite überlappt keinen Text mehr und stapelt die Laufbalken nicht.
- Die Aufräum-Hinweise der Wirkung nennen jetzt, dass beim Entfernen auch die Statistik gelöscht wird, und die nicht geprüften dynamischen Templates.
- Striche über Hinweisen im ganzen Panel entfernt.

### English

A logbook for your own entries, object pages with "Actions" and "History" tabs, batteries with a forecast and coin cells in volts, policies right at the object and a reworked recorder.

#### New

- **Logbook:** Your own entries are now a logbook: a dialog to write them, a tab under "Changes", a compact card per object and a suggestion after an action. A removed or forgotten device is written to the logbook, and the list of removed devices shows the entry. The "History" tab of a device has no note of its own (old notes are dropped).
- **History of an object:** Objects have a "History" tab with their logbook, the plans that named them and, for devices, their life; also what Housekeeper noticed.
- **Scan points:** From the history of the scans you can set a named scan point. It stays until deleted and serves as a comparison base.
- **Object pages:** Entity, device, integration, automation, script and scene read on the overview and change things in the "Actions" tab (forms as rows of one card, grouped by purpose). The "Known" card sums up everything with the source of each line; the technical data sit in two equal columns. The mark moved to the "Actions" tab.
- **Trim history** on the page of an entity too: states, short-term and long-term statistics to tick, or a stretch of states.
- **Removing with recorder data:** Removing entities chooses the recorder data per entity, with a default, a lock for the Energy dashboard and a summary in the plan.
- **Batteries:** one table with the forecast up to 90 days (windows) and the need of the next 30 days; each sensor carries the name of its device. The type comes from Battery Notes when present (its other entities are ignored). Sensors that are no replaceable battery are proposed from the device's other sensors and not counted. Coin cells in volts (CR2016, CR2032, CR2450) show a bar and a percent from a curve; "Empty in" says "no forecast" instead of "stable".
- **Policies:** violations open with a click on the row, with the reason and the fix (rename, assign an area, open object, hide). The bulk rename is gone. An object's overview shows its violations with the same fixes. Renaming starts with an empty field and suggestions as buttons (the best one "recommended", a click switches or clears).
- **New policy "Entity id with a device address":** reports ids made of an address (IP in private ranges, MAC, radio or Zigbee address such as `eltako_gw1_ff_c2_4a_89`), because they say nothing about the device and can change. The first suggestion is the name. Like all policies it is off at first.
- **Changed policy "Entity id with a trailing number":** counts only counters up to three digits (`_2` to `_999`) and skips address ids; `switch.schedule_878149` is no longer a finding.
- **Recorder:** tabs "Findings" (one card per entity with all its reasons and thresholds, filters, mark for exclusion) and "Events" (bars, share, rate per day). Recommended exclusions are easy to spot, "Suggestions only" hides the rest. Integrations show their loudest entities. Trimming old history says what goes and what stays.
- **Exchange device, change meter, replace references:** pick by typing instead of the browser list; check lines in the form, a summary of the pairs, modes as cards with their consequences and a timeline; the preview shows each source with its old and new line. Repairs of counters and ranges say what was checked and what changes.
- **Maintenance:** reminders with a due day and a history, as a table; reminders and logbook entries are made in a dialog. Deleting a reminder, entry, plan, view or template asks first. The confirmations in backup protection open from a button in the row.
- **Status:** the ring counts topics; only urgent ones take points off, a click explains the number.
- **Overview and graph:** without the tile card "What would you like to do?"; on a phone the three figures sit in one row and "Scan now" is smaller. The graph has a fixed height, a foldable legend, wrapping names and a note on a phone.
- **Export:** shows how many entities are selected and returns to the page it came from.

#### Fixed

- "No replaceable battery" updates the list at once, volt sensors included; the battery table opens with every battery instead of only the low ones.
- A click on a rename suggestion in the policies did nothing.
- The frame of a dialog field covered its title; the chips in dialogs share size and pointer, and the chosen one is visible.
- Backup protection: pills sit in one line, the button under the text.
- The automation page no longer overlaps text or stacks the run bars.
- The impact texts now say that removing also deletes the statistics, and name the dynamic templates that are not checked.
- Lines above notes across the panel removed.

## 1.2.0 - 2026-10-10

Mehr Aufräumen direkt an der Entität, ein klarerer Recorder-Ausschluss und ein Panel, das bei Fehlern nicht mehr einfriert.

### Neu

- **Umbenennen und Bereich zuweisen** auch auf der Detailseite einer Entität oder eines Geräts, je als Plan mit Vorschau und Rückgängig; in der Richtlinienliste für viele auf einmal.
- **Recorder-Ausschluss:** eine schmale Leiste statt eines großen Kastens, mit YAML zum Kopieren und den Schritten danach. „Last im Recorder“ und „Recorder-Kosten“ zeigen, was der Recorder schon ausschließt; ausgeschlossene Entitäten lassen sich zum Kürzen des alten Verlaufs wählen.
- **Sparklines** in den Kacheln der Befundliste; ein eigener Reiter für die Housekeeper-Backups in der Wartung.
- **Labels** auch für Skripte und Szenen.
- **Einstellungen:** Die Angaben für eine Fehlermeldung (Versionen, Browser oder App, letzte Fehler) lassen sich kopieren; eine Vorlage für Fehlermeldungen fragt danach.
- **Export:** alle Entitäten mit einem Klick wählen.

### Behoben

- In Safari und der Companion-App blieb das Panel auf „Scanning…“ stehen (#7).
- Ein neuer Plan aus der Befundliste oder der Detailseite öffnete die Seite nicht am Plan (#8).
- Eine Ansicht, die einen Fehler wirft, zeigt eine Meldung mit Weg zurück, statt das Panel einzufrieren; eine fehlgeschlagene Aktion ersetzt die Seite nicht mehr.
- Ein Doppelklick erzeugt keinen zweiten Plan mehr.
- Die Karte „Gerät austauschen“ zeigte den Titel der Recorder-Auswahl.
- Listen mit Entitäten zeigen überall Name, ID und Zusatzangaben gleich; Richtlinienliste, Listenwerkzeuge und Trennlinien sauber ausgerichtet.
- Die Statuskachel der Befundliste zeigt dieselbe Größe wie ihre Linie.
- Das Backup vor dem Löschen im Recorder enthält die Datenbank.

### English

More tidying right at the entity, a clearer recorder exclusion, and a panel that no longer freezes on errors.

#### New

- **Rename and assign an area** on the detail page of an entity or device too, each as a plan with preview and undo; for many at once in the policy list.
- **Recorder exclusion:** a slim bar instead of a large box, with YAML to copy and the steps afterwards. "Recorder load" and "Recorder costs" show what the recorder already excludes; excluded entities can be picked to trim their old history.
- **Sparklines** in the tiles of the findings list; its own tab for Housekeeper backups in Maintenance.
- **Labels** for scripts and scenes too.
- **Settings:** the details for a bug report (versions, browser or app, last errors) can be copied; an issue template asks for them.
- **Export:** select all entities with one click.

#### Fixed

- In Safari and the Companion app the panel stayed on "Scanning…" (#7).
- A new plan from the findings list or the detail page did not open the page at the plan (#8).
- A view that throws shows a message with a way back instead of freezing the panel; a failed action no longer replaces the page.
- A double click no longer creates a second plan.
- The "Exchange device" card showed the title of the recorder selection.
- Entity lists show name, ID and extra facts the same way everywhere; the policy list, the list tools and the separators are aligned cleanly.
- The status tile of the findings list shows the same quantity as its line.
- The backup before deleting in the recorder includes the database.

## 1.1.0 - 2026-10-10

Aufräumen wird mächtiger: Pläne als Assistent, Verlauf kürzen, Backups und Automationen löschen, Entitäten umbenennen und Bereiche zuweisen. Dazu Batterien mit Typ und Einkaufsliste.

### Neu

- **Pläne als Assistent:** Prüfen, Bestätigen, Ausführen, Ergebnis in vier Schritten; ein Plan ohne ausführbare Aktion zeigt nur den Grund.
- **Verlauf kürzen:** Gespeicherte Zustände ausgewählter Entitäten löschen, die älter als eine gewählte Zahl von Tagen sind (endgültig, mit Backup davor).
- **Housekeeper-Backups aufräumen:** Liste der eigenen Backups mit Regel „letzte N behalten und alles jünger als M Tage“; Backups beobachteter Pläne und das jüngste mit Rückgängig sind geschützt.
- **Automationen löschen:** Ungenutzte Automationen aus `automations.yaml` als Plan entfernen, mit Vorschau, Prüfung und Rückgängig.
- **Umbenennen mit Verweisen:** Neue Entitäts-ID, Verweise in Automationen, Skripten, Szenen und Dashboards ziehen mit; Rückgängig stellt Dateien und ID wieder her.
- **Bereich zuweisen:** Für Entitäten und Geräte ohne Bereich, mit Vorschlag aus Gerät oder Integration.
- **Batterien:** Batterietyp je Gerät mit Einkaufsliste für 30 Tage, erkannter Batteriewechsel zum Eintragen; Spannungsbatterien zählen in der Übersicht mit.
- **Automationsziele:** Verlauf je Automation und ein Befund, wenn ein Ziel wiederholt verfehlt wird.
- **Recorder:** Karte „Im Recorder“ je Entität und Auswahl für den Ausschluss in `configuration.yaml`.
- **Export** aus dem Inventar als CSV, Markdown oder JSON; eigene Einträge im Verlauf der Änderungen; Sparklines in den Kopfkacheln.

### Behoben

- Recorder-Löschungen warten auf jeden Block, bevor gezählt wird.
- Während ein Plan schreibt, lädt Housekeeper nicht neu; ein durch Neustart unterbrochener Lauf endet als teilweise oder abgebrochen.
- Die Statuszahl ist in jeder Ansicht gleich.
- Scheitert das kleine Backup, bietet Housekeeper ein vollständiges als neue Vorschau an, statt es von selbst zu starten.

### English

Cleanup gets more capable: plans as a guided flow, trimming history, deleting backups and automations, renaming entities and assigning areas. Plus batteries with type and a shopping list.

#### New

- **Plans as a guided flow:** check, confirm, run, result in four steps; a plan with nothing to run shows only the reason.
- **Trim history:** delete stored states of selected entities older than a chosen number of days (final, with a backup first).
- **Tidy Housekeeper backups:** list of its own backups with the rule "keep the last N and everything younger than M days"; backups of watched plans and the newest one with undo are protected.
- **Delete automations:** remove unused automations from `automations.yaml` as a plan, with preview, verification and undo.
- **Rename with references:** new entity ID, references in automations, scripts, scenes and dashboards follow; undo restores files and ID.
- **Assign an area:** for entities and devices without one, suggested from the device or the integration.
- **Batteries:** battery type per device with a 30-day shopping list, a detected battery change to log; batteries in volts count in the overview.
- **Automation goals:** history per automation and a finding when a goal is missed repeatedly.
- **Recorder:** an "In the recorder" card per entity and a selection for the exclusion in `configuration.yaml`.
- **Export** from the inventory as CSV, Markdown or JSON; own entries in the change history; sparklines in the header tiles.

#### Fixed

- Recorder deletions wait for every block before counting.
- Housekeeper does not reload while a plan writes; a run cut off by a restart ends as partial or aborted.
- The status number is the same in every view.
- If the small backup fails, Housekeeper offers a full one as a new preview instead of starting it on its own.

## 1.0.5 - 2026-10-10

Zwei Fehler behoben, die in 1.0.3 und 1.0.4 steckten, und vier neue Wartungsziele.

### Behoben

- **Scan bricht ab (Issue #5):** Mit Home Assistant 2026.10 scheiterte der erste Scan an
  Automationen mit Vorlagen („Template is not a container or iterable“). Housekeeper
  übernimmt aus Home Assistant nur noch echte IDs.
- **Zeilen anhaken ging nicht:** Das Anhaken einzelner Zeilen in Befunden, Aufräumen und
  beim Löschen von Statistiken löste einen Fehler aus.
- **Statistiken löschen:** Mehr als 200 ausgewählte Reihen liefen auf einen leeren Fehler.
  Jetzt nimmt jeder Durchgang die ersten 200, der Rest bleibt ausgewählt; der Knopf zeigt
  die Zahl, und nach „Jetzt ausführen“ springt die Seite zum Fortschritt.

### Neu

- **Wartungsziele:** Sensoren ohne neue Meldung, wiederkehrende Ausfälle, Automationen mit
  Fehlern (30 Tage) und verwaiste Statistiken.

### English

Two bugs fixed that were in 1.0.3 and 1.0.4, and four new maintenance goals.

#### Fixed

- **Scan aborts (issue #5):** with Home Assistant 2026.10 the first scan failed on
  automations with templates ("Template is not a container or iterable"). Housekeeper now
  takes only real IDs from Home Assistant.
- **Ticking rows did not work:** ticking single rows in Findings, Cleanup and when
  deleting statistics raised an error.
- **Deleting statistics:** more than 200 selected series ended in an empty error. Each
  round now takes the first 200 and the rest stays selected; the button shows the count,
  and after "Run now" the page jumps to the progress.

#### New

- **Maintenance goals:** sensors without a new report, recurring outages, automations with
  errors (30 days) and orphaned statistics.

## 1.0.4 - 2026-10-10

Neue Erkennung für Sensoren, die nichts mehr melden.

### Neu

- **„Meldet nicht mehr“:** Ein Sensor, der seinen letzten Wert behält, aber länger als das
  Limit nichts Neues meldet, erscheint als Befund. Standard 48 Stunden (Option
  `stale_hours`, 0 = aus), nur für Sensoren mit Messwerten; pro Sensor einstellbar in der
  Übersicht der Entität, auch für andere Entitäten.
- **Befunde:** In „Ausgeblendet“, „Bekannt“ und „Zurückgestellt“ gibt es „Wieder
  einblenden“.
- **Datenbank:** Die Karte zeigt den ältesten Eintrag im Recorder.

### English

New detection for sensors that stopped reporting.

#### New

- **"Stops reporting":** a sensor that keeps its last value but reports nothing new for
  longer than the limit appears as a finding. Default 48 hours (option `stale_hours`,
  0 = off), for sensors with measurements only; adjustable per sensor on the entity's
  overview, also for other entities.
- **Findings:** "Show again" in "Hidden", "Known" and "Snoozed".
- **Database:** the card shows the oldest entry in the recorder.

## 1.0.3 - 2026-10-09

Bedienung und Lesbarkeit.

### Neu

- **Klares Ergebnis nach einem Plan:** Ein Band zeigt grün, gelb oder rot, wie es ausging
  und ob Rückgängig geht. Der Plan wartet jetzt die Prüfung ab, statt auf „Ausgeführt“
  stehen zu bleiben.
- **Verwaiste Statistiken:** Spalten „Erster Eintrag“ und „Datensätze“, Checkbox im
  Listenkopf, „Nur Ausgewählte zeigen“.
- **Bestätigung:** ein Haken für alle zu prüfenden Einträge statt einem pro Zeile;
  abgebrochene Pläne lassen sich wiederholen; der Prüfbericht lässt sich einklappen.
- **Bedienung:** Shift-Klick wählt Bereiche, Kopierknopf an IDs, „Filter zurücksetzen“,
  Tasten `/` und `Esc`, Pfeiltasten in Listen, kurze Meldungen, „Seit deinem letzten
  Besuch“ auf der Übersicht, „Nur lesen“/„Kann ändern“ pro Seite.
- Knöpfe nach Wirkung abgestuft, Löschen ist rot.

### Geändert

- Schmale Bildschirme: Schrittleiste des Assistenten und Erinnerungen passen jetzt.
- Doppelte Kachelzeile bei „Verwaiste Statistiken“ entfernt.

### English

Usability and readability.

#### New

- **Clear result after a plan:** a band shows green, amber or red, how it went and
  whether undo works. The plan now waits for the check instead of staying on "Executed".
- **Orphaned statistics:** columns "First entry" and "Records", a checkbox in the list
  header, "Show selected only".
- **Confirmation:** one tick for all entries to review instead of one per row; aborted
  plans can be repeated; the audit report can be folded.
- **Handling:** Shift-click selects ranges, copy button on IDs, "Reset filters", keys `/`
  and `Esc`, arrow keys in lists, short messages, "Since your last visit" on the overview,
  "Read only"/"Can change" per page.
- Buttons weighted by effect, deleting is red.

#### Changed

- Narrow screens: the assistant's step bar and reminders now fit.
- Duplicate tile row removed from "Orphaned statistics".

## 1.0.2 - 2026-10-09

Neue Navigation mit Kacheln und einige Korrekturen.

### Neu

- **Kacheln mit Anzahlen** in Aufräumen, Zuverlässigkeit, Recorder, Richtlinien,
  Freigabe, Läufe und Wartung; die gewählte Kachel ist hervorgehoben. Quarantäne ist ein
  eigener Bereich mit Freigabe in der Liste.
- **Erinnerungen** haben eine eigene Ansicht unter „Pflegen“. Batterien stehen in einer
  Liste, auch solche in Volt; die Prognose ist in Gruppen mit Gerät, Raum und Datum
  eingeklappt.
- Abgebrochene Pläne lassen sich per „Plan wiederholen“ als neue Vorschau erneut anlegen.
  Der Prüfbericht lässt sich wieder einklappen.

### Geändert

- Scheitert das kleine Backup vor einem Plan, versucht Housekeeper das volle automatische
  Backup; der Fehlertext erscheint im Plan und im Log.
- Beim Löschen von Statistiken sind die gespeicherten Zustände standardmäßig mit dabei.
- Die Gruppe „Bald“ der Aufgabenliste ist zunächst eingeklappt.

### English

New tile navigation and some fixes.

#### New

- **Tiles with counts** in Cleanup, Reliability, Recorder, Policies, Exposure, Runs and
  Maintenance; the chosen tile is highlighted. Quarantine is its own area with release in
  the list.
- **Reminders** have their own view under "Maintain". Batteries are in one list, including
  those in volts; the forecast is folded into groups with device, room and date.
- Aborted plans can be repeated as a new preview with "Repeat plan". The audit report can
  be folded again.

#### Changed

- If the small backup before a plan fails, Housekeeper tries the full automatic backup;
  the error text shows in the plan and in the log.
- Deleting statistics also deletes the stored states by default.
- The "Soon" group of the to-do list starts folded.

## 1.0.1 - 2026-10-09

Korrekturen und eine Oberfläche, die aufgeräumter ist.

### Geändert

- **Kleineres Backup vor Plänen:** Housekeeper sichert nur Home Assistant, ohne Apps und
  Ordner, und die Datenbank nur, wenn der Plan in sie schreibt. Das Backup erscheint als
  eigenes Backup „Housekeeper …“, zählt nicht zu deiner Aufbewahrung und nicht als
  reguläres Backup. Home Assistant löscht diese Backups nicht von selbst.
- **Zählerreparatur** brach bei laufenden Zählern fast immer mit „Die Daten wurden nach
  der Vorschau geändert“ ab; das ist behoben.
- Der Hinweis „Home Assistant startet noch“ und die Meldung „Ein Plan läuft“ erklären
  sich jetzt und verschwinden von selbst.
- Prüfbericht: Namen und IDs sind standardmäßig im Klartext, mit Haken zum Teilen als
  Platzhalter.
- Oberfläche: Befundzeilen, Journal, Einstellungen, Farbschema-Auswahl und Knöpfe sind
  einheitlicher angeordnet.

### English

Fixes and a tidier interface.

#### Changed

- **Smaller backup before plans:** Housekeeper backs up Home Assistant only, without
  apps and folders, and the database only when the plan writes into it. The backup shows
  up as its own “Housekeeper …” backup, does not count towards your retention and not as
  the regular backup. Home Assistant does not delete these backups by itself.
- **Counter repair** almost always aborted on running counters with “The data changed
  after the preview”; fixed.
- The notes “Home Assistant is still starting” and “A plan is running” explain
  themselves now and go away on their own.
- Audit report: names and IDs are in plain text by default, with a tick to share it with
  placeholders.
- Interface: finding rows, journal, settings, colour scheme choice and buttons are laid
  out more consistently.

## 1.0.0 - 2026-10-09

Erste veröffentlichte Version von HA Housekeeper. Lege vor dem Aufräumen ein Home-Assistant-Backup an, es gibt
keine Gewährleistung (siehe Haftungsausschluss in der README).

### Enthalten

- Bestand und Befunde: Entitäten, Geräte, Automationen, Skripte und Szenen, verwaiste
  und lange nicht verfügbare Objekte, kaputte Verweise, Duplikate, ungenutzte
  Automationen, Batterien (Prozent und Volt) und Wartungsziele.
- Aufräumen nur nach bestätigtem Plan mit Vorschau, Quarantäne, Backup, Prüfung danach
  und Rückgängig im Journal.
- Reparieren: Zählerfehler, Sensorfehler, Zählerwechsel, Verweise ersetzen, Geräte
  austauschen.
- Wartung, Sicherheitsmodus, Befund-Status, eine Suche überall, Farbschemata und
  Deutsch und Englisch.

### English

First published version of HA Housekeeper. Make a
Home Assistant backup before cleaning up; there is no warranty (see the disclaimer
in the README).

#### Included

- Inventory and findings: entities, devices, automations, scripts and scenes, orphaned
  and long-unavailable objects, broken references, duplicates, unused automations,
  batteries (percent and volts) and maintenance goals.
- Cleanup only after a confirmed plan with preview, quarantine, backup, verification
  and undo in the journal.
- Repair: counter glitches, sensor errors, meter change, replacing references,
  exchanging devices.
- Maintenance, protection mode, finding status, one search everywhere, colour schemes
  and German and English.
