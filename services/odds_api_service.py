import os
import logging
from datetime import datetime
from typing import List, Optional
import requests
from dotenv import load_dotenv

from models.odds_schema import Event

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
BASE_URL = "https://api.the-odds-api.com"
ODDS_API_KEY = os.getenv("ODDS_API_KEY")

if not ODDS_API_KEY:
    raise ValueError("ODDS_API_KEY environment variable is required")

# Default settings to protect quota
DEFAULT_REGION = "us"
DEFAULT_MARKET = "h2h"
QUOTA_WARNING_THRESHOLD = 50


class OddsAPIService:
    """Service for interacting with The Odds API V4 with quota protection."""
    
    def __init__(self):
        self.base_url = BASE_URL
        self.api_key = ODDS_API_KEY
        self.session = requests.Session()
        self.session.headers.update({
            "X-Api-Key": self.api_key,
            "Content-Type": "application/json"
        })
    
    def _check_quota_remaining(self, response: requests.Response) -> None:
        """Check remaining quota and log warning if below threshold."""
        remaining = response.headers.get("x-requests-remaining")
        if remaining is not None:
            remaining_int = int(remaining)
            if remaining_int < QUOTA_WARNING_THRESHOLD:
                logger.warning(
                    f"Odds API quota running low: {remaining_int} requests remaining"
                )
            logger.info(f"Odds API quota remaining: {remaining_int}")
    
    def get_active_sports(self) -> List[dict]:
        """
        Fetch list of active sports from The Odds API.
        
        Returns:
            List of sport dictionaries with keys: 'key', 'active', 'group', 'details', 'title'
        
        Note:
            This endpoint costs 0 quota credits.
        """
        url = f"{self.base_url}/v4/sports"
        
        try:
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            
            self._check_quota_remaining(response)
            
            sports = response.json()
            logger.info(f"Retrieved {len(sports)} active sports")
            return sports
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch active sports: {e}")
            raise
    
    def get_event_odds(
        self, 
        sport_key: str, 
        region: str = DEFAULT_REGION, 
        market: str = DEFAULT_MARKET,
        odds_format: str = "decimal"
    ) -> List[Event]:
        """
        Fetch odds for events in a specific sport.
        
        Args:
            sport_key: Sport key (e.g., 'basketball_nba', 'americanfootball_nfl')
            region: Region for odds (default: 'us')
            market: Market type (default: 'h2h' for moneyline)
            odds_format: Odds format ('decimal' or 'american')
        
        Returns:
            List of Event objects with odds data
        
        Raises:
            ValueError: If invalid parameters provided
            RequestException: If API request fails
        """
        if not sport_key:
            raise ValueError("sport_key is required")
        
        url = f"{self.base_url}/v4/sports/{sport_key}/odds"
        params = {
            "regions": region,
            "markets": market,
            "oddsFormat": odds_format
        }
        
        try:
            logger.info(f"Fetching odds for {sport_key} in {region} region, {market} market")
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            self._check_quota_remaining(response)
            
            events_data = response.json()
            
            # Parse into Pydantic models
            events = [Event(**event) for event in events_data]
            logger.info(f"Retrieved odds for {len(events)} events")
            
            return events
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch event odds for {sport_key}: {e}")
            raise
        except ValueError as e:
            logger.error(f"Invalid response data for {sport_key}: {e}")
            raise
    
    def get_sport_odds_summary(
        self, 
        sport_key: str, 
        regions: Optional[List[str]] = None,
        markets: Optional[List[str]] = None
    ) -> dict:
        """
        Get a summary of odds information for a sport including quota impact.
        
        Args:
            sport_key: Sport key to query
            regions: List of regions (defaults to [DEFAULT_REGION])
            markets: List of markets (defaults to [DEFAULT_MARKET])
        
        Returns:
            Dictionary with summary information
        """
        if regions is None:
            regions = [DEFAULT_REGION]
        if markets is None:
            markets = [DEFAULT_MARKET]
        
        # Calculate potential quota cost
        quota_cost = len(regions) * len(markets)
        
        summary = {
            "sport_key": sport_key,
            "regions": regions,
            "markets": markets,
            "estimated_quota_cost": quota_cost,
            "warning": quota_cost > 10  # Warn if high cost
        }
        
        if summary["warning"]:
            logger.warning(
                f"High quota cost for {sport_key}: {quota_cost} credits "
                f"({len(regions)} regions × {len(markets)} markets)"
            )
        
        return summary


# Singleton instance for easy import
odds_service = OddsAPIService()
