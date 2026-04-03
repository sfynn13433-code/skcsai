#!/bin/bash

echo "🔍 SKCS Deployment Verification Script"
echo "======================================"

# Test 1: Backend CORS Preflight
echo ""
echo "🧪 Test 1: Backend CORS Preflight"
echo "-----------------------------------"
echo "Testing OPTIONS request to Render backend..."

curl -i -X OPTIONS \
  "https://skcsai.onrender.com/api/predictions?plan_id=elite_30day_deep_vip&sport=football" \
  -H "Origin: https://skcsaiedge.onrender.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-api-key" \
  2>/dev/null | grep -E "(HTTP|Access-Control)"

echo ""
echo "🧪 Test 2: Backend Actual Request"
echo "-----------------------------------"
echo "Testing GET request to Render backend..."

curl -i \
  "https://skcsai.onrender.com/api/predictions?plan_id=elite_30day_deep_vip&sport=football" \
  -H "Origin: https://skcsaiedge.onrender.com" \
  -H "x-api-key: skcs_user_12345" \
  2>/dev/null | grep -E "(HTTP|Access-Control|Content-Type)"

echo ""
echo "🧪 Test 3: Frontend Accessibility"
echo "-----------------------------------"
echo "Testing GitHub Pages frontend..."

curl -I -s "https://skcs-sports-edge.github.io" | grep -E "(HTTP|Content-Type)"

echo ""
echo "🧪 Test 4: Vercel Frontend"
echo "-------------------------"
echo "Testing Vercel frontend..."

curl -I -s "https://www.skcs.co.za" | grep -E "(HTTP|Content-Type)"

echo ""
echo "📊 Deployment Status Summary"
echo "============================"
echo "✅ GitHub Pages: https://skcs-sports-edge.github.io"
echo "✅ Vercel Production: https://www.skcs.co.za"
echo "⏳ Render Backend: https://skcsai.onrender.com (Manual deploy required)"
echo ""
echo "🎯 Expected Results:"
echo "- All OPTIONS requests should return 204/200 with CORS headers"
echo "- All GET requests should return 200 with Access-Control-Allow-Origin"
echo "- Frontend should load without CORS errors"
echo ""
echo "🔍 If CORS headers are missing, Render backend needs manual deploy"
