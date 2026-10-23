"""The record of each start: kept for the retention, marks a start after an update."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

pytest.importorskip("homeassistant")

from custom_components.ha_housekeeper.start_times import StartStore, process_started  # noqa: E402

NOW = datetime(2026, 10, 23, 13, 0, tzinfo=UTC)


class _Saved:
    def async_delay_save(self, *_: object) -> None:
        pass


def _store() -> StartStore:
    store = StartStore.__new__(StartStore)
    store._store = _Saved()  # type: ignore[assignment]
    store.starts = []
    return store


def _record(store: StartStore, at: datetime, version: str) -> None:
    store.record(
        at, version, 228.4, 271.2, "process", [{"domain": "frigate", "seconds": 74.0}], 30, 95, True
    )


def test_starts_keep_the_retention_and_mark_an_update() -> None:
    store = _store()
    _record(store, NOW - timedelta(days=40), "2026.9.4")
    _record(store, NOW - timedelta(days=2), "2026.10.1")
    _record(store, NOW, "2026.10.1")
    _record(store, NOW + timedelta(days=1), "2026.10.2")
    assert [s["version"] for s in store.starts] == ["2026.10.1", "2026.10.1", "2026.10.2"]
    assert [s["update"] for s in store.starts] == [True, False, True]
    assert store.report()["starts"][0]["version"] == "2026.10.2"
    assert store.starts[-1]["down_s"] == 95 and store.starts[-1]["unclean"] is True


def test_the_process_start_is_in_the_past_or_unknown() -> None:
    started = process_started()
    assert started is None or started < NOW.timestamp() + 10**9


def test_an_entry_that_did_not_load_keeps_its_reason() -> None:
    from types import SimpleNamespace
    from unittest.mock import patch

    from custom_components.ha_housekeeper import start_times

    def entry(state: str, reason: str | None) -> SimpleNamespace:
        return SimpleNamespace(
            domain="switchbot", title="switchbot", state=SimpleNamespace(value=state), reason=reason
        )

    hass = SimpleNamespace(
        config_entries=SimpleNamespace(async_entries=lambda: [entry("setup_retry", "No device")])
    )
    with patch.object(start_times, "async_get_setup_timings", lambda _hass: {"switchbot": 65.0}):
        (row,) = start_times.integration_rows(hass)
    assert row["state"] == "setup_retry" and row["reason"] == "No device"
