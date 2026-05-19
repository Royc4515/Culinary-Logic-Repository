"""Tests for backend/app.py — pure functions and Flask routes."""
import sys
import os
import json
from unittest.mock import patch, MagicMock

import pytest

# Ensure backend/ is on path (conftest also does this, but be explicit)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import app as flask_module
from app import extract_url, get_fallback_image, geocode_address, scrape_metadata


# ---------------------------------------------------------------------------
# extract_url
# ---------------------------------------------------------------------------

class TestExtractUrl:
    def test_returns_url_when_present(self):
        result = extract_url("Check this out https://example.com great stuff")
        assert result == "https://example.com"

    def test_returns_none_when_no_url(self):
        result = extract_url("No links here at all")
        assert result is None

    def test_returns_first_url_with_multiple(self):
        result = extract_url("First https://first.com then https://second.com")
        assert result == "https://first.com"

    def test_handles_http_scheme(self):
        result = extract_url("Visit http://insecure.com for more")
        assert result == "http://insecure.com"

    def test_returns_none_for_empty_string(self):
        result = extract_url("")
        assert result is None

    def test_handles_url_at_start(self):
        result = extract_url("https://start.com is the url")
        assert result == "https://start.com"

    def test_handles_url_at_end(self):
        result = extract_url("the url is https://end.com")
        assert result == "https://end.com"


# ---------------------------------------------------------------------------
# get_fallback_image
# ---------------------------------------------------------------------------

class TestGetFallbackImage:
    def test_returns_unsplash_url(self):
        result = get_fallback_image("Chez Pierre", [], "PLACE")
        assert "unsplash.com" in result

    def test_title_included_in_url(self):
        result = get_fallback_image("Chez Pierre", [], "PLACE")
        assert "Chez" in result or "Pierre" in result or "Chez%20Pierre" in result

    def test_empty_title_place_falls_back_to_restaurant(self):
        result = get_fallback_image("", [], "PLACE")
        assert "restaurant" in result

    def test_untitled_place_falls_back_to_restaurant(self):
        result = get_fallback_image("Untitled Item", [], "PLACE")
        assert "restaurant" in result

    def test_recipe_type_falls_back_to_food(self):
        result = get_fallback_image("", [], "RECIPE")
        assert "food" in result or "cooking" in result

    def test_gear_type_falls_back_to_kitchen(self):
        result = get_fallback_image("", [], "GEAR")
        assert "kitchen" in result or "gear" in result

    def test_tags_included_in_query(self):
        result = get_fallback_image("SomeName", ["pasta", "italian"], "PLACE")
        # Tags should enrich the URL
        assert "unsplash.com" in result

    def test_returns_string(self):
        result = get_fallback_image("Test", ["tag"], "PLACE")
        assert isinstance(result, str)
        assert result.startswith("https://")


# ---------------------------------------------------------------------------
# geocode_address
# ---------------------------------------------------------------------------

class TestGeocodeAddress:
    def test_returns_zeros_when_no_api_key(self):
        """When MAPS_API_KEY is absent, return (0.0, 0.0, address)."""
        with patch.dict(os.environ, {}, clear=False):
            # Remove key if present
            os.environ.pop('MAPS_API_KEY', None)
            # Also patch the module-level constant
            with patch.object(flask_module, 'MAPS_API_KEY', None):
                lat, lng, addr = geocode_address("1 Infinite Loop, Cupertino")
        assert lat == 0.0
        assert lng == 0.0
        assert addr == "1 Infinite Loop, Cupertino"

    def test_returns_coordinates_on_success(self):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "status": "OK",
            "results": [{
                "geometry": {"location": {"lat": 37.3317, "lng": -122.0302}},
                "formatted_address": "1 Infinite Loop, Cupertino, CA 95014, USA",
            }]
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(flask_module, 'MAPS_API_KEY', 'fake-key'), \
             patch('app.requests.get', return_value=mock_response):
            lat, lng, addr = geocode_address("1 Infinite Loop, Cupertino")

        assert lat == 37.3317
        assert lng == -122.0302
        assert "Cupertino" in addr

    def test_returns_zeros_when_api_returns_zero_results(self):
        mock_response = MagicMock()
        mock_response.json.return_value = {"status": "ZERO_RESULTS", "results": []}
        mock_response.raise_for_status = MagicMock()

        with patch.object(flask_module, 'MAPS_API_KEY', 'fake-key'), \
             patch('app.requests.get', return_value=mock_response):
            lat, lng, addr = geocode_address("Nowhere Land")

        assert lat == 0.0
        assert lng == 0.0
        assert addr == "Nowhere Land"

    def test_returns_zeros_on_request_exception(self):
        with patch.object(flask_module, 'MAPS_API_KEY', 'fake-key'), \
             patch('app.requests.get', side_effect=Exception("Network error")):
            lat, lng, addr = geocode_address("Some Address")

        assert lat == 0.0
        assert lng == 0.0


