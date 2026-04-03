#!/bin/bash

# =============================================================================
# SKCS CORS Definitive Diagnostic Tool
# Based on expert analysis of "Ensure CORS response header values are valid"
# =============================================================================

echo "🔍 SKCS Definitive CORS Diagnosis"
echo "================================="
echo "Testing against: https://skcsai.onrender.com"
echo "Frontend origin: https://skcsaiedge.onrender.com"
echo ""

# Test 1: Basic Connectivity (No CORS Headers Required)
echo "🧪 Test 1: Basic Connectivity (Health Check)"
echo "-------------------------------------------"
echo "Purpose: Verify the backend is reachable and not returning 502/504 errors"
echo ""

HEALTH_RESPONSE=$(curl -s -w "HTTP_CODE:%{http_code};TIME:%{time_total}" \
  "https://skcsai.onrender.com/health" 2>/dev/null)

HTTP_CODE=$(echo "$HEALTH_RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
RESPONSE_TIME=$(echo "$HEALTH_RESPONSE" | grep -o "TIME:[0-9.]*" | cut -d: -f2)

echo "Status Code: $HTTP_CODE"
echo "Response Time: ${RESPONSE_TIME}s"

if [[ "$HTTP_CODE" == "200" ]]; then
    echo "✅ Backend is reachable and responding"
else
    echo "❌ Backend unreachable or returning errors"
    echo "   This indicates a 502/504 Gateway Error masquerading as CORS"
fi
echo ""

# Test 2: Exact Browser Preflight Reproduction
echo "🧪 Test 2: Exact Browser Preflight (OPTIONS)"
echo "--------------------------------------------"
echo "Purpose: Reproduce the exact preflight that Chromium sends"
echo "Request: OPTIONS /api/predictions?plan_id=elite_30day_deep_vip&sport=football"
echo "Origin: https://skcsaiedge.onrender.com"
echo "Headers: Access-Control-Request-Method: GET"
echo "         Access-Control-Request-Headers: x-api-key"
echo ""

PREFLIGHT_RESPONSE=$(curl -i -s -w "HTTP_CODE:%{http_code};TIME:%{time_total}" \
  -X OPTIONS \
  "https://skcsai.onrender.com/api/predictions?plan_id=elite_30day_deep_vip&sport=football" \
  -H "Origin: https://skcsaiedge.onrender.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-api-key" 2>/dev/null)

# Extract headers and status
PREFLIGHT_CODE=$(echo "$PREFLIGHT_RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
ACAO_HEADER=$(echo "$PREFLIGHT_RESPONSE" | grep -i "access-control-allow-origin:" | tr -d '\r')
ACAH_HEADER=$(echo "$PREFLIGHT_RESPONSE" | grep -i "access-control-allow-headers:" | tr -d '\r')
ACAM_HEADER=$(echo "$PREFLIGHT_RESPONSE" | grep -i "access-control-allow-methods:" | tr -d '\r')
VARY_HEADER=$(echo "$PREFLIGHT_RESPONSE" | grep -i "vary:" | tr -d '\r')

echo "Preflight Status: $PREFLIGHT_CODE"
echo "Access-Control-Allow-Origin: $ACAO_HEADER"
echo "Access-Control-Allow-Headers: $ACAH_HEADER"
echo "Access-Control-Allow-Methods: $ACAM_HEADER"
echo "Vary: $VARY_HEADER"

# Analyze preflight results
echo ""
echo "📊 Preflight Analysis:"
if [[ "$PREFLIGHT_CODE" == "204" || "$PREFLIGHT_CODE" == "200" ]]; then
    echo "✅ Preflight returned success status"
    
    if [[ "$ACAO_HEADER" == *"https://skcsaiedge.onrender.com"* ]]; then
        echo "✅ Origin header matches requesting origin"
    else
        echo "❌ Origin header mismatch or missing"
    fi
    
    if [[ "$ACAH_HEADER" == *"x-api-key"* ]]; then
        echo "✅ x-api-key header explicitly allowed"
    else
        echo "❌ x-api-key header not in allowed headers"
    fi
    
    if [[ -n "$VARY_HEADER" && "$VARY_HEADER" == *"Origin"* ]]; then
        echo "✅ Vary: Origin header present (caching compatibility)"
    else
        echo "⚠️  Vary: Origin header missing (caching issues possible)"
    fi
else
    echo "❌ Preflight failed with status: $PREFLIGHT_CODE"
    echo "   This indicates backend code issues or proxy interference"
fi
echo ""

# Test 3: Actual Request (Following Successful Preflight)
echo "🧪 Test 3: Actual Request (GET)"
echo "------------------------------"
echo "Purpose: Test the actual data request after preflight"
echo ""

ACTUAL_RESPONSE=$(curl -i -s -w "HTTP_CODE:%{http_code};TIME:%{time_total}" \
  "https://skcsai.onrender.com/api/predictions?plan_id=elite_30day_deep_vip&sport=football" \
  -H "Origin: https://skcsaiedge.onrender.com" \
  -H "x-api-key: skcs_user_12345" 2>/dev/null)

# Extract response details
ACTUAL_CODE=$(echo "$ACTUAL_RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
ACTUAL_ACAO=$(echo "$ACTUAL_RESPONSE" | grep -i "access-control-allow-origin:" | tr -d '\r')
CONTENT_TYPE=$(echo "$ACTUAL_RESPONSE" | grep -i "content-type:" | tr -d '\r')

echo "Actual Request Status: $ACTUAL_CODE"
echo "Access-Control-Allow-Origin: $ACTUAL_ACAO"
echo "Content-Type: $CONTENT_TYPE"

# Check for JSON response vs error
JSON_BODY=$(echo "$ACTUAL_RESPONSE" | grep -E '"predictions"|"error"|"status"')
if [[ -n "$JSON_BODY" ]]; then
    echo "✅ JSON response body detected"
    echo "Response preview: $(echo "$JSON_BODY" | head -1)"
else
    echo "❌ No JSON response detected"
fi

if [[ "$ACTUAL_CODE" == "200" ]]; then
    echo "✅ Actual request succeeded"
else
    echo "❌ Actual request failed with status: $ACTUAL_CODE"
fi
echo ""

# Test 4: CORS Test Endpoint (Simple Validation)
echo "🧪 Test 4: CORS Test Endpoint"
echo "-----------------------------"
echo "Purpose: Simple endpoint to validate CORS without authentication"
echo ""

CORS_TEST_RESPONSE=$(curl -s -w "HTTP_CODE:%{http_code}" \
  "https://skcsai.onrender.com/cors-test" \
  -H "Origin: https://skcsaiedge.onrender.com" \
  -H "x-api-key: skcs_user_12345" 2>/dev/null)

CORS_TEST_CODE=$(echo "$CORS_TEST_RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
CORS_TEST_BODY=$(echo "$CORS_TEST_RESPONSE" | sed 's/HTTP_CODE:[0-9]*//')

echo "CORS Test Status: $CORS_TEST_CODE"
echo "Response: $CORS_TEST_BODY"

if [[ "$CORS_TEST_CODE" == "200" ]]; then
    echo "✅ CORS test endpoint working"
else
    echo "❌ CORS test endpoint failed"
fi
echo ""

# Final Diagnosis
echo "🏥 FINAL DIAGNOSIS"
echo "=================="

if [[ "$HTTP_CODE" != "200" ]]; then
    echo "🚨 CRITICAL: Backend connectivity failure"
    echo "   Symptoms: 502/504 Gateway errors masquerading as CORS"
    echo "   Action: Check Render container logs, memory, timeouts"
    echo "   Location: Render.com infrastructure layer"
elif [[ "$PREFLIGHT_CODE" != "204" && "$PREFLIGHT_CODE" != "200" ]]; then
    echo "🚨 CRITICAL: Preflight protocol failure"
    echo "   Symptoms: OPTIONS request not reaching Express middleware"
    echo "   Action: Verify CORS middleware placement, proxy configuration"
    echo "   Location: Backend Express.js middleware layer"
elif [[ "$ACAO_HEADER" != *"https://skcsaiedge.onrender.com"* ]]; then
    echo "🚨 CRITICAL: Origin validation failure"
    echo "   Symptoms: Origin not in allowlist or proxy stripping"
    echo "   Action: Check allowedOrigins array, Cloudflare rules"
    echo "   Location: Origin validation logic"
elif [[ "$ACAH_HEADER" != *"x-api-key"* ]]; then
    echo "🚨 CRITICAL: Custom header authorization failure"
    echo "   Symptoms: x-api-key not explicitly allowed"
    echo "   Action: Update allowedHeaders in corsOptions"
    echo "   Location: Header authorization configuration"
elif [[ "$ACTUAL_CODE" != "200" ]]; then
    echo "⚠️  WARNING: Preflight succeeded but actual request failed"
    echo "   Symptoms: Authentication or business logic errors"
    echo "   Action: Check x-api-key validation, database connectivity"
    echo "   Location: Application business logic layer"
else
    echo "✅ SUCCESS: All CORS protocols functioning correctly"
    echo "   If browser still shows errors, check:"
    echo "   - Frontend fetch() configuration"
    echo "   - Browser cache/hard refresh"
    echo "   - Service Worker interference"
fi

echo ""
echo "📋 NEXT STEPS"
echo "============="
echo "1. If CRITICAL issues found: Manual deploy to Render required"
echo "2. If SUCCESS: Test in browser with DevTools Network tab"
echo "3. Monitor Render logs for [CORS] debug messages"
echo "4. Verify frontend uses correct Origin and headers"
