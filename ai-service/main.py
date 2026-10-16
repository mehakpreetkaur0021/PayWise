"""Small HTTP wrapper around the saved PayWise anomaly-detection prototype."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from joblib import load
from pydantic import BaseModel, field_validator

FEATURE_COLUMNS = ("amount", "hour_of_day", "day_of_week")
MODEL_PATH = Path(__file__).resolve().parent / "artifacts" / "isolation_forest_v2.joblib"


class PredictionRequest(BaseModel):
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


class ModelService:
    def __init__(self, model_path: Path):
        self.pipeline = None
        self.threshold = None
        try:
            bundle = load(model_path)
            if bundle.get("feature_columns") != list(FEATURE_COLUMNS):
                raise ValueError("Unexpected model feature order")
            self.pipeline = bundle["pipeline"]
            self.threshold = float(bundle["score_threshold"])
        except Exception:
            # Do not expose loading details or local paths through API responses.
            self.pipeline = None
            self.threshold = None

    @property
    def available(self) -> bool:
        return self.pipeline is not None and self.threshold is not None

    def predict(self, request: PredictionRequest) -> bool:
        if not self.available:
            raise RuntimeError("Model unavailable")
        features = [[request.amount, request.hour_of_day, request.day_of_week]]
        return bool(self.pipeline.score_samples(features)[0] <= self.threshold)


def create_app(model_path: Path = MODEL_PATH) -> FastAPI:
    app = FastAPI(title="PayWise AI Prototype", version="0.1.0")
    app.state.model_service = ModelService(model_path)

    @app.get("/health")
    def health() -> dict[str, object]:
        available = app.state.model_service.available
        return {"status": "ok" if available else "unavailable", "model_loaded": available}

    @app.post("/predict")
    def predict(request: PredictionRequest) -> dict[str, object]:
        service = app.state.model_service
        if not service.available:
            raise HTTPException(status_code=503, detail="Anomaly model is unavailable.")
        is_anomaly = service.predict(request)
        return {
            "is_anomaly": is_anomaly,
            "prediction": "suspicious" if is_anomaly else "normal",
            "message": "This is an experimental anomaly signal, not confirmation of fraud.",
        }

    return app


app = create_app()
