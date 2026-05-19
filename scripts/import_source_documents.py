from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests

from import_historical_market_data import read_env, supabase_headers


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            doc = json.loads(line)
            rows.append(
                {
                    "source_type": doc.get("source_type"),
                    "source_date": doc.get("source_date"),
                    "title": doc.get("title"),
                    "file_path": doc.get("file_path"),
                    "extracted_text": doc.get("extracted_text"),
                    "summary": doc.get("summary"),
                    "tags": doc.get("tags") or [],
                }
            )
    return rows


def request_json(method: str, url: str, api_key: str, payload: Any | None = None) -> Any:
    response = requests.request(method, url, headers=supabase_headers(api_key, "return=representation"), json=payload, timeout=60)
    if response.status_code >= 400:
        raise RuntimeError(f"{method} {url} failed: {response.status_code} {response.text[:500]}")
    if not response.text:
        return None
    return response.json()


def upload_rows(base_url: str, api_key: str, rows: list[dict[str, Any]]) -> int:
    rest = base_url.rstrip("/") + "/rest/v1"
    uploaded = 0
    for row in rows:
        file_path = row.get("file_path")
        if file_path:
            encoded = quote(str(file_path), safe="")
            request_json("DELETE", f"{rest}/source_documents?file_path=eq.{encoded}", api_key)
        request_json("POST", f"{rest}/source_documents", api_key, [row])
        uploaded += 1
        if uploaded % 25 == 0:
            print(f"uploaded source_documents {uploaded}/{len(rows)}", flush=True)
    return uploaded


def main() -> None:
    parser = argparse.ArgumentParser(description="Import OCR source_documents JSONL into Supabase.")
    parser.add_argument("--jsonl", default="data/historical_ocr/source_documents.jsonl")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    root = Path.cwd()
    jsonl_path = (root / args.jsonl).resolve()
    env = read_env(root)
    base_url = env.get("SUPABASE_URL")
    api_key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_ANON_KEY")
    if not base_url or not api_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE key are required.")

    rows = load_jsonl(jsonl_path)
    print(json.dumps({"source_documents": len(rows), "jsonl": str(jsonl_path)}, ensure_ascii=False), flush=True)
    if args.dry_run:
        return
    uploaded = upload_rows(base_url, api_key, rows)
    print(json.dumps({"uploaded_source_documents": uploaded}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
