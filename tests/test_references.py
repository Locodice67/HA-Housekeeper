"""Replacing the references to one entity by another."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")

from homeassistant.core import HomeAssistant  # noqa: E402
from homeassistant.helpers import entity_registry as er  # noqa: E402
from homeassistant.util.yaml import dump, load_yaml  # noqa: E402
from scanner_entry import attach_scanner  # noqa: E402
from test_cleanup_exec import fake_backup, make_scanner, run  # noqa: E402

from custom_components.ha_housekeeper.cleanup import (  # noqa: E402
    build_plan,
    judge_reference_action,
    registry_fingerprint,
)
from custom_components.ha_housekeeper.cleanup_exec import (  # noqa: E402
    CleanupError,
    entity_restorable,
)
from custom_components.ha_housekeeper.references import (  # noqa: E402
    mentions,
    preview_replacement,
    rewrite,
    yaml_hash,
)

OLD, NEW = "sensor.old_temp", "sensor.new_temp"


@pytest.fixture(autouse=True)
def clean_config_files(hass: HomeAssistant):
    """The test config directory outlives a test; never leave YAML files behind."""
    yield
    for name in ("automations.yaml", "scripts.yaml", "scenes.yaml"):
        Path(hass.config.path(name)).unlink(missing_ok=True)


# ---- pure rewriting -----------------------------------------------------------------------


def test_rewrite_replaces_exact_ids_keys_and_lists_but_not_templates() -> None:
    config = {
        "trigger": [{"platform": "state", "entity_id": OLD}],
        "action": [
            {"service": "light.turn_on", "target": {"entity_id": ["light.a", OLD]}},
            {"service": "x.y", "data": {"entity_id": f"light.a, {OLD}"}},
            {"service": "notify.me", "data": {"message": f"{{{{ states('{OLD}') }}}}"}},
            {"service": "notify.me", "data": {"message": f"the {OLD} is meant as text"}},
        ],
        "entities": {OLD: {"state": "on"}},
    }
    result, changes, manual = rewrite(config, OLD, NEW)
    assert result["trigger"][0]["entity_id"] == NEW
    assert result["action"][0]["target"]["entity_id"] == ["light.a", NEW]
    assert result["action"][1]["data"]["entity_id"] == f"light.a, {NEW}"
    assert NEW in result["entities"] and OLD not in result["entities"]
    assert OLD in result["action"][2]["data"]["message"]  # templates are left alone ...
    assert manual == ["action/2/data/message"]  # ... and reported
    assert OLD in result["action"][3]["data"]["message"]  # prose is not a reference
    assert {c["location"] for c in changes} == {
        "trigger/0/entity_id",
        "action/0/target/entity_id/1",
        "action/1/data/entity_id",
        f"entities/{OLD}",
    }
    assert config["trigger"][0]["entity_id"] == OLD  # the input is untouched


def test_rewrite_does_not_merge_into_an_existing_key() -> None:
    result, changes, manual = rewrite({"entities": {OLD: 1, NEW: 2}}, OLD, NEW)
    assert (
        result == {"entities": {OLD: 1, NEW: 2}} and not changes and manual == [f"entities/{OLD}"]
    )


def test_mentions_matches_whole_ids_only() -> None:
    assert mentions(f"{{{{ states('{OLD}') }}}}", OLD)
    assert not mentions(f"{{{{ states('{OLD}_2') }}}}", OLD)
    assert not mentions(f"{{{{ states('my{OLD}') }}}}", OLD)


def test_judging_a_replacement() -> None:
    objects = {
        OLD: {
            "object_id": OLD,
            "status": "unavailable",
            "unit": "°C",
            "device_class": "temperature",
        },
        NEW: {"object_id": NEW, "status": "active", "unit": "°C", "device_class": "temperature"},
        "light.x": {"object_id": "light.x", "status": "active"},
        "sensor.off": {"object_id": "sensor.off", "status": "unavailable"},
    }
    write = {
        "source": "automation:automation.a",
        "type": "automation",
        "writable": True,
        "changes": [1],
        "manual": [],
    }
    ok = judge_reference_action(OLD, NEW, objects, [], [write])
    assert ok["verdict"] == "review" and ok["reasons"] == ["config_rewrite"]  # never silent
    assert (
        judge_reference_action(OLD, "light.x", objects, [], [write])["reasons"][0]
        == "different_domain"
    )
    assert (
        judge_reference_action(OLD, "sensor.off", objects, [], [write])["reasons"][0]
        == "target_not_working"
    )
    assert (
        judge_reference_action(OLD, "sensor.gone", objects, [], [write])["reasons"][0]
        == "target_missing"
    )
    assert judge_reference_action(OLD, OLD, objects, [], [write])["reasons"][0] == "same_entity"
    assert judge_reference_action(OLD, NEW, objects, [], [])["verdict"] == "blocked"
    manual = {**write, "manual": ["x"]}
    assert "source_manual" in judge_reference_action(OLD, NEW, objects, [], [manual])["reasons"]
    energy = {**write, "type": "energy"}
    assert "energy_changes" in judge_reference_action(OLD, NEW, objects, [], [energy])["reasons"]
    other_unit = {**objects, NEW: {**objects[NEW], "unit": "°F"}}
    assert "unit_differs" in judge_reference_action(OLD, NEW, other_unit, [], [write])["reasons"]


# ---- against configuration files ----------------------------------------------------------

AUTOMATIONS = """\
- id: auto-1
  alias: Heating
  trigger:
    - platform: state
      entity_id: sensor.old_temp
  action:
    - service: notify.me
      data:
        message: "{{ states('sensor.old_temp') }}"
- id: auto-2
  alias: Unrelated
  trigger:
    - platform: state
      entity_id: sensor.other
  action: []
