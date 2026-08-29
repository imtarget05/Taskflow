"""Phase 2-A.1 — Train supply-chain models on REAL TaskFlow data.

Reads live features from the PostgreSQL TaskFlow DB
  suppliers / orders / line_items
and derives the model inputs used by the FastAPI endpoints
  (lead_time_std, defect_rate, on_time_rate).

When the DB is empty (fresh dev seed) it falls back to a synthetic dataset
that mirrors the real schema so the pipeline is always runnable; the run is
tagged data_source=synthetic for transparency. Seed real DB data and re-run
to switch to data_source=db.

Trains + registers v2 for: supplier_risk, anomaly_detection.
(prophet_forecasting is owned by train_prophet.py — kept separate to avoid flavor clash.)

Usage: MLFLOW_TRACKING_URI=http://127.0.0.1:5000 .venv/bin/python mlops/train_models_from_db.py
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd
import mlflow
import mlflow.sklearn
from mlflow.models import infer_signature
from mlflow.tracking import MlflowClient
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import IsolationForest

MLFLOW_URI = os.environ.get("MLFLOW_TRACKING_URI", "http://127.0.0.1:5000")
DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg2://taskflow:taskflow@localhost:5432/taskflow",
)


def _synthetic_supplier_data() -> pd.DataFrame:
    rng = np.random.default_rng(99)
    n = 400
    std = rng.uniform(0, 15, n)
    defect = rng.uniform(0, 0.25, n)
    ontime = rng.uniform(0.55, 1.0, n)
    annual = rng.uniform(1000, 60000, n)
    mov = rng.uniform(500, 6000, n)
    risk_score = (std / 15) * 0.35 + defect * 2.0 + (1 - ontime) * 0.4
    label = (risk_score > np.median(risk_score)).astype(int)
    return pd.DataFrame({
        "supplier_id": [f"S{i:04d}" for i in range(n)],
        "lead_time_std": std, "defect_rate": defect, "on_time_rate": ontime,
        "annual_demand": annual, "mean_order_value": mov,
        "label": label,
    })


def load_supplier_features(engine) -> tuple[pd.DataFrame, str]:
    """Pull real supplier features from DB, or bootstrap synthetic matching schema."""
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
    except Exception as exc:  # noqa: BLE001 — DB/conn down
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
    except Exception as exc:  # noqa: BLE001
        print(f"[db] demand read failed ({exc}); synthetic fallback")
        df = pd.DataFrame()
    if len(df) < 30:
        rng = np.random.default_rng(21)
        n = 400
        dates = pd.date_range("2025-01-01", periods=n, freq="D")
        t = np.arange(n)
        demand = (1000 + 0.5 * t + 80 * np.sin(2 * np.pi * t / 7)
                  + 120 * np.sin(2 * np.pi * t / 365) + 120 * (rng.random(n) < 0.1)
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
    except Exception as exc:  # noqa: BLE001
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


def main() -> None:
    mlflow.set_tracking_uri(MLFLOW_URI)
    mlflow.set_experiment("supply_chain")
    from sqlalchemy import create_engine
    engine = create_engine(DB_URL)

    # 1. supplier_risk — real DB features or synthetic; derived risk label
    feats, source = load_supplier_features(engine)
    print(f"[supplier_risk] rows={len(feats)} source={source}")
    if source == "synthetic":
        pass  # label already present
    else:
        feats["label"] = ((feats["lead_time_std"].fillna(0) > 5) |
                          (feats["defect_rate"] > 0.1) |
                          (feats["on_time_rate"] < 0.85)).astype(int)
    X = feats[["lead_time_std", "defect_rate", "on_time_rate"]]
    y = feats["label"]
    risk = LogisticRegression(max_iter=2000).fit(X, y)
    _register("supplier_risk", risk, X, risk.predict(X), source,
              {"model": "LogisticRegression", "features": "lead_time_std,defect_rate,on_time_rate"},
              {"train_accuracy": float(risk.score(X, y))},
              {"domain": "supplier", "framework": "sklearn"})

    # 2. anomaly_detection — order-amount profile
    amounts, asrc = load_amounts(engine)
    print(f"[anomaly_detection] rows={len(amounts)} source={asrc}")
    Xa = amounts[["price", "quantity", "amount"]]
    iso = IsolationForest(random_state=42, contamination=0.08).fit(Xa)
    _register("anomaly_detection", iso, Xa, iso.predict(Xa), asrc,
              {"model": "IsolationForest", "contamination": 0.08},
              {"n_anomalies": int((iso.predict(Xa) == -1).sum())},
              {"domain": "quality", "framework": "sklearn"})

        # NOTE: prophet_forecasting is intentionally NOT registered here.
    # It is owned by train_prophet.py (real Prophet/pyfunc model). Registering a
    # GradientBoostingRegressor under the same name would shadow the Prophet
    # flavor and break mlflow.prophet.load_model in the /forecast endpoint.

    print("\nRegistered:")
    for rm in MlflowClient().search_registered_models():
        ver = rm.latest_versions[0].version if rm.latest_versions else "?"
        print(f"  - {rm.name}  v{ver}")


if __name__ == "__main__":
    main()

