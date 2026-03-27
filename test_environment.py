"""
Simple test to check environment variables and basic connectivity
"""

import os
from dotenv import load_dotenv

def test_environment():
    print("🔍 Testing Environment Setup")
    print("=" * 50)
    
    # Load environment
    load_dotenv()
    
    # Check required variables
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
    odds_key = os.getenv("ODDS_API_KEY")
    
    print(f"SUPABASE_URL: {'✅ Set' if supabase_url else '❌ Missing'}")
    print(f"SUPABASE_KEY: {'✅ Set' if supabase_key else '❌ Missing'}")
    print(f"ODDS_API_KEY: {'✅ Set' if odds_key else '❌ Missing'}")
    
    if not supabase_url or not supabase_key:
        print("\n❌ ERROR: Missing required Supabase environment variables")
        print("Please set in your .env file:")
        print("  SUPABASE_URL=your_supabase_url")
        print("  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key")
        return False
    
    print("\n✅ Environment variables look good!")
    
    # Test basic imports
    try:
        import requests
        print("✅ requests module available")
    except ImportError:
        print("❌ requests module missing - run: pip install requests")
        return False
    
    try:
        from supabase import create_client
        print("✅ supabase module available")
    except ImportError:
        print("❌ supabase module missing - run: pip install supabase")
        return False
    
    return True

if __name__ == "__main__":
    if test_environment():
        print("\n🚀 Environment is ready! You can run:")
        print("python force_sync_sporting_data.py")
    else:
        print("\n❌ Please fix the issues above before proceeding")
