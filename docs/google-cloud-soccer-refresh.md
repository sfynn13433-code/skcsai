# Google Cloud: Soccer Refresh And Grading Workflow

Use this wording in Google Cloud, Cloud Scheduler, or Cloud Code:

- Correct: `Trigger the soccer prediction refresh workflow`
- Correct: `Invoke the backend refresh endpoint for sport=football`
- Avoid: `Wake the file`

Cloud services do not run a source file directly. They either call an HTTP endpoint on a running service or execute a deployed job/container.

## Current SKCS Triggers

The backend supports these sport-specific endpoints:

```text
POST /api/refresh-predictions?sport=football
POST /api/grade-predictions?sport=football&date=YYYY-MM-DD
```

Required header:

```text
x-api-key: <SKCS_REFRESH_KEY>
```

The refresh response includes the publish-run summary. The grading response includes the context backfill summary plus the accuracy grading summary.

## Recommended Schedule

The backend currently works on these South Africa times:

- `08:00` SAST
- `16:00` SAST
- `20:00` SAST
- `04:00` SAST for grading yesterday's football window

If you want Google Cloud Scheduler to be the external trigger, use `Africa/Johannesburg` and this cron:

```text
0 8,16,20 * * *
```

## Option 1: Cloud Scheduler -> HTTP Endpoint

This is the cleanest setup if the backend is already deployed.

Target:

```text
https://<your-backend-host>/api/refresh-predictions?sport=football
```

### Create the Scheduler Job

```bash
gcloud scheduler jobs create http skcs-football-refresh --location=us-central1 --schedule="0 8,16,20 * * *" --time-zone="Africa/Johannesburg" --uri="https://<your-backend-host>/api/refresh-predictions?sport=football" --http-method=POST --headers="x-api-key=<SKCS_REFRESH_KEY>" --description="Trigger the soccer prediction refresh workflow"
```

### Update the Scheduler Job

```bash
gcloud scheduler jobs update http skcs-football-refresh --location=us-central1 --schedule="0 8,16,20 * * *" --time-zone="Africa/Johannesburg" --uri="https://<your-backend-host>/api/refresh-predictions?sport=football" --http-method=POST --headers="x-api-key=<SKCS_REFRESH_KEY>" --description="Trigger the soccer prediction refresh workflow"
```

### Run It Immediately

```bash
gcloud scheduler jobs run skcs-football-refresh --location=us-central1
```

## Option 2: Manual Trigger From Cloud Code Or Terminal

This repo now includes a remote trigger script:

```bash
npm run refresh:football -- --host=https://<your-backend-host> --api-key=<SKCS_REFRESH_KEY>
```

Or set env vars first:

```bash
set SKCS_REFRESH_HOST=https://<your-backend-host>
set SKCS_REFRESH_KEY=<SKCS_REFRESH_KEY>
npm run refresh:football
```

The script calls the same backend endpoint and prints the returned JSON, including the publish-run information.

## Daily Football Grading

The grading workflow should run once daily against yesterday's football fixtures. If you omit `date`, the backend defaults to yesterday in `Africa/Johannesburg`.

Target:

```text
https://<your-backend-host>/api/grade-predictions?sport=football
```

### Create The Scheduler Job

```bash
gcloud scheduler jobs create http skcs-football-grade --location=us-central1 --schedule="0 4 * * *" --time-zone="Africa/Johannesburg" --uri="https://<your-backend-host>/api/grade-predictions?sport=football" --http-method=POST --headers="x-api-key=<SKCS_REFRESH_KEY>" --attempt-deadline=30m --description="Grade yesterday's soccer predictions"
```

### Update The Scheduler Job

```bash
gcloud scheduler jobs update http skcs-football-grade --location=us-central1 --schedule="0 4 * * *" --time-zone="Africa/Johannesburg" --uri="https://<your-backend-host>/api/grade-predictions?sport=football" --http-method=POST --update-headers="x-api-key=<SKCS_REFRESH_KEY>" --attempt-deadline=30m --description="Grade yesterday's soccer predictions"
```

### Run It Immediately

```bash
gcloud scheduler jobs run skcs-football-grade --location=us-central1
```

### Manual Trigger From This Repo

```bash
npm run grade:football -- --host=https://<your-backend-host> --api-key=<SKCS_REFRESH_KEY>
```

For a specific date:

```bash
npm run grade:football -- --host=https://<your-backend-host> --api-key=<SKCS_REFRESH_KEY> --date=2026-04-05
```

## Operational Expectation

When the job succeeds, you should see:

1. A new row in `prediction_publish_runs`
2. `requested_sports = ['football']`
3. Fresh football rows in `predictions_final`
4. A new available run in `/api/accuracy?date=<today>&sport=football`
5. After grading, non-zero `graded` rows for `/api/accuracy?date=<yesterday>&sport=football`

For a fresh same-day run, the accuracy window may still show `0 graded` until matches settle. That is normal. The run is still valid if the publish summary shows products and legs.

## Best Practice Wording For Google Cloud

Use this sentence in runbooks and internal notes:

`Cloud Scheduler triggers the soccer prediction refresh workflow by sending an authenticated POST request to the SKCS backend refresh endpoint with sport=football, and a separate 04:00 SAST job grades yesterday's football predictions through the grading endpoint.`
