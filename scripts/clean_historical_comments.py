from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path

from PIL import Image


DATE_RE = re.compile(r"(?P<date>20\d{2}-\d{2}-\d{2})")
SECTION_RE = re.compile(r"^\s*[-–—]?\s*\[(국내|해외)\]\s*(.*)")


@dataclass
class CleanedComment:
    report_date: str
    comment: str
    sections: dict[str, str]
    source_image: str
    box_image: str
    raw_ocr: str
    warnings: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract only the yellow historical comment box from OCR crops.")
    parser.add_argument("--input-dir", default="data/historical_ocr/crops")
    parser.add_argument("--source-root", help="Optional folder containing monthly yyyy-mm-dd PNG files.")
    parser.add_argument("--source-documents", default="data/historical_ocr/source_documents.jsonl")
    parser.add_argument("--output-dir", default="data/historical_ocr/cleaned_comments")
    parser.add_argument("--tesseract", default=r"C:\Program Files\Tesseract-OCR\tesseract.exe")
    parser.add_argument("--date", help="Process one yyyy-mm-dd date.")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def report_date(path: Path) -> str:
    match = DATE_RE.search(path.name)
    if not match:
        raise ValueError(f"Could not parse date from {path}")
    return match.group("date")


def is_yellow(pixel: tuple[int, ...]) -> bool:
    r, g, b = pixel[:3]
    return r >= 210 and g >= 170 and b <= 90 and abs(r - g) <= 120


def yellow_box(image_path: Path, output_path: Path) -> list[int]:
    with Image.open(image_path) as image:
        rgb = image.convert("RGB")
        width, height = rgb.size
        if width < 1000 and height < 1400:
            search = [int(width * 0.48), int(height * 0.64), width, height]
        else:
            search = [0, 0, width, height]
        search_left, search_top, search_right, search_bottom = search
        search_width = search_right - search_left
        search_height = search_bottom - search_top
        rows = []
        cols = []
        for y in range(search_top, search_bottom):
            yellow_count = 0
            for x in range(search_left, search_right):
                if is_yellow(rgb.getpixel((x, y))):
                    yellow_count += 1
            if yellow_count / search_width >= 0.35:
                rows.append(y)
        for x in range(search_left, search_right):
            yellow_count = 0
            for y in range(search_top, search_bottom):
                if is_yellow(rgb.getpixel((x, y))):
                    yellow_count += 1
            if yellow_count / search_height >= 0.15:
                cols.append(x)

        if not rows or not cols:
            box = [0, 0, width, height]
        else:
            left = max(min(cols) - 4, 0)
            top = max(min(rows) - 4, 0)
            right = min(max(cols) + 5, width)
            bottom = min(max(rows) + 5, height)
            box = [left, top, right, bottom]

        crop = rgb.crop(tuple(box))
        if crop.width < 900:
            crop = crop.resize((crop.width * 3, crop.height * 3))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        crop.save(output_path)
        return box


