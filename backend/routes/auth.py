"""
Authentication and Subscription Management Routes
Handles tier selection with auth bypass for test emails
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

auth_bp = Blueprint('auth', __name__, url_prefix='/api')

# Test emails that bypass payment
TEST_EMAILS = ['sfynn13433@gmail.com', 'sfynn450@gmail.com']

@auth_bp.route('/select-plan', methods=['POST'])
def select_plan():
    """
    Select a subscription plan
    Body:
    {
        'user_email': 'user@example.com',
        'tier_id': 'core_4day_sprint' (or any valid tier ID),
        'payment_token': 'stripe_token' (optional - not needed for test emails)
    }
    """
    try:
        data = request.get_json()
        user_email = data.get('user_email')
        tier_id = data.get('tier_id')
        payment_token = data.get('payment_token')
        
        if not user_email or not tier_id:
            return jsonify({'error': 'user_email and tier_id required'}), 400
        
        # Check if user is in test email list (bypass payment)
        if user_email in TEST_EMAILS:
            # Direct grant access
            return grant_tier_access(user_email, tier_id)
        
        # For non-test users, would normally process payment here
        # For now, return payment required
        return jsonify({
            'success': False,
            'requires_payment': True,
            'message': 'Payment processing not yet implemented',
            'tier_id': tier_id
        }), 402
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def grant_tier_access(user_email, tier_id):
    """Grant a user access to a subscription tier"""
    try:
        from backend.subscription_tiers import get_tier_by_id
        
        tier = get_tier_by_id(tier_id)
        if not tier:
            return jsonify({'error': 'Invalid tier ID'}), 400
        
        # Calculate expiration date
        now = datetime.now(timezone.utc)
        expiration = now + timedelta(days=tier['duration_days'])
        
        # Check if user already has a subscription
        existing = supabase.table('user_subscriptions').select('*').eq('email', user_email).execute()
        
        subscription_data = {
            'email': user_email,
            'tier_id': tier_id,
            'tier_name': tier['name'],
            'tier_type': tier['tier'],
            'duration_days': tier['duration_days'],
            'price': tier['price'],
            'activated_at': now.isoformat(),
            'expires_at': expiration.isoformat(),
            'is_active': True
        }
        
        if existing.data:
            # Update existing subscription
            supabase.table('user_subscriptions').update(subscription_data).eq('email', user_email).execute()
        else:
            # Create new subscription
            supabase.table('user_subscriptions').insert(subscription_data).execute()
        
        return jsonify({
            'success': True,
            'message': f'Access granted to {tier["name"]}',
            'tier_id': tier_id,
            'tier_name': tier['name'],
            'expires_at': expiration.isoformat(),
            'is_test_user': True
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/subscription/status', methods=['GET'])
def get_subscription_status():
    """
    Get current subscription status for a user
    Query params:
    - email: user email (required)
    """
    try:
        email = request.args.get('email')
        
        if not email:
            return jsonify({'error': 'email required'}), 400
        
        # Fetch subscription
        response = supabase.table('user_subscriptions').select('*').eq('email', email).execute()
        
        if not response.data:
            return jsonify({
                'has_subscription': False,
                'tier_id': None,
                'message': 'No active subscription'
            }), 200
        
        sub = response.data[0]
        
        # Check if expired
        expires_at = sub.get('expires_at')
        is_active = sub.get('is_active', False)
        
        if expires_at:
            expiration = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
            now = datetime.now(timezone.utc)
            if expiration < now:
                is_active = False
        
        return jsonify({
            'has_subscription': is_active,
            'tier_id': sub.get('tier_id'),
            'tier_name': sub.get('tier_name'),
            'tier_type': sub.get('tier_type'),
            'activated_at': sub.get('activated_at'),
            'expires_at': sub.get('expires_at'),
            'is_active': is_active
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/subscription/cancel', methods=['POST'])
def cancel_subscription():
    """
    Cancel a user's subscription
    Body:
    {
        'user_email': 'user@example.com'
    }
    """
    try:
        data = request.get_json()
        user_email = data.get('user_email')
        
        if not user_email:
            return jsonify({'error': 'user_email required'}), 400
        
        # Deactivate subscription
        supabase.table('user_subscriptions').update({'is_active': False}).eq('email', user_email).execute()
        
        return jsonify({
            'success': True,
            'message': 'Subscription cancelled'
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/subscription/upgrade', methods=['POST'])
def upgrade_subscription():
    """
    Upgrade a user's subscription to a different tier
    Body:
    {
        'user_email': 'user@example.com',
        'new_tier_id': 'elite_30day_deep_vip'
    }
    """
    try:
        data = request.get_json()
        user_email = data.get('user_email')
        new_tier_id = data.get('new_tier_id')
        
        if not user_email or not new_tier_id:
            return jsonify({'error': 'user_email and new_tier_id required'}), 400
        
        # Check if user is test email (bypass payment)
        if user_email in TEST_EMAILS:
            return grant_tier_access(user_email, new_tier_id)
        
        # For non-test users, would normally process payment
        return jsonify({
            'success': False,
            'requires_payment': True,
            'message': 'Payment processing not yet implemented'
        }), 402
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/test-emails', methods=['GET'])
def get_test_emails():
    """Get list of test emails (for debugging only)"""
    return jsonify({
        'test_emails': TEST_EMAILS,
        'message': 'These emails bypass payment for testing'
    }), 200
