#!/bin/bash

# Render Deployment Script
# Triggers manual redeploy of Render backend service

echo "🚀 Triggering Render deployment..."

# Get the latest commit hash
COMMIT_HASH=$(git rev-parse HEAD)
echo "📦 Commit hash: $COMMIT_HASH"

# Trigger Render deploy (replace with your actual service ID)
# This would typically use the Render API
curl -X POST "https://api.render.com/v1/services/YOUR_SERVICE_ID/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "clearCache": true
  }' || echo "⚠️  Manual deploy required via Render dashboard"

echo "✅ Deployment triggered!"
echo "🌐 Check Render dashboard for deployment status"