def load_source_images(source_documents: Path) -> dict[str, Path]:
    if not source_documents.exists():
        return {}
    sources: dict[str, Path] = {}
    with source_documents.open(encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            date = row.get("source_date")
            file_path = row.get("file_path")
            if not date or not file_path:
                continue
            path = Path(file_path)
            if path.exists():
                sources[str(date)] = path
    return sources


def find_source_pngs(source_root: Path) -> dict[str, Path]:
    if not source_root.exists():
        return {}
    sources: dict[str, Path] = {}
    for path in sorted(source_root.glob("[0-9][0-9][0-9][0-9]/*.png")):
        try:
            date = report_date(path)
        except ValueError:
            continue
        sources[date] = path
    return sources


def run_tesseract(tesseract: Path, image_path: Path, output_base: Path) -> None:
    subprocess.run(
        [
            str(tesseract),
            str(image_path),
            str(output_base),
            "-l",
            "kor+eng",
            "--psm",
            "6",
        ],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def normalize_ocr_text(text: str) -> str:
    replacements = {
        "\u00a0": " ",
        "→": "->",
        "，": ",",
        "．": ".",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    lines = []
    for raw in text.splitlines():
        line = " ".join(raw.strip().split())
        if line:
            lines.append(line)
    return "\n".join(lines)


def collect_sections(text: str) -> tuple[dict[str, str], list[str]]:
    warnings: list[str] = []
    sections: dict[str, list[str]] = {}
    current = ""

    for line in normalize_ocr_text(text).splitlines():
        match = SECTION_RE.match(line)
        if match:
            current = match.group(1)
            sections.setdefault(current, [])
            rest = match.group(2).strip()
            if rest:
                sections[current].append(rest)
            continue
        if current:
            sections[current].append(line)

    if not sections:
      warnings.append("no_domestic_or_global_section")

    cleaned = {key: clean_sentence(" ".join(parts).strip()) for key, parts in sections.items() if " ".join(parts).strip()}
    for key in ("국내", "해외"):
        if key not in cleaned:
            warnings.append(f"missing_{key}_section")
    return cleaned, warnings


def clean_sentence(text: str) -> str:
    replacements = {
        "지 정학": "지정학",
        "Al 정학": "지정학",
        "AI 정학": "지정학",
        "Zt 협상": "간 협상",
        "Z 협상": "간 협상",
        "자 산": "자산",
        "2 차": "2차",
        "3 월": "3월",
        "10%-159%": "10%->15%",
        "10%-15%": "10%->15%",
        "『미가": "PPI가",
        "ㅁ미가": "PPI가",
        "We 금일": "WTI는 금일",
        "WTI 는": "WTI는",
        "대롱령": "대통령",
        "종재": "총재",
        "죽소": "축소",
        "수줄": "수출",
        "편더멘털": "펀더멘털",
        "즉면": "측면",
        "금롱": "금융",
        "금동 위": "금통위",
        "금통 위": "금통위",
        "예상지": "예상치",
        "예즉": "예측",
        "부함": "부합",
        "질어": "짙어",
        "그졌": "그쳤",
        "되들리": "되돌리",
        "줄회": "출회",
        "손 절": "손절",
        "가 능성": "가능성",
        "작은편": "작은 편",
        "글로별": "글로벌",
        "종리": "총리",
        "재경부": "기재부",
        "국재선물": "국채선물",
        "금리 a 승": "금리 상승",
        "a 승": "상승",
        "of 락": "하락",
        "Of 감": "마감",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    text = re.sub(r"\s+([,.%])", r"\1", text)
    text = re.sub(r"(\d)\s+차", r"\1차", text)
    return " ".join(text.split())


def format_comment(sections: dict[str, str]) -> str:
    lines = []
    for key in ("국내", "해외"):
        text = sections.get(key, "").strip()
        if text:
            lines.append(f"[{key}]\n{text}")
    return "\n\n".join(lines)


SUSPICIOUS_TOKEN_RE = re.compile(r"\b[A-Z]{3,}\]?\b|[A-Za-z][A-Za-z|\[\]]+\b|\?{2,}|[ㅏ-ㅣㄱ-ㅎ]{2,}|[『』]")


def quality_warnings(comment: str) -> list[str]:
    warnings = []
    seen = set()
    for match in SUSPICIOUS_TOKEN_RE.finditer(comment):
        token = match.group(0)
        allowed = {
            "ADP",
            "BOE",
            "CME",
            "CPI",
            "ECB",
            "FOMC",
            "GDP",
            "ISM",
            "MOM",
            "PCE",
            "PMI",
            "PPI",
            "RBA",
            "WTI",
            "WGBI",
            "YOY",
        }
        normalized = token.rstrip("]").upper()
        if normalized in allowed:
            continue
        if token not in seen:
            warnings.append(f"suspicious_token:{token}")
            seen.add(token)
    return warnings


def main() -> int:
    args = parse_args()
    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    boxes_dir = output_dir / "boxes"
    raw_dir = output_dir / "raw_ocr"
    clean_dir = output_dir / "review"
    tesseract = Path(args.tesseract)

    source_images = load_source_images(Path(args.source_documents))
    if args.source_root:
        source_images.update(find_source_pngs(Path(args.source_root)))

    if args.source_root:
        files = [source_images[date] for date in sorted(source_images)]
    else:
        files = sorted(input_dir.glob("*.comment.png"))
    if args.date:
        files = [path for path in files if report_date(path) == args.date]
    if args.limit:
        files = files[: args.limit]

    results: list[CleanedComment] = []
    failures = []

    for index, image_path in enumerate(files, start=1):
        date = report_date(image_path)
        source_image = source_images.get(date, image_path)
        box_image = boxes_dir / f"{date}.comment_box.png"
        raw_base = raw_dir / f"{date}.comment_box"
        raw_text_path = raw_dir / f"{date}.comment_box.txt"
        review_path = clean_dir / f"{date}.comment.review.txt"

        try:
            yellow_box(source_image, box_image)
            raw_dir.mkdir(parents=True, exist_ok=True)
            if args.force or not raw_text_path.exists():
                run_tesseract(tesseract, box_image, raw_base)
            raw_text = normalize_ocr_text(raw_text_path.read_text(encoding="utf-8", errors="replace"))
            raw_text_path.write_text(raw_text + "\n", encoding="utf-8")
            sections, warnings = collect_sections(raw_text)
            comment = format_comment(sections)
            warnings.extend(quality_warnings(comment))
            clean_dir.mkdir(parents=True, exist_ok=True)
            review_path.write_text(comment + ("\n" if comment else ""), encoding="utf-8")
            results.append(
                CleanedComment(
                    report_date=date,
                    comment=comment,
                    sections=sections,
                    source_image=str(source_image),
                    box_image=str(box_image),
                    raw_ocr=raw_text,
                    warnings=warnings,
                )
            )
        except Exception as error:  # noqa: BLE001 - keep processing the rest for review.
            failures.append({"date": date, "file": str(image_path), "error": str(error)})

        if index % 25 == 0:
            print(f"processed {index}/{len(files)}", flush=True)

    output_dir.mkdir(parents=True, exist_ok=True)
    jsonl_path = output_dir / "cleaned_comments.jsonl"
    approved_dir = output_dir / "approved"
    needs_review_dir = output_dir / "needs_review"
    approved_dir.mkdir(parents=True, exist_ok=True)
    needs_review_dir.mkdir(parents=True, exist_ok=True)
    for stale_dir in (approved_dir, needs_review_dir):
        for stale_file in stale_dir.glob("*.comment.txt"):
            stale_file.unlink()
    with jsonl_path.open("w", encoding="utf-8") as handle:
        for item in results:
            handle.write(json.dumps(asdict(item), ensure_ascii=False) + "\n")
            target_dir = needs_review_dir if item.warnings else approved_dir
            (target_dir / f"{item.report_date}.comment.txt").write_text(
                item.comment + ("\n" if item.comment else ""),
                encoding="utf-8",
            )

    warning_count = sum(1 for item in results if item.warnings)
    warning_rows = [
        {
            "report_date": item.report_date,
            "warnings": item.warnings,
            "review_file": str(needs_review_dir / f"{item.report_date}.comment.txt"),
            "box_image": item.box_image,
        }
        for item in results
        if item.warnings
    ]
    (output_dir / "needs_review.json").write_text(
        json.dumps(warning_rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    summary = {
        "processed": len(results),
        "failures": failures,
        "warning_count": warning_count,
        "approved_count": len(results) - warning_count,
        "jsonl": str(jsonl_path),
        "review_dir": str(clean_dir),
        "approved_dir": str(approved_dir),
        "needs_review_dir": str(needs_review_dir),
        "needs_review_json": str(output_dir / "needs_review.json"),
        "boxes_dir": str(boxes_dir),
    }
    (output_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
