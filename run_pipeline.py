"""
Sports Data Ingestion Pipeline

This script orchestrates the complete data ingestion workflow:
1. Sync sports data from Odds API to Supabase
2. Fetch odds for target sports
3. Store events, bookmakers, and odds snapshots in Supabase

Usage:
    python run_pipeline.py
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


def sync_sports_data():
    """
    Sync active sports from Odds API to Supabase.
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        logger.info("=== Step 1: Syncing Sports Data ===")
        
        # Fetch active sports from Odds API
        sports = odds_service.get_active_sports()
        logger.info(f"Fetched {len(sports)} active sports from Odds API")
        
        # Store in Supabase
        if supabase_service.upsert_sports(sports):
            logger.info("✅ Sports data successfully synced to Supabase")
            return True
        else:
            logger.error("❌ Failed to sync sports data to Supabase")
            return False
            
    except Exception as e:
        logger.error(f"❌ Sports sync error: {e}")
        return False


def fetch_and_store_odds(target_sports):
    """
    Fetch odds for target sports and store in Supabase.
    
    Args:
        target_sports: List of sport keys to process
        
    Returns:
        dict: Summary of processing results
    """
    results = {
        'total_events': 0,
        'total_snapshots': 0,
        'sports_processed': [],
        'errors': []
    }
    
    logger.info("=== Step 2: Fetching & Storing Odds ===")
    
    for sport_key in target_sports:
        try:
            logger.info(f"Processing sport: {sport_key}")
            
            # Fetch current event odds for the sport
            events = odds_service.get_event_odds(sport_key)
            
            if not events:
                logger.warning(f"No events found for {sport_key}")
                results['sports_processed'].append({
                    'sport': sport_key,
                    'events': 0,
                    'snapshots': 0,
                    'status': 'no_events'
                })
                continue
            
            logger.info(f"Fetched {len(events)} events for {sport_key}")
            
            # Count total snapshots before insertion
            total_snapshots = 0
            for event in events:
                for bookmaker in event.bookmakers:
                    total_snapshots += len(bookmaker.markets)
            
            # Store events in Supabase
            events_success = supabase_service.upsert_events(events)
            if not events_success:
                logger.error(f"Failed to store events for {sport_key}")
                results['errors'].append(f"Events storage failed for {sport_key}")
                continue
            
            # Extract unique bookmakers and store them
            bookmakers = set()
            for event in events:
                for bookmaker in event.bookmakers:
                    bookmakers.add(bookmaker)
            
            bookmakers_list = list(bookmakers)
            bookmakers_success = supabase_service.upsert_bookmakers(bookmakers_list)
            if not bookmakers_success:
                logger.error(f"Failed to store bookmakers for {sport_key}")
                results['errors'].append(f"Bookmakers storage failed for {sport_key}")
                continue
            
            # Store odds snapshots (append-only time-series data)
            snapshots_success = supabase_service.insert_odds_snapshots(events)
            if not snapshots_success:
                logger.error(f"Failed to store odds snapshots for {sport_key}")
                results['errors'].append(f"Odds snapshots storage failed for {sport_key}")
                continue
            
            # Update results
            results['total_events'] += len(events)
            results['total_snapshots'] += total_snapshots
            results['sports_processed'].append({
                'sport': sport_key,
                'events': len(events),
                'snapshots': total_snapshots,
                'bookmakers': len(bookmakers_list),
                'status': 'success'
            })
            
            logger.info(f"✅ {sport_key}: {len(events)} events, {total_snapshots} snapshots, {len(bookmakers_list)} bookmakers")
            
        except Exception as e:
            logger.error(f"❌ Error processing {sport_key}: {e}")
            results['errors'].append(f"Processing error for {sport_key}: {str(e)}")
            results['sports_processed'].append({
                'sport': sport_key,
                'events': 0,
                'snapshots': 0,
                'status': 'error'
            })
    
    return results


def print_pipeline_summary(results, start_time):
    """
    Print a summary of the pipeline execution.
    
    Args:
        results: Dictionary with processing results
        start_time: Pipeline start time
    """
    end_time = datetime.now()
    duration = end_time - start_time
    
    logger.info("=== Pipeline Summary ===")
    logger.info(f"Duration: {duration.total_seconds():.2f} seconds")
    logger.info(f"Total events processed: {results['total_events']}")
    logger.info(f"Total odds snapshots stored: {results['total_snapshots']}")
    
    logger.info("Sports processed:")
    for sport_result in results['sports_processed']:
        status_emoji = "✅" if sport_result['status'] == 'success' else "⚠️" if sport_result['status'] == 'no_events' else "❌"
        logger.info(f"  {status_emoji} {sport_result['sport']}: "
                   f"{sport_result['events']} events, "
                   f"{sport_result['snapshots']} snapshots")
    
    if results['errors']:
        logger.warning("Errors encountered:")
        for error in results['errors']:
            logger.warning(f"  - {error}")
    
    success_rate = len([s for s in results['sports_processed'] if s['status'] == 'success'])
    total_sports = len(results['sports_processed'])
    logger.info(f"Success rate: {success_rate}/{total_sports} sports processed successfully")


def main():
    """
    Main pipeline execution function.
    """
    start_time = datetime.now()
    logger.info("🚀 Starting Sports Data Ingestion Pipeline")
    logger.info(f"Started at: {start_time.isoformat()}")
    
    try:
        # Step 1: Sync sports data
        sports_sync_success = sync_sports_data()
        if not sports_sync_success:
            logger.error("❌ Pipeline failed: Sports sync unsuccessful")
            return
        
        # Step 2: Define target sports
        target_sports = ['basketball_nba', 'americanfootball_nfl']
        logger.info(f"Target sports: {', '.join(target_sports)}")
        
        # Step 3: Fetch and store odds
        results = fetch_and_store_odds(target_sports)
        
        # Step 4: Print summary
        print_pipeline_summary(results, start_time)
        
        # Determine overall success
        if results['errors'] and len(results['errors']) > 0:
            logger.warning("⚠️ Pipeline completed with errors")
        else:
            logger.info("✅ Pipeline completed successfully")
            
    except Exception as e:
        logger.error(f"❌ Fatal pipeline error: {e}")
        logger.exception("Full error traceback:")
        raise
    
    finally:
        end_time = datetime.now()
        duration = end_time - start_time
        logger.info(f"Pipeline finished at: {end_time.isoformat()}")
        logger.info(f"Total execution time: {duration.total_seconds():.2f} seconds")


if __name__ == "__main__":
    main()
