"""
Supabase Database Integration Service

This service handles all database operations for the sports data ingestion system.
It accepts Pydantic models from the API services and formats them for Supabase insertion.

Key Features:
- Upsert operations for sports, events, and bookmakers
- Append-only inserts for odds snapshots (time-series data)
- Proper handling of JSONB fields
- Error handling and logging
"""

import os
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

try:
    from supabase import create_client, Client
except ImportError as e:
    raise ImportError(
        "supabase library is required. Install with: pip install supabase\n"
        "Error: " + str(e)
    )

# Import Pydantic models (do not modify the source services)
from models.odds_schema import Event, Market, Bookmaker, Outcome

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # Use service role key for write access

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY environment variables are required")


class SupabaseService:
    """
    Service for interacting with Supabase PostgreSQL database.
    
    Handles insertion of sports data with proper type conversion and error handling.
    """
    
    def __init__(self):
        self.client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized")
    
    def _handle_supabase_error(self, error: Exception, operation: str) -> None:
        """Handle Supabase errors with proper logging."""
        logger.error(f"Supabase error during {operation}: {str(error)}")
        # You can add more sophisticated error handling here
        # such as retry logic, error categorization, etc.
    
    def upsert_sports(self, sports_data: List[Dict[str, Any]]) -> bool:
        """
        Insert or update sports data in the sports table.
        
        Args:
            sports_data: List of sport dictionaries from Odds API
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Upserting {len(sports_data)} sports records")
            
            # Format data for Supabase to match actual schema
            formatted_sports = []
            for sport in sports_data:
                formatted_sport = {
                    'sport_key': sport.get('key'),  # Map key to sport_key
                    'sport_group': sport.get('group'),  # Map group to sport_group
                    'title': sport.get('title'),
                    'description': sport.get('details'),  # Map details to description
                    'active': sport.get('active', False),
                    'has_outrights': False,  # Default value as not provided by API
                    'updated_at': datetime.now().isoformat()
                }
                formatted_sports.append(formatted_sport)
            
            # Perform upsert operation
            response = self.client.table('sports').upsert(
                formatted_sports,
                on_conflict='sport_key'  # Use sport_key as unique constraint
            ).execute()
            
            if response.data:
                logger.info(f"Successfully upserted {len(response.data)} sports")
                return True
            else:
                logger.warning("No data returned from sports upsert")
                return False
                
        except Exception as e:
            self._handle_supabase_error(e, "sports upsert")
            return False
    
    def upsert_events(self, events: List[Event]) -> bool:
        """
        Insert or update events data in the events table.
        
        Args:
            events: List of Event Pydantic models
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Upserting {len(events)} events")
            
            # Convert Pydantic models to dictionaries - only include required fields
            formatted_events = []
            for event in events:
                formatted_event = {
                    'id': event.id,
                    'sport_key': event.sport_key,
                    'commence_time': event.commence_time.isoformat(),
                    'home_team': event.home_team,
                    'away_team': event.away_team,
                    'created_at': datetime.now().isoformat()  # Use created_at instead of updated_at
                }
                formatted_events.append(formatted_event)
            
            # Perform upsert operation
            response = self.client.table('events').upsert(
                formatted_events,
                on_conflict='id'  # Assuming 'id' is the unique constraint
            ).execute()
            
            if response.data:
                logger.info(f"Successfully upserted {len(response.data)} events")
                return True
            else:
                logger.warning("No data returned from events upsert")
                return False
                
        except Exception as e:
            self._handle_supabase_error(e, "events upsert")
            return False
    
    def upsert_bookmakers(self, bookmakers: List[Bookmaker]) -> bool:
        """
        Insert or update bookmakers data in the bookmakers table.
        
        Args:
            bookmakers: List of Bookmaker Pydantic models
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Upserting {len(bookmakers)} bookmakers")
            
            # Convert Pydantic models to dictionaries - only include required fields
            formatted_bookmakers = []
            for bookmaker in bookmakers:
                formatted_bookmaker = {
                    'bookmaker_key': bookmaker.key,  # Map key to bookmaker_key
                    'title': bookmaker.title
                    # Note: last_update and updated_at are not in the actual schema
                }
                formatted_bookmakers.append(formatted_bookmaker)
            
            # Perform upsert operation
            response = self.client.table('bookmakers').upsert(
                formatted_bookmakers,
                on_conflict='bookmaker_key'  # Use bookmaker_key as unique constraint
            ).execute()
            
            if response.data:
                logger.info(f"Successfully upserted {len(response.data)} bookmakers")
                return True
            else:
                logger.warning("No data returned from bookmakers upsert")
                return False
                
        except Exception as e:
            self._handle_supabase_error(e, "bookmakers upsert")
            return False
    
    def insert_odds_snapshots(self, events: List[Event]) -> bool:
        """
        Insert odds snapshots (append-only operation for time-series data).
        
        This creates historical records of odds data without overwriting existing records.
        Only includes required fields - no redundant event data.
        
        Args:
            events: List of Event Pydantic models with full odds data
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Inserting odds snapshots for {len(events)} events")
            
            # Convert events to odds snapshot format - only required fields
            snapshots = []
            for event in events:
                for bookmaker in event.bookmakers:
                    for market in bookmaker.markets:
                        # Create a snapshot for each market - only required fields
                        snapshot = {
                            'event_id': event.id,
                            'bookmaker_key': bookmaker.key,
                            'market_key': market.key,
                            'last_update': market.last_update.isoformat(),
                            'outcomes': [outcome.dict() for outcome in market.outcomes]
                            # Note: id (UUID) and recorded_at will be handled by database defaults
                        }
                        snapshots.append(snapshot)
            
            if not snapshots:
                logger.info("No odds snapshots to insert")
                return True
            
            # Perform insert operation (append-only)
            response = self.client.table('odds_snapshots').insert(snapshots).execute()
            
            if response.data:
                logger.info(f"Successfully inserted {len(response.data)} odds snapshots")
                return True
            else:
                logger.warning("No data returned from odds snapshots insert")
                return False
                
        except Exception as e:
            self._handle_supabase_error(e, "odds snapshots insert")
            return False
    
    def get_latest_odds_for_event(self, event_id: str, market_key: str = "h2h") -> List[Dict[str, Any]]:
        """
        Get the latest odds snapshot for a specific event and market.
        
        Args:
            event_id: Event ID
            market_key: Market key (default: "h2h")
            
        Returns:
            List of latest odds snapshots
        """
        try:
            logger.info(f"Fetching latest odds for event {event_id}, market {market_key}")
            
            response = self.client.table('odds_snapshots')\
                .select('*')\
                .eq('event_id', event_id)\
                .eq('market_key', market_key)\
                .order('recorded_at', desc=True)\
                .limit(10)\
                .execute()
            
            if response.data:
                logger.info(f"Found {len(response.data)} odds snapshots")
                return response.data
            else:
                logger.info(f"No odds snapshots found for event {event_id}")
                return []
                
        except Exception as e:
            self._handle_supabase_error(e, "get latest odds")
            return []
    
    def get_events_by_sport(self, sport_key: str, active_only: bool = True) -> List[Dict[str, Any]]:
        """
        Get events for a specific sport.
        
        Args:
            sport_key: Sport key
            active_only: Whether to only return active/upcoming events
            
        Returns:
            List of events
        """
        try:
            logger.info(f"Fetching events for sport {sport_key}")
            
            query = self.client.table('events').select('*').eq('sport_key', sport_key)
            
            if active_only:
                # Only get events that haven't started yet
                query = query.gte('commence_time', datetime.now().isoformat())
            
            response = query.order('commence_time').execute()
            
            if response.data:
                logger.info(f"Found {len(response.data)} events for {sport_key}")
                return response.data
            else:
                logger.info(f"No events found for sport {sport_key}")
                return []
                
        except Exception as e:
            self._handle_supabase_error(e, "get events by sport")
            return []
    
    def get_sports_list(self, active_only: bool = True) -> List[Dict[str, Any]]:
        """
        Get list of sports from database.
        
        Args:
            active_only: Whether to only return active sports
            
        Returns:
            List of sports
        """
        try:
            logger.info("Fetching sports list")
            
            query = self.client.table('sports').select('*')
            
            if active_only:
                query = query.eq('active', True)
            
            response = query.order('title').execute()
            
            if response.data:
                logger.info(f"Found {len(response.data)} sports")
                return response.data
            else:
                logger.info("No sports found")
                return []
                
        except Exception as e:
            self._handle_supabase_error(e, "get sports list")
            return []
    
    def test_connection(self) -> bool:
        """
        Test the Supabase connection.
        
        Returns:
            True if connection is successful, False otherwise
        """
        try:
            logger.info("Testing Supabase connection")
            
            # Try to fetch a small amount of data from sports table
            response = self.client.table('sports').select('count').limit(1).execute()
            
            if response is not None:
                logger.info("Supabase connection test successful")
                return True
            else:
                logger.error("Supabase connection test failed: No response")
                return False
                
        except Exception as e:
            self._handle_supabase_error(e, "connection test")
            return False


# Singleton instance for easy import
supabase_service = SupabaseService()
