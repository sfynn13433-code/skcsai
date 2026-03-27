"""
Sports Data Ingestion - Quick Start Demo

This script demonstrates how to use the data ingestion services
with the approved open-source libraries (no web scraping).

Requirements:
- pip install nba_api nfl_data_py pydantic requests python-dotenv pandas
- Copy .env.example to .env and add your API keys
"""

import logging
from datetime import datetime
from services.data_ingestion import data_service
from services.odds_api_service import odds_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def demo_nba_data():
    """Demonstrate NBA data ingestion."""
    logger.info("=== NBA Data Demo ===")
    
    try:
        # Get NBA teams
        teams = data_service.get_nba_teams()
        logger.info(f"Found {len(teams)} NBA teams")
        for team in teams[:3]:  # Show first 3
            logger.info(f"  - {team.name} ({team.abbreviation}) - {team.conference} {team.division}")
        
        # Get NBA players
        players = data_service.get_nba_players()
        logger.info(f"Found {len(players)} active NBA players")
        
        # Get details for a specific player (LeBron James as example)
        lebron_id = "2544"  # LeBron James ID
        player_details = data_service.get_nba_player_details(lebron_id)
        if player_details:
            logger.info(f"Player details: {player_details.name} - Age: {player_details.age}, Position: {player_details.position}")
        
        # Get today's games
        games = data_service.get_nba_games()
        logger.info(f"Found {len(games)} NBA games today")
        
        # Get player stats
        if player_details:
            stats = data_service.get_nba_player_stats(lebron_id)
            logger.info(f"Found {len(stats)} stat entries for {player_details.name}")
            if stats:
                latest = stats[-1]
                logger.info(f"Latest season stats: {latest.stats_data}")
        
    except Exception as e:
        logger.error(f"NBA demo failed: {e}")


def demo_nfl_data():
    """Demonstrate NFL data ingestion."""
    logger.info("=== NFL Data Demo ===")
    
    try:
        # Get NFL teams
        teams = data_service.get_nfl_teams()
        logger.info(f"Found {len(teams)} NFL teams")
        for team in teams[:3]:  # Show first 3
            logger.info(f"  - {team.name} ({team.abbreviation}) - {team.conference} {team.division}")
        
        # Get NFL players
        players = data_service.get_nfl_players()
        logger.info(f"Found {len(players)} active NFL players")
        
        # Get current week games
        games = data_service.get_nfl_games()
        logger.info(f"Found {len(games)} NFL games this week")
        
        # Get injury report
        injuries = data_service.get_nfl_injuries()
        logger.info(f"Found {len(injuries)} injury entries")
        
        # Show some sample injuries
        for injury in injuries[:3]:
            logger.info(f"  - {injury.player_name}: {injury.status} ({injury.injury_type})")
        
    except Exception as e:
        logger.error(f"NFL demo failed: {e}")


def demo_odds_api():
    """Demonstrate Odds API integration."""
    logger.info("=== Odds API Demo ===")
    
    try:
        # Get active sports
        sports = odds_service.get_active_sports()
        logger.info(f"Found {len(sports)} active sports")
        for sport in sports[:5]:  # Show first 5
            logger.info(f"  - {sport['key']}: {sport['title']} ({'Active' if sport['active'] else 'Inactive'})")
        
        # Get odds for NBA
        nba_odds = odds_service.get_event_odds("basketball_nba")
        logger.info(f"Found {len(nba_odds)} NBA events with odds")
        
        # Show sample odds
        if nba_odds:
            event = nba_odds[0]
            logger.info(f"Sample event: {event.home_team} vs {event.away_team}")
            logger.info(f"  Commence time: {event.commence_time}")
            logger.info(f"  Bookmakers: {len(event.bookmakers)}")
            if event.bookmakers:
                bookmaker = event.bookmakers[0]
                logger.info(f"  Sample bookmaker: {bookmaker.title}")
                if bookmaker.markets:
                    market = bookmaker.markets[0]
                    logger.info(f"  Sample market: {market.key}")
                    logger.info(f"  Outcomes: {len(market.outcomes)}")
                    for outcome in market.outcomes[:2]:
                        logger.info(f"    - {outcome.name}: {outcome.price}")
        
    except Exception as e:
        logger.error(f"Odds API demo failed: {e}")


def validate_services():
    """Validate all services are working."""
    logger.info("=== Service Validation ===")
    
    validation = data_service.validate_data_integrity()
    logger.info(f"Overall status: {validation['overall_status']}")
    
    for sport, status in validation['services'].items():
        logger.info(f"{sport.upper()}: {status['status']}")
        if status['status'] == 'healthy':
            logger.info(f"  Teams: {status['teams_count']}, Players: {status['players_count']}")
        else:
            logger.error(f"  Error: {status.get('error', 'Unknown error')}")


if __name__ == "__main__":
    logger.info("Starting Sports Data Ingestion Demo")
    logger.info("This demo uses only approved open-source libraries - NO web scraping")
    
    # Run all demos
    validate_services()
    demo_nba_data()
    demo_nfl_data()
    demo_odds_api()
    
    logger.info("Demo completed successfully!")