"""


def write_config(hass: HomeAssistant, name: str, text: str) -> str:
    path = hass.config.path(name)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)
    return path


def reload_services(hass: HomeAssistant) -> list[str]:
    calls: list[str] = []
    for domain in ("automation", "script", "scene"):

        async def reload(call, domain=domain):
            calls.append(domain)

        hass.services.async_register(domain, "reload", reload)
    return calls


def automation_scanner_state(hass: HomeAssistant, scanner, automation_id: str = "auto-1"):
    """Make the scanner see an automation by its entity and unique ID, like a real one."""
    hass.states.async_set(
        "automation.heating", "on", {"friendly_name": "Heating", "id": automation_id}
    )
    component = SimpleNamespace(
        entities=[
            SimpleNamespace(
                entity_id="automation.heating",
                unique_id=automation_id,
                name="Heating",
                raw_config={
                    "id": automation_id,
                    "trigger": [{"platform": "state", "entity_id": OLD}],
                    "action": [{"service": "notify.me"}],
                },
                referenced_entities={OLD},
                referenced_devices=set(),
                referenced_areas=set(),
                referenced_floors=set(),
                referenced_labels=set(),
            )
        ]
    )
    return patch.object(
        type(scanner),
        "_runtime_component",
        lambda self, domain: component if domain == "automation" else None,
    )


async def test_a_script_home_assistant_cannot_read_does_not_stop_the_scan(
    hass: HomeAssistant,
) -> None:
    scanner = await make_scanner(hass)
    hass.states.async_set("script.broken", "off", {"friendly_name": "Broken"})

    class Broken:  # HA raises on an entity_id list that holds a dict
        entity_id = "script.broken"
        unique_id = "broken"
        name = "Broken"
        raw_config = {"sequence": [{"service": "light.turn_on", "target": {"entity_id": OLD}}]}
        referenced_devices = referenced_areas = referenced_floors = referenced_labels = set()

        @property
        def referenced_entities(self):
            raise TypeError("cannot use 'dict' as a set element (unhashable type: 'dict')")

    component = SimpleNamespace(entities=[Broken()])
    with patch.object(
        type(scanner),
        "_runtime_component",
        lambda self, domain: component if domain == "script" else None,
    ):
        snapshot = await scanner.async_scan()

    script = next(o for o in snapshot["objects"] if o["object_id"] == "script.broken")
    assert {"entity:" + OLD} <= {
        e["target"] for e in snapshot["edges"] if e["source"] == "script:script.broken"
    }
    assert script["object_type"] == "script"


def make_entities(hass: HomeAssistant, *, new_state: str = "21") -> None:
    registry = er.async_get(hass)
    old = registry.async_get_or_create("sensor", "test", "old", suggested_object_id="old_temp")
    new = registry.async_get_or_create("sensor", "test", "new", suggested_object_id="new_temp")
    hass.states.async_set(old.entity_id, "unavailable")
    hass.states.async_set(new.entity_id, new_state)


async def make_reference_plan(scanner, hass: HomeAssistant, old: str = OLD, new: str = NEW):
    snapshot = await scanner.async_scan()
    registry = er.async_get(hass)
    data = {(old, new): await preview_replacement(hass, snapshot, old, new)}
    plan = build_plan(
        snapshot,
        [{"kind": "replace_references", "object_id": old, "target": new}],
        datetime.now(UTC),
        lambda object_id: registry_fingerprint(registry.async_get(object_id)),
        lambda object_id: entity_restorable(hass, registry.async_get(object_id)),
        reference_data=data,
    )
    scanner.journal.add(plan)
    return plan


async def test_replacing_references_in_an_automation_is_verified_and_undone(
    hass: HomeAssistant,
) -> None:
    make_entities(hass)
    path = write_config(hass, "automations.yaml", AUTOMATIONS)
    reloads = reload_services(hass)
    scanner = await make_scanner(hass)
    manager, create = fake_backup()
    with (
        automation_scanner_state(hass, scanner),
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
    ):
        plan = await make_reference_plan(scanner, hass)
        action = plan["actions"][0]
        assert action["verdict"] == "review" and action["executable"] is True
        source = action["sources"][0]
        assert source["source"] == "automation:automation.heating" and source["writable"]
        assert source["change_count"] == 1 and source["manual"] == ["action/0/data/message"]
        assert "source_manual" in action["reasons"]  # the template needs the person's attention
        with pytest.raises(CleanupError, match="nothing_to_do"):
            scanner.cleanup.confirm(plan["plan_id"], [], None)

        before = Path(path).read_text(encoding="utf-8")
        await run(scanner, plan, [OLD])
        create.assert_awaited_once()

        data = load_yaml(path)
        assert data[0]["trigger"][0]["entity_id"] == NEW
        assert OLD in data[0]["action"][0]["data"]["message"]  # templates are not rewritten
        assert data[1]["trigger"][0]["entity_id"] == "sensor.other"  # the rest is untouched
        assert reloads == ["automation"]
        result = plan["actions"][0]["result"]
        assert result["state"] == "done" and result["sources"][0]["change_count"] == 1
        assert "references_replaced" in [c["check"] for c in plan["verification"]["checks"]]

        outcome = await scanner.cleanup.undo(plan["plan_id"], None)
        assert outcome["results"] == [{"object_id": OLD, "outcome": "undone"}]
        assert load_yaml(path) == load_yaml_text(before)
        assert plan["status"] == "undone" and reloads == ["automation", "automation"]


def load_yaml_text(text: str):
    from homeassistant.util.yaml import parse_yaml

    return parse_yaml(text)


async def test_an_edit_after_the_preview_stops_the_replacement(hass: HomeAssistant) -> None:
    make_entities(hass)
    path = write_config(hass, "automations.yaml", AUTOMATIONS)
    reload_services(hass)
    scanner = await make_scanner(hass)
    manager, _ = fake_backup()
    with (
        automation_scanner_state(hass, scanner),
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
    ):
        plan = await make_reference_plan(scanner, hass)
        data = load_yaml(path)
        data[0]["alias"] = "Edited by the user"
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(dump(data))
        await run(scanner, plan, [OLD])
    assert plan["actions"][0]["result"]["reason"] == "source_changed"
    assert load_yaml(path)[0]["trigger"][0]["entity_id"] == OLD


async def test_undo_does_not_overwrite_later_edits(hass: HomeAssistant) -> None:
    make_entities(hass)
    path = write_config(hass, "automations.yaml", AUTOMATIONS)
    reload_services(hass)
    scanner = await make_scanner(hass)
    manager, _ = fake_backup()
    with (
        automation_scanner_state(hass, scanner),
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
    ):
        plan = await make_reference_plan(scanner, hass)
        await run(scanner, plan, [OLD])
        data = load_yaml(path)
        data[0]["alias"] = "Edited after"
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(dump(data))
        outcome = await scanner.cleanup.undo(plan["plan_id"], None)
    assert outcome["results"] == [{"object_id": OLD, "outcome": "conflict_changed"}]
    assert load_yaml(path)[0]["alias"] == "Edited after"
    assert plan["actions"][0]["result"]["state"] == "done"


async def test_files_with_secrets_or_includes_are_not_rewritten(hass: HomeAssistant) -> None:
    make_entities(hass)
    path = write_config(
        hass, "automations.yaml", AUTOMATIONS + "# x\n- id: s\n  alias: !secret name\n"
    )
    scanner = await make_scanner(hass)
    with automation_scanner_state(hass, scanner):
        plan = await make_reference_plan(scanner, hass)
    source = plan["actions"][0]["sources"][0]
    assert source["writable"] is False and source["reason"] == "yaml_uses_tags"
    assert plan["actions"][0]["verdict"] == "blocked"
    assert "!secret" in Path(path).read_text(encoding="utf-8")


async def test_a_missing_file_makes_the_source_manual(hass: HomeAssistant) -> None:
    make_entities(hass)
    scanner = await make_scanner(hass)
    with automation_scanner_state(hass, scanner):
        plan = await make_reference_plan(scanner, hass)
    assert plan["actions"][0]["sources"][0]["reason"] == "not_in_yaml"
    assert "nothing_to_replace" in plan["actions"][0]["reasons"]


async def test_storage_dashboards_and_the_energy_dashboard_are_rewritten(
    hass: HomeAssistant,
) -> None:
    from homeassistant.components.lovelace.const import LOVELACE_DATA

    make_entities(hass)
    saved = {}

    class Dashboard:
        mode = "storage"
        config = {"title": "Home"}

        def __init__(self) -> None:
            self.data = {"views": [{"cards": [{"type": "entity", "entity": OLD}]}]}

        async def async_load(self, force):
            return self.data

        async def async_save(self, config):
            saved["dashboard"] = config
            self.data = config

    dashboard = Dashboard()
    hass.data[LOVELACE_DATA] = SimpleNamespace(dashboards={"home": dashboard})
    hass.config.components.add("energy")
    energy = SimpleNamespace(
        data={
            "energy_sources": [{"type": "grid", "flow_from": [{"stat_energy_from": OLD}]}],
            "device_consumption": [{"stat_consumption": "sensor.other"}],
        },
        async_update=AsyncMock(),
    )

    async def store(update):  # like Home Assistant: what was passed is what is held afterwards
        energy.data = {**energy.data, **update}

    energy.async_update.side_effect = store

    async def get_manager(_hass):
        return energy

    scanner = await make_scanner(hass)
    manager, _ = fake_backup()
    with (
        patch("homeassistant.components.energy.data.async_get_manager", get_manager),
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
    ):
        plan = await make_reference_plan(scanner, hass)
        kinds = {s["type"]: s for s in plan["actions"][0]["sources"]}
        assert set(kinds) == {"dashboard", "energy"} and all(s["writable"] for s in kinds.values())
        assert "energy_changes" in plan["actions"][0]["reasons"]
        await run(scanner, plan, [OLD])

        assert saved["dashboard"]["views"][0]["cards"][0]["entity"] == NEW
        update = energy.async_update.await_args.args[0]
        assert update["energy_sources"][0]["flow_from"][0]["stat_energy_from"] == NEW
        assert update["device_consumption"] == [{"stat_consumption": "sensor.other"}]

        energy.async_update.reset_mock()
        outcome = await scanner.cleanup.undo(plan["plan_id"], None)
        assert outcome["results"] == [{"object_id": OLD, "outcome": "undone"}]
        assert dashboard.data["views"][0]["cards"][0]["entity"] == OLD
        restored = energy.async_update.await_args.args[0]
        assert restored["energy_sources"][0]["flow_from"][0]["stat_energy_from"] == OLD


async def test_yaml_dashboards_are_reported_not_rewritten(hass: HomeAssistant) -> None:
    from homeassistant.components.lovelace.const import LOVELACE_DATA

    make_entities(hass)

    class Dashboard:
        mode = "yaml"
        config = None

        async def async_load(self, force):
            return {"views": [{"cards": [{"entity": OLD}]}]}

    hass.data[LOVELACE_DATA] = SimpleNamespace(dashboards={"yamlboard": Dashboard()})
    scanner = await make_scanner(hass)
    plan = await make_reference_plan(scanner, hass)
    assert plan["actions"][0]["sources"][0]["reason"] == "yaml_mode"
    assert plan["actions"][0]["verdict"] == "blocked"


def test_yaml_hash_is_stable_across_a_write_and_a_reload(tmp_path) -> None:
    item = load_yaml_text(AUTOMATIONS)[0]
    rewritten, _, _ = rewrite(item, OLD, NEW)
    path = tmp_path / "a.yaml"
    path.write_text(dump([rewritten]), encoding="utf-8")
    assert yaml_hash(load_yaml(str(path))[0]) == yaml_hash(rewritten)


async def test_scripts_and_scenes_are_rewritten_in_their_files(hass: HomeAssistant) -> None:
    make_entities(hass)
    scripts = write_config(
        hass,
        "scripts.yaml",
        "heat:\n  alias: Heat\n  sequence:\n    - service: light.turn_on\n"
        f"      target:\n        entity_id: {OLD}\nother:\n  sequence: []\n",
    )
    scenes = write_config(
        hass,
        "scenes.yaml",
        f"- id: scene-1\n  name: Cozy\n  entities:\n    {OLD}:\n      state: unavailable\n"
        "- id: scene-2\n  name: Other\n  entities: {}\n",
    )
    reloads = reload_services(hass)
    hass.states.async_set("scene.cozy", "scening", {"id": "scene-1", "entity_id": [OLD]})
    component = SimpleNamespace(
        entities=[
            SimpleNamespace(
                entity_id="script.heat",
                unique_id="heat",
                name="Heat",
                raw_config={"sequence": [{"target": {"entity_id": OLD}}]},
                referenced_entities={OLD},
                referenced_devices=set(),
                referenced_areas=set(),
                referenced_floors=set(),
                referenced_labels=set(),
            )
        ]
    )
    hass.states.async_set("script.heat", "off", {"friendly_name": "Heat"})
    scanner = await make_scanner(hass)
    manager, _ = fake_backup()
    with (
        patch.object(
            type(scanner),
            "_runtime_component",
            lambda self, domain: component if domain == "script" else None,
        ),
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
    ):
        plan = await make_reference_plan(scanner, hass)
        assert {s["source"] for s in plan["actions"][0]["sources"]} == {
            "script:script.heat",
            "scene:scene.cozy",
        }
        await run(scanner, plan, [OLD])
        assert load_yaml(scripts)["heat"]["sequence"][0]["target"]["entity_id"] == NEW
        assert load_yaml(scripts)["other"] == {"sequence": []}
        assert (
            NEW in load_yaml(scenes)[0]["entities"] and OLD not in load_yaml(scenes)[0]["entities"]
        )
        assert sorted(reloads) == ["scene", "script"]

        outcome = await scanner.cleanup.undo(plan["plan_id"], None)
        assert outcome["results"] == [{"object_id": OLD, "outcome": "undone"}]
        assert load_yaml(scripts)["heat"]["sequence"][0]["target"]["entity_id"] == OLD
        assert OLD in load_yaml(scenes)[0]["entities"]


async def test_the_websocket_previews_a_replacement_and_a_device_plan(
    hass: HomeAssistant, hass_ws_client
) -> None:
    from homeassistant.setup import async_setup_component

    from custom_components.ha_housekeeper import async_setup

    make_entities(hass)
    write_config(hass, "automations.yaml", AUTOMATIONS)
    assert await async_setup(hass, {})
    scanner = await make_scanner(hass)
    assert await async_setup_component(hass, "websocket_api", {})
    client = await hass_ws_client(hass)
    with automation_scanner_state(hass, scanner):
        await scanner.async_scan()
        await client.send_json_auto_id(
            {
                "type": "ha_housekeeper/plan_create",
                "actions": [
                    {"kind": "replace_references", "object_id": OLD, "target": NEW},
                    {"kind": "forget_device", "object_id": "does-not-exist"},
                ],
            }
        )
        plan = (await client.receive_json())["result"]
    replace, device = plan["actions"]
    assert replace["target"] == NEW and replace["verdict"] == "review" and replace["executable"]
    assert replace["sources"][0]["change_count"] == 1 and replace["fingerprint"]
    assert device["verdict"] == "blocked" and device["reasons"] == ["not_found"]


async def test_a_failed_reload_puts_the_file_back(hass: HomeAssistant) -> None:
    make_entities(hass)
    path = write_config(hass, "automations.yaml", AUTOMATIONS)
    calls = []

    async def reload(call):
        calls.append(call.domain)
        if len(calls) == 1:
            raise ValueError("invalid configuration")

    hass.services.async_register("automation", "reload", reload)
    scanner = await make_scanner(hass)
    manager, _ = fake_backup()
    with (
        automation_scanner_state(hass, scanner),
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
    ):
        plan = await make_reference_plan(scanner, hass)
        await run(scanner, plan, [OLD])
    assert plan["actions"][0]["result"]["reason"] == "source_write_failed"
    assert plan["status"] == "aborted" and plan["executed"] is False
    assert load_yaml(path)[0]["trigger"][0]["entity_id"] == OLD  # as before
    assert calls == ["automation", "automation"]  # and Home Assistant read it again


async def test_an_automation_home_assistant_would_not_accept_is_not_written(
    hass: HomeAssistant,
) -> None:
    from custom_components.ha_housekeeper import refactor

    make_entities(hass)
    path = write_config(hass, "automations.yaml", AUTOMATIONS)
    reloads = reload_services(hass)
    scanner = await make_scanner(hass)
    manager, _ = fake_backup()
    with (
        automation_scanner_state(hass, scanner),
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
        patch.object(refactor, "is_valid", return_value=False),
    ):
        plan = await make_reference_plan(scanner, hass)
        await run(scanner, plan, [OLD])
    assert plan["actions"][0]["result"]["reason"] == "invalid_config"
    assert load_yaml(path)[0]["trigger"][0]["entity_id"] == OLD
    assert reloads == []


def _load_source_failing_after_the_first_call(*, times: int):
    """A ``load_source`` that reads once, then fails ``times`` times, then works again."""
    from custom_components.ha_housekeeper import cleanup_exec
    from custom_components.ha_housekeeper.references import SourceError

    real = cleanup_exec.load_source
    calls = {"n": 0}

    async def flaky(hass, snapshot, source_key):
        calls["n"] += 1
        if 1 < calls["n"] <= 1 + times:
            raise SourceError("source_gone")
        return await real(hass, snapshot, source_key)

    return patch.object(cleanup_exec, "load_source", flaky)


async def test_a_failed_read_after_the_write_still_puts_the_file_back(
    hass: HomeAssistant,
) -> None:
    make_entities(hass)
    path = write_config(hass, "automations.yaml", AUTOMATIONS)
    reload_services(hass)
    scanner = await make_scanner(hass)
    manager, _ = fake_backup()
    with (
        automation_scanner_state(hass, scanner),
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
    ):
        plan = await make_reference_plan(scanner, hass)
        # Reads: 1 before the write, 2 after it (fails), 3 while putting it back (works).
        with _load_source_failing_after_the_first_call(times=1):
            await run(scanner, plan, [OLD])
    assert plan["actions"][0]["result"]["reason"] == "source_gone"
    assert plan["status"] == "aborted" and plan["executed"] is False
    assert load_yaml(path)[0]["trigger"][0]["entity_id"] == OLD


async def test_a_rollback_that_fails_is_journalled_and_can_be_undone(
    hass: HomeAssistant,
) -> None:
    make_entities(hass)
    path = write_config(hass, "automations.yaml", AUTOMATIONS)
    reload_services(hass)
    scanner = await make_scanner(hass)
    manager, _ = fake_backup()
    with (
        automation_scanner_state(hass, scanner),
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
    ):
        plan = await make_reference_plan(scanner, hass)
        # The read after the write and the read for the rollback both fail.
        with _load_source_failing_after_the_first_call(times=2):
            await run(scanner, plan, [OLD])

        result = plan["actions"][0]["result"]
        assert result["state"] == "done" and result["stopped"] == "rollback_incomplete"
        assert result["cause"] == "source_gone"
        assert result["sources"][0]["rollback"] == "conflict_gone"
        assert plan["status"] == "partial" and plan["executed"] is True
        assert "rollback_incomplete" in [e["type"] for e in plan["events"]]
        assert load_yaml(path)[0]["trigger"][0]["entity_id"] == NEW  # still changed

        outcome = await scanner.cleanup.undo(plan["plan_id"], None)
        assert outcome["results"] == [{"object_id": OLD, "outcome": "undone"}]
        assert load_yaml(path)[0]["trigger"][0]["entity_id"] == OLD


FORMATTED = """\
# Heating, kept by hand
- id: auto-1
  alias: 'Heating'   # single quotes on purpose
  trigger:
    - platform: state
      entity_id: sensor.old_temp


  action: []
