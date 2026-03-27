import logging
from typing import List, Optional, Dict, Any
from datetime import datetime

# Import approved library - nfl_data_py for NFL data
try:
    import nfl_data_py as nfl
except ImportError as e:
    raise ImportError(
        "nfl_data_py library is required. Install with: pip install nfl_data_py\n"
        "Error: " + str(e)
    )

from models.sport_models import NFLPlayer, NFLTeam, NFLStats, Game, Injury

logger = logging.getLogger(__name__)


class NFLService:
    """NFL data ingestion service using nfl_data_py library (no web scraping)."""
    
    def __init__(self):
        self.api_base = "https://www.nflfastR-data.com"
        logger.info("NFL Service initialized with nfl_data_py library")
    
    def get_active_teams(self) -> List[NFLTeam]:
        """
        Fetch all active NFL teams using nfl_data_py.
        
        Returns:
            List of NFLTeam objects with current team information
        """
        try:
            logger.info("Fetching NFL teams...")
            
            # Get team data from nflfastR
            teams_df = nfl.import_team_desc()
            
            result = []
            for _, team in teams_df.iterrows():
                nfl_team = NFLTeam(
                    id=str(team['team_id']),
                    name=team['team_name'],
                    abbreviation=team['team_abbr'],
                    league="NFL",
                    conference=team['conference'],
                    division=team['division']
                )
                result.append(nfl_team)
            
            logger.info(f"Retrieved {len(result)} NFL teams")
            return result
            
        except Exception as e:
            logger.error(f"Failed to fetch NFL teams: {e}")
            raise
    
    def get_active_players(self, season: str = "2023") -> List[NFLPlayer]:
        """
        Fetch all active NFL players for a given season using nfl_data_py.
        
        Args:
            season: NFL season year (e.g., "2023")
            
        Returns:
            List of NFLPlayer objects with current roster information
        """
        try:
            logger.info(f"Fetching NFL players for season {season}...")
            
            # Get player roster data
            roster_df = nfl.import_rosters([int(season)])
            
            # Filter for active players
            active_players = roster_df[roster_df['status'] == 'ACT']
            
            result = []
            for _, player in active_players.iterrows():
                nfl_player = NFLPlayer(
                    id=str(player['player_id']),
                    name=player['player_name'],
                    jersey_number=player['jersey_number'],
                    position=player['position'],
                    status='Active'
                )
                result.append(nfl_player)
            
            # Remove duplicates (players may appear multiple times)
            unique_players = {player.id: player for player in result}.values()
            
            logger.info(f"Retrieved {len(unique_players)} active NFL players")
            return list(unique_players)
            
        except Exception as e:
            logger.error(f"Failed to fetch NFL players: {e}")
            raise
    
    def get_player_details(self, player_id: str) -> Optional[NFLPlayer]:
        """
        Get detailed player information including physical attributes.
        
        Args:
            player_id: NFL player ID
            
        Returns:
            NFLPlayer object with detailed information
        """
        try:
            logger.info(f"Fetching details for NFL player {player_id}")
            
            # Get player descriptions/attributes
            players_df = nfl.import_players()
            player_info = players_df[players_df['player_id'] == int(player_id)]
            
            if not player_info.empty:
                info = player_info.iloc[0]
                nfl_player = NFLPlayer(
                    id=str(info['player_id']),
                    name=info['display_name'],
                    height=info['height'],
                    weight=float(info['weight']) if info['weight'] else None,
                    position=info['position'],
                    jersey_number=info['jersey_number'],
                    experience_years=None,  # Would need to calculate from seasons played
                    status='Active'
                )
                return nfl_player
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to fetch player details for {player_id}: {e}")
            return None
    
    def get_current_games(self, week: Optional[int] = None, season: str = "2023") -> List[Game]:
        """
        Get NFL games for a specific week and season.
        
        Args:
            week: NFL week number (defaults to current week)
            season: NFL season year
            
        Returns:
            List of Game objects
        """
        try:
            logger.info(f"Fetching NFL games for season {season}, week {week}")
            
            # Get schedule data
            schedule_df = nfl.import_schedules([int(season)])
            
            if week:
                schedule_df = schedule_df[schedule_df['week'] == week]
            
            # Filter for regular season and upcoming games
            games_df = schedule_df[schedule_df['season_type'] == 'REG']
            
            result = []
            for _, game in games_df.iterrows():
                nfl_game = Game(
                    id=str(game['game_id']),
                    home_team_id=str(game['home_team']),
                    away_team_id=str(game['away_team']),
                    commence_time=datetime.strptime(game['gameday'], "%Y-%m-%d"),
                    status=game['result'] if pd.notna(game['result']) else 'scheduled',
                    venue=game['stadium']
                )
                result.append(nfl_game)
            
            logger.info(f"Retrieved {len(result)} NFL games")
            return result
            
        except Exception as e:
            logger.error(f"Failed to fetch NFL games: {e}")
            raise
    
    def get_player_stats(self, player_id: str, season: str = "2023") -> List[NFLStats]:
        """
        Get season stats for a specific NFL player.
        
        Args:
            player_id: NFL player ID
            season: NFL season year
            
        Returns:
            List of NFLStats objects
        """
        try:
            logger.info(f"Fetching season stats for NFL player {player_id}")
            
            # Get player statistics
            stats_df = nfl.import_weekly_data([int(season)])
            player_stats = stats_df[stats_df['player_id'] == int(player_id)]
            
            result = []
            for _, stats in player_stats.iterrows():
                nfl_stats = NFLStats(
                    player_id=player_id,
                    game_id=str(stats['game_id']) if pd.notna(stats['game_id']) else None,
                    season=season,
                    stats_data={
                        'passing_yards': float(stats['passing_yards']) if pd.notna(stats['passing_yards']) else None,
                        'passing_touchdowns': float(stats['passing_tds']) if pd.notna(stats['passing_tds']) else None,
                        'interceptions': float(stats['interceptions']) if pd.notna(stats['interceptions']) else None,
                        'rushing_yards': float(stats['rushing_yards']) if pd.notna(stats['rushing_yards']) else None,
                        'rushing_touchdowns': float(stats['rushing_tds']) if pd.notna(stats['rushing_tds']) else None,
                        'receptions': float(stats['receptions']) if pd.notna(stats['receptions']) else None,
                        'receiving_yards': float(stats['receiving_yards']) if pd.notna(stats['receiving_yards']) else None,
                        'receiving_touchdowns': float(stats['receiving_tds']) if pd.notna(stats['receiving_tds']) else None,
                        'tackles': float(stats['tackles']) if pd.notna(stats['tackles']) else None,
                        'sacks': float(stats['sacks']) if pd.notna(stats['sacks']) else None,
                        'completions': float(stats['completions']) if pd.notna(stats['completions']) else None,
                        'attempts': float(stats['attempts']) if pd.notna(stats['attempts']) else None,
                        'fumbles': float(stats['fumbles']) if pd.notna(stats['fumbles']) else None
                    }
                )
                result.append(nfl_stats)
            
            logger.info(f"Retrieved {len(result)} stat entries for player {player_id}")
            return result
            
        except Exception as e:
            logger.error(f"Failed to fetch player stats for {player_id}: {e}")
            raise
    
    def get_injury_report(self, season: str = "2023") -> List[Injury]:
        """
        Get current NFL injury report using nfl_data_py.
        
        Args:
            season: NFL season year
            
        Returns:
            List of Injury objects
        """
        try:
            logger.info(f"Fetching NFL injury report for season {season}")
            
            # Get injury data
            injuries_df = nfl.import_injuries([int(season)])
            
            result = []
            for _, injury in injuries_df.iterrows():
                nfl_injury = Injury(
                    player_id=str(injury['player_id']),
                    player_name=injury['player_name'],
                    injury_type=injury['injury_type'] if pd.notna(injury['injury_type']) else None,
                    status=injury['practice_status'] if pd.notna(injury['practice_status']) else None,
                    return_date=None  # nfl_data_py doesn't provide return dates
                )
                result.append(nfl_injury)
            
            logger.info(f"Retrieved {len(result)} NFL injury entries")
            return result
            
        except Exception as e:
            logger.error(f"Failed to fetch NFL injury report: {e}")
            raise


# Import pandas for data handling (nfl_data_py dependency)
try:
    import pandas as pd
except ImportError:
    raise ImportError("pandas is required for nfl_data_py. Install with: pip install pandas")


# Singleton instance for easy import
nfl_service = NFLService()
