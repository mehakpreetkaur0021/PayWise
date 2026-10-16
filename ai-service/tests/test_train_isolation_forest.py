import sys
import tempfile
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import train_isolation_forest as training


class IsolationForestTests(unittest.TestCase):
    def setUp(self):
        self.features = [[10.0, 9.0, 0.0], [11.0, 10.0, 1.0], [9.0, 11.0, 2.0], [500.0, 23.0, 6.0]]

    def test_model_trains_and_prediction_labels_are_expected(self):
        model = training.train_model(self.features, seed=7)
        self.assertTrue(set(model.predict(self.features)).issubset({-1, 1}))
        self.assertEqual(model.named_steps["preprocess"].transform(self.features).shape[1], 32)

    def test_saved_model_loads_with_identical_predictions(self):
        model = training.train_model(self.features, seed=7)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.joblib"
            training.dump({"pipeline": model, "feature_columns": list(training.FEATURE_COLUMNS), "score_threshold": -0.5}, path)
            loaded = training.load(path)
            self.assertTrue(np.allclose(model.score_samples(self.features), loaded["pipeline"].score_samples(self.features)))

    def test_feature_matrix_excludes_fraud_label(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "features.csv"
            path.write_text("amount,hour_of_day,day_of_week,is_fraud\n10,9,0,1\n", encoding="utf-8")
            with self.assertRaises(training.InputValidationError):
                training.read_features(path)

    def test_threshold_classifies_scores_consistently(self):
        metrics = training.evaluate_scores(np.array([0, 1]), np.array([-0.2, -0.7]), -0.5)
        self.assertEqual(metrics["anomalies_flagged"], 1)
        self.assertEqual(metrics["confusion_matrix"]["rows_actual_0_1_columns_predicted_normal_suspicious"], [[1, 0], [0, 1]])


if __name__ == "__main__":
    unittest.main()
