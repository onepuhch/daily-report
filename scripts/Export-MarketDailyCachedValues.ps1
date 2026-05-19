param(
    [string]$WorkbookPath,
    [string]$ReportDate,
    [string]$ProjectRoot,
    [switch]$NoHtml
)

$ErrorActionPreference = "Stop"

function Get-ScriptProjectRoot {
    if ($ProjectRoot) {
        return (Resolve-Path -LiteralPath $ProjectRoot).Path
    }

    return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

function Read-DotEnv {
    param([string]$Path)

    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $values
    }

    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $parts = $trimmed -split "=", 2
        if ($parts.Count -eq 2) {
            $values[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
        }
    }

    return $values
}

function Get-ZipEntryText {
    param(
        [System.IO.Compression.ZipArchive]$Zip,
        [string]$Name
    )

    $entry = $Zip.GetEntry($Name)
    if ($null -eq $entry) {
        return $null
    }

    $reader = [System.IO.StreamReader]::new($entry.Open())
    try {
        return $reader.ReadToEnd()
    }
    finally {
        $reader.Dispose()
    }
}

function ConvertFrom-ExcelSerialDate {
    param([double]$Serial)

    return ([datetime]"1899-12-30").AddDays($Serial).ToString("yyyy-MM-dd")
}

function Convert-ToNumber {
    param($Value)

    if ($null -eq $Value -or "$Value" -eq "") {
        return $null
    }

    $number = 0.0
    $ok = [double]::TryParse(
        "$Value",
        [System.Globalization.NumberStyles]::Float,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [ref]$number
    )

    if ($ok) {
        return $number
    }

    return $null
}

function Get-ColumnLetters {
    param([string]$CellRef)

    if ($CellRef -match "^([A-Z]+)") {
        return $Matches[1]
    }

    return $null
}

function Get-RowNumber {
    param([string]$CellRef)

    if ($CellRef -match "([0-9]+)$") {
        return [int]$Matches[1]
    }

    return $null
}

function Get-CellValue {
    param(
        $Cell,
        [string[]]$SharedStrings
    )

    if ($null -eq $Cell) {
        return $null
    }

    $raw = $Cell.v
    if ($Cell.t -eq "s" -and $null -ne $raw -and "$raw" -ne "") {
        return $SharedStrings[[int]$raw]
    }

    if ($Cell.t -eq "inlineStr" -and $Cell.is) {
        $parts = @()
        foreach ($t in $Cell.is.GetElementsByTagName("t")) {
            $parts += $t.InnerText
        }
        return ($parts -join "")
    }

    return $raw
}

function Open-XlsmSnapshot {
    param([string]$Path)

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)

    $sharedStrings = @()
    $sharedText = Get-ZipEntryText -Zip $zip -Name "xl/sharedStrings.xml"
    if ($sharedText) {
        [xml]$sharedXml = $sharedText
        foreach ($si in $sharedXml.sst.si) {
            $parts = @()
            foreach ($t in $si.GetElementsByTagName("t")) {
                $parts += $t.InnerText
            }
            $sharedStrings += ($parts -join "")
        }
    }

    [xml]$workbookXml = Get-ZipEntryText -Zip $zip -Name "xl/workbook.xml"
    [xml]$relsXml = Get-ZipEntryText -Zip $zip -Name "xl/_rels/workbook.xml.rels"

    $ridToTarget = @{}
    foreach ($rel in $relsXml.Relationships.Relationship) {
        $ridToTarget[$rel.Id] = $rel.Target
    }

    $sheets = @{}
    foreach ($sheet in $workbookXml.workbook.sheets.sheet) {
        $rid = $sheet.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
        $target = $ridToTarget[$rid]
        if (-not $target.StartsWith("/")) {
            $target = "xl/$target"
        }
        else {
            $target = $target.TrimStart("/")
        }

        [xml]$sheetXml = Get-ZipEntryText -Zip $zip -Name $target
        $rows = @()
        foreach ($row in $sheetXml.worksheet.sheetData.row) {
            $cellMap = @{}
            foreach ($cell in $row.c) {
                $col = Get-ColumnLetters -CellRef $cell.r
                if ($col) {
                    $cellMap[$col] = [pscustomobject]@{
                        Ref     = $cell.r
                        Value   = Get-CellValue -Cell $cell -SharedStrings $sharedStrings
                        Formula = $cell.f
                    }
                }
            }

            $rows += [pscustomobject]@{
                RowNumber = [int]$row.r
                Cells     = $cellMap
            }
        }

        $sheets[$sheet.name] = [pscustomobject]@{
            Name = $sheet.name
            Rows = $rows
        }
    }

    return [pscustomobject]@{
        Zip           = $zip
        SharedStrings = $sharedStrings
        Sheets        = $sheets
    }
}

