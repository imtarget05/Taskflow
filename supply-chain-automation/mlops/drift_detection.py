"""Phase 4 — Data drift detection (weekly job).

Computes Population Stability Index (PSI) between a training reference sample
and the current live sample for the demand-forecast feature set, then logs the
result to MLflow so the dashboard / alerting can pick it up.

Convention: PSI < 0.1 = stable, 0.1-0.25 = moderate drift, > 0.25 = severe drift.

Usage (cron / weekly):
  MLFLOW_TRACKING_URI=http://127.0.0.1:5000 \
    .venv/bin/python mlops/drift_detection.py --current path/to/live.csv
Or run the built-in demo: .venv/bin/python mlops/drift_detection.py
"""
from __future__ import annotations

import argparse
import os

import numpy as np
import pandas as pd
import mlflow

MLFLOW_URI = os.environ.get("MLFLOW_TRACKING_URI", "http://127.0.0.1:5000")
FEATURES = ["day_of_week", "month", "promo", "lag_7"]

MODEL_ALIASES = {
    "prophet_forecasting": "challenger",
    "supplier_risk": "challenger",
    "anomaly_detection": "challenger",
    "eoq_inventory": "challenger",
}


def psi(expected: np.ndarray, actual: np.ndarray, bins: int = 10) -> float:
    """Population Stability Index between two samples."""
    edges = np.quantile(expected, np.linspace(0, 1, bins + 1))
    edges[0], edges[-1] = -np.inf, np.inf
    e_pct = np.histogram(expected, edges)[0] / len(expected)
    a_pct = np.histogram(actual, edges)[0] / max(len(actual), 1)
    e_pct, a_pct = np.clip(e_pct, 1e-6, None), np.clip(a_pct, 1e-6, None)
    return float(np.sum((a_pct - e_pct) * np.log(a_pct / e_pct)))


def compute_drift(reference: pd.DataFrame, current: pd.DataFrame) -> dict:
    return {f: psi(reference[f].values, current[f].values) for f in FEATURES if f in reference and f in current}


def verdict(scores: dict) -> str:
    worst = max(scores.values(), default=0.0)
    return "stable" if worst < 0.1 else "moderate_drift" if worst < 0.25 else "severe_drift"


def demo() -> tuple:
    """Reference = the training distribution; current = shifted distribution."""
    rng = np.random.default_rng(7)
    reference = pd.DataFrame({
        "day_of_week": rng.integers(0, 7, 500),
        "month": rng.integers(1, 13, 500),
        "promo": rng.integers(0, 2, 500),
        "lag_7": rng.normal(100, 20, 500),
    })
    current = reference.copy()
    current["lag_7"] = rng.normal(140, 25, 500)  # simulate demand level shift
    return reference, current


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--current", help="CSV with the live feature sample (demo when omitted)")
    parser.add_argument("--reference", help="CSV with the training feature sample")
    args = parser.parse_args()

    reference = pd.read_csv(args.reference) if args.reference else demo()[0]
    current = pd.read_csv(args.current) if args.current else demo()[1]

    scores = compute_drift(reference, current)
    status = verdict(scores)
    print("PSI per feature:", {k: round(v, 4) for k, v in scores.items()})
    print("Verdict:", status)

    mlflow.set_tracking_uri(MLFLOW_URI)
    mlflow.set_experiment("supply_chain")
    with mlflow.start_run(run_name=f"weekly_drift_check_{status}"):
        mlflow.log_metrics({f"psi_{k}": v for k, v in scores.items()})
        mlflow.set_tag("drift_status", status)
        mlflow.set_tag("job", "weekly_drift_detection")
    print("Logged to MLflow experiment 'supply_chain'.")


if __name__ == "__main__":
    main()
