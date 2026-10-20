"""Tests for scan checkpoints and comparison; they need Home Assistant only for the Store."""

from __future__ import annotations

import pytest

pytest.importorskip("homeassistant")

from custom_components.ha_housekeeper.history import (  # noqa: E402
    ScanHistory,
    diff_checkpoints,
    make_checkpoint,
)


def _snapshot(at: str, objects: list[tuple[str, str, str]], findings: list[dict] | None = None):
    return {
        "meta": {"scanned_at": at},
        "objects": [
            {"object_type": t, "object_id": oid, "name": oid.upper(), "status": status}
            for t, oid, status in objects
        ],
        "edges": [],
        "findings": findings or [],
    }


FINDING = {"rule_id": "entity.state_missing", "object_id": "sensor.b", "classification": "orphaned"}


def test_diff_reports_new_removed_changed_and_findings() -> None:
    old = _snapshot(
        "2026-10-06T10:00:00+00:00",
        [
            ("entity", "sensor.a", "active"),
            ("entity", "sensor.b", "active"),
            ("device", "d1", "active"),
        ],
        [FINDING],
    )
    new = _snapshot(
        "2026-10-07T10:00:00+00:00",
        [
            ("entity", "sensor.a", "unavailable"),
            ("entity", "sensor.c", "active"),
            ("device", "d1", "active"),
        ],
        [
            {
                "rule_id": "entity.state_unavailable",
                "object_id": "sensor.a",
                "classification": "unavailable",
            }
        ],
    )

    diff = diff_checkpoints(make_checkpoint(old), new)

    assert [o["object_id"] for o in diff["new_objects"]["items"]] == ["sensor.c"]
    assert [o["object_id"] for o in diff["removed_objects"]["items"]] == ["sensor.b"]
    change = diff["status_changes"]["items"][0]
    assert (change["object_id"], change["from"], change["to"], change["name"]) == (
        "sensor.a",
        "active",
        "unavailable",
        "SENSOR.A",
    )
    assert [f["rule_id"] for f in diff["new_findings"]["items"]] == ["entity.state_unavailable"]
    # sensor.b is gone with its finding: that is no repair
    assert diff["resolved_findings"]["total"] == 0
    assert diff["ended_findings"]["items"] == [
        {
            "rule_id": "entity.state_missing",
            "object_id": "sensor.b",
            "affected_object": None,
            "reason": "object_removed",
        }
    ]


def test_a_finding_counts_as_resolved_only_while_its_object_is_still_there() -> None:
    kept = {"rule_id": "entity.stale", "object_id": "sensor.a", "classification": "stale"}
    other = {"rule_id": "mystery.rule", "object_id": "x", "classification": "problem"}
    objects = [("entity", "sensor.a", "active")]
    old = _snapshot("2026-10-06T10:00:00+00:00", objects, [kept, other])
    diff = diff_checkpoints(make_checkpoint(old), _snapshot("2026-10-07T10:00:00+00:00", objects))
    assert [f["object_id"] for f in diff["resolved_findings"]["items"]] == ["sensor.a"]
    assert [(f["object_id"], f["reason"]) for f in diff["ended_findings"]["items"]] == [
        ("x", "unknown")
    ]


def test_a_finding_that_vanished_unread_or_under_a_changed_setting_is_not_resolved() -> None:
    dash = {
        "rule_id": "dashboard.missing_entity",
        "object_id": "home",
        "classification": "broken_reference",
    }
    unavailable = {
        "rule_id": "entity.state_unavailable",
        "object_id": "sensor.a",
        "classification": "unavailable",
    }
    objects = [("entity", "sensor.a", "active"), ("dashboard", "home", "active")]
    old_snap = _snapshot("2026-10-06T10:00:00+00:00", objects, [dash, unavailable])
    old_snap["meta"]["outage_high_hours"] = 24
    old = make_checkpoint(old_snap)
    new = _snapshot("2026-10-07T10:00:00+00:00", objects)
    new["meta"] |= {"outage_high_hours": 72, "unchecked": ["dashboard:home"]}
    diff = diff_checkpoints(old, new)
    assert diff["resolved_findings"]["total"] == 0
    assert {f["object_id"]: f["reason"] for f in diff["ended_findings"]["items"]} == {
        "home": "unchecked",
        "sensor.a": "rules_changed",
    }
    # without those causes the same disappearance is a repair, and an old checkpoint has no settings to compare
    new["meta"] |= {"outage_high_hours": 24, "unchecked": []}
    assert diff_checkpoints(old, new)["resolved_findings"]["total"] == 2
    del old["rules"]
    new["meta"]["outage_high_hours"] = 216
    assert diff_checkpoints(old, new)["resolved_findings"]["total"] == 2