function Get-SheetMetricRows {
    param(
        $Snapshot,
        [string]$SheetName,
        [object[]]$Metrics
    )

    $sheet = $Snapshot.Sheets[$SheetName]
    if ($null -eq $sheet) {
        throw "Workbook sheet not found: $SheetName"
    }

    $rows = @()
    foreach ($row in $sheet.Rows) {
        $dateNumber = Convert-ToNumber $row.Cells["A"].Value
        if ($null -eq $dateNumber -or $dateNumber -lt 20000) {
            continue
        }

        $date = ConvertFrom-ExcelSerialDate -Serial $dateNumber
        $metricValues = @{}
        foreach ($metric in $Metrics) {
            $cell = $row.Cells[$metric.Column]
            $metricValues[$metric.Key] = [pscustomobject]@{
                Date      = $date
                RowNumber = $row.RowNumber
                CellRef   = if ($cell) { $cell.Ref } else { $null }
                RawValue  = if ($cell) { $cell.Value } else { $null }
                Value     = Convert-ToNumber $(if ($cell) { $cell.Value } else { $null })
            }
        }

        $rows += [pscustomobject]@{
            Date    = $date
            Metrics = $metricValues
        }
    }

    return $rows
}

function Get-MetricDefinitions {
    $defs = @(
        @{ Key="cd_91d"; Name="CD 91일"; Category="domestic_rates"; Sheet="CD금리"; Column="B"; Unit="%"; ChangeMode="rate_bp" },
        @{ Key="kr_gov_2y"; Name="국고채 2년"; Category="domestic_rates"; Sheet="국내금리"; Column="B"; Unit="%"; ChangeMode="rate_bp" },
        @{ Key="kr_gov_3y"; Name="국고채 3년"; Category="domestic_rates"; Sheet="국내금리"; Column="C"; Unit="%"; ChangeMode="rate_bp" },
        @{ Key="kr_gov_5y"; Name="국고채 5년"; Category="domestic_rates"; Sheet="국내금리"; Column="D"; Unit="%"; ChangeMode="rate_bp" },
        @{ Key="kr_gov_10y"; Name="국고채 10년"; Category="domestic_rates"; Sheet="국내금리"; Column="E"; Unit="%"; ChangeMode="rate_bp" },
        @{ Key="kr_gov_30y"; Name="국고채 30년"; Category="domestic_rates"; Sheet="국내금리"; Column="G"; Unit="%"; ChangeMode="rate_bp" },
        @{ Key="kr_corp_aa0_3y"; Name="회사채 AA0 3년"; Category="credit"; Sheet="국내금리"; Column="X"; Unit="%"; ChangeMode="rate_bp" },
        @{ Key="credit_spread_aa0_2y"; Name="회사채 AA0 2년 스프레드"; Category="credit"; Sheet="크레딧SP"; Column="D"; Unit="bp"; ChangeMode="spread_bp"; ValueMultiplier=100 },

        @{ Key="us_treasury_2y"; Name="미국채 2년"; Category="global_rates"; Sheet="해외금리"; Column="B"; Unit="%"; ChangeMode="rate_bp" },
        @{ Key="us_treasury_10y"; Name="미국채 10년"; Category="global_rates"; Sheet="해외금리"; Column="C"; Unit="%"; ChangeMode="rate_bp" },
        @{ Key="us_treasury_30y"; Name="미국채 30년"; Category="global_rates"; Sheet="해외금리"; Column="D"; Unit="%"; ChangeMode="rate_bp" },
        @{ Key="germany_bund_10y"; Name="독일 국채 10년"; Category="global_rates"; Sheet="해외금리"; Column="E"; Unit="%"; ChangeMode="rate_bp" },
        @{ Key="japan_gov_10y"; Name="일본 국채 10년"; Category="global_rates"; Sheet="해외금리"; Column="F"; Unit="%"; ChangeMode="rate_bp" },

        @{ Key="kospi"; Name="KOSPI"; Category="domestic_equities_fx"; Sheet="국내주식및환율"; Column="B"; Unit="pt"; ChangeMode="pct" },
        @{ Key="kospi200"; Name="KOSPI200"; Category="domestic_equities_fx"; Sheet="국내주식및환율"; Column="C"; Unit="pt"; ChangeMode="pct" },
        @{ Key="kosdaq"; Name="KOSDAQ"; Category="domestic_equities_fx"; Sheet="국내주식및환율"; Column="D"; Unit="pt"; ChangeMode="pct" },
        @{ Key="usdkrw"; Name="원/달러"; Category="fx"; Sheet="국내주식및환율"; Column="E"; Unit="KRW"; ChangeMode="pct" },

        @{ Key="dow"; Name="다우 산업"; Category="global_equities"; Sheet="해외주식"; Column="B"; Unit="pt"; ChangeMode="pct" },
        @{ Key="sp500"; Name="S&P 500"; Category="global_equities"; Sheet="해외주식"; Column="C"; Unit="pt"; ChangeMode="pct" },
        @{ Key="nasdaq"; Name="나스닥 종합"; Category="global_equities"; Sheet="해외주식"; Column="D"; Unit="pt"; ChangeMode="pct" },
        @{ Key="dax"; Name="독일 DAX"; Category="global_equities"; Sheet="해외주식"; Column="E"; Unit="pt"; ChangeMode="pct" },
        @{ Key="nikkei225"; Name="니케이 225"; Category="global_equities"; Sheet="아시아주식"; Column="B"; Unit="pt"; ChangeMode="pct" },
        @{ Key="hangseng_h"; Name="항셍 H"; Category="global_equities"; Sheet="아시아주식"; Column="C"; Unit="pt"; ChangeMode="pct" },
        @{ Key="shanghai_comp"; Name="상해종합"; Category="global_equities"; Sheet="아시아주식"; Column="D"; Unit="pt"; ChangeMode="pct" },

        @{ Key="dollar_index"; Name="달러인덱스"; Category="fx"; Sheet="해외환율"; Column="B"; Unit="pt"; ChangeMode="pct" },
        @{ Key="usdjpy"; Name="달러/엔"; Category="fx"; Sheet="해외환율"; Column="C"; Unit="JPY"; ChangeMode="pct" },
        @{ Key="eurusd"; Name="유로/달러"; Category="fx"; Sheet="해외환율"; Column="D"; Unit="USD"; ChangeMode="pct" },

        @{ Key="btc_usd"; Name="BTC"; Category="crypto"; Sheet="암호화폐"; Column="B"; Unit="USD"; ChangeMode="pct" },
        @{ Key="eth_usd"; Name="ETH"; Category="crypto"; Sheet="암호화폐"; Column="C"; Unit="USD"; ChangeMode="pct" },

        @{ Key="wti"; Name="WTI"; Category="commodities"; Sheet="상품"; Column="B"; Unit="USD"; ChangeMode="pct" },
        @{ Key="brent"; Name="브렌트유"; Category="commodities"; Sheet="상품"; Column="C"; Unit="USD"; ChangeMode="pct" },
        @{ Key="gold"; Name="금"; Category="commodities"; Sheet="상품"; Column="D"; Unit="USD"; ChangeMode="pct" },
        @{ Key="silver"; Name="은"; Category="commodities"; Sheet="상품"; Column="E"; Unit="USD"; ChangeMode="pct" },
        @{ Key="sox"; Name="필라델피아 반도체"; Category="commodities"; Sheet="상품"; Column="F"; Unit="pt"; ChangeMode="pct" },
        @{ Key="copper"; Name="구리"; Category="commodities"; Sheet="상품"; Column="G"; Unit="USD"; ChangeMode="pct" }
    )

    return $defs | ForEach-Object { [pscustomobject]$_ }
}

