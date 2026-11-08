"""DockSight Model Lab: a Streamlit prototype for data scientists.

The React app is the product for asset managers; this is the fast-iteration tool for the people
building the model: inspect holdout performance, calibration, and run what-if scenarios.

    streamlit run streamlit_app.py
"""

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from sklearn.calibration import calibration_curve

from docksight.db import engine
from docksight.ml.explain import explain
from docksight.ml.features import FEATURE_LABELS, FEATURES
from docksight.ml.model import load_artifact
from docksight.ml.train import HOLDOUT_START, labelled
from docksight.pipeline.io import read_portfolio
from docksight.pipeline.run import features_for

st.set_page_config(page_title="DockSight Model Lab", layout="wide")


@st.cache_data
def load_features() -> pd.DataFrame:
    return features_for(read_portfolio(engine))


artifact = load_artifact()
features = load_features()

st.title("DockSight Model Lab")
st.caption(
    f"Lease-renewal model `{artifact.version}` Â· {artifact.algorithm} Â· "
    f"trained {artifact.trained_at}"
)

cols = st.columns(4)
for col, (name, key, fmt) in zip(
    cols,
    [
        ("Holdout ROC AUC", "roc_auc", "{:.3f}"),
        ("Log loss", "log_loss", "{:.3f}"),
        ("Brier score", "brier", "{:.3f}"),
        ("Base renewal rate", "base_rate", "{:.0%}"),
    ],
    strict=True,
):
    col.metric(name, fmt.format(artifact.metrics[key]))

tab_perf, tab_whatif = st.tabs(["Holdout performance", "What-if simulator"])

with tab_perf:
    holdout = labelled(features)
    holdout = holdout[holdout["end_date"] >= HOLDOUT_START]
    st.markdown(
        f"Holdout = **{len(holdout)}** leases expiring on or after {HOLDOUT_START}. "
        "Note the production model is refit on all data, so these scores are slightly optimistic "
        "for it. The per-candidate holdout runs are logged in MLflow."
    )
    p = artifact.predict_proba(holdout)
    frac_pos, mean_pred = calibration_curve(holdout["renewed"], p, n_bins=10, strategy="quantile")
    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=[0, 1], y=[0, 1], mode="lines", name="Perfect", line=dict(dash="dash", color="gray")
        )
    )
    fig.add_trace(go.Scatter(x=mean_pred, y=frac_pos, mode="lines+markers", name="Model"))
    fig.update_layout(
        title="Calibration",
        xaxis_title="Predicted renewal probability",
        yaxis_title="Observed renewal rate",
        height=420,
    )

    left, right = st.columns(2)
    left.plotly_chart(fig, width="stretch")
    right.plotly_chart(
        px.histogram(
            x=p,
            color=holdout["renewed"].map({1: "Renewed", 0: "Left"}),
            nbins=30,
            barmode="overlay",
            labels={"x": "Predicted probability", "color": ""},
            title="Score separation",
        ),
        width="stretch",
    )

with tab_whatif:
    active = features[features["renewed"].isna()].set_index("lease_id")
    lease_id = st.selectbox("Active lease", active.index, index=0)
    row = active.loc[lease_id].copy()

    # Slider ranges always include the lease's own value, however unusual it is.
    rent, vacancy, term = (
        float(row["rent_to_market"]),
        float(row["market_vacancy"]),
        int(row["term_months"]),
    )
    c1, c2, c3 = st.columns(3)
    row["rent_to_market"] = c1.slider(
        "Rent vs. market at expiry", min(0.6, rent), max(1.6, rent), rent, 0.01
    )
    row["market_vacancy"] = c2.slider(
        "Market vacancy", min(0.01, vacancy), max(0.2, vacancy), vacancy, 0.005
    )
    row["term_months"] = c3.select_slider(
        "Lease term (months)", sorted({36, 48, 60, 84, 120, term}), term
    )

    p_base, _ = explain(artifact, active.loc[lease_id])
    p_new, drivers = explain(artifact, row)
    st.metric("Renewal probability", f"{p_new:.0%}", f"{(p_new - p_base) * 100:+.1f} pts")

    st.plotly_chart(
        px.bar(
            pd.DataFrame([vars(d) for d in drivers]).head(8).iloc[::-1],
            x="impact",
            y="label",
            orientation="h",
            labels={"impact": "Impact on probability vs. typical lease", "label": ""},
            title="Top drivers",
        ),
        width="stretch",
    )
    with st.expander("Raw features"):
        # Mixed numeric/text values: render as strings so Arrow can serialize the column.
        st.dataframe(row[FEATURES].rename(FEATURE_LABELS).astype(str).to_frame("value"))