def test_objects_of_an_unread_source_neither_appear_nor_vanish_between_two_scans() -> None:
    objects = [("entity", "sensor.a", "active")]
    dash = [("dashboard", "home", "active")]
    full = make_checkpoint(_snapshot("2026-10-06T10:00:00+00:00", objects + dash))
    blind = _snapshot("2026-10-07T10:00:00+00:00", objects)
    blind["meta"]["unchecked"] = ["dashboard:home"]
    gone = diff_checkpoints(full, blind)
    assert gone["removed_objects"]["total"] == 0 and gone["unread_objects"]["total"] == 1
    # the other way round: a baseline that could not read it does not make it "new" now
    blind_base = make_checkpoint(blind)
    back = diff_checkpoints(blind_base, _snapshot("2026-10-08T10:00:00+00:00", objects + dash))
    assert back["new_objects"]["total"] == 0 and back["unread_objects"]["total"] == 1
    # read in both scans, a removal is still a removal
    real = diff_checkpoints(full, _snapshot("2026-10-09T10:00:00+00:00", objects))
    assert real["removed_objects"]["total"] == 1 and real["unread_objects"]["total"] == 0


def test_identical_scans_have_no_differences() -> None:
    snap = _snapshot("2026-10-07T10:00:00+00:00", [("entity", "sensor.a", "active")], [FINDING])
    diff = diff_checkpoints(make_checkpoint(snap), snap)
    assert all(
        diff[key]["total"] == 0
        for key in (
            "new_objects",
            "removed_objects",
            "status_changes",
            "new_findings",
            "resolved_findings",
        )
    )


def test_history_keeps_previous_and_one_checkpoint_per_day(hass) -> None:
    history = ScanHistory(hass)
    day1 = _snapshot("2026-10-05T08:00:00+00:00", [("entity", "x.a", "active")])
    day1b = _snapshot("2026-10-05T20:00:00+00:00", [("entity", "x.a", "active")])
    day2 = _snapshot("2026-10-06T08:00:00+00:00", [("entity", "x.a", "unavailable")])

    assert history.compare(day1, "previous")["available"] is False
    history.record(day1)
    history.record(day1b)
    history.record(day2)

    options = history.baselines()
    assert options[0]["id"] == "previous" and options[0]["at"] == day1b["meta"]["scanned_at"]
    assert options[0]["findings"] == 0 and options[0]["objects"] == 1
    # the day's last scan is already the previous one, so it is listed once
    assert len(options) == 1

    result = history.compare(day2, "previous")
    assert result["available"] and result["status_changes"]["total"] == 1
    assert history.compare(day2, "unknown")["available"] is False


def test_history_drops_checkpoints_older_than_the_retention(hass) -> None:
    history = ScanHistory(hass)
    history.retention_days = 3
    for day in range(1, 8):
        history.record(_snapshot(f"2026-10-0{day}T08:00:00+00:00", [("entity", "x.a", "active")]))

    ats = [o["at"][:10] for o in history.baselines()]
    assert ats[0] == "2026-10-06"
    assert min(ats) >= "2026-10-04"
    result = history.compare(_snapshot("2026-10-07T09:00:00+00:00", []), "previous")
    assert result["retention_days"] == 3 and result["current"] == {"objects": 0, "findings": 0}


