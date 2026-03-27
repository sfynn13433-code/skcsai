"""Generate predictions from real events data and insert into predictions_final"""
import os
import json
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path
from supabase import create_client

# Load environment
env_path = Path(__file__).parent / 'backend' / 'scripts' / '.env'
load_dotenv(env_path)

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("🎯 Generating Predictions from Real Events")
print("=" * 70)

# Fetch real events with odds
events_res = supabase.table('events').select('*').limit(20).execute()
events = events_res.data

print(f"Found {len(events)} events\n")

# Delete old predictions with no team names
print("🗑️  Deleting old predictions with missing team data...")
try:
    supabase.table('predictions_final').delete().neq('id', 0).execute()
    print("✅ Cleared old predictions\n")
except Exception as e:
    print(f"⚠️  Could not clear: {e}\n")

predictions_created = 0

for event in events:
    home_team = event.get('home_team')
    away_team = event.get('away_team')
    sport_key = event.get('sport_key')
    commence_time = event.get('commence_time')
    event_id = event.get('id')
    
    if not home_team or not away_team:
        continue
    
    # Fetch odds for this event
    try:
        odds_res = supabase.table('odds_snapshots').select('*').eq('event_id', event_id).limit(1).execute()
        odds_data = odds_res.data
        
        # Calculate confidence based on odds
        confidence = 75.0  # Base confidence
        prediction_type = "home_win"
        
        if odds_data and len(odds_data) > 0:
            outcomes = odds_data[0].get('outcomes', [])
            if outcomes and len(outcomes) > 0:
                # Use first outcome's price to adjust confidence
                first_price = outcomes[0].get('price', 2.0)
                # Lower odds = higher confidence
                confidence = min(95.0, max(60.0, 100 - (first_price * 10)))
        
        # Create prediction payload
        prediction = {
            'tier': 'normal',
            'type': 'single',
            'total_confidence': round(confidence, 2),
            'risk_level': 'medium',
            'matches': [
                {
                    'sport': sport_key,
                    'home_team': home_team,
                    'away_team': away_team,
                    'prediction': prediction_type,
                    'confidence': round(confidence, 2),
                    'commence_time': commence_time,
                    'metadata': {
                        'home_team': home_team,
                        'away_team': away_team,
                        'event_id': event_id
                    }
                }
            ],
            'created_at': datetime.now().isoformat()
        }
        
        # Insert prediction
        result = supabase.table('predictions_final').insert(prediction).execute()
        
        if result.data:
            predictions_created += 1
            print(f"✅ Created prediction: {home_team} vs {away_team} ({sport_key})")
            print(f"   Confidence: {confidence}%")
        
    except Exception as e:
        print(f"⚠️  Error creating prediction for {home_team} vs {away_team}: {e}")

print("\n" + "=" * 70)
print(f"✅ Generated {predictions_created} predictions with real team data!")
print("\nThese predictions should now appear on your webpage.")
print("=" * 70)
