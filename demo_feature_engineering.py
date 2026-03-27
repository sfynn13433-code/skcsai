"""
Feature Engineering Demo

This script demonstrates the feature engineering service by building
predictive features from historical odds data and displaying the results.

Usage:
    python demo_feature_engineering.py
"""

import logging
import pandas as pd
from services.feature_engineering import feature_engineering_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def demo_feature_engineering():
    """
    Demonstrate the feature engineering service.
    """
    logger.info("🚀 Starting Feature Engineering Demo")
    
    # Test sport - you can change this to 'americanfootball_nfl' as well
    sport_key = 'basketball_nba'
    logger.info(f"Processing sport: {sport_key}")
    
    try:
        # Step 1: Build features
        logger.info("=== Building Features ===")
        df = feature_engineering_service.build_odds_features(sport_key)
        
        if df.empty:
            logger.error("❌ No features were generated")
            return
        
        logger.info("✅ Features successfully built")
        
        # Step 2: Display basic info
        logger.info("=== DataFrame Info ===")
        print(f"\nDataFrame Shape: {df.shape}")
        print(f"Columns: {list(df.columns)}")
        
        # Step 3: Display first few rows
        logger.info("=== Sample Data (First 5 Rows) ===")
        print("\nFirst 5 rows:")
        print(df.head())
        
        # Step 4: Display data types and missing values
        logger.info("=== DataFrame Structure ===")
        print("\nDataFrame Info:")
        df.info()
        
        # Step 5: Display feature statistics
        logger.info("=== Feature Statistics ===")
        numeric_columns = df.select_dtypes(include=['number']).columns
        if len(numeric_columns) > 0:
            print("\nNumeric Feature Statistics:")
            print(df[numeric_columns].describe())
        
        # Step 6: Display feature summary
        logger.info("=== Feature Summary ===")
        summary = feature_engineering_service.get_feature_summary(df)
        
        print("\nFeature Summary:")
        print(f"Total Records: {summary.get('total_records', 'N/A')}")
        print(f"Unique Events: {summary.get('unique_events', 'N/A')}")
        print(f"Unique Bookmakers: {summary.get('unique_bookmakers', 'N/A')}")
        
        if 'date_range' in summary:
            date_range = summary['date_range']
            print(f"Date Range: {date_range.get('start', 'N/A')} to {date_range.get('end', 'N/A')}")
        
        # Step 7: Display specific feature insights
        logger.info("=== Feature Insights ===")
        
        if 'home_implied_prob' in df.columns and 'away_implied_prob' in df.columns:
            avg_home_prob = df['home_implied_prob'].mean()
            avg_away_prob = df['away_implied_prob'].mean()
            print(f"\nAverage Implied Probabilities:")
            print(f"  Home Team: {avg_home_prob:.3f} ({avg_home_prob*100:.1f}%)")
            print(f"  Away Team: {avg_away_prob:.3f} ({avg_away_prob*100:.1f}%)")
        
        if 'time_to_commence' in df.columns:
            avg_time = df['time_to_commence'].mean()
            print(f"\nAverage Time to Commence: {avg_time:.1f} hours")
        
        if 'home_line_movement' in df.columns and 'away_line_movement' in df.columns:
            avg_home_movement = df['home_line_movement'].abs().mean()
            avg_away_movement = df['away_line_movement'].abs().mean()
            print(f"\nAverage Line Movement (absolute):")
            print(f"  Home Team: {avg_home_movement:.3f} ({avg_home_movement*100:.1f}% points)")
            print(f"  Away Team: {avg_away_movement:.3f} ({avg_away_movement*100:.1f}% points)")
        
        # Step 8: Show sample events
        logger.info("=== Sample Events ===")
        if 'event_id' in df.columns:
            print(f"\nSample Events (Top 3):")
            sample_events = df.groupby('event_id').first().head(3)
            for idx, (event_id, event_data) in enumerate(sample_events.iterrows(), 1):
                print(f"\n  Event {idx}: {event_id}")
                print(f"    Teams: {event_data.get('event_home_team', 'N/A')} vs {event_data.get('event_away_team', 'N/A')}")
                print(f"    Commence Time: {event_data.get('event_commence_time', 'N/A')}")
                print(f"    Bookmakers: {df[df['event_id'] == event_id]['bookmaker_key'].nunique()}")
                print(f"    Odds Snapshots: {len(df[df['event_id'] == event_id])}")
        
        logger.info("✅ Feature Engineering Demo Completed Successfully")
        
    except Exception as e:
        logger.error(f"❌ Demo failed: {e}")
        logger.exception("Full error traceback:")
        raise


def compare_sports():
    """
    Compare feature engineering results across multiple sports.
    """
    logger.info("=== Comparing Multiple Sports ===")
    
    sports = ['basketball_nba', 'americanfootball_nfl']
    
    for sport in sports:
        logger.info(f"\nProcessing {sport}...")
        try:
            df = feature_engineering_service.build_odds_features(sport)
            if not df.empty:
                summary = feature_engineering_service.get_feature_summary(df)
                print(f"\n{sport.upper()}:")
                print(f"  Records: {summary.get('total_records', 0)}")
                print(f"  Events: {summary.get('unique_events', 0)}")
                print(f"  Bookmakers: {summary.get('unique_bookmakers', 0)}")
                
                # Show key feature stats if available
                if 'feature_stats' in summary and 'home_implied_prob' in summary['feature_stats']:
                    stats = summary['feature_stats']['home_implied_prob']
                    print(f"  Avg Home Implied Prob: {stats.get('mean', 0):.3f}")
            else:
                print(f"\n{sport.upper()}: No data available")
                
        except Exception as e:
            logger.error(f"Error processing {sport}: {e}")


if __name__ == "__main__":
    # Run the main demo
    demo_feature_engineering()
    
    # Optional: Uncomment to compare multiple sports
    # compare_sports()