- id: auto-2
  alias: Unrelated
  variables: &shared {limit: 5}
  trigger:
    - platform: state
      entity_id: sensor.other
  action:
    - variables: *shared
"""


async def _replace_in_formatted_file(hass: HomeAssistant, text: str, newline: str | None = None):
    make_entities(hass)
    path = hass.config.path("automations.yaml")
    with open(path, "w", encoding="utf-8", newline=newline) as handle:
        handle.write(text)
    reload_services(hass)
    scanner = await make_scanner(hass)
    manager, _ = fake_backup()
    patches = (
        automation_scanner_state(hass, scanner),
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
    )
    return path, scanner, patches


@pytest.mark.parametrize("newline", [None, "\r\n"])
async def test_undo_restores_the_file_byte_for_byte(hass: HomeAssistant, newline) -> None:
    path, scanner, (state, backup) = await _replace_in_formatted_file(hass, FORMATTED, newline)
    original = Path(path).read_bytes()
    with state, backup:
        plan = await make_reference_plan(scanner, hass)
        await run(scanner, plan, [OLD])
        assert Path(path).read_bytes() != original
        assert load_yaml(path)[0]["trigger"][0]["entity_id"] == NEW

        outcome = await scanner.cleanup.undo(plan["plan_id"], None)
    assert outcome["results"] == [{"object_id": OLD, "outcome": "undone"}]
    assert Path(path).read_bytes() == original  # comments, quotes, blank lines, anchors, line ends
    assert plan["actions"][0]["result"]["sources"][0]["restored_as"] == "file"


async def test_undo_after_an_edit_elsewhere_only_puts_back_the_item(hass: HomeAssistant) -> None:
    path, scanner, (state, backup) = await _replace_in_formatted_file(hass, FORMATTED)
    with state, backup:
        plan = await make_reference_plan(scanner, hass)
        await run(scanner, plan, [OLD])
        data = load_yaml(path)
        data[1]["alias"] = "Edited by the user"
        Path(path).write_text(dump(data), encoding="utf-8")

        outcome = await scanner.cleanup.undo(plan["plan_id"], None)
    assert outcome["results"] == [{"object_id": OLD, "outcome": "undone"}]
    data = load_yaml(path)
    assert data[0]["trigger"][0]["entity_id"] == OLD and data[1]["alias"] == "Edited by the user"
    assert plan["actions"][0]["result"]["sources"][0]["restored_as"] == "item"


async def test_a_journal_without_the_old_file_still_undoes_the_item(hass: HomeAssistant) -> None:
    path, scanner, (state, backup) = await _replace_in_formatted_file(hass, FORMATTED)
    with state, backup:
        plan = await make_reference_plan(scanner, hass)
        await run(scanner, plan, [OLD])
        source = plan["actions"][0]["result"]["sources"][0]
        del source["file_before"], source["file_after_hash"]  # as written by version 0.7.0

        outcome = await scanner.cleanup.undo(plan["plan_id"], None)
    assert outcome["results"] == [{"object_id": OLD, "outcome": "undone"}]
    assert load_yaml(path)[0]["trigger"][0]["entity_id"] == OLD
    assert source["restored_as"] == "item"


def _keys_anywhere(value, found=None):
    found = set() if found is None else found
    if isinstance(value, dict):
        for key, item in value.items():
            found.add(key)
            _keys_anywhere(item, found)
    elif isinstance(value, list):
        for item in value:
            _keys_anywhere(item, found)
    return found


async def test_the_panel_never_receives_the_restore_data_of_a_plan(
    hass: HomeAssistant, hass_ws_client
) -> None:
    from homeassistant.setup import async_setup_component

    from custom_components.ha_housekeeper import async_setup

    path, scanner, (state, backup) = await _replace_in_formatted_file(hass, FORMATTED)
    assert await async_setup(hass, {})
    attach_scanner(hass, scanner)
    assert await async_setup_component(hass, "websocket_api", {})
    client = await hass_ws_client(hass)
    internal = {"file_before", "file_after_hash", "restore"}
    with state, backup:
        plan = await make_reference_plan(scanner, hass)
        await run(scanner, plan, [OLD])
        stored = plan["actions"][0]["result"]["sources"][0]
        assert stored["file_before"] and stored["before"]  # the server keeps what it needs to undo

        await client.send_json_auto_id({"type": "ha_housekeeper/plan_list"})
        listing = (await client.receive_json())["result"]["plans"]
        assert [p["plan_id"] for p in listing] == [plan["plan_id"]]
        assert set(listing[0]) == {
            "plan_id",
            "created_at",
            "status",
            "executed",
            "run",
            "finished_at",
            "undoable",
            "summary",
            "file_snapshot_dropped",
            "followup",
            "followup_until",
            "objects",
            "done_objects",
            "done_count",
            "kinds",
        }

        for message in (
            {"type": "ha_housekeeper/plan_detail", "plan_id": plan["plan_id"]},
            {"type": "ha_housekeeper/plan_status", "plan_id": plan["plan_id"]},
        ):
            await client.send_json_auto_id(message)
            reply = await client.receive_json()
            assert reply["success"] is True
            assert not internal & _keys_anywhere(reply["result"]), message["type"]
            assert len(json.dumps(reply["result"])) < len(json.dumps(plan))
        # Undo still works from the server-side data.
        outcome = await scanner.cleanup.undo(plan["plan_id"], None)
    assert outcome["results"] == [{"object_id": OLD, "outcome": "undone"}]

    await client.send_json_auto_id({"type": "ha_housekeeper/plan_detail", "plan_id": "nope"})
    assert (await client.receive_json())["error"]["code"] == "not_found"


async def test_a_plan_over_the_snapshot_limit_still_runs_and_undoes_per_item(
    hass: HomeAssistant,
) -> None:
    from custom_components.ha_housekeeper import cleanup_exec

    path, scanner, (state, backup) = await _replace_in_formatted_file(hass, FORMATTED)
    with state, backup, patch.object(cleanup_exec, "MAX_PLAN_SNAPSHOTS", 10):
        plan = await make_reference_plan(scanner, hass)
        await run(scanner, plan, [OLD])
        source = plan["actions"][0]["result"]["sources"][0]
        assert plan["status"] in {"executed", "verified"}
        assert source["file_snapshot_skipped"] is True and "file_before" not in source
        assert load_yaml(path)[0]["trigger"][0]["entity_id"] == NEW

        outcome = await scanner.cleanup.undo(plan["plan_id"], None)
    assert outcome["results"] == [{"object_id": OLD, "outcome": "undone"}]
    assert load_yaml(path)[0]["trigger"][0]["entity_id"] == OLD  # the item is back
    assert plan["actions"][0]["result"]["sources"][0]["restored_as"] == "item"


async def test_undo_after_the_journal_gave_up_the_file_copy_puts_the_item_back(
    hass: HomeAssistant,
) -> None:
    path, scanner, (state, backup) = await _replace_in_formatted_file(hass, FORMATTED)
    with state, backup:
        plan = await make_reference_plan(scanner, hass)
        await run(scanner, plan, [OLD])
        assert plan["actions"][0]["result"]["sources"][0]["file_before"]
        scanner.journal._compact_to(0)  # the journal is "full": the whole-file copy goes
        source = plan["actions"][0]["result"]["sources"][0]
        assert "file_before" not in source and source["file_snapshot_dropped"] is True

        outcome = await scanner.cleanup.undo(plan["plan_id"], None)
    assert outcome["results"] == [{"object_id": OLD, "outcome": "undone"}]
    assert load_yaml(path)[0]["trigger"][0]["entity_id"] == OLD
    assert plan["actions"][0]["result"]["sources"][0]["restored_as"] == "item"


async def test_the_preview_says_when_undo_will_work_per_item(hass: HomeAssistant) -> None:
    """A file the journal cannot keep whole is flagged before anything is written."""
    path, scanner, (state, backup) = await _replace_in_formatted_file(hass, FORMATTED)
    with state, backup:
        plan = await make_reference_plan(scanner, hass)
        source = plan["actions"][0]["sources"][0]
        assert source["undo_per_item"] is False and source["file_bytes"] == len(FORMATTED.encode())

    big = FORMATTED + "# " + "x" * (600 * 1024) + "\n"
    path, scanner, (state, backup) = await _replace_in_formatted_file(hass, big)
    with state, backup:
        plan = await make_reference_plan(scanner, hass)
        source = plan["actions"][0]["sources"][0]
        assert source["undo_per_item"] is True
        await run(scanner, plan, [OLD])
        assert "file_before" not in plan["actions"][0]["result"]["sources"][0]  # as announced


# ---- mechanical refactoring --------------------------------------------------------------


def test_refactoring_makes_exactly_the_named_edit() -> None:
    from custom_components.ha_housekeeper import refactor

    item = {
        "id": "a",
        "alias": "Heating",
        "trigger": [{"platform": "state", "entity_id": "x.y"}] * 2 + [{"platform": "sun"}],
        "action": [{"service": "notify.me"}],
    }
    assert [p["fix"] for p in refactor.propose(item)] == [
        "add_description",
        "remove_duplicate_triggers",
        "set_mode",
    ]
    new, diff = refactor.apply(item, "remove_duplicate_triggers", None)
    assert [t["platform"] for t in new["trigger"]] == ["state", "sun"] and diff[0][
        "path"
    ] == "trigger/1"
    assert new["action"] == item["action"] and len(item["trigger"]) == 3, "the input is untouched"
    new, diff = refactor.apply(item, "add_description", {"description": " Warms the house "})
    assert (
        list(new)[:3] == ["id", "alias", "description"] and new["description"] == "Warms the house"
    )
    for fix, values, reason in (
        ("add_description", {}, "invalid_fix"),
        ("add_description", {"description": "x" * 301}, "invalid_fix"),
        ("remove_duplicate_triggers", None, "nothing_to_do"),
        ("other", None, "invalid_fix"),
    ):
        source = {**item, "trigger": [{"platform": "sun"}]} if reason == "nothing_to_do" else item
        with pytest.raises(ValueError, match=reason):
            refactor.apply(source, fix, values)
    with pytest.raises(ValueError, match="nothing_to_do"):
        refactor.apply({**item, "description": "has one"}, "add_description", {"description": "z"})


DOUBLED = AUTOMATIONS.replace(
    "      entity_id: sensor.old_temp\n  action:",
    "      entity_id: sensor.old_temp\n    - platform: state\n      entity_id: sensor.old_temp\n  action:",
    1,
)


async def test_a_refactoring_is_written_validated_verified_and_undone(hass: HomeAssistant) -> None:
    from custom_components.ha_housekeeper import refactor

    make_entities(hass)
    path = write_config(hass, "automations.yaml", DOUBLED)
    reloads = reload_services(hass)
    scanner = await make_scanner(hass)
    scanner.refactor.enabled = True
    manager, _ = fake_backup()
    with (
        automation_scanner_state(hass, scanner),
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
    ):
        snapshot = await scanner.async_scan()
        found = await refactor.preview(
            hass, snapshot, "automation.heating", "remove_duplicate_triggers", {}
        )
        assert found["error"] is None and found["source"]["change_count"] == 1
        request = [
            {
                "kind": "refactor_automation",
                "object_id": "automation.heating",
                "fix": "remove_duplicate_triggers",
                "values": {},
            }
        ]
        key = ("automation.heating", "remove_duplicate_triggers", "{}")
        plan = build_plan(
            snapshot, request, datetime.now(UTC), refactor_data={key: found}, refactor_enabled=True
        )
        off = build_plan(snapshot, request, datetime.now(UTC), refactor_data={key: found})
        assert (
            off["actions"][0]["verdict"] == "blocked"
            and "refactor_disabled" in off["actions"][0]["reasons"]
        )
        action = plan["actions"][0]
        assert action["verdict"] == "review", action["reasons"]
        assert action["executable"] is True
        scanner.journal.add(plan)

        before = Path(path).read_text(encoding="utf-8")
        await run(scanner, plan, ["automation.heating"])
        assert len(load_yaml(path)[0]["trigger"]) == 1 and reloads == ["automation"]
        assert plan["actions"][0]["result"]["state"] == "done"
        assert "refactor_applied" in [c["check"] for c in plan["verification"]["checks"]]

        outcome = await scanner.cleanup.undo(plan["plan_id"], None)
        assert outcome["results"][0]["outcome"] == "undone"
        assert Path(path).read_text(encoding="utf-8") == before


async def test_a_blueprint_automation_and_an_invalid_result_are_never_written(
    hass: HomeAssistant,
) -> None:
    from custom_components.ha_housekeeper import refactor

    make_entities(hass)
    blueprint = "- id: auto-1\n  alias: B\n  use_blueprint:\n    path: a/b.yaml\n    input: {}\n"
    write_config(hass, "automations.yaml", blueprint)
    scanner = await make_scanner(hass)
    with automation_scanner_state(hass, scanner):
        snapshot = await scanner.async_scan()
        found = await refactor.preview(
            hass, snapshot, "automation.heating", "add_description", {"description": "x"}
        )
        assert found["error"] == "not_editable" and found["source_reason"] == "blueprint"
        write_config(hass, "automations.yaml", AUTOMATIONS)
        with patch.object(refactor, "is_valid", return_value=False):
            found = await refactor.preview(
                hass, snapshot, "automation.heating", "add_description", {"description": "x"}
            )
        assert found["error"] == "invalid_config"


def test_timeouts_and_modes_are_set_exactly_where_asked() -> None:
    from custom_components.ha_housekeeper import refactor

    item = {
        "id": "a",
        "alias": "Night",
        "mode": "single",
        "trigger": [{"platform": "sun"}],
        "action": [
            {"wait_template": "{{ is_state('light.a', 'off') }}"},
            {"choose": [{"conditions": [], "sequence": [{"wait_for_trigger": [], "timeout": 5}]}]},
            {"if": [], "then": [{"wait_for_trigger": [{"platform": "sun"}]}]},
        ],
    }
    found = {p["fix"]: p for p in refactor.propose(item)}
    assert found["set_timeout"]["count"] == 2 and found["set_timeout"]["paths"] == [
        "action/0",
        "action/2/then/0",
    ]
    new, diff = refactor.apply(item, "set_timeout", {"timeout": 60, "continue_on_timeout": False})
    assert new["action"][0] == {
        "wait_template": item["action"][0]["wait_template"],
        "timeout": 60,
        "continue_on_timeout": False,
    }
    assert new["action"][1] == item["action"][1] and "timeout" not in item["action"][0], (
        "others and the input stay"
    )
    assert [d["path"] for d in diff] == ["action/0/timeout", "action/2/then/0/timeout"]
    assert refactor.applied(new, "set_timeout", {}) and not refactor.applied(
        item, "set_timeout", {}
    )
    for values in ({}, {"timeout": 0}, {"timeout": True}, {"timeout": 86401}):
        with pytest.raises(ValueError, match="invalid_fix"):
            refactor.apply(item, "set_timeout", values)
    with pytest.raises(ValueError, match="nothing_to_do"):
        refactor.apply(new, "set_timeout", {"timeout": 5})

    new, diff = refactor.apply(item, "set_mode", {"mode": "queued", "max": 4})
    assert (new["mode"], new["max"]) == ("queued", 4) and "max" not in item
    new2, _ = refactor.apply(new, "set_mode", {"mode": "restart"})
    assert new2["mode"] == "restart" and "max" not in new2
    assert refactor.applied(new, "set_mode", {"mode": "queued", "max": 4})
    for mode, values, reason in (
        ("single", {"mode": "single"}, "nothing_to_do"),
        ("single", {"mode": "x"}, "invalid_fix"),
        ("single", {"mode": "parallel", "max": 1}, "invalid_fix"),
    ):
        with pytest.raises(ValueError, match=reason):
            refactor.apply({**item, "mode": mode}, "set_mode", values)


def test_refactoring_hints_name_device_triggers_long_delays_and_dead_branches() -> None:
    from custom_components.ha_housekeeper import refactor

    item = {
        "id": "a",
        "alias": "Hints",
        "description": "d",
        "trigger": [{"platform": "device", "device_id": "abc"}],
        "action": [
            {"delay": "00:30:00"},
            {"delay": {"seconds": 20}},
            {"delay": "{{ x }}"},
            {
                "choose": [
                    {
                        "conditions": [
                            {"condition": "state", "entity_id": "x.gone", "state": "on"}
                        ],
                        "sequence": [{"delay": {"hours": 1}}],
                    },
                    {"conditions": [{"condition": "state", "entity_id": "x.here", "state": "on"}]},
                ]
            },
        ],
    }
    found = {p["fix"]: p for p in refactor.propose(item, {"x.here"})}
    assert found["hint_device_trigger"]["paths"] == ["trigger/0"]
    assert found["hint_long_delay"]["paths"] == ["action/0", "action/3/choose/0/sequence/0"]
    assert found["hint_long_delay"]["longest"] == 3600
    assert found["hint_dead_branch"]["paths"] == ["action/3/choose/0"]
    assert found["hint_dead_branch"]["entities"] == ["x.gone"]
    assert "hint_dead_branch" not in {p["fix"] for p in refactor.propose(item)}
    assert not set(found) & set(refactor.FIXES) - {"set_mode"}, "hints have no fix behind them"


NEVER = {
    "rule_id": "automation.never_triggered",
    "object_id": "automation.heating",
    "classification": "unused",
    "confidence": 0.6,
    "first_detected_at": None,
    "evidence": [],
}


async def test_an_unused_automation_is_removed_from_its_file_and_the_undo_puts_the_file_back(
    hass: HomeAssistant,
) -> None:
    from custom_components.ha_housekeeper import automation_delete

    make_entities(hass)
    path = write_config(hass, "automations.yaml", AUTOMATIONS)
    reloads = reload_services(hass)
    scanner = await make_scanner(hass)
    manager, _ = fake_backup()
    hygiene = "custom_components.ha_housekeeper.inventory.automation_hygiene_findings"
    with (
        automation_scanner_state(hass, scanner),
        patch(hygiene, lambda *args: [dict(NEVER)]),
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
    ):
        snapshot = await scanner.async_scan()
        found = await automation_delete.preview(hass, snapshot, "automation.heating")
        assert found["error"] is None and "alias: Heating" in found["text"]
        request = [{"kind": "delete_automation", "object_id": "automation.heating"}]
        plan = build_plan(
            snapshot,
            request,
            datetime.now(UTC),
            delete_data={"automation.heating": found},
        )
        action = plan["actions"][0]
        assert action["verdict"] == "review" and action["executable"], action["reasons"]
        assert (
            action["reasons"] == ["deletes_config"]
            and plan["simulation"]["automations_deleted"] == 1
        )
        scanner.journal.add(plan)

        before = Path(path).read_text(encoding="utf-8")
        await run(scanner, plan, ["automation.heating"])
        text = Path(path).read_text(encoding="utf-8")
        assert "auto-1" not in text and "auto-2" in text and reloads == ["automation"]
        assert plan["actions"][0]["result"]["state"] == "done"
        assert "automation_gone" in [c["check"] for c in plan["verification"]["checks"]]

        outcome = await scanner.cleanup.undo(plan["plan_id"], None)
        assert outcome["results"][0]["outcome"] == "undone"
        assert Path(path).read_text(encoding="utf-8") == before

        # an automation without such a finding, or one that is not in the file, is never offered
        not_listed = build_plan(
            {**snapshot, "findings": []},
            request,
            datetime.now(UTC),
            delete_data={"automation.heating": found},
        )
        assert "not_a_candidate" in not_listed["actions"][0]["reasons"]
        missing = build_plan(
            snapshot,
            request,
            datetime.now(UTC),
            delete_data={"automation.heating": {"error": "not_in_yaml", "fingerprint": None}},
        )
        assert missing["actions"][0]["verdict"] == "blocked"
        assert "not_in_yaml" in missing["actions"][0]["reasons"]


PLAIN_AUTOMATIONS = """\
- id: auto-1
  alias: Heating
  trigger:
  - platform: state
    entity_id: sensor.old_temp
  action:
  - service: notify.me
