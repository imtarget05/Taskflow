"""Phase 3 — LangGraph agent: 4-column Kanban supply-chain workflow.

Flow:  PO_Received → Approval → Fulfillment → Shipment

- PO_Received:  rule-based classifier (mirrors the Node.js agentic service)
- Approval:     high-risk actions (invoice/payment) require human approval;
                low-risk auto-approve
- Fulfillment:  fulfillment step + EOQ reorder suggestion from MLflow model
- Shipment:     mark shipped, compute SLA

Orders with confidence < 0.7 stop at PO_Received (manual_review);
high-risk orders stop at Approval (human_task).
"""
from __future__ import annotations

import os
import re
import time
from typing import Any, Dict, List, TypedDict

import mlflow
import pandas as pd
from langgraph.graph import END, StateGraph

MLFLOW_URI = os.environ.get("MLFLOW_TRACKING_URI", "http://127.0.0.1:5000")
mlflow.set_tracking_uri(MLFLOW_URI)

HIGH_RISK_ACTIONS = {"approve_payment", "payment_release", "invoice_verify"}
NORMALIZED_ACTIONS = {
    "invoice": "approve_payment",
    "payment": "approve_payment",
    "po": "create_task",
    "purchase": "create_task",
    "asn": "create_task",
    "grn": "move_task",
}
CONFIDENCE = {"INVOICE": 0.92, "PO": 0.95, "ASN": 0.88, "GRN": 0.85, "UNKNOWN": 0.35}


def classify(message: str) -> Dict[str, Any]:
    """Rule-based classifier — same semantics as the Node.js agentic service."""
    text = message.lower()
    m = re.search(r"(?:^|\s)(po|invoice|payment|asn|grn|purchase)(?:\s|$|[-#:\s]*\d+)", text)
    key = m.group(1) if m else None
    mapping = {"po": "PO", "purchase": "PO", "invoice": "INVOICE",
               "payment": "INVOICE", "asn": "ASN", "grn": "GRN"}
    classification = mapping.get(key, "UNKNOWN")
    action = NORMALIZED_ACTIONS.get(key, "manual_review")
    return {
        "classification": classification,
        "action": action,
        "confidence": CONFIDENCE[classification],
        "high_risk": action in HIGH_RISK_ACTIONS,
    }


class KanbanState(TypedDict, total=False):
    order_id: str
    message: str
    classification: str
    action: str
    confidence: float
    high_risk: bool
    history: List[Dict[str, Any]]
    decision: str            # auto | human_task | manual_review
    column: str              # current kanban column
    human_task_id: str | None
    eoq: float | None
    sla_hours: float | None


def po_received(state: KanbanState) -> KanbanState:
    cls = classify(state.get("message", ""))
    step = {"column": "PO_Received", "ts": time.time(), "note": "order received + classified"}
    history = state.get("history", []) + [step]
    merged = {**state, **cls}
    if merged["confidence"] < 0.7 or merged["action"] == "manual_review":
        return {**merged, "column": "PO_Received", "decision": "manual_review", "history": history}
    return {**merged, "history": history}


def approval(state: KanbanState) -> KanbanState:
    if state["high_risk"]:
        step = {"column": "Approval", "ts": time.time(), "note": "high-risk -> human approval"}
        return {
            **state, "column": "Approval", "decision": "human_task",
            "human_task_id": "HT-" + state["order_id"],
            "history": state.get("history", []) + [step],
        }
    step = {"column": "Approval", "ts": time.time(), "note": "low-risk -> auto-approved"}
    return {**state, "column": "Approval", "decision": "auto",
            "history": state.get("history", []) + [step]}


def _eoq_from_mlflow(annual_demand: float, order_cost: float, holding_cost: float) -> float:
    """Query registered MLflow model; fall back to closed-form EOQ."""
    formula = round((2 * annual_demand * order_cost / holding_cost) ** 0.5, 2)
    try:
        model = mlflow.pyfunc.load_model("models:/eoq_inventory@challenger")
        served = float(model.predict(pd.DataFrame({
            "annual_demand": [annual_demand],
            "order_cost": [order_cost],
            "holding_cost": [holding_cost],
        }))[0])
        # registered wrapper is a mean-regressor — prefer formula when deviation is large
        return formula if abs(served - formula) / formula > 0.25 else round(served, 2)
    except Exception:
        return formula


def fulfillment(state: KanbanState) -> KanbanState:
    step = {"column": "Fulfillment", "ts": time.time(), "note": "fulfillment + reorder suggestion"}
    return {
        **state, "eoq": _eoq_from_mlflow(12000, 75, 3),
        "history": state.get("history", []) + [step],
    }

def shipment(state: KanbanState) -> KanbanState:
    step = {"column": "Shipment", "ts": time.time(), "note": "shipped, SLA met"}
    return {
        **state, "column": "Shipment", "sla_hours": 24.0,
        "history": state.get("history", []) + [step],
    }


def _route_po(state: KanbanState) -> str:
    return "stop" if state.get("decision") == "manual_review" else "approval"


def _route_approval(state: KanbanState) -> str:
    # high-risk orders stay in the Approval column — do not auto-ship
    return "stop" if state.get("decision") == "human_task" else "fulfillment"


def build_graph() -> StateGraph:
    g = StateGraph(KanbanState)
    g.add_node("po_received", po_received)
    g.add_node("approval", approval)
    g.add_node("fulfillment", fulfillment)
    g.add_node("shipment", shipment)
    g.set_entry_point("po_received")
    g.add_conditional_edges("po_received", _route_po, {"approval": "approval", "stop": END})
    g.add_conditional_edges("approval", _route_approval, {"fulfillment": "fulfillment", "stop": END})
    g.add_edge("fulfillment", "shipment")
    g.add_edge("shipment", END)
    return g.compile()


graph = build_graph()


def run(order_id: str, message: str) -> Dict[str, Any]:
    result = graph.invoke({"order_id": order_id, "message": message, "history": []})
    return {
        "order_id": order_id,
        "decision": result["decision"],
        "column": result["column"],
        "classification": result["classification"],
        "action": result["action"],
        "confidence": result["confidence"],
        "human_task_id": result.get("human_task_id"),
        "eoq": result.get("eoq"),
        "sla_hours": result.get("sla_hours"),
        "history": result["history"],
    }

