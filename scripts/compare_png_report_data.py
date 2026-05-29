from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import requests
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_historical_market_data import supabase_headers  # noqa: E402


@dataclass(frozen=True)
class PngMetric:
    key: str
    label: str
    box: tuple[int, int, int, int]
    tolerance: float
    group: str
    date_group: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare Market Daily PNG table values against Supabase report data.")
    parser.add_argument("--source-root", default=r"C:\Users\infomax\Desktop\Market Daily")
    parser.add_argument("--output-dir", default="data/png_report_validation")
    parser.add_argument("--tesseract", default=r"C:\Program Files\Tesseract-OCR\tesseract.exe")
    parser.add_argument("--window-days", type=int, default=10)
    parser.add_argument("--limit", type=int)
    return parser.parse_args()


def read_env(project_root: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for env_path in [project_root.parent / ".env", project_root / ".env"]:
        if not env_path.exists():
            continue
        for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def request_json(base_url: str, api_key: str, path: str) -> list[dict[str, Any]]:
    url = base_url.rstrip("/") + "/rest/v1/" + path
    response = requests.get(url, headers=supabase_headers(api_key, "count=exact"), timeout=60)
    if response.status_code >= 400:
        raise RuntimeError(f"GET {url} failed: {response.status_code} {response.text[:500]}")
    return response.json() if response.text else []


def fetch_observations(project_root: Path) -> dict[str, list[dict[str, Any]]]:
    env = read_env(project_root)
    base_url = env.get("SUPABASE_URL")
    api_key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_ANON_KEY")
    if not base_url or not api_key:
        raise RuntimeError("Supabase env vars missing. Set SUPABASE_URL and SUPABASE_*_KEY.")

    rows = []
    page_size = 1000
    offset = 0
    while True:
        page = request_json(
            base_url,
            api_key,
            f"market_observations?select=observed_date,metric_key,value,reports(report_date)&limit={page_size}&offset={offset}",
        )
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    by_metric: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        metric_key = row.get("metric_key")
        report_date = (row.get("reports") or {}).get("report_date")
        if not metric_key or not report_date:
            continue
        by_metric[metric_key].append(
            {
                "report_date": report_date,
                "observed_date": row.get("observed_date"),
                "value": float(row["value"]) if row.get("value") is not None else None,
            }
        )
    for metric_rows in by_metric.values():
        metric_rows.sort(key=lambda item: item["report_date"])
    return by_metric


def find_pngs(source_root: Path) -> list[Path]:
    paths = sorted(source_root.glob("[0-9][0-9][0-9][0-9]/*.png"))
    return [path for path in paths if re.fullmatch(r"\d{4}-\d{2}-\d{2}\.png", path.name)]


def metric_boxes() -> list[PngMetric]:
    left = (164, 246)
    right = (590, 672)
    flow_foreign = (166, 246)
    flow_inst = (249, 329)
    flow_individual = (332, 412)

    def cell(x: tuple[int, int], y: int, h: int = 26) -> tuple[int, int, int, int]:
        return (x[0], y, x[1], y + h)

    metrics = [
        PngMetric("cd_91d", "CD 91D", cell(left, 124), 0.01, "domestic_rates", "domestic_rates"),
        PngMetric("monetary_stab_1y", "통안채 1Y", cell(left, 152), 0.01, "domestic_rates", "domestic_rates"),
        PngMetric("monetary_stab_2y", "통안채 2Y", cell(left, 180), 0.01, "domestic_rates", "domestic_rates"),
        PngMetric("kr_gov_3y", "국고채 3Y", cell(left, 208), 0.01, "domestic_rates", "domestic_rates"),
        PngMetric("kr_gov_5y", "국고채 5Y", cell(left, 236), 0.01, "domestic_rates", "domestic_rates"),
        PngMetric("kr_gov_10y", "국고채 10Y", cell(left, 264), 0.01, "domestic_rates", "domestic_rates"),
        PngMetric("bank_aaa_3m", "은행채 3M", cell(left, 293), 0.01, "domestic_rates", "domestic_rates"),
        PngMetric("bank_aaa_1y", "은행채 1Y", cell(left, 321), 0.01, "domestic_rates", "domestic_rates"),
        PngMetric("bank_aaa_2y", "은행채 2Y", cell(left, 349), 0.01, "domestic_rates", "domestic_rates"),
        PngMetric("bank_aaa_3y", "은행채 3Y", cell(left, 377), 0.01, "domestic_rates", "domestic_rates"),
        PngMetric("bank_aaa_5y", "은행채 5Y", cell(left, 405), 0.01, "domestic_rates", "domestic_rates"),
        PngMetric("kr_corp_aa0_1y", "회사채 1Y AA", cell(left, 433), 0.01, "domestic_rates", "domestic_rates"),
        PngMetric("kr_corp_aa0_3y", "회사채 3Y AA", cell(left, 461), 0.01, "domestic_rates", "domestic_rates"),
        PngMetric("other_fin_aa_minus_2y", "기타금융채 2Y AA-", cell(left, 489), 0.01, "domestic_rates", "domestic_rates"),
        PngMetric("kospi", "KOSPI", cell(left, 580), 0.1, "domestic_equities_fx", "domestic_equities_fx"),
        PngMetric("kospi200", "KOSPI 200", cell(left, 609), 0.1, "domestic_equities_fx", "domestic_equities_fx"),
        PngMetric("kosdaq", "KOSDAQ", cell(left, 636), 0.1, "domestic_equities_fx", "domestic_equities_fx"),
        PngMetric("usdkrw", "USDKRW", cell(left, 665), 0.05, "domestic_equities_fx", "domestic_equities_fx"),
        PngMetric("stock_kospi_foreign", "KOSPI 외국인", cell(flow_foreign, 745), 5.0, "investor_flows", "domestic_equities_fx"),
        PngMetric("stock_kospi_inst", "KOSPI 기관", cell(flow_inst, 745), 5.0, "investor_flows", "domestic_equities_fx"),
        PngMetric("stock_kospi_individual", "KOSPI 개인", cell(flow_individual, 745), 5.0, "investor_flows", "domestic_equities_fx"),
        PngMetric("stock_kosdaq_foreign", "KOSDAQ 외국인", cell(flow_foreign, 773), 5.0, "investor_flows", "domestic_equities_fx"),
        PngMetric("stock_kosdaq_inst", "KOSDAQ 기관", cell(flow_inst, 773), 5.0, "investor_flows", "domestic_equities_fx"),
        PngMetric("stock_kosdaq_individual", "KOSDAQ 개인", cell(flow_individual, 773), 5.0, "investor_flows", "domestic_equities_fx"),
        PngMetric("fut_kospi200_foreign", "KOSPI200 선물 외국인", cell(flow_foreign, 801), 5.0, "investor_flows", "domestic_equities_fx"),
        PngMetric("fut_kospi200_inst", "KOSPI200 선물 기관", cell(flow_inst, 801), 5.0, "investor_flows", "domestic_equities_fx"),
        PngMetric("fut_kospi200_individual", "KOSPI200 선물 개인", cell(flow_individual, 801), 5.0, "investor_flows", "domestic_equities_fx"),
        PngMetric("fut_kr3y_foreign", "국채 3Y 선물 외국인", cell(flow_foreign, 830), 5.0, "investor_flows", "domestic_equities_fx"),
        PngMetric("fut_kr3y_inst", "국채 3Y 선물 기관", cell(flow_inst, 830), 5.0, "investor_flows", "domestic_equities_fx"),
        PngMetric("fut_kr3y_individual", "국채 3Y 선물 개인", cell(flow_individual, 830), 5.0, "investor_flows", "domestic_equities_fx"),
        PngMetric("fut_kr10y_foreign", "국채 10Y 선물 외국인", cell(flow_foreign, 858), 5.0, "investor_flows", "domestic_equities_fx"),
        PngMetric("fut_kr10y_inst", "국채 10Y 선물 기관", cell(flow_inst, 858), 5.0, "investor_flows", "domestic_equities_fx"),
        PngMetric("fut_kr10y_individual", "국채 10Y 선물 개인", cell(flow_individual, 858), 5.0, "investor_flows", "domestic_equities_fx"),
        PngMetric("us_treasury_2y", "미국 2Y", cell(right, 124), 0.01, "global_rates", "global_rates"),
        PngMetric("us_treasury_10y", "미국 10Y", cell(right, 152), 0.01, "global_rates", "global_rates"),
        PngMetric("us_treasury_30y", "미국 30Y", cell(right, 180), 0.01, "global_rates", "global_rates"),
        PngMetric("germany_bund_10y", "독일 10Y", cell(right, 208), 0.01, "global_rates", "global_rates"),
        PngMetric("japan_gov_10y", "일본 10Y", cell(right, 236), 0.01, "global_rates", "global_rates"),
        PngMetric("dow", "DOW", cell(right, 328), 1.0, "global_equities", "global_equities_fx_crypto"),
        PngMetric("sp500", "S&P 500", cell(right, 356), 1.0, "global_equities", "global_equities_fx_crypto"),
        PngMetric("nasdaq", "NASDAQ", cell(right, 384), 1.0, "global_equities", "global_equities_fx_crypto"),
        PngMetric("nikkei225", "일본 니케이 225", cell(right, 412), 1.0, "global_equities", "global_equities_fx_crypto"),
        PngMetric("hangseng_h", "홍콩 항셍 H", cell(right, 440), 1.0, "global_equities", "global_equities_fx_crypto"),
        PngMetric("dax", "독일 DAX", cell(right, 468), 1.0, "global_equities", "global_equities_fx_crypto"),
        PngMetric("dollar_index", "달러인덱스", cell(right, 496), 0.05, "fx", "global_equities_fx_crypto"),
        PngMetric("usdjpy", "USDJPY", cell(right, 524), 0.05, "fx", "global_equities_fx_crypto"),
        PngMetric("eurusd", "EURUSD", cell(right, 552), 0.001, "fx", "global_equities_fx_crypto"),
        PngMetric("btc_usd", "비트코인", cell(right, 580), 5.0, "crypto", "global_equities_fx_crypto"),
        PngMetric("eth_usd", "이더리움", cell(right, 608), 2.0, "crypto", "global_equities_fx_crypto"),
        PngMetric("wti", "WTI", cell(right, 688), 0.05, "commodities", "commodities"),
        PngMetric("brent", "BRENT", cell(right, 716), 0.05, "commodities", "commodities"),
        PngMetric("gold", "금", cell(right, 744), 1.0, "commodities", "commodities"),
        PngMetric("silver", "은", cell(right, 772), 0.05, "commodities", "commodities"),
        PngMetric("sox", "PHIL 반도체지수", cell(right, 800), 1.0, "commodities", "commodities"),
        PngMetric("copper", "구리", cell(right, 828), 2.0, "commodities", "commodities"),
    ]
    return metrics


def parse_number(text: str) -> float | None:
    cleaned = text.replace("\n", " ").replace(" ", "").replace(",", "")
    cleaned = cleaned.replace("−", "-").replace("—", "-")
    match = re.search(r"[+-]?\d+(?:\.\d+)?", cleaned)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def parse_tsv(tsv_text: str) -> list[dict[str, Any]]:
    lines = [line for line in tsv_text.splitlines() if line.strip()]
    if not lines:
        return []
    header = lines[0].split("\t")
    words = []
    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) != len(header):
            continue
        row = dict(zip(header, parts))
        text = row.get("text", "").strip()
        if not text:
            continue
        try:
            left = int(row["left"])
            top = int(row["top"])
            width = int(row["width"])
            height = int(row["height"])
        except (KeyError, ValueError):
            continue
        words.append(
            {
                "text": text,
                "left": left,
                "top": top,
                "width": width,
                "height": height,
                "cx": left + width / 2,
                "cy": top + height / 2,
            }
        )
    return words


