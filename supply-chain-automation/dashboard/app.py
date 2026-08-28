import streamlit as st
import pandas as pd
import numpy as np

st.set_page_config(page_title="Supply Chain Analytics Dashboard", layout="wide")
st.title("📊 Supply Chain Analytics Dashboard")

col1, col2 = st.columns(2)

with col1:
    st.header("📈 Demand Forecast")
    df_forecast = pd.DataFrame({
        'date': pd.date_range('2024-01-01', periods=30),
        'forecast': np.cumsum(np.random.randn(30)) + 100
    })
    st.line_chart(df_forecast.set_index('date'))

with col2:
    st.header("📦 Inventory Levels")
    df_inv = pd.DataFrame({
        'Item': ['A', 'B', 'C', 'D'],
        'Current': [45, 72, 30, 95],
        'Reorder Point': [50, 65, 35, 90],
        'Status': ['OK', 'OK', 'ORDER', 'OK']
    })
    st.dataframe(df_inv)

st.header("🏭 Supplier Risk Scores")
df_risk = pd.DataFrame({
    'Supplier': ['S1', 'S2', 'S3', 'S4'],
    'Risk Score': [0.82, 0.55, 0.23, 0.91],
    'Level': ['High', 'Medium', 'Low', 'High']
})
st.bar_chart(df_risk.set_index('Supplier'))

st.header("🚚 Route Optimization")
st.info("VRP demo menggunakan OR-Tools — route map visualization")

st.header("⚠️ Anomaly Alerts")
st.warning("Demand spike detected for Item X (severity: HIGH)")
st.info("Lead time increase for Supplier S2 (severity: MEDIUM)")

st.markdown("---")
st.caption("Built with FastAPI + Streamlit + OR-Tools | Supply Chain Analytics Portfolio")
