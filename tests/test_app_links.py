"""Which integrations hang on which app: by host name or by the Supervisor's own entry."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

pytest.importorskip("homeassistant")

from custom_components.ha_housekeeper.app_links import app_edges  # noqa: E402


def _entry(entry_id, domain, title="", source="user", data=None, options=None):
    return SimpleNamespace(
        entry_id=entry_id,
        domain=domain,
        title=title,
        source=source,
        data=data or {},
        options=options or {},
    )


def test_links_by_host_name_and_by_source_but_never_by_name_alone() -> None:
    apps = [
        {"slug": "ccab4aaf_frigate"},
        {"slug": "a0d7b954_adguard"},
        {"slug": "5c53de3b_esphome"},
        {"slug": "core_mosquitto"},
    ]
    entries = [
        _entry("e1", "frigate", "ccab4aaf-frigate:5000"),
        _entry("e2", "adguard", "AdGuard", source="hassio"),
        _entry("e3", "esphome", "ESPHome", source="zeroconf"),
        _entry("e4", "mqtt", "localhost", data={"broker": "core-mosquitto", "password": "x"}),
        _entry("e5", "other", "x", data={"url": "http://notcore-mosquitto-2:80"}),
        _entry("e6", "frigate", "ignored", source="ignore", data={"h": "ccab4aaf-frigate"}),
        _entry("e7", "numbered", 12345),  # a title that is a number must not stop the scan
    ]
    edges = {(e["source"], e["target"]) for e in app_edges(entries, apps)}
    assert edges == {
        ("config_entry:e1", "app:ccab4aaf_frigate"),
        ("config_entry:e2", "app:a0d7b954_adguard"),
        ("config_entry:e4", "app:core_mosquitto"),
    }
    assert all(e["confidence"] == "probable" for e in app_edges(entries, apps))


def test_a_stopped_app_is_a_finding_only_when_a_linked_integration_has_failed() -> None:
    from custom_components.ha_housekeeper.app_links import stopped_app_findings

    apps = [
        {"slug": "a_tail", "object_id": "a_tail", "status": "stopped"},
        {"slug": "b_run", "object_id": "b_run", "status": "active"},
        {"slug": "c_idle", "object_id": "c_idle", "status": "stopped"},
    ]
    integrations = [
        {"object_id": "e1", "status": "problem"},
        {"object_id": "e2", "status": "problem"},
        {"object_id": "e3", "status": "active"},
    ]
    edges = [
        {"source": f"config_entry:{e}", "target": f"app:{a}", "relation": "CONNECTED"}
        for e, a in (("e1", "a_tail"), ("e2", "b_run"), ("e3", "c_idle"))
    ]
    found = stopped_app_findings(apps, integrations, edges)
    assert [(f["object_id"], f["affected_object"]) for f in found] == [("a_tail", "e1")]


def test_a_config_entry_that_is_not_loaded_is_a_finding_graded_by_how_long() -> None:
    from datetime import UTC, datetime, timedelta

    from custom_components.ha_housekeeper.inventory import _config_entry_findings

    now = datetime(2026, 10, 12, 12, tzinfo=UTC)

    def item(entry_id, state, status, hours):
        return {
            "object_id": entry_id,
            "state": state,
            "status": status,
            "error": "boom",
            "status_since": (now - timedelta(hours=hours)).isoformat(),
        }

    found = _config_entry_findings(
        [
            item("old", "setup_retry", "problem", 5),
            item("day", "setup_retry", "problem", 30),
            item("week", "setup_retry", "problem", 24 * 8),
            item("fresh", "setup_error", "problem", 0.2),
            item("fine", "loaded", "active", 9),
            item("off", "not_loaded", "disabled", 9),
            {**item("new", "setup_error", "problem", 9), "status_since": None},
        ],
        now,
        (15, 1, 24, 168),
    )
    assert {f["object_id"]: f["outage_level"] for f in found} == {
        "old": "low",
        "day": "medium",
        "week": "high",
        "fresh": "medium",  # an error that does not heal on its own is at least medium
    }
    young = _config_entry_findings(
        [item("retry", "setup_retry", "problem", 0.1)], now, (15, 1, 24, 168)
    )
    assert young == [], "a retry that is still running is no finding before the first threshold"


def test_an_entry_that_asks_for_a_new_login_is_a_finding_at_once_and_instead_of_not_loaded() -> (
    None
):
    from datetime import UTC, datetime

    from custom_components.ha_housekeeper.impact import apply_impact
    from custom_components.ha_housekeeper.inventory import _config_entry_findings

    now = datetime(2026, 10, 12, 12, tzinfo=UTC)

    def item(entry_id, state):
        return {
            "object_id": entry_id,
            "state": state,
            "status": "problem",
            "reauth": True,
            "status_since": now.isoformat(),
        }

    found = _config_entry_findings(
        [item("loaded", "loaded"), item("failed", "setup_error")], now, (15, 1, 24, 168)
    )
    assert [(f["object_id"], f["rule_id"]) for f in found] == [
        ("loaded", "config_entry.reauth"),
        ("failed", "config_entry.reauth"),
    ]
    objects = [{"object_type": "config_entry", "object_id": "loaded", "status": "problem"}]
    apply_impact(objects, [], found[:1])
    assert found[0]["impact"] == "medium", "it never starts quiet"


def test_an_entry_that_auto_pause_disabled_stays_a_finding_from_where_its_outage_began() -> None:
    from datetime import UTC, datetime, timedelta

    from custom_components.ha_housekeeper.inventory import _config_entry_findings

    now = datetime(2026, 10, 24, 12, tzinfo=UTC)
    off = {"object_id": "e1", "state": "not_loaded", "status": "disabled", "status_since": None}
    began = (now - timedelta(hours=30)).isoformat()

    found = _config_entry_findings([off], now, (15, 1, 24, 168), None, {"e1": began})

    assert [(f["object_id"], f["first_detected_at"], f["outage_level"]) for f in found] == [
        ("e1", began, "medium")
    ]
    assert _config_entry_findings([off], now, (15, 1, 24, 168), None, {}) == []
