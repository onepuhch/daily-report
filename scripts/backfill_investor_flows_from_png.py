from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import requests
from PIL import Image, ImageFilter, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
from compare_png_report_data import find_pngs, ocr_words, section_dates  # noqa: E402
from import_historical_market_data import supabase_headers  # noqa: E402


@dataclass(frozen=True)
class FlowCell:
    key: str
    name: str
    box: tuple[int, int, int, int]


FLOW_CELLS = [
    FlowCell("stock_kospi_foreign", "KOSPI 외국인 순매수", (166, 745, 246, 771)),
    FlowCell("stock_kospi_inst", "KOSPI 기관 순매수", (249, 745, 329, 771)),
    FlowCell("stock_kospi_individual", "KOSPI 개인 순매수", (332, 745, 412, 771)),
    FlowCell("stock_kosdaq_foreign", "KOSDAQ 외국인 순매수", (166, 773, 246, 799)),
    FlowCell("stock_kosdaq_inst", "KOSDAQ 기관 순매수", (249, 773, 329, 799)),
    FlowCell("stock_kosdaq_individual", "KOSDAQ 개인 순매수", (332, 773, 412, 799)),
    FlowCell("fut_kospi200_foreign", "KOSPI200 선물 외국인 순매수", (166, 801, 246, 827)),
    FlowCell("fut_kospi200_inst", "KOSPI200 선물 기관 순매수", (249, 801, 329, 827)),
    FlowCell("fut_kospi200_individual", "KOSPI200 선물 개인 순매수", (332, 801, 412, 827)),
    FlowCell("fut_kr3y_foreign", "3년 국채선물 외국인 순매수", (166, 830, 246, 856)),
    FlowCell("fut_kr3y_inst", "3년 국채선물 기관 순매수", (249, 830, 329, 856)),
    FlowCell("fut_kr3y_individual", "3년 국채선물 개인 순매수", (332, 830, 412, 856)),
    FlowCell("fut_kr10y_foreign", "10년 국채선물 외국인 순매수", (166, 858, 246, 884)),
    FlowCell("fut_kr10y_inst", "10년 국채선물 기관 순매수", (249, 858, 329, 884)),
    FlowCell("fut_kr10y_individual", "10년 국채선물 개인 순매수", (332, 858, 412, 884)),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill historical investor-flow observations from Market Daily PNGs.")
    parser.add_argument("--source-root", default=r"C:\Users\infomax\Desktop\Market Daily")
    parser.add_argument("--output-dir", default="data/png_investor_flow_backfill")
    parser.add_argument("--tesseract", default=r"C:\Program Files\Tesseract-OCR\tesseract.exe")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--replace-existing-png", action="store_true", help="Replace existing historical_png_table rows.")
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


def request_json(method: str, base_url: str, api_key: str, path: str, payload: Any | None = None) -> Any:
    response = requests.request(
        method,
        base_url.rstrip("/") + "/rest/v1/" + path,
        headers=supabase_headers(api_key),
        json=payload,
        timeout=60,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"{method} {path} failed: {response.status_code} {response.text[:500]}")
    return response.json() if response.text else None


def parse_number(text: str) -> float | None:
    compact = text.replace(",", "").replace(" ", "").strip()
    match = re.search(r"[+-]?\d+", compact)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def infer_yearless_date(publication_date: str, month: int, day: int) -> str | None:
    pub = datetime.fromisoformat(publication_date).date()
    try:
        target = pub.replace(month=month, day=day)
    except ValueError:
        return None
    if target > pub:
        target = target.replace(year=target.year - 1)
    return target.isoformat()


def ocr_domestic_equities_date(tesseract: Path, image: Image.Image, publication_date: str) -> str | None:
    crop = image.crop((164, 548, 246, 574))
    crop = ImageOps.grayscale(crop)
    crop = ImageOps.autocontrast(crop)
    crop = crop.resize((crop.width * 6, crop.height * 6))
    crop = crop.filter(ImageFilter.SHARPEN)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
        crop.save(handle.name)
        temp_path = handle.name

    result = subprocess.run(
        [
            str(tesseract),
            temp_path,
            "stdout",
            "-l",
            "eng",
            "--psm",
            "7",
            "-c",
            "tessedit_char_whitelist=0123456789/()",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
        timeout=15,
    )
    match = re.search(r"(\d{1,2})\s*/\s*(\d{1,2})", result.stdout)
    if not match:
        return None
    return infer_yearless_date(publication_date, int(match.group(1)), int(match.group(2)))


def ocr_flow_cell(tesseract: Path, image: Image.Image, box: tuple[int, int, int, int]) -> tuple[float | None, str]:
    candidates: list[tuple[float, str]] = []
    attempts = [("140", "6"), ("170", "7"), ("200", "6"), ("240", "8")]
    for threshold_text, psm in attempts:
        threshold = int(threshold_text)
        crop = image.crop(box)
        crop = ImageOps.grayscale(crop)
        crop = ImageOps.autocontrast(crop)
        crop = crop.resize((crop.width * 6, crop.height * 6))
        crop = crop.filter(ImageFilter.SHARPEN)
        crop = crop.point(lambda pixel, cutoff=threshold: 0 if pixel < cutoff else 255)

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
            crop.save(handle.name)
            temp_path = handle.name

        result = subprocess.run(
            [
                str(tesseract),
                temp_path,
                "stdout",
                "-l",
                "eng",
                "--psm",
                psm,
                "-c",
                "tessedit_char_whitelist=0123456789,+-",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            timeout=15,
        )
        raw = result.stdout.strip()
        value = parse_number(raw)
        if value is not None:
            if raw.strip().startswith(("+", "-")):
                return value, raw
            candidates.append((value, raw))

    if not candidates:
        return None, ""
    signed = [(value, raw) for value, raw in candidates if raw.strip().startswith(("+", "-"))]
    if signed:
        return signed[0]
    return candidates[0]


def existing_reports(base_url: str, api_key: str) -> dict[str, str]:
    rows = request_json("GET", base_url, api_key, "reports?select=id,report_date&order=report_date.asc") or []
    return {row["report_date"]: row["id"] for row in rows}


def existing_flow_keys(base_url: str, api_key: str) -> set[tuple[str, str, str]]:
    flow_keys = ",".join(cell.key for cell in FLOW_CELLS)
    rows: list[dict[str, Any]] = []
    page_size = 1000
    offset = 0
    while True:
        page = request_json(
            "GET",
            base_url,
            api_key,
            (
                "market_observations?"
                "select=metric_key,source,reports(report_date)"
                f"&metric_key=in.({flow_keys})"
                f"&limit={page_size}&offset={offset}"
            ),
        ) or []
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    existing: set[tuple[str, str, str]] = set()
    for row in rows:
        report_date = (row.get("reports") or {}).get("report_date")
        if report_date and row.get("metric_key"):
            existing.add((report_date, row["metric_key"], row.get("source") or ""))
    return existing


def build_backfill_rows(pngs: list[Path], tesseract: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rows: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    for index, png in enumerate(pngs, start=1):
        publication_date = png.stem
        try:
            with Image.open(png) as image:
                words = ocr_words(tesseract, png)
                report_date = section_dates(words, publication_date).get("domestic_equities_fx")
                if not report_date:
                    report_date = ocr_domestic_equities_date(tesseract, image, publication_date)
                if not report_date:
                    failures.append({"png_date": publication_date, "png_file": str(png), "error": "section date not found"})
                    continue

                for cell in FLOW_CELLS:
                    value, raw = ocr_flow_cell(tesseract, image, cell.box)
                    if value is None:
                        failures.append(
                            {
                                "png_date": publication_date,
                                "png_file": str(png),
                                "report_date": report_date,
                                "metric_key": cell.key,
                                "raw": raw,
                                "error": "cell OCR failed",
                            }
                        )
                        continue
                    rows.append(
                        {
                            "png_date": publication_date,
                            "png_file": str(png),
                            "report_date": report_date,
                            "observed_date": report_date,
                            "category": "investor_flows",
                            "metric_key": cell.key,
                            "metric_name": cell.name,
                            "value": value,
                            "unit": "억원",
                            "change_1d": None,
                            "change_1d_unit": "억원",
                            "change_ytd": None,
                            "change_ytd_unit": "억원",
                            "source": "historical_png_table",
                            "source_sheet": "PNG 투자자별 매매 동향",
                            "source_cell": f"{png.parent.name}/{png.name}:{cell.box}",
                            "raw_value": raw,
                        }
                    )
        except Exception as error:  # noqa: BLE001 - keep scanning remaining PNGs.
            failures.append({"png_date": publication_date, "png_file": str(png), "error": str(error)})
        if index % 25 == 0:
            print(f"processed {index}/{len(pngs)}", flush=True)
    return rows, failures


def filter_upload_rows(
    rows: list[dict[str, Any]],
    report_ids: dict[str, str],
    existing: set[tuple[str, str, str]],
    replace_existing_png: bool,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    upload_rows: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    seen_upload_keys: set[tuple[str, str]] = set()
    for row in rows:
        report_id = report_ids.get(row["report_date"])
        if not report_id:
            skipped.append({**row, "skip_reason": "report not found"})
            continue

        any_existing = any((row["report_date"], row["metric_key"], source) in existing for source in ["infomax_excel_cached", "historical_png_table"])
        png_existing = (row["report_date"], row["metric_key"], "historical_png_table") in existing
        if any_existing and not (replace_existing_png and png_existing):
            skipped.append({**row, "skip_reason": "observation already exists"})
            continue

        upload_key = (report_id, row["metric_key"])
        if upload_key in seen_upload_keys:
            skipped.append({**row, "skip_reason": "duplicate upload candidate"})
            continue
        seen_upload_keys.add(upload_key)

        payload = {
            "report_id": report_id,
            "observed_date": row["observed_date"],
            "category": row["category"],
            "metric_key": row["metric_key"],
            "metric_name": row["metric_name"],
            "value": row["value"],
            "unit": row["unit"],
            "change_1d": row["change_1d"],
            "change_1d_unit": row["change_1d_unit"],
            "change_ytd": row["change_ytd"],
            "change_ytd_unit": row["change_ytd_unit"],
            "source": row["source"],
            "source_sheet": row["source_sheet"],
            "source_cell": row["source_cell"],
            "raw_value": row["raw_value"],
        }
        upload_rows.append(payload)
    return upload_rows, skipped


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


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

    env = read_env(project_root)
    base_url = env.get("SUPABASE_URL")
    api_key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_ANON_KEY")
    if not base_url or not api_key:
        raise RuntimeError("Supabase env vars missing. Set SUPABASE_URL and SUPABASE_*_KEY.")

    extracted_rows, failures = build_backfill_rows(pngs, tesseract)
    report_ids = existing_reports(base_url, api_key)
    existing = existing_flow_keys(base_url, api_key)
    upload_rows, skipped = filter_upload_rows(extracted_rows, report_ids, existing, args.replace_existing_png)

    write_csv(output_dir / "investor_flow_extracted.csv", extracted_rows)
    write_csv(output_dir / "investor_flow_upload_rows.csv", upload_rows)
    write_csv(output_dir / "investor_flow_skipped.csv", skipped)
    write_csv(output_dir / "investor_flow_failures.csv", failures)

    uploaded = 0
    if not args.dry_run and upload_rows:
        for start in range(0, len(upload_rows), 500):
            batch = upload_rows[start : start + 500]
            request_json("POST", base_url, api_key, "market_observations?on_conflict=report_id,metric_key", batch)
            uploaded += len(batch)
            print(f"uploaded {uploaded}/{len(upload_rows)}", flush=True)

    summary = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "png_count": len(pngs),
        "extracted_rows": len(extracted_rows),
        "upload_candidates": len(upload_rows),
        "uploaded_rows": uploaded,
        "skipped_rows": len(skipped),
        "failures": len(failures),
        "dry_run": args.dry_run,
        "output_dir": str(output_dir),
    }
    (output_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
