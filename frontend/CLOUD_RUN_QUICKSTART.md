# Cloud Run Deployment — Quick Start

## 🚀 Deploy to Cloud Run via GCP Console

### Option 1: Build locally and push

```bash
# 1. Set your project ID
export PROJECT_ID="your-gcp-project-id"

# 2. Build and push to Google Container Registry
gcloud builds submit --tag gcr.io/$PROJECT_ID/cenli-frontend:latest

# 3. Go to Cloud Run Console and deploy
```

### Option 2: Deploy directly from source (recommended)

```bash
# 1. Navigate to frontend directory
cd /home/dev-kiran/Desktop/Projects/Cenli/frontend

# 2. Deploy using gcloud (will build and deploy in one command)
gcloud run deploy cenli-frontend \
  --source . \
  --region europe-west2 \
  --allow-unauthenticated \
  --set-env-vars VITE_API_URL=https://cenli-dpe-backend-183690574774.europe-west2.run.app
```

---

## 📋 GCP Console Deployment Steps

1. **Go to Cloud Run**: https://console.cloud.google.com/run

2. **Click "CREATE SERVICE"**

3. **Deploy from Container Image**:
   - First, build and push your image:
     ```bash
     gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/cenli-frontend:latest
     ```
   - In the console, click "SELECT" and choose: `gcr.io/YOUR_PROJECT_ID/cenli-frontend:latest`

4. **Service Configuration**:
   - **Service name**: `cenli-frontend`
   - **Region**: `europe-west2` (or your preferred region)
   - **Authentication**: ✅ Allow unauthenticated invocations

5. **Container Settings** (click "Container, Variables & Secrets, Connections, Security"):
   - **Container port**: `3000`
   - **Memory**: `512 MiB` (can increase to 1 GiB if needed)
   - **CPU**: `1`
   - **Request timeout**: `300`
   - **Maximum requests per container**: `80`

6. **Environment Variables** (click "VARIABLES & SECRETS" tab):
   | Variable | Value |
   |----------|-------|
   | `NODE_ENV` | `production` |
   | `VITE_API_URL` | `https://cenli-dpe-backend-183690574774.europe-west2.run.app` |
   | `PORT` | `3000` |

7. **Click "CREATE"**

8. **Wait for deployment** (2-5 minutes)

9. **Test your deployment**:
   - Cloud Run will provide a URL like: `https://cenli-frontend-xxxx-ew.a.run.app`
   - Visit the URL in your browser
   - Check the homepage loads correctly
   - Test authentication flow
   - Verify API connection to backend

---

## 🐳 Local Docker Testing (Optional)

Test the Docker container locally before deploying:

```bash
# 1. Build the image
docker build -t cenli-frontend .

# 2. Run the container
docker run -p 3000:3000 \
  -e VITE_API_URL=https://cenli-dpe-backend-183690574774.europe-west2.run.app \
  cenli-frontend

# 3. Visit http://localhost:3000 in your browser

# 4. Stop the container when done
docker ps  # Find the container ID
docker stop <container-id>
```

---

## ✅ Deployment Verification Checklist

After deployment, verify:

- [ ] Homepage loads without errors
- [ ] Static assets (CSS, images) load correctly
- [ ] Authentication flow works (sign up / login)
- [ ] Dashboard page loads (if logged in)
- [ ] API calls to backend are successful
- [ ] No CORS errors in browser console
- [ ] Responsive design works on mobile

---

## 🔧 Troubleshooting

### Build fails with dependency errors
```bash
# Clean install and rebuild
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

### Container fails to start
- Check Cloud Run logs: Click your service → Logs tab
- Common issues:
  - Missing environment variables
  - Incorrect PORT configuration
  - Build artifacts not copied correctly

### 502 Bad Gateway
- Container might be timing out on startup
- Increase memory to 1 GiB in Cloud Run settings
- Check startup logs for errors

### API calls fail (CORS errors)
- Verify `VITE_API_URL` is set correctly
- Check backend CORS settings allow frontend origin
- Test backend endpoint directly: `curl https://cenli-dpe-backend-183690574774.europe-west2.run.app/health`

### Cannot connect to backend
```bash
# Test backend is accessible
curl https://cenli-dpe-backend-183690574774.europe-west2.run.app/health

# Should return health status
```

---

## 🔄 Updating the Deployment

After making code changes:

```bash
# 1. Build new image
gcloud builds submit --tag gcr.io/$PROJECT_ID/cenli-frontend:latest

# 2. In Cloud Run Console:
#    - Open your service
#    - Click "EDIT & DEPLOY NEW REVISION"
#    - New image will be auto-selected
#    - Click "DEPLOY"
```

Or use the CLI:
```bash
gcloud run deploy cenli-frontend \
  --source . \
  --region europe-west2
```

---

## 💰 Cost Management

- Cloud Run charges **only for actual usage** (CPU time + memory during requests)
- **Min instances**: `0` (default) — lowest cost, may have cold starts
- **Max instances**: `10` — prevents unexpected bills
- **Typical cost**: $0-5/month for low traffic, $20-50/month for moderate traffic

Monitor usage: Cloud Run Console → Your Service → Metrics

---

## 📝 Files Created

- ✅ `Dockerfile` — Multi-stage Docker build configuration
- ✅ `.dockerignore` — Excludes unnecessary files from Docker build
- ✅ `DEPLOYMENT.md` — Detailed deployment guide
- ✅ `CLOUD_RUN_QUICKSTART.md` — This quick reference

---

## 🆘 Need Help?

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [TanStack Start SSR Docs](https://tanstack.com/router/latest/docs/framework/react/start/getting-started)
- Check backend status: https://cenli-dpe-backend-183690574774.europe-west2.run.app/health

---

**Ready to deploy?** Run this command:

```bash
gcloud run deploy cenli-frontend \
  --source . \
  --region europe-west2 \
  --allow-unauthenticated \
  --set-env-vars VITE_API_URL=https://cenli-dpe-backend-183690574774.europe-west2.run.app
```

Then follow the prompts in your terminal! 🚀