"""


async def test_renaming_an_entity_rewrites_the_file_verifies_and_undoes_both(
    hass: HomeAssistant,
) -> None:
    from custom_components.ha_housekeeper.rename import prepare

    registry = er.async_get(hass)
    registry.async_get_or_create("sensor", "test", "old", suggested_object_id="old_temp")
    hass.states.async_set(OLD, "21")
    path = write_config(hass, "automations.yaml", PLAIN_AUTOMATIONS)
    reloads = reload_services(hass)
    scanner = await make_scanner(hass)
    manager, create = fake_backup()
    with (
        automation_scanner_state(hass, scanner),
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
    ):
        snapshot = await scanner.async_scan()

        def make(target: str, text: str | None = None):
            return prepare(hass, snapshot, OLD, target)

        found = await make(NEW)
        plan = build_plan(
            snapshot,
            [{"kind": "rename_entity", "object_id": OLD, "target": NEW}],
            datetime.now(UTC),
            rename_data={(OLD, NEW): found},
        )
        action = plan["actions"][0]
        assert action["verdict"] == "review" and action["executable"] is True
        assert action["sources"][0]["change_count"] == 1
        scanner.journal.add(plan)

        # A taken or foreign ID is never allowed.
        hass.states.async_set("sensor.taken", "1")
        blocked = [
            build_plan(
                snapshot,
                [{"kind": "rename_entity", "object_id": OLD, "target": t}],
                datetime.now(UTC),
                rename_data={(OLD, t): await prepare(hass, snapshot, OLD, t)},
            )["actions"][0]["reasons"]
            for t in ("sensor.taken", "light.other", "Bad Id")
        ]
        assert blocked[0][0] == "target_taken" and blocked[1][0] == "bad_new_id"
        assert blocked[2][0] == "bad_new_id"

        before = Path(path).read_text(encoding="utf-8")
        await run(scanner, plan, [OLD])
        create.assert_awaited_once()
        assert registry.async_get(NEW) is not None and registry.async_get(OLD) is None
        assert load_yaml(path)[0]["trigger"][0]["entity_id"] == NEW
        checks = {c["check"]: c["ok"] for c in plan["verification"]["checks"]}
        # The scanner stub keeps naming the old ID, so only the registry check can be true here.
        assert checks["entity_renamed"] is True and "references_replaced" in checks

        hass.states.async_remove(OLD)  # the old state goes when the real entity re-registers
        outcome = await scanner.cleanup.undo(plan["plan_id"], None)
        assert outcome["results"] == [{"object_id": OLD, "outcome": "undone"}]
        assert registry.async_get(OLD) is not None and registry.async_get(NEW) is None
        assert Path(path).read_text(encoding="utf-8") == before
        assert reloads == ["automation", "automation"]


async def test_a_rename_with_a_template_mention_is_blocked(hass: HomeAssistant) -> None:
    from custom_components.ha_housekeeper.rename import prepare

    make_entities(hass)
    write_config(hass, "automations.yaml", AUTOMATIONS)
    reload_services(hass)
    scanner = await make_scanner(hass)
    with automation_scanner_state(hass, scanner):
        snapshot = await scanner.async_scan()
        target = "sensor.fresh_temp"
        plan = build_plan(
            snapshot,
            [{"kind": "rename_entity", "object_id": OLD, "target": target}],
            datetime.now(UTC),
            rename_data={(OLD, target): await prepare(hass, snapshot, OLD, target)},
        )
    action = plan["actions"][0]
    assert action["verdict"] == "blocked" and "rename_templates" in action["reasons"]


def test_scenes_created_by_an_action_are_recognised() -> None:
    from custom_components.ha_housekeeper.inventory import runtime_scene_ids

    config = {
        "actions": [
            {"if": [], "then": [{"action": "scene.create", "data": {"scene_id": "before"}}]},
            {"action": "scene.create", "data": {"scene_id": "{{ x }}"}},
        ]
    }
    assert runtime_scene_ids(config) == {"scene.before"}
