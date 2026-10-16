# PayWise AI service

This is an experimental, advisory-only Isolation Forest service. It never
approves, rejects, blocks, delays, or changes a wallet transaction.

## Dataset and preparation

Place the local CSV at `ai-service/data/paywise_fraud_dataset_50000.csv`, then:

```bash
python3 ai-service/scripts/preprocess_dataset.py
```

Preparation validates 50,000 source rows and writes ignored split files under
`ai-service/artifacts/`. The source has `timestamp`, `amount`, `hour_of_day`,
`day_of_week`, and `is_fraud`; its currency unit, provenance, and transaction
type coverage are not documented. `is_fraud` is used for validation/evaluation,
never as an Isolation Forest input.

## Install, train, and test

From the repository root:

```bash
python3 -m venv ai-service/.venv
ai-service/.venv/bin/python -m pip install -r ai-service/requirements.txt
ai-service/.venv/bin/python ai-service/scripts/train_isolation_forest.py
ai-service/.venv/bin/python -m unittest discover -s ai-service/tests -v
```

Training makes a nested stratified split: 31,999 fit rows, 8,000 validation
rows, and the existing 10,001-row evaluation split remains the final test set.
The model uses 100 Isolation Forest trees, a fixed seed, raw amount, and one-hot
encoded hour (0-23) and weekday (Monday=0 through Sunday=6). The one-hot time
features avoid incorrectly treating late Sunday and early Monday as distant
numeric values.

The score cutoff is selected on validation F1 from candidates that flag 1%-50%
of validation transactions. The saved artifact is
`artifacts/isolation_forest_v2.joblib`; it includes the preprocessing pipeline,
feature order, and selected score threshold. `isolation_forest_v1.joblib` is
left untouched as the previous artifact.

Final held-out test comparison:

| Metric | v1 | v2 |
| --- | ---: | ---: |
| Precision | 3.69% | 3.79% |
| Recall | 45.75% | 50.14% |
| F1 | 6.83% | 7.05% |
| Flagged | 45.24% | 48.23% |

This is only a small improvement. The model still has poor precision because
the available features are weak and the source data lacks user/history context.
It is not suitable for fraud confirmation or payment decisions.

## Precision-threshold experiment

The v2 artifact is preserved. A separate experiment can select the highest
validation precision among score cutoffs whose validation recall is at least
40%, without selecting from final-test labels:

```bash
ai-service/.venv/bin/python ai-service/scripts/evaluate_precision_threshold.py
```

It saves `artifacts/isolation_forest_precision.joblib` and
`artifacts/isolation_forest_precision_metrics.json`. Lower `score_samples()`
values are more anomalous, and both the experiment and API classify a score at
or below the saved threshold as suspicious.

For the supplied data, the 40% recall target is achievable, but the highest
validation precision occurs at the existing v2 threshold (`-0.38738396015733517`).
The final-test result is therefore identical to v2: 3.79% precision, 50.14%
recall, 7.05% F1, and 48.23% flagged. This is an honest no-improvement result;
stricter low-alert thresholds reduce both recall and precision on validation.

## Synthetic amount-and-time experiment

`synthetic_transactions_amount_time.csv` is a separate synthetic dataset with
only `amount`, `hour_of_day`, and `is_fraud`. Train its separate experiment
with:

```bash
ai-service/.venv/bin/python ai-service/scripts/train_synthetic_isolation_forest.py
```

It uses only amount and hour as model inputs; `is_fraud` is excluded from
fitting and used only to select the validation threshold and evaluate the
held-out test set. It writes `artifacts/isolation_forest_synthetic.joblib` and
`artifacts/isolation_forest_synthetic_metrics.json`. The data is synthetic, so
these results do not establish real-world fraud-detection performance. This
experiment does not affect the API, which continues to load the V2 artifact.

To compare higher-recall thresholds selected only from the synthetic
experiment's validation split, run:

```bash
ai-service/.venv/bin/python ai-service/scripts/evaluate_synthetic_recall_thresholds.py
```

It preserves the baseline artifacts and writes
`artifacts/isolation_forest_synthetic_recall_thresholds.joblib` and
`artifacts/isolation_forest_synthetic_recall_thresholds_metrics.json`. It
evaluates validation recall targets of 60%, 70%, and 80%; raised recall can
increase legitimate-transaction alerts, reduce precision, and raise the false
positive rate. These remain synthetic-data results, not evidence of real-world
fraud-detection performance.

## Active API model and rollback

By default the API loads `isolation_forest_synthetic_recall_thresholds.joblib`
using its validated `"60%"` threshold from
`isolation_forest_synthetic_recall_thresholds_metrics.json`. That model uses
only `amount` followed by `hour_of_day`; the existing `day_of_week` request
field remains required for V2 API compatibility and is ignored by this model.

To revert without deleting or changing any artifact, start FastAPI with V2:

```bash
PAYWISE_AI_MODEL=v2 ai-service/.venv/bin/python -m uvicorn main:app --app-dir ai-service --reload
```

Set `PAYWISE_AI_MODEL=synthetic_recall_60` (or omit it) to use the default
synthetic experiment again. The loader verifies that the saved 60% threshold
and its metrics agree before it serves predictions. Both choices remain
advisory only; the synthetic result does not demonstrate real-world fraud
detection accuracy.

## Run the API

The API loads the selected saved artifact; it does not retrain:

```bash
ai-service/.venv/bin/python -m uvicorn main:app --app-dir ai-service --reload
```

```bash
curl http://127.0.0.1:8000/health
curl -X POST http://127.0.0.1:8000/predict \
  -H 'Content-Type: application/json' \
  -d '{"amount": 12.0, "hour_of_day": 10, "day_of_week": 0}'
```

`/predict` returns `is_anomaly`, `prediction`, and an advisory message. PayWise
stores wallet amounts in paise and its Node service converts them to a decimal
rupee magnitude before calling this endpoint. That is scale alignment only; the
dataset's actual amount unit remains unverified.
