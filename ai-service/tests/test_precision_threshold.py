import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from joblib import dump, load

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import evaluate_precision_threshold as experiment


class PrecisionThresholdTests(unittest.TestCase):
    def test_selects_highest_precision_that_meets_minimum_recall(self):
        labels = np.array([1, 1, 0, 0])
        scores = np.array([-0.9, -0.8, -0.7, -0.6])
        table = experiment.build_validation_table(labels, scores, (.25, .5, .75))
        selected, achieved = experiment.select_precision_threshold(table, .5)
        self.assertTrue(achieved)
        self.assertEqual(selected["anomalies_flagged"], 1)
        self.assertEqual(selected["precision"], 1.0)
        self.assertEqual(selected["recall"], 0.5)

    def test_falls_back_deterministically_when_target_is_unachievable(self):
        labels = np.array([1, 1, 0, 0])
        scores = np.array([-0.9, -0.8, -0.7, -0.6])
        table = experiment.build_validation_table(labels, scores, (.25,))
        first = experiment.select_precision_threshold(table, .75)
        second = experiment.select_precision_threshold(table, .75)
        self.assertFalse(first[1])
        self.assertEqual(first, second)

    def test_preserves_source_artifact_when_saving_experiment(self):
        source_bundle = {"pipeline": "unchanged", "score_threshold": -0.5}
        selected = {"score_threshold": -0.7}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_path, experiment_path = root / "v2.joblib", root / "precision.joblib"
            dump(source_bundle, source_path)
            original = source_path.read_bytes()
            experiment.save_experiment_bundle(load(source_path), experiment_path, selected, .4)
            self.assertEqual(source_path.read_bytes(), original)
            self.assertEqual(load(experiment_path)["score_threshold"], -0.7)

    def test_score_boundary_is_anomalous(self):
        table = experiment.build_validation_table(np.array([0, 1]), np.array([-0.5, -0.7]), (.5,))
        self.assertEqual(table[0]["anomalies_flagged"], 1)


if __name__ == "__main__":
    unittest.main()
