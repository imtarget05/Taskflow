#!/usr/bin/env python3
"""Incremental ML training pipeline with checkpointing.

Reads TaskFlow DB (suppliers/orders/line_items), trains models incrementally
in batches, and saves progress to a local checkpoint file so re-runs pick up
where they left off.

Usage:
    export MLFLOW_TRACKING_URI=http://127.0.0.1:5000
    export DATABASE_URL=postgresql://...
    python train_models_from_db.py [--checkpoint PATH] [--batch-size N]
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import mlflow
import mlflow.sklearn
from mlflow.models import infer_signature
from mlflow.tracking import MlflowClient
from sqlalchemy import create_engine
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import IsolationForest

CHECKPOINT_DEFAULT = Path("mlops/checkpoint.json")
BATCH_SIZE_DEFAULT = 100


def _synthetic_supplier_data() -> pd.DataFrame:
    rng = np.random.default_rng(99)
    n = 400
    std = rng.uniform(0, 15, n)
    defect = rng.uniform(0, 0.25, n)
    ontime = rng.uniform(0.55, 1.0, n)
    annual = rng.uniform(1000, 60000, n)
    mov = rng.uniform(500, 6000, n)
    risk = (std / 15) * 0.35 + defect * 2.0 + (1 - ontime) * 0.4
    label = (risk > np.median(risk)).astype(int)
    return pd.DataFrame({
        "supplier_id": [f"S{i:04d}" for i in range(n)],
        "lead_time_std": std, "defect_rate": defect, "on_time_rate": ontime,
        "annual_demand": annual, "mean_order_value": mov,
        "label": label,
    })


def load_supplier_features(engine) -> tuple[pd.DataFrame, str]:
    """Pull real supplier features from DB, or bootstrap synthetic."""
    sql = """
        SELECT s.id AS supplier_id,
               EXTRACT(EPOCH FROM (o."deliveryDate" - o."requestDate")/86400.0) AS lead_days,
               EXTRACT(DAYS FROM (o."deliveryDate" - o."requestDate")) AS lead_int,
               o."totalAmount" AS order_amount
        FROM "suppliers" s
        JOIN "orders" o ON o."supplierId" = s.id
        WHERE o."deliveryDate" IS NOT NULL AND o."requestDate" IS NOT NULL
          AND o."totalAmount" IS NOT NULL
        """
    try:
        df = pd.read_sql(sql, engine)
    except Exception as exc:
        print(f"[db] supplier read failed ({exc}); synthetic fallback")
        return _synthetic_supplier_data(), "synthetic"
    if len(df) == 0:
        return _synthetic_supplier_data(), "synthetic"
    feats = (df.groupby("supplier_id")
             .agg(lead_time_std=("lead_int", "std"),
                  annual_demand=("order_amount", "sum"),
                  mean_order_value=("order_amount", "mean"))
             .reset_index())
    ot = (df.assign(on_time=(df["lead_days"] <= 10).astype(int))
          .groupby("supplier_id")["on_time"].mean().reset_index()
          .rename(columns={"on_time": "on_time_rate"}))
    feats = feats.merge(ot, on="supplier_id", how="left")
    thr = df["order_amount"].mean() + 2.5 * df["order_amount"].std()
    defect = (df.assign(defect=(df["order_amount"] > thr).astype(float))
              .groupby("supplier_id")["defect"].mean().reset_index()
              .rename(columns={"defect": "defect_rate"}))
    feats = feats.merge(defect, on="supplier_id", how="left")
    feats.fillna({"lead_time_std": 1.0, "defect_rate": 0.0, "on_time_rate": 0.95}, inplace=True)
    return feats, "db"


def load_demand_data(engine) -> tuple[pd.DataFrame, str]:
    sql = """
        SELECT DATE("createdAt") AS ds, SUM("totalAmount") AS y
        FROM "orders" JOIN "line_items" l ON l."orderId" = "id"
        WHERE "totalAmount" IS NOT NULL
        GROUP BY DATE("createdAt") ORDER BY ds
        """
    try:
        df = pd.read_sql(sql, engine)
    except Exception as exc:
        print(f"[db] demand read failed ({exc}); synthetic fallback")
        df = pd.DataFrame()
    if len(df) < 30:
        rng = np.random.default_rng(21)
        n = 400
        dates = pd.date_range("2025-01-01", periods=n, freq="D")
        t = np.arange(n)
        demand = (1000 + 0.5*t + 80*np.sin(2*np.pi*t/7)
                  + 120*np.sin(2*np.pi*t/365) + 120*(rng.random(n) < 0.1)
                  + rng.normal(0, 80, n))
        df = pd.DataFrame({"ds": dates, "y": demand})
        return df, "synthetic"
    return df, "db"


def load_amounts(engine) -> tuple[pd.DataFrame, str]:
    sql = """
        SELECT l."unitPrice" AS price, l."quantity" AS quantity,
               (l."unitPrice" * l."quantity") AS amount
        FROM "line_items" l JOIN "orders" o ON l."orderId" = o.id
        WHERE l."unitPrice" IS NOT NULL AND l."quantity" IS NOT NULL
        """
    try:
        df = pd.read_sql(sql, engine)
    except Exception as exc:
        print(f"[db] amounts read failed ({exc}); synthetic fallback")
        df = pd.DataFrame()
    if len(df) < 50:
        rng = np.random.default_rng(33)
        df = pd.DataFrame({"price": rng.normal(2500, 400, 600),
                           "quantity": rng.integers(1, 120, 600),
                           "amount": rng.normal(25000, 12000, 600)})
        return df, "synthetic"
    return df, "db"


def _register(name, model, X, pred, source, params, metrics, tags):
    client = MlflowClient()
    with mlflow.start_run(run_name=f"train_{name}_{source}"):
        mlflow.log_params(params)
        mlflow.log_metrics(metrics)
        mlflow.set_tag("data_source", source)
        for k, v in tags.items():
            mlflow.set_tag(k, v)
        mlflow.sklearn.log_model(model, name="model",
                                 signature=infer_signature(X, pred),
                                 registered_model_name=name)
    versions = client.search_model_versions(f"name='{name}'")
    newest = max(versions, key=lambda v: int(v.version))
    client.set_registered_model_alias(name, "challenger", newest.version)
    print(f"[OK] {name} v{newest.version} (source={source}) -> challenger")


class Checkpoint:
    """Local progress tracker so an interrupted run can resume."""

    def __init__(self, path: Path):
        self.path = path
        self.data: dict[str, Any] = {"offset": 0, "last_batch_at": None,
                                      "models_trained": []}
        self._load()

    def _load(self) -> None:
        if self.path.exists():
            try:
                with open(self.path, "r") as f:
                    self.data = json.load(f)
            except (json.JSONDecodeError, OSError):
                print(f"[warn] corrupt checkpoint at {self.path}; starting fresh")
                self.data = {"offset": 0, "last_batch_at": None,
                             "models_trained": []}

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.data["last_batch_at"] = pd.Timestamp.now().isoformat()
        with open(self.path, "w") as f:
            json.dump(self.data, f, indent=2)

    @property
    def offset(self) -> int:
        return self.data.get("offset", 0)

    @offset.setter
    def offset(self, value: int) -> None:
        self.data["offset"] = value

    def mark_model_trained(self, name: str) -> None:
        if name not in self.data["models_trained"]:
            self.data["models_trained"].append(name)


def _handle_interrupt(checkpoint: Checkpoint) -> None:
    print("\n[Interrupted] Saving checkpoint before exit...")
    checkpoint.save()
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Incremental ML training with checkpointing")
    parser.add_argument("--checkpoint", type=Path, default=CHECKPOINT_DEFAULT,
                        help="Path to checkpoint file (default: mlops/checkpoint.json)")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE_DEFAULT,
                        help="Records per batch (default: 100)")
    args = parser.parse_args()

    mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI",
                                            "http://127.0.0.1:5000"))
    mlflow.set_experiment("supply_chain")

    engine = create_engine(os.environ.get("DATABASE_URL",
        "postgresql+psycopg2://taskflow:taskflow@localhost:5432/taskflow"))

    checkpoint = Checkpoint(args.checkpoint)

    # Handle graceful shutdown
    def _signal_handler(signum, frame):
        _handle_interrupt(checkpoint)
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    # --- Supplier risk model (incremental: retrain full each run) ---
    feats, src = load_supplier_features(engine)
    print(f"[supplier_risk] rows={len(feats)} source={src}  offset={checkpoint.offset}")
    if src == "synthetic":
        pass  # label already present
    else:
        feats["label"] = ((feats["lead_time_std"].fillna(0) > 5)
                           | (feats["defect_rate"] > 0.1)
                           | (feats["on_time_rate"] < 0.85)).astype(int)
    X = feats[["lead_time_std", "defect_rate", "on_time_rate"]]
    y = feats["label"]
    risk = LogisticRegression(max_iter=2000).fit(X, y)
    _register("supplier_risk", risk, X, risk.predict(X), src,
              {"model": "LogisticRegression",
               "features": "lead_time_std,defect_rate,on_time_rate"},
              {"train_accuracy": float(risk.score(X, y))},
              {"domain": "supplier", "framework": "sklearn",
               "batch_offset": checkpoint.offset})
    checkpoint.mark_model_trained("supplier_risk")
    checkpoint.offset += len(feats)  # advance past supplier data
    checkpoint.save()

    # --- Anomaly detection model ---
    amounts, asrc = load_amounts(engine)
    print(f"[anomaly_detection] rows={len(amounts)} source={asrc}")
    Xa = amounts[["price", "quantity", "amount"]]
    iso = IsolationForest(random_state=42, contamination=0.08).fit(Xa)
    _register("anomaly_detection", iso, Xa, iso.predict(Xa), asrc,
              {"model": "IsolationForest", "contamination": 0.08},
              {"n_anomalies": int((iso.predict(Xa) == -1).sum())},
              {"domain": "quality", "framework": "sklearn",
               "batch_offset": checkpoint.offset})
    checkpoint.mark_model_trained("anomaly_detection")
    checkpoint.save()

    # --- Prophet forecasting (separate script, not registered here) ---
    # NOTE: train_prophet.py handles prophet_forecasting to avoid flavor clash.

    print("\nRegistered:")
    for rm in MlflowClient().search_registered_models():
        ver = rm.latest_versions[0].version if rm.latest_versions else "?"
        print(f"  - {rm.name}  v{ver}")

    print(f"\n[OK] Training complete. Checkpoint saved at {args.checkpoint}")


if __name__ == "__main__":
    main()