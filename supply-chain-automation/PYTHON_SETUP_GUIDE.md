# Python MLOps Environment Setup Guide

> **Lưu ý:** Hermes Agent (terminal Linux) không có Python. Tất cả Python/ML commands cần user execute trên local macOS terminal.

## Environment Setup (Local macOS)

### 1. Tạo virtual environment

```bash
cd /Users/mainguyenbinhtan/Downloads/TaskFlow/supply-chain-automation
python3 -m venv .venv
source .venv/bin/activate
```

> .venv đã tồn tại từ source repo — có thể skip bước này nếu hoạt động.

### 2. Cài dependencies

```bash
pip install -r requirements.txt
```

**requirements.txt chứa:**
- fastapi==0.109.0, uvicorn==0.27.0 (API server)
- prophet==1.1.5 (forecast), scikit-learn==1.4.0 (ML models)
- pandas==2.2.0, numpy==1.26.3 (data)
- streamlit==1.31.0 (dashboard)
- ortools==9.7.8974 (route optimization)

### 3. Verify installation

```bash
python -c "import prophet; import sklearn; import pandas; print('OK')"
```

### 4. Chạy API test (localhost)

```bash
uvicorn apis.app:app --reload --port 8000
```

API endpoints:
- `GET /health` → health check
- `POST /forecast` → demand forecasting (mock implementation)
- `POST /inventory/recommended-order` → EOQ calculation
- `POST /supplier/risk-score` → supplier risk scoring (mock)

### 5. Chạy dashboard (Streamlit)

```bash
streamlit run dashboard/app.py
```

## Phase 2: MLOps Infrastructure

### MLflow Server Setup

```bash
# Local MLflow tracking server
mlflow server --host 0.0.0.0 --port 5000
```

Hoặc Docker:

```bash
docker run -p 5000:5000 ghcr.io/mlflow/mlflow:latest
```

### Register Models

Sau khi có models thật (không phải mock), register vào MLflow:

```python
import mlflow
mlflow.set_tracking_uri("http://localhost:5000")

# Prophet forecasting model
with mlflow.start_run():
    mlflow.sklearn.log_model(prophet_model, "model")
    mlflow.set_tag("model_type", "prophet_forecasting")
    mlflow.set_tag("domain", "demand_forecasting")

# EOQ Inventory model
with mlflow.start_run():
    mlflow.sklearn.log_model(eoq_model, "model")
    mlflow.set_tag("model_type", "eoq_inventory")
    mlflow.set_tag("domain", "inventory_optimization")

# Supplier Risk model
with mlflow.start_run():
    mlflow.sklearn.log_model(risk_model, "model")
    mlflow.set_tag("model_type", "supplier_risk")
    mlflow.set_tag("domain", "supplier_risk_scoring")

# Anomaly Detection model
with mlflow.start_run():
    mlflow.sklearn.log_model(anomaly_model, "model")
    mlflow.set_tag("model_type", "anomaly_detection")
    mlflow.set_tag("domain", "anomaly_detection")
```

## Phase 3: LangGraph Agent Integration

### Cấu trúc LangGraph agent (Python)

```python
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import create_react_agent

# Agent state
class SupplyChainState(TypedDict):
    order_id: str
    classification: str
    confidence: float
    actions: list
    decision: str

# Nodes
def analyze_order(state):
    # call SC NLP / MLflow model
    return {"classification": "...", "confidence": 0.85}

def make_decision(state):
    # apply guardrails risk-based
    return {"decision": "auto" | "human_task" | "manual_review"}

def execute_action(state):
    # trigger action (create task, move column, notify)
    return {"actions": [...]}

# Build graph
graph = StateGraph(SupplyChainState)
graph.add_node("analyze", analyze_order)
graph.add_node("decide", make_decision)
graph.add_node("execute", execute_action)
graph.set_entry_point("analyze")
graph.add_edge("analyze", "decide")
graph.add_edge("decide", "execute")
graph.add_edge("execute", END)
```

### Integration với TaskFlow Express backend

Có 2 cách tích hợp:

**Approach A (Python agent as microservice):**
- LangGraph agent chạy độc lập trên port 9000 (FastAPI)
- TaskFlow Express backend gọi HTTP POST `/api/agent/invoke` → proxy đến LangGraph agent

**Approach B (Simple Node.js agentic — hiện tại đang làm):**
- Agentic decision engine viết bằng TypeScript trong TaskFlow
- Sử dụng Cloudflare Workers AI / Ollama thông qua `llm.ts`
- Không cầnLangGraph — phù hợp hơn cho MVP

## Phase 4: Monitoring & Dashboard

### Streamlit Dashboard (đã có sẵn trong `dashboard/`)

```bash
streamlit run dashboard/app.py
```

### Drift detection (weekly)

```python
# Kiểm tra data drift cho Prophet model
import alibi_detect
drift_detector = alibi_detect.cd.MMDDrift(
    x_ref=historical_forecast_data,
    p_val=0.05
)
is_drift = drift_detector.predict(new_forecast_data)
```

### Metrics to track

| Metric | Source | Update frequency |
|---|---|---|
| SLA (forecast accuracy) | MAPE/RMSE from Prophet | Daily |
| F1-score (supplier risk) | Classification report | Weekly |
| Latency (API response) | Uvicorn logging | Real-time |
| Agent decision accuracy | Compare agent action vs. human override | Daily |

---

## Tóm tắt dependencies môi trường

| Component | Tool | Local command |
|---|---|---|
| Virtual env | Python 3.11 venv | `python3 -m venv .venv && source .venv/bin/activate` |
| API server | Uvicorn (FastAPI) | `uvicorn apis.app:app --reload` |
| Dashboard | Streamlit | `streamlit run dashboard/app.py` |
| MLflow tracking | MLflow server | `mlflow server --host 0.0.0.0 --port 5000` |
| Notebooks | Jupyter | `jupyter notebook notebooks/` |

## Lưu ý quan trọng

1. **API hiện tại là mock** — không thể dùng cho MLOps thật. Cần implement Prophet model thực cho forecast, RandomForest cho supplier risk.
2. **Python ML environment** phải setup local bởi user — Hermes terminal không hỗ trợ Python.
3. **Phase 3 LangGraph** cần Python environment + LangGraph package — khả thi nhưng phức tạp.
4. **Simple agentic (Node.js)** đang được implement trong TaskFlow (`server/src/modules/agentic/`) — phù hợp hơn cho MVP.

---

Tài liệu này được generate bởi Hermes Agent — phần cài đặt thực tế cần user execute trên local macOS terminal.
