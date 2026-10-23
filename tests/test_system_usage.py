"""Storage and system: sizes on disk, Supervisor answers, card and blueprint sizes."""

from __future__ import annotations

import asyncio
import os
from unittest.mock import patch

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")

from homeassistant.core import HomeAssistant  # noqa: E402

from custom_components.ha_housekeeper import system_usage as module  # noqa: E402
from custom_components.ha_housekeeper.system_usage import (  # noqa: E402
    blueprint_sizes,
    card_path,
    card_sizes,
    card_status,
    disk_categories,
    element_names,
    host_disk,
    merge_cards,
    storage_breakdown,
    system_usage,
)


def write(path, size: int) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as file:
        file.write(b"x" * size)


def test_breakdown_sums_the_database_with_its_journal_and_lists_custom_integrations(
    tmp_path,
) -> None:
    write(tmp_path / "home-assistant_v2.db", 100)
    write(tmp_path / "home-assistant_v2.db-wal", 20)
    write(tmp_path / "custom_components" / "a" / "x.py", 50)
    write(tmp_path / "custom_components" / "b" / "y.py", 70)
    write(tmp_path / "custom_components" / "__pycache__" / "z.pyc", 999)
    result = storage_breakdown(str(tmp_path))
    by_id = {item["id"]: item["bytes"] for item in result["breakdown"]}
    assert by_id["recorder_db"] == 120
    assert by_id["custom_components"] == 70 + 50 + 999
    assert "media" not in by_id, "empty or missing places are left out"
    assert [c["domain"] for c in result["custom_integrations"]] == ["b", "a"]


def test_unlisted_entries_under_config_are_named_and_the_rest_is_summed(tmp_path) -> None:
    write(tmp_path / "home-assistant_v2.db", 10)
    write(tmp_path / "www" / "a.js", 10)
    write(tmp_path / ".storage" / "core", 300)
    write(tmp_path / "packages" / "p.yaml", 40)
    write(tmp_path / "notes.txt", 5)
    result = storage_breakdown(str(tmp_path))
    assert [(e["name"], e["dir"], e["bytes"]) for e in result["other"]] == [
        (".storage", True, 300),
        ("packages", True, 40),
        ("notes.txt", False, 5),
    ]
    assert result["other_rest"] == {"count": 0, "bytes": 0}


def test_card_paths_stay_inside_the_configuration(tmp_path) -> None:
    config = str(tmp_path)
    assert card_path(config, "/local/card.js?v=1").endswith(os.path.join("www", "card.js"))
    assert card_path(config, "/hacsfiles/x/x.js").endswith(
        os.path.join("www", "community", "x", "x.js")
    )
    assert card_path(config, "https://cdn.example/x.js") is None
    assert card_path(config, "/local/../../etc/passwd") is None


def test_card_sizes_count_the_folder_of_a_hacs_card(tmp_path) -> None:
    write(tmp_path / "www" / "community" / "card" / "card.js", 30)
    write(tmp_path / "www" / "community" / "card" / "card.js.gz", 10)
    write(tmp_path / "www" / "own.js", 5)
    sizes = card_sizes(
        str(tmp_path), ["/hacsfiles/card/card.js", "/local/own.js", "/local/gone.js"]
    )
    assert (
        sizes["/hacsfiles/card/card.js"]["bytes"] == 40
        and sizes["/hacsfiles/card/card.js"]["scope"] == "folder"
    )
    assert {k: sizes["/local/own.js"][k] for k in ("bytes", "scope", "path")} == {
        "bytes": 5,
        "scope": "file",
        "path": str((tmp_path / "www" / "own.js").resolve()),
    }
    assert sizes["/local/gone.js"]["bytes"] is None


def test_cards_are_taken_out_of_www_so_nothing_counts_twice(tmp_path) -> None:
    config = str(tmp_path)
    www = os.path.realpath(os.path.join(config, "www"))
    breakdown = [
        {"id": "www", "path": "www", "bytes": 100},
        {"id": "themes", "path": "themes", "bytes": 10},
    ]
    cards = [
        {"bytes": 40, "path": os.path.join(www, "community", "card")},
        {"bytes": 40, "path": os.path.join(www, "community", "card")},  # two resources of one card
    ]
    assert merge_cards(breakdown, cards, config) == 40
    assert {i["id"]: i["bytes"] for i in breakdown} == {"www": 60, "custom_cards": 40, "themes": 10}


def test_blueprint_sizes_stay_inside_the_blueprints_folder(tmp_path) -> None:
    write(tmp_path / "blueprints" / "automation" / "me" / "a.yaml", 12)
    sizes = blueprint_sizes(
        str(tmp_path), [("automation", "me/a.yaml"), ("automation", "../../secrets.yaml")]
    )
    assert sizes == [12, None]


