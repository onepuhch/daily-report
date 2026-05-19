from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

from import_historical_market_data import read_env, supabase_headers


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Record scheduled job status in Supabase.")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--job-name", default="Market Daily Supabase Upload")
    parser.add_argument("--status", choices=["started", "success", "failed"], required=True)
    parser.add_argument("--report-from")
    parser.add_argument("--report-until")
    parser.add_argument("--uploaded-reports", type=int)
    parser.add_argument("--uploaded-observations", type=int)
    parser.add_argument("--message")
    parser.add_argument("--log-path")
    parser.add_argument("--strict", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path.cwd()
    env = read_env(root)
    base_url = env.get("SUPABASE_URL")
    api_key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_ANON_KEY")
    if not base_url or not api_key:
        if args.strict:
            raise RuntimeError("SUPABASE_URL and SUPABASE key are required.")
        print("job_runs skipped: Supabase config missing")
        return 0

    now = datetime.now(timezone.utc).isoformat()
    payload: dict[str, Any] = {
        "id": args.run_id,
        "job_name": args.job_name,
        "status": args.status,
        "message": args.message,
        "log_path": args.log_path,
    }
    if args.status == "started":
        payload["started_at"] = now
    else:
        payload["finished_at"] = now
    if args.report_from:
        payload["report_from"] = args.report_from
    if args.report_until:
        payload["report_until"] = args.report_until
    if args.uploaded_reports is not None:
        payload["uploaded_reports"] = args.uploaded_reports
    if args.uploaded_observations is not None:
        payload["uploaded_observations"] = args.uploaded_observations

    url = base_url.rstrip("/") + "/rest/v1/job_runs?on_conflict=id"
    response = requests.post(url, headers=supabase_headers(api_key), json=[payload], timeout=60)
    if response.status_code >= 400:
        message = f"job_runs skipped: {response.status_code} {response.text[:300]}"
        if args.strict:
            raise RuntimeError(message)
        print(message)
        return 0
    print(json.dumps({"job_run_recorded": args.status, "run_id": args.run_id}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
