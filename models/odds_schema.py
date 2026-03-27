from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class Outcome(BaseModel):
    name: str = Field(..., description="Outcome name, e.g., team name or 'Over/Under'")
    price: float = Field(..., description="Decimal odds price")
    point: Optional[float] = Field(None, description="Point spread or total points for handicap markets")


class Market(BaseModel):
    key: str = Field(..., description="Market key, e.g., 'h2h', 'spreads', 'totals'")
    last_update: datetime = Field(..., description="Timestamp of last market update")
    outcomes: List[Outcome] = Field(..., description="List of possible outcomes for this market")


class Bookmaker(BaseModel):
    key: str = Field(..., description="Bookmaker identifier")
    title: str = Field(..., description="Display name of the bookmaker")
    last_update: datetime = Field(..., description="Timestamp of last bookmaker update")
    markets: List[Market] = Field(..., description="List of markets offered by this bookmaker")


class Event(BaseModel):
    id: str = Field(..., description="Unique event identifier")
    sport_key: str = Field(..., description="Sport key, e.g., 'basketball_nba'")
    commence_time: datetime = Field(..., description="Event start time (UTC)")
    home_team: str = Field(..., description="Home team name")
    away_team: str = Field(..., description="Away team name")
    bookmakers: List[Bookmaker] = Field(..., description="List of bookmakers offering odds for this event")
