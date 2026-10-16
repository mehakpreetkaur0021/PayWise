#!/usr/bin/env python3
"""Evaluate validation-selected higher-recall thresholds for the synthetic experiment."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from joblib import dump, load
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support

import train_synthetic_isolation_forest as baseline

BASELINE_MODEL_FILENAME = "isolation_forest_synthetic.joblib"
BASELINE_METRICS_FILENAME = "isolation_forest_synthetic_metrics.json"
MODEL_FILENAME = "isolation_forest_synthetic_recall_thresholds.joblib"
METRICS_FILENAME = "isolation_forest_synthetic_recall_thresholds_metrics.json"
RECALL_TARGETS = (0.60, 0.70, 0.80)


def evaluate_scores(labels: np.ndarray, scores: np.ndarray, threshold: float) -> dict[str, object]:
    """Report threshold metrics, including false-positive rate, without refitting."""
    predictions = (scores <= threshold).astype(int)
    precision, recall, f1, _ = precision_recall_fscore_support(labels, predictions, average="binary", zero_division=0)
    matrix = confusion_matrix(labels, predictions, labels=[0, 1])
    false_positive_rate = float(matrix[0, 1] / matrix[0].sum()) if matrix[0].sum() else 0.0
    return {
        "score_threshold": float(threshold), "precision": float(precision), "recall": float(recall), "f1_score": float(f1),
        "transactions_flagged": int(predictions.sum()), "transactions_flagged_percentage": float(predictions.mean() * 100),
        "false_positive_rate": false_positive_rate,
        "confusion_matrix": {"rows_actual_0_1_columns_predicted_normal_suspicious": matrix.tolist()},
    }


def select_recall_threshold(labels: np.ndarray, scores: np.ndarray, minimum_recall: float):
    """Maximize validation precision at or above the recall target, if possible."""
    candidates = [evaluate_scores(labels, scores, float(threshold)) for threshold in np.unique(scores)]
    eligible = [candidate for candidate in candidates if candidate["recall"] >= minimum_recall]
    if not eligible:
        return None, False
    # Equal precision is resolved toward fewer reviews, then greater recall.
    return max(eligible, key=lambda row: (row["precision"], -row["transactions_flagged"], row["recall"], row["f1_score"], -row["score_threshold"])), True


def run(data_path: Path, artifacts_dir: Path, seed: int = baseline.DEFAULT_SEED) -> dict[str, object]:
    baseline_model_path = artifacts_dir / BASELINE_MODEL_FILENAME
    baseline_metrics_path = artifacts_dir / BASELINE_METRICS_FILENAME
    if not baseline_model_path.is_file() or not baseline_metrics_path.is_file():
        raise FileNotFoundError("Train the baseline synthetic experiment before running threshold evaluation.")
    bundle = load(baseline_model_path)
    if bundle.get("feature_columns") != list(baseline.FEATURE_COLUMNS):
        raise ValueError("Baseline artifact has an unexpected feature order")

    features, labels = baseline.read_dataset(data_path)
    _, validation_features, test_features, _, validation_labels, test_labels = baseline.split_dataset(features, labels, seed)
    pipeline = bundle["pipeline"]
    validation_scores, test_scores = pipeline.score_samples(validation_features), pipeline.score_samples(test_features)
    baseline_validation = evaluate_scores(validation_labels, validation_scores, float(bundle["score_threshold"]))
    baseline_test = evaluate_scores(test_labels, test_scores, float(bundle["score_threshold"]))
    experiments = {}
    for target in RECALL_TARGETS:
        validation_metrics, achieved = select_recall_threshold(validation_labels, validation_scores, target)
        experiments[f"{target:.0%}"] = {
            "target_validation_recall": target, "target_achieved": achieved, "validation": validation_metrics,
            "held_out_test": evaluate_scores(test_labels, test_scores, validation_metrics["score_threshold"]) if achieved else None,
        }

    # Require the preserved baseline report as part of this experiment's provenance.
    json.loads(baseline_metrics_path.read_text(encoding="utf-8"))
    experiment_bundle = {
        "pipeline": pipeline, "feature_columns": list(baseline.FEATURE_COLUMNS),
        "score_thresholds_by_validation_recall_target": {target: result["validation"]["score_threshold"] if result["target_achieved"] else None for target, result in experiments.items()},
        "configuration": bundle["configuration"], "dataset": {"path": data_path.name, "synthetic": True},
        "source_baseline_model": BASELINE_MODEL_FILENAME,
    }
    report = {
        "model_artifact": MODEL_FILENAME,
        "source_baseline": {"model_artifact": BASELINE_MODEL_FILENAME, "metrics_artifact": BASELINE_METRICS_FILENAME, "validation": baseline_validation, "held_out_test": baseline_test},
        "dataset": {"path": str(data_path), "synthetic": True, "disclaimer": "This synthetic dataset and its results do not establish real-world fraud-detection performance."},
        "feature_columns": list(baseline.FEATURE_COLUMNS),
        "label_usage": "is_fraud is excluded from Isolation Forest fitting. It is used only for validation threshold selection and held-out test evaluation.",
        "split": {"strategy": "reuses baseline stratified 60/20/20 train/validation/held-out-test split", "seed": seed, "validation_rows": len(validation_labels), "held_out_test_rows": len(test_labels)},
        "threshold_strategy": "For each target, choose the highest precision threshold that reaches the target on validation data. Held-out test labels are not used for selection.",
        "experiments": experiments,
        "tradeoff": "Higher recall thresholds can flag more legitimate transactions, reducing precision and increasing false-positive rate and review volume.",
    }
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    dump(experiment_bundle, artifacts_dir / MODEL_FILENAME)
    (artifacts_dir / METRICS_FILENAME).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=root / "ai-service/data/synthetic_transactions_amount_time.csv")
    parser.add_argument("--artifacts-dir", type=Path, default=root / "ai-service/artifacts")
    parser.add_argument("--seed", type=int, default=baseline.DEFAULT_SEED)
    args = parser.parse_args()
    print(json.dumps(run(args.data, args.artifacts_dir, args.seed), indent=2))


if __name__ == "__main__":
    main()
