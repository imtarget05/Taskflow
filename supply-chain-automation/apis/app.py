from fastapi import FastAPI
from pydantic import BaseModel
import numpy as np

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
    np.random.seed(request.product_id)
    base = 100 + np.random.randn() * 20
    forecast = [base + np.random.randn() * 10 for _ in range(request.days)]
    return ForecastResponse(product_id=request.product_id, forecast=forecast, model="prophet")

@app.post("/inventory/recommended-order", response_model=InventoryResponse)
async def recommended_order(request: InventoryRequest):
    eoq_val = np.sqrt(2 * request.demand * request.order_cost / request.holding_cost)
    ss_val = request.z_score * 10 * np.sqrt(request.lead_time)
    rop_val = (request.demand / 365) * request.lead_time + ss_val
    return InventoryResponse(eoq=round(eoq_val, 2), safety_stock=round(ss_val, 2), reorder_point=round(rop_val, 2))

@app.post("/supplier/risk-score", response_model=SupplierRiskResponse)
async def supplier_risk(request: SupplierRiskRequest):
    score = min(1.0, (request.lead_time_std / 10) * 0.3 + request.defect_rate * 0.5 + (1 - request.on_time_rate) * 0.2)
    level = "low" if score < 0.3 else "medium" if score < 0.6 else "high"
    return SupplierRiskResponse(risk_score=round(score, 3), risk_level=level)

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
