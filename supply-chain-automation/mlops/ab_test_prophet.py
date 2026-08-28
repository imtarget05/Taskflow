"""Phase 4 — A/B evaluation of Prophet forecasting model variants.

Trains two variants (baseline GradientBoosting vs. lag-feature ridge) on the
synthetic demand series, evaluates MAE on a hold-out split, registers the
winner as the 'challenger' alias (next version) and logs both to MLflow for
comparison in the UI.

Usage: MLFLOW_TRACKING_URI=http://127.0.0.1:5000 .venv/bin/python mlops/ab_test_prophet.py
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd
import mlflow
import mlflow.sklearn
from mlflow.models import infer_signature
from mlflow.tracking import MlflowClient
from sklearn.linear_model import Ridge
from sklearn.ensemble import GradientBoostingRegressor

MLFLOW_URI = os.environ.get("MLFLOW_TRACKING_URI", "http://127.0.0.1:5000")
MODEL = "prophet_forecasting"


def make_data(n: int = 1200):
    rng = np.random.default_rng(11)
    X = pd.DataFrame({
        "day_of_week": rng.integers(0, 7, n),
        "month": rng.integers(1, 13, n),
        "promo": rng.integers(0, 2, n),
        "lag_7": rng.normal(100, 20, n),
    })
    y = 100 + 8 * X["promo"] + 0.4 * X["lag_7"] + 5 * np.sin(X["day_of_week"]) + rng.normal(0, 8, n)
    return X, y


def mae(model, X, y):
    return float(np.abs(model.predict(X) - y).mean())


def main() -> None:
    mlflow.set_tracking_uri(MLFLOW_URI)
    mlflow.set_experiment("supply_chain")
    client = MlflowClient()

    X, y = make_data()
    cut = int(len(X) * 0.8)
    Xtr, Xva, ytr, yva = X[:cut], X[cut:], y[:cut], y[cut:]

    variants = {
        "baseline_gbr": GradientBoostingRegressor(random_state=42),
        "ridge_lag": Ridge(alpha=1.0),
    }
    results = {}
    for name, model in variants.items():
        model.fit(Xtr, ytr)
        score = mae(model, Xva, yva)
        results[name] = (model, score)
        with mlflow.start_run(run_name=f"ab_prophet_{name}"):
            mlflow.log_params({"variant": name, "model": MODEL})
            mlflow.log_metrics({"mae_validation": score})
        print(f"[AB] {name}: MAE={score:.3f}")

    winner_name = min(results, key=lambda k: results[k][1])
    winner, winner_mae = results[winner_name]
    print(f"[AB] winner = {winner_name} (MAE {winner_mae:.3f})")

    with mlflow.start_run(run_name=f"ab_prophet_winner_{winner_name}"):
        mlflow.log_params({"variant": winner_name, "is_winner": True})
        mlflow.log_metrics({"mae_validation": winner_mae})
        mlflow.sklearn.log_model(
            winner, name="model",
            signature=infer_signature(X, y),
            registered_model_name=MODEL,
        )
    versions = client.search_model_versions(f"name='{MODEL}'")
    newest = max(versions, key=lambda v: int(v.version))
    client.set_registered_model_alias(MODEL, "challenger", newest.version)
    print(f"[AB] {MODEL} v{newest.version} -> alias 'challenger' ({winner_name})")


if __name__ == "__main__":
    main()
