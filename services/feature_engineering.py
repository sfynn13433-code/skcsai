"""
Feature Engineering Service for AI Predictions

This service pulls historical sporting odds and event data from Supabase
and engineers predictive features for machine learning models.

Key Features:
- Fetch historical odds data from Supabase
- Convert odds to implied probabilities
- Calculate time-based features
- Analyze line movements
- Clean and prepare data for ML training
"""

import logging
import pandas as pd
from datetime import datetime
from typing import Dict, Any, List, Optional
from services.supabase_service import supabase_service

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class FeatureEngineeringService:
    """
    Service for engineering features from historical odds data.
    """
    
    def __init__(self):
        self.supabase = supabase_service
        logger.info("FeatureEngineeringService initialized")
    
    def fetch_historical_data(self, sport_key: str) -> List[Dict[str, Any]]:
        """
        Fetch historical odds data for a specific sport from Supabase.
        
        Args:
            sport_key: Sport key to fetch data for
            
        Returns:
            List of dictionaries containing odds snapshots with event data
        """
        try:
            logger.info(f"Fetching historical data for {sport_key}")
            
            # Query odds snapshots with event information
            response = self.supabase.client.table('odds_snapshots')\
                .select('*, events!inner(id, sport_key, commence_time, home_team, away_team)')\
                .eq('events.sport_key', sport_key)\
                .order('recorded_at')\
                .execute()
            
            if response.data:
                logger.info(f"Fetched {len(response.data)} odds snapshots for {sport_key}")
                return response.data
            else:
                logger.warning(f"No odds data found for {sport_key}")
                return []
                
        except Exception as e:
            logger.error(f"Error fetching historical data: {e}")
            return []
    
    def convert_odds_to_implied_probability(self, odds_value: float, odds_format: str = 'decimal') -> float:
        """
        Convert odds value to implied probability (0.0 to 1.0).
        
        Args:
            odds_value: The odds value
            odds_format: Format of odds ('decimal', 'american')
            
        Returns:
            Implied probability between 0.0 and 1.0
        """
        try:
            if odds_format == 'decimal':
                # Decimal odds: probability = 1 / decimal_odds
                if odds_value <= 0:
                    return 0.0
                return 1.0 / odds_value
            elif odds_format == 'american':
                # American odds conversion
                if odds_value > 0:
                    # Positive American odds: probability = 100 / (odds + 100)
                    return 100.0 / (odds_value + 100)
                elif odds_value < 0:
                    # Negative American odds: probability = -odds / (-odds + 100)
                    return -odds_value / (-odds_value + 100)
                else:
                    return 0.0
            else:
                logger.warning(f"Unsupported odds format: {odds_format}")
                return 0.0
                
        except Exception as e:
            logger.warning(f"Error converting odds {odds_value}: {e}")
            return 0.0
    
    def extract_team_odds(self, outcomes: List[Dict[str, Any]], team_name: str) -> Optional[float]:
        """
        Extract odds for a specific team from outcomes array.
        
        Args:
            outcomes: List of outcome dictionaries
            team_name: Team name to find odds for
            
        Returns:
            Odds value or None if not found
        """
        try:
            for outcome in outcomes:
                if outcome.get('name', '').lower() == team_name.lower():
                    return outcome.get('price')
            return None
        except Exception as e:
            logger.warning(f"Error extracting odds for {team_name}: {e}")
            return None
    
    def build_odds_features(self, sport_key: str) -> pd.DataFrame:
        """
        Build engineered features from historical odds data.
        
        Args:
            sport_key: Sport key to process
            
        Returns:
            Pandas DataFrame with engineered features
        """
        try:
            logger.info(f"Building odds features for {sport_key}")
            
            # Step 1: Fetch data
            raw_data = self.fetch_historical_data(sport_key)
            if not raw_data:
                logger.warning(f"No raw data found for {sport_key}")
                return pd.DataFrame()
            
            # Step 2: Load into Pandas
            df = pd.DataFrame(raw_data)
            logger.info(f"Loaded {len(df)} records into DataFrame")
            
            # Extract event data from nested structure
            if 'events' in df.columns:
                # Expand event data
                event_df = pd.json_normalize(df['events'])
                event_df.columns = [f'event_{col}' for col in event_df.columns]
                df = pd.concat([df.drop('events', axis=1), event_df], axis=1)
            
            # Convert timestamp columns to datetime
            df['last_update'] = pd.to_datetime(df['last_update'])
            df['event_commence_time'] = pd.to_datetime(df['event_commence_time'])
            df['recorded_at'] = pd.to_datetime(df['recorded_at'])
            
            # Step 3: Calculate features
            
            # Feature 1: time_to_commence (hours between odds update and event start)
            df['time_to_commence'] = (df['event_commence_time'] - df['last_update']).dt.total_seconds() / 3600
            
            # Feature 2: Extract team odds from outcomes
            df['home_odds'] = df.apply(
                lambda row: self.extract_team_odds(row['outcomes'], row['event_home_team']), 
                axis=1
            )
            df['away_odds'] = df.apply(
                lambda row: self.extract_team_odds(row['outcomes'], row['event_away_team']), 
                axis=1
            )
            
            # Feature 3: Convert odds to implied probabilities
            df['home_implied_prob'] = df['home_odds'].apply(
                lambda x: self.convert_odds_to_implied_probability(x) if x is not None else 0.0
            )
            df['away_implied_prob'] = df['away_odds'].apply(
                lambda x: self.convert_odds_to_implied_probability(x) if x is not None else 0.0
            )
            
            # Feature 4: Calculate line movements (probability changes over time)
            # Group by event and bookmaker to calculate movement
            df['home_line_movement'] = 0.0
            df['away_line_movement'] = 0.0
            
            for (event_id, bookmaker_key), group in df.groupby(['event_id', 'bookmaker_key']):
                # Sort by recorded time to calculate movement from earliest to latest
                group_sorted = group.sort_values('recorded_at')
                
                if len(group_sorted) > 1:
                    # Calculate movement between first and last probability
                    first_home_prob = group_sorted.iloc[0]['home_implied_prob']
                    last_home_prob = group_sorted.iloc[-1]['home_implied_prob']
                    first_away_prob = group_sorted.iloc[0]['away_implied_prob']
                    last_away_prob = group_sorted.iloc[-1]['away_implied_prob']
                    
                    home_movement = last_home_prob - first_home_prob
                    away_movement = last_away_prob - first_away_prob
                    
                    # Update the original dataframe indices
                    df.loc[group_sorted.index, 'home_line_movement'] = home_movement
                    df.loc[group_sorted.index, 'away_line_movement'] = away_movement
            
            # Step 4: Clean data
            # Drop rows with missing crucial data
            initial_count = len(df)
            
            # Remove rows with no odds data
            df = df.dropna(subset=['home_odds', 'away_odds'])
            
            # Remove rows with invalid probabilities
            df = df[(df['home_implied_prob'] > 0) & (df['away_implied_prob'] > 0)]
            
            # Remove rows with negative time to commence (odds after event started)
            df = df[df['time_to_commence'] > 0]
            
            # Remove rows with extreme values (potential data errors)
            df = df[df['time_to_commence'] <= 168]  # Max 1 week before event
            
            final_count = len(df)
            logger.info(f"Cleaned data: {initial_count} -> {final_count} rows ({final_count/initial_count:.1%} retained)")
            
            # Select and reorder final columns
            feature_columns = [
                'event_id', 'event_home_team', 'event_away_team', 'event_commence_time',
                'bookmaker_key', 'market_key', 'last_update', 'recorded_at',
                'time_to_commence', 'home_odds', 'away_odds',
                'home_implied_prob', 'away_implied_prob',
                'home_line_movement', 'away_line_movement'
            ]
            
            # Only include columns that exist
            available_columns = [col for col in feature_columns if col in df.columns]
            df_clean = df[available_columns].copy()
            
            logger.info(f"Feature engineering completed for {sport_key}")
            logger.info(f"Final DataFrame shape: {df_clean.shape}")
            logger.info(f"Features created: {len(df_clean.columns)} columns")
            
            return df_clean
            
        except Exception as e:
            logger.error(f"Error building odds features: {e}")
            return pd.DataFrame()
    
    def get_feature_summary(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Generate a summary of the engineered features.
        
        Args:
            df: DataFrame with engineered features
            
        Returns:
            Dictionary with feature statistics
        """
        try:
            if df.empty:
                return {"error": "Empty DataFrame"}
            
            summary = {
                "total_records": len(df),
                "unique_events": df['event_id'].nunique() if 'event_id' in df.columns else 0,
                "unique_bookmakers": df['bookmaker_key'].nunique() if 'bookmaker_key' in df.columns else 0,
                "date_range": {
                    "start": df['recorded_at'].min().isoformat() if 'recorded_at' in df.columns else None,
                    "end": df['recorded_at'].max().isoformat() if 'recorded_at' in df.columns else None
                },
                "feature_stats": {}
            }
            
            # Statistics for key numeric features
            numeric_features = ['time_to_commence', 'home_implied_prob', 'away_implied_prob', 
                             'home_line_movement', 'away_line_movement']
            
            for feature in numeric_features:
                if feature in df.columns:
                    summary["feature_stats"][feature] = {
                        "mean": float(df[feature].mean()),
                        "std": float(df[feature].std()),
                        "min": float(df[feature].min()),
                        "max": float(df[feature].max()),
                        "median": float(df[feature].median())
                    }
            
            return summary
            
        except Exception as e:
            logger.error(f"Error generating feature summary: {e}")
            return {"error": str(e)}


# Singleton instance for easy import
feature_engineering_service = FeatureEngineeringService()
