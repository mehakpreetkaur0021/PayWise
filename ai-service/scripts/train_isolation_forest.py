#!/usr/bin/env python3
"""Train a validation-calibrated Isolation Forest for PayWise."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
from joblib import dump, load
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import IsolationForest
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

FEATURE_COLUMNS = ("amount", "hour_of_day", "day_of_week")
LABEL_COLUMN = "is_fraud"
DEFAULT_SEED = 20261016
MODEL_FILENAME = "isolation_forest_v2.joblib"
METRICS_FILENAME = "isolation_forest_v2_metrics.json"
VALIDATION_FLAG_RATES = tuple(rate / 100 for rate in range(1, 51))


class InputValidationError(ValueError):
    pass


def read_features(path: Path) -> np.ndarray:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != list(FEATURE_COLUMNS):
            raise InputValidationError(f"{path.name} must contain {FEATURE_COLUMNS} in that order")
        try:
            rows = [[float(row[column]) for column in FEATURE_COLUMNS] for row in reader]
        except (TypeError, ValueError) as error:
            raise InputValidationError(f"Invalid feature value in {path.name}") from error
    if not rows:
        raise InputValidationError(f"{path.name} has no feature rows")
    return np.asarray(rows, dtype=float)


def read_labels(path: Path) -> np.ndarray:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != ["source_row", LABEL_COLUMN]:
            raise InputValidationError(f"{path.name} must contain source_row and {LABEL_COLUMN}")
        labels = [int(row[LABEL_COLUMN]) for row in reader]
    if not labels or not set(labels).issubset({0, 1}):
        raise InputValidationError(f"{path.name} must contain 0/1 labels")
    return np.asarray(labels, dtype=int)


def make_pipeline(seed: int = DEFAULT_SEED) -> Pipeline:
    """Keep amount numeric while treating clock values as categorical, not ordinal."""
    preprocessing = ColumnTransformer([
        ("amount", "passthrough", [0]),
        ("hour", OneHotEncoder(categories=[np.arange(24)], handle_unknown="ignore"), [1]),
        ("weekday", OneHotEncoder(categories=[np.arange(7)], handle_unknown="ignore"), [2]),
    ])
    return Pipeline([
        ("preprocess", preprocessing),
        ("model", IsolationForest(n_estimators=100, contamination="auto", random_state=seed, n_jobs=1)),
    ])


def train_model(train_features: np.ndarray, seed: int = DEFAULT_SEED) -> Pipeline:
    return make_pipeline(seed).fit(train_features)


def evaluate_scores(labels: np.ndarray, scores: np.ndarray, threshold: float) -> dict[str, object]:
    predictions = (scores <= threshold).astype(int)
    precision, recall, f1, _ = precision_recall_fscore_support(labels, predictions, average="binary", zero_division=0)
    return {
        "score_threshold": float(threshold),
        "confusion_matrix": {"rows_actual_0_1_columns_predicted_normal_suspicious": confusion_matrix(labels, predictions, labels=[0, 1]).tolist()},
        "precision": float(precision), "recall": float(recall), "f1_score": float(f1),
        "accuracy": float(accuracy_score(labels, predictions)),
        "anomalies_flagged": int(predictions.sum()),
        "anomalies_flagged_percentage": float(predictions.mean() * 100),
    }


def select_threshold(labels: np.ndarray, scores: np.ndarray) -> tuple[float, dict[str, object]]:
    """Choose validation F1 from non-degenerate 1%-50% anomaly-rate candidates."""
    best = None
    for rate in VALIDATION_FLAG_RATES:
        threshold = float(np.quantile(scores, rate))
        metrics = evaluate_scores(labels, scores, threshold)
        key = (metrics["f1_score"], metrics["precision"], metrics["recall"])
        if best is None or key > best[0]:
            best = (key, threshold, metrics)
    return best[1], best[2]


def run(artifacts_dir: Path, seed: int = DEFAULT_SEED) -> dict[str, object]:
    all_train_features = read_features(artifacts_dir / "train_features.csv")
    all_train_labels = read_labels(artifacts_dir / "train_labels.csv")
    test_features = read_features(artifacts_dir / "evaluation_features.csv")
    test_labels = read_labels(artifacts_dir / "evaluation_labels.csv")
    fit_features, validation_features, fit_labels, validation_labels = train_test_split(
        all_train_features, all_train_labels, test_size=0.2, stratify=all_train_labels, random_state=seed
    )
    pipeline = train_model(fit_features, seed)
    threshold, validation_metrics = select_threshold(validation_labels, pipeline.score_samples(validation_features))
    final_test_metrics = evaluate_scores(test_labels, pipeline.score_samples(test_features), threshold)
    previous_metrics_path = artifacts_dir / "isolation_forest_v1_metrics.json"
    previous_metrics = json.loads(previous_metrics_path.read_text(encoding="utf-8"))["metrics"] if previous_metrics_path.exists() else None
    bundle = {
        "pipeline": pipeline,
        "feature_columns": list(FEATURE_COLUMNS),
        "feature_definitions": {
            "amount": "Raw dataset-unit amount; source currency unit is undocumented.",
            "hour_of_day": "One-hot encoded, 0 through 23.",
            "day_of_week": "One-hot encoded, Monday=0 through Sunday=6.",
        },
        "score_threshold": threshold,
        "prediction_mapping": {"score <= threshold": "anomaly/suspicious", "score > threshold": "normal"},
        "configuration": {"n_estimators": 100, "contamination": "auto", "random_state": seed, "n_jobs": 1},
    }
    dump(bundle, artifacts_dir / MODEL_FILENAME)
    report = {
        "model_artifact": MODEL_FILENAME,
        "split": {"fit_rows": len(fit_labels), "validation_rows": len(validation_labels), "final_test_rows": len(test_labels), "seed": seed},
        "validation": validation_metrics,
        "final_test": final_test_metrics,
        "previous_v1_final_test": previous_metrics,
        "method": "raw amount plus one-hot hour and weekday; threshold selected on validation F1 from 1%-50% flag-rate candidates",
    }
    (artifacts_dir / METRICS_FILENAME).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts-dir", type=Path, default=root / "ai-service/artifacts")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    args = parser.parse_args()
    print(json.dumps(run(args.artifacts_dir, args.seed), indent=2))


if __name__ == "__main__":
    main()
