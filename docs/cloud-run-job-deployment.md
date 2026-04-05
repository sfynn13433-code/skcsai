# SKCS VIP Master - Google Cloud Run Job Migration

This guide moves `backend/scripts/generate_vip_master.py` from a local batch job to a Google Cloud Run Job triggered by Cloud Scheduler.

## What This Setup Does

- Runs the VIP generator as a batch container instead of a long-lived web service
- Injects secrets at runtime from Google Secret Manager
- Schedules the job to run automatically every day
- Avoids automatic retries with `--max-retries 0` so a failed run does not blindly replay writes

## Prerequisites

- `gcloud` installed and authenticated
- Billing enabled on your Google Cloud project
- Cloud Run, Cloud Build, Secret Manager, and Cloud Scheduler APIs enabled
- A dedicated service account for the job, or a conscious decision to use the default compute service account

Enable the APIs:

```bash
gcloud services enable run.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com
```

## Secret Management

Do not ship `.env` into the container. Store secrets in Secret Manager and map them to the same environment variable names the Python script already uses.

Create the secrets:

```bash
gcloud secrets create SUPABASE_URL --replication-policy="automatic"
gcloud secrets create SUPABASE_KEY --replication-policy="automatic"
gcloud secrets create GROQ_KEY --replication-policy="automatic"
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
gcloud secrets create COHERE_API_KEY --replication-policy="automatic"
gcloud secrets create DEEPSEEK_API_KEY --replication-policy="automatic"
gcloud secrets create OPENROUTER_API_KEY --replication-policy="automatic"
gcloud secrets create OPENAI_KEY --replication-policy="automatic"
```

Add secret values:

```bash
gcloud secrets versions add SUPABASE_URL --data-file=-
gcloud secrets versions add SUPABASE_KEY --data-file=-
gcloud secrets versions add GROQ_KEY --data-file=-
gcloud secrets versions add GEMINI_API_KEY --data-file=-
gcloud secrets versions add COHERE_API_KEY --data-file=-
gcloud secrets versions add DEEPSEEK_API_KEY --data-file=-
gcloud secrets versions add OPENROUTER_API_KEY --data-file=-
gcloud secrets versions add OPENAI_KEY --data-file=-
```

Only create the provider secrets you actually plan to use.

## Build and Deploy the Cloud Run Job

This job runs the script in the `Dockerfile` at the repo root.

```bash
gcloud run jobs create skcs-vip-generator \
  --source . \
  --region us-central1 \
  --tasks 1 \
  --max-retries 0 \
  --cpu 2 \
  --memory 4Gi \
  --task-timeout 1800 \
  --set-secrets=SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_KEY=SUPABASE_KEY:latest \
  --set-env-vars=SKCS_LOCAL_ONLY=0,SKCS_EVENT_LIMIT=0,SKCS_MINIMUM_EVENT_COUNT=15,LOCAL_LLM_TIMEOUT=120,GOOGLE_CLOUD_PROJECT=PROJECT_ID,GOOGLE_CLOUD_LOCATION=us-central1,GOOGLE_GENAI_USE_VERTEXAI=1,VERTEX_GEMINI_MODEL=gemini-2.5-flash
```

If you want hosted-model fallbacks, add the provider secrets you created:

```bash
gcloud run jobs update skcs-vip-generator \
  --region us-central1 \
  --set-secrets=SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_KEY=SUPABASE_KEY:latest,GROQ_KEY=GROQ_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,COHERE_API_KEY=COHERE_API_KEY:latest,DEEPSEEK_API_KEY=DEEPSEEK_API_KEY:latest,OPENROUTER_API_KEY=OPENROUTER_API_KEY:latest,OPENAI_KEY=OPENAI_KEY:latest
```

Run the job manually once:

```bash
gcloud run jobs execute skcs-vip-generator --region us-central1 --wait
```

Inspect logs:

```bash
gcloud run jobs executions list --job skcs-vip-generator --region us-central1
```

## Schedule the Job

Cloud Scheduler can call the Run Jobs API on a cron schedule.

```bash
gcloud scheduler jobs create http skcs-daily-generator \
  --location us-central1 \
  --schedule "30 3 * * *" \
  --uri "https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT_ID/jobs/skcs-vip-generator:run" \
  --http-method POST \
  --oauth-service-account-email "SERVICE_ACCOUNT@PROJECT_ID.iam.gserviceaccount.com"
```

Replace:

- `PROJECT_ID` with your Google Cloud project ID
- `SERVICE_ACCOUNT@PROJECT_ID.iam.gserviceaccount.com` with a service account that can invoke Cloud Run jobs

Grant the scheduler service account permission if needed:

```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

## Important Caveat: Local Dolphin

`LOCAL_LLM_BASE_URL=http://127.0.0.1:8080/v1` will not work inside Cloud Run because the container cannot see your laptop-hosted model.

For cloud execution, do one of these:

- Disable local-only mode and rely on hosted providers
- Point `LOCAL_LLM_BASE_URL` at a network-accessible hosted inference endpoint
- Use the built-in Vertex Gemini fallback by setting:

```bash
GOOGLE_CLOUD_PROJECT=PROJECT_ID
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_GENAI_USE_VERTEXAI=1
VERTEX_GEMINI_MODEL=gemini-2.5-flash
```

The script now supports the official `google-genai` SDK as a cloud-safe fallback before `Local Dolphin`.

## Recommended First Cloud Run Test

Before scheduling the full job, do one constrained run:

```bash
gcloud run jobs update skcs-vip-generator \
  --region us-central1 \
  --set-env-vars=SKCS_LOCAL_ONLY=0,SKCS_EVENT_LIMIT=1,SKCS_MINIMUM_EVENT_COUNT=1,LOCAL_LLM_TIMEOUT=120
```

After verifying logs and database output, remove the limit:

```bash
gcloud run jobs update skcs-vip-generator \
  --region us-central1 \
  --set-env-vars=SKCS_LOCAL_ONLY=0,SKCS_EVENT_LIMIT=0,SKCS_MINIMUM_EVENT_COUNT=15,LOCAL_LLM_TIMEOUT=120
```
