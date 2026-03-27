"""
Machine Learning Training Demo

This script demonstrates the complete ML pipeline:
1. Build features from historical odds data
2. Fetch game results and merge with features
3. Train a Random Forest classifier
4. Evaluate model performance and feature importances

Usage:
    python demo_ml_training.py
"""

import logging
import pandas as pd
from services.feature_engineering import feature_engineering_service
from services.ml_service import ml_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def demo_ml_training():
    """
    Demonstrate the complete ML training pipeline.
    """
    logger.info("🚀 Starting ML Training Demo")
    
    # Test sport - you can change this to 'americanfootball_nfl' as well
    sport_key = 'basketball_nba'
    logger.info(f"Processing sport: {sport_key}")
    
    try:
        # Step 1: Build engineered features
        logger.info("=== Step 1: Building Features ===")
        df_features = feature_engineering_service.build_odds_features(sport_key)
        
        if df_features.empty:
            logger.error("❌ No features were generated")
            return
        
        logger.info(f"✅ Features built: {df_features.shape[0]} rows, {df_features.shape[1]} columns")
        print(f"\nFeature DataFrame Shape: {df_features.shape}")
        print("Sample features:")
        print(df_features[['event_id', 'event_home_team', 'event_away_team', 
                         'home_implied_prob', 'away_implied_prob', 'time_to_commence']].head())
        
        # Step 2: Fetch results and merge
        logger.info("=== Step 2: Merging Game Results ===")
        df_merged = ml_service.fetch_results_and_merge(sport_key, df_features)
        
        if df_merged.empty:
            logger.error("❌ No merged data available")
            return
        
        logger.info(f"✅ Results merged: {df_merged.shape[0]} rows with outcomes")
        print(f"\nMerged DataFrame Shape: {df_merged.shape}")
        print("Target variable distribution:")
        print(df_merged['home_team_won'].value_counts())
        
        # Step 3: Train the model
        logger.info("=== Step 3: Training Random Forest Model ===")
        model_results = ml_service.train_model(df_merged)
        
        if not model_results:
            logger.error("❌ Model training failed")
            return
        
        logger.info("✅ Model trained successfully")
        
        # Step 4: Display results
        logger.info("=== Step 4: Model Evaluation Results ===")
        
        # Display accuracy
        accuracy = model_results.get('accuracy', 0)
        print(f"\n🎯 Model Accuracy: {accuracy:.3f} ({accuracy*100:.1f}%)")
        
        # Display feature importances
        feature_importances = model_results.get('feature_importances')
        if feature_importances is not None:
            print(f"\n📊 Feature Importances (Top 10):")
            for idx, (_, row) in enumerate(feature_importances.head(10).iterrows(), 1):
                importance_pct = row['importance'] * 100
                print(f"  {idx:2d}. {row['feature']:<20} {importance_pct:5.1f}%")
        
        # Display classification report
        class_report = model_results.get('classification_report')
        if class_report:
            print(f"\n📈 Classification Performance:")
            print(f"  Precision (Home Win): {class_report.get('1', {}).get('precision', 0):.3f}")
            print(f"  Recall (Home Win):    {class_report.get('1', {}).get('recall', 0):.3f}")
            print(f"  F1-Score (Home Win):  {class_report.get('1', {}).get('f1-score', 0):.3f}")
            print(f"  Precision (Away Win): {class_report.get('0', {}).get('precision', 0):.3f}")
            print(f"  Recall (Away Win):    {class_report.get('0', {}).get('recall', 0):.3f}")
            print(f"  F1-Score (Away Win):  {class_report.get('0', {}).get('f1-score', 0):.3f}")
        
        # Display confusion matrix
        conf_matrix = model_results.get('confusion_matrix')
        if conf_matrix is not None:
            print(f"\n🔢 Confusion Matrix:")
            print(f"  Predicted →  Away Win  Home Win")
            print(f"  Actual ↓")
            print(f"  Away Win     {conf_matrix[0][0]:6d}  {conf_matrix[0][1]:6d}")
            print(f"  Home Win     {conf_matrix[1][0]:6d}  {conf_matrix[1][1]:6d}")
        
        # Display model summary
        model_summary = ml_service.get_model_summary(model_results)
        print(f"\n{model_summary}")
        
        # Step 5: Demonstrate prediction on sample data
        logger.info("=== Step 5: Sample Predictions ===")
        
        # Get a few sample games for prediction demo
        sample_games = df_merged.head(3)
        if not sample_games.empty:
            model_key = model_results.get('model_key')
            if model_key:
                # Prepare features for prediction (exclude target and result columns)
                feature_columns = model_results.get('feature_columns', [])
                sample_features = sample_games[feature_columns]
                
                predictions = ml_service.predict_game_outcome(model_key, sample_features)
                
                if predictions:
                    print(f"\n🔮 Sample Predictions:")
                    for idx, (game_idx, game) in enumerate(sample_games.iterrows(), 1):
                        pred = predictions['predictions'][idx-1]
                        probs = predictions['probabilities'][idx-1]
                        
                        home_team = game.get('event_home_team', 'Unknown')
                        away_team = game.get('event_away_team', 'Unknown')
                        actual = game.get('home_team_won', 'Unknown')
                        
                        result = "Home Win" if pred == 1 else "Away Win"
                        confidence = max(probs) * 100
                        
                        print(f"  Game {idx}: {home_team} vs {away_team}")
                        print(f"    Prediction: {result} (Confidence: {confidence:.1f}%)")
                        print(f"    Actual: {'Home Win' if actual == 1 else 'Away Win'}")
                        print(f"    Probabilities: Away {probs[0]:.2f} | Home {probs[1]:.2f}")
        
        logger.info("✅ ML Training Demo Completed Successfully")
        
        return model_results
        
    except Exception as e:
        logger.error(f"❌ Demo failed: {e}")
        logger.exception("Full error traceback:")
        raise


