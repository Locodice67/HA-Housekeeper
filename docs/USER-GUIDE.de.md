# HA Housekeeper – Benutzerhandbuch

Die ausführliche Dokumentation von HA Housekeeper. Einen kurzen Überblick und den Schnellstart gibt es in der [README](../README.de.md). English: [User Guide](USER-GUIDE.md).

## Inhalt

- [Was Housekeeper übernimmt](#was-housekeeper-übernimmt)
- [Installation](#installation)
- [Begriffe und Zahlen](#begriffe-und-zahlen)
- [Funktionen](#funktionen)
  - [Übersicht und Befunde](#übersicht-und-befunde)
  - [Inventar und Diagnose](#inventar-und-diagnose)
  - [Automationen und Skripte](#automationen-und-skripte)
  - [Aufräumen und Reparieren](#aufräumen-und-reparieren)
  - [Pflegen](#pflegen)
  - [Betrieb](#betrieb)
  - [Sicherheit und Zugriffe](#sicherheit-und-zugriffe)
  - [Bedienung und Einstellungen](#bedienung-und-einstellungen)
- [Sicherheitsmodell](#sicherheitsmodell)
- [Verwendung](#verwendung)
- [Beispiele](#beispiele)
- [Fehlersuche](#fehlersuche)
- [Aktuelle Einschränkungen](#aktuelle-einschränkungen)

## Was Housekeeper übernimmt

| Aufgabe | Verhalten |
| --- | --- |
| **Inventar** | Entitäten, Geräte, Integrationen, Bereiche, Etagen, Labels und Automationen mit Suche, Filter und Sortierung |
| **Diagnose** | Unterscheidet aktiv, nicht verfügbar, unbekannt, deaktiviert und verwaist — jeweils mit Begründung |
| **Beobachtungszeitpunkt** | Speichert, seit wann Housekeeper eine Klassifikation beobachtet |
| **Automationsanalyse** | Trigger, Bedingungen, Aktionen, Blueprints und fehlende Referenzen; ebenso für Skripte, Szenen, Dashboards, Gruppen und Helfer |
| **Scanvergleich** | Neue und behobene Befunde, Statuswechsel, neue und entfernte Objekte seit dem letzten Scan |
| **Aufräumhinweise** | Mögliche Duplikate, ungenutzte Automationen, schwache Batterien |
| **Sensoren und Hinweise** | Zähler als Sensoren, zusammengefasste Reparaturhinweise, Befundexport als CSV/JSON und Inventarexport als CSV/Markdown/JSON |
| **Abhängigkeiten** | Beziehungen zwischen Integration, Gerät, Entität, Bereich und Automation mit Vertrauensstufe |
| **Sicherheit** | Nur für Administratoren; serverseitige Schutzmodi, Vorschau und ausdrückliche Bestätigung; je nach Aktion Backup, Prüfung und Rückgängig |

## Installation

### Über HACS (empfohlen)

Ab Home Assistant 2026.11 ist HACS als **Marketplace** eingebaut. Die Schritte sind dieselben, und Housekeeper nennt dann Marketplace, wo jetzt HACS steht.

[![HACS-Repository in My Home Assistant öffnen](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=bertel2020&repository=HA-Housekeeper&category=integration)
[![HA Housekeeper zu My Home Assistant hinzufügen](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=ha_housekeeper)

1. Über den ersten Button das Housekeeper-Repository in HACS öffnen.
2. **HA Housekeeper** herunterladen und Home Assistant neu starten.
3. **Integration hinzufügen** (wichtig): Über den zweiten Button oder in Home
   Assistant unter **Einstellungen → Geräte & Dienste → Integration hinzufügen →
   HA Housekeeper** und den Dialog abschließen. Der Download in HACS allein reicht
   nicht; ohne diesen Schritt erscheint kein Menüpunkt.
4. Anschließend als Administrator **Housekeeper** in der Seitenleiste öffnen.

Falls der erste Button nicht funktioniert, in HACS unter **Integrationen →
Benutzerdefinierte Repositories** `https://github.com/bertel2020/HA-Housekeeper`
als Kategorie **Integration** eintragen.

Solange Housekeeper noch nicht in der normalen HACS-Suche erscheint, registriert
der erste Button das Projekt als benutzerdefiniertes Repository. Den Stand der
Aufnahme zeigt [hacs/default#11766](https://github.com/hacs/default/pull/11766).

### Manuell

Das Verzeichnis `custom_components/ha_housekeeper` nach
`/config/custom_components/ha_housekeeper` kopieren und Home Assistant neu
starten. Danach die Integration wie oben beschrieben hinzufügen.

Das Ergebnis sollte so aussehen:

```text
config/
└── custom_components/
    └── ha_housekeeper/
        ├── __init__.py
        ├── manifest.json
        └── ...
```

### Housekeeper entfernen

1. **Einstellungen → Geräte & Dienste → HA Housekeeper** öffnen, die drei Punkte
   wählen und **Löschen**. Der Eintrag in der Seitenleiste, die Sensoren, der
   Button und die Reparaturhinweise verschwinden damit.
2. In HACS **HA Housekeeper** öffnen und **Entfernen** wählen (bei manueller
   Installation `/config/custom_components/ha_housekeeper` löschen), danach
   Home Assistant neu starten.

Was ein Plan geändert hat, bleibt so: deaktivierte Entitäten und Geräte
bleiben deaktiviert, umbenannte behalten ihren neuen Namen, und Backups, die
Housekeeper vor einem Plan angelegt hat, bleiben in der Backup-Liste. Wer das
zurückhaben möchte, macht es vor dem Löschen der Integration rückgängig. Die
Labels `housekeeper_ignore`, `housekeeper_critical` und `housekeeper_keep`
bleiben ebenfalls und lassen sich unter **Einstellungen → Bereiche, Labels &
Zonen → Labels** löschen. Housekeepers eigene Daten (Dateien
`ha_housekeeper.*` in `/config/.storage`) bleiben erhalten, damit eine neue
Installation mit deinen Entscheidungen und Verläufen beginnt; wer ganz neu
anfangen will, löscht diese Dateien bei gestopptem Home Assistant.

## Begriffe und Zahlen

Dieser Abschnitt erklärt, wie Housekeeper denkt und rechnet. Wer ihn kennt, versteht jede Zahl im Panel.

### Von klein nach groß

| Begriff | Bedeutung |
| --- | --- |
| **Objekt** | Alles, was Housekeeper prüft: Entität, Gerät, Integration, App, Automation, Skript, Szene. |
| **Befund** | Ein einzelner Fund an einem Objekt, zum Beispiel „Entität ist verwaist“ oder „Automation verweist auf eine fehlende Entität“. Jeder Befund hat einen **Schweregrad** (in der Oberfläche auch *Auswirkung*): **hoch**, **mittel**, **niedrig** oder **Info**. Der Schweregrad sagt, wie viel am Objekt hängt (Automationen, kritische Objekte) und wie lange ein Ausfall dauert. |
| **Ursache und Folge** | Fallen viele Objekte aus demselben Grund aus (eine Integration ist nicht geladen, ein Gerät ist ausgefallen), fasst Housekeeper sie zu einer **Ursache** zusammen. Die betroffenen Entitäten, Automationen und Dashboards sind ihre **Folgen**. Die Folgen zählen nicht extra. |
| **Status eines Befunds** | Du entscheidest, wie mit einem Befund umgegangen wird: **Bekannt** (mit Begründung), **Zurückgestellt** (mit Frist), **Ausgeblendet**. Housekeeper setzt von selbst **Neu**, **In Arbeit** (ein Plan läuft oder liegt vor) und **Erledigt**. Bekannte, zurückgestellte und ausgeblendete Befunde zählen nicht in den Zustand. |
| **Vermerk** | Eine Aussage zu einem Objekt, zum Beispiel „absichtlich offline“, auch mit Zeitfenster. Ein Vermerk gehört zum Objekt, nicht zu einem einzelnen Befund. Objekte mit Vermerk zählen nicht als neu ausgefallen. |
| **Vorfall** | Ein zeitlicher Zusammenhang: Befunde, die zur selben Zeit begannen wie ein Update oder Neustart, stehen zusammen auf einer Zeile. Das ist ein Hinweis, kein Beweis für die Ursache. |
| **Beobachtung** | Nach einem Update von Home Assistant, Betriebssystem oder Supervisor scannt Housekeeper einen Tag lang zusätzlich (nach 30 Minuten, 2 und 6 Stunden und am Ende) und vergleicht mit dem Stand vor dem Neustart. Beginnt das Update, scannt Housekeeper sofort und hält diesen Stand fest; gelingt das nicht, gilt der letzte Scan davor. Ergebnis ist ein Urteil über das, was seitdem ausfiel, kurz gestört war oder wieder läuft. |

**Beobachtung und Befund im Unterschied:** Ein Befund bewertet den Zustand eines Objekts zu einem Zeitpunkt („das ist jetzt ein Problem, in dieser Stufe“). Eine Beobachtung ist ein Vorher-nachher-Vergleich über einen Zeitraum („was hat sich seit dem Update verändert?“). Sie fügt dem Zustand nichts hinzu, sie erklärt nur, ob und wann Befunde mit einem Update begannen. Ein Befund kann ohne Beobachtung existieren, eine Beobachtung ist nur ein Blick auf Befunde, die schon da sind.

### Wie ein Ausfall zum Befund wird

Eine nicht verfügbare Entität, ein Gerät, eine Integration oder eine App wird nach **15 Minuten** zum Befund und steigt mit der Dauer:

| Dauer | Stufe |
| --- | --- |
| ab 15 Minuten | Info (zählt nicht ab, damit ein Neustart keine Delle hinterlässt) |
| ab 1 Stunde | niedrig |
| ab 24 Stunden | mittel |
| ab 7 Tagen, oder wenn Automationen betroffen sind | hoch |

Die vier Schwellen stellst du unter **Einstellungen → Scan und Meldungen** ein. Die Stufe richtet sich nach der Dauer und, bei der Auswirkung, danach, was am Objekt hängt.

### Der Zustand und seine Berechnung

Die Zahl im Ring („Zustand 90,9 Punkte“) ist ein **Zustand in Punkten von 100**. Sie zählt Objekte, nicht Befunde.

1. **Ausgangswert** ist die Zahl der geprüften Objekte (Entitäten, Geräte, Integrationen, Automationen, Skripte, Szenen); die Kachel „Geprüfte Objekte“ zeigt dieselbe Zahl.
2. Jedes Objekt mit Befund zieht nach seiner **schlimmsten** Stufe ab: **hoch 2**, **mittel 1**, **gering 0,5**, **Info 0**.
3. Ein Objekt zählt **einmal**, auch mit mehreren Befunden. Auch die Folgen eines Ausfalls sind eigene Objekte und zählen mit ihrer eigenen Stufe.
4. Bekannte, zurückgestellte und ausgeblendete Befunde zählen nicht.
5. **Zustand = (Ausgangswert − Summe der Abzüge) ÷ Ausgangswert × 100**, auf eine Dezimalstelle abgerundet, damit ein Haus mit Befund nie 100 zeigt, und nie unter 0.

Beispiel: 2000 geprüfte Objekte, 100 mit geringen (je 0,5 = 50), 160 mit mittleren (je 1 = 160) und 100 mit hohen Befunden (je 2 = 200). Abzug 410, verbleibend 1590, Zustand **79,5 von 100**. Die Karte **Wie kommt das zustande?** (Klick auf **Info** unter dem Ring oder auf den Ring selbst) zeigt diese Rechnung mit deinen Zahlen; ein Klick auf eine Zeile öffnet die zugehörigen Objekte.

Die **Farbe** des Rings kommt nicht aus der Zahl, sondern aus dem, was offen ist, und steht daneben als Wort: **rot („Dringend“)**, solange ein dringendes Thema offen ist (etwa Ausfälle der Stufe hoch, Backup, voller Datenträger); **gelb („Offen“)** bei anderen offenen Themen oder Objekten mit hoher oder mittlerer Auswirkung; sonst **grün („In Ordnung“)**. Wartung (Ziele, Erinnerungen, Quarantäne) färbt nicht.

### Warum Zahlen verschieden aussehen können

- Die **Befundseite** zählt Befunde, die **Zustandskarte** zählt Objekte. Zwei Befunde an einem Objekt sind zwei Befunde, aber ein Objekt.
- Die **Kacheln** der Befundseite zählen alle offenen Befunde, auch die Folgen eines Ausfalls; die Kachel **Alle Befunde** nennt, wie viele davon Folgen sind. In der Ansicht **Einzeln** steht jeder Befund als eigene Zeile.
- Die **Befundliste** gruppiert in der Ansicht **Gruppiert** (Standard) jeden Befund unter das Objekt, zu dem er gehört: Entitäten mit Gerät unter das Gerät, alles andere unter sich selbst (Automation, Skript, Dashboard, Helfer, Integration …), schon ab einem Befund. Darunter stehen alle Befunde des Objekts, jeder mit eigener Schwere. Ursachen stehen darüber: App › Integration › Gerät › Befunde, ebenso ein fehlendes Ziel über den Automationen, Skripten und Dashboards, die darauf zeigen. Der Kopf einer Gruppe zeigt die höchste Schwere, Sicherheit und „Erkannt seit“ als Wert oder Spanne (der älteste Befund groß, darunter der neueste), dazu eine Zusammenfassung wie „3 von 8 Entitäten ohne Wert · Verwaist (2)“ und einen Vermerk samt der Zahl, die er ausblendet. Die Zeile über der Tabelle nennt „N Befunde an M Objekten“. Filter und Suche lassen die Gruppen stehen („2 von 6 Befunden passen zum Filter“); **Nur Ursachen** steht im Typ-Filter. **Einzeln** zeigt jeden Befund als eigene Zeile, mit dem Gerät in der Zeile. Ein Häkchen am Kopf wählt alle Befunde der Gruppe; passt eine Aktion nur zu einem Teil, nennt der Knopf „(2 von 6)“.
- Die **Kurven** unter den Kacheln zählen wie die Kacheln. Der Verlauf des Zustands begann neu, als die Berechnung von Punkten auf Objekte umgestellt wurde.
- Der **Export** enthält Folgen immer.

### Was zählt als Backup

Für den Backup-Schutz in der Wartung zählen nur Backups, die **Home Assistant enthalten**: die automatischen Backups von Home Assistant, manuelle Backups und Backups anderer Werkzeuge (zum Beispiel Google Drive Backup; sie stehen als „Anderes Werkzeug“, weil Home Assistant nicht weiß, ob sie geplant waren), auch die von Housekeeper vor einem Plan. Backups, die nur eine App sichern (zum Beispiel die, die vor einem App-Update entstehen), zählen nicht: Sie sichern deine Konfiguration nicht und sagen nichts über deine Backup-Strategie.

### Ablauf eines Plans

Jede Änderung läuft als Plan, nie von selbst:

1. **Vorschau:** Housekeeper zeigt genau, was geändert würde, samt erwartetem Endzustand. Bis hier ändert sich nichts.
2. **Bestätigen:** Du bestätigst im Dialog; bei kritischen Objekten extra.
3. **Backup:** Je nach Aktion legt Housekeeper vorher ein Sicherheits-Backup an (nur Konfiguration oder voll).
4. **Ausführen:** Die Schritte laufen einzeln, jeder mit Ergebnis. Der Plan steht währenddessen auf **In Arbeit**.
5. **Nachkontrolle:** 24 Stunden lang prüft Housekeeper, ob etwas zurückkommt (**sauber** oder **Rückfall**).
6. **Rückgängig:** Im Journal, solange nichts verändert wurde. Gelöschte Recorder-Daten und gelöschte Backups sind endgültig; ein vollständiger Restore ist Sache von Home Assistant.

Wie viel ein Plan darf, legt der **Schutzmodus** fest (Einstellungen → Schutzmodus). Neue Installationen starten auf **nur lesen**.

### Die wichtigsten Einstellungen

| Einstellung | Standard | Wirkung |
| --- | --- | --- |
| Scan-Intervall | 6 Stunden | wie oft Housekeeper von allein scannt (0 schaltet aus) |
| Ausfall-Schwellen | 15 Min. / 1 Std. / 24 Std. / 7 Tage | ab wann ein Ausfall Info, niedrig, mittel, hoch ist |
| Beobachtung nach Updates (`watch_hours`) | 24 Stunden | wie lange nach einem Update zusätzlich gescannt wird (0 schaltet aus) |
| Schutzmodus | nur lesen | was Pläne ändern dürfen |

Alles unter **Einstellungen** im Panel, die Schwellen auch unter **Einstellungen → Geräte & Dienste → HA Housekeeper → Konfigurieren**.

### Was Housekeeper speichert

Alles liegt im Speicher von Home Assistant (`.storage`, Dateien `ha_housekeeper.*`) und verlässt deine Instanz nicht. Das sind Beobachtungszeitpunkte, Entscheidungen, Vermerke, der Verlauf des Zustands, das Journal der Pläne und die gespeicherten Scans. Die Liste mit Größe und Zweck steht unter **Einstellungen → Info → Was Housekeeper speichert**. Zugangsdaten zeigt Housekeeper nie als Wert, nur ihre Art und ob einer hinterlegt ist.

### Die ersten Schritte

Installation und erster Scan stehen in der [README](../README.de.md). Danach: **Befunde** öffnen und mit den hohen und mittleren beginnen, einen Befund öffnen (Ursache und Abhängigkeiten stehen oben), absichtlich Ausgefallenes mit einem Vermerk versehen und erst dann unter **Aufräumen** einen Plan bauen.

## Funktionen

### Übersicht und Befunde

#### Übersicht

- **Übersicht**: Neben dem Ring stehen vier Kacheln: **Geprüfte Objekte**, **Befunde** (alle offenen Befunde), **Störungen** und **Aufräumen**, die beiden Gruppen der Befundseite; ein Klick öffnet die passende Liste, die Verlaufslinien zeigen höchstens die letzten 7 Tage. Darunter steht die Aufgabenliste mit **Dringend**, **Offen** und **Wartung** als eigenen Gruppen. Dringend sind nur Ausfälle der Stufe hoch; die übrigen stehen als **Weitere Ausfälle** unter Offen, und eine Ausfallkette zählt einmal (ein Gerät unter einer ausgefallenen Integration nicht zusätzlich). Es folgen Aufräumen, Trend, der **Inventarstatus** in drei Gruppen (Unauffällig, Prüfen, Problematisch) mit Anzahl und Anteil, die Karte **System** (Datenträger, Speicher und Prozessor als Balken, mit Link zu Speicher & System; ab 75 % belegtem Datenträger gibt es eine Aufgabe, ab 90 % eine dringende), die Karte **Datenbank** (Größe, WAL-Datei, Aufbewahrungszeit aus der Recorder-Einstellung von Home Assistant, Wachstum pro Tag) und die Backups. In den Eckdaten einer Entität stehen letzter Zustandswechsel, letzte Meldung und, bei Langzeitstatistik, der letzte Statistik-Eintrag.
- **Integrationen mit Problemen** erscheinen auf der Übersicht, daneben die Karte **Hinweise** mit Schnellzugriff auf Batterien, Duplikate, ungenutzte Automationen und nicht verwendete Entitäten.
- **Wartungsziele**: Unter **Pflegen → Wartung → Wartungsziele** stehen sieben Ziele, die du selbst einstellst (die Übersicht zeigt nur die verfehlten und führt dorthin): höchstens 0 defekte Referenzen, höchstens 10 nicht verfügbare Entitäten, Backup nicht älter als 36 Stunden, Wiederherstellungstest nicht älter als 90 Tage, Datenbankwachstum höchstens 50 MB pro Tag, keine schwache Batterie, höchstens 5 Geräte ohne Bereich. Jedes Ziel zeigt den Ist-Wert, die Grenze und ob es **erfüllt**, **verfehlt** oder **unbekannt** ist (zum Beispiel wenn es noch zu wenige Größenmessungen gibt); „nie bestätigt“ zählt als verfehlt. Jedes Ziel lässt sich anpassen oder abschalten. Es ändert sich nichts an Home Assistant und nichts am Zustand.
- **Sicherheitsstatus**: Unter der Navigation steht auf jeder Ansicht eine schmale Zeile mit Schutzmodus, letztem Backup, letztem Plan von Housekeeper und ob er noch rückgängig zu machen ist, vollständigem Scan, laufender Operation, laufender Nachbeobachtung und, solange er an ist, dem KI-Zugriff (gelb, solange die KI die Merkliste ändern darf). Was einen Blick braucht (rot, dann gelb), steht vorn. Ein Klick öffnet die passende Ansicht. Die Zustandskarte zeigt „Zustand N Punkte“ und wie viele Objekte betroffen sind; jede gemeinsame Ursache ist eine Falte mit Zahlen je Objektart und den Folgebefunden darin.
- **Veralteter Scan**: Ist der letzte Scan deutlich älter als das Scanintervall, weist die Übersicht darauf hin. **Änderungen** und viele Integrationsprobleme lassen sich durchsuchen und filtern.

#### Befunde und Entscheidungen

- **Auswirkung**: Jeder Befund hat eine Auswirkung (**hoch**, **mittel**, **gering**, **Info**, **keine**) mit den Gründen dahinter, zum Beispiel „von 3 aktiven Automationen genutzt“ oder „steuert 1 kritisches Objekt“. Kritisch sind Objekte mit dem Label `housekeeper_critical` (an Entität, Gerät oder Bereich) sowie Schlösser, Alarmanlagen, Ventile, Sirenen, Garagentore und Tore und Sensoren für Rauch, Gas, Kohlenmonoxid, Wasser und Sicherheit. Die Befundliste sortiert standardmäßig nach Auswirkung, dann nach Sicherheit der Diagnose, und lässt sich danach filtern. Aus der Auswirkung allein ergibt sich keine Zahl; sie geht über die schlimmste Stufe je Objekt in den Zustand ein (siehe „Begriffe und Zahlen“).
- **Recorder und Energie-Dashboard** zählen in der Auswirkungsanalyse mit: Entitäten des Energie-Dashboards gelten als verwendet, und Entitäten mit Recorder-Verlauf oder Langzeitstatistiken sind markiert. Die Detailseite einer Entität hat eine Karte **Im Recorder** mit vorhandenen Zeilen und Zeiträumen. In der Ansicht **Nicht verwendet** sind beide Reiter sortier- und filterbare Tabellen (Klick auf eine Spaltenüberschrift sortiert; auf dem Handy werden die Zeilen zu Karten): Die Entitäten nennen Domain, Gerät, Bereich, Integration, letzte Änderung, letzte Meldung, seit wann sie beobachtet werden und ob es Langzeitstatistik gibt. Der Reiter **Verwaiste Statistiken** listet Langzeitstatistiken, zu denen es keine Entität mehr gibt. Jede Zeile nennt den **letzten Eintrag** der Statistik, und die Liste lässt sich danach sortieren (neueste oder älteste zuerst); so erkennst du kürzlich verwaiste von längst toten Statistiken. Der Eintrag wird erst beim Öffnen des Reiters gelesen, nicht beim Scan.
- **Gemeinsame Ursachen**: Ist eine Integration nicht geladen, erscheinen ihre Entitäten alle als „nicht verfügbar“. Housekeeper fasst das zu einer Ursache zusammen („Integration X ist nicht geladen“, mit Zustand, Fehlertext und den betroffenen Automationen, Skripten und Dashboards). Dasselbe gilt für ein Gerät, dessen Entitäten alle ausgefallen sind. Ein Gerät, das wegen seiner Integration ausgefallen ist, zählt dabei als Folge mit, nicht als zweites Problem. Der Block steht über der Befundliste und in „Was muss ich jetzt tun?“; die Folgebefunde stehen eingeklappt darunter und erscheinen einzeln in der Ansicht **Einzeln** (der Export enthält sie immer). Ausgeblendete und mit einem Vermerk versehene Befunde zählen nicht mit. Die Ursache zählt im Zustand einmal für alle ihre Folgen; die Zuordnung ist ein Hinweis, kein Beweis. Jede nicht geladene Integration ist ab der ersten Minute ein Befund; die Dauer bestimmt den Schweregrad: unter 1 Stunde Info, ab 1 Stunde Niedrig, ab 1 Tag Mittel, ab der eingestellten Zahl Tage oder mit betroffenen Automationen Hoch. Die Detailseite nennt, wie lange der Ausfall dauert und wann er schwerer wiegt.
- **Status der Befunde**: Bekannt (mit Begründung), Zurückgestellt (mit Frist) und Ausgeblendet; automatisch kommen Neu, In Arbeit (ein Plan läuft oder liegt vor) und Erledigt dazu (Pläne, die etwas behoben haben, und Befunde, die von selbst endeten; 7, 30 oder 90 Tage). Die Liste filtert danach, die Sammelauswahl markiert mehrere Befunde auf einmal als bekannt oder stellt sie zurück. Bei einem möglichen Duplikat gibt es „Ist kein Duplikat“. Ein Status bleibt gespeichert, auch wenn sein Befund verschwindet (etwa weil das Gerät wieder läuft), und greift beim nächsten Mal wieder. Unter Einstellungen → Ausnahmen & Vermerke steht er dann als **ruhend**, mit „zuletzt am …“; nach 30 Tagen ohne den Befund fragt die Liste „noch nötig?“, und Entscheidungen zu Objekten, die es nicht mehr gibt, sind markiert. Einzeln über ⋮ oder für die Auswahl lassen sie sich entfernen.
- **Befunde ausblenden**: Ein Befund lässt sich auf der Detailseite ausblenden (nur in Housekeepers eigener Liste, Home Assistant bleibt unverändert). Für ganze Gruppen gibt es Regeln: Unter **Einstellungen → Ausnahmen** nennt eine **Ausnahmeregel** einen Bereich, ein Label, eine Integration oder eine Domain wie `media_player` (Geräte und ihre Entitäten; eine Entität ohne Bereich nimmt den ihres Geräts). **Urlaubsmodus:** Wähle dort eine Entität (Helfer, Schalter, Zeitplan oder Kalender); solange sie `on` ist, gelten Regeln „nur im Urlaubsmodus“, und eine Leiste zeigt, wie viele Befunde zurückgehalten werden. Nach dem Urlaub zählt der Ausfall solcher Objekte ab dessen Ende: mit eigener Verzögerungsregel deren Frist, sonst die Nachfrist (Standard 24 Stunden). Regeln können auch einzelne Geräte und Entitäten nennen. Das hilft bei Geräten, die oft absichtlich aus sind: eine Regel mit Frist ersetzt eine Regel je Gerät. Die Regel blendet die Befunde dieser Objekte aus oder meldet einen Ausfall erst nach den eingestellten Tagen. Passen mehrere Regeln, schlägt Ausblenden eine Frist, und die längste Frist gilt. Alternativ blendet das Label `housekeeper_ignore` an einer Entität, einer Automation oder einem Gerät (samt seinen Entitäten) deren Befunde aus. Housekeeper legt dieses Label nicht automatisch an: Erstelle es einmal in Home Assistant unter **Einstellungen → Bereiche, Labels & Zonen → Labels** mit dem exakten Namen `housekeeper_ignore` und weise es anschließend dem Objekt zu, das Housekeeper ignorieren soll. Ausgeblendete Befunde zählen nicht in Übersicht, Sensoren und Reparaturhinweisen und lassen sich über **Ausgeblendete anzeigen** wieder einblenden. Beim Ausblenden wählst du die Art: **Ausgeblendet**, **Bewusst behalten** (mit Pflicht-Begründung) oder **Später erinnern**, optional mit Dauer (7, 30, 90 oder 365 Tage). Läuft die Frist ab, erscheint der Befund wieder in der Liste, markiert als **Wiedervorlage fällig** und filterbar. Begründung und Frist stehen in der Liste der ausgeblendeten Befunde.
- **Labels** (Einstellungen → Ausnahmen, unter den Regeln): Der Block zeigt die drei festen Labels `housekeeper_keep` (nichts aufräumen, Befunde bleiben), `housekeeper_ignore` (Befunde ausblenden) und `housekeeper_critical` (Objekt ist wichtig). Pro Label steht, was es bewirkt, ob es in Home Assistant angelegt ist und an wie vielen Objekten je Typ es hängt (Stand des letzten Scans); „Objekte anzeigen“ öffnet das Inventar mit dem Label als Filter, „Name kopieren“ hilft beim Anlegen in Home Assistant. Housekeeper legt die Labels nicht selbst an.
- **Vermerke**: Auf der Detailseite (Reiter Aktionen, Abschnitt „Notizen“) eines Geräts, einer Entität, einer Integration oder einer App sagst du Housekeeper, was zu erwarten ist (auch bei Objekten ohne Befund, zum Beispiel vorab, solange das Gerät noch läuft): **Absichtlich offline**, **Saisonal**, **Reservegerät**, **Wird ersetzt** (mit Ziel) oder **Nicht entfernen**, mit Begründung und optional einem Prüfdatum (30, 90, 180 oder 365 Tage). Ein Vermerk blendet „nicht verfügbar“ bei diesem Objekt aus (bei einem Gerät: bei seinen Entitäten; bei einer Integration oder App: solange sie ausgefallen ist, auch bei ihren Geräten und Entitäten), nie eine kaputte Referenz. **Nicht entfernen** sperrt alle Bereinigungsschritte für das Objekt; dasselbe bewirkt das Label `housekeeper_keep` an einem Gerät oder einer Entität (in Home Assistant mit genau diesem Namen anlegen und zuweisen, auch mehreren Objekten auf einmal). Das Label blendet keine Befunde aus: Fällt das Objekt aus, wird das weiter gemeldet. Die Liste unter **Aufräumen → Geräte deaktivieren** zeigt solche Geräte nicht, ebenso wenig Geräte mit dem Label `housekeeper_ignore` oder einer Ausnahmeregel. Ein Gerät ganz ohne Entität (zum Beispiel das Bluetooth-Untergerät eines ESPHome-Proxys) steht dort mit „Keine Entitäten“. Nach dem Prüfdatum erscheinen die Befunde wieder, markiert als fällig. Vermerke liegen nur in Housekeeper. In den Befunden kannst du an mehreren angekreuzten Objekten gleichzeitig einen Vermerk setzen (**Vermerk setzen**); bei Geräten, die ganz ausgefallen sind, setzt „bei ganz ausgefallenen Geräten am Gerät statt an jeder Entität“ einen Vermerk am Gerät, der alle seine Entitäten abdeckt. Läuft ein Gerät noch teilweise, gibt es den Vermerk am Gerät nicht, damit Entitäten, die sonst laufen, weiter überwacht bleiben. Ein Vermerk (außer „Nicht entfernen“) kann ein **Zeitfenster** haben: zu festen Zeiten (zum Beispiel 21:00 bis 06:00 Uhr, auch über Mitternacht) oder bei Dunkelheit (Sonnenstand von `sun.sun`), dazu eine Anlaufzeit nach dem Ende (Standard 30 Minuten). Nur im Fenster blendet der Vermerk aus; außerhalb meldet Housekeeper den Befund wieder, und der Ausfall einer Integration zählt erst ab dem Ende des Fensters plus Anlaufzeit. So lässt sich zum Beispiel ein solarbetriebener Gartensensor nachts erwartet offline und tagsüber überwachen. Fehlt `sun.sun`, gilt „Bei Dunkelheit“ als nicht aktiv. Bei mehreren angekreuzten Objekten gibt es das Fenster nicht, nur am einzelnen Vermerk.
- **Was du tun kannst**: Auf der Detailseite fasst eine Karte zusammen, was zum Objekt möglich ist: Befunde entscheiden, ersetzen, Deaktivieren planen, ein Label ergänzen. Alles öffnet nur eine Vorschau unter Aufräumen.
- **Zeitlich zusammen mit Updates**: Befunde, die zur selben Zeit begannen wie ein Update von Home Assistant oder einer Integration, tragen einen Hinweis „Zeitlich zusammen mit …“, haben eine Kachel und einen Filter „Nach Update neu“ und stehen gruppiert unter Änderungen. Neustarts und Bereinigungspläne erscheinen nur als Gruppe. Die Karte **Vorfälle nach Updates** über der Befundliste ist eine Liste mit Ereignis, Zeitpunkt, Befunden und Beobachtung; eine Zeile klappt ihre Details auf, und **n Befunde in der Liste zeigen** filtert die Befundliste auf diesen Vorfall. Es ist ein zeitlicher Zusammenhang, keine Ursache; nur Ereignisse seit dem Ereignisprotokoll zählen.
- **Beobachtung nach Updates**: Nach einem Update von Home Assistant, Betriebssystem oder Supervisor scannt Housekeeper einen Tag lang zusätzlich (30 Minuten, 2 und 6 Stunden danach und am Ende) und vergleicht mit dem Stand vor dem Neustart. Updates einzelner Integrationen starten sie nicht; dafür gibt es die Befunde und den zeitlichen Zusammenhang. Ein Band im Seitenkopf (ein Klick führt zur Auswertung) zeigt, solange es läuft, wie viele Objekte betroffen sind; die Karte auf der Befundseite nennt, was seither ausfiel, kurz gestört war oder wieder läuft, und sagt „unbekannt“, wenn ein Vergleich nicht möglich ist. Neue Reparaturen seit dem Update stehen in einem eigenen Abschnitt und zählen als Verschlechterung. Objekte, die danach erreichbar sind, aber keinen Wert haben, stehen in einer eigenen Gruppe „Seitdem ohne Wert". Objekte mit einem Vermerk (z. B. absichtlich offline) zählen nicht als neu ausgefallen; den Vermerk setzt du direkt in der Zeile. Das ist ein zeitlicher Zusammenhang, keine Ursache. Die Dauer stellst du unter Einstellungen → Scan und Meldungen ein (`watch_hours`, Standard 24, 0 schaltet aus).

#### Befunde, Export und Reparaturhinweise

- Befundliste mit Begründung und Sicherheit der Diagnose; Export als **CSV** oder **JSON** (berücksichtigt den gewählten Filter)
- **Hinweis bei Objekten, die oft ausfallen:** Fällt eine Entität oder ein Gerät regelmäßig aus (instabil, flatternd oder immer zur selben Tageszeit, aus den Zuverlässigkeitszahlen), zeigt der Befund einen Chip wie „Fällt meist zwischen 22 und 00 Uhr aus“, und der Reiter **Aktionen** fragt „Absichtlich?“ mit einem vorbereiteten Vermerk (absichtlich offline, Zeitfenster aus dem Muster, Prüfung nach 90 Tagen). Gezählt wird auch Zeit ohne Wert (`unknown`, etwa im Standby), aber nur für dieses Muster, nicht für die Verfügbarkeit. Über der Befundliste sammelt die Karte **Vorschläge für Vermerke** alle diese Objekte: Entitäten eines Geräts, die zur selben Zeit ausfallen, in einer Zeile („TV: 3 Entitäten“). Der Vermerk geht an jede dieser Entitäten, nicht an das Gerät; die übrigen Entitäten bleiben überwacht. Am ganzen Gerät nur, wenn es ganz ausgefallen ist. Die Karte ist eine Liste wie die anderen: Kästchen auswählen, dann in der Auswahlleiste **Vermerken** (bei mehreren nach einer Rückfrage) oder **Nicht mehr fragen**; einzeln geht beides über das Menü ⋮ der Zeile. Ohne deinen Klick wird nichts gesetzt. „Nicht mehr fragen“ gilt 180 Tage in diesem Browser, für genau diese Entitäten. Es braucht den Recorder und einige Tage Verlauf.
- **Ausfälle nach Dauer:** Eine nicht verfügbare Entität, ein Gerät, eine Integration oder eine App wird erst nach der **Info-Schwelle** (Standard 15 Minuten) ein Befund und steigt mit der Dauer: **Info**, ab 1 Stunde **niedrig**, ab 1 Tag **mittel**, ab 7 Tagen **hoch** (alle vier Schwellen unter **Konfigurieren**, sie müssen aufsteigen). Info und niedrig stehen nur auf der Befundseite; die Übersicht, die Sensoren, die Reparaturhinweise und „neue Befunde“ zählen ab mittel. Wo eine Integration nicht starten kann (`setup_error`, `migration_error`, `failed_unload`), ist der Befund sofort mindestens mittel. Eine Entität mit `unknown` ist ein Befund nur, wenn sie vorher einen Wert hatte. Haben alle Entitäten eines Geräts keinen Wert mehr (deaktivierte, verwaiste und solche, die nie einen Wert hatten, zählen nicht mit), etwa im Standby, ist das Gerät „ganz ausgefallen“ und seine Entitäten stehen in der Ansicht „Gruppiert“ als Folgen darunter. Dann setzt **Vermerk am Gerät setzen** im Menü ⋮ der Zeile einen Vermerk für alle. Fehlt nur bei einigen Entitäten der Wert, ist das kein Geräteausfall; ein Vermerk gehört dann an die betroffenen Entitäten. Damit die Schwellen zur Zeit greifen, plant Housekeeper bei einem Ausfall einen zusätzlichen Scan zu den Schwellen; dieser Scan verändert den Verlauf und den Vergleichspunkt „letzter Scan“ nicht. Verwaiste Entitäten werden weiter sofort gemeldet.
- **Mögliche Duplikate**: Eine nicht funktionierende Entität mit Zahlensuffix (`…_2`), zu der es eine funktionierende Entität derselben Integration mit gleicher Basis-ID gibt, wird als Überbleibsel markiert. Auch der umgekehrte Fall zählt: Die alte `sensor.x` ist übrig und die neue `sensor.x_2` läuft, sofern genau eine solche Entität am selben Gerät hängt oder denselben Namen trägt. Beim Ersetzen ist die funktionierende Entität vorbelegt.
- **Nicht mehr bereitgestellt**: Eine Entität, die ihre Integration (oder YAML-Plattform) nicht mehr anlegt, obwohl die Integration läuft, hält Home Assistant nur noch als Platzhalter. Housekeeper führt sie als **verwaist** statt als „nicht verfügbar“, nach derselben Wartezeit wie ein Ausfall. Sie lässt sich direkt entfernen, ohne Quarantäne, aber mit Vorschau und Bestätigung. Beim Start oder bei einer Integration, die nicht lädt, gilt das nicht.
- **Ungenutzte Automationen**: lange ausgeschaltet, seit langem nicht ausgelöst oder nie ausgelöst (mit Alter der Automation)
- Automatischer Scan alle 6 Stunden (einstellbar), damit Verlauf und Hinweise aktuell bleiben
- Hinweise unter **Einstellungen → Reparaturen**: je ein zusammengefasster Eintrag pro Gruppe mit Link ins Panel. Sie sind rein informativ und bieten keine Reparatur an. Jede Gruppe hat einen Schalter auf der Geräteseite von Housekeeper (Bereich **Konfiguration**), der den Hinweis sofort ein- oder ausschaltet. Aus dem Hinweis wird dann nichts mehr angelegt, und ein vorhandener verschwindet. Standardmäßig an sind **defekte Referenzen**, **Scan-Probleme**, **beschädigte Datenbank** und **Backup-Problem**. Aus sind **verwaiste Entitäten**, **nicht verfügbare Entitäten** und **verwaiste Statistiken**, denn sie betreffen das Aufräumen und stehen im Panel. Wer die ersten beiden schon vor den Schaltern in den Reparaturen hatte, behält sie, bis er sie ausschaltet. Für die vier Gruppen, die etwas zählen (verwaiste Entitäten, nicht verfügbare Entitäten, defekte Referenzen, verwaiste Statistiken), gibt es im selben Bereich zusätzlich eine Zahl „Reparaturhinweis erst bei mehr als“. Bei 0 (Standard) erscheint der Hinweis ab einem Befund, bei 5 erst ab sechs.
- **Diagnosedaten** für Fehlerberichte (Integration → Diagnosedaten herunterladen) enthalten nur Zählwerte, keine Namen oder IDs.

#### Änderungen seit dem letzten Scan

Die Ansicht **Änderungen** vergleicht den aktuellen Stand mit dem Scan davor oder mit dem letzten Scan jedes früheren Tages (standardmäßig 30 Tage aufbewahrt, unter Einstellungen von 1 bis 365 einstellbar, mit Zeitleiste der gespeicherten Scans): Statuswechsel (verschlechtert zuerst), neue und behobene Befunde sowie neue und entfernte Objekte. Du kannst eigene datierte Notizen in die Zeitleiste eintragen. Der Verlauf wird kompakt in Home Assistant gespeichert und enthält nur Status und IDs; Notizen enthalten den von dir eingegebenen Text und das optionale Ziel.

- **Wochenbericht**: Unter Änderungen speichert „Wochenbericht“ den Vergleich mit dem Stand von vor etwa einer Woche als Markdown-Datei (neue und behobene Befunde, neue und entfernte Objekte, Statuswechsel, lauteste Entitäten im Recorder, wenn berechnet).

### Inventar und Diagnose

#### Installationsübersicht

- Inventar für Entitäten, Geräte, Integrationen beziehungsweise Config Entries, Bereiche, Etagen, Labels und Automationen, filterbar nach Typ, Status und Label; Entitäten lassen sich dort gesammelt deaktivieren, aktivieren, aus- und einblenden (Plan mit Vorschau und Rückgängig)
- Suche nach Name, Objekt-ID, Unique ID, Plattform oder Integration
- Filter nach Objekttyp und Zustand
- sortierbares und paginiertes Inventar für größere Installationen
- Übersicht der Objektanzahl und aktuellen Befunde

#### Entitäts- und Gerätediagnose

Housekeeper unterscheidet zwischen:

- einer aktiven Entität mit aktuellem Zustand
- einer Entität mit dem Zustand `unknown`
- einer Entität mit dem Zustand `unavailable`
- einer absichtlich deaktivierten Entität
- einer Entität an einem deaktivierten Gerät
- einer Entität aus einer deaktivierten Integration
- einer Entität, deren Gerät nicht mehr in der Geräte-Registry existiert
- einer Entität, deren Config Entry nicht mehr existiert
- einer registrierten Entität, für die kein Zustand mehr vorhanden ist

Für jede durchgehend beobachtete Klassifikation speichert Housekeeper, wann sie erstmals erkannt wurde. Dieser Zeitpunkt wird ausdrücklich als **erster Housekeeper-Nachweis** bezeichnet – nicht als vermeintliches Lösch- oder Ausfalldatum.

#### Apps, Geräteverlauf und weitere Quellen

- **Apps im Inventar**: Mit einem Supervisor sind installierte Apps (Add-ons) Objekte wie alle anderen: Typ **App** im Inventar, Status (läuft, gestoppt; gestoppt ist kein Problem), Version und anstehendes Update. Die Detailseite hat Übersicht, **Rechte** (aus Zugriffe & Datenfluss), **Last & Speicher** (aus Speicher & System) und Technik; die Listen dort öffnen sie. Apps erzeugen keine Befunde und zählen nicht in die Gesundheit; Housekeeper ändert nichts an Apps. Ohne Supervisor gibt es den Typ nicht.
- **Verlauf eines Geräts**: Der Reiter **Verlauf** im Gerät zeigt entdeckt, in Quarantäne, durch einen Plan deaktiviert, ersetzt oder entfernt und ob es jetzt instabil ist. Entfernt oder vergisst ein Plan ein Gerät, schreibt Housekeeper das ins Logbuch; der Reiter **Entfernt und gelöscht** im **Journal** listet, was ein Plan entfernt, vergessen oder gelöscht hat (Geräte, Entitäten, Automationen, Statistiken, Backups), zusammen mit diesem Eintrag, den du öffnen kannst, um einen Grund zu ergänzen, und mit einem Sprung zum Plan. Die Liste stammt aus den Plänen im Journal: ausgeführte Pläne bleiben bis zu einem Jahr, höchstens 300; danach fällt auch das Gerät aus der Liste.
- **Weitere Referenzquellen**: Gruppen (Mitglieder) und Helfer wie Template, Ableitung oder Min/Max-Sensor (Quell-Entitäten) werden in Abhängigkeiten und Auswirkungsanalyse berücksichtigt; fehlende Mitglieder und Quellen werden als Befund gemeldet.

#### Abhängigkeitsansicht

Die Abhängigkeitsansicht stellt direkte Beziehungen dar, zum Beispiel:

```text
Integration → besitzt → Gerät → stellt bereit → Entität
Etage → enthält → Bereich → enthält → Gerät
Automation → reagiert auf / prüft / steuert → Entität oder Gerät
```

Jede Beziehung besitzt eine Vertrauensstufe. Explizite Registry- und Konfigurationsbeziehungen gelten als sicher; von Home Assistant zur Laufzeit ermittelte Referenzen werden gesondert gekennzeichnet.

### Automationen und Skripte

#### Automationsanalyse

- Auflistung der geladenen Automationen und ihres aktuellen Zustands
- Anzeige von Modus, Parallelitätsgrenzen, letzter Auslösung und Blueprint-Herkunft
- Darstellung von Triggern, Bedingungen und Aktionen in der Detailansicht; der Reiter **Ablauf** zeigt sie als Baum (Wenn/Dann, Wiederholungen, parallele Schritte) mit Klartext je Schritt, anklickbaren Entitäten und rot markierten Schritten mit fehlenden Objekten oder Befunden
- Ermittlung von Entitäts-, Geräte-, Bereichs-, Etagen- und Labelreferenzen
- Einbeziehung der von Home Assistant zur Laufzeit erkannten Referenzen, darunter viele Templatereferenzen
- Erkennung von Referenzen, deren Ziel nicht mehr existiert
- genaue Fundstelle für explizite Referenzen, soweit verfügbar
- Skripte, Szenen und Dashboards werden ebenso auf Referenzen und fehlende Ziele geprüft; die Detailseite zeigt unter **Auswirkung einer Entfernung**, was eine Entfernung betreffen würde (nur Analyse, ohne Änderung)

#### Qualität, Läufe und Hinweise

- **Automations-Diagnose** (Reiter „Qualität“ in der Lauf-Ansicht): Sieben getrennte Blickwinkel je Automation, bewusst ohne Gesamtnote: Integrität, Zuverlässigkeit, Wirksamkeit, Wartbarkeit, Restart-Festigkeit, Effizienz und Konflikte; „unbekannt“ heißt, dass es noch nichts zu beurteilen gibt. Pro Automation lassen sich **Erfolgskriterien** festlegen (Zielentitäten, Sollzustand, Frist, optional Mindestdauer, oder: ein Dienst wie eine Benachrichtigung oder ein Skript wird vom selben Lauf aufgerufen, zugeordnet über den Kontext des Laufs); danach führt Housekeeper je Auslösung einen Verlauf erreichter und verfehlter Kriterien. Wiederholt verfehlte Ziele werden zu einem Befund und stehen unter „Was muss ich jetzt tun?“. Auf Wunsch zählt die **Abdeckung**, welcher Trigger und welcher Zweig gelaufen ist und welche nie (Standard aus; der Trace wird dafür kurz im Arbeitsspeicher gelesen, gespeichert werden nur Zähler). Zwei Läufe lassen sich **vergleichen** (anderer Trigger, Zweig, Ende, Laufzeit, Updates dazwischen). Der **Testlauf** erklärt, was eine Automation mit den aktuellen und eigenen Testzuständen tun würde; er führt nie etwas aus und markiert kritische Ziele wie Schlösser und Garagentore.
- **Refactoring-Hinweise** (nur lesen) für Automationen: Geräte-Trigger, lange Verzögerungen und Zweige, die nie zutreffen können. Ein Refactoring-Assistent, der Automationen mit Vorschau und Rückgängig umbaut, ist experimentell und standardmäßig aus.
- **Automationen** (Menü Betrieb): zählt alle 15 Minuten die Läufe, die Home Assistant je Automation und Skript kurz vorhält (standardmäßig 5), und merkt sich 60 Tage lang nur Zähler je Tag und die Stelle eines Fehlers, keine Variablen, Daten oder Fehlertexte. Die Ansicht nennt Auffälliges mit den Zahlen dahinter: viele Fehler, abgewiesene Läufe wegen „Already running“ oder `max`, nie erfolgreich, fast immer an einer Bedingung beendet, ungewöhnlich oft oder lange, Fehlerquote nach einem Update (als zeitlicher Zusammenhang) sowie Wartezeiten ab 5 Minuten, Warten ohne Timeout und `continue_on_error`. Ein fehlerfreier Lauf heißt nicht, dass die Automation ihren Zweck erfüllt. Die Liste lässt sich durchsuchen, nach Typ und „mit Fehlern“ filtern und nach Spalten sortieren. Auf der Detailseite einer Automation oder eines Skripts zeigen die Eckdaten Läufe, Fehler, Bedingung, Dauer und die 7-Tage-Balken, der Tab **Läufe** die Einzelheiten. Dazu führt Housekeeper ein kleines Protokoll der Versionswechsel von Home Assistant und benutzerdefinierten Integrationen sowie der Neustarts. Darunter stehen **Konflikte und Schleifen**: zwei Automationen, die dieselbe Entität gegensätzlich steuern (an gegen aus, zwei verschiedene feste Werte) und gemeinsam auslösen können (gleicher Auslöser oder sich überschneidendes Zeitfenster), sowie Ketten aus Auslösern und Aktionen, die über Gruppen, Helfer oder andere Automationen zum Anfang zurückführen. Jeder Fund trägt eine Stufe: „möglich“ (nur die Konfiguration erlaubt es), „beobachtet“ (alle beteiligten Automationen liefen am selben Tag) oder „wiederholt“ (an mindestens 3 von 7 Tagen); gezählt wird je Tag, die Reihenfolge der Läufe ist unbekannt. Housekeeper führt nichts aus und nennt nichts einen sicheren Fehler.

### Aufräumen und Reparieren

#### Aufräumen

- **Bereinigung**: Die Ansicht **Aufräumen** prüft ausgewählte verwaiste oder lange nicht verfügbare Entitäten in einem Dry Run: ohne bekannte Verwendung, zu prüfen oder blockiert (sichere Verwendung, funktionierende Entität), samt Verweisen und Hinweis auf Langzeitstatistiken. Housekeeper ändert dabei nichts. Ein Plan lässt sich ausdrücklich bestätigen (Wort eintippen) und ausführen; ausführbar sind das **Deaktivieren** als Quarantäne (Registry-Eintrag, Historie und Statistiken bleiben unverändert) sowie, nach den unten genannten Bedingungen, das **Entfernen**, die Gerätebereinigung, das Ersetzen von Verweisen und der Zählerwechsel. Blockierte Einträge laufen nie, „zu prüfen“ nur mit Einzelbestätigung. Vor jedem Schritt wird neu geprüft; hat sich eine Entität seit der Vorschau geändert, bricht der Lauf ab. Danach prüft Housekeeper das Ergebnis. Die meisten Schritte lassen sich im Journal rückgängig machen, solange die Entität unverändert ist; die Langzeitstatistik eines Zählerwechsels lässt sich nur mit dem Backup zurücksetzen. Quarantäne-Hinweis: Eine Karte zeigt, seit wann eine Entität in Quarantäne ist und ab wann ein späteres Entfernen frühestens vorgesehen wäre (14 Tage). Jeder Plan steht im Journal (Pläne, die ausgeführt wurden, bleiben als Protokoll erhalten). **Entfernen** (Registry-Eintrag löschen) ist nur für Entitäten möglich, die mindestens 14 Tage in Quarantäne waren: Housekeeper legt vorher ein Home-Assistant-Backup an (nur Home Assistant, ohne Apps und Ordner, ohne Datenbank, außer der Plan schreibt in sie; Speicherorte und Verschlüsselung wie bei deinen automatischen Backups, oder, wenn du keine Backups eingerichtet hast, der lokale Speicher von Home Assistant ohne Passwort, worauf Vorschau und Ergebnis hinweisen; es erscheint als eigenes Backup „Housekeeper …“ und zählt nicht als dein reguläres), wartet auf dessen erfolgreichen Abschluss und startet sonst nichts. Der Registry-Eintrag steht im Journal, sodass sich eine entfernte Entität wiederherstellen lässt, solange ihre ID frei ist und die Integration noch existiert; sie ist danach wieder in Quarantäne.
  **Geräte** folgen denselben Regeln: *Deaktivieren* (Quarantäne) ist nur möglich, wenn keine Entität des Geräts mehr funktioniert, nichts am Gerät hängt (Hubs und Koordinatoren sind gesperrt) und nichts es sicher verwendet. Untergeräte (Child Devices) zeigt Housekeeper an, bereinigt sie aber nie; ein Gerät mit Untergeräten zählt wie ein Hub. *Entfernen* nutzt den offiziellen Weg von Home Assistant (die Integration wird gefragt und kann ablehnen) und ist erst nach 14 Tagen Quarantäne und mit Backup möglich. *Lokal vergessen* ist nur für Integrationen gedacht, die kein reguläres Entfernen anbieten: Housekeeper entfernt den Registry-Eintrag und lädt die Integration neu; das Quellsystem (Gerät, Hub, Cloud) bleibt unverändert, und taucht das Gerät wieder auf, zeigt eine Karte **Wiederkehrende Geräte** das an. Beim Entfernen verschwinden auch die Entitäten des Geräts; Wiederherstellen legt den Registry-Eintrag aus dem Journal neu an, ob die Integration die Entitäten wieder bereitstellt, entscheidet sie selbst. Deshalb braucht jedes Entfernen eine Einzelbestätigung.
  **Verweise ersetzen** tauscht eine alte Entität gegen eine neue überall dort, wo sie exakt eingetragen ist: Automationen, Skripte und Szenen (YAML-Dateien), Dashboards im Speichermodus und das Energie-Dashboard. Die Vorschau zeigt je Quelle die Änderungen. Templates, YAML-Dashboards, Helfer und Dateien mit `!secret`/`!include` ändert Housekeeper nicht, sondern listet sie zur Handarbeit. Jede Quelle wird vorab im Journal gesichert (Kommentare in YAML-Dateien gehen beim Schreiben verloren, wie beim Home-Assistant-Editor; beim Rückgängigmachen wird die ursprüngliche Datei bytegenau zurückgeschrieben, solange sie unverändert ist, sonst nur der geänderte Eintrag), ein Backup ist Pflicht, und das Zurücksetzen klappt, solange die Quelle noch genau so ist, wie Housekeeper sie hinterlassen hat. Historie und Statistiken werden dabei nicht verschoben oder zusammengeführt (dafür gibt es den Zählerwechsel).
  **Zählerwechsel** führt die Historie eines ersetzten Zählers mit dem neuen zusammen. Housekeeper prüft zuerst, ob beide Statistiken zusammenpassen (gleiche Einheit und Art), und zeigt vorab Umschaltpunkt, Lücken, Überlappungen und den Übergang der Summe. Zur Wahl stehen drei Wege: die Langzeitstatistik des alten Zählers vor die des neuen kopieren und dessen Summe um den alten Endstand verschieben (die Rohwerte des neuen Zählers bleiben unverändert), den neuen Zähler die ID des alten übernehmen lassen (der alte zieht auf eine freie `_alt`-ID um; Home Assistant verschiebt Historie und Statistik mit der ID, Automationen und Dashboards laufen ohne Umschreiben weiter) oder beides. Vorhandene Werte werden nie überschrieben: überlappende Werte des alten Zählers werden nicht kopiert. Das Schreiben der Statistik ist experimentell, braucht das Backup und lässt sich nur damit zurücksetzen; die ID-Übernahme lässt sich über das Journal zurückgeben. Nur die stündliche Langzeitstatistik wird zusammengeführt, nicht die Rohzustände und nicht die Kurzzeitstatistik der letzten Tage. Danach kann der alte Zähler in Quarantäne.
  **Zählerfehler bereinigen** repariert einen Zähler, der kurz einen falschen Wert geliefert hat (zum Beispiel ein Wasserzähler, der für Stunden von 91 auf 41 m³ fiel). Home Assistant zählt den Rücksprung als neuen Verbrauch und verfälscht damit die Summe. Housekeeper findet solche Ausreißer (Werte, die die Reihenfolge brechen und danach wieder zurückkehren, höchstens 48 Stunden lang; ein dauerhaft niedriger Wert wie bei einem Zählertausch wird nie angefasst) und ersetzt die falschen Werte im Verlauf, in den 5-Minuten-Werten und in den Stundenwerten, entweder durch den letzten guten Wert oder auf einer geraden Linie zum nächsten. Die verfälschte Summe wird neu berechnet. Die Vorschau zeigt den Verlauf vorher und nachher und die Zeilen je Tabelle. Das schreibt in die Recorder-Datenbank: nur im Schutzmodus „voll“, mit Backup, mit Prüfung danach, und die überschriebenen Werte bleiben im Journal, sodass sich alles zurückspielen lässt, solange niemand die Zeilen danach geändert hat. Mehr als 5000 Zeilen in einem Lauf lehnt Housekeeper ab; ist das Datenbankschema unbekannt, schreibt es nichts.

  **Gezielt bereinigen** funktioniert auch für einen Fehler, den du selbst gesehen hast, bei einem Zähler oder einem Messwert (Temperatur, Leistung …): Sensor und Zeitraum (höchstens 31 Tage) wählen, dazu den letzten guten Wert, eine gerade Linie oder einen festen Wert. Die Vorschau zeigt, welche Daten es für den Zeitraum noch gibt (Verlauf roh, 5-Minuten-Werte, Stundenwerte), und je Tabelle Zeile für Zeile den Wert vorher und nachher. Bei Messwerten werden die Stundenwerte aus den korrigierten 5-Minuten-Werten neu berechnet; sind diese schon gelöscht, bekommt der Stundenwert den Ersatzwert und gilt als Schätzung. Ein Zähler darf dabei nicht sinken; ohne guten Wert davor und danach wird nichts geschrieben. Den Zeitraum wählst du an den Datumsfeldern oder an zwei Reglern unter dem Verlauf des Sensors (letzte 1 bis 365 Tage). Die Prüfung findet auch bei Messwerten Ausschläge weit außerhalb des Üblichen (zum Beispiel 85 °C bei einer Raumtemperatur, die danach wieder normal ist) und übernimmt den Zeitraum auf Knopfdruck ins Formular; Werte innerhalb dessen, was der Sensor sonst auch meldet (Leistungsspitzen, Regen), meldet sie nie. Sicherheit, Backup, Prüfung und Rückgängig wie oben; hat jemand nach der Bereinigung einzelne Zeilen geändert, spielt „Rückgängig“ alle übrigen Zeilen zurück und lässt die geänderten stehen.
- **Gerät austauschen**: Unter Aufräumen wählst du das alte und das neue Gerät. Housekeeper schlägt zu jeder alten Entität passende neue vor (Geräteklasse, Einheit, Bereich, Name) und nimmt nichts vorweg: Jedes Paar bestätigst du einzeln, bei Zählern wählst du, ob Referenzen ersetzt oder der Zählerverlauf übernommen wird. Daraus entsteht eine normale Vorschau mit Backup, Prüfung und Rückgängig. Das alte Gerät deaktivierst du danach über „Gerät deaktivieren“.
- **Umbenennen und zuweisen**: Eine Entitäts-ID lässt sich zusammen mit exakten Verweisen in Automationen, Skripten, Szenen und Dashboards im Speichermodus umbenennen; ursprüngliche ID und Dateien bleiben für Rückgängig verfügbar, solange sie unverändert sind. Entitäten und Geräte ohne Bereich können per Plan einen Bereich erhalten, mit einem Vorschlag aus Gerät oder Integration.
- **Kritische Objekte bereinigen**: Aktionen im Aufräumen auf kritischen Objekten (siehe Auswirkung) verlangen eine eigene Bestätigung pro Objekt, auch wenn sonst nichts dagegen spricht. Richtlinien-Verstöße lassen sich wie Befunde ausblenden, behalten (mit Begründung) oder auf Wiedervorlage legen.
- **Recorder-Daten beim Entfernen**: Beim Entfernen von Entitäten oder Geräten wählst du in der Werkzeugleiste, was mit den Recorder-Daten geschieht: **Behalten** (Standard), **Statistik löschen** oder **Statistik und Verlauf löschen**. Die Wahl gilt für den ganzen Plan. Sie ist nicht umkehrbar (nur mit dem Backup), deshalb bestätigst du jede Entfernung einzeln; sie ist gesperrt, wenn das Energie-Dashboard die Entität nutzt oder kein Recorder da ist. Die Vorschau nennt die genauen Zeilenzahlen.
- **Nicht verwendet**: Eigene Ansicht mit aktiven Entitäten, die in keiner Automation, keinem Skript, keiner Szene, Gruppe, keinem Helfer und keinem lesbaren Dashboard vorkommen (ohne Diagnose- und Konfigurations-Entitäten). Entitäten und verwaiste Statistiken stehen in Tabellen, die sich filtern und nach Spalten sortieren lassen (Entitäten: Gerät, Bereich, Integration, letzte Änderung, letzte Meldung, beobachtet seit; Statistiken: Art, Einheit, letzter Eintrag, Energie-Dashboard); auf dem Handy erscheinen sie als Karten. Rein ein Hinweis und kein Befund: Sprachassistenten, Apps, automatisch erzeugte Dashboards oder externe Systeme sieht Housekeeper nicht.
- **Recorder-Reste löschen** (Nicht verwendet → Verwaiste Statistiken): Reihen auswählen und daraus einen Plan unter Aufräumen erstellen (Vorschau, Bestätigung je ID und Eintippen des Worts), standardmäßig auch mit den gespeicherten Zuständen (das Kästchen lässt sich abwählen). Housekeeper legt vorher ein Home-Assistant-Backup an und löscht nur, wenn es gelingt; Reihen im Energie-Dashboard, bestehende Entitäten und externe Statistiken sind ausgenommen. Prüft danach, dass die Statistik weg ist, und hält den Lauf im Journal fest. Zurück geht es nur über das Backup. Schreibende Aktionen laufen nie gleichzeitig; eine zweite meldet „beschäftigt“.
- **Nachfolger-Vorschläge** beim Verweis-Ersetzen und beim Zählerwechsel: ähnliche aktive Entitäten derselben Domain (und Einheit) als Knöpfe unter dem Feld. Sie füllen nur das Feld, ausgewählt wird nichts automatisch.

#### Pläne, Nachkontrolle und Protokoll

- **Geführte Pläne und weitere Wartungsaktionen**: Pläne führen durch Auswahl, Einstellung, Vorschau, Bestätigung, Ausführung und Ergebnis. Housekeeper kann gespeicherte Zustände kürzen, die älter als 7 bis 90 Tage sind (Statistiken bleiben erhalten), geeignete Housekeeper-Backups nach einer Aufbewahrungsregel löschen und eine ungenutzte Automation aus `automations.yaml` entfernen. Diese Aktionen zeigen zuerst ihren genauen Umfang; endgültige Löschungen werden deutlich gekennzeichnet. Die Backup-Bereinigung schützt Backups beobachteter Pläne und das neueste Backup, das noch für Rückgängig benötigt wird.
- **Nachkontrolle, Endzustand und Prüfbericht**: Nach einem ausgeführten Plan beobachtet Housekeeper 24 Stunden lang, ob neue defekte Referenzen, nicht verfügbare Entitäten oder wiederkehrende Geräte auftauchen (**sauber** oder **Rückfall**, Rückfälle stehen unter „Was muss ich jetzt tun?“). Die Vorschau zeigt vorab den erwarteten Endzustand, und zu jedem Plan gibt es einen Prüfbericht als Markdown, mit echten Namen und IDs, auf Wunsch mit Platzhaltern statt IDs und Namen (zum Teilen). Optional und experimentell (Standard aus) schlägt Housekeeper kleine mechanische Verbesserungen einer Automation vor (Beschreibung ergänzen, völlig gleiche Trigger entfernen, Timeout bei Warteschritten ergänzen, Modus und Limit ändern; danach beobachtet Housekeeper 24 Stunden lang, ob die Automation Fehlerläufe bekommt), jeweils als Plan mit Diff, Prüfung durch Home Assistant, Backup und Rückgängig; Blueprint-Automationen werden nicht angefasst. Mehrere offene Vorschau-Pläne lassen sich im Journal zu einem Plan zusammenführen; er wird neu bewertet, Widersprüche (dasselbe Objekt, verschieden angefragt) werden genannt und nicht still entschieden.
- **Protokoll gelöschter Statistiken**: Jedes Löschen verwaister Recorder-Statistiken wird im Aufräumen vermerkt (Zeit, wer, Backup, was gelöscht und übersprungen wurde). Es lässt sich nicht umkehren, deshalb steht es nur im Protokoll.

### Pflegen

#### Wartung und Backups

- **Wartung**: Die Ansicht **Wartung** beginnt mit dem Reiter **Backups**, oben der **Backup-Schutz** mit einem Urteil (Belastbar, Erst ansehen, Problem), vier Kennzahlen und den Prüfzeilen in vier Gruppen (Sicherung läuft, Ablage und Inhalt, Wiederherstellbarkeit, Housekeeper) und einer Leiste mit der Größe der letzten 14 Backups: Housekeeper beurteilt, ob die Backup-Strategie belastbar ist (Alter des letzten Backups gegen den Zeitplan, fehlgeschlagene Läufe und Ziele, lokale und externe Ablage, ungewöhnliche Größe, Inhalt des neuesten Backups (fehlgeschlagene Apps oder Ordner, fehlende Datenbank), Alter der Kopie je externem Ablageort, Platz fürs nächste Backup (etwa das Eineinhalbfache des letzten, geschätzt), Aufbewahrung, Verschlüsselung, Backup vor Bereinigungen). Emergency Kit und Restore-Test kann Home Assistant nicht erkennen; du bestätigst sie mit Datum, Housekeeper erinnert nach 180 Tagen an den Restore-Test. Für die Prüfung und die Karte „Letzte Backups“ zählen nur Home-Assistant-Backups (automatisch, manuell, von anderen Werkzeugen), keine App-Update-Backups und keine Sicherungen, die Housekeeper vor einem Eingriff anlegt. Sicherst du außerhalb von Home Assistant (etwa das Docker-Volume oder den Host), gibst du das bei „Ziele und Zeitplan“ mit **Sichere extern** an: Dann entfallen die Prüfungen zu Zeitplan, Alter, Ablageort, Größe, Aufbewahrung, Verschlüsselung und Emergency Kit, ebenso das Problem in der Übersicht und das Event `ha_housekeeper_backup_overdue`; der Vorabcheck vor Updates erinnert an ein frisches externes Backup. Platz, Restore-Test und Housekeepers eigene Sicherungen bleiben, die Angabe lässt sich zurücknehmen. Einen externen Ablageort kannst du mit Datum bestätigen, wenn Home Assistant das Ziel nur anhand seines Namens als lokal einordnet. Housekeeper liest nur, löst keine Backups aus und stellt nie selbst wieder her. Ganz unten steht eingeklappt **Housekeeper-Backups aufräumen**: Nur die Backups, die Housekeeper vor riskanten Plänen selbst anlegt, lassen sich dort auswählen und per Plan löschen (mit Bestätigung, ohne Rückgängig); deine regulären Backups bleiben unberührt. Im Reiter **Updates** stehen die offenen Updates, gruppiert nach System (Home Assistant, Betriebssystem, Supervisor), Apps, HACS und Geräten, mit Version, Änderungsliste und einem Sprung nach Home Assistant; Housekeeper installiert nichts. Darüber urteilt ein Gesamturteil (**Bereit**, **Erst ansehen**, **Stopp**) über die Zeilen davor: Backup (nach dem Backup-Schutz), freier Speicher, offene Reparaturen, ausgefallene Integrationen und fehlende Referenzen. Integrationen, die nicht starten, sind nur bei einem Systemupdate ein Stopp; die Speichergrenzen (unter 3 GiB gelb, unter 1 GiB rot) sind geschätzt. Der Knopf **Prüfen** bei der Zeile „Konfiguration“ startet die Konfigurationsprüfung von Home Assistant (einige Sekunden, nur auf Knopfdruck, nichts wird geändert); eine ungültige Konfiguration stellt das Urteil auf Stopp. Was nach einem Update ausfällt oder neu als Reparatur auftaucht, zeigt die Beobachtung nach Updates; beim Start eines Updates von Home Assistant, Betriebssystem oder Supervisor hält Housekeeper den Stand dafür fest. Der Abschnitt „Danach“ auf der Karte nennt den Stand der Beobachtung.
- **Blueprints** (Wartung): Blueprint-Dateien, die niemand nutzt, und Automationen oder Skripte, deren Blueprint fehlt oder nicht lädt. Nur Hinweise. Eine Automation oder ein Skript, dessen Blueprint nicht mehr existiert, ist zusätzlich ein Befund (Home Assistant lädt sie nicht); fehlt derselbe Blueprint für mindestens zwei, steht er als gemeinsame Ursache in der Liste. Die Seite zählt solche Pfade mit.

#### Batterien

- **Batterien**: Eigene Ansicht mit allen Batterie-Entitäten, niedrigste Werte zuerst (niedrig ab 20 %, einstellbar). Sensoren, die Volt statt Prozent melden, zählen nicht als Prozent-Batterie, sondern stehen in einer eigenen Karte: Housekeeper schätzt den Typ aus der höchsten Spannung der letzten Wochen (zum Beispiel 3-V-Knopfzelle, 1,5-V-Zelle, Lithium-Ionen, 12 V), nimmt dessen Grenze und rechnet dieselbe Prognose. Der Typ steht dabei; er ist eine Schätzung.
- **Batterieprognose** (Menü Pflegen → Batterien) **und Wartungserinnerungen** (Pflegen → Erinnerungen): Die Prognose schätzt aus dem Verlauf der letzten fünf Wochen, wann eine Batterie die Grenze erreicht, und fasst Batterien zusammen, die in denselben zwei Wochen fällig werden. Sie verspricht nichts bei zu wenigen Tagen, flachem oder steigendem Verlauf. Du kannst je Gerät den Batterietyp hinterlegen; die Einkaufsliste für 30 Tage gruppiert den erwarteten Bedarf nach Typ, und einen erkannten Batteriewechsel kannst du in den Verlauf übernehmen. Darunter pflegst du eigene Erinnerungen (Filter, Entkalken, Batteriewechsel) mit Name, Abstand in Tagen und letztem Datum; fällige stehen in „Was muss ich jetzt tun?“ und lösen das Ereignis `ha_housekeeper_reminder_due` aus. Housekeeper ändert dabei nichts in Home Assistant. In der Zuverlässigkeit zeigt jeder Eintrag zusätzlich, wie oft seine Einrichtung zuletzt fehlschlug (aus den Scans gezählt).

#### Richtlinien

- **Richtlinien (Pflegen)**: Eigene Regeln für Ordnung, einzeln einschaltbar und zunächst alle aus: Entität ohne Bereich (nur Entitäten physischer Geräte, ohne Diagnose-, Konfigurations- und deaktivierte Entitäten und ohne Dienst-Geräte), Gerät ohne Bereich, Automation ohne Beschreibung, Batterie-Entität ohne Gerät, doppelter Anzeigename (je Domain), Automation ohne Label (nur Automationen mit Registry-Eintrag) und Namensschema (ein Präfix je Domain, bis zu 10, zum Beispiel `wz_` für `sensor`). Verstöße sind Hinweise und zählen nicht in Gesundheit, Befunde, Reparaturhinweise oder Sensoren. Mit dem Label `housekeeper_ignore` oder über **Ausblenden** nimmst du ein Objekt aus; die Schalter liegen nur in Housekeeper. Dazu die Regel „Zustandsänderungen pro Tag“ mit einstellbarer Grenze (Standard 5.000), die nur die zuletzt berechneten Last-Zahlen liest und nie eine Recorder-Abfrage startet. Weitere Regeln: Entitäts-ID mit angehängter Zahl, Entitäts-ID mit Geräteadresse (IP, MAC, Funk, Zigbee), Standardname bei Automation oder Skript, Skript ohne Beschreibung oder Label, Gerät ohne Hersteller oder Modell, leerer Bereich, Label ohne Zuordnung, Automation mit mehr als 10 Auslösern, Freigabe ohne Verwendung, sensible Entität freigegeben, niedrige Batterie ohne Automation, Entität mit vielen Recorder-Schreibvorgängen ohne Verwendung und lange Aufbewahrung bei großer Datenbank. Als Heuristik (Hinweis, mit möglichen Fehlalarmen) laufen: Automation ohne Fehlerbehandlung, feste Entitäts-IDs in Templates, Automation löst sich selbst aus und „wird nur eingeschaltet“.
- **Statistik und Dashboards in den Richtlinien**: zwei Regeln prüfen die Metadaten der Langzeitstatistik (Einheit nicht mehr umrechenbar, Zustandsklasse passt nicht zur Statistik), fünf Regeln die Dashboards (Navigation zu fehlender Ansicht, deaktivierte Entitäten, doppelte Karten, mehr als 200 Karten, Custom-Karten ohne irgendeine Ressource). Alle sind zunächst aus; Werte der Statistik (Sprünge, Rücksetzer) werden nicht geprüft.

### Betrieb

#### Zuverlässigkeit und Hausfunktionen

- **Zuverlässigkeit**: Die Ansicht **Zuverlässigkeit** (Menü Betrieb) zeigt je Konfigurationseintrag, wie verfügbar seine Entitäten in den letzten 24 Stunden oder 7 Tagen waren, wann mindestens 80 % von ihnen (mindestens drei, mindestens 5 Minuten) gleichzeitig ausfielen und ob das eher nach Cloud oder nach Gerät und Netz aussieht (als Vermutung benannt). Dauerhaft ausgefallene Entitäten werden getrennt gezählt. Housekeeper liest dafür nur den Recorder, im Hintergrund, und merkt sich das letzte Ergebnis (auch nach einem Neustart, ebenso für Last und Datenbank in der Ansicht Recorder): Die Ansicht öffnet sofort mit dem letzten Stand („Stand: vor …“) und rechnet im Hintergrund neu; für einmal geöffnete Zeiträume rechnet Housekeeper alle 30 Minuten vor. Jede Zeile öffnet die Integration; deren Detailseite hat einen Reiter **Zuverlässigkeit** mit den Entitäten, die ausgefallen waren. Darunter listet **Instabile Entitäten** die Entitäten, die immer wieder ausfallen und zurückkommen (instabil ab 3 Ausfällen und 0,5 pro Tag, flatternd ab 1,5 pro Tag), mit Dauer, Tageszeit-Muster und der Zahl der Automationen, die daran hängen. Ausfälle während eines gemeinsamen Ausfalls der Integration zählen für die Integration. Auf der Detailseite einer Entität stehen „flatternd“ oder „instabil“ mit denselben Zahlen in der Diagnose und in den Eckdaten (aus dem zuletzt berechneten Ergebnis; die Detailseite startet nie die Recorder-Abfrage).
- **Auto-Pause** (Ansicht **Zuverlässigkeit**, dritte Kachel): Eine Integration, die dauernd an der Einrichtung scheitert (`setup_retry`), wird von Home Assistant etwa alle 80 Sekunden neu versucht, bei einer Website oder einem Cloud-Dienst sind das über tausend Abrufe am Tag gegen einen Dienst, der gerade nicht antwortet. Auto-Pause deaktiviert eine solche Integration und versucht sie später wieder: dreimal nach 1 Stunde, dreimal nach 3 Stunden, zwölfmal nach 6 Stunden, danach täglich, höchstens 7 Tage ab Beginn der Pause (21 Versuche). Klappt ein Versuch, ist die Pause vorbei; sonst bleibt die Integration nach 7 Tagen pausiert, und Housekeeper meldet es als Benachrichtigung und Reparaturhinweis. Housekeeper merkt sich selbst, was es pausiert hat, und schaltet nie eine Integration wieder ein, die du selbst deaktiviert hast. Zwei Wege in die Pause: **Automatisch** (Schalter in der Kachel, aus): nur Integrationen, die du einmal **freigibst**, und nur Kandidaten, also Cloud-Abruf (`cloud_polling`) mit reinen Datenentitäten (Sensoren, Kalender, Wetter, To-do, Ereignisse, Bilder); die Schwelle (Standard 20 Fehlversuche in 6 Stunden, beide Werte einstellbar) zählt Housekeeper aus Home Assistants eigenem Fehlerzähler zwischen den Scans. Integrationen, die eine Hausfunktion tragen, kommen nur mit der Option „Auch Integrationen pausieren, die eine Hausfunktion tragen“ (aus) infrage; Kern, Integrationen mit Wiederanmeldung und mit „Offline on purpose“ markierte nie, und „Nie pausieren“ nimmt eine Integration dauerhaft aus. **Von Hand** (Knopf „In Auto-Pause schicken“ auf der Seite der Integration oder in der Kachel): für fast jede Integration, auch bei ausgeschaltetem Schalter; bei Integrationen, die etwas steuern oder melden (Schlösser, Kameras, Heizung) oder die eine Hausfunktion trägt, fragt Housekeeper vorher nach. Solange eine Integration pausiert ist, fehlen ihre Entitäten in Home Assistant. Die Kachel zeigt Pausierte mit nächstem Versuch (mit „Jetzt versuchen“ und „Pause beenden“), die Kandidaten und einen Verlauf; in der Liste der Zuverlässigkeit steht die Marke „pausiert“. Das ist die einzige Funktion, die ohne Plan und Journal etwas in Home Assistant schaltet, darum ist sie aus, bis du sie einschaltest. Die Zahl der Versuche (nicht nur der Episoden) steht seit dieser Version auch bei den Setup-Fehlern der Integration („Etwa N Wiederholungen der Einrichtung, gezählt seit …“).
- **Hausfunktionen** (Menü Betrieb): Du stellst wichtige Funktionen des Hauses aus Entitäten, Geräten, Automationen, Szenen, Skripten, Integrationen und Apps zusammen („Heizung“, „Alarm“, „Photovoltaik“). Die gemeinsame Objektsuche gruppiert Treffer nach Typ und schlägt bekannte Abhängigkeiten vor; überwacht wird nur, was du ausdrücklich hinzufügst. Für Entitäten legst du eine Aktualisierungsfrist, einen Mindestwert und eine Dauer für „nicht verfügbar“ fest. Der Editor zeigt eine Vorschau der letzten Scanbewertung, und eine Funktion kannst du vorübergehend deaktivieren. Die Seite unterscheidet belegte Defekte, Prüflücken, unauffällige und deaktivierte Funktionen; die Übersicht meldet aktive Probleme und nennt sonst die zuletzt beeinträchtigte Funktion. Jede Funktion hat einen Verlauf (Zustandswechsel und Änderungen, auch Pläne zu den Objekten; mit Suche, Filter und Seiten, schnelles Hin und Her wird zu einer Zeile) und zeigt die Verfügbarkeit der letzten 30 Tage mit Vorfällen und einem Feld je Tag. Zugeordnete Objekte sind anklickbar. Zustandswechsel stehen als Home-Assistant-Ereignis und als Event-Entität bereit; jede Funktion hat einen Sensor, dessen Attribute auch letzten Defekt, Vorfälle, Ausfallminuten und Verfügbarkeit nennen, und dauerhafte Mitteilungen in Home Assistant sind pro Funktion einstellbar. Die Aufbewahrung (1 bis 365 Tage, Standard 30) gilt auch für den Scan-Verlauf und steht unter Einstellungen → Scan und Meldungen.

#### Recorder und Datenbank

- **Schreiblast**: Die Ansicht **Recorder** (Menü Betrieb) beginnt mit der **Schreiblast**; sie zeigt, welche Entitäten, Integrationen und Ereignisse den Recorder am meisten beschreiben: Zeilen pro Tag und Entität, die lauteste Stunde, „Updates ohne neuen Zustand“ (der Wert blieb gleich, nur Attribute änderten sich; wirklich identische Updates schreibt Home Assistant nicht), die mittlere Attributgröße der letzten 24 Stunden, den geschätzten Lastanteil jeder Integration (eine Hochrechnung in Prozent, keine Messung in Byte) und die häufigsten Ereignistypen. Auffälliges steht mit Zahlen und den Objekten, die daran hängen (Automationen, Template-Sensoren), obenan. Housekeeper liest dafür nur den Recorder, im Hintergrund, merkt sich wie bei der Zuverlässigkeit das letzte Ergebnis (die Ansicht öffnet sofort mit „Stand: vor …“ und rechnet im Hintergrund neu) und ändert keine Recorder-Einstellung; Empfehlungen sind Text. Läuft gerade eine andere Recorder-Abfrage, fragt das Panel selbst erneut an.
- **Speicherbedarf**: Der zweite Reiter der Ansicht **Recorder** (Menü Betrieb) zeigt den **Speicherbedarf**, also wie viel Platz jede Entität in der Datenbank belegt (die Schreiblast fragt, wie oft sie geschrieben wird): welche Entitäten die Datenbank füllen, mit Anteil, Schreibhäufigkeit, Verwendung und einem Vorschlag für einen Recorder-Ausschluss zum Kopieren in die `configuration.yaml`; Housekeeper ändert die Recorder-Konfiguration nicht.
- **Datenbank**: Die Karte **Datenbank** in der Ansicht Recorder prüft den Recorder nur lesend: Größe der Datenbank (bei SQLite die Dateien samt WAL-Datei, bei MariaDB/MySQL und PostgreSQL die Größe, die der Server meldet; MariaDB/MySQL liefert eine Schätzung; die Tagesgröße wird als Zahl notiert und ergibt das Wachstum), die **größten Tabellen** als sortierbare Liste mit Klartextnamen und Anteil (SQLite einmal am Tag gemessen, ein Server stündlich), doppelte Statistikzeitpunkte, Stunden, die in den Statistiken fehlen, Statistiken, die nicht zur Entität passen (Einheit, State-Class), und Zeiträume von mindestens 10 Minuten ohne einen einzigen Eintrag, getrennt nach Neustart (laut Protokoll von Housekeeper) und Recorder-Lücke. Jeder Befund nennt Zahlen und eine Empfehlung als Text; diese Prüfung repariert und löscht nichts. Die Berechnung startet beim Öffnen der Recorder-Ansicht; Probleme erscheinen danach auch in den Aufgaben der Übersicht.
- **Platz pro Entität**: Die Zeilen `states` und `state_attributes` der größten Tabellen klappen auf. Mit **Messen** liest Housekeeper beide Tabellen im Hintergrund in kleinen Schritten, mit Fortschritt, geschätzter Restzeit und **Abbrechen**; die Seite darf man verlassen. Das Ergebnis listet die Entitäten nach belegtem Platz (Zustände und Attribute). Home Assistant speichert gleiche Attribute nur einmal, darum zählt jede Attribut-Zeile einmal und eine geteilte zu gleichen Teilen. Die gemessenen Längen werden auf die Größe verteilt, die die Datenbank je Tabelle meldet; es sind Schätzungen. Ein Klick auf eine Entität zeigt ihre Attribute: Anteil am Platz und wie oft sich jedes ändert. Markiert ist, was sich in mindestens der Hälfte der Attribut-Zeilen ändert, denn jede Änderung legt eine neue Zeile mit allen anderen Attributen an. Von dort lässt sich die Entität zum Ausschluss vormerken oder ihr Verlauf kürzen. Die Aufschlüsselung einer Entität gibt es auch ohne Messung: auf ihrer Seite in der Karte **Im Recorder** und in der Recorder-Last mit **Platz ansehen** bei großen Attributen.

#### Speicher und System

- **Speicher & System**: Der Eintrag **Speicher & System** unter Betrieb zeigt, wie voll Datenträger, RAM und CPU sind (mit Swap und Last), und wofür der Platz draufgeht: Systemspeicher nach Kategorie und die Apps mit CPU, RAM und Datenmenge (beides unter Home Assistant OS und Supervised vom Supervisor), die größten Verbraucher unter `/config` (Recorder-Datenbank mit WAL, Backups, `www`, Medien …), jede Custom-Integration, die Custom Cards der Dashboards (eine HACS-Karte zählt mit ihrem Ordner und wird aus `www` herausgerechnet; ein Status zeigt, ob die lokale Datei fehlt und ob ein Dashboard die Karte nutzt, soweit sich das aus der Datei lesen lässt) und die Blueprint-Dateien. Jede Liste ist sortierbar, durchsuchbar und als CSV exportierbar. Der Tab **Starts** zeigt, wie lange die letzten Starts von Home Assistant dauerten (bis „läuft“ und bis alles geladen ist), mit der Einrichtungszeit je Integration, die Home Assistant selbst misst; ein Klick auf eine Zeile klappt die Integrationen dieses Starts auf. Housekeeper ändert nichts und speichert nur diese Startzeiten (so lange wie der Verlauf). Die Messung der Ordner stoppt nach 20 Sekunden (etwa bei einer langsamen Netzfreigabe unter `/config`); die Seite nennt die Größen dann Mindestwerte.

### Sicherheit und Zugriffe

#### Freigaben, Zugriffe und Zugangsdaten

- **Freigaben**: Der Eintrag **Freigaben** unter Sicherheit zeigt, welche Entitäten Assist, Alexa, Google Assistant und HomeKit erreichen können, und nennt Auffälligkeiten: Diagnose-Entitäten, sensible Entitäten (Schlösser, Alarmanlagen, Kameras, Sirenen, Ventile, Personen, Tracker, Garagentore, Tore und Türen; nur als Hinweis), Freigaben für deaktivierte oder verwaiste Entitäten, Schlösser, Alarmanlagen und Tore, die Google ohne PIN öffnen darf (Warnung), automatische Freigabe neuer Entitäten an Alexa oder Google (Hinweis), KI-Gesprächsagenten und MCP-Server, die über Assist steuern dürfen und so die Assist-Freigaben an ein Sprachmodell oder verbundene Programme geben (Hinweis; Ollama und llama.cpp gelten als lokal), doppelte Sprachnamen und Webhooks von Integrationen, die es nicht mehr gibt. Housekeeper liest nur Metadaten: Passwörter, Tokens, Ports und Webhook-IDs werden weder gelesen noch angezeigt, nichts wird gespeichert oder geändert. Ist Alexa oder Google Assistant in den Nabu-Casa-Einstellungen ausgeschaltet, steht „in Nabu Casa ausgeschaltet“ und der Assistent wird nicht bewertet. Antwortet eine Quelle nicht, steht „nicht prüfbar“.
- **Zugriffe & Daten (Detailseite)**: Die Detailseite einer Integration hat einen Reiter **Zugriffe & Daten**: Systemzugriff mit Risikostufe, Datenfluss (lokal oder Cloud) und gespeicherte Zugangsdaten (Art, Feldname, hinterlegt oder leer, nie ein Wert). Die Berichte werden erst beim Öffnen des Reiters gelesen; danach zeigt der Reiter einen Punkt bei hohem Risiko oder leerem Feld, und die Übersicht der Integration eine rote Zeile bei hohem Systemzugriff.
- **Zugriffe & Datenfluss**: Der Eintrag **Zugriffe & Datenfluss** unter Sicherheit zeigt auf einer Seite, welche Integrationen auf das System zugreifen (Supervisor, Shell, Funksticks, Hardware, Datenbank, Kameras, Standort), mit Datenfluss und Risikostufe, und welche Daten mit externen oder Cloud-Diensten austauschen (nach Domain und IoT-Klasse). Mit Supervisor zeigt eine dritte Liste die Rechte jeder App (voller Hardwarezugriff, Privilegien, Docker-API, Host-Netzwerk, Supervisor-Rolle, Zugriff auf Home Assistant und Logins, AppArmor, Schutzmodus, offene Ports am Host) mit Risikostufe und Herkunft (offiziell, Community, lokal; experimentell oder veraltet); ein Klick öffnet die App. Ein Reiter **Von außen erreichbar** sammelt die Wege herein: Nabu-Casa-Fernzugriff, Tunnel-, Proxy-, DynDNS- und VPN-Apps (am Namen erkannt; VPN grün, weil privat), den MCP-Server und offene Webhooks; Portweiterleitungen am Router sieht Housekeeper nicht, Proxy und SSL prüft die Richtlinie „HTTP-Konfiguration“. Integrationen, die nicht zu Home Assistant gehören (HACS), tragen „Fremdcode, volle Rechte“ und haben mindestens mittleres Risiko, denn ihr Code läuft mit allen Rechten von Home Assistant. Als Standort zählen nur Tracker mit GPS; Tracker über Router oder Bluetooth stehen als „Anwesenheit im Netz“ und heben das Risiko nicht an. Die Einordnung ist ein Hinweis, kein Beweis; eine Zeile öffnet die Integration.
- **Zugangsdaten**: Der Eintrag **Zugangsdaten** unter Sicherheit listet, welche Integrationen Passwörter, Tokens, API-Schlüssel, Secrets, Webhook-IDs oder PINs gespeichert haben, von welcher Art und ob ein Wert hinterlegt ist. Werte liest und zeigt Housekeeper nie, auch keinen Teil davon und keine Länge, und exportiert keine; ein Klick auf eine Zeile öffnet die Integration in Home Assistant, dort lassen sich die Zugangsdaten ändern. Die Erkennung geht nach dem Feldnamen und ist ein Hinweis. Eine Integration, die Home Assistant um eine neue Anmeldung bittet, trägt die Marke „Anmeldung nötig“ und hat eine eigene Kachel; eine weitere Kachel zählt deaktivierte Integrationen, die noch Zugangsdaten gespeichert haben. Der Reiter **Konten** zeigt die Benutzer (ohne Systemkonten) mit Rolle, Zwei-Faktor und letzter Anmeldung; die Kachel „Admins ohne Zwei-Faktor“ öffnet ihn gefiltert. Der Reiter **Langzeit-Tokens** nennt jedes Token mit Name, Konto und Alter; wann es zuletzt benutzt wurde, merkt sich Home Assistant nicht.
- **Schutzmodus** (Einstellungen → Schutzmodus): legt auf dem Server fest, was Pläne ändern dürfen: 1 nur lesen (angezeigt als „Nur lesen“), 2 Quarantäne (nur Deaktivieren; „Nur Quarantäne“), 3 bestätigte Änderungen mit Backup (ohne unumkehrbares Löschen von Recorder-Daten; „Ohne endgültiges Löschen“), 4 voller Wartungsmodus („Alles erlaubt“). Neue Installationen starten mit 1 (nur lesen) und schalten Änderungen bewusst frei; bestehende Installationen behalten 4. Die Grenze gilt beim Bestätigen, Starten und Rückgängigmachen, nicht nur für Knöpfe im Panel; Pläne anlegen und alle Ansichten bleiben immer erlaubt. Ist der Modus nicht „voll“, steht das in der Sicherheitszeile.

### Bedienung und Einstellungen

#### Bedienung der Oberfläche

- **Seitenleisten-Knopf**: Ist die Seitenleiste von Home Assistant ausgeblendet (schmaler Bildschirm oder „immer ausblenden“ im Profil), öffnet ein Menüknopf links vom Logo sie wieder, damit das Panel auf dem Tablet keine Sackgasse ist.
- **Aufbau der langen Ansichten**: Zuverlässigkeit, Recorder, Automationen, Richtlinien und Freigaben beginnen mit einer Zeile Kennzahlen (Ampelfarbe, ein Klick springt zum Abschnitt) und gliedern sich in Reiter mit Zähler und Markierung bei Auffälligem; der gewählte Reiter steht in der Adresse (`?tab=`). In den Freigaben zeigt jede Kachel (Assist, Alexa, Google Assistant, HomeKit) per Klick die erreichbaren Entitäten; bei den Richtlinien sind Regeln (Schalter) und Verstöße getrennt.
- **Merkt sich Listen und Inventarexport**: Sortierung und Filter jeder Liste kommen beim nächsten Besuch zurück (nur in diesem Browser, der Suchtext nicht). In den Befunden lassen sich mehrere per Kontrollkästchen auswählen, gemeinsam ausblenden oder als CSV exportieren. Im Inventar steht in der Listenleiste ein Menü **Exportieren** mit **Liste als CSV** (alle Zeilen der Suche) und **Geführter Export**: ausgewählte Objekte ausgewählter Objekte als CSV, Markdown oder JSON, mit wählbaren Feldern, Platzhaltern und Vorschau; alles wird im Browser erzeugt. Im Graph fasst Housekeeper ab fünf gleichartigen Blättern an einem Knoten zu „12 × Entität“ zusammen; ein Klick klappt die Gruppe auf.
- **Suche in Listen**: Lange Listen haben ein Suchfeld, auch Automationen (Läufe), Zuverlässigkeit (Integrationen, instabile Entitäten), Recorder (lauteste Entitäten, Befunde, Integrationen), Richtlinien und Freigaben; es erscheint ab sechs Einträgen.
- **Suche und Ansichten**: Das Suchfeld im Menü oben findet Entitäten, Geräte, Integrationen, Automationen und Skripte nach Name, ID, Plattform, Hersteller und Modell; Pfeiltasten und Enter öffnen den Treffer. In den Listen lassen sich Suche, Filter und Sortierung als benannte **Ansicht** speichern (nur in diesem Browser). Die Zuverlässigkeit kann den Zeitraum mit dem davor vergleichen (Prozentpunkte je Integration).
- **Lange Listen** sind seitenweise aufgeteilt (Standard 20 pro Seite, wählbar 20/50/100/250) und lassen sich durchsuchen, filtern und sortieren (Befunde, Batterien, Nicht verwendet, Inventar). Die gruppierte Befundliste blättert nach ihren obersten Köpfen; ein aufgeklappter Kopf zeigt alles darunter auf derselben Seite. Der Export enthält genau die angezeigten Befunde.
- **Deep-Links**: Das Panel unterstützt Adressen wie `/ha-housekeeper?view=findingsNav&filter=orphaned` oder `?object=entity:sensor.x`; die Reparaturhinweise nutzen sie.

#### Sprachen

Panel und Einrichtungsdialog stehen auf Deutsch und Englisch zur Verfügung. Standardmäßig bestimmt die in Home Assistant gewählte Sprache die Sprache des Panels; unter **Einstellungen → Darstellung** lässt sie sich von Hand auf Deutsch oder Englisch festlegen.

#### Einstellungen, Sensoren und Anbindung

- **Ausnahmeregeln und Urlaubsmodus** (Einstellungen → Ausnahmen): Regeln nehmen Objekte aus, ohne jeden Befund einzeln auszublenden. Eine Regel gilt für einen **Bereich**, ein **Label**, eine **Integration**, eine **Domain** (der Teil der Entitäts-ID vor dem Punkt, zum Beispiel alle `media_player`), ein einzelnes **Gerät** oder eine **Entität**. Im Formular ist **Alle Typen** vorgewählt: Das Suchfeld wie im Kopf findet Bereiche, Labels, Integrationen, Geräte und Entitäten (auch Automationen, Szenen und Skripte) gleichzeitig; beim Speichern entsteht je Art der gewählten Objekte eine Regel. Eine Regel **blendet aus** oder **meldet erst nach N Tagen** (die Verzögerung gilt nur für nicht verfügbare, unbekannte und veraltete Entitäten und für ausgefallene Geräte). Treffen mehrere Regeln zu, gewinnt „ausblenden“, bei mehreren Fristen die längste. Die Vorschau nennt überlappende Regeln; Fristen greifen beim nächsten Scan. Die Seite hat eine Karte für die Regeln, in der du mit einem Umschalter zwischen **Immer** und **Im Urlaubsmodus** wechselst, und darunter eine Karte mit den Einstellungen des Urlaubsmodus; Änderungen daran zeigen „Nicht gespeichert“ mit „Speichern“ und „Abbrechen“. Der Urlaubsmodus folgt einer Entität deiner Wahl (zum Beispiel `input_boolean.urlaub`); Regeln „nur im Urlaubsmodus“ blenden nur aus, solange sie an ist. Nach dem Urlaub zählt ein Ausfall, der vorher begann und von einer Urlaubsregel betroffen war, ab dem Ende des Urlaubs, mit einer **Nachfrist** (Standard 24 Stunden) oder den Tagen deiner eigenen Verzögerungsregel. Solange Befunde zurückgehalten werden, zeigt eine Leiste unter der Kopfzeile den Zustand; der Sensor „Befunde“ trägt dazu die Attribute `vacation_mode`, `vacation_held` und `vacation_entity`. Eine Entität, die nur kurz flackert, beendet den Urlaub nicht. In der Befundliste zeigt der Filter „Durch eine Regel“, was eine Regel ausblendet.
- **Urlaubsmodus einrichten** (Einstellungen → Ausnahmen → Urlaubsmodus): Der Modus ist „an“, solange die gewählte Entität den Zustand „an“ hat; nicht verfügbar oder unbekannt zählt als aus.
  - **Vorschlag:** Hast du noch nichts gewählt und gibt es einen Helfer `input_boolean.urlaubsmodus` (oder `urlaub`, `vacation_mode`, `vacation`, `holiday_mode`, `holiday`; bei deutscher Sprache zuerst die deutschen Namen), trägt Housekeeper ihn als Vorschlag ins Feld ein. Er gilt erst, wenn du **speicherst**. Leerst du das Feld und speicherst, bleibt der Urlaubsmodus aus und der Vorschlag kommt nicht wieder.
  - **Schalter, Helfer, Binärsensor, Zeitplan:** Jede Entität, die „an“ sein kann, taugt. Du schaltest sie in Home Assistant selbst, per Hand, Automation oder Zeitplan.
  - **Eigener Kalender:** Wählst du eine Kalender-Entität (`calendar.…`) und lässt das **Stichwort** leer, gilt jeder laufende Termin als Urlaub. Dafür legst du am besten einen eigenen Kalender „Urlaub“ an und trägst dort die Reisen ein.
  - **Normaler Kalender mit Stichwort:** Trägst du ein Stichwort ein (zum Beispiel `Urlaub`), zählen nur laufende Termine, deren Titel dieses Wort enthält, Groß- und Kleinschreibung egal. „Urlaub Mallorca“ schaltet den Modus ein, „Zahnarzt“ nicht. Auch wenn gleichzeitig ein anderer Termin läuft, findet Housekeeper den passenden: Es fragt den Kalender nach allen Terminen dieses Moments, statt sich auf den einen zu verlassen, den Home Assistant im Attribut zeigt. Kann der Kalender nicht gefragt werden, gilt ersatzweise der angezeigte Titel.
  - **Beginn und Ende:** Der Modus beginnt und endet mit dem Termin; Housekeeper reagiert sofort, wenn ein Termin beginnt oder endet. Ein ganztägiger Termin bis einschließlich 24. Oktober endet in Home Assistant mit dem Ende dieses Tages, danach beginnt die Nachfrist.
- **Einstellungen** (Zahnrad rechts im Menü oben): Die Startseite zeigt je Reiter eine Kachel (Schutzmodus, Ausnahmen, Scan und Meldungen, KI-Zugriff, Darstellung, Info) mit ihrem Stand und einem Randstreifen in der passenden Farbe (KI-Zugriff: aus grau, Lesen grün, Ändern gelb). Die Seite hat ein Kopfband (Version, Home Assistant, Objekte, „Info kopieren“) und sechs Reitern: **Darstellung**, **Schutzmodus**, **Ausnahmen**, **Scan und Meldungen**, **KI-Zugriff** und **Info**. Darstellung umfasst Sprache, Schriftgröße, Modus, Farbschema, Dichte, Animationen, Startansicht und Einträge pro Seite; sie wird im Home-Assistant-Benutzerprofil gespeichert (zusätzlich im Browser). Unter Schutzmodus wählst du den serverseitigen Schutzmodus. Unter Ausnahmen legst du Ausnahmeregeln und den Urlaubsmodus fest und siehst die ausgeblendeten Befunde und Dateien. Scan und Meldungen enthält Scanintervall, sämtliche Diagnosegrenzen, die Benachrichtigung bei neuen defekten Referenzen und die Ereignisse für eigene Automationen. Gespeichert wird erst nach einer Änderung, Housekeeper lädt danach neu.
- **Benachrichtigung** (Einstellungen → Scan und Meldungen, standardmäßig aus): meldet in Home Assistant jede neue defekte Referenz einmal; beim Einschalten wird nichts Altes gemeldet.
- **KI-Zugriff** (Einstellungen → KI-Zugriff, standardmäßig aus): lässt ein Programm oder einen KI-Agenten, das Home-Assistant-Dienste aufrufen kann (zum Beispiel ha-mcp), Housekeeper lesen und auf Wunsch seine eigene Merkliste ändern. Housekeeper öffnet dafür keinen Port und startet keinen Server.
  - **Einschalten:** **KI-Zugriff aktivieren** erlaubt nur Lesen. **Merkliste ändern** ist ein eigener Schalter und braucht den ersten. Beide sind aus, bis du sie einschaltest. Unter **Automatisch ausschalten** (nie, 1, 8 oder 24 Stunden) gehen beide Schalter nach der gewählten Zeit selbst aus; im Protokoll steht dann ein Eintrag. Solange der Zugriff an ist, zeigt ein Streifen unter der Kopfzeile den Zustand und, wann er ausgeht.
  - **Anweisung für den Agenten:** In der Anleitung des Reiters kopiert ein Knopf einen fertigen Text, den du deinem Agenten mitgibst (Dienste, Vorgehen, Regeln, Beispielfragen).
  - **Sensible Objekte:** Die Einstellung **Sensible Objekte zurückhalten** (standardmäßig an) nimmt Schlösser, Alarmanlagen, Kameras, Sirenen, Ventile, Personen, Standort-Tracker sowie Garagen- und Tortore aus allen Antworten; `findings` meldet nur, wie viele Befunde zurückgehalten wurden. Das ist vor allem bei einem Modell in der Cloud sinnvoll.
  - **Lesende Dienste:** `ha_housekeeper.status` (Stand des Scans, Zahl der Befunde nach Stufe, kurze Anleitung für den Agenten), `summary` (die fünf schwersten Gruppen von Befunden mit je drei Beispielen und dem passenden nächsten Aufruf), `findings` (wichtigste zuerst, in Seiten zu höchstens 50, mit Filtern und `next_cursor`), `object` (ein Objekt mit Befunden, Entscheidung, Notizen und Verbindungen, je Liste höchstens 25) und `audit` (das Protokoll). Jede Antwort enthält `schema`.
  - **Schreibende Dienste** (nur mit **Merkliste ändern**): `finding_decide` (Befund ignorieren, behalten oder zurückstellen oder wieder anzeigen; jede Entscheidung braucht einen Grund), `mark` (Objekt markieren), `note_set` (Logbuch-Eintrag) und `undo`. Es ändern sich nur Housekeepers eigene Listen, nie Home Assistant. Notizen tragen `written_by` (Benutzer, Housekeeper oder Agent).
  - **Grenzen und Schutz:** Nur Administratoren können die Dienste aufrufen. Standardmäßig höchstens 200 Änderungen in 5 Minuten und 120 Lesezugriffe pro Minute (im Reiter einstellbar: 50 bis 500 und 60 bis 300); darüber wird der Aufruf abgewiesen. Namen in den Antworten sind Daten, nie Anweisungen; Passwörter, Tokens und Zugangsdaten sind nie enthalten. Ein abgewiesener Aufruf nennt das falsche Feld oder den nächsten Schritt.
  - **Protokoll:** Jeder Aufruf steht mit Zeit, Dienst und Ergebnis im Protokoll (nie die Inhalte der Antworten; höchstens 2000 Einträge und 90 Tage, viele Lesezugriffe hintereinander sind eine Zeile). Jede Änderung lässt sich einzeln zurücknehmen; **Zurücknehmen** oben im Protokoll nimmt alle Änderungen der letzten Stunde, der letzten 24 Stunden oder alle zurück. **Exportieren** speichert die Zeilen der aktuellen Suche und Filter als CSV, Markdown oder JSON (Zeit, Art, Dienst, Objekt, Benutzer als „System“, „Du“ oder „Anderer“, Ergebnis, Zahl der Aufrufe, zurückgenommen).
  - **Ereignis:** Jede Änderung löst `ha_housekeeper_ai_change` aus (`function`, `user_id`, gekürzte `params`, `changed`), damit eine Automation dich benachrichtigen kann.
  - **Hinweis zu `ws_command`:** Die Befehle des Panels gehen bei ha-mcp auch über `ws_command`, sind aber nicht dokumentiert, und die Gesamtliste (`inventory`) kann über 10 MB groß sein. Für Agenten sind die Dienste gedacht. Die Schalter und das Bestätigen, Ausführen und Zurücknehmen von Wartungsplänen lehnen Verbindungen ab, die nicht aus einer angemeldeten Panel-Sitzung kommen (langlebige Zugriffstokens und die Verbindung des Supervisors, über die ha-mcp als App läuft); das ist ein Schutz für den üblichen Aufbau, kein Siegel.
- **Diagnose-Datei** (Einstellungen → Info): nur Zahlen und Versionen, ohne Namen, IDs oder Attribute, passend für eine Fehlermeldung.
- **Update-Status** (Einstellungen → Info): Housekeeper vergleicht seine tatsächlich geladene Version mit dem Stand von HACS. Die Karte erkennt ein verfügbares Update, abweichende oder fehlende HACS-Daten und besonders eine frühere Commit-Installation, bei der HACS den Wechsel auf Releases übersehen kann; sie erklärt den nächsten Schritt und öffnet das Housekeeper-Repository direkt in HACS. GitHub wird dafür nicht zusätzlich abgefragt. Ab Home Assistant 2026.11 ist HACS als „Marketplace“ eingebaut; Housekeeper liest installierte Integrationen, Updates, archivierte und entfernte Repositories aus beiden.
- **Sensoren**: Housekeeper legt ein Dienstgerät mit Zählern an (Befunde, verwaiste und nicht verfügbare Entitäten, defekte Referenzen, mögliche Duplikate, ungenutzte Automationen, schwache Batterien, letzter Scan) und die Entität **Aktivität** (Bereit, Scan läuft, Plan läuft, Wartet auf Start), nutzbar in Dashboards und Automationen.
- **Ereignisse für eigene Automationen**: Nach einem Scan löst Housekeeper für jede neue Lage ein Ereignis auf dem Home-Assistant-Bus aus: `ha_housekeeper_critical_finding`, `ha_housekeeper_backup_overdue`, `ha_housekeeper_quarantine_expired`, `ha_housekeeper_followup_regression` und `ha_housekeeper_integration_down` und `ha_housekeeper_reminder_due`. Jede Lage wird einmal gemeldet (beim ersten Mal still, damit der Bestand nicht auf einmal feuert), die Daten enthalten nur IDs und Zahlen. Housekeeper schickt selbst nichts; die Benachrichtigung baust du in einer Automation.

## Sicherheitsmodell

- Das Panel ist ausschließlich für Home-Assistant-Administratoren verfügbar.
- Alle Housekeeper-WebSocket-Endpunkte erfordern Administratorrechte.
- Der KI-Zugriff ist standardmäßig aus. Die Dienste dafür verlangen Administratorrechte, lesen nur mit dem ersten Schalter und ändern nur mit dem zweiten, und auch dann nur Housekeepers eigene Listen, nie Home Assistant. Sie sind begrenzt (standardmäßig 200 Änderungen in 5 Minuten, 120 Lesezugriffe pro Minute, einstellbar), jeder Aufruf steht im Protokoll, jede Änderung lässt sich zurücknehmen, und die Schalter gehen auf Wunsch nach einer Frist selbst aus. Die Schalter und das Bestätigen, Ausführen und Zurücknehmen von Plänen lehnen Verbindungen ab, die nicht aus einer angemeldeten Panel-Sitzung kommen (langlebige Zugriffstokens und die Verbindung des Supervisors, über die ha-mcp als App läuft) (Schutz für den üblichen Aufbau, kein Siegel).
- Housekeeper bietet Lese- und Scanoperationen an. Auf Wunsch schreibt es in seinen eigenen Speicher und in die Optionen der Integration. Bestätigte Pläne dürfen in Entitäts- und Geräte-Registries schreiben (deaktivieren, entfernen, umbenennen, Bereich oder Label zuweisen), in Automations-, Skript- und Szenen-Dateien, Dashboards im Speichermodus und Energie-Einstellungen, in Recorder-Verlauf und -Statistiken sowie in von Housekeeper angelegte Backups. Das Löschen von Recorder-Daten oder Backups ist in Housekeeper endgültig; bei anderen Aktionen zeigt der Plan, ob sie über das Journal oder nur über ein Home-Assistant-Backup zurückgesetzt werden können.
- `unavailable` wird niemals automatisch mit „verwaist“ gleichgesetzt.
- Deaktivierte Geräte und Integrationen werden von fehlenden Objekten unterschieden.
- `.storage`-Dateien werden nicht direkt bearbeitet.
- Es wird keine Bereinigung automatisch ausgeführt.

Housekeeper schreibt dynamische Templates, YAML-Dashboards, Helfer oder Gruppen nicht als Ersetzungsquellen um und verändert die Recorder-Konfiguration nicht. Wenn eine bestätigte Reparatur gezielt Recorder-Werte überschreibt, nennt die Vorschau die betroffenen Zeilen und verlangt den vollen Schutzmodus sowie ein erfolgreiches Backup.

## Verwendung

**Housekeeper** über die Home-Assistant-Seitenleiste öffnen. Die Übersicht beginnt mit „Was muss ich jetzt tun?“ und zeigt, was sich seit dem letzten Scan geändert hat, dazu Objektzahlen, Befunde und den Zeitpunkt des letzten Scans.

- Eine Kategoriekarte auswählen, um das entsprechend gefilterte Inventar zu öffnen.
- Ein Objekt auswählen: Oben stehen Zustand, Ursache, Gerät, Bereich und das Risiko beim Entfernen, darunter die Tabs Übersicht, Abhängigkeiten, Technische Daten und Attribute, bei Automationen und Skripten zusätzlich **Läufe**, bei Integrationen **Zuverlässigkeit**. Der Tab **Aktionen** ist für alle Objekte gleich aufgebaut, nicht passende Abschnitte entfallen: **Empfohlen** (was einen offenen Befund beantwortet, etwa ersetzen oder deaktivieren), **Notizen** (der Vermerk), **Weitere Aktionen** (immer verfügbare Werkzeuge wie Gerät austauschen, Werte reparieren, Zähler wechseln), **Benennen und einordnen** (Label, Bereich) sowie **Aufzeichnung und Überwachung**. Auch Apps haben ihn, mit dem Vermerk.
- Unter **Abhängigkeiten** ein Objekt auswählen, um eingehende und ausgehende Beziehungen zu untersuchen. Ein Umschalter wechselt zwischen Liste und Graph (Herkunft und Verwendung über bis zu drei Ebenen, mit „Was bricht beim Entfernen?“); auf kleinen Bildschirmen steht nur die Liste.
- Mit **Neu scannen** den Datenbestand nach Konfigurations- oder Geräteänderungen aktualisieren. Ohne Eingriff scannt Housekeeper automatisch alle 6 Stunden. Von außen startet der Dienst `ha_housekeeper.scan` (Option „Auf das Ende warten“ liefert die Zahlen zurück) oder ein Knopf „Scan starten“ auf einem Dashboard einen Scan; mehrere Aufrufe ergeben einen Scan, kurz nach einem Scan startet keiner, und während eines Plans oder beim Start von Home Assistant wird abgelehnt.
- Unter **Einstellungen → Geräte & Dienste → HA Housekeeper → Konfigurieren** lassen sich die vier Schwellen für Ausfälle einstellen (Info in Minuten, Standard 15; niedrig in Stunden, Standard 1; mittel in Stunden, Standard 24; hoch in Stunden, Standard 168) und außerdem Tage bis eine Automation als ungenutzt gilt (Standard 90, `0` = aus), Scanintervall in Stunden (Standard 6, `0` = aus), Schwelle für schwache Batterien in Prozent (Standard 20), Stunden bis eine Entität als „meldet nicht mehr“ gilt (Standard 48, `0` = aus) und Aufbewahrung des Scanverlaufs in Tagen (Standard 30).
- Das Menü oben hat zwei direkte Einträge (Übersicht, Befunde) und fünf Gruppen: Bereinigen (Aufräumen, Reparieren, Journal), Pflegen (Wartung, Batterien, Erinnerungen, Richtlinien), Betrieb (Hausfunktionen, Zuverlässigkeit, Automationen, Recorder, Speicher & System), Sicherheit (Freigaben, Zugriffe & Datenfluss, Zugangsdaten) und Bestand (Inventar, Abhängigkeiten, Änderungen). **Aufräumen** entfernt, was nicht mehr gebraucht wird (Kacheln mit Zahl: Entitäten deaktivieren, Geräte deaktivieren, Quarantäne und Entfernen, Nicht verwendet, Verwaiste Statistiken, Gelöscht); **Reparieren** zeigt die Aufgaben als Kacheln (Sensorfehler bereinigen, Zähler wechseln, Verweise ersetzen, Gerät austauschen); das **Journal** sammelt alle Pläne aus beiden. Die Übersicht beginnt mit einem Statuskopf (Ring, Satz zur Lage, Kennzahlen) und Kacheln „Was möchtest du tun?“, deren Streifen den Zustand zeigen; „Was muss ich jetzt tun?“ hat bis zu drei Bereiche: Befunde (die ersten fünf Einträge der Befundliste), Zustand (Backup, Datenträger, veralteter Scan) und Wartung (verfehlte Ziele, Erinnerungen, Quarantäne; nie dringend). Der Ring zeigt den **Zustand in Punkten von 100** (siehe „Der Zustand und seine Berechnung“); seine Farbe sagt, ob etwas Dringendes offen ist. Ein Klick auf den Ring zeigt die Rechnung.
- **Zurück**: Detailseiten, der Graph und Sprünge über Links haben ein „Zurück zu …“. Der Graph geht Knoten für Knoten zurück und zuletzt zur Seite, von der er geöffnet wurde; Detailseiten öffnen den Tab, den man verlassen hat, Listen springen an die alte Stelle. Die Zurück-Taste des Browsers geht denselben Weg einen Schritt zurück.

Der erste Scan legt die anfänglichen Beobachtungszeitpunkte fest. Nachfolgende Scans behalten den Beginn einer unveränderten Klassifikation bei und setzen ihn zurück, sobald sich die Klassifikation ändert.

## Beispiele

Automationen mit dem, was Housekeeper für eigene Dashboards und Automationen anbietet. Jede nutzt `persistent_notification.create`; mit einer eigenen Benachrichtigungs-Aktion (zum Beispiel `notify.mobile_app_…`) kommt die Meldung aufs Handy. Die Entitäts-IDs sind die einer neuen Installation; deine stehen unter **Einstellungen → Geräte & Dienste → HA Housekeeper**.

**Einen neuen kritischen Befund melden.** Das Ereignis `ha_housekeeper_critical_finding` kommt einmal je neuem Befund mit der Auswirkung hoch; seine Daten enthalten `object_id`, `rule_id` und `classification`.

```yaml
alias: "Housekeeper: kritischer Befund"
triggers:
  - trigger: event
    event_type: ha_housekeeper_critical_finding
actions:
  - action: persistent_notification.create
    data:
      title: "Housekeeper: kritischer Befund"
      message: "{{ trigger.event.data.object_id }} ({{ trigger.event.data.rule_id }})"
```

**Melden, wenn eine Hausfunktion beeinträchtigt ist.** Das Ereignis `ha_housekeeper_monitor` trägt `event_type` (`beeintraechtigt`, `pruefung_unvollstaendig`, `pruefung_wieder_moeglich`, `wieder_unauffaellig`), `function_id`, `name`, `reason` und `at`. Dieselben Wechsel zeigt die Event-Entität „Hausfunktionen“.

```yaml
alias: "Housekeeper: Hausfunktion beeinträchtigt"
triggers:
  - trigger: event
    event_type: ha_housekeeper_monitor
    event_data:
      event_type: beeintraechtigt
actions:
  - action: persistent_notification.create
    data:
      title: "{{ trigger.event.data.name }} ist beeinträchtigt"
      message: "Grund: {{ trigger.event.data.reason }}"
```

**Jeden Montagmorgen scannen und die Zahlen melden.** Mit `wait: true` liefert die Aktion `status`, `findings`, `high`, `scanned_at` und `preliminary`. Ein Scan direkt nach einem anderen wird nicht wiederholt (`status: recent`); während eines Plans oder beim Start von Home Assistant wird die Aktion abgelehnt.

```yaml
alias: "Housekeeper: Wochenbericht"
triggers:
  - trigger: time
    at: "07:00:00"
conditions:
  - condition: time
    weekday: mon
actions:
  - action: ha_housekeeper.scan
    data:
      wait: true
    response_variable: result
  - action: persistent_notification.create
    data:
      title: "Housekeeper"
      message: "{{ result.findings }} Befunde, davon {{ result.high }} hoch."
```

**Vor defekten Verweisen warnen.** Die Sensoren zählen ab der Stufe mittel und bleiben beim Start von Home Assistant unbekannt.

```yaml
alias: "Housekeeper: defekte Verweise"
triggers:
  - trigger: numeric_state
    entity_id: sensor.ha_housekeeper_broken_references
    above: 0
actions:
  - action: persistent_notification.create
    data:
      title: "Housekeeper"
      message: "{{ states('sensor.ha_housekeeper_broken_references') }} defekte Verweise, siehe Befunde."
```

Die übrigen Ereignisse (`ha_housekeeper_backup_overdue`, `ha_housekeeper_quarantine_expired`, `ha_housekeeper_followup_regression`, `ha_housekeeper_integration_down`, `ha_housekeeper_reminder_due`) funktionieren wie das erste Beispiel. Ihre Daten: `age_hours` und `limit_hours`; `object_type`, `object_id` und `days`; `plan_id` und `new_count`; `object_id`, `domain` und `follower_count`; `reminder_id` und `days_overdue`.

## Fehlersuche

- **Kein Housekeeper in der Seitenleiste:** Die Integration muss unter **Einstellungen → Geräte & Dienste** hinzugefügt sein (das Herunterladen in HACS reicht nicht), und das Panel sehen nur Administratoren.
- **Das Panel wirkt nach einem Update alt:** Home Assistant nach dem Update neu starten und die Seite im Browser neu laden.
- **Zahlen wirken direkt nach einem Neustart falsch:** Während des Starts und einige Minuten danach sind Scans vorläufig; die Sensoren bleiben „unbekannt“, der Aktivitätssensor zeigt „Wartet auf Start“. Ein abschließender Scan folgt von selbst.
- **Scans schlagen fehl oder sind alt:** Der Sensor **Scan-Zustand** zeigt `failed` oder `stale`, seine Attribute nennen die Phase und die Art des Fehlers, und ein Reparaturhinweis erscheint. **Einstellungen → Info** im Panel zeigt dasselbe.
- **Die Optionen lassen sich nicht speichern:** Solange ein Plan, ein Rückgängigmachen oder eine Löschung läuft, öffnet sich der Optionsdialog nicht; danach erneut versuchen.
- **Debug-Log:** Unter **Einstellungen → Geräte & Dienste → HA Housekeeper** **Debug-Protokollierung aktivieren** wählen, den Fehler wiederholen und danach **Debug-Protokollierung deaktivieren**; Home Assistant bietet das Log zum Herunterladen an. Ohne Oberfläche unter `logger:` den Eintrag `custom_components.ha_housekeeper: debug` setzen.
- **Ein Problem melden:** Die Diagnosedatei anhängen (drei Punkte an der Integration → **Diagnosedaten herunterladen**, oder **Einstellungen → Info** im Panel). Sie enthält nur Zahlen und Versionen, keine Namen oder IDs. Ein Issue unter [github.com/bertel2020/HA-Housekeeper/issues](https://github.com/bertel2020/HA-Housekeeper/issues) anlegen.

## Aktuelle Einschränkungen

- Housekeeper bereinigt nie automatisch: Jede Änderung braucht einen von dir bestätigten Plan. Vier Dinge sind zu unterscheiden:
  - *Bestätigte Bereinigung*: Jede Änderung läuft nur als bestätigter Plan. Je nach Aktion gehören dazu Deaktivieren, Entfernen, Gerätebereinigung, Verweise ersetzen, Zähler- und Recorder-Reparaturen, Umbenennen, Bereiche oder Labels zuweisen, Automationen löschen, Verlauf kürzen und Housekeeper-Backups löschen.
  - *Rückgängig im Journal*: Housekeeper stellt Registry-Einträge, Verweise und Entitäts-IDs wieder her, solange sie unverändert sind. Ob ein Gerät seine Entitäten zurückbekommt, entscheidet die Integration.
  - *In Housekeeper nicht rückgängig zu machen*: Gelöschte Recorder-Daten und gelöschte Backups sind endgültig; zusammengeführte Recorder-Daten und gekürzter Verlauf lassen sich nur aus dem vor dem Plan angelegten Backup wiederherstellen.
  - *Vollständiger Backup-Restore*: Das erledigt ausschließlich Home Assistant selbst; Housekeeper stellt keine Backups wieder her.
- Housekeeper benötigt Home Assistant 2026.8 oder neuer, weil ein Gerät dort genau einem Config Entry gehört.
- Die Automationsanalyse umfasst die aktuell von Home Assistant geladenen Automationen. Bei ungültigen oder extern verwalteten Automationen können weniger Details verfügbar sein.
- Dynamische Templates lassen sich nicht immer eindeutig einem Ziel zuordnen. Solche Beziehungen werden ohne Laufzeitbeleg niemals als sicher dargestellt.
- Die Abhängigkeitsansicht konzentriert sich auf direkte Konfigurationsbeziehungen. Recorder-Verlauf und -Statistiken werden erkannt und gezählt, ihre Inhalte aber nicht als Referenzen interpretiert. Nicht lesbare oder automatisch erzeugte Dashboards können ebenfalls unsichtbar bleiben; die Auswirkungsanalyse ist ein Hinweis, keine Garantie.
- Mögliche Duplikate und ungenutzte Automationen beruhen auf Heuristiken und sind Hinweise, keine Gewissheit.
