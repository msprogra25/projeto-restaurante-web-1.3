import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import app as backend_app


class AppTests(unittest.TestCase):
    def test_root_serves_html_when_frontend_is_missing(self):
        client = backend_app.app.test_client()
        response = client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"BRASA", response.data)


if __name__ == "__main__":
    unittest.main()