def compare_model_performance():
    """
    Compare model performance across different sports.
    """
    logger.info("=== Comparing Model Performance Across Sports ===")
    
    sports = ['basketball_nba', 'americanfootball_nfl']
    results = {}
    
    for sport in sports:
        logger.info(f"\nProcessing {sport}...")
        try:
            # Build features
            df_features = feature_engineering_service.build_odds_features(sport)
            if df_features.empty:
                logger.warning(f"No features available for {sport}")
                continue
            
            # Merge results
            df_merged = ml_service.fetch_results_and_merge(sport, df_features)
            if df_merged.empty:
                logger.warning(f"No merged data available for {sport}")
                continue
            
            # Train model
            model_results = ml_service.train_model(df_merged)
            if model_results:
                results[sport] = {
                    'accuracy': model_results.get('accuracy', 0),
                    'samples': len(df_merged),
                    'features': len(model_results.get('feature_columns', []))
                }
                
                print(f"\n{sport.upper()}:")
                print(f"  Accuracy: {model_results.get('accuracy', 0):.3f}")
                print(f"  Samples: {len(df_merged)}")
                print(f"  Features: {len(model_results.get('feature_columns', []))}")
                
                # Show top feature
                feature_importances = model_results.get('feature_importances')
                if feature_importances is not None and not feature_importances.empty:
                    top_feature = feature_importances.iloc[0]
                    print(f"  Top Feature: {top_feature['feature']} ({top_feature['importance']:.3f})")
            else:
                logger.warning(f"Model training failed for {sport}")
                
        except Exception as e:
            logger.error(f"Error processing {sport}: {e}")
    
    # Summary comparison
    if results:
        print(f"\n🏆 Performance Summary:")
        for sport, metrics in results.items():
            print(f"  {sport.upper()}: {metrics['accuracy']:.3f} accuracy "
                  f"({metrics['samples']} samples, {metrics['features']} features)")


if __name__ == "__main__":
    # Run the main demo
    model_results = demo_ml_training()
    
    # Optional: Uncomment to compare multiple sports
    # compare_model_performance()
