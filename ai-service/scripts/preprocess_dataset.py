#!/usr/bin/env python3
"""Validate and reproducibly prepare PayWise's local anomaly dataset."""
from __future__ import annotations
import argparse, csv, json, math, random, shutil
from collections import Counter
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory

REQUIRED_COLUMNS = ("timestamp", "amount", "hour_of_day", "day_of_week", "is_fraud")
FEATURE_COLUMNS = ("amount", "hour_of_day", "day_of_week")
LABEL_COLUMN = "is_fraud"
DEFAULT_SEED, DEFAULT_TRAIN_FRACTION, DEFAULT_MAX_EXCLUDED_FRACTION = 20261016, .8, .01
class DatasetValidationError(ValueError): pass
def parse_timestamp(value):
    if not (value or "").strip(): raise ValueError("missing timestamp")
    try: return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as error: raise ValueError("invalid ISO-8601 timestamp") from error
def parse_amount(value):
    if not (value or "").strip(): raise ValueError("missing amount")
    try: amount = float(value)
    except ValueError as error: raise ValueError("amount is not numeric") from error
    if not math.isfinite(amount) or amount <= 0: raise ValueError("amount must be a finite positive number")
    return amount
def parse_label(value):
    value = (value or "").strip().lower()
    if value in {"true", "1"}: return 1
    if value in {"false", "0"}: return 0
    raise ValueError("is_fraud must be True/False or 1/0")
def load_and_clean(input_path, max_excluded_fraction):
    if not input_path.is_file(): raise DatasetValidationError(f"Input CSV does not exist: {input_path}")
    cleaned, exclusions, missing, mismatches, raw_rows = [], Counter(), Counter(), Counter(), 0
    with input_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None: raise DatasetValidationError("Input CSV is missing a header row")
        absent = [c for c in REQUIRED_COLUMNS if c not in reader.fieldnames]
        if absent: raise DatasetValidationError(f"Input CSV is missing required columns: {', '.join(absent)}")
        for line, row in enumerate(reader, 2):
            raw_rows += 1
            for column in REQUIRED_COLUMNS:
                if not (row.get(column) or "").strip(): missing[column] += 1
            try: timestamp, amount, label = parse_timestamp(row["timestamp"]), parse_amount(row["amount"]), parse_label(row["is_fraud"])
            except ValueError as error: exclusions[str(error)] += 1; continue
            hour, weekday = timestamp.hour, timestamp.weekday()
            for column, expected in (("hour_of_day", hour), ("day_of_week", weekday)):
                try: mismatch = int(row[column]) != expected
                except (ValueError, TypeError): mismatch = True
                if mismatch: mismatches[column] += 1
            cleaned.append({"source_row": line, "timestamp": timestamp.isoformat(), "amount": amount, "hour_of_day": hour, "day_of_week": weekday, LABEL_COLUMN: label})
    if not raw_rows: raise DatasetValidationError("Input CSV has no data rows")
    excluded = raw_rows - len(cleaned)
    if excluded / raw_rows > max_excluded_fraction: raise DatasetValidationError(f"Rejected {excluded}/{raw_rows} rows ({excluded / raw_rows:.2%}), exceeding allowed {max_excluded_fraction:.2%}; review data or raise --max-excluded-fraction.")
    if not cleaned: raise DatasetValidationError("No valid rows remain after validation")
    duplicate_rows = len(cleaned) - len({(r["timestamp"], r["amount"], r["hour_of_day"], r["day_of_week"], r[LABEL_COLUMN]) for r in cleaned})
    return cleaned, {"input_rows": raw_rows, "valid_rows": len(cleaned), "excluded_rows": excluded, "excluded_fraction": excluded / raw_rows, "duplicate_rows": duplicate_rows, "exclusion_reasons": dict(sorted(exclusions.items())), "missing_values_by_column": dict(sorted(missing.items())), "provided_derived_feature_mismatches": dict(sorted(mismatches.items()))}
def stratified_split(rows, train_fraction, seed):
    if not 0 < train_fraction < 1: raise ValueError("train_fraction must be between 0 and 1")
    groups = {0: [], 1: []}
    for row in rows: groups[row[LABEL_COLUMN]].append(row)
    if not groups[0] or not groups[1]: raise DatasetValidationError("Both label classes are required for a stratified split")
    train, evaluation = [], []
    for label, group in groups.items():
        group = group.copy(); random.Random(seed + label).shuffle(group); cut = int(len(group) * train_fraction)
        if cut in (0, len(group)): raise DatasetValidationError(f"Label {label} cannot be represented in both splits")
        train += group[:cut]; evaluation += group[cut:]
    random.Random(seed).shuffle(train); random.Random(seed + 100).shuffle(evaluation)
    return train, evaluation
