# AI Context Contract

Daily Report의 AI 기능은 모델 공급자를 바꿀 수 있어야 한다. Qwen, DeepSeek, OpenAI 등 어떤 모델을 쓰더라도 Admin과 공개 리포트는 같은 context payload를 전달한다.

## Provider policy

- 1차 구현은 `llmProvider.generateAnswer(context, messages)` 형태의 adapter로 만든다.
- 기본 후보는 Qwen이다. Qwen-Agent가 function calling, RAG, MCP를 제공하므로 리포트 컨텍스트와 내부 도구 연결에 유리하다.
- DeepSeek은 reasoning/API 호환 후보로 둔다. 외부 API 사용 시 민감 데이터 전송 정책을 별도로 확인한다.
- 모델이 답변을 만들 때 사용한 근거는 `sources`로 반환해야 한다.

## Metric context

지표 행, 차트, 검증 결과에서 AI 챗봇을 열 때 다음 payload를 넘긴다. 단, 공개 리포트 MVP에서는 상세 패널을 제거했으므로 `selected_metric`은 `null`일 수 있다.

```json
{
  "report_date": "2026-05-18",
  "surface": "admin|public_report",
  "selected_metric": {
    "metric_key": "kospi",
    "metric_name": "KOSPI",
    "category": "domestic_equities_fx",
    "category_label": "국내 주식",
    "value": 3846.32,
    "unit": "pt",
    "change_1d": -0.42,
    "change_1d_unit": "%",
    "change_ytd": 8.1,
    "change_ytd_unit": "%"
  },
  "report_comment": {
    "status": "published",
    "final_comment": "...",
    "auto_comment": "...",
    "reference_note": "..."
  },
  "validation": [
    {
      "metric_key": "kospi",
      "source": "Yahoo Finance",
      "symbol": "^KS11",
      "db_value": 3846.32,
      "external_value": 3847.01,
      "status": "match|mismatch|external_error|db_missing|approved",
      "url": "https://finance.yahoo.com/quote/%5EKS11"
    }
  ],
  "history": [
    {
      "report_date": "2026-05-17",
      "value": 3862.12,
      "change_1d": 0.22,
      "change_ytd": 8.54
    }
  ],
  "research_items": [
    {
      "source_type": "google_news|telegram|manual_note|historical_comment",
      "title": "기사 또는 메시지 제목",
      "url": "https://example.com",
      "published_at": "2026-05-18T07:30:00+09:00",
      "text": "요약 또는 원문 일부"
    }
  ]
}
```

## Expected answer shape

```json
{
  "answer": "질문에 대한 한국어 답변",
  "confidence": "low|medium|high",
  "sources": [
    {
      "label": "Yahoo Finance ^KS11",
      "url": "https://finance.yahoo.com/quote/%5EKS11"
    }
  ],
  "followups": [
    "최근 5거래일 흐름도 볼까요?"
  ]
}
```

## UI implications

- 공개 리포트 MVP에서는 지표 상세 패널을 두지 않는다. 챗봇은 `selected_metric: null`인 상태에서도 현재 날짜의 리포트 코멘트, 검증 결과, 향후 research item을 기반으로 동작해야 한다.
- 이후 지표 상세/차트 UI를 다시 도입하면, 해당 화면에서만 `selected_metric` context를 채운다.
- Admin 코멘트 화면은 `research_items`를 사람이 검토할 수 있는 근거 목록으로 먼저 보여주고, 같은 목록을 AI 초안 생성에 전달한다.
- 자동 발행 모드에서는 AI 답변이나 코멘트 초안에 반드시 `sources`와 생성 로그를 남긴다.
