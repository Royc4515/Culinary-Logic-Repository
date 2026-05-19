import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from prompts import get_extraction_prompt


class TestGetExtractionPrompt:
    def test_returns_non_empty_string(self):
        result = get_extraction_prompt("Test", "Title", "Caption")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_injects_user_text(self):
        result = get_extraction_prompt("Test restaurant", "Title", "Caption")
        assert "Test restaurant" in result

    def test_injects_scraped_title(self):
        result = get_extraction_prompt("text", "My Scraped Title", "Caption")
        assert "My Scraped Title" in result

    def test_injects_scraped_caption(self):
        result = get_extraction_prompt("text", "Title", "My scraped caption text")
        assert "My scraped caption text" in result

    def test_injects_scraped_site(self):
        result = get_extraction_prompt("text", "Title", "Caption", scraped_site="instagram.com")
        assert "instagram.com" in result

    def test_injects_scraped_body(self):
        result = get_extraction_prompt("text", "Title", "Caption", scraped_body="The body excerpt here")
        assert "The body excerpt here" in result

    def test_injects_places_data(self):
        result = get_extraction_prompt("text", "Title", "Caption", places_data='{"name": "The Spot"}')
        assert '"name": "The Spot"' in result

    def test_falls_back_to_none_provided_for_empty_user_text(self):
        result = get_extraction_prompt("", "Title", "Caption")
        assert "None provided" in result

    def test_falls_back_to_none_provided_for_none_user_text(self):
        result = get_extraction_prompt(None, "Title", "Caption")
        assert "None provided" in result

    def test_falls_back_to_none_provided_for_empty_scraped_title(self):
        result = get_extraction_prompt("user text", "", "Caption")
        assert "None provided" in result

    def test_falls_back_to_none_provided_for_empty_scraped_caption(self):
        result = get_extraction_prompt("user text", "Title", "")
        assert "None provided" in result

    def test_falls_back_to_none_provided_for_empty_scraped_body(self):
        result = get_extraction_prompt("user text", "Title", "Caption", scraped_body="")
        assert "None provided" in result

    def test_falls_back_to_none_provided_for_empty_scraped_site(self):
        result = get_extraction_prompt("user text", "Title", "Caption", scraped_site="")
        assert "None provided" in result

    def test_falls_back_to_none_provided_for_empty_places_data(self):
        result = get_extraction_prompt("user text", "Title", "Caption", places_data="")
        assert "None provided" in result

    def test_output_is_stripped(self):
        result = get_extraction_prompt("text", "Title", "Caption")
        assert result == result.strip()

    def test_contains_place_schema_marker(self):
        result = get_extraction_prompt("text", "Title", "Caption")
        assert "PLACE" in result

    def test_contains_recipe_schema_marker(self):
        result = get_extraction_prompt("text", "Title", "Caption")
        assert "RECIPE" in result

    def test_contains_gear_schema_marker(self):
        result = get_extraction_prompt("text", "Title", "Caption")
        assert "GEAR" in result

    def test_all_params_injected(self):
        result = get_extraction_prompt(
            user_text="user note",
            scraped_title="page title",
            scraped_caption="page description",
            scraped_body="body text",
            scraped_site="example.com",
            places_data='{"lat": 1.0}',
        )
        assert "user note" in result
        assert "page title" in result
        assert "page description" in result
        assert "body text" in result
        assert "example.com" in result
        assert '"lat": 1.0' in result