function Get-DisplayCategory {
    param([string]$Category)

    $labels = @{
        domestic_rates       = "국내금리"
        global_rates         = "해외금리"
        domestic_equities_fx = "국내주식"
        global_equities      = "해외주식"
        fx                   = "환율"
        crypto               = "암호화폐"
        commodities          = "상품"
        credit               = "크레딧"
    }

    return $labels[$Category]
}

function Find-DefaultReportDate {
    param(
        $Snapshot,
        [object[]]$MetricDefs
    )

    $core = $MetricDefs | Where-Object { $_.Key -in @("kospi", "usdkrw", "us_treasury_10y", "sp500", "wti") }
    $rowsBySheet = @{}
    foreach ($sheetName in ($core | Select-Object -ExpandProperty Sheet -Unique)) {
        $rowsBySheet[$sheetName] = Get-SheetMetricRows -Snapshot $Snapshot -SheetName $sheetName -Metrics ($core | Where-Object Sheet -eq $sheetName)
    }

    $dates = @{}
    foreach ($metric in $core) {
        foreach ($row in $rowsBySheet[$metric.Sheet]) {
            $value = $row.Metrics[$metric.Key].Value
            if ($null -ne $value -and $value -ne 0) {
                if (-not $dates.ContainsKey($row.Date)) {
                    $dates[$row.Date] = 0
                }
                $dates[$row.Date] += 1
            }
        }
    }

    return ($dates.GetEnumerator() |
        Where-Object { $_.Value -ge 4 } |
        Sort-Object Name -Descending |
        Select-Object -First 1).Name
}

