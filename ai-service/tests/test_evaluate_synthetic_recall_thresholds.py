import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import evaluate_synthetic_recall_thresholds as experiment


class SyntheticRecallThresholdTests(unittest.TestCase):
    def test_metrics_include_false_positive_rate_and_confusion_matrix(self):
        metrics = experiment.evaluate_scores(np.array([0, 0, 1, 1]), np.array([-0.9, -0.2, -0.8, -0.1]), -0.5)
        self.assertEqual(metrics["confusion_matrix"]["rows_actual_0_1_columns_predicted_normal_suspicious"], [[1, 1], [1, 1]])
        self.assertEqual(metrics["false_positive_rate"], 0.5)
        self.assertEqual(metrics["transactions_flagged_percentage"], 50.0)

    def test_threshold_selection_uses_precision_then_fewer_alerts(self):
        labels = np.array([1, 1, 0, 0])
        scores = np.array([-0.9, -0.8, -0.7, -0.6])
        selected, achieved = experiment.select_recall_threshold(labels, scores, 0.5)
        self.assertTrue(achieved)
        self.assertEqual(selected["precision"], 1.0)
        self.assertEqual(selected["transactions_flagged"], 1)
        self.assertEqual(selected["recall"], 0.5)

    def test_unachievable_target_is_reported_without_a_threshold(self):
        selected, achieved = experiment.select_recall_threshold(np.array([1, 0]), np.array([-0.9, -0.8]), 1.1)
        self.assertIsNone(selected)
        self.assertFalse(achieved)


if __name__ == "__main__":
    unittest.main()
