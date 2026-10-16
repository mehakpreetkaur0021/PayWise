import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


class FakePipeline:
    def __init__(self, score):
        self.score = score

    def score_samples(self, features):
        return [self.score]


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.app = main.create_app()
        self.client = TestClient(self.app)

    def set_fake_score(self, score):
        self.app.state.model_service.pipeline = FakePipeline(score)
        self.app.state.model_service.threshold = -0.5

    def test_health_reports_loaded_model(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "model_loaded": True})

    def test_prediction_mapping_and_response_structure(self):
        payload = {"amount": 100.0, "hour_of_day": 10, "day_of_week": 0}
        for score, expected_prediction, expected_anomaly in [(-0.6, "suspicious", True), (-0.4, "normal", False)]:
            self.set_fake_score(score)
            response = self.client.post("/predict", json=payload)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["prediction"], expected_prediction)
            self.assertEqual(response.json()["is_anomaly"], expected_anomaly)
            self.assertIn("not confirmation of fraud", response.json()["message"])

    def test_missing_and_invalid_values_return_4xx(self):
        for payload in ({"amount": 1, "hour_of_day": 1}, {"amount": -1, "hour_of_day": 1, "day_of_week": 1}, {"amount": "not-a-number", "hour_of_day": 1, "day_of_week": 1}):
            self.assertEqual(self.client.post("/predict", json=payload).status_code, 422)

    def test_invalid_hour_and_weekday_return_4xx(self):
        for payload in ({"amount": 1, "hour_of_day": 24, "day_of_week": 1}, {"amount": 1, "hour_of_day": 1, "day_of_week": 7}):
            self.assertEqual(self.client.post("/predict", json=payload).status_code, 422)

    def test_non_finite_amount_is_rejected(self):
        with self.assertRaises(ValidationError):
            main.PredictionRequest(amount=float("inf"), hour_of_day=1, day_of_week=1)

    def test_model_unavailable_is_controlled(self):
        with tempfile.TemporaryDirectory() as directory:
            client = TestClient(main.create_app(Path(directory) / "missing.joblib"))
            self.assertEqual(client.get("/health").json(), {"status": "unavailable", "model_loaded": False})
            response = client.post("/predict", json={"amount": 1, "hour_of_day": 1, "day_of_week": 1})
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json(), {"detail": "Anomaly model is unavailable."})
