"""Phase 2 (option C) — Train a REAL Prophet demand-forecasting model.

Synthetic daily time-series (2 years, weekly + yearly seasonality + promo
spikes) → Prophet fit → evaluate MAE on hold-out → log to MLflow with the
prophet flavor → register as a new version of 'prophet_forecasting' and move
the 'challenger' alias to it.

Usage: MLFLOW_TRACKING_URI=http://127.0.0.1:5000 .venv/bin/python mlops/train_prophet.py
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import mlflow
from mlflow.models import infer_signature
from mlflow.tracking import MlflowClient
from prophet import Prophet

MLFLOW_URI = os.environ.get("MLFLOW_TRACKING_URI", "http://127.0.0.1:5000")
MODEL = "prophet_forecasting"


def make_series(n_days: int = 730, seed: int = 13) -> pd.DataFrame:
    """Daily demand: trend + weekly + yearly seasonality + promo spikes + noise."""
    rng = np.random.default_rng(seed)
    dates = pd.date_range(end=datetime(2026, 8, 28), periods=n_days, freq="D")
    t = np.arange(n_days)
    weekly = 8 * np.sin(2 * np.pi * t / 7)
    yearly = 15 * np.sin(2 * np.pi * t / 365)
    trend = 0.02 * t
    promo = (rng.random(n_days) < 0.08).astype(float) * 25
    demand = 100 + trend + weekly + yearly + promo + rng.normal(0, 6, n_days)
    return pd.DataFrame({"ds": dates, "y": demand})


def main() -> None:
    mlflow.set_tracking_uri(MLFLOW_URI)
    mlflow.set_experiment("supply_chain")

    df = make_series()
    train, test = df.iloc[:-60], df.iloc[-60:]

    model = Prophet(
        weekly_seasonality=True,
        yearly_seasonality=True,
        daily_seasonality=False,
        changepoint_prior_scale=0.05,
    )
    model.fit(train)

    future = model.make_future_dataframe(periods=60, freq="D")
    forecast = model.predict(future)
    pred = forecast.iloc[-60:]["yhat"].values
    mae = float(np.abs(pred - test["y"].values).mean())
    print(f"[Prophet] hold-out MAE (60d): {mae:.3f}")

    client = MlflowClient()
    with mlflow.start_run(run_name="prophet_real_train_v2"):
        mlflow.log_params({
            "model": "Prophet",
            "horizon_days": 60,
            "weekly_seasonality": True,
            "yearly_seasonality": True,
            "changepoint_prior_scale": 0.05,
            "train_rows": len(train),
        })
        mlflow.log_metrics({"mae_holdout_60d": mae})
        mlflow.set_tag("framework", "prophet")
        mlflow.set_tag("data", "synthetic_daily_730d")
        mlflow.prophet.log_model(
            model,
            name="model",
            registered_model_name=MODEL,
        )

    versions = client.search_model_versions(f"name='{MODEL}'")
    newest = max(versions, key=lambda v: int(v.version))
    client.set_registered_model_alias(MODEL, "challenger", newest.version)
    print(f"[Prophet] {MODEL} v{newest.version} -> alias 'challenger'")

    # round-trip verification via the registry
    loaded = mlflow.prophet.load_model(f"models:/{MODEL}@challenger")
    check = loaded.predict(pd.DataFrame({"ds": pd.date_range("2026-09-01", periods=3)}))
    print("[Prophet] registry load OK, next-3d forecast:",
          [round(v, 1) for v in check["yhat"].tolist()])


if __name__ == "__main__":
    main()
