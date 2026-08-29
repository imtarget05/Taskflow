import os

from fastapi import FastAPI
from pydantic import BaseModel
import numpy as np
import pandas as pd

app = FastAPI(
    title="Supply Chain Analytics API",
    description="Demand forecasting, inventory optimization, supplier risk, route optimization APIs"
)

class ForecastRequest(BaseModel):
    product_id: int
    days: int = 30

class ForecastResponse(BaseModel):
    product_id: int
    forecast: list
    model: str

class InventoryRequest(BaseModel):
    demand: float
    order_cost: float
    holding_cost: float
    lead_time: float = 5.0
    z_score: float = 1.65

class InventoryResponse(BaseModel):
    eoq: float
    safety_stock: float
    reorder_point: float

class SupplierRiskRequest(BaseModel):
    lead_time_std: float
    defect_rate: float
    on_time_rate: float

class SupplierRiskResponse(BaseModel):
    risk_score: float
    risk_level: str

@app.get("/health")
async def health():
    return {"status": "ok", "service": "supply-chain-api"}

@app.post("/forecast", response_model=ForecastResponse)
async def forecast(request: ForecastRequest):
    """Real Prophet forecast from the MLflow registry, with synthetic fallback."""
    try:
        import pandas as pd
        from datetime import datetime
        model = _get_cached("prophet")
        future = pd.DataFrame({"ds": pd.date_range(datetime.utcnow(), periods=request.days, freq="D")})
        fc = model.predict(future)
        vals = fc["yhat"].tolist() if hasattr(fc, "__getitem__") and "yhat" in fc else fc.tolist()
        return ForecastResponse(product_id=request.product_id,
                                forecast=[round(float(v), 2) for v in vals],
                                model="prophet")
    except Exception as exc:  # noqa: BLE001 — registry/server unavailable -> fallback
        print(f"[forecast] Prophet unavailable ({exc}); using synthetic baseline")
    np.random.seed(request.product_id)
    base = 100 + np.random.randn() * 20
    forecast_vals = [base + np.random.randn() * 10 for _ in range(request.days)]
    return ForecastResponse(product_id=request.product_id, forecast=forecast_vals, model="prophet-fallback")


# ---------------------------------------------------------------------------
# Model loaders (cached) — serve registered MLflow models instead of mocks
# ---------------------------------------------------------------------------

@app.post("/inventory/recommended-order", response_model=InventoryResponse)
async def recommended_order(request: InventoryRequest):
    """EOQ/order recommendation: real mlflow model + formula fallback."""
    try:
        import mlflow
        mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "http://127.0.0.1:5000"))
        model = _get_cached("eoq")
        inp = pd.DataFrame([{
            "annual_demand": request.demand,
            "order_cost": request.order_cost,
            "holding_cost": request.holding_cost,
        }])
        eoq_val = float(model.predict(inp)[0])
    except Exception as exc:  # noqa: BLE001 - fallback to closed-form
        print(f"[inventory] model unavailable ({exc}); formula fallback")
        eoq_val = float(np.sqrt(2 * request.demand * request.order_cost / request.holding_cost))
    daily = request.demand / 365.0
    ss_val = request.z_score * daily * (request.lead_time ** 0.5)
    rop_val = daily * request.lead_time + ss_val
    return InventoryResponse(eoq=round(eoq_val, 2),
                             safety_stock=round(float(ss_val), 2),
                             reorder_point=round(float(rop_val), 2))


@app.post("/supplier/risk-score", response_model=SupplierRiskResponse)
async def supplier_risk(request: SupplierRiskRequest):
    """Supplier risk via registered LogisticRegression; score in [0,1]."""
    try:
        import mlflow
        mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "http://127.0.0.1:5000"))
        model = _get_cached("risk")
        inp = pd.DataFrame([{
            "lead_time_std": request.lead_time_std,
            "defect_rate": request.defect_rate,
            "on_time_rate": request.on_time_rate,
        }])
        score = float(model.predict_proba(inp)[0][1])  # P(risk=high)
        level = "low" if score < 0.3 else "medium" if score < 0.6 else "high"
        return SupplierRiskResponse(risk_score=round(score, 3), risk_level=level)
    except Exception as exc:  # noqa: BLE001 — formula fallback
        print(f"[supplier/risk] model unavailable ({exc}); formula fallback")
        score = min(1.0, (request.lead_time_std / 10) * 0.3
                    + request.defect_rate * 0.5 + (1 - request.on_time_rate) * 0.2)
        level = "low" if score < 0.3 else "medium" if score < 0.6 else "high"
        return SupplierRiskResponse(risk_score=round(score, 3), risk_level=level)


# ---------------------------------------------------------------------------
# Model loaders (cached) — serve registered MLflow models instead of mocks
# ---------------------------------------------------------------------------
_CACHE: dict = {}


def _get_cached(kind: str):
    """Load (and cache 10 min) the requested registered model.

    kind: 'prophet' | 'eoq' | 'risk'  -> models:/<name>@challenger
    """
    import mlflow
    import time as _t
    mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "http://127.0.0.1:5000"))
    now = _t.time()
    entry = _CACHE.get(kind)
    if entry and now - entry["ts"] < 600:
        return entry["model"]
    mapping = {
        "prophet": ("prophet_forecasting", mlflow.prophet.load_model),
        "eoq":     ("eoq_inventory", mlflow.sklearn.load_model),
        "risk":    ("supplier_risk", mlflow.sklearn.load_model),
    }
    name, loader = mapping[kind]
    # Serve the production alias (source of truth); gracefully fall back to the
    # challenger alias so the API works even before a model is promoted.
    for alias in ("production", "challenger"):
        try:
            model = loader(f"models:/{name}@{alias}")
            _CACHE[kind] = {"model": model, "ts": now}
            return model
        except Exception as exc:  # noqa: BLE001 — alias or model unavailable, try next
            _CACHE[kind] = {"error": str(exc), "ts": now}
    raise RuntimeError(f"{name}: no production/challenger model available")

@app.get("/metrics")
async def metrics():
    return {
        "inventory_turnover_example": 6.5,
        "fill_rate_example": 94.2,
        "otif_example": 88.5
    }

# ---------------------------------------------------------------------------
# Phase 3 — LangGraph agent: 4-column Kanban workflow
# PO_Received → Approval → Fulfillment → Shipment
# ---------------------------------------------------------------------------
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "mlops"))
from agent_workflow import run as agent_run  # noqa: E402


class AgentRequest(BaseModel):
    order_id: str
    message: str


@app.post("/agent/process-order")
async def agent_process_order(request: AgentRequest):
    return {"status": "ok", "data": agent_run(request.order_id, request.message)}
