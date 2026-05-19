from __future__ import annotations

import argparse
import json
import os
import re
import zipfile
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

import requests


@dataclass(frozen=True)
class MetricDef:
    key: str
    name: str
    category: str
    sheet: str
    column: str
    unit: str
    change_mode: str
    value_multiplier: float = 1.0


METRICS = [
    MetricDef("cd_91d", "CD 91일", "domestic_rates", "CD금리", "B", "%", "rate_bp"),
    MetricDef("kr_gov_2y", "국고채 2년", "domestic_rates", "국내금리", "B", "%", "rate_bp"),
    MetricDef("kr_gov_3y", "국고채 3년", "domestic_rates", "국내금리", "C", "%", "rate_bp"),
    MetricDef("kr_gov_5y", "국고채 5년", "domestic_rates", "국내금리", "D", "%", "rate_bp"),
    MetricDef("kr_gov_10y", "국고채 10년", "domestic_rates", "국내금리", "E", "%", "rate_bp"),
    MetricDef("kr_gov_30y", "국고채 30년", "domestic_rates", "국내금리", "G", "%", "rate_bp"),
    MetricDef("kr_corp_aa0_3y", "회사채 AA0 3년", "credit", "국내금리", "X", "%", "rate_bp"),
    MetricDef("credit_spread_aa0_2y", "회사채 AA0 2년 스프레드", "credit", "크레딧SP", "D", "bp", "spread_bp", 100.0),
    MetricDef("us_treasury_2y", "미국채 2년", "global_rates", "해외금리", "B", "%", "rate_bp"),
    MetricDef("us_treasury_10y", "미국채 10년", "global_rates", "해외금리", "C", "%", "rate_bp"),
    MetricDef("us_treasury_30y", "미국채 30년", "global_rates", "해외금리", "D", "%", "rate_bp"),
    MetricDef("germany_bund_10y", "독일 국채 10년", "global_rates", "해외금리", "E", "%", "rate_bp"),
    MetricDef("japan_gov_10y", "일본 국채 10년", "global_rates", "해외금리", "F", "%", "rate_bp"),
    MetricDef("kospi", "KOSPI", "domestic_equities_fx", "국내주식및환율", "B", "pt", "pct"),
    MetricDef("kospi200", "KOSPI200", "domestic_equities_fx", "국내주식및환율", "C", "pt", "pct"),
    MetricDef("kosdaq", "KOSDAQ", "domestic_equities_fx", "국내주식및환율", "D", "pt", "pct"),
    MetricDef("usdkrw", "원/달러", "fx", "국내주식및환율", "E", "KRW", "pct"),
    MetricDef("dow", "다우 산업", "global_equities", "해외주식", "B", "pt", "pct"),
    MetricDef("sp500", "S&P 500", "global_equities", "해외주식", "C", "pt", "pct"),
    MetricDef("nasdaq", "나스닥 종합", "global_equities", "해외주식", "D", "pt", "pct"),
    MetricDef("dax", "독일 DAX", "global_equities", "해외주식", "E", "pt", "pct"),
    MetricDef("nikkei225", "니케이 225", "global_equities", "아시아주식", "B", "pt", "pct"),
    MetricDef("hangseng_h", "항셍 H", "global_equities", "아시아주식", "C", "pt", "pct"),
    MetricDef("shanghai_comp", "상해종합", "global_equities", "아시아주식", "D", "pt", "pct"),
    MetricDef("dollar_index", "달러인덱스", "fx", "해외환율", "B", "pt", "pct"),
    MetricDef("usdjpy", "달러/엔", "fx", "해외환율", "C", "JPY", "pct"),
    MetricDef("eurusd", "유로/달러", "fx", "해외환율", "D", "USD", "pct"),
    MetricDef("btc_usd", "BTC", "crypto", "암호화폐", "B", "USD", "pct"),
    MetricDef("eth_usd", "ETH", "crypto", "암호화폐", "C", "USD", "pct"),
    MetricDef("wti", "WTI", "commodities", "상품", "B", "USD", "pct"),
    MetricDef("brent", "브렌트유", "commodities", "상품", "C", "USD", "pct"),
    MetricDef("gold", "금", "commodities", "상품", "D", "USD", "pct"),
    MetricDef("silver", "은", "commodities", "상품", "E", "USD", "pct"),
    MetricDef("sox", "필라델피아 반도체", "commodities", "상품", "F", "pt", "pct"),
    MetricDef("copper", "구리", "commodities", "상품", "G", "USD", "pct"),
]

