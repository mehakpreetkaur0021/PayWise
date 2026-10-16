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

## Run the API

The API loads the trained v2 artifact; it does not retrain:

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
