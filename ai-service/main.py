"""Advisory-only HTTP wrapper around PayWise anomaly-model artifacts."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from joblib import load
from pydantic import BaseModel, field_validator

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
V2_FEATURE_COLUMNS = ("amount", "hour_of_day", "day_of_week")
SYNTHETIC_FEATURE_COLUMNS = ("amount", "hour_of_day")
DEFAULT_MODEL_SELECTION = "synthetic_recall_60"
MODEL_SPECS = {
    "v2": {"artifact": "isolation_forest_v2.joblib", "feature_columns": V2_FEATURE_COLUMNS},
    "synthetic_recall_60": {
        "artifact": "isolation_forest_synthetic_recall_thresholds.joblib",
        "metrics": "isolation_forest_synthetic_recall_thresholds_metrics.json",
        "feature_columns": SYNTHETIC_FEATURE_COLUMNS,
        "recall_target": "60%",
    },
}


class PredictionRequest(BaseModel):
    # day_of_week remains required for wire compatibility with V2. The synthetic
    # model intentionally ignores it because it was not trained on that feature.
    amount: float
    hour_of_day: int
    day_of_week: int

    @field_validator("amount", mode="before")
    @classmethod
    def validate_amount(cls, value: Any) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("amount must be numeric")
        value = float(value)
        if not math.isfinite(value) or value <= 0:
            raise ValueError("amount must be finite and greater than zero")
        return value

    @field_validator("hour_of_day", "day_of_week", mode="before")
    @classmethod
    def validate_integer(cls, value: Any) -> int:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or int(value) != value:
            raise ValueError("must be an integer")
        return int(value)

    @field_validator("hour_of_day")
    @classmethod
    def validate_hour(cls, value: int) -> int:
        if not 0 <= value <= 23:
            raise ValueError("hour_of_day must be between 0 and 23")
        return value

    @field_validator("day_of_week")
    @classmethod
    def validate_weekday(cls, value: int) -> int:
        # Matches preprocessing: Python datetime.weekday(), Monday=0 through Sunday=6.
        if not 0 <= value <= 6:
            raise ValueError("day_of_week must be between 0 and 6")
        return value


def selected_model_name(model_selection: str | None = None) -> str:
    name = (model_selection or os.getenv("PAYWISE_AI_MODEL", DEFAULT_MODEL_SELECTION)).strip().lower()
    if name not in MODEL_SPECS:
        raise ValueError(f"Unsupported PAYWISE_AI_MODEL selection: {name}")
    return name


class ModelService:
    def __init__(self, model_selection: str | None = None, artifacts_dir: Path = ARTIFACTS_DIR, model_path: Path | None = None):
        self.pipeline = None
        self.threshold = None
        self.feature_columns: tuple[str, ...] = ()
        self.model_selection = "custom" if model_path is not None else "unavailable"
        try:
            if model_path is not None:
                # Backward-compatible custom-path support for the V2 bundle shape.
                spec = {"feature_columns": V2_FEATURE_COLUMNS}
                path = model_path
            else:
                self.model_selection = selected_model_name(model_selection)
                spec = MODEL_SPECS[self.model_selection]
                path = artifacts_dir / spec["artifact"]
            bundle = load(path)
            expected_features = list(spec["feature_columns"])
            if bundle.get("feature_columns") != expected_features:
                raise ValueError("Unexpected model feature order")
            self.pipeline = bundle["pipeline"]
            self.feature_columns = tuple(expected_features)
            if "recall_target" in spec:
                self.threshold = self._load_synthetic_threshold(bundle, artifacts_dir / spec["metrics"], spec["recall_target"])
            else:
                self.threshold = float(bundle["score_threshold"])
        except Exception:
            # Do not expose loading details or local paths through API responses.
            self.pipeline = None
            self.threshold = None
            self.feature_columns = ()

    @staticmethod
    def _load_synthetic_threshold(bundle: dict[str, object], metrics_path: Path, recall_target: str) -> float:
        thresholds = bundle.get("score_thresholds_by_validation_recall_target")
        if not isinstance(thresholds, dict) or thresholds.get(recall_target) is None:
            raise ValueError("Synthetic artifact has no selected recall threshold")
        metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
        if metrics.get("feature_columns") != bundle.get("feature_columns") or not metrics.get("dataset", {}).get("synthetic"):
            raise ValueError("Synthetic metrics do not match the artifact configuration")
        experiment = metrics.get("experiments", {}).get(recall_target, {})
        validation = experiment.get("validation", {})
        if not experiment.get("target_achieved") or validation.get("score_threshold") is None:
            raise ValueError("Synthetic metrics do not validate the selected recall threshold")
        threshold = float(thresholds[recall_target])
        if not math.isclose(threshold, float(validation["score_threshold"]), rel_tol=0, abs_tol=1e-12):
            raise ValueError("Synthetic artifact and metrics thresholds differ")
        return threshold

    @property
    def available(self) -> bool:
        return self.pipeline is not None and self.threshold is not None

    def predict(self, request: PredictionRequest) -> bool:
        if not self.available:
            raise RuntimeError("Model unavailable")
        values = {"amount": request.amount, "hour_of_day": request.hour_of_day, "day_of_week": request.day_of_week}
        features = [[values[column] for column in self.feature_columns]]
        # Isolation Forest's lower score_samples values are more anomalous.
        return bool(self.pipeline.score_samples(features)[0] <= self.threshold)


def create_app(model_path: Path | None = None, model_selection: str | None = None, artifacts_dir: Path = ARTIFACTS_DIR) -> FastAPI:
    app = FastAPI(title="PayWise AI Prototype", version="0.1.0")
    app.state.model_service = ModelService(model_selection, artifacts_dir, model_path)

    @app.get("/health")
    def health() -> dict[str, object]:
        available = app.state.model_service.available
        return {"status": "ok" if available else "unavailable", "model_loaded": available}

    @app.post("/predict")
    def predict(request: PredictionRequest) -> dict[str, object]:
        service = app.state.model_service
        if not service.available:
            raise HTTPException(status_code=503, detail="Anomaly model is unavailable.")
        try:
            is_anomaly = service.predict(request)
        except Exception:
            raise HTTPException(status_code=503, detail="Anomaly model is unavailable.") from None
        return {
            "is_anomaly": is_anomaly,
            "prediction": "suspicious" if is_anomaly else "normal",
            "message": "This is an experimental anomaly signal, not confirmation of fraud.",
        }

    return app


app = create_app()
