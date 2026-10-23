"""Auto-pause: the schedule, who may be paused, and the automatic start."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest

pytest.importorskip("homeassistant")

from homeassistant.config_entries import ConfigEntryDisabler, ConfigEntryState  # noqa: E402
from homeassistant.helpers import entity_registry as er  # noqa: E402
from pytest_homeassistant_custom_component.common import MockConfigEntry  # noqa: E402

from custom_components.ha_housekeeper.auto_pause import (  # noqa: E402
    END_HOURS,
    OFFSETS,
    AutoPause,
    AutoPauseError,
)
from custom_components.ha_housekeeper.entry_states import EntryStateHistory  # noqa: E402

NOW = datetime(2026, 10, 23, 12, 0, tzinfo=UTC)


def _setup(hass, platform: str = "sensor"):
    entry = MockConfigEntry(domain="waste_collection_schedule", title="Ravensburg")
    entry.add_to_hass(hass)
    er.async_get(hass).async_get_or_create(platform, "wcs", "next", config_entry=entry)
    scanner = SimpleNamespace(
        monitor=SimpleNamespace(items=[]),
        marks=SimpleNamespace(items={}),
        entry_states=EntryStateHistory(hass),
    )
    return entry, scanner, AutoPause(hass, scanner)


def test_the_schedule_is_21_tries_within_7_days() -> None:
    assert (
        len(OFFSETS) == 21
        and OFFSETS[:7] == (1, 2, 3, 6, 9, 12, 18)
        and OFFSETS[-3:]
        == (
            108,
            132,
            156,
        )
    )
    assert OFFSETS[-1] < END_HOURS


async def test_a_data_integration_is_paused_after_enough_failed_attempts(hass) -> None:
    entry, scanner, pause = _setup(hass)
    states = {entry.entry_id: "setup_retry"}
    scanner.entry_states.record(states, NOW - timedelta(hours=2), {entry.entry_id: 0})
    scanner.entry_states.record(states, NOW - timedelta(hours=1), {entry.entry_id: 25})
    pause.set_settings({"enabled": True})
    with patch.object(pause, "_iot_classes", return_value={entry.domain: "cloud_polling"}):
        entry.mock_state(hass, ConfigEntryState.SETUP_RETRY)
        pause.never(entry.entry_id, True)
        await pause.check(NOW)
        assert entry.entry_id not in pause.paused  # excluded
        pause.never(entry.entry_id, False)
        await pause.check(NOW)
    assert entry.entry_id in pause.paused and entry.disabled_by is ConfigEntryDisabler.USER
    assert pause.paused[entry.entry_id]["reason"] == "auto"
    pause.start()()


async def test_a_control_integration_needs_a_confirmation_and_a_user_disabled_one_is_left_alone(
    hass,
) -> None:
    entry, scanner, pause = _setup(hass, "lock")
    with patch.object(pause, "_iot_classes", return_value={entry.domain: "cloud_polling"}):
        report = await pause.report()
        assert report["pausable"][0]["warn"] == ["control"] and not report["candidates"]
        with pytest.raises(AutoPauseError, match="confirm_needed"):
            await pause.pause(entry.entry_id, reason="manual")
        await pause.pause(entry.entry_id, reason="manual", confirm=True)
        assert pause.paused[entry.entry_id]["reason"] == "manual"
    other = MockConfigEntry(domain="x", disabled_by=ConfigEntryDisabler.USER)
    other.add_to_hass(hass)
    with pytest.raises(AutoPauseError, match="disabled"):
        await pause.pause(other.entry_id, reason="manual", confirm=True)
    pause.start()()


async def test_the_outage_of_a_paused_entry_keeps_its_start_after_the_pause(hass) -> None:
    entry, _scanner, pause = _setup(hass)
    pause.carry[entry.entry_id] = "2026-10-20T08:00:00+00:00"
    assert pause.outage_start(entry.entry_id, "problem", "2026-10-23T08:00:00+00:00") == (
        "2026-10-20T08:00:00+00:00"
    )
    assert pause.outage_start(entry.entry_id, "disabled", None) is None and pause.carry
    assert pause.outage_start(entry.entry_id, "active", None) is None and not pause.carry
