"""
Machine Learning Service for Sports Predictions

This service handles the complete ML pipeline including:
- Fetching game results and merging with engineered features
- Training Random Forest classifiers
- Model evaluation and feature importance analysis
"""

import logging
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, Any, List, Tuple, Optional

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.preprocessing import StandardScaler

from services.feature_engineering import feature_engineering_service
from services.odds_api_service import odds_service

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MLService:
    """
    Machine Learning service for sports prediction models.
    """
    
    def __init__(self):
        self.feature_service = feature_engineering_service
        self.odds_service = odds_service
        self.trained_models = {}
        logger.info("MLService initialized")
    
    def fetch_game_results(self, sport_key: str, days_back: int = 7) -> List[Dict[str, Any]]:
        """
        Fetch recently completed games and their scores from Odds API.
        
        Args:
            sport_key: Sport to fetch results for
            days_back: Number of days to look back for completed games
            
        Returns:
            List of completed games with scores
        """
        try:
            logger.info(f"Fetching game results for {sport_key} (last {days_back} days)")
            
            # Use Odds API to get scores for completed games
            # Note: This is a simplified approach - the actual endpoint might differ
            # You may need to adjust based on the actual Odds API structure
            
            # For now, we'll simulate this by creating mock results
            # In a real implementation, you would use the actual Odds API scores endpoint
            
            logger.warning("Using mock results - implement actual Odds API scores endpoint")
            
            # Mock results for demonstration
            mock_results = [
                {
                    'id': 'mock_event_1',
                    'sport_key': sport_key,
                    'home_team': 'Lakers',
                    'away_team': 'Celtics',
                    'home_score': 105,
                    'away_score': 98,
                    'completed': True,
                    'commence_time': (datetime.now() - timedelta(days=1)).isoformat()
                },
                {
                    'id': 'mock_event_2', 
                    'sport_key': sport_key,
                    'home_team': 'Warriors',
                    'away_team': 'Heat',
                    'home_score': 112,
                    'away_score': 115,
                    'completed': True,
                    'commence_time': (datetime.now() - timedelta(days=2)).isoformat()
                }
            ]
            
            logger.info(f"Fetched {len(mock_results)} game results")
            return mock_results
            
        except Exception as e:
            logger.error(f"Error fetching game results: {e}")
            return []
    
    def determine_game_outcome(self, home_score: int, away_score: int) -> int:
        """
        Determine if the home team won (1) or lost/tied (0).
        
        Args:
            home_score: Home team score
            away_score: Away team score
            
        Returns:
            1 if home team won, 0 if lost or tied
        """
        return 1 if home_score > away_score else 0
    
    def fetch_results_and_merge(self, sport_key: str, df_features: pd.DataFrame) -> pd.DataFrame:
        """
        Fetch game results and merge with engineered features.
        
        Args:
            sport_key: Sport to process
            df_features: DataFrame with engineered features
            
        Returns:
            Merged DataFrame with target variable added
        """
        try:
            logger.info(f"Fetching and merging results for {sport_key}")
            
            if df_features.empty:
                logger.warning("Empty features DataFrame provided")
                return pd.DataFrame()
            
            # Fetch game results
            results = self.fetch_game_results(sport_key, days_back=7)
            
            if not results:
                logger.warning("No game results found")
                return df_features
            
            # Convert results to DataFrame
            df_results = pd.DataFrame(results)
            
            # Determine game outcomes
            df_results['home_team_won'] = df_results.apply(
                lambda row: self.determine_game_outcome(row['home_score'], row['away_score']), 
                axis=1
            )
            
            # Merge with features on event_id
            df_merged = df_features.merge(
                df_results[['id', 'home_team_won', 'home_score', 'away_score']],
                left_on='event_id',
                right_on='id',
                how='left'
            )
            
            # Remove rows without results (games not yet completed)
            initial_count = len(df_merged)
            df_merged = df_merged.dropna(subset=['home_team_won'])
            final_count = len(df_merged)
            
            logger.info(f"Merged results: {initial_count} -> {final_count} rows with outcomes")
            logger.info(f"Target distribution: {df_merged['home_team_won'].value_counts().to_dict()}")
            
            return df_merged
            
        except Exception as e:
            logger.error(f"Error merging results: {e}")
            return df_features
    
    def prepare_features_and_target(self, df_merged: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
        """
        Prepare features (X) and target (y) for training.
        
        Args:
            df_merged: DataFrame with features and target
            
        Returns:
            Tuple of (X, y) for ML training
        """
        try:
            logger.info("Preparing features and target variables")
            
            # Define feature columns (exclude non-numeric and target columns)
            feature_columns = [
                'time_to_commence',
                'home_implied_prob', 
                'away_implied_prob',
                'home_line_movement',
                'away_line_movement'
            ]
            
            # Filter to only include columns that exist
            available_features = [col for col in feature_columns if col in df_merged.columns]
            
            if not available_features:
                logger.error("No valid feature columns found")
                return pd.DataFrame(), pd.Series()
            
            X = df_merged[available_features].copy()
            y = df_merged['home_team_won'].copy()
            
            # Handle missing values
            X = X.fillna(0)  # Fill NaN with 0
            y = y.fillna(0)  # Fill NaN with 0
            
            logger.info(f"Features prepared: {X.shape[1]} columns, {X.shape[0]} rows")
            logger.info(f"Feature columns: {available_features}")
            logger.info(f"Target distribution: {y.value_counts().to_dict()}")
            
            return X, y
            
        except Exception as e:
            logger.error(f"Error preparing features: {e}")
            return pd.DataFrame(), pd.Series()
    
    def train_model(self, df_merged: pd.DataFrame) -> Dict[str, Any]:
        """
        Train a Random Forest classifier and evaluate performance.
        
        Args:
            df_merged: DataFrame with features and target variable
            
        Returns:
            Dictionary with model, accuracy, and feature importances
        """
        try:
            logger.info("Training Random Forest classifier")
            
            if df_merged.empty:
                logger.error("Empty DataFrame provided for training")
                return {}
            
            # Prepare features and target
            X, y = self.prepare_features_and_target(df_merged)
            
            if X.empty or y.empty:
                logger.error("Failed to prepare features and target")
                return {}
            
            # Split data into training and testing sets
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42, stratify=y
            )
            
            logger.info(f"Data split: {len(X_train)} training, {len(X_test)} testing samples")
            
            # Initialize and train Random Forest classifier
            rf_classifier = RandomForestClassifier(
                n_estimators=100,
                random_state=42,
                max_depth=10,
                min_samples_split=5,
                min_samples_leaf=2
            )
            
            rf_classifier.fit(X_train, y_train)
            
            # Make predictions on test set
            y_pred = rf_classifier.predict(X_test)
            
            # Calculate accuracy
            accuracy = accuracy_score(y_test, y_pred)
            
            # Generate classification report
            class_report = classification_report(y_test, y_pred, output_dict=True)
            
            # Extract feature importances
            feature_importances = pd.DataFrame({
                'feature': X.columns,
                'importance': rf_classifier.feature_importances_
            }).sort_values('importance', ascending=False)
            
            # Create confusion matrix
            conf_matrix = confusion_matrix(y_test, y_pred)
            
            # Store trained model
            model_key = f"rf_classifier_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            self.trained_models[model_key] = {
                'model': rf_classifier,
                'feature_columns': X.columns.tolist(),
                'accuracy': accuracy,
                'trained_at': datetime.now()
            }
            
            results = {
                'model': rf_classifier,
                'accuracy': accuracy,
                'feature_importances': feature_importances,
                'classification_report': class_report,
                'confusion_matrix': conf_matrix,
                'feature_columns': X.columns.tolist(),
                'training_samples': len(X_train),
                'testing_samples': len(X_test),
                'model_key': model_key
            }
            
            logger.info(f"Model trained successfully with accuracy: {accuracy:.3f}")
            logger.info(f"Top feature: {feature_importances.iloc[0]['feature']} "
                       f"(importance: {feature_importances.iloc[0]['importance']:.3f})")
            
            return results
            
        except Exception as e:
            logger.error(f"Error training model: {e}")
            return {}
    
    def predict_game_outcome(self, model_key: str, game_features: pd.DataFrame) -> Dict[str, Any]:
        """
        Make predictions on new game data using a trained model.
        
        Args:
            model_key: Key of the trained model to use
            game_features: DataFrame with features for prediction
            
        Returns:
            Dictionary with predictions and probabilities
        """
        try:
            if model_key not in self.trained_models:
                logger.error(f"Model {model_key} not found")
                return {}
            
            model_info = self.trained_models[model_key]
            model = model_info['model']
            feature_columns = model_info['feature_columns']
            
            # Ensure features match training data
            X_pred = game_features[feature_columns].copy()
            X_pred = X_pred.fillna(0)
            
            # Make predictions
            predictions = model.predict(X_pred)
            probabilities = model.predict_proba(X_pred)
            
            results = {
                'predictions': predictions.tolist(),
                'probabilities': probabilities.tolist(),
                'predicted_classes': model.classes_.tolist(),
                'feature_columns': feature_columns
            }
            
            return results
            
        except Exception as e:
            logger.error(f"Error making predictions: {e}")
            return {}
    
    def get_model_summary(self, model_results: Dict[str, Any]) -> str:
        """
        Generate a human-readable summary of model results.
        
        Args:
            model_results: Results from train_model method
            
        Returns:
            Formatted summary string
        """
        try:
            if not model_results:
                return "No model results available"
            
            summary = []
            summary.append("=== Model Training Summary ===")
            summary.append(f"Model Type: Random Forest Classifier")
            summary.append(f"Accuracy: {model_results.get('accuracy', 0):.3f}")
            summary.append(f"Training Samples: {model_results.get('training_samples', 0)}")
            summary.append(f"Testing Samples: {model_results.get('testing_samples', 0)}")
            
            # Feature importances
            feature_importances = model_results.get('feature_importances')
            if feature_importances is not None:
                summary.append("\n=== Feature Importances ===")
                for _, row in feature_importances.head(5).iterrows():
                    summary.append(f"{row['feature']}: {row['importance']:.3f}")
            
            # Classification report
            class_report = model_results.get('classification_report')
            if class_report:
                summary.append("\n=== Classification Performance ===")
                summary.append(f"Precision (Home Win): {class_report.get('1', {}).get('precision', 0):.3f}")
                summary.append(f"Recall (Home Win): {class_report.get('1', {}).get('recall', 0):.3f}")
                summary.append(f"F1-Score (Home Win): {class_report.get('1', {}).get('f1-score', 0):.3f}")
            
            return "\n".join(summary)
            
        except Exception as e:
            logger.error(f"Error generating model summary: {e}")
            return "Error generating summary"


# Singleton instance for easy import
ml_service = MLService()
