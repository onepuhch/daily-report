# Render Demo Deployment

Use this when another person needs to view the Daily Report from outside the Infomax PC.

## Architecture

- The Infomax PC still runs Excel refresh and uploads market data to Supabase.
- Render only serves the Admin/public report UI and reads data from Supabase.
- Demo deployments should run in read-only mode so save, publish, and rerun buttons cannot modify Supabase.

## Render Setup

1. Push the latest repository to GitHub.
2. In Render, create a new Web Service from the GitHub repository.
3. Use the existing `render.yaml` blueprint if Render offers to apply it.
4. Set these environment variables in Render:

```text
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DAILY_REPORT_BASIC_AUTH_USER=...
DAILY_REPORT_BASIC_AUTH_PASSWORD=...
DAILY_REPORT_READ_ONLY=true
DAILY_REPORT_ADMIN_HOST=0.0.0.0
DAILY_REPORT_AI_PROVIDER=rule_based
REPORT_TIMEZONE=Asia/Seoul
```

5. Deploy and open:

```text
https://<render-service>.onrender.com/report-v2
```

Render will ask for the username and password set above.

## Operating Notes

- Free Render services sleep after idle time, so the first request can take about a minute.
- Do not use Render Free as the production tier. For ongoing operation, move the service to a paid web service so it stays responsive.
- Keep `DAILY_REPORT_READ_ONLY=true` for external review links. Turn it off only for a trusted operator deployment.
- If Supabase credentials are missing or wrong, the UI may load but report API calls will fail.