def ocr_words(tesseract: Path, image_path: Path) -> list[dict[str, Any]]:
    result = subprocess.run(
        [str(tesseract), str(image_path), "stdout", "-l", "kor+eng", "--psm", "6", "tsv"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"tesseract failed for {image_path}: {result.stderr[:500]}")
    return parse_tsv(result.stdout)


def numeric_variants(raw: str, value: float) -> list[float]:
    variants = [value]
    compact = raw.replace(",", "").replace(" ", "")
    has_decimal = "." in compact
    if has_decimal and abs(value) < 100:
        variants.extend([value * 10, value * 100, value * 1000])
    if abs(value) >= 100:
        variants.extend([value / 10, value / 100, value / 1000, value / 10000])
    deduped = []
    for item in variants:
        rounded = round(item, 6)
        if rounded not in deduped:
            deduped.append(rounded)
    return deduped


def ocr_cell_from_words(words: list[dict[str, Any]], box: tuple[int, int, int, int]) -> dict[str, Any]:
    x1, y1, x2, y2 = box
    margin_x = 8
    margin_y = 5
    cell_words = [
        word
        for word in words
        if x1 - margin_x <= word["cx"] <= x2 + margin_x and y1 - margin_y <= word["cy"] <= y2 + margin_y
    ]
    candidates = []
    for word in cell_words:
        raw = word["text"]
        parsed = parse_number(raw)
        if parsed is None:
            continue
        for value in numeric_variants(raw, parsed):
            candidates.append({"raw": raw, "value": value})
    return {"candidates": candidates}


def nearby_db_rows(rows: list[dict[str, Any]], publication_date: str, window_days: int) -> list[dict[str, Any]]:
    end = datetime.fromisoformat(publication_date).date()
    start = end - timedelta(days=window_days)
    return [
        row
        for row in rows
        if row["value"] is not None and start <= datetime.fromisoformat(row["report_date"]).date() <= end
    ]


def exact_db_rows(rows: list[dict[str, Any]], target_date: str) -> list[dict[str, Any]]:
    return [row for row in rows if row["value"] is not None and row["report_date"] == target_date]


def infer_yearless_date(publication_date: str, month: int, day: int) -> str | None:
    pub = datetime.fromisoformat(publication_date).date()
    try:
        target = date(pub.year, month, day)
    except ValueError:
        return None
    if target > pub + timedelta(days=7):
        target = date(pub.year - 1, month, day)
    return target.isoformat()


def read_section_text(words: list[dict[str, Any]], box: tuple[int, int, int, int]) -> str:
    x1, y1, x2, y2 = box
    section_words = [
        word
        for word in words
        if x1 <= word["cx"] <= x2 and y1 <= word["cy"] <= y2
    ]
    section_words.sort(key=lambda word: (word["top"], word["left"]))
    return " ".join(word["text"] for word in section_words)


def parse_section_date(words: list[dict[str, Any]], box: tuple[int, int, int, int], publication_date: str) -> str | None:
    text = read_section_text(words, box)
    match = re.search(r"(\d{1,2})\s*/\s*(\d{1,2})", text)
    if not match:
        return None
    return infer_yearless_date(publication_date, int(match.group(1)), int(match.group(2)))


def section_dates(words: list[dict[str, Any]], publication_date: str) -> dict[str, str | None]:
    boxes = {
        "domestic_rates": (164, 100, 246, 126),
        "global_rates": (590, 100, 672, 126),
        "global_equities_fx_crypto": (590, 294, 672, 322),
        "domestic_equities_fx": (164, 548, 246, 574),
        "commodities": (590, 660, 672, 686),
    }
    return {key: parse_section_date(words, box, publication_date) for key, box in boxes.items()}


def choose_match(candidates: list[dict[str, Any]], db_rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    best = None
    for candidate in candidates:
        for row in db_rows:
            diff = abs(candidate["value"] - row["value"])
            current = {
                "png_value": candidate["value"],
                "png_raw": candidate["raw"],
                "db_report_date": row["report_date"],
                "db_observed_date": row["observed_date"],
                "db_value": row["value"],
                "diff": diff,
            }
            if best is None or diff < best["diff"]:
                best = current
    return best


def main() -> int:
    args = parse_args()
    project_root = Path(__file__).resolve().parents[1]
    source_root = Path(args.source_root)
    output_dir = project_root / args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    tesseract = Path(args.tesseract)
    if not tesseract.exists():
        raise RuntimeError(f"tesseract not found: {tesseract}")

    pngs = find_pngs(source_root)
    if args.limit:
        pngs = pngs[: args.limit]
    db_by_metric = fetch_observations(project_root)
    metrics = metric_boxes()

    rows = []
    per_png = []
    for idx, png_path in enumerate(pngs, start=1):
        publication_date = png_path.stem
        words = ocr_words(tesseract, png_path)
        dates_by_section = section_dates(words, publication_date)
        date_matches = Counter()
        issue_count = 0
        compared = 0
        for metric in metrics:
            ocr = ocr_cell_from_words(words, metric.box)
            target_date = dates_by_section.get(metric.date_group)
            if target_date:
                db_rows = exact_db_rows(db_by_metric.get(metric.key, []), target_date)
            else:
                db_rows = nearby_db_rows(db_by_metric.get(metric.key, []), publication_date, args.window_days)
            match = choose_match(ocr["candidates"], db_rows)
            status = "match_unavailable"
            if match:
                status = "match" if match["diff"] <= metric.tolerance else "mismatch"
                if status == "match":
                    date_matches[match["db_report_date"]] += 1
                else:
                    issue_count += 1
                compared += 1
            else:
                issue_count += 1
                if not ocr["candidates"]:
                    status = "ocr_failed"
                elif not db_rows:
                    status = "db_missing"
            rows.append(
                {
                    "png_date": publication_date,
                    "png_file": str(png_path),
                    "metric_key": metric.key,
                    "label": metric.label,
                    "group": metric.group,
                    "date_group": metric.date_group,
                    "section_date": target_date or "",
                    "status": status,
                    "png_value": "" if not match else match["png_value"],
                    "png_raw": "" if not match else match["png_raw"],
                    "db_report_date": "" if not match else match["db_report_date"],
                    "db_observed_date": "" if not match else match["db_observed_date"],
                    "db_value": "" if not match else match["db_value"],
                    "diff": "" if not match else round(match["diff"], 6),
                    "tolerance": metric.tolerance,
                    "candidate_count": len(ocr["candidates"]),
                }
            )
        dominant = date_matches.most_common(3)
        per_png.append(
            {
                "png_date": publication_date,
                "compared": compared,
                "issues": issue_count,
                "section_dates": dates_by_section,
                "matched_dates": dict(date_matches),
                "dominant_dates": dominant,
            }
        )
        if idx % 25 == 0:
            print(f"processed {idx}/{len(pngs)}", flush=True)

    csv_path = output_dir / "png_report_data_comparison.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()) if rows else [])
        writer.writeheader()
        writer.writerows(rows)

    issue_rows = [row for row in rows if row["status"] != "match"]
    summary = {
        "png_count": len(pngs),
        "metric_cells_per_png": len(metrics),
        "total_cells": len(rows),
        "matched_cells": sum(1 for row in rows if row["status"] == "match"),
        "issue_cells": len(issue_rows),
        "status_counts": Counter(row["status"] for row in rows),
        "pngs_with_issues": sum(1 for item in per_png if item["issues"]),
        "comparison_csv": str(csv_path),
        "per_png": per_png,
        "top_issues": issue_rows[:200],
    }
    summary_path = output_dir / "png_report_data_comparison_summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k not in {"per_png", "top_issues"}}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
