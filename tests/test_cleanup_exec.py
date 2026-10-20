"""Executing cleanup plans (step A: quarantine by disabling) against a real registry."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")

from homeassistant.core import HomeAssistant  # noqa: E402
from homeassistant.helpers import entity_registry as er  # noqa: E402
from scanner_entry import attach_scanner  # noqa: E402

from custom_components.ha_housekeeper.cleanup import build_plan, registry_fingerprint  # noqa: E402
from custom_components.ha_housekeeper.cleanup_exec import (  # noqa: E402
    CleanupError,
    entity_restorable,
)
from custom_components.ha_housekeeper.const import DOMAIN  # noqa: E402
from custom_components.ha_housekeeper.inventory import InventoryScanner  # noqa: E402


async def make_scanner(hass: HomeAssistant) -> InventoryScanner:
    hass.data.setdefault(DOMAIN, {})
    scanner = InventoryScanner(hass)
    await scanner.async_initialize()
    scanner.protection.mode = "full"  # a new install starts read-only; these tests run plans
    attach_scanner(hass, scanner)
    return scanner


def orphan(hass: HomeAssistant, name: str):
    return er.async_get(hass).async_get_or_create(
        domain="sensor", platform="test", unique_id=name, suggested_object_id=name
    )


async def make_plan(
    scanner: InventoryScanner,
    hass: HomeAssistant,
    *entity_ids: str,
    kind="disable_entity",
    recorder=None,
):
    snapshot = await scanner.async_scan()
    if recorder:
        snapshot["meta"]["recorder_available"] = True
    registry = er.async_get(hass)

    def fingerprint(object_id: str):
        entry = registry.async_get(object_id)
        return registry_fingerprint(entry) if entry else None

    plan = build_plan(
        snapshot,
        [
            {"kind": kind, "object_id": e, **({"recorder": recorder} if recorder else {})}
            for e in entity_ids
        ],
        datetime.now(UTC),
        fingerprint,
        lambda object_id: entity_restorable(hass, registry.async_get(object_id)),
    )
    scanner.journal.add(plan)
    return plan


async def run(scanner: InventoryScanner, plan: dict, acknowledged=()):
    confirmation = scanner.cleanup.confirm(plan["plan_id"], list(acknowledged), "user-1")
    scanner.cleanup.start(plan["plan_id"], confirmation["token"], "user-1")
    await scanner.cleanup._task
    return confirmation


async def test_quarantine_runs_is_verified_and_can_be_undone(hass: HomeAssistant) -> None:
    entry = orphan(hass, "old_sensor")
    scanner = await make_scanner(hass)
    plan = await make_plan(scanner, hass, entry.entity_id)
    assert plan["actions"][0]["verdict"] == "ok" and plan["actions"][0]["executable"] is True

    await run(scanner, plan)

    registry = er.async_get(hass)
    assert registry.async_get(entry.entity_id).disabled_by is er.RegistryEntryDisabler.USER
    assert plan["status"] == "verified" and plan["executed"] is True
    assert plan["verification"]["ok"] is True
    assert [e["type"] for e in plan["events"]] == [
        "created",
        "confirmed",
        "started",
        "disabled",
        "verified",
    ]
    assert scanner.paused is False

    assert [q["object_id"] for q in scanner.snapshot["quarantine"]] == [entry.entity_id]
    assert (
        scanner.snapshot["meta"]["quarantined"] == 1
        and scanner.snapshot["meta"]["quarantine_days"] == 14
    )

    result = await scanner.cleanup.undo(plan["plan_id"], None)
    assert scanner.snapshot["quarantine"] == []  # the undo refreshed the inventory
    assert result["results"] == [{"object_id": entry.entity_id, "outcome": "undone"}]
    assert registry.async_get(entry.entity_id).disabled_by is None
    assert plan["status"] == "undone"


async def test_blocked_and_removal_plans_cannot_be_confirmed(hass: HomeAssistant) -> None:
    working = orphan(hass, "working")
    hass.states.async_set(working.entity_id, "on")
    gone = orphan(hass, "gone")
    scanner = await make_scanner(hass)
    blocked = await make_plan(scanner, hass, working.entity_id)
    assert blocked["actions"][0]["verdict"] == "blocked"
    with pytest.raises(CleanupError, match="nothing_to_do"):
        scanner.cleanup.confirm(blocked["plan_id"], [], None)
    preview = await make_plan(scanner, hass, gone.entity_id, kind="remove_entity")
    with pytest.raises(CleanupError, match="nothing_to_do"):  # removal is preview only
        scanner.cleanup.confirm(preview["plan_id"], [], None)
    assert er.async_get(hass).async_get(gone.entity_id) is not None


async def test_changes_after_the_preview_abort_the_run(hass: HomeAssistant) -> None:
    first, second = orphan(hass, "first"), orphan(hass, "second")
    scanner = await make_scanner(hass)
    plan = await make_plan(scanner, hass, first.entity_id, second.entity_id)
    er.async_get(hass).async_update_entity(second.entity_id, name="Renamed by the user")

    await run(scanner, plan)

    registry = er.async_get(hass)
    assert registry.async_get(first.entity_id).disabled_by is er.RegistryEntryDisabler.USER
    assert registry.async_get(second.entity_id).disabled_by is None  # untouched
    assert plan["status"] == "partial"
    assert plan["actions"][1]["result"] == {
        "state": "not_run",
        "at": plan["actions"][1]["result"]["at"],
        "reason": "entity_changed",
    }


async def test_nothing_runs_when_the_first_check_fails(hass: HomeAssistant) -> None:
    entry = orphan(hass, "moved")
    scanner = await make_scanner(hass)
    plan = await make_plan(scanner, hass, entry.entity_id)
    er.async_get(hass).async_update_entity(entry.entity_id, name="Changed")
    await run(scanner, plan)
    assert plan["status"] == "aborted" and plan["executed"] is False
    assert er.async_get(hass).async_get(entry.entity_id).disabled_by is None


async def test_review_actions_need_an_individual_acknowledgement(hass: HomeAssistant) -> None:
    from unittest.mock import AsyncMock, patch

    entry = orphan(hass, "with_stats")
    scanner = await make_scanner(hass)
    statistics = [{"statistic_id": entry.entity_id, "source": "recorder"}]
    with patch.object(InventoryScanner, "_statistics", AsyncMock(return_value=statistics)):
        plan = await make_plan(scanner, hass, entry.entity_id)
        assert plan["actions"][0]["verdict"] == "review"
        with pytest.raises(CleanupError, match="nothing_to_do"):
            scanner.cleanup.confirm(plan["plan_id"], [], None)
        await run(scanner, plan, acknowledged=[entry.entity_id])
    assert (
        er.async_get(hass).async_get(entry.entity_id).disabled_by is er.RegistryEntryDisabler.USER
    )


async def test_a_token_only_works_for_the_administrator_who_confirmed(
    hass: HomeAssistant,
) -> None:
    entry = orphan(hass, "owner")
    scanner = await make_scanner(hass)
    plan = await make_plan(scanner, hass, entry.entity_id)
    confirmation = scanner.cleanup.confirm(plan["plan_id"], [], "admin-a")
    with pytest.raises(CleanupError, match="wrong_user"):
        scanner.cleanup.start(plan["plan_id"], confirmation["token"], "admin-b")
    scanner.cleanup.start(plan["plan_id"], confirmation["token"], "admin-a")
    await scanner.cleanup._task
    assert scanner.journal.get(plan["plan_id"])["run"]["user_id"] == "admin-a"


async def test_unredeemed_tokens_are_dropped_once_they_expire(hass: HomeAssistant) -> None:
    from datetime import timedelta

    first, second = orphan(hass, "stale"), orphan(hass, "fresh")
    scanner = await make_scanner(hass)
    old = await make_plan(scanner, hass, first.entity_id)
    token = scanner.cleanup.confirm(old["plan_id"], [], None)["token"]
    saved = scanner.cleanup._tokens[old["plan_id"]]
    scanner.cleanup._tokens[old["plan_id"]] = (saved[0], saved[1] - timedelta(hours=1), *saved[2:])
    other = await make_plan(scanner, hass, second.entity_id)
    scanner.cleanup.confirm(other["plan_id"], [], None)
    assert list(scanner.cleanup._tokens) == [other["plan_id"]]
    with pytest.raises(CleanupError, match="bad_token"):
        scanner.cleanup.start(old["plan_id"], token, None)


async def test_tokens_are_single_use_and_plans_run_once(hass: HomeAssistant) -> None:
    entry = orphan(hass, "once")
    scanner = await make_scanner(hass)
    plan = await make_plan(scanner, hass, entry.entity_id)
    with pytest.raises(CleanupError, match="bad_token"):
        scanner.cleanup.start(plan["plan_id"], "guess", None)
    confirmation = scanner.cleanup.confirm(plan["plan_id"], [], None)
    with pytest.raises(CleanupError, match="bad_token"):
        scanner.cleanup.start(plan["plan_id"], "wrong", None)
    # a wrong guess consumed the token; confirming again is required
    confirmation = scanner.cleanup.confirm(plan["plan_id"], [], None)
    scanner.cleanup.start(plan["plan_id"], confirmation["token"], None)
    with pytest.raises(CleanupError, match="busy"):
        scanner.cleanup.start(plan["plan_id"], confirmation["token"], None)
    await scanner.cleanup._task
    with pytest.raises(CleanupError):
        scanner.cleanup.confirm(plan["plan_id"], [], None)  # already executed
    assert scanner.journal.remove(plan["plan_id"]) is False  # the audit trail stays


async def test_undo_refuses_to_overwrite_newer_user_changes(hass: HomeAssistant) -> None:
    entry = orphan(hass, "edited")
    scanner = await make_scanner(hass)
    plan = await make_plan(scanner, hass, entry.entity_id)
    await run(scanner, plan)
    registry = er.async_get(hass)
    registry.async_update_entity(entry.entity_id, name="Edited later")

    result = await scanner.cleanup.undo(plan["plan_id"], None)

    assert result["results"] == [{"object_id": entry.entity_id, "outcome": "conflict_changed"}]
    assert registry.async_get(entry.entity_id).disabled_by is er.RegistryEntryDisabler.USER
    registry.async_remove(entry.entity_id)
    result = await scanner.cleanup.undo(plan["plan_id"], None)
    assert result["results"][0]["outcome"] == "conflict_gone"


async def test_old_plans_must_be_recreated(hass: HomeAssistant) -> None:
    entry = orphan(hass, "stale")
    scanner = await make_scanner(hass)
    plan = await make_plan(scanner, hass, entry.entity_id)
    plan["created_at"] = "2020-01-01T00:00:00+00:00"
    with pytest.raises(CleanupError, match="plan_too_old"):
        scanner.cleanup.confirm(plan["plan_id"], [], None)


async def test_websocket_flow_requires_confirmation_and_reports_status(
    hass: HomeAssistant, hass_ws_client
) -> None:
    from homeassistant.setup import async_setup_component

    from custom_components.ha_housekeeper import async_setup

    entry = orphan(hass, "via_ws")
    assert await async_setup(hass, {})
    scanner = await make_scanner(hass)
    assert await async_setup_component(hass, "websocket_api", {})
    client = await hass_ws_client(hass)
    await scanner.async_scan()

    await client.send_json_auto_id(
        {
            "type": "ha_housekeeper/plan_create",
            "actions": [{"kind": "disable_entity", "object_id": entry.entity_id}],
        }
    )
    plan = (await client.receive_json())["result"]
    await client.send_json_auto_id(
        {"type": "ha_housekeeper/plan_execute", "plan_id": plan["plan_id"], "token": "x"}
    )
    assert (await client.receive_json())["error"]["code"] == "bad_token"

    await client.send_json_auto_id(
        {"type": "ha_housekeeper/plan_confirm", "plan_id": plan["plan_id"]}
    )
    confirmation = (await client.receive_json())["result"]
    assert confirmation["execute"] == [entry.entity_id]
    await client.send_json_auto_id(
        {
            "type": "ha_housekeeper/plan_execute",
            "plan_id": plan["plan_id"],
            "token": confirmation["token"],
        }
    )
    assert (await client.receive_json())["result"] == {"started": True}
    await scanner.cleanup._task

    await client.send_json_auto_id(
        {"type": "ha_housekeeper/plan_status", "plan_id": plan["plan_id"]}
    )
    status = (await client.receive_json())["result"]
    assert status["plan"]["status"] == "verified" and status["progress"]["running"] is False
    await client.send_json_auto_id({"type": "ha_housekeeper/plan_undo", "plan_id": plan["plan_id"]})
    assert (await client.receive_json())["result"]["status"] == "undone"


# ---- step B: removal after quarantine, with a verified backup ------------------------------


def fake_backup(agent_ids=("backup.local",), error=None, full_ok=False):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    create = (
        AsyncMock(side_effect=error)
        if error
        else AsyncMock(return_value=SimpleNamespace(backup_job_id="job-1"))
    )
    manager = SimpleNamespace(
        config=SimpleNamespace(
            data=SimpleNamespace(
                create_backup=SimpleNamespace(agent_ids=list(agent_ids), password=None)
            )
        ),
        async_create_backup=create,
        async_create_automatic_backup=(
            AsyncMock(side_effect=error)
            if error and not full_ok
            else AsyncMock(return_value=SimpleNamespace(backup_job_id="job-full"))
        ),
    )
    return manager, create


async def quarantined_entity(
    hass: HomeAssistant, scanner: InventoryScanner, name: str, days: int = 20
):
    """An entity that Housekeeper disabled ``days`` days ago."""
    entry = orphan(hass, name)
    er.async_get(hass).async_update_entity(entry.entity_id, name="Kitchen Old", icon="mdi:lamp")
    plan = await make_plan(scanner, hass, entry.entity_id)
    await run(scanner, plan)
    result = plan["actions"][0]["result"]
    result["at"] = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    await scanner.async_scan()
    return entry, plan


async def run_removal(scanner, hass, entity_id, manager, acknowledged=()):
    from unittest.mock import patch

    with patch("homeassistant.components.backup.async_get_manager", return_value=manager):
        plan = await make_plan(scanner, hass, entity_id, kind="remove_entity")
        await run(scanner, plan, acknowledged)
    return plan


async def test_a_refused_small_backup_stops_and_a_full_one_runs_only_when_asked_for(
    hass: HomeAssistant,
) -> None:
    from unittest.mock import AsyncMock, patch

    scanner = await make_scanner(hass)
    entry, _ = await quarantined_entity(hass, scanner, "fallback")
    manager, _ = fake_backup(error=RuntimeError("not on this installation"))

    plan = await run_removal(scanner, hass, entry.entity_id, manager)
    assert plan["status"] == "aborted"
    assert plan["actions"][0]["result"]["reason"] == "backup_small_failed"
    manager.async_create_automatic_backup.assert_not_called()  # no full backup on its own

    manager.async_create_backup = AsyncMock(return_value=type("B", (), {"backup_job_id": "j"})())
    with patch("homeassistant.components.backup.async_get_manager", return_value=manager):
        again = await make_plan(scanner, hass, entry.entity_id, kind="remove_entity")
        again["full_backup"] = True  # what the panel asks for with "Repeat with a full backup"
        await run(scanner, again)
    assert again["status"] == "verified" and again["backup"]["scope"] == "full"
    kwargs = manager.async_create_backup.call_args.kwargs
    assert kwargs["include_database"] is True and kwargs["include_homeassistant"] is True


async def test_removal_waits_for_a_backup_removes_and_can_be_restored(hass: HomeAssistant) -> None:
    scanner = await make_scanner(hass)
    entry, _ = await quarantined_entity(hass, scanner, "retired")
    manager, create = fake_backup()

    plan = await run_removal(scanner, hass, entry.entity_id, manager)

    registry = er.async_get(hass)
    create.assert_awaited_once()
    asked = create.await_args.kwargs
    assert asked["include_homeassistant"] and not asked["include_database"]
    assert not asked["include_all_addons"] and asked["include_folders"] is None
    assert plan["backup"]["scope"] == "config"
    assert registry.async_get(entry.entity_id) is None
    assert plan["status"] == "verified" and plan["backup"]["job_id"] == "job-1"
    assert plan["backup"]["name"] == f"Housekeeper {plan['plan_id'][:8]}"
    types = [e["type"] for e in plan["events"]]
    assert types.index("backup_started") < types.index("backup_done") < types.index("removed")
    assert {"check": "removed", "object_id": entry.entity_id, "ok": True} in plan["verification"][
        "checks"
    ]
    assert scanner.snapshot["quarantine"] == []  # gone from the registry, so no longer quarantined

    result = await scanner.cleanup.undo(plan["plan_id"], None)
    assert result["results"] == [{"object_id": entry.entity_id, "outcome": "undone"}]
    restored = registry.async_get(entry.entity_id)
    assert restored is not None and restored.name == "Kitchen Old" and restored.icon == "mdi:lamp"
    assert restored.disabled_by is er.RegistryEntryDisabler.USER  # back in quarantine, not active
    assert plan["status"] == "undone"
    assert [q["object_id"] for q in scanner.snapshot["quarantine"]] == [entry.entity_id]


async def test_a_removal_can_delete_the_recorder_data_and_says_it_cannot_be_undone(
    hass: HomeAssistant,
) -> None:
    from unittest.mock import AsyncMock, patch

    scanner = await make_scanner(hass)
    entry, _ = await quarantined_entity(hass, scanner, "retired")
    manager, create = fake_backup()
    delete = AsyncMock(return_value=([entry.entity_id], [], None))

    with (
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
        patch("custom_components.ha_housekeeper.cleanup_exec.delete_statistics", delete),
    ):
        plan = await make_plan(
            scanner, hass, entry.entity_id, kind="remove_entity", recorder="states"
        )
        action = plan["actions"][0]
        assert action["verdict"] == "review" and {"irreversible", "with_states"} <= set(
            action["reasons"]
        )
        await run(scanner, plan, [entry.entity_id])

    asked = create.await_args.kwargs
    assert asked["include_homeassistant"] and asked["include_database"]
    assert plan["backup"]["scope"] == "database"
    delete.assert_awaited_once()
    assert delete.await_args.args[1] == [entry.entity_id] and delete.await_args.kwargs == {
        "states": True
    }
    assert er.async_get(hass).async_get(entry.entity_id) is None
    result = plan["actions"][0]["result"]
    assert result["purge"] == {"state": "done", "states": True} and result["irreversible"] is True
    assert "statistics_purged" in [e["type"] for e in plan["events"]]


async def test_removal_needs_a_finished_quarantine(hass: HomeAssistant) -> None:
    scanner = await make_scanner(hass)
    young, _ = await quarantined_entity(hass, scanner, "young", days=3)
    never = orphan(hass, "never_quarantined")
    snapshot = await scanner.async_scan()

    plan = build_plan(
        snapshot,
        [
            {"kind": "remove_entity", "object_id": young.entity_id},
            {"kind": "remove_entity", "object_id": never.entity_id},
        ],
        datetime.now(UTC),
    )
    young_action, never_action = plan["actions"]
    assert (
        young_action["verdict"] == "blocked" and "quarantine_too_short" in young_action["reasons"]
    )
    assert young_action["quarantine_days_left"] == 11
    assert never_action["verdict"] == "blocked" and "not_quarantined" in never_action["reasons"]


@pytest.mark.parametrize(
    ("manager_kwargs", "reason"),
    [
        ({"error": RuntimeError("disk full")}, "backup_small_failed"),
    ],
)
async def test_no_backup_means_no_removal(hass: HomeAssistant, manager_kwargs, reason) -> None:
    scanner = await make_scanner(hass)
    entry, _ = await quarantined_entity(hass, scanner, "protected")
    manager, _ = fake_backup(**manager_kwargs)

    plan = await run_removal(scanner, hass, entry.entity_id, manager)

    assert er.async_get(hass).async_get(entry.entity_id) is not None
    assert plan["status"] == "aborted" and plan["executed"] is False
    assert plan["actions"][0]["result"]["reason"] == reason


async def test_without_a_backup_agent_the_backup_goes_to_local_storage(hass: HomeAssistant) -> None:
    scanner = await make_scanner(hass)
    entry, _ = await quarantined_entity(hass, scanner, "protected")
    manager, create = fake_backup(agent_ids=())

    plan = await run_removal(scanner, hass, entry.entity_id, manager)

    assert create.await_args.kwargs["agent_ids"] == ["backup.local"]
    assert create.await_args.kwargs["password"] is None
    assert plan["status"] != "aborted"


async def test_a_missing_backup_component_blocks_removal(hass: HomeAssistant) -> None:
    from unittest.mock import patch

    from homeassistant.exceptions import HomeAssistantError

    scanner = await make_scanner(hass)
    entry, _ = await quarantined_entity(hass, scanner, "nobackup")
    plan = await make_plan(scanner, hass, entry.entity_id, kind="remove_entity")
    with patch(
        "homeassistant.components.backup.async_get_manager", side_effect=HomeAssistantError("x")
    ):
        await run(scanner, plan)
    assert plan["actions"][0]["result"]["reason"] == "backup_unavailable"
    assert er.async_get(hass).async_get(entry.entity_id) is not None


async def test_reenabling_after_the_preview_stops_the_removal(hass: HomeAssistant) -> None:
    from unittest.mock import patch

    scanner = await make_scanner(hass)
    entry, _ = await quarantined_entity(hass, scanner, "changed_mind")
    manager, _ = fake_backup()
    with patch("homeassistant.components.backup.async_get_manager", return_value=manager):
        plan = await make_plan(scanner, hass, entry.entity_id, kind="remove_entity")
        er.async_get(hass).async_update_entity(entry.entity_id, disabled_by=None)
        await run(scanner, plan)
    assert plan["status"] == "aborted"
    assert plan["actions"][0]["result"]["reason"] == "entity_changed"
    assert er.async_get(hass).async_get(entry.entity_id) is not None


async def test_restore_reports_conflicts_instead_of_overwriting(hass: HomeAssistant) -> None:
    scanner = await make_scanner(hass)
    entry, _ = await quarantined_entity(hass, scanner, "contested")
    manager, _ = fake_backup()
    plan = await run_removal(scanner, hass, entry.entity_id, manager)
    registry = er.async_get(hass)

    taken = registry.async_get_or_create(
        "sensor", "other", "other-unique", suggested_object_id="contested"
    )
    assert taken.entity_id == entry.entity_id  # somebody reused the freed ID
    result = await scanner.cleanup.undo(plan["plan_id"], None)
    assert result["results"][0]["outcome"] == "conflict_taken"
    assert registry.async_get(entry.entity_id).platform == "other"  # untouched

    registry.async_remove(entry.entity_id)
    plan["actions"][0]["result"]["restore"]["config_entry_id"] = "vanished"
    result = await scanner.cleanup.undo(plan["plan_id"], None)
    assert result["results"][0]["outcome"] == "conflict_unrestorable"
    assert registry.async_get(entry.entity_id) is None


async def test_removal_over_the_websocket_reports_backup_progress(
    hass: HomeAssistant, hass_ws_client
) -> None:
    from unittest.mock import patch

    from homeassistant.setup import async_setup_component

    from custom_components.ha_housekeeper import async_setup

    assert await async_setup(hass, {})
    scanner = await make_scanner(hass)
    assert await async_setup_component(hass, "websocket_api", {})
    client = await hass_ws_client(hass)
    entry, _ = await quarantined_entity(hass, scanner, "ws_removal")
    manager, _ = fake_backup()

    await client.send_json_auto_id(
        {
            "type": "ha_housekeeper/plan_create",
            "actions": [{"kind": "remove_entity", "object_id": entry.entity_id}],
        }
    )
    plan = (await client.receive_json())["result"]
    assert plan["actions"][0]["verdict"] == "ok" and plan["actions"][0]["restorable"] is True
    await client.send_json_auto_id(
        {"type": "ha_housekeeper/plan_confirm", "plan_id": plan["plan_id"]}
    )
    confirmation = (await client.receive_json())["result"]
    assert confirmation["removals"] == [entry.entity_id]
    with patch("homeassistant.components.backup.async_get_manager", return_value=manager):
        await client.send_json_auto_id(
            {
                "type": "ha_housekeeper/plan_execute",
                "plan_id": plan["plan_id"],
                "token": confirmation["token"],
            }
        )
        assert (await client.receive_json())["result"] == {"started": True}
        await scanner.cleanup._task
    assert er.async_get(hass).async_get(entry.entity_id) is None


async def test_the_protection_mode_limits_confirming_starting_and_undoing(
    hass: HomeAssistant,
) -> None:
    from custom_components.ha_housekeeper.cleanup_exec import CleanupError

    entry = orphan(hass, "old_sensor")
    scanner = await make_scanner(hass)
    plan = await make_plan(scanner, hass, entry.entity_id)

    scanner.protection.mode = "read_only"
    with pytest.raises(CleanupError, match="protection_mode"):
        scanner.cleanup.confirm(plan["plan_id"], [], "user-1")

    scanner.protection.mode = "quarantine"  # disabling is the one thing allowed
    confirmation = scanner.cleanup.confirm(plan["plan_id"], [], "user-1")
    scanner.protection.mode = "read_only"  # lowered after confirming: the start refuses
    with pytest.raises(CleanupError, match="protection_mode"):
        scanner.cleanup.start(plan["plan_id"], confirmation["token"], "user-1")

    scanner.protection.mode = "quarantine"
    plan = await make_plan(scanner, hass, entry.entity_id)
    await run(scanner, plan)
    assert plan["actions"][0]["result"]["state"] == "done"
    scanner.protection.mode = "read_only"
    with pytest.raises(CleanupError, match="protection_mode"):
        await scanner.cleanup.undo(plan["plan_id"], None)
    scanner.protection.mode = "quarantine"
    assert (await scanner.cleanup.undo(plan["plan_id"], None))["results"][0]["outcome"] == "undone"


async def test_adding_a_label_runs_is_verified_and_the_undo_keeps_other_labels(
    hass: HomeAssistant,
) -> None:
    from homeassistant.helpers import label_registry as lr

    registry = er.async_get(hass)
    entry = orphan(hass, "tagged")
    old = lr.async_get(hass).async_create("Old").label_id
    new = lr.async_get(hass).async_create("Review").label_id
    registry.async_update_entity(entry.entity_id, labels={old})
    scanner = await make_scanner(hass)
    snapshot = await scanner.async_scan()
    current = registry.async_get(entry.entity_id)
    info = {
        (entry.entity_id, new): {
            "exists": True,
            "label": "Review",
            "has": False,
            "fingerprint": registry_fingerprint(current),
        },
        (entry.entity_id, old): {"exists": True, "label": "Old", "has": True, "fingerprint": None},
        (entry.entity_id, "gone"): {"exists": True, "label": None, "has": False},
    }
    verdicts = [
        build_plan(
            snapshot,
            [{"kind": "add_label", "object_id": entry.entity_id, "target": label}],
            datetime.now(UTC),
            label_data=info,
        )["actions"][0]
        for label in (old, "gone")
    ]
    assert [(a["verdict"], a["reasons"]) for a in verdicts] == [
        ("blocked", ["already_labelled"]),
        ("blocked", ["label_missing"]),
    ]
    plan = build_plan(
        snapshot,
        [{"kind": "add_label", "object_id": entry.entity_id, "target": new}],
        datetime.now(UTC),
        label_data=info,
    )
    scanner.journal.add(plan)
    assert plan["actions"][0]["verdict"] == "ok" and plan["actions"][0]["executable"] is True

    await run(scanner, plan)
    assert registry.async_get(entry.entity_id).labels == {old, new}
    assert plan["status"] == "verified" and plan["verification"]["ok"] is True

    result = await scanner.cleanup.undo(plan["plan_id"], None)
    assert result["results"] == [{"object_id": entry.entity_id, "outcome": "undone"}]
    assert registry.async_get(entry.entity_id).labels == {old}


async def test_switching_entities_disables_and_hides_them_and_the_undo_restores_both(
    hass: HomeAssistant,
) -> None:
    registry = er.async_get(hass)
    off, hidden, plain = (orphan(hass, n) for n in ("off", "hidden", "plain"))
    scanner = await make_scanner(hass)
    snapshot = await scanner.async_scan()
    info = {
        e.entity_id: {
            "exists": True,
            "disabled_by": "",
            "hidden_by": "",
            "fingerprint": registry_fingerprint(registry.async_get(e.entity_id)),
        }
        for e in (off, hidden, plain)
    }
    requests = [
        {"kind": "set_entity_state", "object_id": off.entity_id, "target": "disable"},
        {"kind": "set_entity_state", "object_id": hidden.entity_id, "target": "hide"},
        {"kind": "set_entity_state", "object_id": plain.entity_id, "target": "enable"},
    ]
    plan = build_plan(snapshot, requests, datetime.now(UTC), state_data=info)
    scanner.journal.add(plan)
    assert [a["verdict"] for a in plan["actions"]] == ["ok", "ok", "blocked"]  # enable: nothing off

    await run(scanner, plan)
    assert registry.async_get(off.entity_id).disabled_by is er.RegistryEntryDisabler.USER
    assert registry.async_get(hidden.entity_id).hidden_by is er.RegistryEntryHider.USER
    assert plan["status"] == "verified" and plan["verification"]["ok"] is True

    result = await scanner.cleanup.undo(plan["plan_id"], None)
    assert {r["outcome"] for r in result["results"]} == {"undone"}
    assert registry.async_get(off.entity_id).disabled_by is None
    assert registry.async_get(hidden.entity_id).hidden_by is None


async def test_trimming_the_history_of_one_entity_is_judged_run_verified_and_not_undone(
    hass: HomeAssistant, hass_ws_client
) -> None:
    from unittest.mock import patch

    from homeassistant.setup import async_setup_component

    from custom_components.ha_housekeeper import async_setup

    assert await async_setup(hass, {})
    scanner = await make_scanner(hass)
    assert await async_setup_component(hass, "websocket_api", {})
    client = await hass_ws_client(hass)
    await scanner.async_scan()
    scanner.snapshot["meta"]["recorder_available"] = True
    manager, _ = fake_backup()
    trimmed: list[tuple[str, int]] = []

    async def counted(hass_, ids, days):
        return {i: {"rows": 0 if trimmed else 5000, "oldest": 1.0} for i in ids}

    async def trim(hass_, entity_id, days):
        trimmed.append((entity_id, days))
        return 0, None

    web = "custom_components.ha_housekeeper.websocket_api"
    module = "custom_components.ha_housekeeper.cleanup_exec"
    with (
        patch(f"{web}.count_older", counted),
        patch(f"{module}.count_older", counted),
        patch(f"{module}.trim_states", trim),
        patch(f"{module}.recorder_ready", lambda hass_: True),
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
    ):
        await client.send_json_auto_id(
            {
                "type": "ha_housekeeper/plan_create",
                "actions": [
                    {"kind": "trim_history", "object_id": "sensor.hue", "keep_days": 14},
                    {"kind": "trim_history", "object_id": "sensor.bad", "keep_days": 0},
                ],
            }
        )
        refused = await client.receive_json()
        assert not refused["success"]  # 0 days is refused by the schema
        await client.send_json_auto_id(
            {
                "type": "ha_housekeeper/plan_create",
                "actions": [{"kind": "trim_history", "object_id": "sensor.hue", "keep_days": 14}],
            }
        )
        plan = (await client.receive_json())["result"]
        action = plan["actions"][0]
        assert action["verdict"] == "review" and action["trim"]["rows"] == 5000
        assert plan["simulation"]["trimmed"] == 1 and plan["simulation"]["purge_rows"] == 5000
        await client.send_json_auto_id(
            {
                "type": "ha_housekeeper/plan_confirm",
                "plan_id": plan["plan_id"],
                "acknowledged": ["sensor.hue"],
            }
        )
        confirmation = (await client.receive_json())["result"]
        await client.send_json_auto_id(
            {
                "type": "ha_housekeeper/plan_execute",
                "plan_id": plan["plan_id"],
                "token": confirmation["token"],
            }
        )
        assert (await client.receive_json())["result"] == {"started": True}
        await scanner.cleanup._task
    stored = scanner.journal.get(plan["plan_id"])
    assert trimmed == [("sensor.hue", 14)]
    assert stored["actions"][0]["result"]["state"] == "done"
    assert stored["actions"][0]["result"]["irreversible"] is True
    assert "history_trimmed" in {c["check"] for c in stored["verification"]["checks"]}
    undone = await scanner.cleanup.undo(plan["plan_id"], None)
    assert undone["results"][0]["outcome"] == "irreversible"


def test_judging_a_trim_names_what_blocks_it() -> None:
    from custom_components.ha_housekeeper.cleanup import judge_trim_action

    ok = judge_trim_action("sensor.a", 30, {}, {"rows": 3, "oldest": 1.0}, True)
    assert ok["verdict"] == "review" and ok["reasons"] == ["irreversible"]
    for days, found, recorder, reason in (
        (30, {"rows": 0, "oldest": None}, True, "nothing_to_trim"),
        (30, None, True, "not_counted"),
        (0, {"rows": 3, "oldest": 1.0}, True, "bad_keep_days"),
        (30, {"rows": 3, "oldest": 1.0}, False, "no_recorder"),
    ):
        judged = judge_trim_action("sensor.a", days, {}, found, recorder)
        assert judged["verdict"] == "blocked" and reason in judged["reasons"]


def test_judging_a_trim_of_statistics_or_a_stretch() -> None:
    from custom_components.ha_housekeeper.cleanup import judge_trim_action, trim_is_plain

    found = {"rows": 3, "oldest": 1.0}
    long_term = judge_trim_action("sensor.a", 30, {}, found, True, tables=["states", "long_term"])
    assert long_term["verdict"] == "review" and "trim_statistics" in long_term["reasons"]
    stretch = judge_trim_action("sensor.a", 0, {}, found, True, rng={"from": 1.0, "to": 5.0})
    assert stretch["verdict"] == "review" and not trim_is_plain(stretch)
    for tables, rng, reason in (
        (["long_term"], {"from": 1.0, "to": 5.0}, "range_states_only"),
        (None, {"from": 5.0, "to": 1.0}, "bad_range"),
        (["other"], None, "bad_tables"),
    ):
        judged = judge_trim_action("sensor.a", 30, {}, found, True, tables=tables, rng=rng)
        assert judged["verdict"] == "blocked" and reason in judged["reasons"]


async def test_assigning_an_area_suggests_from_the_device_runs_and_undoes(
    hass: HomeAssistant,
) -> None:
    from homeassistant.helpers import area_registry as ar
    from homeassistant.helpers import device_registry as dr
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    from custom_components.ha_housekeeper import area_assign

    config = MockConfigEntry(domain="test")
    config.add_to_hass(hass)
    kitchen = ar.async_get(hass).async_create("Kitchen").id
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=config.entry_id, identifiers={("test", "d1")}
    )
    registry = er.async_get(hass)
    placed = registry.async_get_or_create(
        "sensor",
        "test",
        "a",
        device_id=device.id,
        config_entry=config,
        suggested_object_id="a",
        original_name="A",
    )
    bare = registry.async_get_or_create(
        "sensor",
        "test",
        "b",
        device_id=device.id,
        config_entry=config,
        suggested_object_id="b",
        original_name="B",
    )
    registry.async_update_entity(placed.entity_id, area_id=kitchen)
    lone = orphan(hass, "lonely")

    assert area_assign.suggest(hass, bare.entity_id) == kitchen
    assert area_assign.suggest(hass, lone.entity_id) is None

    scanner = await make_scanner(hass)
    snapshot = await scanner.async_scan()
    data = {i: area_assign.prepare(hass, i, "") for i in (bare.entity_id, lone.entity_id)}
    plan = build_plan(
        snapshot,
        [{"kind": "set_area", "object_id": i} for i in data],
        datetime.now(UTC),
        area_data=data,
    )
    assert [(a["verdict"], a["reasons"]) for a in plan["actions"]] == [
        ("ok", []),
        ("blocked", ["no_suggestion"]),
    ]
    assert plan["actions"][0]["target"] == kitchen and plan["actions"][0]["suggested"] is True
    scanner.journal.add(plan)

    await run(scanner, plan)
    assert registry.async_get(bare.entity_id).area_id == kitchen
    assert plan["status"] == "verified" and plan["verification"]["ok"] is True

    result = await scanner.cleanup.undo(plan["plan_id"], None)
    assert result["results"] == [{"object_id": bare.entity_id, "outcome": "undone"}]
    assert registry.async_get(bare.entity_id).area_id is None

    # A device works the same way, and an area that is set is never replaced.
    info = area_assign.prepare(hass, device.id, kitchen)
    action = build_plan(
        snapshot,
        [{"kind": "set_area", "object_id": device.id, "target": kitchen}],
        datetime.now(UTC),
        area_data={device.id: info},
    )["actions"][0]
    assert action["object_type"] == "device" and action["verdict"] == "ok"
    dr.async_get(hass).async_update_device(device.id, area_id=kitchen)
    again = area_assign.prepare(hass, device.id, kitchen)
    blocked = build_plan(
        snapshot,
        [{"kind": "set_area", "object_id": device.id, "target": kitchen}],
        datetime.now(UTC),
        area_data={device.id: again},
    )["actions"][0]
    assert blocked["reasons"] == ["has_area"]


async def test_a_new_install_starts_read_only_and_one_with_scan_data_keeps_full(
    hass: HomeAssistant,
) -> None:
    from homeassistant.helpers.storage import Store

    from custom_components.ha_housekeeper.const import STORAGE_KEY, STORAGE_VERSION

    fresh = InventoryScanner(hass)
    await fresh.protection.async_load()
    assert fresh.protection.mode == "read_only"

    await fresh.protection._store.async_remove()  # forget the saved mode, then an old scan exists
    await Store(hass, STORAGE_VERSION, STORAGE_KEY).async_save({"items": {}})
    old = InventoryScanner(hass)
    await old.protection.async_load()
    assert old.protection.mode == "full"


async def test_a_damaged_database_stops_a_plan_before_anything_is_deleted(
    hass: HomeAssistant,
) -> None:
    from unittest.mock import AsyncMock, MagicMock, patch

    scanner = await make_scanner(hass)
    plan = {"status": "running", "events": [], "actions": [{"object_id": "sensor.a"}]}
    instance = MagicMock(async_add_executor_job=AsyncMock(return_value="row 7 missing from index"))
    with (
        patch("custom_components.ha_housekeeper.cleanup_exec.recorder_ready", return_value=True),
        patch("homeassistant.components.recorder.get_instance", return_value=instance),
    ):
        assert await scanner.cleanup._database_intact(plan) is False
    assert plan["status"] == "aborted"
    assert plan["actions"][0]["result"]["reason"] == "database_corrupt"


async def test_a_nearly_full_disk_stops_a_plan_that_writes_into_the_recorder(
    hass: HomeAssistant,
) -> None:
    from unittest.mock import patch

    scanner = await make_scanner(hass)
    plan = {"status": "running", "events": [], "actions": [{"object_id": "sensor.a"}]}
    with (
        patch("custom_components.ha_housekeeper.cleanup_exec.recorder_ready", return_value=True),
        patch(
            "custom_components.ha_housekeeper.cleanup_exec.database_files",
            return_value={"disk_free": 100 * 1024**2},
        ),
    ):
        assert await scanner.cleanup._disk_has_room(plan) is False
    assert plan["status"] == "aborted"
    assert plan["actions"][0]["result"]["reason"] == "disk_low"


async def test_the_backup_needs_room_for_about_half_of_the_database(hass: HomeAssistant) -> None:
    from unittest.mock import patch

    scanner = await make_scanner(hass)

    def files(free: int):
        return {"disk_free": free * 1024**2, "db_bytes": 6 * 1024**3}

    for free, fits in ((2000, False), (3500, True)):
        plan = {"status": "running", "events": [], "actions": [{"object_id": "sensor.a"}]}
        with (
            patch(
                "custom_components.ha_housekeeper.cleanup_exec.recorder_ready", return_value=True
            ),
            patch(
                "custom_components.ha_housekeeper.cleanup_exec.database_files",
                return_value=files(free),
            ),
        ):
            assert await scanner.cleanup._disk_has_room(plan) is fits
        assert (plan["status"] == "running") is fits


async def test_a_plan_does_not_start_while_home_assistant_makes_a_backup_or_the_recorder_struggles(
    hass: HomeAssistant,
) -> None:
    from types import SimpleNamespace
    from unittest.mock import patch

    scanner = await make_scanner(hass)

    def fresh():
        return {"status": "running", "events": [], "actions": [{"object_id": "sensor.a"}]}

    busy = SimpleNamespace(state=SimpleNamespace(value="create_backup"))
    plan = fresh()
    with patch("homeassistant.components.backup.async_get_manager", return_value=busy):
        assert await scanner.cleanup._others_idle(plan, False) is False
    assert plan["actions"][0]["result"]["reason"] == "backup_running"

    idle = SimpleNamespace(state=SimpleNamespace(value="idle"))
    for instance, reason in (
        (SimpleNamespace(migration_in_progress=True, backlog=0), "recorder_migrating"),
        (SimpleNamespace(migration_in_progress=False, backlog=20_000), "recorder_backlog"),
    ):
        plan = fresh()
        with (
            patch("homeassistant.components.backup.async_get_manager", return_value=idle),
            patch("homeassistant.components.recorder.get_instance", return_value=instance),
            patch(
                "custom_components.ha_housekeeper.cleanup_exec.recorder_ready", return_value=True
            ),
        ):
            assert await scanner.cleanup._others_idle(plan, True) is False
        assert plan["actions"][0]["result"]["reason"] == reason
        with (
            patch("homeassistant.components.backup.async_get_manager", return_value=idle),
            patch("homeassistant.components.recorder.get_instance", return_value=instance),
            patch(
                "custom_components.ha_housekeeper.cleanup_exec.recorder_ready", return_value=True
            ),
        ):
            assert await scanner.cleanup._others_idle(fresh(), False) is True  # reads nothing


def test_only_a_plan_that_really_wrote_into_the_recorder_asks_for_a_check_afterwards() -> None:
    from custom_components.ha_housekeeper.cleanup_exec import CleanupRunner

    done = {"state": "done"}
    wrote = lambda *actions: CleanupRunner._deleted_from_recorder({"actions": list(actions)})  # noqa: E731
    assert wrote({"kind": "trim_history", "result": done})
    assert wrote({"kind": "remove_entity", "recorder": "statistics", "result": done})
    assert not wrote({"kind": "remove_entity", "result": done})
    assert not wrote({"kind": "trim_history", "result": {"state": "not_run"}})
    assert not wrote({"kind": "trim_history"})


async def test_a_backup_that_is_missing_empty_or_without_the_database_is_not_relied_on(
    hass: HomeAssistant,
) -> None:
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, patch

    from custom_components.ha_housekeeper import backup_cleanup

    def manager(*backups):
        return SimpleNamespace(
            async_get_backups=AsyncMock(return_value=({b.backup_id: b for b in backups}, {}))
        )

    def backup(size=10, database=True, name="Housekeeper abcd1234"):
        return SimpleNamespace(
            backup_id="b1",
            name=name,
            extra_metadata={"housekeeper": True},
            database_included=database,
            agents={"backup.local": SimpleNamespace(size=size)},
        )

    async def verify(m, database=True):
        with (
            patch("homeassistant.components.backup.async_get_manager", return_value=m),
            patch.object(backup_cleanup, "VERIFY_PAUSE", 0),
        ):
            return await backup_cleanup.verify_backup(hass, "Housekeeper abcd1234", database)

    assert await verify(manager(backup())) is None
    assert await verify(manager()) == "missing"
    assert await verify(manager(backup(size=0))) == "empty"
    assert await verify(manager(backup(database=False))) == "without_database"
    assert await verify(manager(backup(database=False)), database=False) is None
    assert await verify(SimpleNamespace()) is None  # a manager that cannot be read does not count


async def test_an_error_in_a_step_never_leaves_the_plan_running(hass: HomeAssistant) -> None:
    """An unexpected error ends the run as partial; a damaged database marks the rest as not run."""
    import sqlite3

    first, second = orphan(hass, "first"), orphan(hass, "second")
    scanner = await make_scanner(hass)
    perform = scanner.cleanup._perform
    calls = {"n": 0}

    async def failing(plan, action):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("boom")
        return await perform(plan, action)

    scanner.cleanup._perform = failing
    plan = await make_plan(scanner, hass, first.entity_id, second.entity_id)
    await run(scanner, plan)
    assert plan["status"] == "partial" and not scanner.cleanup.running
    assert any(e["type"] == "failed" and "boom" in e["error"] for e in plan["events"])

    async def corrupt(plan, action):
        raise sqlite3.DatabaseError("database disk image is malformed")

    scanner.cleanup._perform = corrupt
    plan = await make_plan(scanner, hass, second.entity_id)
    await run(scanner, plan)
    assert plan["status"] == "aborted"
    assert plan["actions"][0]["result"]["reason"] == "database_corrupt"
    assert scanner.events.integrity["state"] == "damaged"


async def test_a_stop_of_home_assistant_ends_the_run_as_interrupted(hass: HomeAssistant) -> None:
    import asyncio

    entry = orphan(hass, "stopped")
    scanner = await make_scanner(hass)

    async def stopping(plan, action):
        raise asyncio.CancelledError

    scanner.cleanup._perform = stopping
    plan = await make_plan(scanner, hass, entry.entity_id)
    with pytest.raises(asyncio.CancelledError):
        await run(scanner, plan)
    assert plan["status"] == "aborted" and plan["run"]["finished_at"]
    assert plan["actions"][0]["result"]["reason"] == "interrupted"
    assert not scanner.cleanup.running


async def test_a_check_after_the_run_that_cannot_scan_says_so(hass: HomeAssistant) -> None:
    entry = orphan(hass, "checked")
    scanner = await make_scanner(hass)
    plan = await make_plan(scanner, hass, entry.entity_id)
    scan = scanner.async_scan
    calls = {"n": 0}

    async def failing_later():
        calls["n"] += 1
        if calls["n"] > 1:  # the run scans before its steps; the check scans afterwards
            raise RuntimeError("scan broke")
        return await scan()

    scanner.async_scan = failing_later
    await run(scanner, plan)
    assert plan["status"] == "executed"
    assert plan["verification"] == {
        "ok": False,
        "checks": [{"check": "scan", "ok": False, "error": "scan broke"}],
    }


async def test_trimming_beyond_old_states_reports_what_it_could_not_confirm(
    hass: HomeAssistant, monkeypatch: pytest.MonkeyPatch
) -> None:
    from custom_components.ha_housekeeper import cleanup_exec
    from custom_components.ha_housekeeper.cleanup_exec import StepAbort

    scanner = await make_scanner(hass)
    action = {"object_id": "sensor.meter", "keep_days": 7, "tables": ["long_term"]}

    async def deleted(*args):
        return {"long_term": 3}, None

    monkeypatch.setattr(cleanup_exec, "trim_extra", deleted)
    for counted, reason in ((None, "trim_unverified"), ({"rows": 2}, "trim_left")):

        async def count(*args, counted=counted):
            return counted

        monkeypatch.setattr(cleanup_exec, "count_trim", count)
        with pytest.raises(StepAbort) as stop:
            await scanner.cleanup._trim_extra(action)
        assert stop.value.reason == reason and stop.value.result["deleted"] == {"long_term": 3}

    async def nothing_left(*args):
        return {"rows": 0}

    monkeypatch.setattr(cleanup_exec, "count_trim", nothing_left)
    result = await scanner.cleanup._trim_extra(action)
    assert result["rows"] == 3 and result["irreversible"] is True


async def test_the_check_before_a_step_refuses_a_gone_or_changed_target(
    hass: HomeAssistant, monkeypatch: pytest.MonkeyPatch
) -> None:
    from homeassistant.helpers import area_registry as ar

    from custom_components.ha_housekeeper import cleanup_exec

    entry = orphan(hass, "target")
    area = ar.async_get(hass).async_create("Flur")
    scanner = await make_scanner(hass)
    context = {"snapshot": {}, "acknowledged": set()}
    check = scanner.cleanup._precheck
    fingerprint = registry_fingerprint(entry)

    def area_step(object_id, target=area.id, print_=fingerprint):
        return {"kind": "set_area", "object_id": object_id, "target": target, "fingerprint": print_}

    assert await check(area_step("sensor.missing"), context) == "entity_gone"
    assert await check(area_step(entry.entity_id, print_="old"), context) == "entity_changed"
    assert await check(area_step(entry.entity_id, target="gone"), context) == "now_blocked"
    assert await check(area_step(entry.entity_id), context) is None
    label = {
        "kind": "add_label",
        "object_id": entry.entity_id,
        "target": "gone",
        "fingerprint": fingerprint,
    }
    assert await check(label, context) == "now_blocked"

    trim = {"kind": "trim_history", "object_id": entry.entity_id, "keep_days": 14}
    monkeypatch.setattr(cleanup_exec, "recorder_ready", lambda hass: True)
    for counted, reason in ((None, "no_recorder"), ({entry.entity_id: {"rows": 0}}, "now_blocked")):

        async def count(*args, counted=counted):
            return counted

        monkeypatch.setattr(cleanup_exec, "count_older", count)
        assert await check(trim, context) == reason
