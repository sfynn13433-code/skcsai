"""
Live Prediction Dashboard

This script fetches upcoming games, processes them through the feature engineering
pipeline, and uses the trained ML model to predict winners.

Usage:
    python predict_upcoming.py
"""

import logging
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple

from services.odds_api_service import odds_service
from services.feature_engineering import feature_engineering_service
from services.ml_service import ml_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PredictionDashboard:
    """
    Dashboard for generating live predictions on upcoming games.
    """
    
    def __init__(self):
        self.odds_service = odds_service
        self.feature_service = feature_engineering_service
        self.ml_service = ml_service
        logger.info("PredictionDashboard initialized")
    
    def get_upcoming_games(self, sport_key: str) -> List[Dict[str, Any]]:
        """
        Fetch upcoming games for a specific sport.
        
        Args:
            sport_key: Sport to fetch games for
            
        Returns:
            List of upcoming games with odds
        """
        try:
            logger.info(f"Fetching upcoming games for {sport_key}")
            
            # Get current event odds (upcoming games)
            events = self.odds_service.get_event_odds(sport_key)
            
            if not events:
                logger.warning(f"No upcoming games found for {sport_key}")
                return []
            
            # Filter for games that haven't started yet
            current_time = datetime.now()
            upcoming_events = []
            
            for event in events:
                if event.commence_time > current_time:
                    upcoming_events.append(event)
            
            logger.info(f"Found {len(upcoming_events)} upcoming games for {sport_key}")
            return upcoming_events
            
        except Exception as e:
            logger.error(f"Error fetching upcoming games: {e}")
            return []
    
    def convert_events_to_dataframe(self, events: List[Any]) -> pd.DataFrame:
        """
        Convert Event objects to DataFrame for feature engineering.
        
        Args:
            events: List of Event objects
            
        Returns:
            DataFrame with event data
        """
        try:
            if not events:
                return pd.DataFrame()
            
            # Convert events to list of dictionaries
            event_data = []
            for event in events:
                for bookmaker in event.bookmakers:
                    for market in bookmaker.markets:
                        # Create a record for each market/bookmaker combination
                        record = {
                            'event_id': event.id,
                            'sport_key': event.sport_key,
                            'commence_time': event.commence_time,
                            'home_team': event.home_team,
                            'away_team': event.away_team,
                            'bookmaker_key': bookmaker.key,
                            'market_key': market.key,
                            'last_update': market.last_update,
                            'outcomes': [outcome.dict() for outcome in market.outcomes],
                            'recorded_at': datetime.now()  # Current time for live predictions
                        }
                        event_data.append(record)
            
            df = pd.DataFrame(event_data)
            logger.info(f"Converted {len(events)} events to DataFrame with {len(df)} records")
            return df
            
        except Exception as e:
            logger.error(f"Error converting events to DataFrame: {e}")
            return pd.DataFrame()
    
    def engineer_live_features(self, events: List[Any]) -> pd.DataFrame:
        """
        Engineer features for live/upcoming games.
        
        Args:
            events: List of upcoming Event objects
            
        Returns:
            DataFrame with engineered features
        """
        try:
            logger.info("Engineering features for upcoming games")
            
            # Convert events to DataFrame format
            df_events = self.convert_events_to_dataframe(events)
            
            if df_events.empty:
                logger.warning("No event data to process")
                return pd.DataFrame()
            
            # Use the feature engineering service to process the data
            # We need to adapt it for live data by creating a mock structure
            # that matches what the feature engineering service expects
            
            # Create a mock structure that matches the expected format
            mock_data = []
            for _, row in df_events.iterrows():
                mock_record = {
                    'event_id': row['event_id'],
                    'event_home_team': row['home_team'],
                    'event_away_team': row['away_team'],
                    'event_commence_time': row['commence_time'],
                    'bookmaker_key': row['bookmaker_key'],
                    'market_key': row['market_key'],
                    'last_update': row['last_update'],
                    'recorded_at': row['recorded_at'],
                    'outcomes': row['outcomes']
                }
                mock_data.append(mock_record)
            
            # Create DataFrame and process with feature engineering logic
            df_mock = pd.DataFrame(mock_data)
            
            # Apply feature engineering manually (simplified for live data)
            df_features = self.apply_feature_engineering(df_mock)
            
            logger.info(f"Engineered features for {len(df_features)} records")
            return df_features
            
        except Exception as e:
            logger.error(f"Error engineering live features: {e}")
            return pd.DataFrame()
    
    def apply_feature_engineering(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Apply feature engineering to live data.
        
        Args:
            df: DataFrame with raw event data
            
        Returns:
            DataFrame with engineered features
        """
        try:
            # Convert timestamp columns
            df['last_update'] = pd.to_datetime(df['last_update'])
            df['event_commence_time'] = pd.to_datetime(df['event_commence_time'])
            df['recorded_at'] = pd.to_datetime(df['recorded_at'])
            
            # Calculate time_to_commence
            df['time_to_commence'] = (df['event_commence_time'] - df['last_update']).dt.total_seconds() / 3600
            
            # Extract team odds from outcomes
            df['home_odds'] = df.apply(
                lambda row: self.extract_team_odds(row['outcomes'], row['event_home_team']), 
                axis=1
            )
            df['away_odds'] = df.apply(
                lambda row: self.extract_team_odds(row['outcomes'], row['event_away_team']), 
                axis=1
            )
            
            # Convert odds to implied probabilities
            df['home_implied_prob'] = df['home_odds'].apply(
                lambda x: self.convert_odds_to_implied_probability(x) if x is not None else 0.0
            )
            df['away_implied_prob'] = df['away_odds'].apply(
                lambda x: self.convert_odds_to_implied_probability(x) if x is not None else 0.0
            )
            
            # For live predictions, line movement is 0 (no historical data yet)
            df['home_line_movement'] = 0.0
            df['away_line_movement'] = 0.0
            
            # Clean data
            df = df.dropna(subset=['home_odds', 'away_odds'])
            df = df[(df['home_implied_prob'] > 0) & (df['away_implied_prob'] > 0)]
            df = df[df['time_to_commence'] > 0]
            
            return df
            
        except Exception as e:
            logger.error(f"Error applying feature engineering: {e}")
            return pd.DataFrame()
    
    def extract_team_odds(self, outcomes: List[Dict[str, Any]], team_name: str) -> Optional[float]:
        """Extract odds for a specific team from outcomes."""
        try:
            for outcome in outcomes:
                if outcome.get('name', '').lower() == team_name.lower():
                    return outcome.get('price')
            return None
        except Exception:
            return None
    
    def convert_odds_to_implied_probability(self, odds_value: float) -> float:
        """Convert decimal odds to implied probability."""
        try:
            if odds_value <= 0:
                return 0.0
            return 1.0 / odds_value
        except Exception:
            return 0.0
    
    def make_predictions(self, df_features: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Make predictions on upcoming games using trained model.
        
        Args:
            df_features: DataFrame with engineered features
            
        Returns:
            List of prediction results
        """
        try:
            logger.info("Making predictions on upcoming games")
            
            if df_features.empty:
                logger.warning("No features available for prediction")
                return []
            
            # Check if we have trained models available
            if not self.ml_service.trained_models:
                logger.error("No trained models found. Run demo_ml_training.py first.")
                return []
            
            # Get the most recently trained model
            latest_model_key = max(self.ml_service.trained_models.keys())
            model_info = self.ml_service.trained_models[latest_model_key]
            model = model_info['model']
            feature_columns = model_info['feature_columns']
            
            logger.info(f"Using model: {latest_model_key}")
            
            # Prepare features for prediction
            X_pred = df_features[feature_columns].copy()
            X_pred = X_pred.fillna(0)
            
            # Make predictions
            predictions = model.predict(X_pred)
            probabilities = model.predict_proba(X_pred)
            
            # Combine predictions with original data
            results = []
            for idx, (_, row) in enumerate(df_features.iterrows()):
                pred = predictions[idx]
                probs = probabilities[idx]
                
                result = {
                    'event_id': row['event_id'],
                    'home_team': row['event_home_team'],
                    'away_team': row['event_away_team'],
                    'commence_time': row['event_commence_time'],
                    'bookmaker_key': row['bookmaker_key'],
                    'market_key': row['market_key'],
                    'predicted_winner': row['event_home_team'] if pred == 1 else row['event_away_team'],
                    'prediction_type': 'Home Win' if pred == 1 else 'Away Win',
                    'confidence': max(probs),
                    'home_win_prob': probs[1],
                    'away_win_prob': probs[0],
                    'vegas_home_prob': row['home_implied_prob'],
                    'vegas_away_prob': row['away_implied_prob'],
                    'time_to_commence': row['time_to_commence'],
                    'edge': max(probs) - max(row['home_implied_prob'], row['away_implied_prob'])
                }
                results.append(result)
            
            logger.info(f"Generated {len(results)} predictions")
            return results
            
        except Exception as e:
            logger.error(f"Error making predictions: {e}")
            return []
    
    def filter_high_value_picks(self, predictions: List[Dict[str, Any]], 
                              min_confidence: float = 0.60) -> List[Dict[str, Any]]:
        """
        Filter predictions to show only high confidence picks.
        
        Args:
            predictions: List of prediction results
            min_confidence: Minimum confidence threshold
            
        Returns:
            Filtered list of high-value predictions
        """
        try:
            high_value = [p for p in predictions if p['confidence'] >= min_confidence]
            
            logger.info(f"High-value picks: {len(high_value)}/{len(predictions)} "
                       f"({len(high_value)/len(predictions)*100:.1f}% above {min_confidence*100:.0f}% confidence)")
            
            return high_value
            
        except Exception as e:
            logger.error(f"Error filtering high-value picks: {e}")
            return []
    
    def format_dashboard_output(self, predictions: List[Dict[str, Any]], 
                               sport_key: str, show_all: bool = False) -> str:
        """
        Format predictions into a clean dashboard output.
        
        Args:
            predictions: List of prediction results
            sport_key: Sport being analyzed
            show_all: Whether to show all predictions or just high-value
            
        Returns:
            Formatted string for dashboard output
        """
        try:
            if not predictions:
                return f"\n📊 Daily Betting Dashboard - {sport_key.upper()}\n" \
                       f"{'='*50}\n" \
                       f"No predictions available.\n"
            
            # Filter for high-value picks if not showing all
            display_predictions = predictions if show_all else self.filter_high_value_picks(predictions)
            
            dashboard = []
            dashboard.append(f"📊 Daily Betting Dashboard - {sport_key.upper()}")
            dashboard.append(f"{'='*50}")
            dashboard.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            dashboard.append(f"Total Games: {len(predictions)}")
            
            if not show_all:
                dashboard.append(f"High-Value Picks (≥60% confidence): {len(display_predictions)}")
            
            dashboard.append("")
            
            if not display_predictions:
                dashboard.append("No high-confidence picks available.")
            else:
                # Sort by confidence (highest first)
                display_predictions.sort(key=lambda x: x['confidence'], reverse=True)
                
                for i, pred in enumerate(display_predictions, 1):
                    commence_time = pred['commence_time'].strftime('%m/%d %H:%M')
                    confidence_pct = pred['confidence'] * 100
                    vegas_prob = max(pred['vegas_home_prob'], pred['vegas_away_prob']) * 100
                    edge = pred['edge'] * 100
                    
                    dashboard.append(f"🎯 Pick #{i}: {pred['home_team']} vs {pred['away_team']}")
                    dashboard.append(f"   📅 Start Time: {commence_time}")
                    dashboard.append(f"   🏆 AI Prediction: {pred['predicted_winner']} ({pred['prediction_type']})")
                    dashboard.append(f"   💪 AI Confidence: {confidence_pct:.1f}%")
                    dashboard.append(f"   🎰 Vegas Implied: {vegas_prob:.1f}%")
                    dashboard.append(f"   📈 Edge vs Vegas: {edge:+.1f}%")
                    dashboard.append(f"   📊 Probabilities: Home {pred['home_win_prob']:.2f} | Away {pred['away_win_prob']:.2f}")
                    dashboard.append("")
            
            # Summary statistics
            if display_predictions:
                avg_confidence = sum(p['confidence'] for p in display_predictions) / len(display_predictions)
                avg_edge = sum(p['edge'] for p in display_predictions) / len(display_predictions)
                
                dashboard.append(f"📈 Summary Statistics:")
                dashboard.append(f"   Average Confidence: {avg_confidence*100:.1f}%")
                dashboard.append(f"   Average Edge vs Vegas: {avg_edge*100:+.1f}%")
                dashboard.append("")
            
            dashboard.append(f"{'='*50}")
            
            return "\n".join(dashboard)
            
        except Exception as e:
            logger.error(f"Error formatting dashboard output: {e}")
            return f"Error formatting dashboard: {e}"


def get_daily_predictions(sport_key: str, show_all: bool = False) -> str:
    """
    Generate daily predictions for a specific sport.
    
    Args:
        sport_key: Sport to analyze
        show_all: Whether to show all predictions or just high-value picks
        
    Returns:
        Formatted dashboard string
    """
    try:
        dashboard = PredictionDashboard()
        
        logger.info(f"Generating daily predictions for {sport_key}")
        
        # Step 1: Fetch upcoming games
        upcoming_games = dashboard.get_upcoming_games(sport_key)
        
        if not upcoming_games:
            logger.warning(f"No upcoming games found for {sport_key}")
            return dashboard.format_dashboard_output([], sport_key, show_all)
        
        # Step 2: Engineer features
        df_features = dashboard.engineer_live_features(upcoming_games)
        
        if df_features.empty:
            logger.warning("No features could be engineered")
            return dashboard.format_dashboard_output([], sport_key, show_all)
        
        # Step 3: Make predictions
        predictions = dashboard.make_predictions(df_features)
        
        if not predictions:
            logger.warning("No predictions could be generated")
            return dashboard.format_dashboard_output([], sport_key, show_all)
        
        # Step 4: Format and return dashboard
        dashboard_output = dashboard.format_dashboard_output(predictions, sport_key, show_all)
        
        logger.info(f"Successfully generated predictions for {sport_key}")
        return dashboard_output
        
    except Exception as e:
        logger.error(f"Error generating daily predictions: {e}")
        return f"Error generating predictions for {sport_key}: {e}"


def main():
    """
    Main function to run the prediction dashboard.
    """
    logger.info("🚀 Starting Live Prediction Dashboard")
    
    try:
        # Sports to analyze
        sports = ['basketball_nba', 'americanfootball_nfl']
        
        for sport in sports:
            print(f"\n{'='*60}")
            print(f"Analyzing {sport.upper()}...")
            print(f"{'='*60}")
            
            # Generate predictions
            dashboard_output = get_daily_predictions(sport, show_all=False)
            
            # Print dashboard
            print(dashboard_output)
            
            # Optional: Show all predictions if high-value picks are limited
            if "No high-confidence picks available" in dashboard_output:
                print(f"\n🔄 Showing all predictions for {sport.upper()} (no high-confidence picks):")
                all_predictions = get_daily_predictions(sport, show_all=True)
                print(all_predictions)
        
        logger.info("✅ Prediction Dashboard completed successfully")
        
    except Exception as e:
        logger.error(f"❌ Dashboard failed: {e}")
        logger.exception("Full error traceback:")
        raise


if __name__ == "__main__":
    main()
