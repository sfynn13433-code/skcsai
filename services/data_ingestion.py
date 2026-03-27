"""
Sports Data Ingestion Module

This module provides a unified interface for ingesting sports data from multiple sources
using only approved open-source libraries. No web scraping or private information is used.

Supported Sports:
- NBA: Uses nba_api library (NBA.com public endpoints)
- NFL: Uses nfl_data_py library (nflfastR data repository)

Usage:
    from services.data_ingestion import DataIngestionService
    
    service = DataIngestionService()
    
    # Get NBA data
    nba_teams = service.get_nba_teams()
    nba_players = service.get_nba_players()
    
    # Get NFL data
    nfl_teams = service.get_nfl_teams()
    nfl_players = service.get_nfl_players()
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from services.nba_service import nba_service, NBAPlayer, NBATeam, NBAStats
from services.nfl_service import nfl_service, NFLPlayer, NFLTeam, NFLStats
from models.sport_models import Game, Injury

logger = logging.getLogger(__name__)


class DataIngestionService:
    """
    Unified service for sports data ingestion using only approved libraries.
    
    Strict constraints enforced:
    - NO web scraping (BeautifulSoup, Selenium, etc.)
    - NO private information (only public athletic profiles)
    - Only use approved open-source libraries
    """
    
    def __init__(self):
        self.nba = nba_service
        self.nfl = nfl_service
        logger.info("Data Ingestion Service initialized with NBA and NFL services")
    
    # NBA Methods
    def get_nba_teams(self) -> List[NBATeam]:
        """Get all active NBA teams."""
        try:
            return self.nba.get_active_teams()
        except Exception as e:
            logger.error(f"Failed to get NBA teams: {e}")
            raise
    
    def get_nba_players(self) -> List[NBAPlayer]:
        """Get all active NBA players."""
        try:
            return self.nba.get_active_players()
        except Exception as e:
            logger.error(f"Failed to get NBA players: {e}")
            raise
    
    def get_nba_player_details(self, player_id: str) -> Optional[NBAPlayer]:
        """Get detailed NBA player information."""
        try:
            return self.nba.get_player_details(player_id)
        except Exception as e:
            logger.error(f"Failed to get NBA player details: {e}")
            raise
    
    def get_nba_games(self, date: Optional[datetime] = None) -> List[Game]:
        """Get NBA games for a specific date."""
        try:
            return self.nba.get_current_games(date)
        except Exception as e:
            logger.error(f"Failed to get NBA games: {e}")
            raise
    
    def get_nba_player_stats(self, player_id: str, season: str = "2023-24") -> List[NBAStats]:
        """Get NBA player statistics."""
        try:
            return self.nba.get_player_stats(player_id, season)
        except Exception as e:
            logger.error(f"Failed to get NBA player stats: {e}")
            raise
    
    def get_nba_injuries(self) -> List[Injury]:
        """Get NBA injury report."""
        try:
            return self.nba.get_injury_report()
        except Exception as e:
            logger.error(f"Failed to get NBA injuries: {e}")
            raise
    
    # NFL Methods
    def get_nfl_teams(self) -> List[NFLTeam]:
        """Get all active NFL teams."""
        try:
            return self.nfl.get_active_teams()
        except Exception as e:
            logger.error(f"Failed to get NFL teams: {e}")
            raise
    
    def get_nfl_players(self, season: str = "2023") -> List[NFLPlayer]:
        """Get all active NFL players for a season."""
        try:
            return self.nfl.get_active_players(season)
        except Exception as e:
            logger.error(f"Failed to get NFL players: {e}")
            raise
    
    def get_nfl_player_details(self, player_id: str) -> Optional[NFLPlayer]:
        """Get detailed NFL player information."""
        try:
            return self.nfl.get_player_details(player_id)
        except Exception as e:
            logger.error(f"Failed to get NFL player details: {e}")
            raise
    
    def get_nfl_games(self, week: Optional[int] = None, season: str = "2023") -> List[Game]:
        """Get NFL games for a specific week and season."""
        try:
            return self.nfl.get_current_games(week, season)
        except Exception as e:
            logger.error(f"Failed to get NFL games: {e}")
            raise
    
    def get_nfl_player_stats(self, player_id: str, season: str = "2023") -> List[NFLStats]:
        """Get NFL player statistics."""
        try:
            return self.nfl.get_player_stats(player_id, season)
        except Exception as e:
            logger.error(f"Failed to get NFL player stats: {e}")
            raise
    
    def get_nfl_injuries(self, season: str = "2023") -> List[Injury]:
        """Get NFL injury report."""
        try:
            return self.nfl.get_injury_report(season)
        except Exception as e:
            logger.error(f"Failed to get NFL injuries: {e}")
            raise
    
    # Unified Methods
    def get_all_teams(self) -> Dict[str, List]:
        """Get all teams from all supported sports."""
        return {
            "nba": self.get_nba_teams(),
            "nfl": self.get_nfl_teams()
        }
    
    def get_all_players(self, nfl_season: str = "2023") -> Dict[str, List]:
        """Get all players from all supported sports."""
        return {
            "nba": self.get_nba_players(),
            "nfl": self.get_nfl_players(nfl_season)
        }
    
    def get_all_games(self, nba_date: Optional[datetime] = None, 
                     nfl_week: Optional[int] = None, 
                     nfl_season: str = "2023") -> Dict[str, List[Game]]:
        """Get all games from all supported sports."""
        return {
            "nba": self.get_nba_games(nba_date),
            "nfl": self.get_nfl_games(nfl_week, nfl_season)
        }
    
    def get_all_injuries(self, nfl_season: str = "2023") -> Dict[str, List[Injury]]:
        """Get all injury reports from all supported sports."""
        return {
            "nba": self.get_nba_injuries(),
            "nfl": self.get_nfl_injuries(nfl_season)
        }
    
    def get_player_by_id(self, player_id: str, sport: str) -> Optional[Any]:
        """
        Get player details by ID across all supported sports.
        
        Args:
            player_id: Player unique identifier
            sport: Sport name ('nba' or 'nfl')
            
        Returns:
            Player object or None if not found
        """
        try:
            if sport.lower() == 'nba':
                return self.get_nba_player_details(player_id)
            elif sport.lower() == 'nfl':
                return self.get_nfl_player_details(player_id)
            else:
                logger.error(f"Unsupported sport: {sport}")
                return None
        except Exception as e:
            logger.error(f"Failed to get player {player_id} for {sport}: {e}")
            return None
    
    def validate_data_integrity(self) -> Dict[str, Any]:
        """
        Validate that all services are working and returning expected data.
        
        Returns:
            Dictionary with validation results
        """
        results = {
            "timestamp": datetime.now().isoformat(),
            "services": {},
            "overall_status": "healthy"
        }
        
        # Test NBA service
        try:
            nba_teams = self.get_nba_teams()
            nba_players = self.get_nba_players()
            results["services"]["nba"] = {
                "status": "healthy",
                "teams_count": len(nba_teams),
                "players_count": len(nba_players)
            }
        except Exception as e:
            results["services"]["nba"] = {
                "status": "error",
                "error": str(e)
            }
            results["overall_status"] = "degraded"
        
        # Test NFL service
        try:
            nfl_teams = self.get_nfl_teams()
            nfl_players = self.get_nfl_players()
            results["services"]["nfl"] = {
                "status": "healthy",
                "teams_count": len(nfl_teams),
                "players_count": len(nfl_players)
            }
        except Exception as e:
            results["services"]["nfl"] = {
                "status": "error",
                "error": str(e)
            }
            results["overall_status"] = "degraded"
        
        return results


# Singleton instance for easy import
data_service = DataIngestionService()
