/**
 * Render API Deployment Script
 * Uses Render's REST API to trigger deployment
 * 
 * Usage: node scripts/render-api-deploy.js
 */

const https = require('https');
const { execSync } = require('child_process');

// Configuration
const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID || 'YOUR_SERVICE_ID';
const RENDER_API_KEY = process.env.RENDER_API_KEY || 'YOUR_API_KEY';

function triggerRenderDeploy() {
  return new Promise((resolve, reject) => {
    // Get current commit hash
    const commitHash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    
    const postData = JSON.stringify({
      clearCache: true
    });

    const options = {
      hostname: 'api.render.com',
      port: 443,
      path: `/v1/services/${RENDER_SERVICE_ID}/deploys`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RENDER_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log('🚀 Triggering Render deployment...');
    console.log(`📦 Commit: ${commitHash}`);
    console.log(`🔧 Service ID: ${RENDER_SERVICE_ID}`);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('✅ Deployment triggered successfully!');
          console.log(`📊 Response: ${JSON.stringify(result, null, 2)}`);
          resolve(result);
        } catch (e) {
          console.log(`📊 Raw Response: ${data}`);
          resolve({ status: 'triggered', message: 'Check Render dashboard' });
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Error triggering deployment:', error);
      console.log('💡 Please use manual deploy via Render dashboard');
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Check if we have the required credentials
if (RENDER_SERVICE_ID === 'YOUR_SERVICE_ID' || RENDER_API_KEY === 'YOUR_API_KEY') {
  console.log('⚠️  Missing Render credentials');
  console.log('');
  console.log('Please set environment variables:');
  console.log('export RENDER_SERVICE_ID=your_service_id');
  console.log('export RENDER_API_KEY=your_api_key');
  console.log('');
  console.log('Or use manual deploy via Render dashboard:');
  console.log('1. Go to https://dashboard.render.com');
  console.log('2. Click on skcsai service');
  console.log('3. Click "Manual Deploy" → "Deploy Latest Commit"');
  process.exit(1);
}

// Trigger deployment
triggerRenderDeploy()
  .then(() => {
    console.log('');
    console.log('🎉 Deployment process initiated!');
    console.log('📈 Monitor progress at: https://dashboard.render.com');
  })
  .catch((error) => {
    console.log('');
    console.log('🔄 Fallback: Please use manual deployment via Render dashboard');
  });