def test_series_lists_the_days_and_the_latest_scan_with_unavailable(hass) -> None:
    history = ScanHistory(hass)
    assert history.series()["points"] == []
    history.record(_snapshot("2026-10-05T08:00:00+00:00", [("entity", "x.a", "active")]))
    history.record(
        _snapshot(
            "2026-10-06T08:00:00+00:00",
            [("entity", "x.a", "unavailable"), ("entity", "x.b", "active")],
        )
    )
    history.record(_snapshot("2026-10-06T20:00:00+00:00", [("entity", "x.a", "unavailable")]))

    points = history.series()["points"]
    assert [(p["at"][:10], p["objects"], p["unavailable"]) for p in points] == [
        ("2026-10-05", 1, 0),
        ("2026-10-06", 1, 1),
    ]


def test_series_carries_open_findings_classes_and_the_state_of_the_house_for_the_sparklines(
    hass,
) -> None:
    def snap(at: str, findings: list[dict]) -> dict:
        base = _snapshot(at, [("entity", "x.a", "active"), ("entity", "x.b", "active")])
        base["findings"] = findings
        return base

    def finding(rule: str, object_id: str, classification: str, ignored: bool = False) -> dict:
        return {
            "rule_id": rule,
            "object_id": object_id,
            "classification": classification,
            "ignored": ignored,
            "impact": "medium",
        }

    history = ScanHistory(hass)
    history.record(snap("2026-10-05T08:00:00+00:00", []))
    history.record(
        snap(
            "2026-10-06T08:00:00+00:00",
            [
                finding("entity.unused", "x.a", "unused"),
                finding("entity.broken", "x.a", "broken_reference"),
                finding("entity.unused", "x.b", "unused", ignored=True),
            ],
        )
    )
    points = history.series()["points"]
    assert [(p["open"], p["health"]) for p in points] == [(0, 100.0), (2, 50.0)], (
        "an object counts once, with its weight: medium takes off one"
    )
    assert points[0]["classes"] == {} and points[1]["classes"] == {
        "unused": 1,
        "broken_reference": 1,
    }


def test_the_lead_series_leaves_out_the_follow_ups_of_a_cause(hass) -> None:
    history = ScanHistory(hass)
    snapshot = _snapshot("2026-10-06T08:00:00+00:00", [("entity", "x.a", "active")])

    def finding(rule: str, **extra) -> dict:
        return {
            "rule_id": rule,
            "object_id": rule,
            "classification": "unused",
            "impact": "medium",
            **extra,
        }

    snapshot["findings"] = [
        finding("entity.unused"),
        finding("entity.broken", cause_id="c1"),
        finding("device.down", cause_id="c1"),
    ]
    history.record(snapshot)
    point = history.series()["points"][0]
    assert (point["open"], point["lead"], point["lead_classes"]) == (3, 2, {"unused": 2})
    # The tiles count every open finding by its reason; what starts a chain is an outage whatever its class.
    assert point["reasons"] == {"unused": 2, "outage": 1}


def test_the_state_of_the_house_counts_the_followers_of_a_cause_as_objects(hass) -> None:
    history = ScanHistory(hass)
    snapshot = _snapshot(
        "2026-10-06T08:00:00+00:00",
        [("entity", "x.a", "active"), ("entity", "x.b", "active"), ("entity", "x.c", "active")],
    )
    finding = lambda object_id, **extra: {  # noqa: E731
        "rule_id": "entity.unavailable",
        "object_id": object_id,
        "classification": "unavailable",
        "impact": "low",
        **extra,
    }
    snapshot["findings"] = [
        finding("x.a"),
        finding("x.b", cause_id="c1"),
        finding("x.c", cause_id="c1"),
    ]
    history.record(snapshot)
    point = history.series()["points"][0]
    assert point["health"] == 50.0, "three objects, each taking off a half: the followers count too"


def test_an_automation_is_rated_once_not_also_as_its_registry_entity(hass) -> None:
    history = ScanHistory(hass)
    snapshot = _snapshot(
        "2026-10-06T08:00:00+00:00",
        [
            ("automation", "automation.a", "active"),
            ("entity", "automation.a", "active"),
            ("entity", "x.b", "active"),
        ],
    )
    history.record(snapshot)
    assert history.series()["points"][0]["rated"] == 2