function Get-ComparableValue {
    param(
        [object[]]$Rows,
        [string]$MetricKey,
        [string]$TargetDate,
        [string]$Mode
    )

    $target = [datetime]$TargetDate

    if ($Mode -eq "previous") {
        return $Rows |
            Where-Object {
                ([datetime]$_.Date) -lt $target -and
                $null -ne $_.Metrics[$MetricKey].Value -and
                $_.Metrics[$MetricKey].Value -ne 0
            } |
            Sort-Object Date -Descending |
            Select-Object -First 1
    }

    $previousYearEnd = [datetime]::new($target.Year - 1, 12, 31)
    return $Rows |
        Where-Object {
            ([datetime]$_.Date) -le $previousYearEnd -and
            $null -ne $_.Metrics[$MetricKey].Value -and
            $_.Metrics[$MetricKey].Value -ne 0
        } |
        Sort-Object Date -Descending |
        Select-Object -First 1
}

function Convert-MarketChange {
    param(
        [double]$Current,
        [double]$Base,
        [string]$ChangeMode,
        [double]$ValueMultiplier = 1
    )

    if ($null -eq $Base -or $Base -eq 0) {
        return $null
    }

    if ($ChangeMode -in @("rate_bp", "spread_bp")) {
        return [math]::Round((($Current / $ValueMultiplier) - ($Base / $ValueMultiplier)) * 100, 2)
    }

    return [math]::Round((($Current - $Base) / $Base) * 100, 2)
}

