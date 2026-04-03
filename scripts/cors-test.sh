#!/bin/bash

echo "🔍 SKCS CORS Preflight Verification"
echo "=================================="

# Test 1: Health check (should work without CORS issues)
echo ""
echo "🧪 Test 1: Health Check (No CORS Required)"
echo "-------------------------------------------"
curl -s -w "Status: %{http_code}\n" "https://skcsai.onrender.com/health" | head -5

# Test 2: CORS Test Endpoint (simple CORS test)
echo ""
echo "🧪 Test 2: CORS Test Endpoint"
echo "-----------------------------"
curl -s -w "\nStatus: %{http_code}\n" \
  "https://skcsai.onrender.com/cors-test" \
  -H "Origin: https://skcsaiedge.onrender.com" \
  -H "x-api-key: skcs_user_12345" | head -10

# Test 3: Exact Browser Preflight (OPTIONS)
echo ""
echo "🧪 Test 3: Exact Browser Preflight (OPTIONS)"
echo "-------------------------------------------"
echo "Request: OPTIONS /api/predictions?plan_id=elite_30day_deep_vip&sport=football"
echo "Origin: https://skcsaiedge.onrender.com"
echo "Headers: x-api-key"

curl -i -X OPTIONS \
  "https://skcsai.onrender.com/api/predictions?plan_id=elite_30day_deep_vip&sport=football" \
  -H "Origin: https://skcsaiedge.onrender.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-api-key" \
  2>/dev/null | grep -E "(HTTP|Access-Control)"

# Test 4: Actual Request (GET)
echo ""
echo "🧪 Test 4: Actual Request (GET)"
echo "-----------------------------"
curl -i \
  "https://skcsai.onrender.com/api/predictions?plan_id=elite_30day_deep_vip&sport=football" \
  -H "Origin: https://skcsaiedge.onrender.com" \
  -H "x-api-key: skcs_user_12345" \
  2>/dev/null | grep -E "(HTTP|Access-Control|Content-Type|error)"

echo ""
echo "📊 Expected Results:"
echo "===================="
echo "✅ Health check: HTTP 200 with JSON response"
echo "✅ CORS test: HTTP 200 with Access-Control-Allow-Origin header"
echo "✅ Preflight: HTTP 204 with Access-Control-Allow-Headers: x-api-key"
echo "✅ Actual request: HTTP 200 with predictions JSON or error message"
echo ""
echo "❌ If you see 500 errors or missing CORS headers, Render needs manual deploy"
