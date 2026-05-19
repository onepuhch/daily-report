from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

from PIL import Image


DATE_RE = re.compile(r"(?P<date>20\d{2}-\d{2}-\d{2})")


@dataclass
class OcrDocument:
    source_type: str
    source_date: str
    title: str
    file_path: str
    extracted_text: str
    summary: str
    tags: list[str]
    ocr_engine: str
    crop_box: list[int]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="OCR historical Market Daily PNG files.")
    parser.add_argument("--source-root", required=True, help="Folder containing yyyy-mm-dd PNG files.")
    parser.add_argument("--output-dir", default="data/historical_ocr", help="Output folder.")
    parser.add_argument("--tesseract", default=r"C:\Program Files\Tesseract-OCR\tesseract.exe")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of files for sampling.")
    parser.add_argument("--force", action="store_true", help="Re-run OCR even if text output exists.")
    parser.add_argument(
        "--exclude-dir",
        action="append",
        default=["project"],
        help="Directory name to skip while scanning. Can be passed multiple times.",
    )
    return parser.parse_args()


def find_pngs(source_root: Path, exclude_dirs: set[str]) -> list[Path]:
    files = []
    for path in source_root.rglob("*.png"):
        if any(part in exclude_dirs for part in path.relative_to(source_root).parts[:-1]):
            continue
        if DATE_RE.search(path.name):
            files.append(path)
    return sorted(files)


def report_date(path: Path) -> str:
    match = DATE_RE.search(path.name)
    if not match:
        raise ValueError(f"Could not parse date from {path}")
    return match.group("date")


def make_comment_crop(image_path: Path, crop_path: Path) -> list[int]:
    with Image.open(image_path) as image:
        width, height = image.size
        # Market Daily comments are in the lower-right panel. Keep a little table
        # context above it because older layouts place the first bullet higher.
        box = [
            int(width * 0.49),
            int(height * 0.69),
            int(width * 0.99),
            int(height * 0.94),
        ]
        crop = image.crop(tuple(box))
        crop = crop.resize((crop.width * 3, crop.height * 3))
        crop.save(crop_path)
    return box


def run_tesseract(tesseract: Path, image_path: Path, output_base: Path) -> None:
    command = [
        str(tesseract),
        str(image_path),
        str(output_base),
        "-l",
        "kor+eng",
        "--psm",
        "6",
    ]
    subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def clean_ocr_text(text: str) -> str:
    lines = []
    for raw in text.splitlines():
        line = " ".join(raw.strip().split())
        if not line:
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def summarize(text: str) -> str:
    comment_lines = [line for line in text.splitlines() if line.startswith("-") or "[" in line]
    selected = comment_lines[:4] if comment_lines else text.splitlines()[:4]
    return " ".join(selected)[:500]


def main() -> int:
    args = parse_args()
    source_root = Path(args.source_root)
    output_dir = Path(args.output_dir)
    crops_dir = output_dir / "crops"
    texts_dir = output_dir / "texts"
    docs_path = output_dir / "source_documents.jsonl"
    summary_path = output_dir / "summary.json"

    output_dir.mkdir(parents=True, exist_ok=True)
    crops_dir.mkdir(parents=True, exist_ok=True)
    texts_dir.mkdir(parents=True, exist_ok=True)

    pngs = find_pngs(source_root, set(args.exclude_dir))
    if args.limit:
        pngs = pngs[: args.limit]

    docs: list[OcrDocument] = []
    failures = []
    tesseract = Path(args.tesseract)

    for index, png in enumerate(pngs, start=1):
        date = report_date(png)
        stem = date
        crop_path = crops_dir / f"{stem}.comment.png"
        text_path = texts_dir / f"{stem}.comment.txt"
        output_base = texts_dir / f"{stem}.comment"

        try:
            crop_box = make_comment_crop(png, crop_path)
            if args.force or not text_path.exists():
                run_tesseract(tesseract, crop_path, output_base)
            text = clean_ocr_text(text_path.read_text(encoding="utf-8", errors="replace"))
            text_path.write_text(text + "\n", encoding="utf-8")
            docs.append(
                OcrDocument(
                    source_type="historical_jpg",
                    source_date=date,
                    title=f"Market Daily historical comment {date}",
                    file_path=str(png),
                    extracted_text=text,
                    summary=summarize(text),
                    tags=["historical", "market-daily", "ocr", "comment"],
                    ocr_engine="tesseract-kor-eng",
                    crop_box=crop_box,
                )
            )
        except Exception as error:  # noqa: BLE001 - collect all OCR failures for review.
            failures.append({"file": str(png), "error": str(error)})

        if index % 25 == 0:
            print(f"processed {index}/{len(pngs)}")

    with docs_path.open("w", encoding="utf-8") as handle:
        for doc in docs:
            handle.write(json.dumps(asdict(doc), ensure_ascii=False) + "\n")

    summary = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source_root": str(source_root),
        "documents": len(docs),
        "failures": failures,
        "output": str(docs_path),
    }
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
