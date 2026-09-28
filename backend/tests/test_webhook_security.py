"""Security tests for the Telegram webhook surface.

Run from backend/:  python -m pytest tests -q
No network, Telegram, Supabase or LLM keys needed: every request here is
rejected or ignored before any external call is made.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as backend  # noqa: E402

HEADER = "X-Telegram-Bot-Api-Secret-Token"
SECRET = "test-secret-value"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(backend, "TELEGRAM_WEBHOOK_SECRET", SECRET)
    # Keep the happy path offline: registering bot commands calls Telegram.
    monkeypatch.setattr(backend, "ensure_commands_registered", lambda: None)
    return backend.app.test_client()


def test_webhook_rejects_missing_secret(client):
    res = client.post("/api/webhook", json={"message": {}})
    assert res.status_code == 403


def test_webhook_rejects_wrong_secret(client):
    res = client.post("/api/webhook", json={"message": {}}, headers={HEADER: "wrong"})
    assert res.status_code == 403


def test_webhook_fails_closed_when_secret_unset(monkeypatch):
    # An unset secret must not mean "no check": that was the original hole.
    monkeypatch.setattr(backend, "TELEGRAM_WEBHOOK_SECRET", "")
    res = backend.app.test_client().post("/api/webhook", json={}, headers={HEADER: ""})
    assert res.status_code == 403


def test_webhook_accepts_correct_secret(client):
    # An update with no message/callback is acknowledged and ignored, which
    # proves the request got past the auth gate without touching any service.
    res = client.post("/api/webhook", json={"update_id": 1}, headers={HEADER: SECRET})
    assert res.status_code == 200
    assert res.get_json() == {"status": "ignored"}


def test_webhook_ignores_non_json_body(client):
    res = client.post("/api/webhook", data="not json", headers={HEADER: SECRET})
    assert res.status_code == 200


def test_setup_endpoint_removed(client):
    # /api/setup let anyone re-point the bot's webhook at their own server.
    res = client.get("/api/setup?url=https://attacker.example/api/webhook")
    assert res.status_code == 404
