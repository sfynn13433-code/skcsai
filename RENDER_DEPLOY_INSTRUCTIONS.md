# Render Deployment Instructions

## 🎯 **Immediate Action Required**

### Step 1: Access Render Dashboard
1. Go to https://dashboard.render.com
2. Log in to your account
3. Navigate to your `skcsai` service

### Step 2: Trigger Manual Deploy
1. Click on your `skcsai` service
2. Look for the "Manual Deploy" button
3. Click "Manual Deploy" → "Deploy Latest Commit"
4. Wait for deployment to complete (usually 2-3 minutes)

### Step 3: Verify Deployment
1. Check the service logs for `[CORS DEBUG]` messages
2. Test the API: `curl -I https://skcsai.onrender.com/api/predictions`
3. Expected headers should include:
   ```
   Access-Control-Allow-Origin: https://skcsaiedge.onrender.com
   Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS,PATCH
   Access-Control-Allow-Credentials: true
   ```

## 🔧 **Alternative: Render CLI**

If you have the Render CLI installed:

```bash
# Install Render CLI (if not already installed)
npm install -g render-cli

# Login to Render
render login

# Trigger deploy
render deploy skcsai
```

## 📊 **Current Status**

- ✅ **GitHub**: Latest changes pushed (commit d48626a)
- ✅ **Frontend**: Updated with plan_id parameter
- ⏳ **Render**: Needs manual deploy
- ❌ **GitHub Actions**: Billing issue (not required for Render deploy)

## 🎯 **What Gets Deployed**

The latest commit includes:
- Enhanced CORS configuration for GitHub Pages
- Fixed query parameters (plan_id instead of tier)
- Debug logging for troubleshooting
- All architectural remediation fixes

## ⚡ **After Deployment**

Once Render deploys, you should see:
- No more CORS errors in browser console
- Predictions loading successfully on sport tabs
- Proper cross-origin communication restored
