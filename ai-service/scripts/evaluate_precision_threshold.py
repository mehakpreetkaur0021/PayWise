#!/usr/bin/env python3
"""Create a precision-focused threshold experiment from the preserved v2 model."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from joblib import dump, load
from sklearn.model_selection import train_test_split

from train_isolation_forest import DEFAULT_SEED, evaluate_scores, read_features, read_labels

V2_MODEL_FILENAME = "isolation_forest_v2.joblib"
V2_METRICS_FILENAME = "isolation_forest_v2_metrics.json"
EXPERIMENT_MODEL_FILENAME = "isolation_forest_precision.joblib"
EXPERIMENT_METRICS_FILENAME = "isolation_forest_precision_metrics.json"
CANDIDATE_FLAG_RATES = tuple(rate / 100 for rate in range(1, 51))


def build_validation_table(labels, scores, candidate_rates=CANDIDATE_FLAG_RATES):
    table = []
    for rate in candidate_rates:
        threshold = float(np.quantile(scores, rate))
        metrics = evaluate_scores(labels, scores, threshold)
        table.append({"candidate_flag_rate": rate, **metrics})
    return table


def select_precision_threshold(table, minimum_recall):
    qualifying = [row for row in table if row["recall"] >= minimum_recall]
    if qualifying:
        # Higher precision wins; then fewer alerts; then higher recall; then a
        # stricter (lower) score cutoff. This makes selection deterministic.
        return max(
            qualifying,
            key=lambda row: (row["precision"], -row["anomalies_flagged"], row["recall"], -row["score_threshold"]),
        ), True
    # If the recall constraint is impossible, use the most balanced validation
    # option without consulting final-test labels.
    return max(
        table,
        key=lambda row: (row["f1_score"], row["precision"], row["recall"], -row["anomalies_flagged"]),
    ), False


def save_experiment_bundle(source_bundle, output_path, selected_row, minimum_recall):
    experiment_bundle = dict(source_bundle)
    experiment_bundle["score_threshold"] = selected_row["score_threshold"]
    experiment_bundle["threshold_strategy"] = {
        "name": "highest_validation_precision_at_minimum_recall",
        "minimum_recall": minimum_recall,
        "candidate_flag_rates": list(CANDIDATE_FLAG_RATES),
    }
    dump(experiment_bundle, output_path)


def run(artifacts_dir: Path, minimum_recall: float = 0.40, seed: int = DEFAULT_SEED):
    if not 0 < minimum_recall <= 1:
        raise ValueError("minimum_recall must be greater than 0 and at most 1")
    source_model_path = artifacts_dir / V2_MODEL_FILENAME
    source_metrics_path = artifacts_dir / V2_METRICS_FILENAME
    source_bundle = load(source_model_path)
    train_features = read_features(artifacts_dir / "train_features.csv")
    train_labels = read_labels(artifacts_dir / "train_labels.csv")
    _, validation_features, _, validation_labels = train_test_split(
        train_features, train_labels, test_size=0.2, stratify=train_labels, random_state=seed
    )
    validation_scores = source_bundle["pipeline"].score_samples(validation_features)
    table = build_validation_table(validation_labels, validation_scores)
    selected_row, target_achieved = select_precision_threshold(table, minimum_recall)

    test_features = read_features(artifacts_dir / "evaluation_features.csv")
    test_labels = read_labels(artifacts_dir / "evaluation_labels.csv")
    final_test = evaluate_scores(test_labels, source_bundle["pipeline"].score_samples(test_features), selected_row["score_threshold"])
    v2_final_test = json.loads(source_metrics_path.read_text(encoding="utf-8"))["final_test"]
    save_experiment_bundle(source_bundle, artifacts_dir / EXPERIMENT_MODEL_FILENAME, selected_row, minimum_recall)
    report = {
        "source_model": V2_MODEL_FILENAME,
        "experiment_model": EXPERIMENT_MODEL_FILENAME,
        "minimum_recall": minimum_recall,
        "minimum_recall_achieved_on_validation": target_achieved,
        "selected_validation_threshold": selected_row,
        "validation_comparison": table,
        "v2_final_test": v2_final_test,
        "precision_experiment_final_test": final_test,
    }
    (artifacts_dir / EXPERIMENT_METRICS_FILENAME).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main():
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts-dir", type=Path, default=root / "ai-service/artifacts")
    parser.add_argument("--minimum-recall", type=float, default=0.40)
    args = parser.parse_args()
    print(json.dumps(run(args.artifacts_dir, args.minimum_recall), indent=2))


if __name__ == "__main__":
    main()
