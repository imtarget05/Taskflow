"""Unit tests for the LangGraph Kanban agent workflow (Phase 3).

Run: MLFLOW_TRACKING_URI=... .venv/bin/python -m pytest mlops/test_agent_workflow.py -q
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from agent_workflow import classify, run  # noqa: E402


def test_classify_po():
    assert classify("PO so 123")["classification"] == "PO"
    assert classify("PO so 123")["action"] == "create_task"


def test_classify_invoice_high_risk():
    r = classify("invoice #77")
    assert r["classification"] == "INVOICE"
    assert r["action"] == "approve_payment"
    assert r["high_risk"] is True


def test_classify_unknown_low_confidence():
    r = classify("hello world")
    assert r["classification"] == "UNKNOWN"
    assert r["confidence"] < 0.7


def test_low_risk_order_reaches_shipment():
    r = run("ORD-1", "PO so 123")
    assert r["decision"] == "auto"
    assert r["column"] == "Shipment"
    assert r["eoq"] is not None
    assert r["sla_hours"] == 24.0
    columns = [h["column"] for h in r["history"]]
    assert columns == ["PO_Received", "Approval", "Fulfillment", "Shipment"]


def test_high_risk_order_stops_at_approval():
    r = run("ORD-2", "invoice #77")
    assert r["decision"] == "human_task"
    assert r["column"] == "Approval"
    assert r["human_task_id"] == "HT-ORD-2"
    assert len(r["history"]) == 2  # PO_Received + Approval only


def test_unknown_order_stops_at_po_received():
    r = run("ORD-3", "hello world")
    assert r["decision"] == "manual_review"
    assert r["column"] == "PO_Received"
    assert len(r["history"]) == 1
