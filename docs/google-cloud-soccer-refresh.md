# Google Cloud: Soccer Refresh Workflow

Use this wording in Google Cloud, Cloud Scheduler, or Cloud Code:

- Correct: `Trigger the soccer prediction refresh workflow`
- Correct: `Invoke the backend refresh endpoint for sport=football`
- Avoid: `Wake the file`

Cloud services do not run a source file directly. They either call an HTTP endpoint on a running service or execute a deployed job/container.

## Current SKCS Trigger

The backend supports a sport-specific refresh endpoint:

```text
POST /api/refresh-predictions?sport=football
```

Required header:

```text
x-api-key: <SKCS_REFRESH_KEY>
```

The response already includes the publish-run summary, so this is the correct trigger for daily soccer pulls.

## Recommended Schedule

The backend currently works on these South Africa times:

- `08:00` SAST
- `16:00` SAST
- `20:00` SAST

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

## Operational Expectation

When the job succeeds, you should see:

1. A new row in `prediction_publish_runs`
2. `requested_sports = ['football']`
3. Fresh football rows in `predictions_final`
4. A new available run in `/api/accuracy?date=<today>&sport=football`

For a fresh same-day run, the accuracy window may still show `0 graded` until matches settle. That is normal. The run is still valid if the publish summary shows products and legs.

## Best Practice Wording For Google Cloud

Use this sentence in runbooks and internal notes:

`Cloud Scheduler triggers the soccer prediction refresh workflow by sending an authenticated POST request to the SKCS backend refresh endpoint with sport=football.`
