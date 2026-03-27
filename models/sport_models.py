from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class Player(BaseModel):
    """Base player model with public athletic information only."""
    id: str = Field(..., description="Player unique identifier")
    name: str = Field(..., description="Player full name")
    age: Optional[int] = Field(None, description="Player age")
    height: Optional[str] = Field(None, description="Player height (format varies by sport)")
    weight: Optional[float] = Field(None, description="Player weight in pounds/kg")
    position: Optional[str] = Field(None, description="Player position")
    status: Optional[str] = Field(None, description="Player status (active/injured/reserve)")


class Team(BaseModel):
    """Base team model."""
    id: str = Field(..., description="Team unique identifier")
    name: str = Field(..., description="Team full name")
    abbreviation: Optional[str] = Field(None, description="Team abbreviation")
    league: Optional[str] = Field(None, description="League name")
    division: Optional[str] = Field(None, description="Division/conference")


class Game(BaseModel):
    """Base game/match model."""
    id: str = Field(..., description="Game unique identifier")
    home_team_id: str = Field(..., description="Home team identifier")
    away_team_id: str = Field(..., description="Away team identifier")
    commence_time: datetime = Field(..., description="Game start time")
    status: Optional[str] = Field(None, description="Game status (scheduled/in_progress/final)")
    venue: Optional[str] = Field(None, description="Game venue")


class Injury(BaseModel):
    """Public injury information only."""
    player_id: str = Field(..., description="Injured player ID")
    player_name: str = Field(..., description="Injured player name")
    injury_type: Optional[str] = Field(None, description="Type of injury")
    status: Optional[str] = Field(None, description="Injury status (out/questionable/probable)")
    return_date: Optional[datetime] = Field(None, description="Expected return date")


class Stats(BaseModel):
    """Base stats container - sport-specific implementations will extend this."""
    player_id: str = Field(..., description="Player ID these stats belong to")
    game_id: Optional[str] = Field(None, description="Game ID if these are game stats")
    season: Optional[str] = Field(None, description="Season identifier")
    stats_data: Dict[str, Any] = Field(..., description="Sport-specific stats as key-value pairs")


# Sport-specific models
class NBAPlayer(Player):
    """NBA-specific player model."""
    jersey_number: Optional[int] = Field(None, description="Jersey number")
    experience_years: Optional[int] = Field(None, description="Years of NBA experience")


class NBATeam(Team):
    """NBA-specific team model."""
    conference: Optional[str] = Field(None, description="Eastern/Western conference")
    city: Optional[str] = Field(None, description="Team city")


class NBAStats(Stats):
    """NBA-specific stats model."""
    points: Optional[float] = Field(None, description="Points scored")
    assists: Optional[float] = Field(None, description="Assists")
    rebounds: Optional[float] = Field(None, description="Total rebounds")
    steals: Optional[float] = Field(None, description="Steals")
    blocks: Optional[float] = Field(None, description="Blocks")
    turnovers: Optional[float] = Field(None, description="Turnovers")
    minutes_played: Optional[float] = Field(None, description="Minutes played")


class NFLPlayer(Player):
    """NFL-specific player model."""
    jersey_number: Optional[int] = Field(None, description="Jersey number")
    experience_years: Optional[int] = Field(None, description="Years of NFL experience")


class NFLTeam(Team):
    """NFL-specific team model."""
    conference: Optional[str] = Field(None, description="AFC/NFC conference")
    division: Optional[str] = Field(None, description="Division name")


class NFLStats(Stats):
    """NFL-specific stats model."""
    passing_yards: Optional[float] = Field(None, description="Passing yards")
    passing_touchdowns: Optional[float] = Field(None, description="Passing touchdowns")
    interceptions: Optional[float] = Field(None, description="Interceptions thrown")
    rushing_yards: Optional[float] = Field(None, description="Rushing yards")
    rushing_touchdowns: Optional[float] = Field(None, description="Rushing touchdowns")
    receptions: Optional[float] = Field(None, description="Receptions")
    receiving_yards: Optional[float] = Field(None, description="Receiving yards")
    receiving_touchdowns: Optional[float] = Field(None, description="Receiving touchdowns")
    tackles: Optional[float] = Field(None, description="Total tackles")
    sacks: Optional[float] = Field(None, description="Sacks")
