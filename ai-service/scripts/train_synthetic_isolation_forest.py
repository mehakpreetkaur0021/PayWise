#!/usr/bin/env python3
"""Train a separate, synthetic-data Isolation Forest experiment for PayWise."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
from joblib import dump, load
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import IsolationForest
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

FEATURE_COLUMNS = ("amount", "hour_of_day")
LABEL_COLUMN = "is_fraud"
EXPECTED_COLUMNS = (*FEATURE_COLUMNS, LABEL_COLUMN)
DEFAULT_SEED = 20261016
MODEL_FILENAME = "isolation_forest_synthetic.joblib"
METRICS_FILENAME = "isolation_forest_synthetic_metrics.json"
MINIMUM_RECALL = 0.40


class InputValidationError(ValueError):
    pass


def read_dataset(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Read the synthetic source, keeping labels separate from model features."""
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != list(EXPECTED_COLUMNS):
            raise InputValidationError(f"{path.name} must contain {EXPECTED_COLUMNS} in that order")
        try:
            records = [
                ([float(row[column]) for column in FEATURE_COLUMNS], int(row[LABEL_COLUMN]))
                for row in reader
            ]
        except (TypeError, ValueError) as error:
            raise InputValidationError(f"Invalid value in {path.name}") from error
    if not records:
        raise InputValidationError(f"{path.name} has no usable rows")
    rows, labels = zip(*records)
    features = np.asarray(rows, dtype=float)
    targets = np.asarray(labels, dtype=int)
    if not np.isfinite(features).all() or (features[:, 0] <= 0).any() or not np.isin(features[:, 1], np.arange(24)).all():
        raise InputValidationError("amount must be positive and hour_of_day must be an integer from 0 through 23")
    if not set(targets).issubset({0, 1}) or len(set(targets)) != 2:
        raise InputValidationError("is_fraud must contain both 0 and 1 labels")
    return features, targets


def split_dataset(features: np.ndarray, labels: np.ndarray, seed: int = DEFAULT_SEED):
    """Create reproducible 60%/20%/20% stratified train/validation/test splits."""
    train_features, temporary_features, train_labels, temporary_labels = train_test_split(
        features, labels, test_size=0.4, stratify=labels, random_state=seed
    )
    validation_features, test_features, validation_labels, test_labels = train_test_split(
        temporary_features, temporary_labels, test_size=0.5, stratify=temporary_labels, random_state=seed + 1
    )
    return train_features, validation_features, test_features, train_labels, validation_labels, test_labels


def make_pipeline(seed: int = DEFAULT_SEED) -> Pipeline:
    preprocessing = ColumnTransformer([
        ("amount", "passthrough", [0]),
        ("hour", OneHotEncoder(categories=[np.arange(24)], handle_unknown="ignore"), [1]),
    ])
    return Pipeline([
        ("preprocess", preprocessing),
        ("model", IsolationForest(n_estimators=100, contamination="auto", random_state=seed, n_jobs=1)),
    ])


def train_model(train_features: np.ndarray, seed: int = DEFAULT_SEED) -> Pipeline:
    """Fit only the two-column training feature matrix; labels are never passed to fit."""
    return make_pipeline(seed).fit(train_features)


def evaluate_scores(labels: np.ndarray, scores: np.ndarray, threshold: float) -> dict[str, object]:
    predictions = (scores <= threshold).astype(int)
    precision, recall, f1, _ = precision_recall_fscore_support(labels, predictions, average="binary", zero_division=0)
    return {
        "score_threshold": float(threshold),
        "precision": float(precision),
        "recall": float(recall),
        "f1_score": float(f1),
        "confusion_matrix": {"rows_actual_0_1_columns_predicted_normal_suspicious": confusion_matrix(labels, predictions, labels=[0, 1]).tolist()},
        "transactions_flagged": int(predictions.sum()),
        "transactions_flagged_percentage": float(predictions.mean() * 100),
    }


def select_precision_threshold(labels: np.ndarray, scores: np.ndarray, minimum_recall: float = MINIMUM_RECALL):
    """Maximize precision subject to validation recall >= minimum_recall, if possible."""
    candidates = [evaluate_scores(labels, scores, float(threshold)) for threshold in np.unique(scores)]
    eligible = [row for row in candidates if row["recall"] >= minimum_recall]
    target_achieved = bool(eligible)
    pool = eligible if eligible else candidates
    # If recall is unattainable, use the most recall, then precision, then F1; all ties are deterministic.
    selected = max(pool, key=lambda row: (row["precision"], -row["transactions_flagged"], row["recall"], row["f1_score"], -row["score_threshold"])) if eligible else max(
        pool, key=lambda row: (row["recall"], row["precision"], row["f1_score"], -row["transactions_flagged"], -row["score_threshold"])
    )
    return selected, target_achieved


def save_artifacts(artifacts_dir: Path, bundle: dict[str, object], report: dict[str, object]) -> None:
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    dump(bundle, artifacts_dir / MODEL_FILENAME)
    (artifacts_dir / METRICS_FILENAME).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def run(data_path: Path, artifacts_dir: Path, seed: int = DEFAULT_SEED) -> dict[str, object]:
    features, labels = read_dataset(data_path)
    train_features, validation_features, test_features, train_labels, validation_labels, test_labels = split_dataset(features, labels, seed)
    pipeline = train_model(train_features, seed)
    selected_validation, target_achieved = select_precision_threshold(
        validation_labels, pipeline.score_samples(validation_features)
    )
    test_metrics = evaluate_scores(test_labels, pipeline.score_samples(test_features), selected_validation["score_threshold"])
    bundle = {
        "pipeline": pipeline,
        "feature_columns": list(FEATURE_COLUMNS),
        "score_threshold": selected_validation["score_threshold"],
        "configuration": {"n_estimators": 100, "contamination": "auto", "random_state": seed, "n_jobs": 1},
        "dataset": {"path": data_path.name, "synthetic": True},
        "prediction_mapping": {"score <= threshold": "anomaly/suspicious", "score > threshold": "normal"},
    }
    report = {
        "model_artifact": MODEL_FILENAME,
        "dataset": {"path": str(data_path), "synthetic": True, "disclaimer": "This synthetic dataset and its results do not establish real-world fraud-detection performance."},
        "feature_columns": list(FEATURE_COLUMNS),
        "label_usage": "is_fraud is excluded from Isolation Forest fitting and used only for validation threshold selection and held-out test evaluation.",
        "configuration": bundle["configuration"],
        "split": {"strategy": "stratified 60/20/20 train/validation/held-out-test", "seed": seed, "train_rows": len(train_labels), "validation_rows": len(validation_labels), "held_out_test_rows": len(test_labels)},
        "threshold_selection": {"objective": "highest validation precision with recall >= 40%", "minimum_recall": MINIMUM_RECALL, "target_achieved": target_achieved, "selected_validation_metrics": selected_validation},
        "held_out_test": test_metrics,
    }
    save_artifacts(artifacts_dir, bundle, report)
    return report


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=root / "ai-service/data/synthetic_transactions_amount_time.csv")
    parser.add_argument("--artifacts-dir", type=Path, default=root / "ai-service/artifacts")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    args = parser.parse_args()
    print(json.dumps(run(args.data, args.artifacts_dir, args.seed), indent=2))


if __name__ == "__main__":
    main()
