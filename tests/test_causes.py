"""Many unavailable entities with one cause become one cause with follow-up findings."""

from __future__ import annotations

import pytest

pytest.importorskip("homeassistant")

from custom_components.ha_housekeeper.causes import apply_causes  # noqa: E402


def _entity(object_id, **extra):
    return {"object_type": "entity", "object_id": object_id, "status": "unavailable", **extra}


def _finding(object_id, **extra):
    return {
        "rule_id": "entity.state_unavailable",
        "object_id": object_id,
        "classification": "unavailable",
        "key": f"k|{object_id}",
        "ignored": False,
        **extra,
    }


ENTRY = {"object_type": "config_entry", "object_id": "e1", "name": "Cloud", "status": "problem"}
DEVICE = {"object_type": "device", "object_id": "d1", "name": "Lamp", "status": "active"}


def test_a_failed_integration_collects_its_unavailable_entities() -> None:
    objects = [
        ENTRY,
        _entity("sensor.a", config_entry_id="e1"),
        _entity("sensor.b", config_entry_id="e1"),
    ]
    objects.append(_entity("sensor.c", config_entry_id="other"))
    objects.append({"object_type": "automation", "object_id": "automation.x", "status": "active"})
    edges = [
        {
            "source": "automation:automation.x",
            "target": "entity:sensor.a",
            "relation": "TRIGGERS_ON",
        }
    ]
    findings = [_finding("sensor.a"), _finding("sensor.b", ignored=True), _finding("sensor.c")]
    causes = apply_causes(objects, edges, findings)
    assert [c["id"] for c in causes] == ["integration_down:e1"]
    assert causes[0]["follower_count"] == 1, "a hidden finding does not count"
    assert causes[0]["consumers"] == {"automation": 1}
    assert [f.get("cause_id") for f in findings] == ["integration_down:e1", None, None]


def _device_finding(**extra):
    return {
        "rule_id": "device.down",
        "object_id": "d1",
        "classification": "problem",
        "key": "device.down|d1|",
        "ignored": False,
        **extra,
    }


def test_a_working_integration_is_no_cause_and_a_dead_device_is() -> None:
    objects = [{**ENTRY, "status": "active"}, DEVICE]
    objects += [_entity(f"sensor.{n}", config_entry_id="e1", device_id="d1") for n in "abc"]
    findings = [_finding(f"sensor.{n}") for n in "abc"]
    assert apply_causes(objects, [], findings) == [], "no finding of the device: no cause"
    own = _device_finding()
    causes = apply_causes(objects, [], [*findings, own])
    assert [(c["kind"], c["follower_count"], c["finding_key"]) for c in causes] == [
        ("device_down", 3, own["key"])
    ]
    assert own["cause_id"] == "device_down:d1"
    assert apply_causes(objects, [], [*findings, _device_finding(ignored=True)]) == [], "decided"
    assert all("cause_id" not in f for f in findings), "old causes are cleared"


def test_the_device_hangs_below_the_integration_and_the_integration_below_its_app() -> None:
    objects = [
        {"object_type": "app", "object_id": "mosquitto", "name": "Mosquitto", "status": "stopped"},
        ENTRY,
        {**DEVICE, "config_entry_ids": ["e1"]},
    ] + [_entity(f"sensor.{n}", config_entry_id="e1", device_id="d1") for n in "abc"]
    entity_findings = [_finding(f"sensor.{n}") for n in "abc"]
    app_finding = {
        "rule_id": "app.stopped_in_use",
        "object_id": "mosquitto",
        "affected_object": "e1",
        "classification": "problem",
        "key": "app.stopped_in_use|mosquitto|e1",
        "ignored": False,
    }
    causes = {
        c["id"]: c
        for c in apply_causes(objects, [], [*entity_findings, _device_finding(), app_finding])
    }
    assert set(causes) == {"app_down:mosquitto", "integration_down:e1", "device_down:d1"}
    assert causes["device_down:d1"]["parent_id"] == "integration_down:e1"
    assert causes["integration_down:e1"]["parent_id"] == "app_down:mosquitto"
    assert causes["app_down:mosquitto"]["child_ids"] == ["integration_down:e1"]
    assert {i: c["follower_count"] for i, c in causes.items()} == {
        "app_down:mosquitto": 0,
        "integration_down:e1": 0,
        "device_down:d1": 3,
    }
    assert causes["app_down:mosquitto"]["total_followers"] == 3, "the totals run up the chain"
    assert {f["cause_id"] for f in entity_findings} == {"device_down:d1"}
    assert app_finding["cause_id"] == "app_down:mosquitto"


def test_a_missing_target_is_a_cause_only_when_several_point_to_it() -> None:
    def broken(domain, kind, object_id, target):
        return {
            "rule_id": f"{domain}.missing_{kind}",
            "object_id": object_id,
            "affected_object": target,
            "classification": "broken_reference",
            "key": f"{domain}.missing_{kind}|{object_id}|{target}",
            "ignored": False,
        }

    findings = [
        broken("automation", "entity", "automation.a", "sensor.gone"),
        broken("dashboard", "entity", "main", "sensor.gone"),
        broken("automation", "entity", "automation.a", "sensor.alone"),
        broken("script", "service", "script.s", "x.y"),
        broken("automation", "service", "automation.b", "x.y"),
        broken("automation", "area", "automation.c", "gone_area"),
        broken("automation", "blueprint", "automation.d", "a/gone.yaml"),
        broken("script", "blueprint", "script.t", "a/gone.yaml"),
    ]
    causes = apply_causes([], [], findings)
    assert sorted((c["kind"], c["object_id"], c["follower_count"]) for c in causes) == [
        ("blueprint_missing", "a/gone.yaml", 2),
        ("entity_missing", "sensor.gone", 2),
        ("service_missing", "x.y", 2),
    ]
    assert all(c["virtual"] and c["parent_id"] is None for c in causes)
    assert findings[0]["cause_id"] == "entity_missing:sensor.gone"
    assert "cause_id" not in findings[2]


