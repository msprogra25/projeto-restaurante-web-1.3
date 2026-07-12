import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import app as backend_app


class AppTests(unittest.TestCase):
    def test_root_serves_html_when_frontend_is_missing(self):
        client = backend_app.app.test_client()
        response = client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"BRASA", response.data)

    @patch("app.webbrowser.open", return_value=True)
    def test_launch_browser_opens_expected_url(self, mock_open):
        from app import launch_browser

        self.assertTrue(launch_browser("http://127.0.0.1:5000"))
        mock_open.assert_called_once_with("http://127.0.0.1:5000")


if __name__ == "__main__":
    unittest.main()
