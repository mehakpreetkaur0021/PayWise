import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from joblib import load

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import train_synthetic_isolation_forest as training


class SyntheticIsolationForestTests(unittest.TestCase):
    def test_dataset_uses_only_amount_and_hour_as_features(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.csv"
            path.write_text("amount,hour_of_day,is_fraud\n10,9,0\n20,10,1\n", encoding="utf-8")
            features, labels = training.read_dataset(path)
        self.assertEqual(features.shape, (2, 2))
        self.assertEqual(features.tolist(), [[10.0, 9.0], [20.0, 10.0]])
        self.assertEqual(labels.tolist(), [0, 1])

    def test_label_is_not_passed_to_pipeline_fit(self):
        received = []

        class RecordingPipeline:
            def fit(self, features):
                received.append(features)
                return self

        features = np.array([[10.0, 9.0], [20.0, 10.0]])
        with patch.object(training, "make_pipeline", return_value=RecordingPipeline()):
            training.train_model(features, seed=7)
        self.assertEqual(len(received), 1)
        self.assertTrue(np.array_equal(received[0], features))

    def test_threshold_selects_highest_precision_meeting_recall_target(self):
        labels = np.array([1, 1, 0, 0])
        scores = np.array([-0.9, -0.8, -0.7, -0.6])
        selected, achieved = training.select_precision_threshold(labels, scores, minimum_recall=0.5)
        self.assertTrue(achieved)
        self.assertEqual(selected["transactions_flagged"], 1)
        self.assertEqual(selected["precision"], 1.0)
        self.assertEqual(selected["recall"], 0.5)

    def test_threshold_reports_when_recall_target_is_unachievable(self):
        labels = np.array([1, 1, 0, 0])
        scores = np.array([-0.9, -0.8, -0.7, -0.6])
        _, achieved = training.select_precision_threshold(labels, scores, minimum_recall=1.1)
        self.assertFalse(achieved)

    def test_saved_model_loads_with_same_scores(self):
        features = np.array([[10.0, 9.0], [11.0, 10.0], [9.0, 11.0], [500.0, 23.0]])
        pipeline = training.train_model(features, seed=7)
        report = {"held_out_test": {"precision": 0.0}}
        bundle = {"pipeline": pipeline, "feature_columns": list(training.FEATURE_COLUMNS), "score_threshold": -0.5}
        with tempfile.TemporaryDirectory() as directory:
            training.save_artifacts(Path(directory), bundle, report)
            loaded = load(Path(directory) / training.MODEL_FILENAME)
        self.assertTrue(np.allclose(pipeline.score_samples(features), loaded["pipeline"].score_samples(features)))


if __name__ == "__main__":
    unittest.main()
