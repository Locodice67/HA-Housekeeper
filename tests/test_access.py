"""System access, data flow and the rights of the apps: classification and the WebSocket command."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")

from homeassistant.core import HomeAssistant  # noqa: E402
from homeassistant.helpers import entity_registry as er  # noqa: E402
from pytest_homeassistant_custom_component.common import MockConfigEntry  # noqa: E402
from scanner_entry import attach_scanner  # noqa: E402

from custom_components.ha_housekeeper import access as module  # noqa: E402
from custom_components.ha_housekeeper.access import (  # noqa: E402
    access_report,
    classify,
    classify_app,
    matches,
)
from custom_components.ha_housekeeper.const import DOMAIN  # noqa: E402
from custom_components.ha_housekeeper.inventory import InventoryScanner  # noqa: E402

PASSWORD = "p4ss-SECRET"


@pytest.fixture(autouse=True)
def _enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Allow loading the integration from custom_components."""


def test_domain_tokens_match_whole_parts_only() -> None:
    assert matches("alexa_media", "alexa")
    assert matches("google_generative_ai_conversation", "google_generative")
    assert matches("zha", "zha")
    assert not matches("metalexa", "alexa")
    assert not matches("tuya_cloud", "cloud"), "generic words only match the whole domain"
    assert not matches("metoffice", "met")
    assert matches("cloud", "cloud")


def test_classify_risk_follows_access_location_and_cloud() -> None:
    assert classify("zha", "local_polling", set())["risk"] == "high"
    assert classify("hassio", None, set())["access"] == [
        {"kind": "system_root", "detail": "Supervisor"}
    ]
    assert classify("mobile_app", "local_push", {"device_tracker"})["gps"] is True
    dwd = classify("dwd_weather", "cloud_polling", {"weather"})
    assert dwd["external"] and dwd["risk"] == "medium" and not dwd["access"]
    assert classify("reolink", "local_push", {"camera"})["risk"] == "high"
    assert classify("hue", "local_push", {"light"})["risk"] == "low"
    assert classify("zha", "local_polling", {"device_tracker"})["risk_reasons"] == ["radio", "gps"]
    assert classify("dwd_weather", "cloud_polling", set())["risk_reasons"] == ["cloud"]
    assert classify("hue", "local_push", {"light"})["risk_reasons"] == []


def test_router_trackers_are_presence_not_a_location() -> None:
    fritz = classify("fritz", "local_polling", {"device_tracker"}, {"router"})
    assert not fritz["gps"] and fritz["presence"] and fritz["risk"] == "low"
    assert classify("x", "local_push", {"device_tracker"}, {"gps"})["risk"] == "high"
    assert classify("x", "local_push", {"device_tracker"}, {"router", "unknown"})["gps"]
    assert classify("usgs", "cloud_polling", {"geo_location"})["gps"] is False


def test_more_radios_cameras_and_local_models_are_known() -> None:
    assert classify("bluetooth", "local_push", set())["risk_reasons"] == ["radio"]
    assert classify("frigate", "local_push", set())["access"][0]["kind"] == "camera"
    assert classify("ollama", "local_polling", set())["flows"] == ["local"]


def test_custom_code_is_at_least_medium() -> None:
    plain = classify("my_thing", "local_push", {"light"}, custom=True)
    assert plain["risk"] == "medium" and plain["risk_reasons"] == ["custom_code"]
    assert classify("my_cam", "local_push", {"camera"}, custom=True)["risk"] == "high"


async def test_access_report_on_config_entries(hass: HomeAssistant) -> None:
    MockConfigEntry(domain="alexa_media", title="Alexa", data={"password": PASSWORD}).add_to_hass(
        hass
    )
    tracker = MockConfigEntry(domain="mobile_app", title="Phone")
    tracker.add_to_hass(hass)
    er.async_get(hass).async_get_or_create(
        "device_tracker", "mobile_app", "p1", config_entry=tracker
    )
    MockConfigEntry(domain="hue", title="Ignored", source="ignore").add_to_hass(hass)

    report = await access_report(hass)
    by_domain = {item["domain"]: item for item in report["entries"]}
    assert "hue" not in by_domain, "ignored discoveries are left out"
    assert by_domain["mobile_app"]["risk"] == "high" and by_domain["mobile_app"]["gps"]
    assert by_domain["alexa_media"]["external"]
    assert report["entries"][0]["risk"] == "high", "the riskiest come first"
    assert PASSWORD not in json.dumps(report), "no credential is read"


async def test_access_needs_an_administrator(
    hass: HomeAssistant, hass_ws_client, hass_read_only_access_token
) -> None:
    from homeassistant.setup import async_setup_component

    from custom_components.ha_housekeeper import async_setup

    assert await async_setup(hass, {})
    attach_scanner(hass, InventoryScanner(hass))
    assert await async_setup_component(hass, "websocket_api", {})
    client = await hass_ws_client(hass, hass_read_only_access_token)
    for command in ("access", "system_usage", "system_light"):
        await client.send_json_auto_id({"type": f"{DOMAIN}/{command}"})
        answer = await client.receive_json()
        assert answer["success"] is False and answer["error"]["code"] == "unauthorized", command


