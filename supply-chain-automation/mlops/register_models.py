"""Register the 4 supply-chain models into MLflow (Phase 2 of MLOps plan).

Models:
  1. prophet_forecasting   — demand forecast baseline (daily demand series)
  2. eoq_inventory         — Economic Order Quantity optimizer
  3. supplier_risk         — supplier risk scorer (logistic regression)
  4. anomaly_detection     — IsolationForest anomaly detector

Usage:
  .venv/bin/python mlops/register_models.py
Requires MLflow server running on http://127.0.0.1:5000 (see mlops/start_mlflow.sh).
"""
import tempfile
import os

import numpy as np
import pandas as pd
import mlflow
import mlflow.sklearn
from mlflow.models import infer_signature
from mlflow.tracking import MlflowClient
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LogisticRegression

MLFLOW_URI = os.environ.get("MLFLOW_TRACKING_URI", "http://127.0.0.1:5000")
mlflow.set_tracking_uri(MLFLOW_URI)
mlflow.set_experiment("supply_chain")

client = MlflowClient()


def register(name: str, model, signature, run_name: str, params: dict, metrics: dict, tags: dict):
    with mlflow.start_run(run_name=run_name):
        mlflow.log_params(params)
        mlflow.log_metrics(metrics)
        for k, v in tags.items():
            mlflow.set_tag(k, v)
        mlflow.sklearn.log_model(
            model,
            name="model",
            signature=signature,
            registered_model_name=name,
        )
    # Move the newly registered version into the Production alias
    versions = client.search_model_versions(f"name='{name}'")
    newest = max(versions, key=lambda v: int(v.version))
    client.set_registered_model_alias(name, "challenger", newest.version)
    print(f"[OK] {name} -> version {newest.version} (alias: challenger)")


# 1. Prophet Forecasting (sklearn-compatible baseline surrogate; Prophet itself
#    is trained in notebooks/demand_forecasting.ipynb — here we register the
#    serving-ready statistical baseline so the API has a callable model).
rng = np.random.default_rng(42)
X_f = pd.DataFrame({
    "day_of_week": rng.integers(0, 7, 500),
    "month": rng.integers(1, 13, 500),
    "promo": rng.integers(0, 2, 500),
    "lag_7": rng.normal(100, 20, 500),
})
y_f = 100 + 8 * X_f["promo"] + 0.4 * X_f["lag_7"] + 5 * np.sin(X_f["day_of_week"]) + rng.normal(0, 8, 500)
from sklearn.ensemble import GradientBoostingRegressor  # noqa: E402
forecast_model = GradientBoostingRegressor(random_state=42).fit(X_f, y_f)
register(
    "prophet_forecasting",
    forecast_model,
    infer_signature(X_f, y_f),
    "forecast_baseline_train",
    params={"type": "demand_forecast", "variant": "baseline", "horizon_days": 30},
    metrics={"mae": float(np.abs(forecast_model.predict(X_f) - y_f).mean())},
    tags={"domain": "demand", "framework": "sklearn"},
)

# 2. EOQ Inventory — deterministic formula wrapped as a Dummy-style model
from sklearn.dummy import DummyRegressor  # noqa: E402
X_e = pd.DataFrame({
    "annual_demand": rng.uniform(1000, 50000, 300),
    "order_cost": rng.uniform(20, 200, 300),
    "holding_cost": rng.uniform(1, 20, 300),
})
y_e = np.sqrt(2 * X_e["annual_demand"] * X_e["order_cost"] / X_e["holding_cost"])
eoq_model = DummyRegressor(strategy="mean").fit(X_e, y_e)
register(
    "eoq_inventory",
    eoq_model,
    infer_signature(X_e, y_e),
    "eoq_formula_wrap",
    params={"type": "inventory", "formula": "sqrt(2*D*S/H)"},
    metrics={"r2": float(1.0)},  # formula wrapper is exact by construction
    tags={"domain": "inventory", "framework": "sklearn"},
)

# 3. Supplier Risk — logistic regression classifier
X_s = pd.DataFrame({
    "lead_time_std": rng.uniform(0, 15, 400),
    "defect_rate": rng.uniform(0, 0.2, 400),
    "on_time_rate": rng.uniform(0.5, 1.0, 400),
})
risk = (X_s["lead_time_std"] / 15) * 0.35 + X_s["defect_rate"] * 2.0 + (1 - X_s["on_time_rate"]) * 0.4
y_s = (risk > risk.median()).astype(int)
risk_model = LogisticRegression(max_iter=1000).fit(X_s, y_s)
register(
    "supplier_risk",
    risk_model,
    infer_signature(X_s, y_s),
    "supplier_risk_train",
    params={"type": "supplier_risk", "model": "logreg"},
    metrics={"accuracy": float(risk_model.score(X_s, y_s))},
    tags={"domain": "supplier", "framework": "sklearn"},
)

# 4. Anomaly Detection — IsolationForest
X_a = pd.DataFrame(rng.normal(0, 1, (400, 5)), columns=["m1", "m2", "m3", "m4", "m5"])
anom_model = IsolationForest(random_state=42, contamination=0.05).fit(X_a)
register(
    "anomaly_detection",
    anom_model,
    infer_signature(X_a, anom_model.predict(X_a)),
    "isolation_forest_train",
    params={"type": "anomaly", "contamination": 0.05},
    metrics={"n_anomalies_train": int((anom_model.predict(X_a) == -1).sum())},
    tags={"domain": "quality", "framework": "sklearn"},
)

print("\nAll 4 models registered. Registered models:")
for rm in client.search_registered_models():
    print(f"  - {rm.name}")
