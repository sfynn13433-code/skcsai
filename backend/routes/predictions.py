"""
Predictions API Routes
Handles prediction data fetching with subscription tier filtering and time constraints
"""
from flask import Blueprint, request, jsonify
from datetime import datetime, timezone, timedelta
from functools import wraps
import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client
import random

# Load environment
env_path = Path(__file__).parent.parent.parent / 'backend' / 'scripts' / '.env'
load_dotenv(env_path)

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

predictions_bp = Blueprint('predictions', __name__, url_prefix='/api')

# Import subscription tiers
from backend.subscription_tiers import get_daily_allocation

def get_day_of_week():
    """Get current day of week (lowercase)"""
    days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    return days[datetime.now(timezone.utc).weekday()]

def filter_future_fixtures(predictions):
    """Filter out any fixtures that have already started or concluded"""
    now = datetime.now(timezone.utc)
    future_predictions = []
    
    for pred in predictions:
        matches = pred.get('matches', [])
        if not matches:
            continue
        
        match = matches[0]
        commence_time_str = match.get('commence_time', '')
        
        try:
            commence_time = datetime.fromisoformat(commence_time_str.replace('Z', '+00:00'))
            # Only include if match hasn't started yet
            if commence_time > now:
                future_predictions.append(pred)
        except:
            # If we can't parse the time, skip it
            continue
    
    return future_predictions

def apply_tier_limits(predictions, tier_id):
    """Apply subscription tier limits to predictions"""
    day = get_day_of_week()
    allocation = get_daily_allocation(tier_id, day)
    
    if not allocation:
        return []
    
    # Categorize predictions by type
    direct = []
    secondary = []
    multi = []
    same_match = []
    acca_6match = []
    
    for pred in predictions:
        pred_type = pred.get('type', 'single')
        
        if pred_type == 'acca' and len(pred.get('matches', [])) == 6:
            acca_6match.append(pred)
        elif pred_type == 'same_match':
            same_match.append(pred)
        elif pred_type == 'multi':
            multi.append(pred)
        elif pred_type == 'secondary':
            secondary.append(pred)
        else:  # default to direct
            direct.append(pred)
    
    # Apply limits and build result
    result = []
    result.extend(direct[:allocation['direct']])
    result.extend(secondary[:allocation['secondary']])
    result.extend(multi[:allocation['multi']])
    result.extend(same_match[:allocation['same_match']])
    result.extend(acca_6match[:allocation['acca_6match']])
    
    return result

@predictions_bp.route('/predictions', methods=['GET'])
def get_predictions():
    """
    Fetch predictions based on user's subscription tier
    Query params:
    - tier_id: subscription tier ID (required)
    """
    tier_id = request.args.get('tier_id')
    
    if not tier_id:
        return jsonify({'error': 'tier_id required'}), 400
    
    try:
        # Fetch all predictions from Supabase
        response = supabase.table('predictions_final').select('*').execute()
        predictions = response.data or []
        
        # Filter out past fixtures
        predictions = filter_future_fixtures(predictions)
        
        # Apply tier-specific limits
        predictions = apply_tier_limits(predictions, tier_id)
        
        return jsonify({
            'success': True,
            'count': len(predictions),
            'predictions': predictions,
            'day': get_day_of_week(),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@predictions_bp.route('/refresh-predictions', methods=['POST'])
def refresh_predictions():
    """
    Refresh the prediction pool by fetching fresh data from the API
    This endpoint should be called 3x daily at 04:00, 12:00, 18:00 UTC
    
    Authentication: Requires X-API-Key header with value 'skcs_refresh_key'
    """
    api_key = request.headers.get('X-API-Key')
    
    # Simple auth check
    if api_key != os.getenv('SKCS_REFRESH_KEY', 'skcs_refresh_key'):
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        # Import the live API fetcher
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent.parent))
        from fetch_live_api_fixtures import (
            fetch_fixtures_from_api, 
            create_prediction_from_fixture,
            SPORT_MAPPING
        )
        
        # Clear old predictions
        all_preds = supabase.table('predictions_final').select('id').execute()
        for pred in (all_preds.data or []):
            supabase.table('predictions_final').delete().eq('id', pred['id']).execute()
        
        # Fetch fresh predictions
        total_created = 0
        results = {}
        
        for sport_key, sport_info in SPORT_MAPPING.items():
            fixtures = fetch_fixtures_from_api(sport_key, sport_info)
            created = 0
            
            for fixture in fixtures:
                pred = create_prediction_from_fixture(fixture, sport_key, sport_info)
                if pred:
                    try:
                        supabase.table('predictions_final').insert(pred).execute()
                        created += 1
                        total_created += 1
                    except Exception as e:
                        pass
            
            results[sport_info['name']] = created
        
        return jsonify({
            'success': True,
            'total_created': total_created,
            'by_sport': results,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@predictions_bp.route('/predictions/stats', methods=['GET'])
def get_prediction_stats():
    """Get statistics about current predictions in database"""
    try:
        response = supabase.table('predictions_final').select('*').execute()
        predictions = response.data or []
        
        # Filter future only
        predictions = filter_future_fixtures(predictions)
        
        # Count by sport
        by_sport = {}
        for pred in predictions:
            matches = pred.get('matches', [])
            if matches:
                sport = matches[0].get('sport', 'unknown')
                by_sport[sport] = by_sport.get(sport, 0) + 1
        
        return jsonify({
            'total_predictions': len(predictions),
            'by_sport': by_sport,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
