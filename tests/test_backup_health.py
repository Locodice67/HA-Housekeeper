"""Backup protection: every threshold on plain data, the collector with a fake manager, the store."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")

from homeassistant.core import HomeAssistant  # noqa: E402

from custom_components.ha_housekeeper.backup_health import (  # noqa: E402
    ATTEST_KINDS,
    AttestStore,
    collect,
    evaluate,
    executed_plan_backups,
)

NOW = datetime(2026, 10, 8, 12, 0, tzinfo=UTC)


def ago(**delta: float) -> str:
    return (NOW - timedelta(**delta)).isoformat()


def backup(hours: float = 5, size: int = 1000, agents=("hassio.local", "cloud.cloud"), **extra):
    return {
        "date": ago(hours=hours),
        "size": size,
        "agents": sorted(agents),
        "failed_agents": [],
        "protected": True,
        "automatic": True,
        "database": True,
        **extra,
    }


def config(**extra):
    base = {
        "agent_ids": ["hassio.local", "cloud.cloud"],
        "encrypted": True,
        "copies": 3,
        "days": None,
        "recurrence": "daily",
        "last_attempted": ago(hours=5),
        "last_completed": ago(hours=5),
    }
    return {**base, **extra}


def state(backups=None, **extra):
    return {
        "available": True,
        "config": config(),
        "backups": [backup()] if backups is None else backups,
        "agent_errors": [],
        "disk_free": 10_000,
        **extra,
    }


ATTEST = {"emergency_kit": ago(days=30), "restore_test": ago(days=30)}


def judge(st, attest=ATTEST, plans=()):
    report = evaluate(st, NOW, attest, list(plans))
    return report, {item["id"]: item for item in report["checks"]}


def test_a_sound_setup_is_all_ok() -> None:
    report, checks = judge(state([backup(5), backup(29), backup(53)]))
    assert report["overall"] == "ok" and report["available"] is True
    assert {item["level"] for item in report["checks"]} == {"ok"}
    assert set(checks) == {
        "setup",
        "newest",
        "last_run",
        "targets",
        "size",
        "retention",
        "encryption",
        "content",
        "remote_age",
        "space",
        "emergency_kit",
        "restore_test",
    }
    assert report["backup_count"] == 3 and len(report["backups"]) == 3


def test_the_report_lists_at_most_twenty_backups_and_marks_the_own_ones() -> None:
    many = [backup(hours) for hours in range(1, 26)] + [backup(0.5, own=True, partial=True)]
    report, _ = judge(state(many))
    assert len(report["backups"]) == 20 and report["backups"][0]["own"] is True


def test_a_missing_backup_component_is_reported_not_guessed() -> None:
    report = evaluate({"available": False}, NOW, ATTEST, [])
    assert report == {"available": False, "checks": [], "backups": [], "overall": "unknown"}


@pytest.mark.parametrize(
    ("recurrence", "hours", "level"),
    [
        ("daily", 35, "ok"),
        ("daily", 37, "problem"),
        ("custom_days", 8 * 24 - 1, "ok"),
        ("custom_days", 8 * 24 + 1, "problem"),
        ("never", 6 * 24, "ok"),
        ("never", 8 * 24, "note"),
    ],
)
def test_the_newest_backup_is_judged_by_the_schedule(recurrence, hours, level) -> None:
    _, checks = judge(
        {
            **state([backup(hours)]),
            "config": config(recurrence=recurrence, last_attempted=None, last_completed=None),
        }
    )
    assert checks["newest"]["level"] == level
    assert checks["newest"]["values"]["age_hours"] == hours


def test_no_backup_at_all_is_a_problem_with_or_without_targets() -> None:
    _, checks = judge(state([]))
    assert checks["newest"]["level"] == "problem" and checks["setup"]["level"] == "ok"
    _, checks = judge({**state([]), "config": config(agent_ids=[])})
    assert checks["setup"]["level"] == "problem"
    _, checks = judge({**state([backup()]), "config": config(agent_ids=[])})
    assert checks["setup"]["level"] == "note"  # nothing is configured, but older backups exist


def test_a_failed_attempt_or_failed_target_is_a_problem() -> None:
    _, checks = judge(
        {**state(), "config": config(last_attempted=ago(hours=2), last_completed=ago(hours=30))}
    )
    assert (
        checks["last_run"]["level"] == "problem"
        and checks["last_run"]["values"]["failed_attempt"] is True
    )
    _, checks = judge(
        {
            **state(),
            "config": config(last_attempted=ago(hours=5, minutes=-30), last_completed=ago(hours=5)),
        }
    )
    assert checks["last_run"]["level"] == "ok"  # within the grace period
    _, checks = judge(state([backup(failed_agents=["cloud.cloud"])]))
    assert checks["last_run"]["level"] == "problem" and checks["last_run"]["values"][
        "failed_agents"
    ] == ["cloud.cloud"]
    _, checks = judge({**state(), "agent_errors": ["hassio.nas"]})
    assert checks["last_run"]["values"]["failed_agents"] == ["hassio.nas"]
    _, checks = judge({**state(), "config": config(last_attempted=None, last_completed=None)})
    assert checks["last_run"]["level"] == "unknown"


def test_a_backup_only_on_the_local_target_is_a_note() -> None:
    _, checks = judge(state([backup(agents=("hassio.local",))]))
    assert checks["targets"]["level"] == "note"
    assert checks["targets"]["values"] == {"local": ["hassio.local"], "remote": [], "at": None}
    _, checks = judge(state([backup(agents=("backup.local", "hassio.nas"))]))
    assert checks["targets"]["values"]["remote"] == ["hassio.nas"]


def test_an_unusual_size_is_a_note_against_the_median_of_the_backups_before() -> None:
    sizes = [backup(5, size=1000)] + [backup(29 + 24 * i, size=1000) for i in range(6)]
    assert judge(state(sizes))[1]["size"]["level"] == "ok"
    for newest, level in ((499, "note"), (500, "ok"), (2000, "ok"), (2001, "note")):
        _, checks = judge(state([backup(5, size=newest)] + sizes[1:]))
        assert checks["size"]["level"] == level, newest
    _, checks = judge(state([backup(5, size=500)] + sizes[1:]))
    assert checks["size"]["values"]["baseline"] == 5  # only the five before the newest count
    assert judge(state([backup()]))[1]["size"]["level"] == "unknown"
    assert judge(state([backup(5, size=0), backup(29)]))[1]["size"]["level"] == "unknown"


def test_only_automatic_and_manual_backups_affect_the_report() -> None:
    app_update = backup(1, size=5, agents=("hassio.local",), automatic=False, ha_included=False)
    automatic = backup(10, size=1000)
    manual = backup(30, size=1100, automatic=False)
    other_tool = backup(20, size=1050, automatic=None)  # e.g. Google Drive Backup
    report, checks = judge(state([app_update, automatic, other_tool, manual]))
    assert report["backup_count"] == 3
    assert [item["automatic"] for item in report["backups"]] == [True, None, False]
    assert checks["newest"]["values"]["age_hours"] == 10
    assert checks["targets"]["level"] == "ok"
    assert checks["size"]["level"] == "ok"
    assert checks["retention"]["values"]["count"] == 3
    _, empty_checks = judge(state([app_update], config=config(agent_ids=[])))
    assert empty_checks["setup"]["level"] == "problem"
    assert empty_checks["newest"]["level"] == "problem"


def test_confirmed_external_storage_overrides_name_based_guess() -> None:
    local_only = state([backup(agents=("hassio.local",))])
    _, checks = judge(local_only, attest={**ATTEST, "targets": ago(days=2)})
    assert checks["targets"]["level"] == "ok"
    assert checks["targets"]["values"]["at"] == ago(days=2)
    _, checks = judge(local_only, attest=ATTEST)
    assert checks["targets"]["level"] == "note"
    _, checks = judge(state([]), attest={**ATTEST, "targets": ago(days=2)})
    assert checks["targets"]["level"] == "unknown"


def test_retention_and_age_of_the_oldest_backup() -> None:
    _, checks = judge(
        {**state([backup(5), backup(24 * 10)]), "config": config(copies=None, days=None)}
    )
    assert checks["retention"]["level"] == "note"
    assert (
        checks["retention"]["values"]["oldest_days"] == 10.0
        and checks["retention"]["values"]["count"] == 2
    )
    _, checks = judge({**state(), "config": config(copies=None, days=14)})
    assert checks["retention"]["level"] == "ok" and checks["retention"]["values"]["days"] == 14


def test_encryption_needs_the_password_and_a_protected_newest_backup() -> None:
    assert judge(state())[1]["encryption"]["level"] == "ok"
    _, checks = judge({**state(), "config": config(encrypted=False)})
    assert checks["encryption"]["level"] == "note"
    _, checks = judge(state([backup(protected=False)]))
    assert (
        checks["encryption"]["level"] == "note"
        and checks["encryption"]["values"]["newest_protected"] is False
    )
    _, checks = judge(
        {**state(), "config": config(encrypted=False)}, attest={**ATTEST, "encryption": ago(days=2)}
    )
    assert checks["encryption"]["level"] == "ok" and checks["encryption"]["values"]["at"]


def test_what_only_the_person_knows_is_a_note_until_confirmed() -> None:
    _, checks = judge(state(), attest={})
    assert checks["emergency_kit"]["level"] == "note" and checks["restore_test"]["level"] == "note"
    _, checks = judge(
        state(), attest={"emergency_kit": ago(days=900), "restore_test": ago(days=181)}
    )
    assert checks["emergency_kit"]["level"] == "ok"  # a kit does not age
    assert (
        checks["restore_test"]["level"] == "note"
        and checks["restore_test"]["values"]["age_days"] == 181
    )
    _, checks = judge(state(), attest={"restore_test": ago(days=180)})
    assert checks["restore_test"]["level"] == "ok"


def test_backups_before_risky_plans_are_matched_by_time() -> None:
    created = backup(hours=3)  # started three hours ago
    recorded_at = ago(hours=2, minutes=30)  # the plan recorded its backup half an hour later
    plans = [{"id": "p1", "at": recorded_at}, {"id": "p2", "at": ago(days=9)}]
    _, checks = judge(state([created]), plans=plans)
    assert checks["plan_backups"]["values"] == {"checked": 2, "missing": 1}
    assert checks["plan_backups"]["level"] == "note"
    _, checks = judge(state([created]), plans=plans[:1])
    assert checks["plan_backups"]["level"] == "ok"
    _, checks = judge(state([created]), plans=[])
    assert "plan_backups" not in checks
    _, checks = judge(state([created]), plans=[{"id": "x", "at": "garbage"}])
    assert "plan_backups" not in checks
    many = [{"id": str(i), "at": ago(days=60 + i)} for i in range(9)]
    assert judge(state([created]), plans=many)[1]["plan_backups"]["values"]["checked"] == 5


def test_many_or_large_housekeeper_backups_are_a_hint_to_clean_up() -> None:
    few = [backup(i + 1, own=True) for i in range(9)]
    assert "own_backups" not in judge(state(few))[1]
    assert judge(state(few + [backup(30, own=True)]))[1]["own_backups"]["values"]["count"] == 10
    big = [backup(1, size=6 * 1024**3, own=True), backup(2)]
    check = judge(state(big))[1]["own_backups"]
    assert check["level"] == "note" and check["values"] == {"count": 1, "size": 6 * 1024**3}


def test_only_executed_plans_with_a_recorded_backup_count() -> None:
    plans = [
        {"plan_id": "a", "executed": True, "backup": {"at": "2026-10-08T10:00:00+00:00"}},
        {"plan_id": "b", "executed": False, "backup": {"at": "2026-10-08T09:00:00+00:00"}},
        {"plan_id": "c", "executed": True},
        {"plan_id": "d", "executed": True, "backup": None},
    ]
    assert executed_plan_backups(plans) == [{"id": "a", "at": "2026-10-08T10:00:00+00:00"}]


def test_an_unreadable_listing_makes_the_dependent_checks_unknown() -> None:
    report, checks = judge({**state(), "backups": None})
    assert checks["newest"]["level"] == "unknown" and "targets" not in checks
    assert checks["setup"]["level"] == "ok" and report["backups"] == []
    report, checks = judge({**state(), "config": None})
    assert checks["setup"]["level"] == "unknown" and checks["retention"]["level"] == "unknown"
    assert checks["encryption"]["level"] == "unknown" and checks["last_run"]["level"] == "unknown"


def test_the_overall_level_is_the_worst_one_and_counts_add_up() -> None:
    report, _ = judge(state([backup(70)]))
    assert report["overall"] == "problem" and sum(report["counts"].values()) == len(
        report["checks"]
    )
    report, _ = judge(state(), attest={})
    assert report["overall"] == "note"


def fake_manager(*, backups, errors=None, cfg=None, raises=False):
    status = lambda size, protected: SimpleNamespace(size=size, protected=protected)  # noqa: E731
    items = {
        f"b{i}": SimpleNamespace(
            date=item["date"],
            agents={agent: status(item["size"], item["protected"]) for agent in item["agents"]},
            failed_agent_ids=item["failed_agents"],
            with_automatic_settings=item["automatic"],
        )
        for i, item in enumerate(backups)
    }
    data = SimpleNamespace(
        create_backup=SimpleNamespace(agent_ids=["hassio.local"], password="secret"),
        retention=SimpleNamespace(copies=3, days=None),
        schedule=SimpleNamespace(recurrence=SimpleNamespace(value="daily")),
        last_attempted_automatic_backup=NOW - timedelta(hours=5),
        last_completed_automatic_backup=NOW - timedelta(hours=5),
    )
    manager = SimpleNamespace(config=SimpleNamespace(data=cfg or data))
    manager.async_get_backups = AsyncMock(
        side_effect=RuntimeError("boom") if raises else None, return_value=(items, errors or {})
    )
    return manager


async def test_the_collector_reads_the_manager_without_leaking_names_or_secrets(
    hass: HomeAssistant,
) -> None:
    manager = fake_manager(
        backups=[backup(5), backup(29, agents=("hassio.local",))],
        errors={"hassio.nas": RuntimeError("x")},
    )
    with patch("homeassistant.components.backup.async_get_manager", return_value=manager):
        collected = await collect(hass)
    assert collected["available"] is True and len(collected["backups"]) == 2
    assert collected["config"]["encrypted"] is True and "secret" not in repr(collected)
    assert collected["config"]["copies"] == 3 and collected["config"]["recurrence"] == "daily"
    assert collected["agent_errors"] == ["hassio.nas"]
    assert set(collected["backups"][0]) == {
        "date",
        "size",
        "agents",
        "failed_agents",
        "protected",
        "automatic",
        "ha_included",
        "own",
        "partial",
        "id",
        "name",
        "version",
        "database",
        "apps",
        "folders",
        "failed_apps",
        "failed_folders",
        "agent_sizes",
    }
    report = evaluate(collected, NOW, ATTEST, [])
    assert report["available"] is True and report["checks"][0]["id"] == "setup"


async def test_the_collector_survives_a_missing_component_and_a_failing_manager(
    hass: HomeAssistant,
) -> None:
    with patch("homeassistant.components.backup.async_get_manager", side_effect=KeyError("backup")):
        assert await collect(hass) == {"available": False}
    manager = fake_manager(backups=[backup()], raises=True)
    with patch("homeassistant.components.backup.async_get_manager", return_value=manager):
        collected = await collect(hass)
    assert collected["backups"] is None and collected["config"] is not None
    manager = fake_manager(backups=[])
    manager.config = SimpleNamespace(
        data=None
    )  # a field that is missing in some Home Assistant versions
    with patch("homeassistant.components.backup.async_get_manager", return_value=manager):
        collected = await collect(hass)
    assert collected["config"] is None and collected["backups"] == []


async def test_the_attestations_survive_a_restart_and_reject_unknown_kinds(
    hass: HomeAssistant, hass_storage
) -> None:
    store = AttestStore(hass)
    await store.async_load()
    assert store.record == {
        "targets": None,
        "emergency_kit": None,
        "restore_test": None,
        "encryption": None,
    }
    store.set("emergency_kit")
    store.set("restore_test", date(2026, 9, 1))
    store.set("targets", date(2026, 9, 2))
    assert store.record["restore_test"] == "2026-09-01T00:00:00+00:00"
    with pytest.raises(ValueError):
        store.set("backup_ok")
    with pytest.raises(ValueError):
        store.clear("nonsense")
    await hass.async_block_till_done()
    await store._store.async_save(dict(store.record))
    again = AttestStore(hass)
    await again.async_load()
    assert again.record == store.record
    again.clear("emergency_kit")
    assert again.record["emergency_kit"] is None and again.record["restore_test"] is not None
    hass_storage["ha_housekeeper.attest"] = {
        "version": 1,
        "data": {"emergency_kit": "garbage", "restore_test": 5},
    }
    broken = AttestStore(hass)
    await broken.async_load()
    assert broken.record == dict.fromkeys(ATTEST_KINDS)


def test_the_content_of_the_newest_backup_is_judged() -> None:
    assert judge(state())[1]["content"]["level"] == "ok"
    failed = judge(state([backup(failed_apps=["Cloudflared"])]))[1]["content"]
    assert failed["level"] == "problem" and failed["values"]["failed"] == ["Cloudflared"]
    assert judge(state([backup(database=False)]))[1]["content"]["level"] == "note"
    assert judge(state([backup(database=None)]))[1]["content"]["level"] == "unknown"


def test_the_newest_copy_on_each_external_target_must_not_be_old() -> None:
    both = [backup(5, agents=("hassio.local",)), backup(29, agents=("hassio.local", "cloud.cloud"))]
    check = judge(state(both))[1]["remote_age"]
    assert check["level"] == "ok" and check["values"]["agents"][0]["agent"] == "cloud.cloud"
    old = [
        backup(5, agents=("hassio.local",)),
        backup(24 * 9, agents=("hassio.local", "cloud.cloud")),
    ]
    stale = judge(state(old))[1]["remote_age"]
    assert stale["level"] == "note" and stale["values"]["stale"] == ["cloud.cloud"]
    assert "remote_age" not in judge(state([backup(agents=("hassio.local",))]))[1]


def test_the_next_backup_must_fit_on_the_local_target() -> None:
    newest = [backup(5, size=1000)]
    assert judge(state(newest, disk_free=2000))[1]["space"]["level"] == "ok"
    assert judge(state(newest, disk_free=1200))[1]["space"]["level"] == "note"
    assert judge(state(newest, disk_free=900))[1]["space"]["level"] == "problem"
    assert judge(state(newest, disk_free=None))[1]["space"]["level"] == "unknown"
    assert "space" not in judge(state([backup(5, agents=("cloud.cloud",))]))[1]


def test_housekeeper_backups_never_count_as_the_backup_strategy() -> None:
    own = backup(1, own=True, database=True, agents=("backup.local",))
    report, checks = judge({**state([own]), "config": config(agent_ids=[])})
    assert checks["setup"]["level"] == "problem" and checks["newest"]["level"] == "problem"
    assert report["backup_count"] == 0 and report["backups"][0]["own"] is True
    _, checks = judge(state([own, backup(10)]))
    assert checks["newest"]["values"]["age_hours"] == 10
