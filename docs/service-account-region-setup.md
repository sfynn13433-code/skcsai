# Google Cloud: Service Account and Region Setup

For production Cloud Run Jobs, use a dedicated least-privilege service account instead of the default compute service account.

## 1. Pin the Region

Keep Cloud Run Jobs, Scheduler, and secrets in the same region where practical.

```bash
gcloud config set run/region us-central1
```

Choose the region you actually intend to operate in, for example `us-central1` or `europe-west1`.

## 2. Create a Dedicated Service Account

```bash
gcloud iam service-accounts create skcs-vip-runner \
  --description="Executes the SKCS VIP Master Generator job" \
  --display-name="SKCS VIP Runner"
```

The resulting principal will look like:

```text
skcs-vip-runner@PROJECT_ID.iam.gserviceaccount.com
```

## 3. Grant Secret Access

Grant `roles/secretmanager.secretAccessor` only on the secrets the job actually needs.

Example:

```bash
gcloud secrets add-iam-policy-binding SUPABASE_KEY \
  --member="serviceAccount:skcs-vip-runner@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

Repeat for each secret you mapped into the job, such as:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `GROQ_KEY`
- `GEMINI_API_KEY`
- `COHERE_API_KEY`
- `DEEPSEEK_API_KEY`
- `OPENROUTER_API_KEY`
- `OPENAI_KEY`

## 4. Deploy the Cloud Run Job with That Service Account

```bash
gcloud run jobs create skcs-vip-generator \
  --source . \
  --region us-central1 \
  --tasks 1 \
  --max-retries 0 \
  --service-account "skcs-vip-runner@PROJECT_ID.iam.gserviceaccount.com" \
  --set-secrets=SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_KEY=SUPABASE_KEY:latest
```

If the job already exists:

```bash
gcloud run jobs update skcs-vip-generator \
  --region us-central1 \
  --service-account "skcs-vip-runner@PROJECT_ID.iam.gserviceaccount.com"
```

## 5. Allow the Scheduler to Trigger the Job

Cloud Scheduler needs an identity that can call the Run Jobs API.

If you use the same service account for scheduling:

```bash
gcloud scheduler jobs create http skcs-daily-generator \
  --location us-central1 \
  --schedule "30 3 * * *" \
  --uri "https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT_ID/jobs/skcs-vip-generator:run" \
  --http-method POST \
  --oauth-service-account-email "skcs-vip-runner@PROJECT_ID.iam.gserviceaccount.com"
```

Grant the invoker role if required:

```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:skcs-vip-runner@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

## Notes

- Replace `PROJECT_ID` with your real Google Cloud project ID.
- Use a separate scheduler service account if you want a stricter permission split.
- Avoid granting project-wide secret access when per-secret bindings are sufficient.