def distribution(rows):
    count = Counter(row[LABEL_COLUMN] for row in rows)
    return {"non_fraud_0": count[0], "fraud_1": count[1]}
def write_csv(path, fields, rows):
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields); writer.writeheader(); writer.writerows({f: row[f] for f in fields} for row in rows)
def make_report(cleaned, train, evaluation, validation, seed, fraction):
    hours, weekdays = Counter(r["hour_of_day"] for r in cleaned), Counter(r["day_of_week"] for r in cleaned)
    return {"input_schema": list(REQUIRED_COLUMNS), "model_input_features": list(FEATURE_COLUMNS), "label": {"column": LABEL_COLUMN, "purpose": "evaluation only; excluded from feature files and preprocessing fit operations"}, "feature_definitions": {"amount": "Positive numeric source value; currency unit is unspecified.", "hour_of_day": "Integer 0-23 recalculated from timestamp.", "day_of_week": "Integer Monday=0 through Sunday=6 recalculated from timestamp."}, "transaction_type_verification": "Not verifiable: the source CSV has no transaction type column.", "validation": validation, "ranges": {"amount": {"min": min(r["amount"] for r in cleaned), "max": max(r["amount"] for r in cleaned)}, "timestamp": {"min": min(r["timestamp"] for r in cleaned), "max": max(r["timestamp"] for r in cleaned)}}, "transaction_distribution": {"by_hour_of_day": {str(hour): hours[hour] for hour in range(24)}, "by_day_of_week_monday_0": {str(day): weekdays[day] for day in range(7)}}, "splits": {"seed": seed, "train_fraction": fraction, "train_rows": len(train), "evaluation_rows": len(evaluation), "cleaned_label_distribution": distribution(cleaned), "train_label_distribution": distribution(train), "evaluation_label_distribution": distribution(evaluation)}}
def run(input_path, output_dir, seed=DEFAULT_SEED, train_fraction=DEFAULT_TRAIN_FRACTION, max_excluded_fraction=DEFAULT_MAX_EXCLUDED_FRACTION):
    cleaned, validation = load_and_clean(input_path, max_excluded_fraction); train, evaluation = stratified_split(cleaned, train_fraction, seed)
    train_ids, evaluation_ids = {r["source_row"] for r in train}, {r["source_row"] for r in evaluation}
    if train_ids & evaluation_ids or len(train_ids) + len(evaluation_ids) != len(cleaned): raise RuntimeError("Split integrity check failed")
    report = make_report(cleaned, train, evaluation, validation, seed, train_fraction); output_dir.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output_dir.parent, prefix=".prepare-") as temp:
        stage = Path(temp); write_csv(stage / "cleaned_transactions.csv", ("source_row", "timestamp", *FEATURE_COLUMNS, LABEL_COLUMN), cleaned)
        write_csv(stage / "train_features.csv", FEATURE_COLUMNS, train); write_csv(stage / "evaluation_features.csv", FEATURE_COLUMNS, evaluation)
        write_csv(stage / "train_labels.csv", ("source_row", LABEL_COLUMN), train); write_csv(stage / "evaluation_labels.csv", ("source_row", LABEL_COLUMN), evaluation)
        (stage / "dataset_report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8"); (stage / "dataset_report.md").write_text("# Dataset preparation report\n\n" + json.dumps(report, indent=2) + "\n", encoding="utf-8")
        if output_dir.exists(): shutil.rmtree(output_dir)
        shutil.move(str(stage), str(output_dir))
    return report
def main():
    root = Path(__file__).resolve().parents[2]; parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=root / "ai-service/data/paywise_fraud_dataset_50000.csv"); parser.add_argument("--output-dir", type=Path, default=root / "ai-service/artifacts")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED); parser.add_argument("--train-fraction", type=float, default=DEFAULT_TRAIN_FRACTION); parser.add_argument("--max-excluded-fraction", type=float, default=DEFAULT_MAX_EXCLUDED_FRACTION)
    args = parser.parse_args()
    report = run(args.input, args.output_dir, args.seed, args.train_fraction, args.max_excluded_fraction)
    print(json.dumps({"valid_rows": report["validation"]["valid_rows"], "train_rows": report["splits"]["train_rows"], "evaluation_rows": report["splits"]["evaluation_rows"]}, indent=2))
if __name__ == "__main__": main()