def test_a_pinned_scan_point_is_named_compared_kept_beyond_the_retention_and_deleted(hass) -> None:
    from custom_components.ha_housekeeper.history import PIN_LIMIT, PinError

    history = ScanHistory(hass)
    history.retention_days = 2
    early = _snapshot("2026-10-01T08:00:00+00:00", [("entity", "x.a", "active")])
    history.record(early)
    history.pin(early, "  Before the rebuild ")
    with pytest.raises(PinError):
        history.pin(early, "again")
    with pytest.raises(PinError):
        history.pin(
            {**early, "meta": {"scanned_at": "2026-10-02T08:00:00+00:00", "preliminary": True}}, ""
        )
    for day in range(2, 8):
        history.record(_snapshot(f"2026-10-0{day}T08:00:00+00:00", [("entity", "x.a", "active")]))

    pinned = [o for o in history.baselines() if o.get("pinned")]
    assert [(o["id"], o["name"]) for o in pinned] == [
        ("pin:2026-10-01T08:00:00+00:00", "Before the rebuild")
    ]
    now = _snapshot("2026-10-08T09:00:00+00:00", [("entity", "x.a", "unavailable")])
    assert history.compare(now, pinned[0]["id"])["status_changes"]["total"] == 1
    history.unpin(pinned[0]["id"])
    with pytest.raises(PinError):
        history.unpin(pinned[0]["id"])
    assert history.compare(now, pinned[0]["id"])["available"] is False
    for day in range(PIN_LIMIT):
        history.pin(_snapshot(f"2026-11-{day + 1:02d}T08:00:00+00:00", []), str(day))
    with pytest.raises(PinError):
        history.pin(_snapshot("2026-12-01T08:00:00+00:00", []), "one too many")


def test_the_day_of_a_scan_is_counted_in_the_local_time_zone(hass) -> None:
    from zoneinfo import ZoneInfo

    from homeassistant.util import dt as dt_util

    previous = dt_util.DEFAULT_TIME_ZONE
    dt_util.set_default_time_zone(ZoneInfo("Europe/Berlin"))
    try:
        history = ScanHistory(hass)
        # 00:15 and 21:54 local on 10 October are 22:15 UTC on the 9th and 19:54 UTC on the 10th
        for at in (
            "2026-10-09T22:15:00+00:00",
            "2026-10-10T19:54:00+00:00",
            "2026-10-11T08:00:00+00:00",
        ):
            history.record(_snapshot(at, [("entity", "x.a", "active")]))
        history.record(_snapshot("2026-10-11T20:00:00+00:00", [("entity", "x.a", "active")]))
        # both scans belong to the 10th, so only the later one is kept for that day
        assert [cp["at"] for cp in history._daily] == ["2026-10-10T19:54:00+00:00"]
    finally:
        dt_util.set_default_time_zone(previous)


def test_a_checkpoint_from_before_the_levels_by_duration_ends_findings_as_a_new_rating() -> None:
    dash = {
        "rule_id": "entity.state_unavailable",
        "object_id": "sensor.a",
        "classification": "unavailable",
    }
    objects = [("entity", "sensor.a", "active")]
    old_snap = _snapshot("2026-10-06T10:00:00+00:00", objects, [dash])
    old = make_checkpoint(old_snap)
    old["rules"] = {"min_unavailable_days": 7}  # what a checkpoint of the old version holds
    new = _snapshot("2026-10-07T10:00:00+00:00", objects)
    new["meta"] |= {"outage_info_minutes": 15, "outage_high_hours": 168}
    diff = diff_checkpoints(old, new)
    assert diff["new_rating"] is True and diff["resolved_findings"]["total"] == 0
    assert [f["reason"] for f in diff["ended_findings"]["items"]] == ["rules_changed"]
    again = make_checkpoint(new)
    assert diff_checkpoints(again, new)["new_rating"] is False
