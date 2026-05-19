import sys
import os
import pytest

# Add backend/ to path so `import app` works
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


@pytest.fixture(scope='session')
def flask_app():
    """Import the Flask app with no real credentials -> supabase=None, groq_client=None."""
    # Clear credentials so services initialize as None
    for key in ('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GROQ_API_KEY',
                 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'MAPS_API_KEY'):
        os.environ.pop(key, None)

    import app as flask_module
    flask_module.app.config['TESTING'] = True
    return flask_module.app


@pytest.fixture
def client(flask_app):
    return flask_app.test_client()