def test_classify_app_levels_follow_the_rights() -> None:
    ssh = classify_app(
        {
            "full_access": True,
            "privileged": ["SYS_ADMIN"],
            "hassio_api": True,
            "hassio_role": "manager",
            "apparmor": False,
        }
    )
    kinds = {a["kind"]: a for a in ssh["access"]}
    assert ssh["risk"] == "high"
    assert kinds["privileged"]["detail"] == "SYS_ADMIN"
    assert kinds["supervisor_api"] == {
        "kind": "supervisor_api",
        "detail": "manager",
        "level": "high",
    }
    assert kinds["apparmor_off"]["level"] == "medium"
    broker = classify_app({"host_network": True, "homeassistant_api": True, "apparmor": "default"})
    assert broker["risk"] == "medium" and {a["kind"] for a in broker["access"]} == {
        "host_network",
        "ha_api",
    }
    assert (
        classify_app({"hassio_api": True, "hassio_role": "default"})["access"][0]["level"]
        == "medium"
    )
    assert classify_app({"usb": True, "devices": ["/dev/ttyUSB0"]})["risk"] == "low"
    assert classify_app({}) == {"access": [], "risk": "low"}


def test_app_protection_ports_and_origin() -> None:
    from custom_components.ha_housekeeper.access import app_origin

    off = classify_app({"protected": False, "network": {"1883/tcp": 1883, "8080/tcp": None}})
    assert off["risk"] == "high"
    assert {"kind": "ports", "detail": "1883", "level": "medium"} in off["access"]
    assert classify_app({"host_network": True, "network": {"80/tcp": 80}})["access"] == [
        {"kind": "host_network", "detail": None, "level": "medium"}
    ]
    assert app_origin({"repository": "a0d7b954", "stage": "experimental"}) == {
        "origin": "community",
        "stage": "experimental",
    }
    assert app_origin({"repository": "core", "stage": "stable"})["origin"] == "core"


async def test_inbound_paths_name_the_ways_in(hass: HomeAssistant) -> None:
    from types import SimpleNamespace

    from custom_components.ha_housekeeper.access import inbound_paths

    hass.config.components.add("cloud")
    prefs = SimpleNamespace(remote_enabled=True)
    hass.data["cloud"] = SimpleNamespace(client=SimpleNamespace(prefs=prefs), is_logged_in=True)
    apps = [
        {"slug": "9074a9fa_cloudflared", "name": "Cloudflared", "state": "started"},
        {"slug": "a0d7b954_tailscale", "name": "Tailscale", "state": "started"},
        {"slug": "core_mosquitto", "name": "Mosquitto", "state": "started"},
    ]
    entries = [{"domain": "mcp_server", "title": "MCP", "disabled": False}]
    hooks = [{"local_only": False, "enabled": True}]
    found = {i["kind"]: i for i in inbound_paths(hass, entries, apps, hooks)}
    assert set(found) == {"nabu_casa", "tunnel", "vpn", "mcp_server", "webhooks"}
    assert found["nabu_casa"]["state"] == "on" and found["tunnel"]["level"] == "warn"
    assert found["vpn"]["level"] == "ok" and found["webhooks"]["count"] == 1


async def test_apps_report_reads_every_app_and_marks_one_without_answer(
    hass: HomeAssistant,
) -> None:
    answers = {
        "/addons": {
            "addons": [
                {"slug": "core_ssh", "name": "SSH"},
                {"slug": "broken", "name": "Broken"},
                {"name": "no slug"},
            ]
        },
        "/addons/core_ssh/info": {
            "name": "Advanced SSH",
            "state": "started",
            "version": "1",
            "full_access": True,
        },
        "/addons/broken/info": None,
    }

    async def fake(_hass, path, **_kwargs):
        return answers[path]

    with (
        patch.object(module, "supervisor_token", return_value="t"),
        patch.object(module, "supervisor_get", fake),
    ):
        report = await module.apps_report(hass)
    assert report["available"] is True
    assert [a["slug"] for a in report["apps"]] == ["core_ssh", "broken"], (
        "the riskiest first, the unchecked last"
    )
    assert report["apps"][0]["name"] == "Advanced SSH" and report["apps"][0]["risk"] == "high"
    assert report["apps"][1]["checked"] is False and report["apps"][1]["risk"] is None

    with patch.object(module, "supervisor_token", return_value=None):
        assert await module.apps_report(hass) == {"available": False, "apps": []}
        result = await access_report(hass)
    assert result["apps_available"] is False and result["apps"] == []


def test_webhooks_are_open_unless_local_only_and_never_show_the_id() -> None:
    from custom_components.ha_housekeeper.access import webhook_triggers

    def automation(object_id, trigger, status="active"):
        return {
            "object_type": "automation",
            "object_id": object_id,
            "name": object_id,
            "status": status,
            "triggers": [trigger],
        }

    found = webhook_triggers(
        [
            automation("automation.a", {"trigger": "webhook", "webhook_id": "SECRET-1"}),
            automation(
                "automation.b",
                {"platform": "webhook", "webhook_id": "SECRET-2", "local_only": False},
            ),
            automation("automation.c", {"trigger": "state", "entity_id": "light.x"}),
            {
                **automation("automation.d", {"trigger": "webhook", "webhook_id": "SECRET-3"}),
                "triggers": [
                    {"trigger": "webhook", "webhook_id": "SECRET-3"},
                    {"trigger": "webhook", "webhook_id": "SECRET-4", "local_only": False},
                ],
            },
        ]
    )
    # One row per automation; a later open trigger makes the whole row open.
    assert [(w["object_id"], w["local_only"]) for w in found] == [
        ("automation.b", False),
        ("automation.d", False),
        ("automation.a", True),
    ]
    assert "SECRET" not in str(found)
