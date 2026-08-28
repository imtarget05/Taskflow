"""Phase 4 — Streamlit ML metrics dashboard (SLA / F1 / latency).

Run:  MLFLOW_TRACKING_URI=http://127.0.0.1:5000 .venv/bin/streamlit run dashboard/ml_metrics.py
"""
import os
import time

import pandas as pd
import requests
import streamlit as st
import mlflow
from mlflow.tracking import MlflowClient

MLFLOW_URI = os.environ.get("MLFLOW_TRACKING_URI", "http://127.0.0.1:5000")
API_URL = os.environ.get("SC_API_URL", "http://127.0.0.1:8001")

mlflow.set_tracking_uri(MLFLOW_URI)
client = MlflowClient()

st.set_page_config(page_title="SC ML Metrics", layout="wide")
st.title("📊 Supply-Chain ML Metrics (Phase 4)")

# ------------------------------------------------------------------ models
st.header("1. Registered models (MLflow)")
rows = []
for rm in client.search_registered_models():
    alias = next(iter(rm.aliases.keys()), "-") if rm.aliases else "-"
    ver = next(iter(rm.aliases.values()), "-") if rm.aliases else "-"
    rows.append({"model": rm.name, "alias": alias, "version": ver})
st.dataframe(pd.DataFrame(rows), use_container_width=True)

# --------------------------------------------------------------- SLA probe
st.header("2. API latency / SLA")
col1, col2, col3 = st.columns(3)
try:
    t0 = time.time()
    health = requests.get(f"{API_URL}/health", timeout=5).json()
    latency_ms = (time.time() - t0) * 1000
    col1.metric("API status", health.get("status", "?"))
    col2.metric("Latency (ms)", f"{latency_ms:.0f}",
                delta="OK" if latency_ms < 200 else "SLOW",
                delta_color="normal" if latency_ms < 200 else "inverse")
    col3.metric("SLA target", "< 200 ms")
except Exception as e:  # noqa: BLE001
    st.error(f"API unreachable at {API_URL}: {e}")

# ----------------------------------------------------------------- metrics
st.header("3. Latest run metrics (accuracy / F1 proxy / PSI)")
exp = client.get_experiment_by_name("supply_chain")
if exp is None:
    st.warning("Experiment 'supply_chain' not found — run register_models.py first.")
else:
    runs = client.search_runs([exp.experiment_id], order_by=["attributes.start_time DESC"], max_results=25)
    metric_rows = {}
    for r in runs:
        for k, v in r.data.metrics.items():
            metric_rows.setdefault(k, []).append({"run": r.data.tags.get("mlflow.runName", "?"), k: v})
    for k, lst in metric_rows.items():
        st.subheader(k)
        st.dataframe(pd.DataFrame(lst).head(5), use_container_width=True)