def test_a_device_is_down_when_all_its_entities_are_and_one_has_a_finding() -> None:
    from custom_components.ha_housekeeper.causes import device_down_findings

    entities = [
        _entity(f"sensor.{n}", device_id="d1", status_since=f"2026-10-0{i}T00:00:00+00:00")
        for i, n in enumerate("abc", start=1)
    ]
    devices = [DEVICE, {**DEVICE, "object_id": "d2"}]
    flagged = [_finding("sensor.a")]
    found = device_down_findings(entities, devices, flagged)
    assert [(f["rule_id"], f["object_id"], f["first_detected_at"]) for f in found] == [
        ("device.down", "d1", "2026-10-03T00:00:00+00:00")
    ]
    assert device_down_findings(entities, devices, []) == [], "too early: no entity finding yet"
    assert device_down_findings(entities[:2], devices, flagged) == [], "fewer than three entities"
    entities[0]["status"] = "active"
    assert device_down_findings(entities, devices, flagged) == [], "one entity works"


def test_a_device_in_standby_is_down_and_collects_its_unknown_entities() -> None:
    from custom_components.ha_housekeeper.causes import device_down_findings

    entities = [
        _entity(f"sensor.{n}", device_id="d1", status="unknown", had_value=True) for n in "abc"
    ]
    entities += [
        _entity("sensor.never", device_id="d1", status="unknown"),
        _entity("sensor.off", device_id="d1", status="disabled"),
    ]
    flagged = [_finding("sensor.a", classification="unknown", rule_id="entity.state_unknown")]
    found = device_down_findings(entities, [DEVICE], flagged)
    assert [(f["object_id"], f["evidence"][0]["kind"]) for f in found] == [
        ("d1", "all_entities_without_value")
    ]
    found[0]["key"], found[0]["ignored"] = "k|d1", False
    causes = apply_causes([DEVICE, *entities], [], [*flagged, *found])
    assert [(c["id"], c["follower_count"]) for c in causes] == [("device_down:d1", 1)]


def test_an_integration_that_is_down_is_a_cause_even_without_follow_up_findings() -> None:
    objects = [ENTRY, _entity("sensor.a", config_entry_id="e1")]
    edges = [
        {
            "source": "automation:automation.x",
            "target": "entity:sensor.a",
            "relation": "TRIGGERS_ON",
        }
    ]
    causes = apply_causes(objects, edges, [])
    assert [(c["id"], c["follower_count"], c["impact"]) for c in causes] == [
        ("integration_down:e1", 0, "none")
    ]
    assert causes[0]["consumers"] == {"automation": 1}


def test_the_finding_of_an_outage_belongs_to_its_cause_and_a_decision_removes_the_cause() -> None:
    def outage(**extra):
        return {
            "rule_id": "config_entry.not_loaded",
            "object_id": "e1",
            "classification": "problem",
            "key": "config_entry.not_loaded|e1|",
            "ignored": False,
            **extra,
        }

    own = outage()
    causes = apply_causes([ENTRY], [], [own])
    assert causes[0]["finding_key"] == own["key"] and own["cause_id"] == causes[0]["id"]
    assert causes[0]["follower_count"] == 0

    known = outage(ignored=True)
    assert apply_causes([ENTRY], [], [known]) == [], "known, hidden or marked: no longer news"
    assert "cause_id" not in known


def test_log_facts_count_per_integration_and_never_carry_a_message():
    from types import SimpleNamespace as NS

    from custom_components.ha_housekeeper.log_facts import log_facts

    def entry(name, level, count, message, source=("x.py", 1)):
        return NS(
            name=name,
            level=level,
            count=count,
            message=[message],
            source=source,
            first_occurred=1_700_000_000.0,
            timestamp=1_700_000_100.0,
            exception="SECRET-TRACE",
        )

    records = {
        1: entry("homeassistant.components.hue.light", "ERROR", 3, "token=SECRET"),
        2: entry("custom_components.hue.api", "WARNING", 2, "x"),
        3: entry("homeassistant.config_entries", "ERROR", 1, "Error setting up entry Box for demo"),
        4: entry("other", "ERROR", 1, "x", ("components/zha/core.py", 5)),
        5: entry("homeassistant.components.hue", "INFO", 9, "x"),
        6: entry("unknown", "ERROR", 1, "x"),
    }
    hass = NS(data={"system_log": NS(records=records)})
    facts = log_facts(hass)
    assert set(facts) == {"hue", "demo", "zha"}
    assert facts["hue"]["level"] == "error" and facts["hue"]["count"] == 5
    assert "SECRET" not in repr(facts)
    assert log_facts(NS(data={})) == {}