def test_supervisor_answers_become_disk_and_categories() -> None:
    disk = host_disk({"disk_total": 2.0, "disk_used": 1.5, "disk_free": 0.5})
    assert (
        disk["total"] == 2 * 1024**3 and disk["percent"] == 75.0 and disk["source"] == "supervisor"
    )
    assert host_disk({}) == {}
    categories, apps = disk_categories(
        {
            "total_bytes": 1000,
            "used_bytes": 600,
            "children": [
                {"id": "system", "label": "System", "used_bytes": 300},
                {
                    "id": "addons_data",
                    "label": "Apps",
                    "used_bytes": 200,
                    "children": [{"id": "core_ssh", "used_bytes": 150}],
                },
                {
                    "id": "addons_config",
                    "label": "App config",
                    "used_bytes": 100,
                    "children": [{"id": "core_ssh", "used_bytes": 5}],
                },
                {"id": "broken"},
            ],
        }
    )
    assert [c["id"] for c in categories["children"]] == ["system", "addons_data", "addons_config"]
    assert apps == {"core_ssh": {"data": 150, "config": 5}}


async def test_system_usage_without_a_supervisor(hass: HomeAssistant, tmp_path) -> None:
    hass.config.config_dir = str(tmp_path)
    write(tmp_path / "themes" / "t.yaml", 9)
    with (
        patch.dict(os.environ, {}, clear=False),
        patch.object(module, "cpu_percent", return_value=12.5),
    ):
        os.environ.pop("SUPERVISOR_TOKEN", None)
        result = await system_usage(hass)
    assert result["supervisor"] is False and result["apps"] == [] and result["categories"] == {}
    assert result["cpu"]["percent"] == 12.5
    assert result["disk"]["source"] == "filesystem" and result["disk"]["total"] > 0
    assert {"id": "themes", "path": "themes", "bytes": 9} in result["breakdown"]
    assert all("path" not in card for card in result["cards"]), "no absolute paths leave the server"


async def test_the_folder_walk_is_reused_and_a_refresh_waits_for_the_gap(
    hass: HomeAssistant, tmp_path
) -> None:
    """Two pages, two browsers or a pressed button must not walk the disk again and again."""
    hass.config.config_dir = str(tmp_path)
    walks = []
    real = module.storage_breakdown

    def counting(config_dir: str, budget=None) -> dict:
        walks.append(config_dir)
        return real(config_dir, budget)

    with (
        patch.dict(os.environ, {}, clear=False),
        patch.object(module, "cpu_percent", return_value=1.0),
        patch.object(module, "storage_breakdown", counting),
    ):
        os.environ.pop("SUPERVISOR_TOKEN", None)
        first = await system_usage(hass)
        second = await system_usage(hass)
        refreshed = await system_usage(hass, fresh=True)
        assert len(walks) == 1, "the second call and a refresh inside the gap reuse the walk"
        assert first["cached"] is False and second["cached"] is True and refreshed["cached"] is True
        assert second["read_at"] == first["read_at"]
        with patch.object(module, "WALK_MIN_GAP", 0):
            again = await system_usage(hass, fresh=True)
        assert len(walks) == 2 and again["cached"] is False
        with patch.object(module, "WALK_MAX_AGE", 0), patch.object(module, "WALK_MIN_GAP", 0):
            await system_usage(hass)
        assert len(walks) == 3, "an old walk is not reused"


async def test_a_quick_first_visit_answers_at_once_and_reads_behind_it(
    hass: HomeAssistant, tmp_path
) -> None:
    hass.config.config_dir = str(tmp_path)
    write(tmp_path / "themes" / "t.yaml", 9)
    with (
        patch.dict(os.environ, {}, clear=False),
        patch.object(module, "cpu_percent", return_value=1.0),
    ):
        os.environ.pop("SUPERVISOR_TOKEN", None)
        first = await system_usage(hass, quick=True)
        assert first["pending"] is True and first["stale"] is True and first["breakdown"] == []
        assert first["cpu"]["percent"] == 1.0
        await hass.async_block_till_done()
        second = await system_usage(hass, quick=True)
    assert second["pending"] is False and second["cached"] is True
    assert {"id": "themes", "path": "themes", "bytes": 9} in second["breakdown"]


async def test_the_folder_walk_runs_beside_the_supervisor(hass: HomeAssistant, tmp_path) -> None:
    """The page waits for the slower of the two, not for both one after the other."""
    hass.config.config_dir = str(tmp_path)
    walked = asyncio.Event()
    real = module.storage_breakdown

    def signalling(config_dir: str, budget=None) -> dict:
        hass.loop.call_soon_threadsafe(walked.set)
        return real(config_dir, budget)

    async def supervisor(_hass, *_args) -> dict:
        await asyncio.wait_for(walked.wait(), 5)
        return {"available": False}

    with (
        patch.object(module, "cpu_percent", return_value=1.0),
        patch.object(module, "storage_breakdown", signalling),
        patch.object(module, "supervisor_part", supervisor),
    ):
        result = await system_usage(hass)
    assert result["cached"] is False


