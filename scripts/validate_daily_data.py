from __future__ import annotations

import argparse
import json
import math
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests

from import_historical_market_data import METRICS, read_env, supabase_headers


REQUIRED_METRICS = ["kospi", "usdkrw", "wti", "us_treasury_10y"]
EXPECTED_METRIC_KEYS = [metric.key for metric in METRICS]

YAHOO_CHECKS = {
    "kospi": {"name": "KOSPI", "symbol": "^KS11", "tolerance_pct": 2.5},
    "kospi200": {"name": "KOSPI200", "symbol": "^KS200", "tolerance_pct": 2.5},
    "kosdaq": {"name": "KOSDAQ", "symbol": "^KQ11", "tolerance_pct": 2.5},
    "usdkrw": {"name": "USD/KRW", "symbol": "KRW=X", "tolerance_pct": 2.0},
    "dow": {"name": "Dow", "symbol": "^DJI", "tolerance_pct": 3.0},
    "sp500": {"name": "S&P 500", "symbol": "^GSPC", "tolerance_pct": 3.0},
    "nasdaq": {"name": "NASDAQ", "symbol": "^IXIC", "tolerance_pct": 3.5},
    "dax": {"name": "DAX", "symbol": "^GDAXI", "tolerance_pct": 3.0},
    "nikkei225": {"name": "Nikkei 225", "symbol": "^N225", "tolerance_pct": 3.0},
    "hangseng_h": {"name": "Hang Seng H", "symbol": "^HSCE", "tolerance_pct": 3.5},
    "shanghai_comp": {"name": "Shanghai Comp", "symbol": "000001.SS", "tolerance_pct": 3.0},
    "dollar_index": {"name": "Dollar Index", "symbol": "DX-Y.NYB", "tolerance_pct": 2.0},
    "usdjpy": {"name": "USD/JPY", "symbol": "JPY=X", "tolerance_pct": 2.0},
    "eurusd": {"name": "EUR/USD", "symbol": "EURUSD=X", "tolerance_pct": 2.0},
    "btc_usd": {"name": "BTC", "symbol": "BTC-USD", "tolerance_pct": 8.0},
    "eth_usd": {"name": "ETH", "symbol": "ETH-USD", "tolerance_pct": 10.0},
    "wti": {"name": "WTI", "symbol": "CL=F", "tolerance_pct": 7.0},
    "brent": {"name": "Brent", "symbol": "BZ=F", "tolerance_pct": 7.0},
    "gold": {"name": "Gold", "symbol": "GC=F", "tolerance_pct": 4.0},
    "silver": {"name": "Silver", "symbol": "SI=F", "tolerance_pct": 6.0},
    "sox": {"name": "SOX", "symbol": "^SOX", "tolerance_pct": 5.0},
    "copper": {"name": "Copper", "symbol": "HG=F", "tolerance_pct": 6.0, "multiplier": 2204.62262185},
    "us_treasury_10y": {"name": "US 10Y", "symbol": "^TNX", "tolerance_pct": 8.0},
    "us_treasury_30y": {"name": "US 30Y", "symbol": "^TYX", "tolerance_pct": 8.0},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate local and Supabase daily report data.")
    parser.add_argument("--project-root", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--report-date")
    parser.add_argument("--cross-check", action="store_true", help="Compare selected metrics with Yahoo Finance.")
    parser.add_argument("--strict-cross-check", action="store_true", help="Fail on external cross-check mismatch.")
    parser.add_argument("--skip-db", action="store_true", help="Skip Supabase checks. Use this before uploading.")
    return parser.parse_args()


def latest_report_json(project_root: Path) -> Path:
    files = sorted((project_root / "data" / "processed").glob("market_daily_*.json"))
    if not files:
        raise RuntimeError("No processed report JSON found. Run daily update first.")
    return files[-1]


def load_report(project_root: Path, report_date: str | None) -> dict[str, Any]:
    path = project_root / "data" / "processed" / f"market_daily_{report_date}.json" if report_date else latest_report_json(project_root)
    if not path.exists():
        raise RuntimeError(f"Report JSON not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def metric_map(report: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["metric_key"]: item for item in report.get("observations", [])}


def finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(float(value))


def request_supabase(base_url: str, api_key: str, path: str) -> tuple[list[dict[str, Any]], int | None]:
    response = requests.get(
        base_url.rstrip("/") + "/rest/v1/" + path,
        headers=supabase_headers(api_key, "count=exact"),
        timeout=60,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase request failed: {response.status_code} {response.text[:400]}")
    total = None
    content_range = response.headers.get("content-range")
    if content_range and "/" in content_range and not content_range.endswith("/*"):
        total = int(content_range.rsplit("/", 1)[1])
    return response.json() if response.text else [], total


def yahoo_close_for_date(symbol: str, report_date: str) -> tuple[float | None, str | None]:
    target = date.fromisoformat(report_date)
    period_start = int(datetime.combine(target - timedelta(days=7), datetime.min.time(), timezone.utc).timestamp())
    period_end = int(datetime.combine(target + timedelta(days=2), datetime.min.time(), timezone.utc).timestamp())
    encoded = quote(symbol, safe="")
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}?period1={period_start}&period2={period_end}&interval=1d"
    response = requests.get(url, timeout=20, headers={"User-Agent": "daily-report-validator/1.0"})
    if response.status_code >= 400:
        raise RuntimeError(f"Yahoo request failed for {symbol}: {response.status_code}")
    result = response.json()["chart"]["result"][0]
    timestamps = result.get("timestamp") or []
    closes = result["indicators"]["quote"][0]["close"]
    candidates: list[tuple[date, float]] = []

    for timestamp, close in zip(timestamps, closes):
        if close is None:
            continue
        close_date = datetime.fromtimestamp(int(timestamp), tz=timezone.utc).date()
        candidates.append((close_date, float(close)))

    if not candidates:
        return None, None

    for close_date, close in candidates:
        if close_date == target:
            return close, close_date.isoformat()

    previous = [(close_date, close) for close_date, close in candidates if close_date <= target]
    if previous:
        close_date, close = previous[-1]
        return close, close_date.isoformat()

    close_date, close = candidates[0]
    return close, close_date.isoformat()


def yahoo_page_url(symbol: str) -> str:
    return f"https://finance.yahoo.com/quote/{quote(symbol, safe='')}"


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root)
    report = load_report(project_root, args.report_date)
    metrics = metric_map(report)
    report_date = report["report_date"]
    errors: list[str] = []
    warnings: list[str] = []

    missing_expected = [key for key in EXPECTED_METRIC_KEYS if key not in metrics]
    extra_metrics = sorted(set(metrics) - set(EXPECTED_METRIC_KEYS))
    if missing_expected:
        errors.append(
            "Missing mapped metrics: "
            + ", ".join(f"{key} ({next(metric.name for metric in METRICS if metric.key == key)})" for key in missing_expected)
            + "."
        )
    if len(metrics) != len(EXPECTED_METRIC_KEYS):
        warnings.append(f"Expected {len(EXPECTED_METRIC_KEYS)} mapped observations, found {len(metrics)}.")
    if extra_metrics:
        warnings.append("Unexpected metrics in report JSON: " + ", ".join(extra_metrics) + ".")

    for key in REQUIRED_METRICS:
        item = metrics.get(key)
        if not item:
            errors.append(f"Missing critical metric: {key}.")
            continue
        if not finite_number(item.get("value")):
            errors.append(f"Critical metric has invalid value: {key}={item.get('value')!r}.")
        for change_key in ["change_1d", "change_ytd"]:
            if item.get(change_key) is not None and not finite_number(item.get(change_key)):
                errors.append(f"Critical metric has invalid {change_key}: {key}={item.get(change_key)!r}.")

    env = read_env(project_root)
    base_url = env.get("SUPABASE_URL")
    api_key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_ANON_KEY")
    if args.skip_db:
        warnings.append("Supabase DB validation skipped for pre-upload validation.")
    elif base_url and api_key:
        try:
            report_rows, report_total = request_supabase(
                base_url,
                api_key,
                f"reports?select=id,report_date,status&report_date=eq.{report_date}",
            )
            if not report_rows:
                errors.append(f"Supabase report row missing for {report_date}.")
            else:
                report_id = report_rows[0]["id"]
                _, observation_total = request_supabase(
                    base_url,
                    api_key,
                    f"market_observations?select=id&report_id=eq.{report_id}",
                )
                if observation_total != len(metrics):
                    errors.append(f"Supabase observation count mismatch: db={observation_total}, json={len(metrics)}.")
                comment_rows, _ = request_supabase(
                    base_url,
                    api_key,
                    f"report_comments?select=id&report_id=eq.{report_id}",
                )
                if not comment_rows:
                    errors.append(f"Supabase report_comments row missing for {report_date}.")
        except requests.RequestException as exc:
            errors.append(f"Supabase validation unavailable: network request failed ({exc.__class__.__name__}).")
        except RuntimeError as exc:
            errors.append(f"Supabase validation unavailable: {exc}")
    else:
        warnings.append("Supabase config missing; skipped DB validation.")

    cross_checks: list[dict[str, Any]] = []
    if args.cross_check:
        for key, meta in YAHOO_CHECKS.items():
            item = metrics.get(key)
            if not item or not finite_number(item.get("value")):
                continue
            try:
                external, external_date = yahoo_close_for_date(str(meta["symbol"]), report_date)
                if external is None:
                    warnings.append(f"Yahoo value unavailable for {key}.")
                    continue
                external *= float(meta.get("multiplier", 1.0))
                local = float(item["value"])
                diff_pct = abs(local - external) / abs(external) * 100 if external else 0.0
                passed = diff_pct <= float(meta["tolerance_pct"])
                cross_checks.append(
                    {
                        "metric_key": key,
                        "name": meta["name"],
                        "source": "Yahoo Finance",
                        "symbol": meta["symbol"],
                        "url": yahoo_page_url(str(meta["symbol"])),
                        "external_date": external_date,
                        "local": local,
                        "external": external,
                        "diff_pct": round(diff_pct, 4),
                        "tolerance_pct": meta["tolerance_pct"],
                        "passed": passed,
                    }
                )
                if not passed:
                    message = f"External check mismatch for {key}: local={local}, yahoo={external}, diff={diff_pct:.2f}%."
                    if args.strict_cross_check:
                        errors.append(message)
                    else:
                        warnings.append(message)
            except Exception as exc:
                warnings.append(f"External check skipped for {key}: {exc}")

    result = {
        "report_date": report_date,
        "observations": len(metrics),
        "status": "fail" if errors else "pass",
        "errors": errors,
        "warnings": warnings,
        "cross_checks": cross_checks,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
