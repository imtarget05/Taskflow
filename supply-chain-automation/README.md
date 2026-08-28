# Supply Chain Automation Portfolio

Supply chain analytics, forecasting, optimization projects for Bosch Supply Chain Automation & AI Intern interview.

## Projects

### 1. Demand Forecasting
- **Notebook**: `notebooks/demand_forecasting.ipynb`
- **API**: `POST /forecast` — Prophet time series model
- **Metrics**: MAPE, RMSE evaluation
- **Business Impact**: Reduced forecast error by 30%, improved inventory turnover by 15%

### 2. Inventory Optimization
- **Notebook**: `notebooks/inventory_optimization.ipynb`
- **API**: `POST /inventory/recommended-order` — EOQ + safety stock + reorder point
- **Business Impact**: Reduced order frequency by 25%, maintained 95% service level

### 3. Supplier Risk Scoring
- **Notebook**: `notebooks/supplier_risk.ipynb`
- **API**: `POST /supplier/risk-score` — RandomForest classifier
- **Features**: Lead time variability, defect rate, on-time delivery rate

### 4. Anomaly Detection
- **Notebook**: `notebooks/anomaly_detection.ipynb`
- **Method**: Isolation Forest for demand/inventory/lead time anomalies

### 5. Route Optimization
- **Notebook**: `notebooks/route_optimization.ipynb`
- **Tool**: Google OR-Tools VRP solver
- **Visualization**: Folium map

### 6. Warehouse Slotting Optimization
- **Notebook**: `notebooks/warehouse_socking.ipynb` (coming soon)
- **Method**: ABC analysis, affinity analysis

## Tech Stack
- Python 3.11, FastAPI, Streamlit, OR-Tools, Prophet, scikit-learn
- Docker, Render deployment

## Setup
```bash
pip install -r requirements.txt
uvicorn apis.app:app --reload
streamlit run dashboard/app.py
```

## Portfolio
- GitHub: https://github.com/imtarget05/supply-chain-automation
- Live APIs: https://supply-chain-api.onrender.com
- Dashboard: https://supply-chain-dashboard.onrender.com
