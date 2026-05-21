from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import requests

from import_historical_market_data import read_env, supabase_headers


def request_json(base_url: str, api_key: str, path: str) -> tuple[list[dict[str, Any]], str | None]:
    url = base_url.rstrip("/") + "/rest/v1/" + path
    response = requests.get(url, headers=supabase_headers(api_key, "count=exact"), timeout=60)
    if response.status_code >= 400:
        raise RuntimeError(f"GET {url} failed: {response.status_code} {response.text[:500]}")
    return response.json() if response.text else [], response.headers.get("content-range")


def total_from_content_range(content_range: str | None) -> int | None:
    if not content_range or "/" not in content_range:
        return None
    total = content_range.rsplit("/", 1)[1]
    if total == "*":
        return None
    return int(total)


def main() -> int:
    root = Path.cwd()
    try:
        env = read_env(root)
        base_url = env.get("SUPABASE_URL")
        api_key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_ANON_KEY")
        if not base_url or not api_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE key are required.")

        report_rows, report_range = request_json(
            base_url,
            api_key,
            "reports?select=id,report_date,status&order=report_date.desc&limit=5",
        )
        observation_rows, observation_range = request_json(
            base_url,
            api_key,
            "market_observations?select=id&limit=1",
        )
        comment_rows, comment_range = request_json(
            base_url,
            api_key,
            "report_comments?select=id&limit=1",
        )
        source_rows, source_range = request_json(
            base_url,
            api_key,
            "source_documents?select=id,source_date&order=source_date.desc&limit=5",
        )
        try:
            job_rows, job_range = request_json(
                base_url,
                api_key,
                "job_runs?select=id,job_name,status,started_at,finished_at,message&order=started_at.desc&limit=5",
            )
            job_runs: dict[str, Any] = {
                "count": total_from_content_range(job_range),
                "latest": job_rows[0] if job_rows else None,
            }
        except RuntimeError as exc:
            job_runs = {
                "count": None,
                "latest": None,
                "message": str(exc).split(" failed: ", 1)[-1],
            }

        payload = {
            "status": "ok",
            "reports": {
                "count": total_from_content_range(report_range),
                "latest": report_rows[0] if report_rows else None,
                "recent": report_rows,
            },
            "market_observations": {
                "count": total_from_content_range(observation_range),
            },
            "report_comments": {
                "count": total_from_content_range(comment_range),
            },
            "source_documents": {
                "count": total_from_content_range(source_range),
                "latest": source_rows[0] if source_rows else None,
            },
            "job_runs": job_runs,
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0
    except (RuntimeError, requests.RequestException) as exc:
        payload = {
            "status": "error",
            "message": str(exc),
            "next_actions": [
                "Check the internet connection or company security policy.",
                "Check that .env contains SUPABASE_URL and a Supabase key.",
                "If Admin is running, check the latest status in Admin > Automation Log.",
            ],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
