"""
Accuracy Center API Routes
Handles live accuracy tracking and performance metrics
"""
from flask import Blueprint, request, jsonify
from datetime import datetime, timezone, timedelta
import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

# Load environment
env_path = Path(__file__).parent.parent.parent / 'backend' / 'scripts' / '.env'
load_dotenv(env_path)

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

accuracy_bp = Blueprint('accuracy', __name__, url_prefix='/api')

@accuracy_bp.route('/accuracy/overall', methods=['GET'])
def get_overall_accuracy():
    """
    Calculate overall accuracy from resolved predictions
    Returns: Overall %, Normal System %, Deep System %
    """
    try:
        # Fetch resolved predictions (those with outcomes recorded)
        response = supabase.table('predictions_resolved').select('*').execute()
        resolved = response.data or []
        
        if not resolved:
            return jsonify({
                'overall_accuracy': 0,
                'normal_system': 0,
                'deep_system': 0,
                'total_predictions': 0,
                'total_wins': 0
            }), 200
        
        # Categorize by system type
        normal_preds = [p for p in resolved if p.get('system_type') == 'normal']
        deep_preds = [p for p in resolved if p.get('system_type') == 'deep']
        
        # Calculate wins
        normal_wins = len([p for p in normal_preds if p.get('outcome') == 'win'])
        deep_wins = len([p for p in deep_preds if p.get('outcome') == 'win'])
        total_wins = normal_wins + deep_wins
        
        # Calculate percentages
        normal_accuracy = (normal_wins / len(normal_preds) * 100) if normal_preds else 0
        deep_accuracy = (deep_wins / len(deep_preds) * 100) if deep_preds else 0
        overall_accuracy = (total_wins / len(resolved) * 100) if resolved else 0
        
        return jsonify({
            'overall_accuracy': round(overall_accuracy, 1),
            'normal_system': round(normal_accuracy, 1),
            'deep_system': round(deep_accuracy, 1),
            'total_predictions': len(resolved),
            'total_wins': total_wins,
            'normal_predictions': len(normal_preds),
            'deep_predictions': len(deep_preds)
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@accuracy_bp.route('/accuracy/by-sport', methods=['GET'])
def get_accuracy_by_sport():
    """Get accuracy breakdown by sport"""
    try:
        response = supabase.table('predictions_resolved').select('*').execute()
        resolved = response.data or []
        
        # Group by sport
        by_sport = {}
        for pred in resolved:
            matches = pred.get('matches', [])
            if matches:
                sport = matches[0].get('sport', 'unknown')
                if sport not in by_sport:
                    by_sport[sport] = {'total': 0, 'wins': 0}
                
                by_sport[sport]['total'] += 1
                if pred.get('outcome') == 'win':
                    by_sport[sport]['wins'] += 1
        
        # Calculate percentages
        result = {}
        for sport, data in by_sport.items():
            accuracy = (data['wins'] / data['total'] * 100) if data['total'] > 0 else 0
            result[sport] = {
                'accuracy': round(accuracy, 1),
                'wins': data['wins'],
                'total': data['total']
            }
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@accuracy_bp.route('/accuracy/weekly-performance', methods=['GET'])
def get_weekly_performance():
    """Get weekly performance data for the last 4 weeks"""
    try:
        response = supabase.table('predictions_resolved').select('*').execute()
        resolved = response.data or []
        
        # Group by week
        weeks = {}
        now = datetime.now(timezone.utc)
        
        for pred in resolved:
            resolved_at = pred.get('resolved_at')
            if not resolved_at:
                continue
            
            try:
                resolved_date = datetime.fromisoformat(resolved_at.replace('Z', '+00:00'))
                week_start = resolved_date - timedelta(days=resolved_date.weekday())
                week_key = week_start.strftime('%Y-W%W')
                
                if week_key not in weeks:
                    weeks[week_key] = {'total': 0, 'wins': 0}
                
                weeks[week_key]['total'] += 1
                if pred.get('outcome') == 'win':
                    weeks[week_key]['wins'] += 1
            except:
                continue
        
        # Calculate percentages
        result = {}
        for week, data in sorted(weeks.items())[-4:]:  # Last 4 weeks
            accuracy = (data['wins'] / data['total'] * 100) if data['total'] > 0 else 0
            result[week] = {
                'accuracy': round(accuracy, 1),
                'wins': data['wins'],
                'total': data['total']
            }
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@accuracy_bp.route('/accuracy/missed-reasons', methods=['GET'])
def get_missed_reasons():
    """Get reasons why predictions missed (losses)"""
    try:
        response = supabase.table('predictions_resolved').select('*').execute()
        resolved = response.data or []
        
        # Filter losses with reasons
        losses = [p for p in resolved if p.get('outcome') == 'loss']
        
        # Group by reason
        reasons = {}
        for loss in losses:
            reason = loss.get('loss_reason', 'Unknown')
            reasons[reason] = reasons.get(reason, 0) + 1
        
        # Sort by frequency
        sorted_reasons = sorted(reasons.items(), key=lambda x: x[1], reverse=True)
        
        return jsonify({
            'total_losses': len(losses),
            'reasons': [{'reason': r[0], 'count': r[1]} for r in sorted_reasons]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@accuracy_bp.route('/accuracy/log-outcome', methods=['POST'])
def log_prediction_outcome():
    """
    Log the outcome of a resolved prediction
    Body:
    {
        'prediction_id': 'uuid',
        'outcome': 'win' or 'loss',
        'loss_reason': 'Red card' | 'Injury' | 'Weather' | etc (optional),
        'system_type': 'normal' or 'deep'
    }
    """
    try:
        data = request.get_json()
        
        prediction_id = data.get('prediction_id')
        outcome = data.get('outcome')
        loss_reason = data.get('loss_reason')
        system_type = data.get('system_type', 'normal')
        
        if not prediction_id or outcome not in ['win', 'loss']:
            return jsonify({'error': 'Invalid input'}), 400
        
        # Create resolved record
        resolved_record = {
            'prediction_id': prediction_id,
            'outcome': outcome,
            'loss_reason': loss_reason,
            'system_type': system_type,
            'resolved_at': datetime.now(timezone.utc).isoformat()
        }
        
        # Insert into predictions_resolved table
        supabase.table('predictions_resolved').insert(resolved_record).execute()
        
        return jsonify({
            'success': True,
            'message': f'Prediction logged as {outcome}'
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@accuracy_bp.route('/accuracy/dashboard', methods=['GET'])
def get_accuracy_dashboard():
    """Get complete accuracy dashboard data"""
    try:
        # Get overall stats
        overall_response = supabase.table('predictions_resolved').select('*').execute()
        resolved = overall_response.data or []
        
        if not resolved:
            return jsonify({
                'overall_accuracy': 0,
                'normal_system': 0,
                'deep_system': 0,
                'by_sport': {},
                'weekly_performance': {},
                'missed_reasons': [],
                'total_predictions': 0
            }), 200
        
        # Calculate overall
        normal_preds = [p for p in resolved if p.get('system_type') == 'normal']
        deep_preds = [p for p in resolved if p.get('system_type') == 'deep']
        
        normal_wins = len([p for p in normal_preds if p.get('outcome') == 'win'])
        deep_wins = len([p for p in deep_preds if p.get('outcome') == 'win'])
        total_wins = normal_wins + deep_wins
        
        normal_accuracy = (normal_wins / len(normal_preds) * 100) if normal_preds else 0
        deep_accuracy = (deep_wins / len(deep_preds) * 100) if deep_preds else 0
        overall_accuracy = (total_wins / len(resolved) * 100) if resolved else 0
        
        # By sport
        by_sport = {}
        for pred in resolved:
            matches = pred.get('matches', [])
            if matches:
                sport = matches[0].get('sport', 'unknown')
                if sport not in by_sport:
                    by_sport[sport] = {'total': 0, 'wins': 0}
                by_sport[sport]['total'] += 1
                if pred.get('outcome') == 'win':
                    by_sport[sport]['wins'] += 1
        
        sport_accuracy = {}
        for sport, data in by_sport.items():
            acc = (data['wins'] / data['total'] * 100) if data['total'] > 0 else 0
            sport_accuracy[sport] = round(acc, 1)
        
        # Missed reasons
        losses = [p for p in resolved if p.get('outcome') == 'loss']
        reasons = {}
        for loss in losses:
            reason = loss.get('loss_reason', 'Unknown')
            reasons[reason] = reasons.get(reason, 0) + 1
        
        sorted_reasons = sorted(reasons.items(), key=lambda x: x[1], reverse=True)
        
        return jsonify({
            'overall_accuracy': round(overall_accuracy, 1),
            'normal_system': round(normal_accuracy, 1),
            'deep_system': round(deep_accuracy, 1),
            'by_sport': sport_accuracy,
            'missed_reasons': [{'reason': r[0], 'count': r[1]} for r in sorted_reasons],
            'total_predictions': len(resolved),
            'total_wins': total_wins
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
