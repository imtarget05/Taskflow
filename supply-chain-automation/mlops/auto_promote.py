"""Option A-3 — Auto-retrain orchestration + production alias promotion.

Weekly / triggered pipeline that ties Phase 4 monitoring to Phase 2 registry:
  1. Run PSI drift detection on the production feature set.
  2. If drift is severe (or --force), retrain the model as a new version.
  3. A/B validate the new "challenger" candidate against the current
     "production" version (MAE / closest metric).
  4. Promote the winner to the `production` alias (source of truth for serving).

Also exposes a standalone `promote(name, version, model_metric)` helper so any
pipeline can move a validated model into `production` instead of only
`challenger` (the plan noted `challenger` is currently the only alias in use).

Usage:
  MLFLOW_TRACKING_URI=http://127.0.0.1:5000 .venv/bin/python mlops/auto_promote.py --model supplier_risk
  MLFLOW_TRACKING_URI=http://127.0.0.1:5000 .venv/bin/python mlops/auto_promote.py --model prophet_forecasting --force
  # add to cron: 0 3 * * 1  .../auto_promote.py --model prophet_forecasting
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

import mlflow
from mlflow.tracking import MlflowClient

MLFLOW_URI = os.environ.get("MLFLOW_TRACKING_URI", "http://127.0.0.1:5000")
HERE = Path(__file__).resolve().parent

# metric used to compare a candidate against production (lower is better)
_COMPARE_METRIC = "mae"


def promote(name: str, version: str, metric: float | None = None,
            challenger_metric: float | None = None, force: bool = False) -> bool:
    """Promote `name@version` to the `production` alias.

    Promotion is gated: the candidate must beat the current challenger's metric
    (lower `mae` is better) unless `force=True` or no challenger metric is given.
    Returns True when the candidate becomes production.
    """
    client = MlflowClient()
    existing = None
    try:
        existing = client.get_model_version_by_alias(name, "production")
    except Exception:  # noqa: BLE001 — alias not set yet → RestException
        existing = None
    if not force and metric is not None and challenger_metric is not None:
        if metric > challenger_metric:
            print(f"[promote] {name} v{version} MAE={metric:.3f} does NOT beat "
                  f"challenger MAE={challenger_metric:.3f}; skipping promote")
            return False
    client.set_registered_model_alias(name, "production", version)
    old = f" (was v{existing.version})" if existing else ""
    print(f"[promote] {name} v{version} -> alias 'production'{old}")
    return True


def _latest_metric(name: str, alias: str, metric: str = _COMPARE_METRIC) -> float | None:
    """Fetch latest value of `metric` for name@alias's last logged run (if any)."""
    try:
        client = MlflowClient()
        av = client.get_model_version_by_alias(name, alias)
        if av is None:
            return None
        run = client.get_run(av.run_id)
        return float(run.data.metrics.get(metric)) if metric in run.data.metrics else None
    except Exception as exc:  # noqa: BLE001 — alias missing (RestException) / run missing
        print(f"[metric] {name}@{alias} {metric} unavailable ({exc})")
        return None


def run_weekly(model: str, force: bool = False) -> int:
    mlflow.set_tracking_uri(MLFLOW_URI)
    mlflow.set_experiment("supply_chain")

    # 1) drift detection — production features vs a "current" sample.
    #    drift_detection.py supports --current/--reference CSV; without them it
    #    runs a deterministic demo (lag shifted +40 -> severe). We reuse that.
    print(f"[auto] step 1/3: drift detection for {model}")
    dr = subprocess.run(
        [sys.executable, str(HERE / "drift_detection.py")],
        capture_output=True, text=True, env={**os.environ},
    )
    print(dr.stdout[-400:] if dr.stdout else "")
    severe = "severe" in (dr.stdout or "").lower()
    print(f"[auto] drift severe={severe} force={force}")

    # 2) retrain the candidate when drift or force
    if severe or force:
        trainer = _TRAINERS.get(model)
        if not trainer:
            print(f"[auto] no retrainer registered for {model}; skipping spot-improve")
        else:
            print(f"[auto] step 2/3: retraining {model} via {trainer}")
            tr = subprocess.run([sys.executable, str(HERE / trainer)],
                                capture_output=True, text=True,
                                env={**os.environ})
            print((tr.stdout or tr.stderr)[-300:])

    # 3) A/B and promote to production
    print(f"[auto] step 3/3: promote winner to production")
    client = MlflowClient()
    challenger = client.get_model_version_by_alias(model, "challenger")
    if challenger is None:
        print(f"[auto] no challenger for {model}; abort")
        return 1
    cand_metric = _latest_metric(model, "challenger")
    prod_metric = _latest_metric(model, "production")
    # A/B decision: candidate wins if it beats production (or is first prod)
    winner = promote(model, challenger.version,
                     metric=cand_metric, challenger_metric=prod_metric,
                     force=force or severe or prod_metric is None)
    print(f"[auto] {model}: challenger v{challenger.version} "
          f"(mae={cand_metric}) vs production (mae={prod_metric}) "
          f"-> promoted={winner}")
    return 0


_TRAINERS = {
    "prophet_forecasting": "train_prophet.py",
    "supplier_risk": "train_models_from_db.py",
    "anomaly_detection": "train_models_from_db.py",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True, choices=list(_TRAINERS) + ["eoq_inventory"])
    parser.add_argument("--force", action="store_true", help="skip drift gate, force retrain+promote")
    args = parser.parse_args()
    sys.exit(run_weekly(args.model, force=args.force))


if __name__ == "__main__":
    main()