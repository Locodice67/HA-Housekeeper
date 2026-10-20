"""Marks tell Housekeeper what to expect: they hide "not available" findings and can block cleanup."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

pytest.importorskip("homeassistant")

from custom_components.ha_housekeeper.cleanup import judge_action  # noqa: E402
from custom_components.ha_housekeeper.marks import _clean, apply_marks  # noqa: E402

NOW = datetime(2026, 10, 9, tzinfo=UTC)


def _world():
    objects = [
        {"object_type": "device", "object_id": "d1", "status": "unavailable", "name": "Hub"},
        {
            "object_type": "entity",
            "object_id": "sensor.a",
            "device_id": "d1",
            "status": "unavailable",
        },
        {
            "object_type": "entity",
            "object_id": "sensor.b",
            "device_id": None,
            "status": "unavailable",
        },
    ]
    finding = lambda eid, cls="unavailable": {  # noqa: E731
        "object_id": eid,
        "classification": cls,
        "ignored": False,
        "ignored_by": None,
    }
    return objects, [
        finding("sensor.a"),
        finding("sensor.b"),
        finding("sensor.b", "broken_reference"),
    ]


def _mark(kind, days=None):
    until = (NOW + timedelta(days=days)).isoformat() if days is not None else None
    return {"kind": kind, "at": "", "reason": "", "until": until, "target": None, "by": None}


def test_a_mark_hides_unavailable_findings_of_the_object_and_its_device_only() -> None:
    objects, findings = _world()
    apply_marks(
        objects, findings, {"device:d1": _mark("seasonal"), "entity:sensor.b": _mark("spare")}, NOW
    )
    assert [f["ignored_by"] for f in findings] == ["mark", "mark", None], "a broken reference stays"
    assert findings[0]["mark"]["kind"] == "seasonal"


def test_a_mark_that_ran_out_brings_the_finding_back_as_due() -> None:
    objects, findings = _world()
    apply_marks(objects, findings, {"entity:sensor.a": _mark("expected_offline", -1)}, NOW)
    assert findings[0]["ignored"] is False and findings[0]["resurfaced"] is True
    assert objects[1]["mark_due"] is True


def test_keep_hides_nothing_but_blocks_cleanup_of_the_object_and_its_entities() -> None:
    objects, findings = _world()
    apply_marks(objects, findings, {"device:d1": _mark("keep")}, NOW)
    assert not findings[0]["ignored"]
    entities = {o["object_id"]: o for o in objects if o["object_type"] == "entity"}
    assert entities["sensor.a"]["marked_keep"] and "marked_keep" not in entities["sensor.b"]
    verdict = judge_action("disable_entity", "sensor.a", entities, [])
    assert verdict["verdict"] == "blocked" and "marked_keep" in verdict["reasons"]
    apply_marks(objects, findings, {}, NOW)
    assert "marked_keep" not in entities["sensor.a"]


def test_the_keep_label_blocks_cleanup_like_the_keep_mark() -> None:
    objects, findings = _world()
    objects[0]["labels"] = ["housekeeper_keep"]
    apply_marks(objects, findings, {}, NOW)
    assert objects[0]["marked_keep"] and not findings[0]["ignored"]


def test_a_stored_mark_of_an_unknown_shape_is_dropped() -> None:
    assert _clean({"kind": "nope"}) is None and _clean("x") is None
    assert _clean({"kind": "keep", "reason": "x" * 500})["reason"] == "x" * 200


def test_a_mark_of_an_integration_or_an_app_hides_its_failure_findings() -> None:
    def finding(rule, object_id, affected=None):
        return {
            "rule_id": rule,
            "object_id": object_id,
            "classification": "problem",
            "ignored": False,
            "affected_object": affected,
        }

    findings = [
        finding("config_entry.not_loaded", "e1"),
        finding("config_entry.not_loaded", "e2"),
        finding("app.stopped_in_use", "tail", "e3"),
        finding("app.stopped_in_use", "other", "e4"),
        finding("device.down", "d1"),
        finding("device.down", "d2"),
    ]
    marks = {
        "device:d1": _mark("expected_offline"),
        "config_entry:e1": _mark("seasonal"),
        "config_entry:e3": _mark("expected_offline"),
        "app:other": _mark("spare"),
    }
    apply_marks([], findings, marks, NOW)
    assert [f["ignored_by"] if f["ignored"] else None for f in findings] == [
        "mark",
        None,
        "mark",
        "mark",
        "mark",
        None,
    ]


def test_a_mark_with_a_window_hides_only_inside_it_and_its_grace() -> None:
    mark = _mark("expected_offline") | {
        "window": {"mode": "time", "from": "21:00", "to": "06:00"},
        "grace": 30,
    }

    def hidden(hour: int, minute: int = 0) -> bool:
        objects, findings = _world()
        local = datetime(2026, 10, 9, hour, minute, tzinfo=UTC)  # a UTC "local" clock is enough
        apply_marks(objects, findings, {"entity:sensor.b": mark}, local)
        return findings[1]["ignored"]

    assert hidden(23) and hidden(2) and hidden(6, 20), "over midnight, plus the grace"
    assert not hidden(6, 40) and not hidden(12), "by day the finding is watched"

    sun = _mark("expected_offline") | {"window": {"mode": "sun"}, "grace": 30}
    objects, findings = _world()
    apply_marks(objects, findings, {"entity:sensor.b": sun}, NOW)
    assert not findings[1]["ignored"] and findings[1]["mark_outside_window"], "no sun.sun: visible"
    objects, findings = _world()
    apply_marks(objects, findings, {"entity:sensor.b": sun}, NOW, (True, NOW))
    assert findings[1]["ignored"]


def test_an_outage_with_a_window_counts_from_the_end_of_the_window() -> None:
    from custom_components.ha_housekeeper.marks import counts_from  # noqa: E402

    mark = _mark("expected_offline") | {
        "window": {"mode": "time", "from": "21:00", "to": "06:00"},
        "grace": 30,
    }
    morning = datetime(2026, 10, 9, 8, 0, tzinfo=UTC)
    assert counts_from(mark, morning) == datetime(2026, 10, 9, 6, 30, tzinfo=UTC)
    assert counts_from(mark, datetime(2026, 10, 9, 2, 0, tzinfo=UTC)) is None, "still hidden"
    assert counts_from(_mark("expected_offline"), morning) is None, "no window"


def test_the_scanner_looks_again_when_the_window_of_an_integration_closes() -> None:
    from types import SimpleNamespace

    from custom_components.ha_housekeeper.inventory import InventoryScanner  # noqa: E402

    sun = {"state": "below_horizon"}
    scanner = InventoryScanner.__new__(InventoryScanner)
    scanner.marks = SimpleNamespace(
        items={
            "config_entry:abc": _mark("expected_offline") | {"window": {"mode": "sun"}, "grace": 30}
        }
    )
    scanner._snapshot = {"findings": []}
    scanner._window_seen = {}
    scanner.hass = SimpleNamespace(
        states=SimpleNamespace(get=lambda _: SimpleNamespace(state=sun["state"], last_changed=NOW))
    )
    calls = []

    def refresh() -> None:
        calls.append(1)
        scanner._window_seen = scanner._window_states(scanner._sun())

    scanner._refresh_marks = refresh
    assert scanner.refresh_marks_on_window_change() is False and calls == [1], "opened: no scan"
    assert scanner.refresh_marks_on_window_change() is False and calls == [1], "nothing moved"
    sun["state"] = "above_horizon"  # long past the grace period
    assert scanner.refresh_marks_on_window_change() is True and calls == [1, 1], "closed: scan"


def test_marked_keys_cover_the_entities_of_a_marked_device():
    from custom_components.ha_housekeeper.inventory import marked_keys

    objects = [
        {"object_type": "device", "object_id": "d1", "mark": {"kind": "expected_offline"}},
        {"object_type": "entity", "object_id": "sensor.a", "device_id": "d1"},
        {"object_type": "entity", "object_id": "sensor.b", "device_id": "d2"},
        {"object_type": "entity", "object_id": "sensor.c", "mark": {"kind": "keep"}},
    ]
    assert marked_keys(objects) == {"device:d1", "entity:sensor.a"}


def test_listed_objects_drop_the_entity_of_an_automation_and_count_its_mark_once():
    from custom_components.ha_housekeeper.inventory import listed_objects, marked_status_counts

    objects = [
        {
            "object_type": "entity",
            "object_id": "automation.a",
            "status": "active",
            "mark": {"kind": "expected_offline"},
        },
        {"object_type": "automation", "object_id": "automation.a", "status": "active"},
        {"object_type": "entity", "object_id": "sensor.a", "status": "active"},
    ]
    assert [i["object_type"] for i in listed_objects(objects)] == ["automation", "entity"]
    assert marked_status_counts(objects) == {"active": 1}


def test_a_mark_of_an_integration_covers_its_outages_only_while_it_is_down() -> None:
    objects, findings = _world()
    objects[1]["config_entry_id"] = "e1"
    marks = {"config_entry:e1": _mark("expected_offline")}
    apply_marks(objects, findings, marks, NOW)
    assert not findings[0]["ignored"], "the integration runs: a dead entity is news"
    down = {"rule_id": "config_entry.not_loaded", "object_id": "e1", "classification": "problem"}
    findings[0]["ignored"] = False
    apply_marks(objects, [*findings, {**down, "ignored": False}], marks, NOW)
    assert findings[0]["ignored_by"] == "mark"
