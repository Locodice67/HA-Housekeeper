"""Maintenance goals: met, missed or unknown from what Housekeeper already knows."""

from __future__ import annotations

import pytest

pytest.importorskip("homeassistant")

from custom_components.ha_housekeeper.goals import NEVER, evaluate, measure  # noqa: E402


def _finding(classification, ignored=False):
    return {"classification": classification, "ignored": ignored}


def _check(check_id, level="ok", **values):
    return {"id": check_id, "level": level, "values": values}


SNAPSHOT = {
    "findings": [
        *[_finding("unavailable") for _ in range(11)],
        _finding("unavailable", ignored=True),
        _finding("broken_reference"),
    ],
    "meta": {"low_batteries": 2},
}
BACKUP = {
    "available": True,
    "checks": [_check("newest", age_hours=30.0), _check("restore_test", age_days=None)],
}
RULES = [{"id": "device_area", "enabled": True, "count": 3}]


def _goals(measured, settings=None):
    return {g["id"]: g for g in evaluate(measured, settings or {})["goals"]}


def test_goals_compare_what_is_known_with_the_limits() -> None:
    measured = measure(SNAPSHOT, BACKUP, {"known": True, "per_day": 20_000_000}, RULES)
    goals = _goals(measured)
    assert goals["unavailable"]["value"] == 11 and goals["unavailable"]["state"] == "missed"
    assert goals["broken_references"]["state"] == "missed", "the default allows none"
    assert goals["backup_age"]["state"] == "met" and goals["backup_age"]["value"] == 30.0
    assert goals["recorder_growth"]["value"] == 20.0 and goals["recorder_growth"]["state"] == "met"
    assert goals["devices_without_area"]["state"] == "met"
    assert goals["weak_batteries"]["state"] == "missed"


def test_never_done_is_missed_and_a_missing_source_is_unknown() -> None:
    goals = _goals(measure(SNAPSHOT, BACKUP, {"known": False}, None))
    assert goals["restore_test_age"]["state"] == "missed" and goals["restore_test_age"]["never"]
    for goal_id in ("recorder_growth", "devices_without_area"):
        assert goals[goal_id]["state"] == "unknown"
    off = _goals(measure(SNAPSHOT, None, None, [{"id": "device_area", "enabled": False}]))
    assert off["backup_age"]["state"] == "unknown" and off["restore_test_age"]["state"] == "unknown"
    assert (
        measure(
            SNAPSHOT, {"available": True, "checks": [_check("newest", age_hours=None)]}, None, None
        )["backup_age"]
        == NEVER
    )


def test_limits_can_be_changed_and_a_goal_switched_off() -> None:
    measured = {"unavailable": 11, "broken_references": 1}
    goals = _goals(
        measured,
        {
            "unavailable": {"enabled": True, "limit": 20},
            "broken_references": {"enabled": False, "limit": None},
        },
    )
    assert goals["unavailable"]["state"] == "met" and goals["unavailable"]["limit"] == 20
    assert goals["broken_references"]["state"] == "off"
    result = evaluate(measured, {})
    assert (result["met"], result["missed"]) == (0, 2)


def test_the_four_recurring_problem_goals() -> None:
    snapshot = {
        "findings": [{"classification": "stale", "ignored": False}] * 2,
        "meta": {"recurring_devices": 0, "orphaned_statistics": 3},
    }
    goals = _goals(measure(snapshot, None, None, None, 1))
    assert goals["stale_sensors"]["value"] == 2 and goals["stale_sensors"]["state"] == "missed"
    assert goals["recurring_devices"]["state"] == "met"
    assert goals["orphaned_statistics"]["value"] == 3
    assert goals["automation_errors"]["state"] == "missed"
    assert _goals(measure(snapshot, None, None, None))["automation_errors"]["state"] == "unknown"


def test_blocked_automations_count_open_findings_only() -> None:
    snapshot = {
        "findings": [
            {"rule_id": "automation.blocked", "classification": "problem", "ignored": False},
            {"rule_id": "automation.blocked", "classification": "problem", "ignored": True},
        ],
        "meta": {},
    }
    goal = _goals(measure(snapshot, None, None, None))["blocked_automations"]
    assert goal["value"] == 1 and goal["state"] == "missed"


def test_backups_made_outside_home_assistant_leave_the_backup_age_unknown() -> None:
    external = {"available": True, "checks": [_check("external", at="2026-10-01")]}
    goal = _goals(measure(SNAPSHOT, external, None, None))["backup_age"]
    assert goal["state"] == "unknown" and goal["external"] and goal["value"] is None