function New-HtmlReport {
    param(
        $Report,
        [string]$OutputPath
    )

    Add-Type -AssemblyName System.Web
    $encode = { param($text) [System.Web.HttpUtility]::HtmlEncode("$text") }
    $formatNumber = {
        param($value)
        if ($null -eq $value) { return "-" }
        return ([double]$value).ToString("#,##0.##", [System.Globalization.CultureInfo]::InvariantCulture)
    }
    $formatChange = {
        param($value, $unit)
        if ($null -eq $value) { return "<span class='muted'>-</span>" }
        $class = if ($value -gt 0) { "up" } elseif ($value -lt 0) { "down" } else { "flat" }
        $prefix = if ($value -gt 0) { "+" } else { "" }
        return "<span class='$class'>$prefix$(([double]$value).ToString('#,##0.##', [System.Globalization.CultureInfo]::InvariantCulture))$unit</span>"
    }

    $categoryOrder = @("domestic_rates", "global_rates", "domestic_equities_fx", "global_equities", "fx", "crypto", "commodities", "credit")
    $sections = New-Object System.Text.StringBuilder
    foreach ($category in $categoryOrder) {
        $items = @($Report.observations | Where-Object { $_.category -eq $category })
        if ($items.Count -eq 0) { continue }

        [void]$sections.AppendLine("<section class='section'>")
        [void]$sections.AppendLine("<div class='section-head'><h2>$(& $encode $items[0].category_label)</h2><span>$($items.Count)개 지표</span></div>")
        [void]$sections.AppendLine("<div class='table-wrap'><table><thead><tr><th>지표</th><th>값</th><th>전일대비</th><th>작년말대비</th><th>출처</th></tr></thead><tbody>")
        foreach ($item in $items) {
            $changeUnit = if ($item.change_1d_unit -eq "bp") { "bp" } else { "%" }
            [void]$sections.AppendLine("<tr>")
            [void]$sections.AppendLine("<td><strong>$(& $encode $item.metric_name)</strong><small>$(& $encode $item.metric_key)</small></td>")
            [void]$sections.AppendLine("<td>$(& $formatNumber $item.value) <span class='muted'>$(& $encode $item.unit)</span></td>")
            [void]$sections.AppendLine("<td>$(& $formatChange $item.change_1d $changeUnit)</td>")
            [void]$sections.AppendLine("<td>$(& $formatChange $item.change_ytd $changeUnit)</td>")
            [void]$sections.AppendLine("<td><span class='source'>$(& $encode $item.source_sheet)!$(& $encode $item.source_cell)</span></td>")
            [void]$sections.AppendLine("</tr>")
        }
        [void]$sections.AppendLine("</tbody></table></div>")
        [void]$sections.AppendLine("</section>")
    }

    $generatedAt = [datetime]::Now.ToString("yyyy-MM-dd HH:mm:ss")
    $html = @"
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Market Daily - $($Report.report_date)</title>
  <style>
    :root {
      --bg: #f7f7f5;
      --paper: #ffffff;
      --ink: #252525;
      --muted: #6f6f6f;
      --line: #e6e4df;
      --soft: #f1f0ed;
      --up: #d92d20;
      --down: #1570ef;
      --status-published: #067647;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: "Pretendard", "Segoe UI", "Malgun Gothic", Arial, sans-serif;
      letter-spacing: 0;
    }
    main {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
      padding: 34px 0 54px;
    }
    header {
      border-bottom: 1px solid var(--line);
      padding-bottom: 22px;
      margin-bottom: 22px;
    }
    .kicker {
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 8px;
    }
    h1 {
      font-size: clamp(30px, 5vw, 48px);
      line-height: 1.08;
      margin: 0 0 14px;
      font-weight: 720;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0 11px;
      background: var(--paper);
      color: var(--muted);
      font-size: 13px;
    }
    .comment {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 18px 20px;
      margin-bottom: 18px;
    }
    .comment h2 {
      font-size: 16px;
      margin: 0 0 8px;
    }
    .comment p {
      color: var(--muted);
      line-height: 1.68;
      margin: 0;
    }
    .section {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 10px;
      margin-top: 14px;
      overflow: hidden;
    }
    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 15px 18px;
      border-bottom: 1px solid var(--line);
      background: #fbfbfa;
    }
    .section-head h2 {
      font-size: 17px;
      margin: 0;
    }
    .section-head span {
      color: var(--muted);
      font-size: 13px;
    }
    .table-wrap { overflow-x: auto; }
    table {
      width: 100%;
      min-width: 760px;
      border-collapse: collapse;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 12px 16px;
      text-align: right;
      vertical-align: middle;
      font-size: 14px;
      white-space: nowrap;
    }
    th {
      background: var(--soft);
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
    }
    th:first-child, td:first-child { text-align: left; }
    tr:last-child td { border-bottom: 0; }
    td strong {
      display: block;
      font-size: 14px;
      margin-bottom: 3px;
    }
    td small {
      display: block;
      color: var(--muted);
      font-size: 11px;
    }
    .muted { color: var(--muted); }
    .up { color: var(--up); font-weight: 650; }
    .down { color: var(--down); font-weight: 650; }
    .flat { color: var(--muted); font-weight: 650; }
    .source {
      color: var(--muted);
      font-size: 12px;
      font-family: Consolas, monospace;
    }
    footer {
      color: var(--muted);
      font-size: 12px;
      margin-top: 18px;
    }
    @media (max-width: 720px) {
      main { width: min(100% - 20px, 1180px); padding-top: 22px; }
      .comment, .section-head { padding-left: 14px; padding-right: 14px; }
      th, td { padding: 10px 12px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="kicker">Market Daily</div>
      <h1>Daily Report</h1>
      <div class="meta">
        <span class="pill">기준일 $($Report.report_date)</span>
        <span class="pill">작성 $(& $encode $Report.author)</span>
        <span class="pill">저장값 기반 추출</span>
      </div>
    </header>

    <section class="comment">
      <h2>코멘트 초안</h2>
      <p>현재 단계에서는 엑셀 저장값으로 지표표를 먼저 생성합니다. 다음 단계에서 관리자 화면을 붙이면 이 영역에 자동 코멘트 초안과 사람이 수정한 최종 코멘트가 함께 저장됩니다.</p>
    </section>

    $($sections.ToString())

    <footer>Generated at $generatedAt · source workbook: $(& $encode $Report.source_workbook)</footer>
  </main>
</body>
</html>
"@

    Set-Content -LiteralPath $OutputPath -Value $html -Encoding UTF8
}

function ConvertTo-SqlLiteral {
    param($Value)

    if ($null -eq $Value) {
        return "null"
    }

    $text = "$Value"
    return "'" + $text.Replace("'", "''") + "'"
}

function ConvertTo-SqlNumber {
    param($Value)

    if ($null -eq $Value) {
        return "null"
    }

    return ([double]$Value).ToString("0.############", [System.Globalization.CultureInfo]::InvariantCulture)
}

function New-SqlImportFile {
    param(
        $Report,
        [string]$OutputPath
    )

    $values = New-Object System.Text.StringBuilder
    $isFirst = $true
    foreach ($item in $Report.observations) {
        if (-not $isFirst) {
            [void]$values.AppendLine(",")
        }
        $isFirst = $false

        $line = "  (" +
            "$(ConvertTo-SqlLiteral $item.observed_date)::date, " +
            "$(ConvertTo-SqlLiteral $item.category), " +
            "$(ConvertTo-SqlLiteral $item.metric_key), " +
            "$(ConvertTo-SqlLiteral $item.metric_name), " +
            "$(ConvertTo-SqlNumber $item.value), " +
            "$(ConvertTo-SqlLiteral $item.unit), " +
            "$(ConvertTo-SqlNumber $item.change_1d), " +
            "$(ConvertTo-SqlLiteral $item.change_1d_unit), " +
            "$(ConvertTo-SqlNumber $item.change_ytd), " +
            "$(ConvertTo-SqlLiteral $item.change_ytd_unit), " +
            "$(ConvertTo-SqlLiteral $item.source), " +
            "$(ConvertTo-SqlLiteral $item.source_sheet), " +
            "$(ConvertTo-SqlLiteral $item.source_cell), " +
            "$(ConvertTo-SqlLiteral $item.raw_value)" +
            ")"
        [void]$values.Append($line)
    }

    $sql = @"
begin;

with upsert_report as (
  insert into public.reports (report_date, status, title)
  values ($(ConvertTo-SqlLiteral $Report.report_date)::date, 'draft', $(ConvertTo-SqlLiteral $Report.title))
  on conflict (report_date) do update
    set title = excluded.title,
        status = public.reports.status,
        updated_at = now()
  returning id
),
obs (
  observed_date,
  category,
  metric_key,
  metric_name,
  value,
  unit,
  change_1d,
  change_1d_unit,
  change_ytd,
  change_ytd_unit,
  source,
  source_sheet,
  source_cell,
  raw_value
) as (
  values
$($values.ToString())
)
insert into public.market_observations (
  report_id,
  observed_date,
  category,
  metric_key,
  metric_name,
  value,
  unit,
  change_1d,
  change_1d_unit,
  change_ytd,
  change_ytd_unit,
  source,
  source_sheet,
  source_cell,
  raw_value
)
select
  upsert_report.id,
  obs.observed_date,
  obs.category,
  obs.metric_key,
  obs.metric_name,
  obs.value,
  obs.unit,
  obs.change_1d,
  obs.change_1d_unit,
  obs.change_ytd,
  obs.change_ytd_unit,
  obs.source,
  obs.source_sheet,
  obs.source_cell,
  obs.raw_value
from upsert_report
cross join obs
on conflict (report_id, metric_key) do update
  set observed_date = excluded.observed_date,
      category = excluded.category,
      metric_name = excluded.metric_name,
      value = excluded.value,
      unit = excluded.unit,
      change_1d = excluded.change_1d,
      change_1d_unit = excluded.change_1d_unit,
      change_ytd = excluded.change_ytd,
      change_ytd_unit = excluded.change_ytd_unit,
      source = excluded.source,
      source_sheet = excluded.source_sheet,
      source_cell = excluded.source_cell,
      raw_value = excluded.raw_value;

with target_report as (
  select id from public.reports where report_date = $(ConvertTo-SqlLiteral $Report.report_date)::date
)
insert into public.report_comments (report_id, tags)
select id, array[]::text[] from target_report
on conflict (report_id) do nothing;

commit;
"@

    Set-Content -LiteralPath $OutputPath -Value $sql -Encoding UTF8
}

$root = Get-ScriptProjectRoot
$envPath = Join-Path $root ".env"
$envValues = Read-DotEnv -Path $envPath

if (-not $WorkbookPath) {
    $WorkbookPath = $envValues["INFOMAX_EXCEL_PATH"]
}
if (-not $WorkbookPath) {
    $WorkbookPath = Join-Path $root "MARKET DAILY.xlsm"
}
if (-not (Test-Path -LiteralPath $WorkbookPath)) {
    throw "Workbook not found: $WorkbookPath"
}

$WorkbookPath = (Resolve-Path -LiteralPath $WorkbookPath).Path
$author = $envValues["REPORT_AUTHOR"]
if (-not $author) {
    $author = "자금운용본부"
}

$snapshot = $null
try {
    $snapshot = Open-XlsmSnapshot -Path $WorkbookPath
    $metricDefs = @(Get-MetricDefinitions)

    if (-not $ReportDate) {
        $ReportDate = Find-DefaultReportDate -Snapshot $snapshot -MetricDefs $metricDefs
    }
    if (-not $ReportDate) {
        throw "Could not determine report date from workbook."
    }

    $rowsBySheet = @{}
    foreach ($sheetName in ($metricDefs | Select-Object -ExpandProperty Sheet -Unique)) {
        $rowsBySheet[$sheetName] = @(Get-SheetMetricRows -Snapshot $snapshot -SheetName $sheetName -Metrics ($metricDefs | Where-Object Sheet -eq $sheetName))
    }

    $observations = @()
    foreach ($metric in $metricDefs) {
        $sheetRows = @($rowsBySheet[$metric.Sheet])
        $targetRow = $sheetRows | Where-Object { $_.Date -eq $ReportDate } | Select-Object -First 1
        if ($null -eq $targetRow) {
            continue
        }

        $targetCell = $targetRow.Metrics[$metric.Key]
        if ($null -eq $targetCell.Value -or $targetCell.Value -eq 0) {
            continue
        }

        $multiplier = if ($metric.PSObject.Properties.Name -contains "ValueMultiplier") { [double]$metric.ValueMultiplier } else { 1.0 }
        $currentValue = [math]::Round($targetCell.Value * $multiplier, 4)
        $previousRow = Get-ComparableValue -Rows $sheetRows -MetricKey $metric.Key -TargetDate $ReportDate -Mode "previous"
        $ytdRow = Get-ComparableValue -Rows $sheetRows -MetricKey $metric.Key -TargetDate $ReportDate -Mode "ytd"

        $previousValue = if ($previousRow) { $previousRow.Metrics[$metric.Key].Value * $multiplier } else { $null }
        $ytdValue = if ($ytdRow) { $ytdRow.Metrics[$metric.Key].Value * $multiplier } else { $null }

        $changeUnit = if ($metric.ChangeMode -in @("rate_bp", "spread_bp")) { "bp" } else { "%" }
        $observations += [pscustomobject]@{
            observed_date  = $ReportDate
            category       = $metric.Category
            category_label = Get-DisplayCategory -Category $metric.Category
            metric_key     = $metric.Key
            metric_name    = $metric.Name
            value          = $currentValue
            unit           = $metric.Unit
            change_1d      = Convert-MarketChange -Current $currentValue -Base $previousValue -ChangeMode $metric.ChangeMode -ValueMultiplier $multiplier
            change_1d_unit = $changeUnit
            change_ytd     = Convert-MarketChange -Current $currentValue -Base $ytdValue -ChangeMode $metric.ChangeMode -ValueMultiplier $multiplier
            change_ytd_unit = $changeUnit
            source         = "infomax_excel_cached"
            source_sheet   = $metric.Sheet
            source_cell    = $targetCell.CellRef
            raw_value      = $targetCell.RawValue
        }
    }

    $report = [pscustomobject]@{
        report_date     = $ReportDate
        title           = "Daily Report $ReportDate"
        author          = $author
        source_workbook = $WorkbookPath
        generated_at    = [datetime]::Now.ToString("s")
        observations    = $observations
    }

    $processedDir = Join-Path $root "data\processed"
    $outputDir = Join-Path $root "output"
    New-Item -ItemType Directory -Force -Path $processedDir | Out-Null
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

    $jsonPath = Join-Path $processedDir "market_daily_$ReportDate.json"
    $htmlPath = Join-Path $outputDir "market_daily_$ReportDate.html"
    $sqlPath = Join-Path $outputDir "market_daily_$ReportDate.import.sql"
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
    New-SqlImportFile -Report $report -OutputPath $sqlPath

    if (-not $NoHtml) {
        New-HtmlReport -Report $report -OutputPath $htmlPath
    }

    Write-Output "Report date: $ReportDate"
    Write-Output "Observations: $($observations.Count)"
    Write-Output "JSON: $jsonPath"
    Write-Output "SQL: $sqlPath"
    if (-not $NoHtml) {
        Write-Output "HTML: $htmlPath"
    }
}
finally {
    if ($snapshot -and $snapshot.Zip) {
        $snapshot.Zip.Dispose()
    }
}