async def test_the_disk_usage_of_the_supervisor_is_reused(hass: HomeAssistant, tmp_path) -> None:
    """The Supervisor walks the whole data disk for it; a second visit must not ask again."""
    hass.config.config_dir = str(tmp_path)
    asked = []

    async def answer(_hass, path, **_kwargs):
        asked.append(path)
        return {"used_bytes": 1, "children": [{"id": "system", "used_bytes": 1}]}

    with (
        patch.object(module, "cpu_percent", return_value=1.0),
        patch.object(module, "supervisor_token", return_value="t"),
        patch.object(module, "supervisor_get", answer),
    ):
        await system_usage(hass)
        await system_usage(hass)
        await system_usage(hass, fresh=True)
        assert asked.count("/host/disks/default/usage") == 1, "reused, a refresh waits for the gap"
        with patch.object(module, "WALK_MIN_GAP", 0):
            await system_usage(hass, fresh=True)
        assert asked.count("/host/disks/default/usage") == 2


async def test_an_opened_page_gets_the_kept_sizes_at_once(hass: HomeAssistant, tmp_path) -> None:
    """Old sizes come back at once and flagged; the next ordinary call reads them again."""
    hass.config.config_dir = str(tmp_path)
    walks = []
    real = module.storage_breakdown

    def counting(config_dir: str, budget=None) -> dict:
        walks.append(config_dir)
        return real(config_dir, budget)

    with (
        patch.dict(os.environ, {}, clear=False),
        patch.object(module, "cpu_percent", return_value=1.0),
        patch.object(module, "storage_breakdown", counting),
    ):
        os.environ.pop("SUPERVISOR_TOKEN", None)
        await system_usage(hass)
        assert len(walks) == 1
        with patch.object(module, "WALK_MAX_AGE", 0), patch.object(module, "WALK_MIN_GAP", 0):
            kept = await system_usage(hass, quick=True)
            assert len(walks) == 1 and kept["stale"] is True and kept["cached"] is True
            again = await system_usage(hass)
        assert len(walks) == 2 and again["stale"] is False


async def test_a_walk_over_its_time_limit_stops_and_says_so(hass: HomeAssistant, tmp_path) -> None:
    """A slow disk must not hold the page: the sizes are minimums and the result is flagged."""
    hass.config.config_dir = str(tmp_path)
    (tmp_path / "www").mkdir()
    (tmp_path / "www" / "a.js").write_text("x" * 9)
    with (
        patch.dict(os.environ, {}, clear=False),
        patch.object(module, "cpu_percent", return_value=1.0),
        patch.object(module, "WALK_BUDGET", -1),
    ):
        os.environ.pop("SUPERVISOR_TOKEN", None)
        result = await system_usage(hass)
    assert result["truncated"] is True and result["breakdown"] == []


async def test_apps_become_objects_and_a_stopped_app_is_no_problem(hass: HomeAssistant) -> None:
    from custom_components.ha_housekeeper import inventory

    listing = {
        "addons": [
            {"slug": "core_ssh", "name": "SSH", "version": "1.0", "state": "started"},
            {"slug": "x", "name": "X", "state": "stopped", "update_available": True},
            {"name": "no slug"},
        ]
    }
    with (
        patch.object(inventory, "supervisor_token", return_value="t"),
        patch.object(inventory, "supervisor_get", return_value=listing),
    ):
        apps = await inventory._app_inventory(hass)
    assert [(a["object_type"], a["object_id"], a["status"]) for a in apps] == [
        ("app", "core_ssh", "active"),
        ("app", "x", "stopped"),
    ]
    assert apps[1]["update_available"] is True
    with patch.object(inventory, "supervisor_token", return_value=None):
        assert await inventory._app_inventory(hass) == []


def test_a_card_script_is_judged_by_the_element_names_it_defines(tmp_path) -> None:
    (tmp_path / "www" / "community" / "c").mkdir(parents=True)
    script = tmp_path / "www" / "community" / "c" / "c.js"
    script.write_text('x();customElements.define("foo-card",A);customElements.define(e,B)')
    mini = tmp_path / "www" / "mini.js"
    mini.write_text("customElements.define(n,t)")
    assert element_names(str(script)) == ["foo-card"] and element_names(str(mini)) == []

    sizes = card_sizes(str(tmp_path), ["/hacsfiles/c/c.js", "/local/mini.js", "/local/gone.js"])
    status = {url: card_status(card, {"foo-card"}) for url, card in sizes.items()}
    assert status == {
        "/hacsfiles/c/c.js": "used",
        "/local/mini.js": "unknown",
        "/local/gone.js": "missing",
    }
    assert card_status(sizes["/hacsfiles/c/c.js"], {"bar-card"}) == "unused"
    assert card_status(sizes["/hacsfiles/c/c.js"], None) == "unknown"
    assert card_status({"local": False}, set()) == "external"
