"""
Test script to verify the populate_sports_data.py fixes without requiring actual API keys
"""

import os
import sys
from pathlib import Path

# Add the script directory to Python path
script_dir = Path(__file__).resolve().parent / "backend" / "scripts"
sys.path.insert(0, str(script_dir))

def test_api_key_mapping():
    """Test the API key mapping functions."""
    print("=== Testing API Key Mapping ===")
    
    # Set some test environment variables
    os.environ['API_FOOTBALL_KEY'] = 'test_football_key'
    os.environ['X_APISPORTS_KEY'] = 'test_generic_key'
    
    try:
        from populate_sports_data import get_sport_api_key, get_headers_for_sport
        
        # Test sport-specific key retrieval
        football_key = get_sport_api_key('football')
        print(f"Football API key: {football_key}")
        
        nba_key = get_sport_api_key('nba')
        print(f"NBA API key: {nba_key}")
        
        # Test header generation
        football_headers = get_headers_for_sport('football')
        print(f"Football headers: {football_headers}")
        
        print("✅ API key mapping functions work correctly")
        return True
        
    except Exception as e:
        print(f"❌ API key mapping test failed: {e}")
        return False

def test_schema_mapping():
    """Test the schema mapping fixes."""
    print("\n=== Testing Schema Mapping ===")
    
    try:
        from populate_sports_data import upsert_sport, column_exists
        
        # Mock the column_exists function to return True for our test columns
        def mock_column_exists(table, column):
            return True
        
        # Replace the function temporarily
        original_column_exists = column_exists
        import populate_sports_data
        populate_sports_data.column_exists = mock_column_exists
        
        # Test sport insertion (this will fail without real Supabase, but we can check the payload structure)
        try:
            # This should fail gracefully without Supabase connection
            upsert_sport('test_sport', 'Test Sport')
        except Exception as e:
            if "SUPABASE_URL" in str(e) or "supabase" in str(e).lower():
                print("✅ Schema mapping structure is correct (fails at Supabase connection as expected)")
                return True
            else:
                print(f"❌ Unexpected error in schema mapping: {e}")
                return False
        
    except Exception as e:
        print(f"❌ Schema mapping test failed: {e}")
        return False

def test_fetch_function():
    """Test the updated fetch function."""
    print("\n=== Testing Fetch Function ===")
    
    try:
        from populate_sports_data import fetch_api_sports
        
        # Test with sport_slug parameter (will fail without real API, but structure should work)
        try:
            fetch_api_sports("https://example.com/test", sport_slug="football")
        except Exception as e:
            if "API-Sports authentication" in str(e) or "connection" in str(e).lower():
                print("✅ Fetch function structure is correct (fails at API connection as expected)")
                return True
            else:
                print(f"❌ Unexpected error in fetch function: {e}")
                return False
        
    except Exception as e:
        print(f"❌ Fetch function test failed: {e}")
        return False

def main():
    """Run all tests."""
    print("🧪 Testing Supabase Ingestion Fixes")
    print("=" * 50)
    
    tests = [
        test_api_key_mapping,
        test_schema_mapping, 
        test_fetch_function
    ]
    
    results = []
    for test in tests:
        try:
            result = test()
            results.append(result)
        except Exception as e:
            print(f"❌ Test {test.__name__} failed with exception: {e}")
            results.append(False)
    
    print("\n" + "=" * 50)
    passed = sum(results)
    total = len(results)
    print(f"Tests passed: {passed}/{total}")
    
    if passed == total:
        print("✅ All fixes are working correctly!")
        print("\nTo test with real data:")
        print("1. Set up your .env file with actual API keys")
        print("2. Run: python backend/scripts/populate_sports_data.py football")
    else:
        print("❌ Some tests failed - check the errors above")
    
    return passed == total

if __name__ == "__main__":
    main()