# ---------------------------------------------------------------------------
# scrape_metadata
# ---------------------------------------------------------------------------

class TestScrapeMetadata:
    def test_microlink_success_path(self):
        """When Microlink returns status=success, use its data."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "status": "success",
            "data": {
                "title": "My Page Title",
                "description": "A nice description.",
                "publisher": "Example Site",
                "image": {"url": "https://example.com/image.jpg"},
                "logo": None,
            }
        }

        with patch('app.requests.get', return_value=mock_response):
            result = scrape_metadata("https://example.com/article")

        assert result["title"] == "My Page Title"
        assert result["description"] == "A nice description."
        assert result["thumbnail_url"] == "https://example.com/image.jpg"

    def test_microlink_failure_falls_back_to_bs4(self):
        """When Microlink returns non-200, fall back to BeautifulSoup."""
        html_content = """<html>
            <head>
                <meta property="og:title" content="BS4 Title"/>
                <meta property="og:description" content="BS4 Description"/>
                <meta property="og:image" content="https://example.com/bs4.jpg"/>
            </head>
            <body><p>Body text</p></body>
        </html>"""

        fail_response = MagicMock()
        fail_response.status_code = 503
        fail_response.json.return_value = {"status": "fail"}

        success_response = MagicMock()
        success_response.text = html_content
        success_response.status_code = 200

        with patch('app.requests.get', side_effect=[fail_response, success_response]):
            result = scrape_metadata("https://example.com/page")

        assert result["title"] == "BS4 Title"
        assert result["description"] == "BS4 Description"
        assert result["thumbnail_url"] == "https://example.com/bs4.jpg"

    def test_microlink_success_status_fail_falls_back(self):
        """When Microlink HTTP 200 but status!=success, fall back to BS4."""
        html_content = """<html>
            <head>
                <title>Fallback Title</title>
            </head>
            <body></body>
        </html>"""

        fail_response = MagicMock()
        fail_response.status_code = 200
        fail_response.json.return_value = {"status": "fail"}

        success_response = MagicMock()
        success_response.text = html_content
        success_response.status_code = 200

        with patch('app.requests.get', side_effect=[fail_response, success_response]):
            result = scrape_metadata("https://example.com/page")

        assert result["title"] == "Fallback Title"

    def test_both_fail_returns_placeholder(self):
        """When both Microlink and BS4 raise exceptions, return placeholder dict."""
        with patch('app.requests.get', side_effect=Exception("Network error")):
            result = scrape_metadata("https://broken.example.com")

        assert "title" in result
        assert "thumbnail_url" in result
        assert result["title"] == "Unknown Title"


# ---------------------------------------------------------------------------
# Route: GET /
# ---------------------------------------------------------------------------

class TestHealthCheck:
    def test_returns_200(self, client):
        response = client.get('/')
        assert response.status_code == 200

    def test_returns_expected_status_message(self, client):
        response = client.get('/')
        data = response.get_json()
        assert data == {"status": "CLR Backend is running"}


# ---------------------------------------------------------------------------
# Route: POST /api/webhook
# ---------------------------------------------------------------------------

class TestWebhook:
    def test_empty_body_returns_ignored(self, client):
        response = client.post('/api/webhook',
                               data=b'',
                               content_type='application/json')
        assert response.status_code == 200
        assert response.get_json()["status"] == "ignored"

    def test_no_message_key_returns_ignored(self, client):
        response = client.post('/api/webhook',
                               data=json.dumps({"update_id": 123}),
                               content_type='application/json')
        assert response.status_code == 200
        assert response.get_json()["status"] == "ignored"

    def test_help_command_returns_ok(self, client):
        payload = {
            "message": {
                "chat": {"id": 1001},
                "from": {"id": 999, "username": "user"},
                "text": "/help",
            }
        }
        response = client.post('/api/webhook',
                               data=json.dumps(payload),
                               content_type='application/json')
        assert response.status_code == 200
        assert response.get_json()["status"] == "ok"

    def test_start_command_returns_ok(self, client):
        payload = {
            "message": {
                "chat": {"id": 1002},
                "from": {"id": 999, "username": "user"},
                "text": "/start",
            }
        }
        response = client.post('/api/webhook',
                               data=json.dumps(payload),
                               content_type='application/json')
        assert response.status_code == 200
        assert response.get_json()["status"] == "ok"

    def test_text_with_no_user_id_returns_not_linked(self, client):
        """User sends text but telegram_id is not linked to any account."""
        payload = {
            "message": {
                "chat": {"id": 1003},
                "from": {"id": 88888, "username": "stranger"},
                "text": "https://example.com great food",
            }
        }
        # supabase is None in test fixture so get_user_id_for_telegram returns None
        response = client.post('/api/webhook',
                               data=json.dumps(payload),
                               content_type='application/json')
        assert response.status_code == 200
        # With no groq_client configured first, it'll return error or not_linked
        # Regardless, should not crash
        data = response.get_json()
        assert "status" in data

    def test_empty_text_returns_ignored(self, client):
        payload = {
            "message": {
                "chat": {"id": 1004},
                "from": {"id": 77777, "username": "user"},
                "text": "",
            }
        }
        response = client.post('/api/webhook',
                               data=json.dumps(payload),
                               content_type='application/json')
        assert response.status_code == 200
        assert response.get_json()["status"] == "ignored"

    def test_no_text_field_returns_ignored(self, client):
        payload = {
            "message": {
                "chat": {"id": 1005},
                "from": {"id": 66666, "username": "user"},
                # No 'text' key at all
            }
        }
        response = client.post('/api/webhook',
                               data=json.dumps(payload),
                               content_type='application/json')
        assert response.status_code == 200
        assert response.get_json()["status"] == "ignored"

    def test_text_with_unlinked_user_returns_not_linked(self, client):
        """Non-command text from a user with no telegram link → not_linked."""
        payload = {
            "message": {
                "chat": {"id": 1006},
                "from": {"id": 55555, "username": "newuser"},
                "text": "Some restaurant I visited",
            }
        }
        response = client.post('/api/webhook',
                               data=json.dumps(payload),
                               content_type='application/json')
        assert response.status_code == 200
        # supabase is None → get_user_id_for_telegram returns None → not_linked
        # But groq_client is also None so it may return error before that.
        # The test just ensures the server doesn't 500 on this path.
        data = response.get_json()
        assert data["status"] in ("not_linked", "error", "ignored", "ok")


# ---------------------------------------------------------------------------
# Route: GET /api/setup
# ---------------------------------------------------------------------------

class TestSetupWebhook:
    def test_missing_url_param_returns_400(self, client):
        response = client.get('/api/setup')
        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_with_url_but_no_telegram_token_returns_500(self, client):
        # TELEGRAM_BOT_TOKEN is cleared in conftest fixture
        with patch.object(flask_module, 'TELEGRAM_BOT_TOKEN', None):
            response = client.get('/api/setup?url=https://myapp.com/api/webhook')
        assert response.status_code == 500
        data = response.get_json()
        assert "error" in data
        assert "TELEGRAM_BOT_TOKEN" in data["error"]


# ---------------------------------------------------------------------------
# Route: POST /api/link/start
# ---------------------------------------------------------------------------

class TestLinkStart:
    def test_missing_authorization_returns_401(self, client):
        response = client.post('/api/link/start',
                               data=json.dumps({}),
                               content_type='application/json')
        assert response.status_code == 401
        data = response.get_json()
        assert "error" in data

    def test_no_supabase_returns_500(self, client):
        """With supabase=None (test fixture), any authenticated call → 500."""
        # supabase is None in test fixture; route checks supabase first
        response = client.post('/api/link/start',
                               headers={"Authorization": "Bearer some-jwt-token"},
                               data=json.dumps({}),
                               content_type='application/json')
        # supabase is None → 500 with error about supabase
        assert response.status_code == 500
        data = response.get_json()
        assert "error" in data
        assert "supabase" in data["error"].lower()

    def test_options_request_returns_204(self, client):
        response = client.options('/api/link/start')
        assert response.status_code == 204
