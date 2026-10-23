"""HACS data: installed and newest version of the integrations HACS installed."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

pytest.importorskip("homeassistant")

from custom_components.ha_housekeeper.hacs import (  # noqa: E402
    blocked_repository_ids,
    hacs_by_domain,
    hacs_repositories,
    store_kind,
)


def repo(**data):
    base = {
        "category": "integration",
        "installed": True,
        "domain": "demo",
        "id": 7,
        "full_name": "me/demo",
    }
    return SimpleNamespace(data=SimpleNamespace(**{**base, **data}))


def test_installed_integrations_by_domain_with_pending_update() -> None:
    old = repo(installed_version="1.0", last_version="1.1")
    skipped = [repo(category="plugin"), repo(installed=False, domain="other"), repo(domain=None)]
    hass = SimpleNamespace(
        data={"hacs": SimpleNamespace(repositories=SimpleNamespace(list_all=[old, *skipped]))}
    )
    found = hacs_by_domain(hass)
    assert list(found) == ["demo"]
    assert found["demo"]["pending_update"] is True
    assert found["demo"]["available_version"] == "1.1" and found["demo"]["id"] == "7"


def test_without_hacs_or_with_an_unknown_layout_the_answer_is_none() -> None:
    assert hacs_by_domain(SimpleNamespace(data={})) is None
    assert hacs_by_domain(SimpleNamespace(data={"hacs": object()})) is None


def test_an_archived_repository_and_a_blocked_update_are_read_from_the_hacs_data() -> None:
    blocked = repo(installed_version="1.0", last_version="1.1", archived=True)
    blocked.can_download = False
    plain = repo(domain="plain", installed_version="1.0", last_version="1.0")
    hass = SimpleNamespace(
        data={"hacs": SimpleNamespace(repositories=SimpleNamespace(list_all=[blocked, plain]))}
    )
    found = hacs_by_domain(hass)
    assert found["demo"]["archived"] is True and found["demo"]["blocked"] is True
    assert found["plain"]["archived"] is False and found["plain"]["blocked"] is False
    assert blocked_repository_ids(hass) == {found["demo"]["id"]}
    assert blocked_repository_ids(SimpleNamespace(data={})) == set()


def test_a_commit_install_is_distinguished_from_a_release_and_dates_are_json_safe() -> None:
    commit = repo(
        installed_commit="33ccdad",
        last_version="1.6.0",
        last_fetched=datetime(2026, 10, 14, 10, 30, tzinfo=UTC),
    )
    release = repo(domain="released", installed_version="1.5.1", last_version="1.6.0")
    hass = SimpleNamespace(
        data={"hacs": SimpleNamespace(repositories=SimpleNamespace(list_all=[commit, release]))}
    )

    found = hacs_by_domain(hass)
    assert found["demo"]["installed_version"] == "33ccdad"
    assert found["demo"]["installed_kind"] == "commit"
    assert found["demo"]["last_fetched"] == "2026-10-14T10:30:00+00:00"
    assert found["released"]["installed_kind"] == "release"


def test_every_installed_repository_is_listed_with_what_hacs_removed(monkeypatch) -> None:
    from homeassistant.helpers import issue_registry as ir

    issues = {
        ("hacs", "removed_7"): SimpleNamespace(
            translation_placeholders={"name": "me/demo", "reason": "Repository is archived"},
            dismissed_version=None,
        ),
        ("hacs", "removed_9"): SimpleNamespace(
            translation_placeholders={"name": "me/card", "reason": "Deprecated by the owner"},
            dismissed_version="2026.10.1",
        ),
        ("other", "removed_8"): SimpleNamespace(
            translation_placeholders={}, dismissed_version=None
        ),
    }
    monkeypatch.setattr(ir, "async_get", lambda hass: SimpleNamespace(issues=issues))
    demo = repo(installed_version="1.0", last_version="1.1")
    card = repo(category="plugin", domain=None, id=9, full_name="me/card", installed_version="2")
    theme = repo(category="theme", domain=None, id=10, full_name="me/theme", installed_version="3")
    gone = repo(installed=False, id=11, full_name="me/gone")
    hass = SimpleNamespace(
        data={
            "hacs": SimpleNamespace(
                repositories=SimpleNamespace(list_all=[theme, card, demo, gone])
            )
        }
    )
    rows = hacs_repositories(hass)
    assert [r["full_name"] for r in rows] == ["me/card", "me/demo", "me/theme"]
    by_id = {r["id"]: r for r in rows}
    assert by_id["7"]["removed"] == {
        "name": "me/demo",
        "reason": "Repository is archived",
        "ignored": False,
    }
    assert by_id["9"]["removed"]["ignored"] is True and by_id["9"]["category"] == "plugin"
    assert by_id["10"]["removed"] is None
    assert hacs_by_domain(hass)["demo"]["removed"]["reason"] == "Repository is archived"


def test_the_repository_list_is_none_without_hacs() -> None:
    assert hacs_repositories(SimpleNamespace(data={})) is None


def test_the_marketplace_of_ha_2026_11_is_read_like_hacs() -> None:
    repository = repo(installed_version="1.0", last_version="1.1")
    manager = SimpleNamespace(repositories=SimpleNamespace(list_installed=[repository]))
    entries = SimpleNamespace(async_entries=lambda domain: [SimpleNamespace(runtime_data=manager)])
    hass = SimpleNamespace(data={}, config_entries=entries)
    assert hacs_by_domain(hass)["demo"]["pending_update"] is True


def test_the_store_is_told_apart() -> None:
    entries = SimpleNamespace(async_entries=lambda domain: [object()])
    assert store_kind(SimpleNamespace(data={"hacs": object()}, config_entries=entries)) == "hacs"
    assert store_kind(SimpleNamespace(data={}, config_entries=entries)) == "marketplace"
    assert store_kind(SimpleNamespace(data={})) is None