CATEGORY_LABELS = {
    "domestic_rates": "국내금리",
    "global_rates": "해외금리",
    "domestic_equities_fx": "국내주식",
    "global_equities": "해외주식",
    "fx": "환율",
    "crypto": "암호화폐",
    "commodities": "상품",
    "credit": "크레딧",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import historical Market Daily metrics to Supabase.")
    parser.add_argument("--workbook", default=r"C:\Users\infomax\Desktop\Market Daily\MARKET DAILY.xlsm")
    parser.add_argument("--project-root", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--until", default=(date.today() - timedelta(days=1)).isoformat())
    parser.add_argument("--from-date", default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--write-json", action="store_true")
    return parser.parse_args()


def read_env(project_root: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for env_path in [project_root / ".env", project_root.parent / ".env"]:
        if not env_path.exists():
            continue
        for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
        if values:
            break
    return values


def to_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).replace(",", "").strip()
    try:
        return float(text)
    except ValueError:
        return None


def to_date(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    serial = to_number(value)
    if serial is None or serial < 20000:
        return None
    return (datetime(1899, 12, 30) + timedelta(days=serial)).date().isoformat()


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "office_rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def column_letters(cell_ref: str) -> str:
    match = re.match(r"([A-Z]+)", cell_ref)
    return match.group(1) if match else ""


def row_number(cell_ref: str) -> int:
    match = re.search(r"(\d+)$", cell_ref)
    return int(match.group(1)) if match else 0


def read_xml(zip_file: zipfile.ZipFile, name: str) -> ET.Element:
    return ET.fromstring(zip_file.read(name))


def read_shared_strings(zip_file: zipfile.ZipFile) -> list[str]:
    try:
        root = read_xml(zip_file, "xl/sharedStrings.xml")
    except KeyError:
        return []
    values = []
    for item in root.findall("main:si", NS):
        parts = [node.text or "" for node in item.findall(".//main:t", NS)]
        values.append("".join(parts))
    return values


def get_cell_value(cell: ET.Element, shared_strings: list[str]) -> Any:
    value_node = cell.find("main:v", NS)
    if value_node is None or value_node.text is None:
        return None
    value = value_node.text
    if cell.attrib.get("t") == "s":
        index = int(value)
        return shared_strings[index] if 0 <= index < len(shared_strings) else value
    return value


def load_sheet_maps(workbook_path: Path) -> dict[str, dict[int, dict[str, dict[str, Any]]]]:
    with zipfile.ZipFile(workbook_path) as zip_file:
        shared_strings = read_shared_strings(zip_file)
        workbook = read_xml(zip_file, "xl/workbook.xml")
        rels = read_xml(zip_file, "xl/_rels/workbook.xml.rels")
        rel_targets = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels.findall("rel:Relationship", NS)}
        sheet_maps: dict[str, dict[int, dict[str, dict[str, Any]]]] = {}
        for sheet in workbook.findall("main:sheets/main:sheet", NS):
            name = sheet.attrib["name"]
            rel_id = sheet.attrib[f"{{{NS['office_rel']}}}id"]
            target = rel_targets[rel_id]
            target_path = target.lstrip("/")
            if not target_path.startswith("xl/"):
                target_path = f"xl/{target_path}"
            root = read_xml(zip_file, target_path)
            rows: dict[int, dict[str, dict[str, Any]]] = {}
            for row in root.findall("main:sheetData/main:row", NS):
                row_cells: dict[str, dict[str, Any]] = {}
                for cell in row.findall("main:c", NS):
                    ref = cell.attrib.get("r", "")
                    col = column_letters(ref)
                    if not col:
                        continue
                    row_cells[col] = {"ref": ref, "value": get_cell_value(cell, shared_strings)}
                if row_cells:
                    rows[int(row.attrib["r"])] = row_cells
            sheet_maps[name] = rows
    return sheet_maps


def collect_rows(workbook_path: Path) -> dict[str, dict[str, dict[str, Any]]]:
    sheet_maps = load_sheet_maps(workbook_path)
    metrics_by_sheet: dict[str, list[MetricDef]] = {}
    for metric in METRICS:
        metrics_by_sheet.setdefault(metric.sheet, []).append(metric)

    rows_by_sheet: dict[str, dict[str, dict[str, Any]]] = {}
    for sheet_name, metrics in metrics_by_sheet.items():
        sheet = sheet_maps[sheet_name]
        sheet_rows: dict[str, dict[str, Any]] = {}
        for row_idx, cells in sheet.items():
            date_value = cells.get("A", {}).get("value")
            row_date = to_date(date_value)
            if not row_date:
                continue
            item: dict[str, Any] = {}
            for metric in metrics:
                cell = cells.get(metric.column, {})
                item[metric.key] = {
                    "date": row_date,
                    "cell_ref": cell.get("ref", f"{metric.column}{row_idx}"),
                    "raw_value": cell.get("value"),
                    "value": to_number(cell.get("value")),
                }
            sheet_rows[row_date] = item
        rows_by_sheet[sheet_name] = sheet_rows
    return rows_by_sheet


def comparable(rows: dict[str, dict[str, Any]], metric_key: str, target: str, mode: str) -> dict[str, Any] | None:
    target_date = datetime.fromisoformat(target).date()
    if mode == "previous":
        candidates = [
            row
            for row_date, row in rows.items()
            if datetime.fromisoformat(row_date).date() < target_date and row[metric_key]["value"] not in (None, 0)
        ]
    else:
        ytd_cutoff = date(target_date.year - 1, 12, 31)
        candidates = [
            row
            for row_date, row in rows.items()
            if datetime.fromisoformat(row_date).date() <= ytd_cutoff and row[metric_key]["value"] not in (None, 0)
        ]
    if not candidates:
        return None
    return sorted(candidates, key=lambda row: row[metric_key]["date"], reverse=True)[0]


def convert_change(current: float, base: float | None, metric: MetricDef) -> float | None:
    if base in (None, 0):
        return None
    if metric.change_mode in {"rate_bp", "spread_bp"}:
        return round(((current / metric.value_multiplier) - (base / metric.value_multiplier)) * 100, 2)
    return round(((current - base) / base) * 100, 2)


def valid_report_dates(rows_by_sheet: dict[str, dict[str, dict[str, Any]]], until: str, from_date: str | None) -> list[str]:
    core = ["kospi", "usdkrw", "us_treasury_10y", "sp500", "wti"]
    metric_by_key = {metric.key: metric for metric in METRICS}
    counts: dict[str, int] = {}
    for key in core:
        metric = metric_by_key[key]
        for row_date, row in rows_by_sheet[metric.sheet].items():
            if row[key]["value"] not in (None, 0):
                counts[row_date] = counts.get(row_date, 0) + 1
    dates = []
    for row_date, count in counts.items():
        if count < 4:
            continue
        if row_date > until:
            continue
        if from_date and row_date < from_date:
            continue
        dates.append(row_date)
    return sorted(dates)


def build_report(rows_by_sheet: dict[str, dict[str, dict[str, Any]]], report_date: str, workbook_path: Path) -> dict[str, Any]:
    observations = []
    for metric in METRICS:
        rows = rows_by_sheet[metric.sheet]
        target_row = rows.get(report_date)
        if not target_row:
            continue
        target = target_row[metric.key]
        if target["value"] in (None, 0):
            continue
        current = round(float(target["value"]) * metric.value_multiplier, 4)
        previous_row = comparable(rows, metric.key, report_date, "previous")
        ytd_row = comparable(rows, metric.key, report_date, "ytd")
        previous = previous_row[metric.key]["value"] * metric.value_multiplier if previous_row else None
        ytd = ytd_row[metric.key]["value"] * metric.value_multiplier if ytd_row else None
        change_unit = "bp" if metric.change_mode in {"rate_bp", "spread_bp"} else "%"
        observations.append(
            {
                "observed_date": report_date,
                "category": metric.category,
                "category_label": CATEGORY_LABELS[metric.category],
                "metric_key": metric.key,
                "metric_name": metric.name,
                "value": current,
                "unit": metric.unit,
                "change_1d": convert_change(current, previous, metric),
                "change_1d_unit": change_unit,
                "change_ytd": convert_change(current, ytd, metric),
                "change_ytd_unit": change_unit,
                "source": "infomax_excel_cached",
                "source_sheet": metric.sheet,
                "source_cell": target["cell_ref"],
                "raw_value": None if target["raw_value"] is None else str(target["raw_value"]),
            }
        )
    return {
        "report_date": report_date,
        "title": f"Daily Report {report_date}",
        "author": "자금운용본부",
        "source_workbook": str(workbook_path),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "observations": observations,
    }


def supabase_headers(api_key: str, prefer: str = "resolution=merge-duplicates,return=representation") -> dict[str, str]:
    return {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def request_json(method: str, url: str, api_key: str, payload: Any | None = None) -> Any:
    response = requests.request(method, url, headers=supabase_headers(api_key), json=payload, timeout=60)
    if response.status_code >= 400:
        raise RuntimeError(f"{method} {url} failed: {response.status_code} {response.text[:500]}")
    if not response.text:
        return None
    return response.json()


def upload_report(base_url: str, api_key: str, report: dict[str, Any]) -> int:
    rest = base_url.rstrip("/") + "/rest/v1"
    created = request_json(
        "POST",
        f"{rest}/reports?on_conflict=report_date",
        api_key,
        [{"report_date": report["report_date"], "status": "draft", "title": report["title"]}],
    )
    report_id = created[0]["id"] if isinstance(created, list) else created["id"]
    observations = [
        {
            "report_id": report_id,
            "observed_date": item["observed_date"],
            "category": item["category"],
            "metric_key": item["metric_key"],
            "metric_name": item["metric_name"],
            "value": item["value"],
            "unit": item["unit"],
            "change_1d": item["change_1d"],
            "change_1d_unit": item["change_1d_unit"],
            "change_ytd": item["change_ytd"],
            "change_ytd_unit": item["change_ytd_unit"],
            "source": item["source"],
            "source_sheet": item["source_sheet"],
            "source_cell": item["source_cell"],
            "raw_value": item["raw_value"],
        }
        for item in report["observations"]
    ]
    if observations:
        request_json("POST", f"{rest}/market_observations?on_conflict=report_id,metric_key", api_key, observations)
    request_json("POST", f"{rest}/report_comments?on_conflict=report_id", api_key, [{"report_id": report_id, "tags": []}])
    return len(observations)


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root)
    workbook_path = Path(args.workbook)
    until = args.until
    rows_by_sheet = collect_rows(workbook_path)
    dates = valid_report_dates(rows_by_sheet, until, args.from_date)
    reports = [build_report(rows_by_sheet, report_date, workbook_path) for report_date in dates]
    reports = [report for report in reports if report["observations"]]

    processed_dir = project_root / "data" / "processed"
    if args.write_json:
        processed_dir.mkdir(parents=True, exist_ok=True)
        for report in reports:
            path = processed_dir / f"market_daily_{report['report_date']}.json"
            path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({"reports": len(reports), "from": dates[0] if dates else None, "until": dates[-1] if dates else None}, ensure_ascii=False))
    if args.dry_run:
        return 0

    env = read_env(project_root)
    base_url = env.get("SUPABASE_URL")
    api_key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_ANON_KEY")
    if not base_url or not api_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE key are required.")

    uploaded_reports = 0
    uploaded_observations = 0
    for report in reports:
        uploaded_observations += upload_report(base_url, api_key, report)
        uploaded_reports += 1
        if uploaded_reports % 25 == 0:
            print(f"uploaded reports {uploaded_reports}/{len(reports)}")
    print(json.dumps({"uploaded_reports": uploaded_reports, "uploaded_observations": uploaded_observations}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
