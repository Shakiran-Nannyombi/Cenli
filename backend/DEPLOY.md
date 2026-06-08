# Deploying to Cloud Run (hackathon hosted URL)

Cloud Run gives you a public HTTPS URL in ~2 minutes — exactly what the
Devpost submission form asks for.

## Prerequisites

```bash
# Install Google Cloud CLI
# https://cloud.google.com/sdk/docs/install

gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com
```

## Deploy

```bash
cd backend

gcloud run deploy cenli-dpe-backend \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "GEMINI_API_KEY=your_key,PHOENIX_API_KEY=your_key" \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300
```

After deploy you'll get a URL like:
`https://cenli-dpe-backend-xxxxxxxxxx-uc.a.run.app`

That's your submission URL. Test it:
```bash
curl https://cenli-dpe-backend-xxxxxxxxxx-uc.a.run.app/api/pipeline/status
```

## Update env vars without redeploying

```bash
gcloud run services update cenli-dpe-backend \
  --region us-central1 \
  --set-env-vars "GEMINI_API_KEY=new_key"
```
