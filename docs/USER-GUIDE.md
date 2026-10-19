# HA Housekeeper – User Guide

The detailed documentation of HA Housekeeper. For a short overview and the quick start, see the [README](../README.md). Deutsch: [Benutzerhandbuch](USER-GUIDE.de.md).

## Contents

- [What Housekeeper does](#what-housekeeper-does)
- [Installation](#installation)
- [Terms and numbers](#terms-and-numbers)
- [Features](#features)
  - [Overview and findings](#overview-and-findings)
  - [Inventory and diagnostics](#inventory-and-diagnostics)
  - [Automations and scripts](#automations-and-scripts)
  - [Tidying up and repairing](#tidying-up-and-repairing)
  - [Maintaining](#maintaining)
  - [Operation](#operation)
  - [Security and access](#security-and-access)
  - [Using the interface and settings](#using-the-interface-and-settings)
- [Safety model](#safety-model)
- [Usage](#usage)
- [Current limitations](#current-limitations)

## What Housekeeper does

| Task | Behavior |
| --- | --- |
| **Inventory** | Entities, devices, integrations, areas, floors, labels, and automations with search, filters, and sorting |
| **Diagnostics** | Distinguishes active, unavailable, unknown, disabled, and orphaned objects, each with a reason |
| **Observation time** | Stores since when Housekeeper has observed a classification |
| **Automation analysis** | Triggers, conditions, actions, blueprints, and missing references; likewise for scripts, scenes, dashboards, groups, and helpers |
| **Scan comparison** | New and resolved findings, status changes, new and removed objects since the last scan |
| **Cleanup hints** | Possible duplicates, unused automations, low batteries |
| **Sensors and hints** | Counters as sensors, aggregated repair hints, findings export as CSV/JSON and inventory export as CSV/Markdown/JSON |
| **Dependencies** | Relationships between integration, device, entity, area, and automation with a confidence level |
| **Safety** | Administrators only; server-side protection modes, previews and explicit confirmation; backup, verification and undo where the action supports them |

## Installation

### Via HACS (recommended)

[![Open the HACS repository in My Home Assistant](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=bertel2020&repository=HA-Housekeeper&category=integration)
[![Add HA Housekeeper to My Home Assistant](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=ha_housekeeper)

1. Use the first button to open the Housekeeper repository in HACS.
2. Download **HA Housekeeper** and restart Home Assistant.
3. **Add the integration** (important): use the second button, or open
   **Settings → Devices & services → Add integration → HA Housekeeper** in
   Home Assistant and finish the dialog. Downloading in HACS alone is not enough;
   without this step no sidebar entry appears.
4. Then open **Housekeeper** in the sidebar while signed in as an administrator.

If the first button does not work, add
`https://github.com/bertel2020/HA-Housekeeper` in HACS under **Integrations →
Custom repositories** with the category **Integration**.

While Housekeeper is not yet visible in the default HACS search, the first button
registers it as a custom repository. The status of its inclusion is tracked in
[hacs/default#11766](https://github.com/hacs/default/pull/11766).

### Manual

Copy the `custom_components/ha_housekeeper` directory to
`/config/custom_components/ha_housekeeper` and restart Home Assistant. Then add
the integration as described above.

The resulting directory should look like this:

```text
config/
└── custom_components/
    └── ha_housekeeper/
        ├── __init__.py
        ├── manifest.json
        └── ...
```

## Terms and numbers

This section explains how Housekeeper thinks and counts. Once you know it, every number in the panel makes sense.

### From small to large

| Term | Meaning |
| --- | --- |
| **Object** | Anything Housekeeper checks: entity, device, integration, app, automation, script, scene. |
| **Finding** | A single discovery on an object, for example "entity is orphaned" or "automation refers to a missing entity". Every finding has a **severity** (called *impact* in the interface): **high**, **medium**, **low** or **info**. The severity says how much hangs off the object (automations, critical objects) and how long an outage lasts. |
| **Cause and follow-up** | When many objects fail for the same reason (an integration is not loaded, a device is down), Housekeeper folds them into one **cause**. The affected entities, automations and dashboards are its **follow-ups**. Follow-ups do not count extra. |
| **Status of a finding** | You decide how a finding is handled: **Known** (with a reason), **Snoozed** (with a deadline), **Hidden**. Housekeeper sets **New**, **In progress** (a plan is running or waiting) and **Done** by itself. Known, snoozed and hidden findings do not count towards the state. |
| **Note** | A statement about an object, for example "offline on purpose", also with a time window. A note belongs to the object, not to a single finding. Objects with a note do not count as newly failed. |
| **Incident** | A temporal link: findings that began at the same time as an update or restart are shown together on one row. It is a hint, not proof of the cause. |
| **Watch** | After an update of Home Assistant, the operating system or the Supervisor, Housekeeper scans additionally for a day (after 30 minutes, 2 and 6 hours and at the end) and compares with the state before the restart. When the update begins, Housekeeper scans at once and keeps that state; if that does not work, the last scan before it counts. The result is a verdict on what has failed since, was briefly disturbed or runs again. |

**Watch versus finding:** A finding rates the state of an object at one point in time ("this is a problem now, at this level"). A watch is a before-and-after comparison over a period ("what changed since the update?"). It adds nothing to the state; it only explains whether and when findings began with an update. A finding can exist without a watch; a watch is only a look at findings that are already there.

### How an outage becomes a finding

An unavailable entity, device, integration or app becomes a finding after **15 minutes** and rises with its duration:

| Duration | Level |
| --- | --- |
| from 15 minutes | info (takes nothing off, so a restart leaves no dent) |
| from 1 hour | low |
| from 24 hours | medium |
| from 7 days, or when automations are affected | high |

You set the four thresholds under **Settings → Scan and messages**. The level follows the duration and, for the impact, what hangs off the object.

### The state and how it is calculated

The number in the header of the panel ("State 98.4 %") is the **share of objects in order**. It counts objects, not findings.

1. The **starting value** is the number of rated objects (entities, devices, integrations, automations, scripts, scenes), without the objects that are only follow-ups of a cause: the cause stands for them.
2. Every object with a finding takes off by its **worst** level: **high 1**, **medium 0.5**, **low 0.2**, **info 0**.
3. An object counts **once**, even with several findings. Follow-ups of a cause do not count; the cause stands for them.
4. Known, snoozed and hidden findings do not count.
5. **State = (starting value − sum of the deductions) ÷ starting value**, rounded down to one decimal, so a house with a finding never reads "100 %".

Example: 2000 rated objects, 100 with low findings (0.2 each = 20), 160 with medium findings (0.5 each = 80) and 100 with high findings (1 each = 100). Deduction 200, in order 1800, state **90 %**. The card **How is this number made?** (click the ring) shows this calculation with your numbers; a click on a row opens the matching objects.

The ring is **green from 95 %**, **yellow from 85 %**, **red** below. An object with high impact or an urgent state topic (backup, disk) makes it at least yellow but takes nothing off.

### Why numbers can look different

- The **findings page** counts findings, the **state card** counts objects. Two findings on one object are two findings but one object.
- The **tiles** of the findings page count without the follow-ups of a cause. With the filter "All individually" you see every finding, follow-ups included.
- The **curves** under the tiles count like the tiles. The history of the state began anew when the calculation changed from points to objects.
- The **export** always contains follow-ups.

### What counts as a backup

For the backup protection in Maintenance only backups that **contain Home Assistant** count: Home Assistant's automatic backups and manual backups, backups of other tools (for example Google Drive Backup; shown as “Other tool”, because Home Assistant cannot tell whether they were scheduled), including the ones Housekeeper makes before a plan. Backups of a single app (for example those made before an app update) do not count: they do not secure your configuration and say nothing about your backup strategy.

### How a plan runs

Every change runs as a plan, never by itself:

1. **Preview:** Housekeeper shows exactly what would change, with the expected end state. Nothing changes up to here.
2. **Confirm:** You confirm in a dialog; for critical objects separately.
3. **Backup:** Depending on the action, Housekeeper first creates a safety backup (configuration only or full).
4. **Execute:** The steps run one by one, each with a result. The plan is **In progress** meanwhile.
5. **Follow-up check:** For 24 hours Housekeeper checks whether anything comes back (**clean** or **relapse**).
6. **Undo:** In the journal, as long as nothing was changed. Deleted recorder data and deleted backups are final; a full restore is up to Home Assistant.

What a plan may do is set by the **protection mode** (Settings → Protection mode). New installations start at **read only**.

### The most important settings

| Setting | Default | Effect |
| --- | --- | --- |
| Scan interval | 6 hours | how often Housekeeper scans by itself (0 turns it off) |
| Outage thresholds | 15 min / 1 h / 24 h / 7 days | when an outage is info, low, medium, high |
| Watch after updates (`watch_hours`) | 24 hours | how long extra scans run after an update (0 turns it off) |
| Protection mode | read only | what plans may change |

All under **Settings** in the panel; the thresholds also under **Settings → Devices & services → HA Housekeeper → Configure**.

### What Housekeeper stores

Everything lives in Home Assistant's own storage (`.storage`, files `ha_housekeeper.*`) and never leaves your instance. That is observation times, decisions, notes, the history of the state, the journal of plans and the saved scans. The list with size and purpose is under **Settings → Info → What Housekeeper stores**. Housekeeper never shows credentials as a value, only their kind and whether one is stored.

### First steps

Installation and the first scan are in the [README](../README.md). After that: open **Findings** and start with the high and medium ones, open a finding (cause and dependencies are at the top), mark what is down on purpose with a note, and only then build a plan under **Tidy up**.

## Features

### Overview and findings

#### Overview

- **Overview**: below the key figures the **inventory status** shows three groups (Unremarkable, Check, Problematic) with count and share, followed by the findings. Header tiles include small sparklines where a history exists. On the right come the trend, the **System** card (disk, memory and processor as bars, linking to Storage & system; a disk that is 75 % full adds a task, 90 % an urgent one), the **Database** card (size, WAL file, retention as set in the recorder of Home Assistant, growth per day; two file sizes only, no table queries), tidy-up and the objects by type. The key facts of an entity show the last state change, the last report and, with long-term statistics, the last statistics entry.
- **Integrations with problems** appear on the overview, next to a **Hints** card with quick access to batteries, duplicates, unused automations, and unused entities.
- **Maintenance goals**: under **Maintain → Maintenance → Maintenance goals** there are seven goals you set yourself (the overview shows only the missed ones and leads there): at most 0 broken references, at most 10 unavailable entities, backup no older than 36 hours, restore test no older than 90 days, database growth at most 50 MB a day, no weak battery, at most 5 devices without an area. Each goal shows the current value, the limit and whether it is **met**, **missed** or **unknown** (for example while there are too few size samples); "never confirmed" counts as missed. Every goal can be adjusted or switched off. Nothing changes in Home Assistant and the state is untouched.
- **Safety status**: A thin line under the navigation, on every view, shows the last backup, the last change by Housekeeper, whether undo is still possible or only a backup restore, a running operation and a running follow-up. A click opens the matching view. The state card shows "State N %" and how many objects are affected; each common cause is a fold with counts per object type and its follow-up findings inside.
- **Outdated scan**: if the last scan is clearly older than the scan interval, the overview says so. **Changes** and long lists of integration problems can be searched and filtered.

#### Findings and decisions

- **Impact**: Every finding has an impact (**high**, **medium**, **low**, **info**, **none**) with the reasons behind it, for example “used by 3 active automations” or “controls 1 critical object”. Objects are critical when they carry the label `housekeeper_critical` (on an entity, device or area), or are locks, alarm panels, valves, sirens, garage doors and gates, or sensors for smoke, gas, carbon monoxide, water and safety. The findings list sorts by impact by default, then by certainty of the diagnosis, and can be filtered by it. The impact alone gives no number; it enters the state through the worst level per object (see "Terms and numbers").
- **Recorder and Energy dashboard** are part of the impact analysis: entities of the Energy dashboard count as used, and entities with recorder history or long-term statistics are marked. An entity's detail page has an **In the recorder** card with the available rows and periods. In the **Not used** view both tabs are sortable and filterable tables (a click on a column heading sorts; on the phone the rows become cards): the entities name domain, device, area, integration, last change, last report, since when they have been observed and whether there are long-term statistics. The **Orphaned statistics** tab lists long-term statistics that no longer have an entity. Each row names the **last entry** of the statistic and the list can be sorted by it (newest or oldest first), so recently orphaned statistics are easy to tell from long dead ones. The entry is read when the tab is opened, not during a scan.
- **Common causes**: when an integration is not loaded, all its entities show as "unavailable". Housekeeper folds that into one cause ("Integration X is not loaded", with state, error text and the affected automations, scripts and dashboards). The same goes for a device with at least three entities that are all down. The block sits above the findings list and in "What should I do now?"; the follow-up findings stay folded until you choose **Show follow-up findings** (the export always includes them). Hidden and marked findings do not count. The cause counts once in the state for all its follow-ups; the grouping is a hint, not proof. Every integration that is not loaded is a finding from the first minute; the duration sets the severity: under 1 hour Info, from 1 hour Low, from 1 day Medium, from the configured number of days or with affected automations High. The detail page says how long the outage has lasted and when it becomes more serious.
- **Marks**: On the detail page (Actions tab, section “Notes”) of a device, entity, integration or app you tell Housekeeper what to expect (also on objects without a finding, for example in advance while the device is still running): **Offline on purpose**, **Seasonal**, **Spare device**, **Being replaced** (with a target) or **Do not remove**, with a reason and optionally a review date (30, 90, 180 or 365 days). A mark hides “not available” on that object (on a device: on its entities), never a broken reference. **Do not remove** blocks every cleanup step on the object; so does the label `housekeeper_keep` on a device or entity (create it in Home Assistant with exactly this name and assign it, also to several objects at once). The label hides no findings: if the object goes down, it is still reported. The list under **Cleanup → Disable devices** does not show such devices, nor devices with the label `housekeeper_ignore` or an exception rule. A device with no entity at all (for example the Bluetooth sub-device of an ESPHome proxy) appears there as “No entities”. After the review date the findings come back, marked as due. Marks live only in Housekeeper. In Findings you can set a mark on several ticked objects at once (**Set a mark**); with “on the device instead of each entity” each device gets one mark that covers all its entities. A mark (except **Do not remove**) can have a **time window**: at fixed times (for example 21:00 to 06:00, also across midnight) or in the dark (position of the sun from `sun.sun`), plus a grace period after the end (30 minutes by default). Only inside the window does the mark hide; outside it Housekeeper reports the finding again, and the outage of an integration counts only from the end of the window plus the grace period. A solar-powered garden sensor, for example, is expected offline at night and watched by day. Without `sun.sun` “In the dark” is not active. Marking several ticked objects at once has no window, only a single mark has.
- **Hide findings**: a finding can be hidden on the detail page (only in Housekeeper's own list, Home Assistant stays untouched). Rules cover whole groups: under **Settings → Exceptions** an **exception rule** names an area, a label, an integration or a domain such as `media_player` (devices and their entities; an entity without an area takes the one of its device). **Vacation mode:** choose an entity in the same place (a helper, switch, schedule or calendar); while it is `on`, rules set to “only in vacation mode” apply, and a bar shows how many findings are held back. After the vacation the outage of such objects counts from its end: with a delay rule of its own that delay applies, otherwise the grace period (default 24 hours). Rules can also name single devices and entities. Useful for devices that are often off on purpose: one rule with a delay replaces a rule per device. The rule either hides the findings of these objects or reports an outage only after the days you set. Where several rules match, hiding beats a delay, and the longest delay counts. Alternatively the label `housekeeper_ignore` on an entity, an automation or a device (with its entities) hides their findings. Housekeeper does not create this label automatically: create it once in Home Assistant under **Settings → Areas, labels & zones → Labels**, using the exact name `housekeeper_ignore`, and assign it to the object you want Housekeeper to ignore. Hidden findings do not count in the overview, sensors, or repair hints and can be shown again with **Show hidden**. When hiding you choose the kind: **Hidden**, **Kept on purpose** (a reason is required) or **Remind me later**, optionally with a duration (7, 30, 90 or 365 days). When the time runs out the finding returns to the list, marked **Due again** and filterable. The reason and the time show in the list of hidden findings.
- **Labels** (Settings → Exceptions, below the rules): The block shows the three fixed labels `housekeeper_keep` (clean up nothing, findings stay), `housekeeper_ignore` (hide findings) and `housekeeper_critical` (the object is important). For each label it says what it does, whether it exists in Home Assistant and how many objects of each type carry it (as of the last scan); “Show objects” opens the inventory filtered by the label, “Copy name” helps when creating it in Home Assistant. Housekeeper does not create the labels itself.
- **Finding status**: Known (with a reason), Snoozed (with a date) and Hidden; New, In work (a plan is running or open) and Fixed lately are added automatically. The list filters by it, and the selection marks several findings as known or snoozes them at once. A possible duplicate offers “Not a duplicate”.
- **What you can do**: On the detail page a card sums up what is possible for the object: decide findings, replace, plan a disable, add a label. Everything only opens a preview under Cleanup.
- **At about the same time as updates**: findings that began at the same time as an update of Home Assistant or an integration carry a note “At about the same time as …”, have a tile and a filter “New after update” and are grouped under Changes. Restarts and cleanup plans appear only as a group. It is a link in time, not a cause; only events since the event log counts.
- **Watch after updates**: After an update of Home Assistant, the operating system or the Supervisor, Housekeeper scans extra for a day (30 minutes, 2 and 6 hours later, and at the end) and compares with the state before the restart. Updates of single integrations do not start it; the findings and the link in time cover them. A band in the page header (one click opens the results) shows how many objects are affected while it runs; the card on the findings page lists what failed since, was briefly disturbed or works again, and says “unknown” when no comparison is possible. New repairs since the update are listed in a section of their own and count as worse. Objects that answer afterwards but have no value are listed in a group of their own, “Without a value since”. Objects with a mark (for example offline on purpose) do not count as newly failed; you set the mark right in the row. This is a link in time, not a cause. You set the duration under Settings → Scan and messages (`watch_hours`, default 24, 0 switches it off).

#### Findings, export, and repair hints

- Findings list with reasons and diagnosis confidence; export as **CSV** or **JSON** (respects the selected filter)
- **Hint for objects that fail often:** If an entity or device fails regularly (unstable, flapping or always at the same time of day, taken from the reliability numbers), the finding shows a chip such as “Usually fails between 22:00 and 00:00”, and the tab **Actions** asks “On purpose?” with a mark prepared (offline on purpose, time window from the pattern, review after 90 days). Time without a value (`unknown`, in standby for instance) counts as well, but only for this pattern, not for the availability. Above the findings list the card **Suggested marks** gathers all such objects, one row per device, with **Accept** one by one or **Accept all** after a question. Nothing is set without your click. “Do not ask again” holds for 180 days in this browser. It needs the recorder and a few days of history.
- **Outages by duration:** An unavailable entity, device, integration or app becomes a finding only after the **info threshold** (default 15 minutes) and rises with its duration: **info**, **low** from 1 hour, **medium** from 1 day, **high** from 7 days (all four thresholds under **Configure**, they must rise). Info and low are on the findings page only; the overview, the sensors, the repair hints and “new findings” count from medium on. Where an integration cannot start (`setup_error`, `migration_error`, `failed_unload`) the finding is at least medium at once. An entity that reports `unknown` is a finding only if it had a value before. When all entities of a device (at least three, not counting disabled ones and those that never had a value) have lost their value, in standby for instance, the device is “down completely” and the “Grouped” view lists its entities below it as follow-ups. When only some entities (two or more) have no value, the view gathers them below the device. In both cases **Mark the device** sets one mark for all of them. So that the thresholds apply on time, Housekeeper plans an extra scan at the thresholds when something fails; that scan does not change the history or the “last scan” that changes are compared with. Orphaned entities are still reported at once.
- **Possible duplicates**: a non-working entity with a number suffix (`…_2`) for which a working entity of the same integration with the same base ID exists is marked as a leftover
- **Unused automations**: switched off for a long time, not triggered for a long time, or never triggered (using the automation's age); threshold under **Configure** (default 90 days, `0` = off)
- **Automatic scan** every 6 hours (adjustable) keeps the history and repair hints current
- Hints under **Settings → Repairs**: at most three aggregated entries (orphaned entities, long-unavailable entities, automations with missing references) linking to the panel. They are informational only and offer no repair.
- **Diagnostics download** for bug reports (integration → Download diagnostics) contains counts only, no names or IDs.

#### Changes since the last scan

The **Changes** view compares the current state with the previous scan or with the last scan of each earlier day (kept for 30 days by default, adjustable from 1 to 365 under Settings, with a timeline of the stored scans): status changes (worsened first), new and resolved findings, and new and removed objects. You can add your own dated notes to the timeline. The history is stored compactly in Home Assistant and contains only statuses and IDs; notes contain the text and optional target you enter.

- **Weekly report**: under Changes, “Weekly report” saves the comparison with the state of about a week ago as a Markdown file (new and resolved findings, new and removed objects, status changes, loudest entities in the recorder when calculated).

### Inventory and diagnostics

#### Installation overview

- Inventory of entities, devices, integrations/config entries, areas, floors, labels, and automations, filterable by type, status and label; entities can be disabled, enabled, hidden or shown in bulk there (a plan with preview and undo)
- Search by name, object ID, unique ID, platform, or integration
- Filter by object type and status
- Sortable and paginated inventory for larger installations
- Summary of object counts and current findings

#### Entity and device diagnostics

Housekeeper distinguishes between:

- an active entity with a current state
- an entity reporting `unknown`
- an entity reporting `unavailable`
- an intentionally disabled entity
- an entity belonging to a disabled device
- an entity belonging to a disabled integration
- an entity whose device no longer exists in the device registry
- an entity whose config entry no longer exists
- a registry entity that no longer has a state

For every continuously observed classification, Housekeeper stores when it first detected that condition. This timestamp is explicitly presented as a **first Housekeeper observation**, not as an invented deletion or failure date.

#### Apps, device history and more sources

- **Apps in the inventory**: With a Supervisor, installed apps (add-ons) are objects like all others: type **App** in the inventory, status (running, stopped; stopped is no problem), version and a pending update. The detail page has Overview, **Rights** (from Access & data flow), **Load & storage** (from Storage & system) and Technical; the lists there open it. Apps raise no findings and do not count towards health; Housekeeper changes nothing about apps. Without a Supervisor the type does not exist.
- **History of a device**: the **History** tab on a device shows discovered, in quarantine, disabled by a plan, replaced or removed and whether it is unstable now. When a plan removes or forgets a device, Housekeeper writes it into the logbook; the **Removed and deleted** tab in the **Journal** lists what a plan removed together with that entry, which you can open to add a reason, and with a jump to the plan. The list comes from the plans in the journal: plans that ran stay up to a year, at most 300; after that the device leaves the list too.
- **More reference sources**: groups (members) and helpers such as template, derivative, or min/max sensors (source entities) are included in dependencies and impact analysis; missing members and sources are reported as findings.

#### Dependency explorer

The dependency view visualizes direct relationships such as:

```text
Integration → owns → Device → provides → Entity
Floor → contains → Area → contains → Device
Automation → triggers on / checks / targets → Entity or Device
```

Each relationship includes a confidence level. Explicit registry and configuration relationships are marked as certain; references inferred by Home Assistant at runtime are identified separately.

### Automations and scripts

#### Automation analysis

- Lists loaded automations and their current state
- Shows mode, concurrency limits, last trigger time, and blueprint origin
- Displays triggers, conditions, and actions in the detail view; the **Flow** tab shows them as a tree (if/then, repeats, parallel steps) with a plain sentence per step, clickable entities, and steps with missing objects or findings marked red
- Extracts entity, device, area, floor, and label references
- Includes references detected by the Home Assistant runtime, including many template references
- Detects references whose target no longer exists
- Retains the precise configuration location for explicit references when available
- Scripts, scenes and dashboards are checked for references and missing targets in the same way; the detail page shows under **Impact of removal** what a removal would affect (analysis only, no changes)

#### Quality, runs and hints

- **Automation diagnostics** (tab "Quality" in the runs view): Seven separate views of each automation, deliberately without an overall grade: integrity, reliability, effectiveness, maintainability, restart safety, efficiency and conflicts; "unknown" means there is nothing to judge by yet. Each automation can get **success criteria** (target entities, expected state, time limit, optional hold time, or: a service such as a notification or a script is called by the same run, matched by the run context); Housekeeper then keeps a history of reached and missed criteria per trigger. Criteria missed again and again become a finding and show under "What should I do now?". On request, **coverage** counts which trigger and which branch ran and which never did (off by default; the trace is read briefly in memory, only counters are kept). Two runs can be **compared** (different trigger, branch, end, run time, updates in between). The **test run** explains what an automation would do with the current and your own test states; it never executes anything and marks critical targets such as locks and garage doors.
- **Refactoring hints** (read only) for automations: device triggers, long delays and branches that can never apply. A refactoring assistant that rebuilds automations with a preview and an undo is experimental and off by default.
- **Automations** (Operation menu): every 15 minutes it counts the runs Home Assistant keeps for each automation and script for a short time (5 by default) and remembers for 60 days only counters per day and the place of a failure, no variables, data or error texts. The view names what stands out with the numbers behind it: many errors, runs rejected because of “Already running” or `max`, never successful, almost always ending at a condition, unusually frequent or long, the error rate after an update (as a coincidence in time), and waits of 5 minutes or more, waits without a timeout and `continue_on_error`. A run without an error does not mean the automation does its job. The list can be searched, filtered by type and “with errors” and sorted by column. On the detail page of an automation or script the key facts show runs, errors, condition, duration and the 7-day bars, and the **Runs** tab the details. Housekeeper also keeps a small log of version changes of Home Assistant and custom integrations and of restarts. Below it, **Conflicts and loops** lists two automations that control the same entity in opposite ways (on against off, two different fixed values) and can fire together (same trigger or overlapping time window), and chains of triggers and actions that lead back to the start through groups, helpers or other automations. Each finding has a stage: “possible” (only the configuration allows it), “observed” (all involved automations ran on the same day) or “repeated” (on at least 3 of 7 days); counting is per day, the order of the runs is unknown. Housekeeper runs nothing and never calls anything a certain error.

### Tidying up and repairing

#### Tidying up

- **Cleanup**: the **Tidy up** view checks selected orphaned or long-unavailable entities in a dry run: no known use, to review, or blocked (certain use, working entity), including references and a note on long-term statistics. Housekeeper changes nothing at that point. A plan can be explicitly confirmed (type a word) and executed; **disabling** as quarantine (registry entry; history and statistics stay untouched) and, under the conditions below, **removal**, device cleanup, replacing references and the meter change are executable. Blocked entries never run, “to review” only with an individual confirmation. Every step is re-checked first; if an entity changed since the preview, the run aborts. Afterwards Housekeeper verifies the result. Most steps can be undone in the journal while the entity is unchanged; the long-term statistics of a meter change can only be reset with the backup. A quarantine card shows since when an entity has been in quarantine and when a later removal would earliest be possible (14 days). Every plan is in the journal (executed plans stay as the audit trail). **Removal** (deleting the registry entry) is possible only for entities that have been in quarantine for at least 14 days: Housekeeper first creates a Home Assistant backup (Home Assistant only, no apps or folders, no database unless the plan writes into it; locations and encryption as in your automatic backups, or, if you have not set up backups, the local storage of Home Assistant without a password, which the preview and the result point out; it shows up as its own backup “Housekeeper …” and does not count as your regular one), waits for it to complete successfully, and starts nothing otherwise. The registry entry is kept in the journal so a removed entity can be restored while its ID is free and the integration still exists; it is back in quarantine afterwards.
  **Devices** follow the same rules: *Disable* (quarantine) is only possible if no entity of the device works any more, nothing hangs off the device (hubs and coordinators are blocked) and nothing certainly uses it. Housekeeper shows child devices but never cleans them up; a device with child devices counts like a hub. *Remove* uses Home Assistant's official path (the integration is asked and may refuse) and is only possible after 14 days of quarantine and with a backup. *Forget locally* is meant only for integrations that offer no regular removal: Housekeeper removes the registry entry and reloads the integration; the source system (device, hub, cloud) stays unchanged, and if the device shows up again a **Returning devices** card says so. Removing a device also removes its entities; restoring recreates the registry entry from the journal, and whether the integration provides the entities again is up to it. That is why every removal needs an individual confirmation.
  **Replace references** swaps an old entity for a new one wherever it is entered exactly: automations, scripts and scenes (YAML files), storage-mode dashboards and the Energy dashboard. The preview lists the changes per source. Templates, YAML dashboards, helpers and files using `!secret`/`!include` are not changed by Housekeeper but listed for you to adjust by hand. Each source is saved in the journal first (comments in YAML files are lost on writing, as with the Home Assistant editor; undo writes the original file back byte for byte while it is unchanged, otherwise only the changed item), a backup is mandatory, and undo works while the source is still exactly as Housekeeper left it. History and statistics are not moved or merged (the meter change does that).
  **Meter change** joins the history of a replaced meter with the new one. Housekeeper first checks that both statistics fit together (same unit and type) and shows the switch point, gaps, overlaps and the transition of the total in advance. There are three ways: copy the old meter's long-term statistics in front of the new one's and shift the new total by the old final reading (the raw readings of the new meter stay as they are), let the new meter take over the old one's ID (the old one moves to a free `_alt` ID; Home Assistant moves history and statistics along with the ID, and automations and dashboards keep working without rewriting), or both. Existing values are never overwritten: overlapping values of the old meter are not copied. Writing the statistics is experimental, requires the backup and can only be reset with it; the ID takeover can be given back through the journal. Only the hourly long-term statistics are joined, not the raw states and not the short-term statistics of the last days. Afterwards the old meter can go into quarantine.
  **Repair counter glitches** fixes a counter that briefly reported a wrong value (for example a water meter that fell from 91 to 41 m³ for hours). Home Assistant counts the jump back as new consumption and spoils the sum. Housekeeper finds such outliers (readings that break the order and then return, at most 48 hours long; a value that stays low for good, as after a meter replacement, is never touched) and replaces the wrong values in the history, in the 5-minute rows and in the hourly rows, either with the last good value or on a straight line to the next one. The spoiled sum is recalculated. The preview shows the readings before and after and the rows per table. This writes into the recorder database: only in the protection mode "full", with a backup, verified afterwards, and the overwritten values stay in the journal, so everything can be put back as long as nobody changed the rows afterwards. Housekeeper refuses more than 5000 rows in one run, and writes nothing when the database schema is unknown.

  **Clean up a range yourself** also works for an error you spotted yourself, in a counter or a measurement (temperature, power …): choose the sensor and a period (at most 31 days), plus the last good value, a straight line or a fixed value. The preview shows which data still exists for the period (raw history, 5-minute rows, hourly rows) and, per table, row by row the value before and after. For measurements the hourly rows are recalculated from the corrected 5-minute rows; where those are already gone, the hourly row gets the replacement value and counts as an estimate. A counter must not fall, and without a good value before and after nothing is written. You pick the period in the date fields or with two sliders under the sensor's readings (last 1 to 365 days). The check also finds spikes of measurements far outside the usual (for example 85 °C in a room temperature that is normal again afterwards) and fills the period into the form with one click; values within what the sensor reports at other times (power peaks, rain) are never reported. Safety, backup, verification and undo as above; if someone changed single rows after the cleanup, undo puts back all other rows and leaves the changed ones.
- **Exchange device**: Under Cleanup you pick the old and the new device. Housekeeper proposes matching new entities for each old one (device class, unit, area, name) and decides nothing for you: you confirm every pair one by one, and for meters you choose whether references are replaced or the meter history is carried over. The result is an ordinary preview with backup, verification and undo. You disable the old device afterwards with "Disable device".
- **Rename and assign**: An entity ID can be renamed together with exact references in automations, scripts, scenes and storage-mode dashboards; the original ID and files remain available for undo while unchanged. Entities and devices without an area can receive one through a plan, with a suggestion from their device or integration.
- **Cleaning critical objects**: cleanup actions on critical objects (see Impact) ask for a separate confirmation per object, even when nothing else speaks against them. Policy violations can be hidden, kept (with a reason) or put off for later, like findings.
- **Recorder data on removal**: When removing entities or devices you choose in the toolbar what happens to their recorder data: **Keep** (default), **Delete statistics** or **Delete statistics and history**. The choice holds for the whole plan. It cannot be undone (only from the backup), so you confirm each removal one by one; it is blocked when the Energy dashboard uses the entity or there is no recorder. The preview names the exact row counts.
- **Not used**: a view of active entities that appear in no automation, script, scene, group, helper, or readable dashboard (without diagnostic and configuration entities). Entities and orphaned statistics are shown in tables that can be filtered and sorted by column (entities: device, area, integration, last change, last report, observed since; statistics: kind, unit, last entry, Energy dashboard); on a phone they appear as cards. A hint only, not a finding: voice assistants, apps, auto-generated dashboards, and external systems are invisible to Housekeeper.
- **Delete recorder leftovers** (Unused → Orphaned statistics): pick series and make a plan under Cleanup (preview, confirmation per ID and typing the word), by default also with the stored states (the box can be switched off). Housekeeper creates a Home Assistant backup first and only deletes if it succeeds; series in the Energy dashboard, existing entities and external statistics are left out. It then checks that the statistic is gone and keeps the run in the journal. Only the backup brings them back. Writing actions never run at the same time; a second one reports busy.
- **Successor hints** when replacing references and on a meter change: similar active entities of the same domain (and unit) as buttons under the field. They only fill the field; nothing is chosen for you.

#### Plans, follow-up and log

- **Guided plans and additional maintenance actions**: Plans lead through selection, setup, preview, confirmation, execution and result. Housekeeper can trim stored states older than 7 to 90 days (statistics stay), delete eligible Housekeeper backups according to a retention rule, and remove an unused automation from `automations.yaml`. These actions show their exact scope first; irreversible deletions are clearly marked. Backup cleanup protects backups of watched plans and the newest backup still needed for undo.
- **Follow-up, end state and audit report**: After a plan has run, Housekeeper watches for 24 hours whether new broken references, unavailable entities or returning devices appear (**clean** or **regression**; regressions show under "What should I do now?"). The preview shows the expected end state beforehand, and every plan has an audit report as Markdown, with real names and IDs by default, or with placeholders instead (for sharing). Optionally and experimentally (off by default) Housekeeper suggests small mechanical improvements of an automation (add a description, remove exactly identical triggers, add a timeout to wait steps, change mode and limit; afterwards Housekeeper watches for 24 hours whether the automation gets error runs), each as a plan with a diff, a check by Home Assistant, a backup and undo; blueprint automations are never touched. Several open preview plans can be merged into one in the journal; it is judged afresh, and conflicts (the same object asked for in different ways) are named, not decided silently.
- **Log of deleted statistics**: every deletion of orphaned recorder statistics is noted under Cleanup (time, who, backup, what was deleted and skipped). It cannot be undone, so it is only logged.

### Maintaining

#### Maintenance and backups

- **Maintenance**: the **Maintenance** view starts with the **Backups** tab, **Backup protection** at the top, with a verdict (Reliable, Look first, Problem), four figures and the check lines in four groups (Backup runs, Storage and content, Restorability, Housekeeper) and a strip with the size of the last 14 backups: Housekeeper judges whether the backup strategy is sound (age of the latest backup against the schedule, failed runs and targets, local and remote storage, unusual size, content of the newest backup (failed apps or folders, missing database), age of the copy on each external target, room for the next backup (about one and a half times the last one, a guess), retention, encryption, backup before cleanups). Home Assistant cannot detect the emergency kit and a restore test, so you confirm them with a date, and Housekeeper reminds you of the restore test after 180 days. For the check and the card "Latest backups" only Home Assistant backups (automatic, manual, from other tools) count, not app-update backups. Housekeeper only reads, starts no backup and never restores by itself. At the bottom, folded, is **Tidy up Housekeeper backups**: only the backups Housekeeper itself makes before risky plans can be picked there and deleted by a plan (with confirmation, no undo); your regular backups stay untouched. The **Updates** tab lists the open updates, grouped into system (Home Assistant, operating system, Supervisor), apps, HACS and devices, with the versions, a link to the changes and a jump to Home Assistant; Housekeeper installs nothing. A verdict (**Ready**, **Look first**, **Stop**) judges the lines above the list: backup (as judged by Backup protection), free space, open repairs, failed integrations and missing references. Integrations that cannot start only mean a stop when a system update is open; the space limits (below 3 GiB yellow, below 1 GiB red) are a guess. The **Check** button on the "Configuration" line starts Home Assistant's own configuration check (a few seconds, only when you press it, nothing is changed); an invalid configuration turns the verdict to Stop. What fails after an update or shows up as a new repair is shown by the watch after updates; when an update of Home Assistant, the operating system or the Supervisor starts, Housekeeper keeps the state for it. The section “Afterwards” on the card gives the state of the watch.
- **Blueprints** (Maintenance): blueprint files nobody uses, and automations or scripts whose blueprint is missing or fails to load. Hints only. An automation or script whose blueprint no longer exists is also a finding (Home Assistant does not load it); if the same blueprint is missing for at least two, it appears as a shared cause in the list. The page counts such paths too.

#### Batteries

- **Batteries**: a dedicated view with all battery entities, lowest values first (low from 20 %, configurable). Sensors that report volts instead of percent do not count as percent batteries but get their own card: Housekeeper guesses the type from the highest voltage of the last weeks (for example a 3 V coin cell, a 1.5 V cell, lithium-ion, 12 V), uses that type's limit and runs the same forecast. The type is shown; it is a guess.
- **Battery forecast** (menu Maintain → Batteries) **and maintenance reminders** (Maintain → Reminders): The forecast estimates from the last five weeks when a battery reaches the limit and groups batteries that fall due in the same two weeks. It promises nothing with too few days or a flat or rising curve. You can record the battery type per device; the 30-day shopping list groups the expected replacements by type, and a detected battery change can be entered in the history. Below it you keep your own reminders (filter, descaling, battery change) with a name, an interval in days and the last date; due ones show in "What do I need to do now?" and fire the event `ha_housekeeper_reminder_due`. Housekeeper changes nothing in Home Assistant for this. In Reliability each entry also shows how often its setup failed lately (counted from the scans).

#### Policies

- **Policies (Maintain)**: your own rules for tidiness, switched on one by one and all off at first: entity without an area (only entities of physical devices, without diagnostic, configuration and disabled entities and without service devices), device without an area, automation without a description, battery entity without a device, duplicate display name (per domain), automation without a label (only automations with a registry entry) and naming scheme (one prefix per domain, up to 10, for example `wz_` for `sensor`). Violations are hints and do not count in health, findings, repair hints or sensors. The label `housekeeper_ignore` or **Hide** takes an object out; the switches live only in Housekeeper. Plus the rule “State changes per day” with an adjustable limit (default 5,000); it only reads the last calculated load numbers and never starts a recorder query. More rules: entity id with a trailing number, entity id with a device address (IP, MAC, radio, Zigbee), default name on an automation or script, script without a description or label, device without manufacturer or model, empty area, label without use, automation with more than 10 triggers, exposure without use, sensitive entity exposed, low battery without an automation, entity that writes a lot to the recorder but is unused, and long retention with a big database. These run as heuristics (a hint that can raise false alarms): automation without error handling, literal entity ids in templates, automation triggers itself, and “only ever turned on”.
- **Statistics and dashboards in the policies**: two rules check the metadata of the long-term statistics (unit no longer convertible, state class does not fit the statistics), five rules check dashboards (navigation to a missing view, disabled entities, doubled cards, more than 200 cards, custom cards without any resource). All are off at first; the statistic values (jumps, resets) are not checked.

### Operation

#### Reliability and home functions

- **Reliability**: the **Reliability** view (Operation menu) shows for each config entry how available its entities were over the last 24 hours or 7 days, when at least 80 % of them (at least three, for at least 5 minutes) failed together, and whether that looks more like the cloud or like the device and network (named as a guess). Entities that were down all the time are counted apart. Housekeeper only reads the recorder for this, in the background, and remembers the last result (also across a restart, and likewise for load and database in the Recorder view): the view opens at once with the last numbers ("As of …") and recalculates in the background; for windows that were opened once it recalculates every 30 minutes. Every row opens the integration; its detail page has a **Reliability** tab with the entities that were down. Below, **Unstable entities** lists entities that keep failing and coming back (unstable from 3 failures and 0.5 a day, flapping from 1.5 a day), with duration, time-of-day pattern and the number of automations that depend on them. Failures during a shared outage of the integration count for the integration. On an entity's detail page “flapping” or “unstable” appears with the same numbers in the diagnosis and the key facts (from the last calculated result; the detail page never starts the recorder query).
- **Home functions** (Operation menu): You put together important functions of your home from entities, devices, automations, scenes, scripts, integrations and apps (“Heating”, “Alarm”, “Photovoltaics”). The shared object search groups results by type and suggests known dependencies; only what you explicitly add is monitored. For entities you set an update deadline, a minimum value and a duration for “unavailable”. The editor previews the latest scan evaluation, and a function can be disabled temporarily. The page distinguishes confirmed faults, check gaps, healthy and disabled functions; the overview highlights active problems and otherwise names the function impaired last. Each function has a history (state changes and edits, also plans for the objects; with search, filter and paging, quick back and forth becomes one line) and shows the availability of the last 30 days with incidents and one square per day. Assigned objects are clickable. State changes are available as a Home Assistant event and an event entity; each function has a sensor whose attributes also give the last fault, incidents, downtime minutes and availability, and persistent Home Assistant notifications are configurable per function. The retention (1 to 365 days, default 30) also applies to the scan history and is set under Settings → Scan and messages.

#### Recorder and database

- **Write load**: The **Recorder** view (Operation menu) starts with the **write load**; it shows which entities, integrations and events write the most to the recorder: rows per day and entity, the busiest hour, “updates without a new state” (the value stayed the same, only attributes changed; truly identical updates are not written by Home Assistant), the mean attribute size of the last 24 hours, the estimated load share of each integration (an extrapolation in percent, not a measurement in bytes) and the most frequent event types. Anything unusual comes first with its numbers and the objects that depend on it (automations, template sensors). Housekeeper only reads the recorder for this, in the background, remembers the last result like reliability does (the view opens at once with “As of …” and recalculates in the background) and changes no recorder setting; recommendations are text. If another recorder query is running, the panel asks again by itself.
- **Storage use**: The second tab of the **Recorder** view (Operation menu) shows the **storage use**, which asks how much space each entity takes in the database (the write load asks how often it is written): which entities fill the database, with share, write frequency, use and a suggested recorder exclusion to copy into `configuration.yaml`; Housekeeper does not change the recorder configuration.
- **Database**: The **Database** card in the Recorder view checks the recorder, read only: size of the database and WAL file (SQLite only; the daily size is noted as a number and gives the growth), duplicate statistics timestamps, hours missing from the statistics, statistics that do not fit their entity (unit, state class), and stretches of at least 10 minutes without a single entry, told apart as restart (according to Housekeeper's own log) and recorder gap. Each finding names numbers and a recommendation as text; this check repairs and deletes nothing. The calculation starts when the Recorder view is opened; problems then also appear in the overview tasks.

#### Storage and system

- **Storage & system**: The **Storage & system** entry under Operation shows how full the disk, RAM and CPU are (with swap and load), and what takes up the space: system storage by category and the apps with CPU, RAM and data size (both from the Supervisor on Home Assistant OS and Supervised), the largest consumers under `/config` (recorder database with its WAL, backups, `www`, media …), every custom integration, the custom cards of the dashboards (a HACS card counts with its folder and is taken out of `www`; a status shows whether the local file is missing and whether a dashboard uses the card, as far as the file tells) and the blueprint files. Each list is sortable, searchable and exports as CSV. Housekeeper only reads; nothing is changed or stored. The folder measurement stops after 20 seconds (for example on a slow network share under `/config`); the page then calls the sizes minimums.

### Security and access

#### Exposure, access and credentials

- **Exposure**: The **Exposure** entry under Security shows which entities Assist, Alexa, Google Assistant and HomeKit can reach and names what stands out: diagnostic entities, sensitive entities (locks, alarm panels, cameras, sirens, valves, persons, trackers, garage doors, gates and doors; a hint only), exposure of disabled or orphaned entities, locks, alarm panels and doors that Google may open without a PIN (a warning), new entities exposed automatically to Alexa or Google (a hint), AI conversation agents and the MCP server that may control through Assist and so hand the Assist exposure to a language model or connected programs (a hint; Ollama and llama.cpp count as local), duplicate voice names and webhooks of integrations that no longer exist. Housekeeper reads metadata only: passwords, tokens, ports and webhook ids are neither read nor shown, and nothing is stored or changed. If Alexa or Google Assistant is switched off in the Nabu Casa settings, it says "switched off in Nabu Casa" and the assistant is not judged. If a source does not answer, it says "cannot be checked".
- **Access & data (detail page)**: The detail page of an integration has a tab **Access & data**: system access with a risk level, data flow (local or cloud) and stored credentials (kind, field name, set or empty, never a value). The reports are read only when the tab is opened; after that the tab shows a dot for a high risk or an empty field, and the overview of the integration a red line for a high system access.
- **Access & data flow**: The **Access & data flow** entry under Security shows, on one page, which integrations reach the system (Supervisor, shell, radio sticks, hardware, database, cameras, location) with their data flow and a risk level, and which exchange data with external or cloud services (by domain and IoT class). With a Supervisor, a third list shows the rights of every app (full hardware access, privileges, Docker API, host network, Supervisor role, Home Assistant and login access, AppArmor, protection mode, open ports on the host) with a risk level and origin (official, community, local; experimental or deprecated); a click opens the app. A **Reachable from outside** tab collects the ways in: Nabu Casa remote access, tunnel, proxy, DynDNS and VPN apps (recognised by name; a VPN is green because it is private), the MCP server and open webhooks; port forwarding on the router is not visible to Housekeeper, proxy and SSL are checked by the "HTTP configuration" policy. Integrations that are not part of Home Assistant (HACS) carry "custom code, full rights" and are at least medium, since their code runs with all the rights of Home Assistant. Only GPS trackers count as location; trackers through a router or Bluetooth show as "presence on the network" and do not raise the risk. The classification is a hint, not a proof; a row opens the integration.
- **Credentials**: The **Credentials** entry under Security lists which integrations store passwords, tokens, API keys, secrets, webhook ids or PINs, of what kind, and whether a value is set. It never reads or shows a value, not even a part of it or its length, and exports none; a click on a row opens the integration in Home Assistant, where the credentials can be changed. The detection goes by the field name, so it is a hint. An integration that asks Home Assistant for a new login carries the mark "Login needed" and has a tile of its own; another tile counts disabled integrations that still hold credentials. The **Accounts** tab shows the users (without system accounts) with role, two-factor and last login; the "Admins without two-factor" tile opens it filtered. The **Long-lived tokens** tab names each token with name, account and age; Home Assistant does not record when one was last used.
- **Protection mode** (Settings → Protection mode): sets on the server what plans may change: 1 read only (shown as “Read only”), 2 quarantine (disabling only; “Quarantine only”), 3 confirmed changes with backup (no irreversible deletion of recorder data; “No irreversible deletions”), 4 full maintenance (“Everything allowed”). New installs start at 1 (read only) and release changes on purpose; existing installs keep 4. The limit holds for confirming, starting and undoing, not only for buttons in the panel; making plans and every view stay allowed. When the mode is not "full" the safety line says so.

### Using the interface and settings

#### Using the interface

- **Sidebar button**: when Home Assistant's sidebar is hidden (narrow screen, or "always hidden" in the profile), a menu button left of the logo opens it, so the panel is never a dead end on a tablet.
- **Layout of the long views**: Reliability, Recorder, Automations, Policies and Exposure start with a row of key figures (traffic-light colour, a click jumps to the section) and are split into tabs with a counter and a mark for anything unusual; the chosen tab is kept in the address (`?tab=`). In Exposure every tile (Assist, Alexa, Google Assistant, HomeKit) shows the entities it reaches on a click; in Policies the rules (switches) and the violations are apart.
- **Lists remember and inventory export**: sort and filters of every list come back at the next visit (this browser only, not the search text). In Findings you can tick several, hide them together or export them as CSV. In the Inventory the list bar has an **Export** menu with **List as CSV** (all rows of the search) and **Guided export**: selected objects for selected objects as CSV, Markdown or JSON, with selectable fields, placeholders and a preview; everything is generated in the browser. In the graph, five or more alike leaves on one node fold into “12 × Entity”; a click opens the group.
- **Search in lists**: Long lists have a search box, also Automations (runs), Reliability (integrations, unstable entities), Recorder (loudest entities, findings, integrations), Policies and Exposure; it appears from six entries on.
- **Search and views**: The search box in the top menu finds entities, devices, integrations, automations and scripts by name, ID, platform, manufacturer and model; arrow keys and Enter open the hit. In the lists, search, filters and sort can be saved as a named **view** (in this browser only). Reliability can compare the period with the one before (percentage points per integration).
- **Long lists** are paged (default 20 per page, selectable 20/50/100) and can be searched, filtered, and sorted (findings, batteries, not used, inventory). The export contains exactly the findings shown.
- **Deep links**: the panel supports addresses like `/ha-housekeeper?view=findingsNav&filter=orphaned` or `?object=entity:sensor.x`; the repair hints use them.

#### Languages

The panel and configuration flow are available in German and English. By default the active Home Assistant language determines the panel language; under **Settings → Appearance** you can set German or English by hand.

#### Settings, sensors and connections

- **Exception rules and vacation mode** (Settings → Exceptions): rules take objects out without hiding every finding one by one. A rule applies to an **area**, a **label**, an **integration**, a **domain** (the part of the entity id before the dot, for example all `media_player`), a single **device** or an **entity**. In the form **All types** is preselected: the search field like the one in the header finds areas, labels, integrations, devices and entities (also automations, scenes and scripts) at once; saving makes one rule per kind of the objects chosen. A rule either **hides** or **reports only after N days** (the delay applies only to unavailable, unknown and stale entities and to devices that are down). If several rules match, “hide” wins, and of several delays the longest. The preview names overlapping rules; delays take effect with the next scan. The page has one card for the rules, where a switch changes between **Always** and **In vacation mode**, and below it a card with the vacation settings; changes there show “Not saved” with “Save” and “Cancel”. Vacation mode follows an entity of your choice (for example `input_boolean.vacation`); rules “only in vacation mode” hide only while it is on. After the vacation, an outage that began before and was hit by a vacation rule counts from the end of the vacation, with a **grace period** (default 24 hours) or the days of your own delay rule. While findings are held back, a strip under the header shows the state; the “Findings” sensor carries the attributes `vacation_mode`, `vacation_held` and `vacation_entity`. An entity that only flickers does not end the vacation. In the findings list the filter “By a rule” shows what a rule hides.
- **Setting up vacation mode** (Settings → Exceptions → Vacation mode): The mode is on while the chosen entity is “on”; unavailable or unknown counts as off.
  - **Suggestion:** If you have not chosen anything and a helper `input_boolean.vacation_mode` exists (or `vacation`, `holiday_mode`, `holiday`, `urlaubsmodus`, `urlaub`; with English the English names first), Housekeeper fills it into the field as a suggestion. It counts only once you **save**. If you clear the field and save, vacation mode stays off and the suggestion does not come back.
  - **Switch, helper, binary sensor, schedule:** Any entity that can be “on” works. You switch it in Home Assistant yourself, by hand, automation or schedule.
  - **A calendar of its own:** If you choose a calendar entity (`calendar.…`) and leave the **keyword** empty, every running event counts as vacation. Best create a calendar “Vacation” for this and enter your trips there.
  - **Your normal calendar with a keyword:** With a keyword (for example `Vacation`), only running events whose title contains that word count, upper or lower case alike. “Vacation Mallorca” switches the mode on, “Dentist” does not. Even when another event runs at the same time, Housekeeper finds the right one: it asks the calendar for all events of this moment instead of relying on the single one Home Assistant shows in the attribute. If the calendar cannot be asked, the title shown is used instead.
  - **Start and end:** The mode starts and ends with the event; Housekeeper reacts right away when an event begins or ends. An all-day event up to and including 24 October ends in Home Assistant at the end of that day, after which the grace period begins.
- **Settings** (cog on the right of the top menu): the start page shows one tile per tab (protection mode, exceptions, scan and messages, AI access, appearance, info), each with its current state and a stripe in its colour (AI access: off grey, reading green, changing amber). The page has a header band (version, Home Assistant, objects, “Copy info”) and six tabs: **Appearance**, **Protection mode**, **Exceptions**, **Scan and messages**, **AI access** and **Info**. Appearance includes language, font size, mode, color scheme, density, animation, start view and entries per page; it is stored in your Home Assistant user profile (and in the browser as well). Protection mode selects the server-side protection mode. Exceptions sets exception rules and vacation mode, and shows the hidden findings and files. Scan and messages contains the scan interval, all diagnostic limits, the notification for new broken references and the events for your own automations. Saving is possible only after a change, and Housekeeper reloads afterwards.
- **Notification** (Settings → Scan and messages, off by default): tells you in Home Assistant about each new broken reference once; switching it on announces nothing old.
- **AI access** (Settings → AI access, off by default): lets a program or AI agent that can call Home Assistant services (for example ha-mcp) read Housekeeper and, if you want, change its own list. Housekeeper opens no port and starts no server for this.
  - **Switching on:** **Switch on AI access** allows reading only. **Change the list** is its own switch and needs the first one. Both are off until you switch them on. With **Switch off automatically** (never, 1, 8 or 24 hours) both switches go off by themselves after the chosen time; the log then holds an entry. While access is on, a strip under the header shows the state and when it ends.
  - **Instruction for the agent:** In the guide of the tab, a button copies a ready text you give to your agent (services, procedure, rules, example questions).
  - **Sensitive objects:** The setting **Keep sensitive objects back** (on by default) keeps locks, alarm panels, cameras, sirens, valves, people, location trackers and garage doors and gates out of every answer; `findings` only says how many findings were kept back. This matters above all with a model in the cloud.
  - **Reading services:** `ha_housekeeper.status` (where the scan stands, findings by level, a short guide for the agent), `summary` (the five heaviest groups of findings with three examples each and the next call), `findings` (most important first, in pages of at most 50, with filters and `next_cursor`), `object` (one object with findings, the decision, notes and connections, at most 25 per list) and `audit` (the log). Every answer carries `schema`.
  - **Writing services** (only with **Change the list**): `finding_decide` (ignore, keep or put off a finding, or show it again; every decision needs a reason), `mark` (mark an object), `note_set` (logbook entry) and `undo`. Only Housekeeper's own lists change, never Home Assistant. Notes carry `written_by` (user, housekeeper or agent).
  - **Limits and protection:** Only administrators can call the services. By default at most 200 changes in 5 minutes and 120 reads per minute (adjustable in the tab: 50 to 500 and 60 to 300); beyond that the call is refused. Names in the answers are data, never instructions; passwords, tokens and credentials are never included. A refused call names the field that is wrong or the next step.
  - **Log:** Every call is in the log with time, service and result (never the content of the answers; at most 2,000 entries and 90 days, many reads in a row are one line). Every change can be taken back one by one; **Take back** at the top of the log takes back all changes of the last hour, the last 24 hours or all of them. **Export** saves the rows of the current search and filters as CSV, Markdown or JSON (time, kind, service, object, user as “System”, “You” or “Other”, result, number of calls, taken back).
  - **Event:** Every change fires `ha_housekeeper_ai_change` (`function`, `user_id`, short `params`, `changed`), so an automation can notify you.
  - **Note on `ws_command`:** The commands the panel uses also work through the `ws_command` of ha-mcp, but they are not documented, and the full list (`inventory`) can be over 10 MB. The services are meant for agents. The switches and the confirming, running and undoing of maintenance plans refuse connections that do not come from a signed-in panel session (long-lived access tokens and the Supervisor connection through which ha-mcp runs as an app); that protects the usual setup, it is not a seal.
- **Diagnostics file** (Settings → Info): numbers and versions only, no names, ids or attributes, fit for an issue.
- **Update status** (Settings → Info): Housekeeper compares the version actually loaded with the state stored by HACS. The card detects an available update, mismatching or missing HACS data and, in particular, an earlier commit installation for which HACS can miss the move to releases; it explains the next step and opens the Housekeeper repository directly in HACS. No additional GitHub request is made. From Home Assistant 2026.11 HACS is built in as “Marketplace”; Housekeeper reads installed integrations, updates, archived and removed repositories from both.
- **Sensors**: Housekeeper creates a service device with counters (findings, orphaned and unavailable entities, broken references, possible duplicates, unused automations, low batteries, last scan) for use in dashboards and automations.
- **Events for your own automations**: After a scan Housekeeper fires an event on the Home Assistant bus for each new situation: `ha_housekeeper_critical_finding`, `ha_housekeeper_backup_overdue`, `ha_housekeeper_quarantine_expired`, `ha_housekeeper_followup_regression` and `ha_housekeeper_integration_down` and `ha_housekeeper_reminder_due`. Each situation is announced once (silent the first time so the existing state does not fire at once); the data holds ids and numbers only. Housekeeper sends nothing itself; you build the notification in an automation.

## Safety model

- The panel is available to Home Assistant administrators only.
- All Housekeeper WebSocket endpoints require administrator privileges.
- AI access is off by default. Its services require administrator privileges, read only with the first switch and change only with the second, and even then only Housekeeper's own lists, never Home Assistant. They are limited (by default 200 changes in 5 minutes, 120 reads per minute, adjustable), every call is in the log, every change can be taken back, and the switches can switch themselves off after a time. The switches and the confirming, running and undoing of plans refuse connections that do not come from a signed-in panel session (long-lived access tokens and the Supervisor connection through which ha-mcp runs as an app) (protection for the usual setup, not a seal).
- Housekeeper offers read and scan operations. It writes to Housekeeper's own storage and integration options when requested. Confirmed plans may write to entity and device registries (disable, remove, rename, assign an area or label), automation, script and scene files, storage-mode dashboards and Energy settings, recorder history and statistics, and Housekeeper-created backups. Deleting recorder data or backups is irreversible in Housekeeper; other actions document whether journal undo or only a Home Assistant backup can restore them.
- `unavailable` is never treated as automatically orphaned.
- Disabled devices and integrations are distinguished from missing objects.
- No `.storage` file is edited directly.
- No cleanup action runs automatically.

Housekeeper does not rewrite dynamic templates, YAML-mode dashboards, helpers or groups as replacement sources, and it does not change the recorder configuration. Where a confirmed repair intentionally rewrites recorder values, its preview names the affected rows and requires full protection mode and a successful backup.

## Usage

Open **Housekeeper** from the Home Assistant sidebar. The overview starts with a status header (ring, a sentence about the situation, key figures) and tiles “What would you like to do?” whose stripe shows the state, then “What do I need to do now?”, and shows what changed since the last scan, plus object totals, findings, and the time of the last scan.

- Select a category card to open a filtered inventory.
- Select an object: status, cause, device, area, and the risk of removing it are on top, with the tabs Overview, Dependencies, Technical data, and Attributes below, plus **Runs** for automations and scripts and **Reliability** for integrations. The **Actions** tab has the same layout for every object, sections that do not apply are left out: **Recommended** (what answers an open finding, such as replace or disable), **Notes** (the mark), **More actions** (always available tools such as exchange device, repair values, change meter), **Name and classify** (label, area) and **Recording and monitoring**. Apps have it too, with the mark.
- Open **Dependencies** and select an object to explore incoming and outgoing relationships. A switch toggles between list and graph (origin and users across up to three levels, with “What breaks on removal?”); small screens show only the list.
- Use **Scan now** to refresh the snapshot after configuration or device changes. Without intervention Housekeeper scans automatically every 6 hours. From outside, the service `ha_housekeeper.scan` (the option “Wait for the end” returns the numbers) or a “Start scan” button on a dashboard starts a scan; several calls make one scan, none starts shortly after a scan, and it is refused during a plan or while Home Assistant is starting.
- Under **Settings → Devices & services → HA Housekeeper → Configure** you can set the four outage thresholds (info in minutes, default 15; low in hours, default 1; medium in hours, default 24; high in hours, default 168) and also days until an automation counts as unused (default 90, `0` = off), scan interval in hours (default 24, `0` = off), low-battery threshold in percent (default 20), hours until an entity counts as no longer reporting (default 48, `0` = off), and scan-history retention in days (default 30).
- The top menu has two direct entries (Overview, Findings) and five groups: Clean up (Clean up, Repair, Journal), Maintain (Maintenance, Batteries, Reminders, Policies), Operation (Home functions, Reliability, Automations, Recorder, Storage & system), Security (Exposure, Access & data flow, Credentials) and Catalog (Inventory, Dependencies, Changes). **Clean up** is a row of tiles with a count each: disable entities, disable devices, quarantine and removal, not used, orphaned statistics, deleted.
- **Back**: detail pages, the graph and jumps through links have a “Back to …”. The graph goes back node by node and finally to the page it was opened from; detail pages reopen the tab you left, lists jump back to the old spot. The browser's back button takes the same way back one step.

The first scan establishes the initial observation timestamps. Later scans preserve the start of an unchanged classification and reset it when the classification changes.

## Current limitations

- Housekeeper never cleans up automatically: every change needs a plan you confirmed. Four things are different:
  - *Confirmed cleanup*: every change runs only as a confirmed plan. Depending on the action this includes disabling, removal, device cleanup, replacing references, meter and recorder repairs, renaming, assigning areas or labels, deleting automations, trimming history and deleting Housekeeper backups.
  - *Undo in the journal*: Housekeeper restores registry entries, references and entity IDs while they are unchanged. Whether a device gets its entities back is up to the integration.
  - *Not undoable in Housekeeper*: deleted recorder data and deleted backups are final; recorder merges and history trimming can only be restored from the backup created before the plan.
  - *Full backup restore*: only Home Assistant itself does that; Housekeeper does not restore backups.
- Housekeeper needs Home Assistant 2026.8 or newer, because a device belongs to exactly one config entry there.
- Automation analysis covers automations currently loaded by Home Assistant. The amount of available detail can vary for invalid or externally managed automations.
- Dynamic templates cannot always be resolved to one definite target. Such relationships are never presented as certain without supporting runtime information.
- The dependency view focuses on direct configuration relationships. Recorder history and statistics are detected and counted, but their contents are not interpreted as references. Unreadable or auto-generated dashboards may also remain invisible; impact analysis is guidance, not a guarantee.
- Possible duplicates and unused automations are based on heuristics and are hints, not certainty.
