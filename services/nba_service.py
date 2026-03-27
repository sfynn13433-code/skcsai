import logging
from typing import List, Optional, Dict, Any
from datetime import datetime

# Import approved library - nba_api for NBA data
try:
    from nba_api.stats.static import teams
    from nba_api.stats.endpoints import playerlist, commonplayerinfo, playercareerstats
    from nba_api.stats.endpoints import scoreboard, boxscoretraditionalv2
except ImportError as e:
    raise ImportError(
        "nba_api library is required. Install with: pip install nba_api\n"
        "Error: " + str(e)
    )

from models.sport_models import NBAPlayer, NBATeam, NBAStats, Game, Injury

logger = logging.getLogger(__name__)


class NBAService:
    """NBA data ingestion service using nba_api library (no web scraping)."""
    
    def __init__(self):
        self.api_base = "https://stats.nba.com"
        logger.info("NBA Service initialized with nba_api library")
    
    def get_active_teams(self) -> List[NBATeam]:
        """
        Fetch all active NBA teams using nba_api.
        
        Returns:
            List of NBATeam objects with current team information
        """
        try:
            logger.info("Fetching NBA teams...")
            nba_teams = teams.get_teams()
            
            result = []
            for team in nba_teams:
                nba_team = NBATeam(
                    id=str(team['id']),
                    name=team['full_name'],
                    abbreviation=team['abbreviation'],
                    league="NBA",
                    division=team.get('division'),
                    conference=team.get('conference')
                )
                result.append(nba_team)
            
            logger.info(f"Retrieved {len(result)} NBA teams")
            return result
            
        except Exception as e:
            logger.error(f"Failed to fetch NBA teams: {e}")
            raise
    
    def get_active_players(self) -> List[NBAPlayer]:
        """
        Fetch all active NBA players using nba_api.
        
        Returns:
            List of NBAPlayer objects with current roster information
        """
        try:
            logger.info("Fetching NBA players...")
            players = playerlist.PlayerList().get_data_frames()[0]
            
            # Filter for active players only
            active_players = players[players['ROSTER_STATUS'] == 'Active']
            
            result = []
            for _, player in active_players.iterrows():
                nba_player = NBAPlayer(
                    id=str(player['PERSON_ID']),
                    name=player['DISPLAY_FIRST_LAST'],
                    age=None,  # Will be populated from detailed player info if needed
                    position=player['POSITION'],
                    status='Active'
                )
                result.append(nba_player)
            
            logger.info(f"Retrieved {len(result)} active NBA players")
            return result
            
        except Exception as e:
            logger.error(f"Failed to fetch NBA players: {e}")
            raise
    
    def get_player_details(self, player_id: str) -> Optional[NBAPlayer]:
        """
        Get detailed player information including age and physical attributes.
        
        Args:
            player_id: NBA player ID
            
        Returns:
            NBAPlayer object with detailed information
        """
        try:
            logger.info(f"Fetching details for NBA player {player_id}")
            
            # Get common player info
            player_info = commonplayerinfo.CommonPlayerInfo(
                player_id=int(player_id)
            ).get_data_frames()[0]
            
            if not player_info.empty:
                info = player_info.iloc[0]
                nba_player = NBAPlayer(
                    id=str(info['PERSON_ID']),
                    name=info['DISPLAY_FIRST_LAST'],
                    age=self._calculate_age(info['DATE_OF_BIRTH']),
                    height=info['HEIGHT'],
                    weight=float(info['WEIGHT']) if info['WEIGHT'] else None,
                    position=info['POSITION'],
                    jersey_number=int(info['JERSEY']) if info['JERSEY'] else None,
                    experience_years=int(info['SEASON_EXP']) if info['SEASON_EXP'] else None,
                    status='Active'
                )
                return nba_player
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to fetch player details for {player_id}: {e}")
            return None
    
    def get_current_games(self, date: Optional[datetime] = None) -> List[Game]:
        """
        Get current/scheduled NBA games for a specific date.
        
        Args:
            date: Date to fetch games for (defaults to today)
            
        Returns:
            List of Game objects
        """
        try:
            logger.info(f"Fetching NBA games for {date or 'today'}")
            
            # Format date for NBA API
            game_date = date or datetime.now()
            date_str = game_date.strftime("%m/%d/%Y")
            
            scoreboard_data = scoreboard.Scoreboard(
                game_date=date_str,
                league_id="00"  # NBA league ID
            ).get_data_frames()[0]
            
            result = []
            for _, game in scoreboard_data.iterrows():
                nba_game = Game(
                    id=str(game['GAME_ID']),
                    home_team_id=str(game['HOME_TEAM_ID']),
                    away_team_id=str(game['VISITOR_TEAM_ID']),
                    commence_time=datetime.strptime(game['GAME_TIME'], "%Y-%m-%dT%H:%M:%S"),
                    status=game['GAME_STATUS_TEXT']
                )
                result.append(nba_game)
            
            logger.info(f"Retrieved {len(result)} NBA games")
            return result
            
        except Exception as e:
            logger.error(f"Failed to fetch NBA games: {e}")
            raise
    
    def get_player_stats(self, player_id: str, season: str = "2023-24") -> List[NBAStats]:
        """
        Get career stats for a specific NBA player.
        
        Args:
            player_id: NBA player ID
            season: Season string (e.g., "2023-24")
            
        Returns:
            List of NBAStats objects
        """
        try:
            logger.info(f"Fetching career stats for NBA player {player_id}")
            
            career_stats = playercareerstats.PlayerCareerStats(
                player_id=int(player_id)
            ).get_data_frames()[0]
            
            result = []
            for _, stats in career_stats.iterrows():
                if stats['SEASON_ID'] == int(season.replace('-', '')):
                    nba_stats = NBAStats(
                        player_id=player_id,
                        season=season,
                        stats_data={
                            'points': float(stats['PTS']) if stats['PTS'] else None,
                            'assists': float(stats['AST']) if stats['AST'] else None,
                            'rebounds': float(stats['REB']) if stats['REB'] else None,
                            'steals': float(stats['STL']) if stats['STL'] else None,
                            'blocks': float(stats['BLK']) if stats['BLK'] else None,
                            'turnovers': float(stats['TOV']) if stats['TOV'] else None,
                            'minutes_played': float(stats['MIN']) if stats['MIN'] else None,
                            'games_played': int(stats['GP']) if stats['GP'] else None
                        }
                    )
                    result.append(nba_stats)
            
            logger.info(f"Retrieved {len(result)} stat entries for player {player_id}")
            return result
            
        except Exception as e:
            logger.error(f"Failed to fetch player stats for {player_id}: {e}")
            raise
    
    def get_injury_report(self) -> List[Injury]:
        """
        Get current NBA injury report.
        
        Note: This may require additional API calls or parsing from game data
        as nba_api doesn't have a dedicated injury endpoint.
        
        Returns:
            List of Injury objects
        """
        try:
            logger.info("Fetching NBA injury report...")
            
            # NBA API doesn't have a dedicated injury endpoint
            # This would typically be implemented by parsing game data or
            # using a different data source
            # For now, return empty list with implementation note
            
            logger.warning(
                "NBA injury report not directly available via nba_api. "
                "Consider integrating with NBA.com injury data or game data parsing."
            )
            
            return []
            
        except Exception as e:
            logger.error(f"Failed to fetch NBA injury report: {e}")
            raise
    
    def _calculate_age(self, birth_date_str: str) -> Optional[int]:
        """Calculate age from birth date string."""
        try:
            if birth_date_str:
                birth_date = datetime.strptime(birth_date_str, "%Y-%m-%d")
                today = datetime.now()
                age = today.year - birth_date.year - (
                    (today.month, today.day) < (birth_date.month, birth_date.day)
                )
                return age
        except Exception:
            pass
        return None


# Singleton instance for easy import
nba_service = NBAService()
