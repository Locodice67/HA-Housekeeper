"""Device exchange proposals, the day-long follow-up, the end state simulation and the audit report."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

pytest.importorskip("homeassistant")

from custom_components.ha_housekeeper import followup  # noqa: E402
from custom_components.ha_housekeeper.audit_report import build_report  # noqa: E402
from custom_components.ha_housekeeper.device_pairs import pair_devices  # noqa: E402
from custom_components.ha_housekeeper.simulation import simulate  # noqa: E402

NOW = datetime(2026, 10, 9, 12, tzinfo=UTC)


def _entity(object_id, device, **extra):
    return {
        "object_type": "entity",
        "object_id": object_id,
        "name": extra.pop("name", object_id),
        "device_id": device,
        "status": "active",
        **extra,
    }


def test_pairs_rank_by_class_unit_and_name_and_choose_nothing() -> None:
    snapshot = {
        "objects": [
            {"object_type": "device", "object_id": "old", "name": "Plug A"},
            {"object_type": "device", "object_id": "new", "name": "Plug B"},
            _entity("sensor.a_power", "old", name="Plug A Power", device_class="power", unit="W"),
            _entity("sensor.a_total", "old", has_statistics=True, state_class="total_increasing"),
            _entity("switch.a", "old"),
            _entity("sensor.b_power", "new", name="Plug B Power", device_class="power", unit="W"),
            _entity("sensor.b_other", "new", device_class="voltage", unit="V"),
            _entity("sensor.b_off", "new", status="disabled"),
        ],
        "edges": [
            {"source": "automation:x", "target": "entity:sensor.a_power", "relation": "TRIGGERS_ON"}
        ],
    }
    result = pair_devices(snapshot, "old", "new")
    pairs = {p["object_id"]: p for p in result["pairs"]}
    power = pairs["sensor.a_power"]
    assert [c["object_id"] for c in power["candidates"]] == ["sensor.b_power", "sensor.b_other"]
    assert {"same_class", "same_unit", "similar_name"} <= set(power["candidates"][0]["reasons"])
    assert power["used"] == 1 and pairs["sensor.a_total"]["meter"]
    assert pairs["switch.a"]["candidates"] == []
    assert result["pairs"][0]["object_id"] == "sensor.a_power", "used entities come first"
    assert "selected" not in power
    assert pair_devices(snapshot, "old", "old") is None


def _finding(key, kind="unavailable"):
    return {"key": key, "object_id": key, "classification": kind, "ignored": False}


def test_followup_ends_clean_or_with_a_regression() -> None:
    plan = {"executed": True}
    before = {"findings": [_finding("a")], "recurring_devices": []}
    followup.start(plan, before, NOW)
    other = {"executed": True, "plan_id": "p"}
    followup.start(other, before, NOW)
    quiet = {"findings": [_finding("a")], "recurring_devices": []}
    assert not followup.check([plan], quiet, NOW + timedelta(hours=1))
    assert plan["followup"]["state"] == "watching"
    assert followup.check([plan], quiet, NOW + timedelta(hours=25))
    assert plan["followup"]["state"] == "clean" and "baseline" not in plan["followup"]
    worse = {
        "findings": [_finding("a"), _finding("b", "broken_reference")],
        "recurring_devices": [{"device_id": "d"}],
    }
    assert followup.check([other], worse, NOW + timedelta(hours=2))
    assert other["followup"]["state"] == "regression" and other["followup"]["new_count"] == 2
    assert followup.regressions([other], NOW + timedelta(days=1))[0]["new_count"] == 2
    assert followup.regressions([other], NOW + timedelta(days=9)) == []
    undone = {"executed": True}
    followup.start(undone, before, NOW)
    followup.stop(undone)
    assert undone["followup"]["state"] == "stopped"
    assert followup.public(plan["followup"]) == plan["followup"]


def _plan():
    uses = [
        {"source": "automation:x", "confidence": "certain"},
        {"source": "dashboard:y", "confidence": "probable"},
    ]
    actions = [
        {
            "kind": "replace_references",
            "object_id": "sensor.old",
            "object_type": "entity",
            "target": "sensor.new",
            "verdict": "review",
            "executable": True,
            "reasons": [],
            "sources": [
                {
                    "source": "automation:x",
                    "name": "Light",
                    "type": "automation",
                    "writable": True,
                    "changes": [1],
                    "change_count": 2,
                },
                {"source": "dashboard:y", "name": "Home", "type": "dashboard", "writable": False},
            ],
            "result": {"state": "done"},
        },
        {
            "kind": "remove_device",
            "object_id": "dev1",
            "object_type": "device",
            "verdict": "review",
            "executable": True,
            "reasons": [],
            "entities": ["sensor.a", "sensor.b"],
            "has_statistics": True,
            "used_by": uses,
        },
        {
            "kind": "remove_entity",
            "object_id": "sensor.z",
            "executable": False,
            "verdict": "blocked",
        },
    ]
    return {
        "plan_id": "abc",
        "created_at": NOW.isoformat(),
        "scanned_at": NOW.isoformat(),
        "status": "verified",
        "actions": actions,
        "simulation": simulate(actions),
        "confirmed": {"at": NOW.isoformat(), "user_id": "u-secret"},
        "run": {"started_at": NOW.isoformat(), "finished_at": NOW.isoformat()},
        "backup": {"at": NOW.isoformat(), "job_id": "job-secret"},
        "verification": {
            "ok": True,
            "checks": [{"check": "removed", "object_id": "dev1", "ok": True}],
        },
        "events": [{"at": NOW.isoformat(), "type": "created"}],
    }


def test_simulation_counts_only_what_can_run() -> None:
    sim = _plan()["simulation"]
    assert (sim["removed"], sim["removed_devices"], sim["blocked"]) == (2, 1, 1)
    assert sim["replaced"] == 2 and sim["replaced_by_source"][0]["name"] == "Light"
    assert (sim["remaining_certain"], sim["remaining_uncertain"]) == (1, 2)
    assert sim["statistics_orphaned"] == ["dev1"]


def test_report_hides_ids_and_users_unless_asked() -> None:
    plan = _plan()
    hidden = build_report(plan, lang="de")
    for secret in ("sensor.old", "sensor.new", "u-secret", "job-secret", "dev1", "Light"):
        assert secret not in hidden
    assert "entity_1" in hidden and "user_1" in hidden and "device_1" in hidden
    shown = build_report(plan, anonymize=False)
    assert "sensor.old" in shown and "u-secret" in shown and "dashboard:y" in shown


def test_followup_only_counts_findings_about_what_the_plan_touched() -> None:
    plan = {"executed": True, "actions": [{"object_id": "sensor.old", "target": "sensor.new"}]}
    followup.start(plan, {"findings": [], "recurring_devices": []}, NOW)
    other = {
        "key": "x",
        "object_id": "sensor.other",
        "classification": "unavailable",
        "ignored": False,
    }
    assert not followup.check([plan], {"findings": [other], "recurring_devices": []}, NOW)
    mine = {**other, "key": "y", "object_id": "automation.a", "affected_object": "sensor.old"}
    assert followup.check([plan], {"findings": [other, mine], "recurring_devices": []}, NOW)
    assert plan["followup"]["new_count"] == 1


def test_recorder_rows_are_named_in_the_end_state_and_the_report() -> None:
    from custom_components.ha_housekeeper.cleanup import attach_history

    plan = _plan()
    plan["actions"].append(
        {
            "kind": "purge_statistics",
            "object_id": "sensor.gone",
            "executable": True,
            "verdict": "review",
            "states": True,
        }
    )
    assert plan["simulation"]["rows_counted"] is False
    rows = {
        "sensor.a": {"states": 10, "statistics": 5},
        "sensor.b": {"states": 1, "statistics": 0},
        "sensor.gone": {"states": 100, "statistics": 20},
    }
    attach_history(plan, rows)
    sim = plan["simulation"]
    assert sim["rows_counted"] and sim["purge_rows"] == 120 and sim["history_rows_kept"] == 16
    assert (sim["history_states_kept"], sim["history_stats_kept"]) == (11, 5)
    assert "120" in build_report(plan, lang="en") and "16" in build_report(plan, lang="en")
    attach_history(plan, {"sensor.a": rows["sensor.a"]})  # ids without a count stay uncounted
    assert plan["simulation"]["history_rows_kept"] == 16


def test_followup_counts_error_runs_of_an_automation_the_plan_changed() -> None:
    errors = {"automation.a1": 1}  # one error run already happened today

    def errors_since(key: str, day: str) -> int:
        return errors[key]

    snapshot = {
        "objects": [
            {"object_type": "automation", "object_id": "automation.hall", "automation_id": "a1"}
        ],
        "findings": [],
        "recurring_devices": [],
    }
    plan = {
        "executed": True,
        "actions": [
            {
                "kind": "refactor_automation",
                "object_id": "automation.hall",
                "result": {"state": "done"},
            }
        ],
    }
    followup.start(plan, snapshot, NOW, errors_since)
    assert not followup.check([plan], snapshot, NOW + timedelta(hours=1), errors_since)
    errors["automation.a1"] = 2
    assert followup.check([plan], snapshot, NOW + timedelta(hours=2), errors_since)
    assert plan["followup"]["state"] == "regression"
    assert plan["followup"]["new"][0]["classification"] == "run_error"


def test_simulation_counts_actions_without_other_effects():
    sim = simulate(
        [
            {"kind": "reload_integration", "object_id": "e1", "executable": True},
            {"kind": "set_entity_state", "object_id": "a.b", "target": "hide", "executable": True},
        ]
    )
    assert (sim["reloaded"], sim["hidden"], sim["removed"]) == (1, 1, 0)
