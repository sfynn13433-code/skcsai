"""
Supabase Integration Demo

This script demonstrates how to use the Supabase service to store and retrieve
sports data from your database. It shows the complete flow from API fetch to database storage.

Usage:
    python demo_supabase_integration.py
"""

import logging
from datetime import datetime
from services.odds_api_service import odds_service
from services.supabase_service import supabase_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def test_supabase_connection():
    """Test the Supabase database connection."""
    logger.info("=== Testing Supabase Connection ===")
    
    try:
        if supabase_service.test_connection():
            logger.info("✅ Supabase connection successful")
            return True
        else:
            logger.error("❌ Supabase connection failed")
            return False
    except Exception as e:
        logger.error(f"❌ Connection test error: {e}")
        return False


def sync_sports_data():
    """Fetch active sports from Odds API and store in Supabase."""
    logger.info("=== Syncing Sports Data ===")
    
    try:
        # Fetch sports from Odds API
        sports = odds_service.get_active_sports()
        logger.info(f"Fetched {len(sports)} sports from Odds API")
        
        # Store in Supabase
        if supabase_service.upsert_sports(sports):
            logger.info("✅ Sports data successfully stored in Supabase")
        else:
            logger.error("❌ Failed to store sports data in Supabase")
            
    except Exception as e:
        logger.error(f"❌ Sports sync error: {e}")


def sync_nba_odds():
    """Fetch NBA odds and store in Supabase."""
    logger.info("=== Syncing NBA Odds ===")
    
    try:
        # Fetch NBA odds from Odds API
        nba_odds = odds_service.get_event_odds("basketball_nba")
        logger.info(f"Fetched {len(nba_odds)} NBA events with odds")
        
        if not nba_odds:
            logger.warning("No NBA odds data available")
            return
        
        # Store events in Supabase
        if supabase_service.upsert_events(nba_odds):
            logger.info("✅ NBA events successfully stored in Supabase")
        else:
            logger.error("❌ Failed to store NBA events in Supabase")
            return
        
        # Extract unique bookmakers and store them
        bookmakers = set()
        for event in nba_odds:
            for bookmaker in event.bookmakers:
                bookmakers.add(bookmaker)
        
        bookmakers_list = list(bookmakers)
        if supabase_service.upsert_bookmakers(bookmakers_list):
            logger.info(f"✅ {len(bookmakers_list)} bookmakers successfully stored in Supabase")
        else:
            logger.error("❌ Failed to store bookmakers in Supabase")
        
        # Store odds snapshots (time-series data)
        if supabase_service.insert_odds_snapshots(nba_odds):
            logger.info("✅ NBA odds snapshots successfully stored in Supabase")
        else:
            logger.error("❌ Failed to store NBA odds snapshots in Supabase")
            
    except Exception as e:
        logger.error(f"❌ NBA odds sync error: {e}")


def retrieve_sample_data():
    """Demonstrate retrieving data from Supabase."""
    logger.info("=== Retrieving Sample Data ===")
    
    try:
        # Get sports list
        sports = supabase_service.get_sports_list(active_only=True)
        logger.info(f"Retrieved {len(sports)} active sports from database")
        for sport in sports[:3]:  # Show first 3
            logger.info(f"  - {sport['title']} ({sport['key']})")
        
        # Get NBA events
        nba_events = supabase_service.get_events_by_sport("basketball_nba")
        logger.info(f"Retrieved {len(nba_events)} NBA events from database")
        
        if nba_events:
            # Get latest odds for first event
            event = nba_events[0]
            latest_odds = supabase_service.get_latest_odds_for_event(event['id'])
            logger.info(f"Latest odds for {event['home_team']} vs {event['away_team']}: {len(latest_odds)} snapshots")
            
            if latest_odds:
                snapshot = latest_odds[0]
                logger.info(f"  Bookmaker: {snapshot['bookmaker_key']}")
                logger.info(f"  Market: {snapshot['market_key']}")
                logger.info(f"  Outcomes: {len(snapshot['outcomes'])}")
                for outcome in snapshot['outcomes'][:2]:  # Show first 2 outcomes
                    logger.info(f"    - {outcome['name']}: {outcome['price']}")
        
    except Exception as e:
        logger.error(f"❌ Data retrieval error: {e}")


def main():
    """Main demonstration function."""
    logger.info("Starting Supabase Integration Demo")
    
    # Test connection first
    if not test_supabase_connection():
        logger.error("Cannot proceed: Supabase connection failed")
        return
    
    # Sync data
    sync_sports_data()
    sync_nba_odds()
    
    # Retrieve and display data
    retrieve_sample_data()
    
    logger.info("Supabase Integration Demo completed!")


if __name__ == "__main__":
    main()
