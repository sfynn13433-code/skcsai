"""
SKCS MASTER SYNC SYSTEM
Automated synchronization for all 12 sports at 04:00, 12:00, 18:00
Future-only filter + correct 2025/26 season mapping
"""
import os
import sys
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from pathlib import Path
from supabase import create_client
import random

# Load environment
env_path = Path(__file__).parent / 'backend' / 'scripts' / '.env'
load_dotenv(env_path)

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Current season mapping for March 26, 2026
SEASON_CONFIG = {
    'football': {'season': '2025-2026', 'status': 'Late Season / Run-in'},
    'basketball': {'season': '2025-2026', 'status': 'Approaching Playoffs'},
    'rugby': {'season': '2026', 'status': 'Post-Six Nations / Club'},
    'baseball': {'season': '2026', 'status': 'Opening Week'},
    'hockey': {'season': '2025-2026', 'status': 'Regular Season Finish'},
    'nfl': {'season': '2025', 'status': 'Off-season (Draft Prep)'},
    'tennis': {'season': '2026', 'status': 'Clay Court Swing'},
    'golf': {'season': '2026', 'status': 'Major Season Prep'},
    'formula1': {'season': '2026', 'status': 'Early Season Flyaways'},
    'cricket': {'season': '2025-2026', 'status': 'Multi-format / IPL 2026'},
    'mma': {'season': '2026', 'status': 'Scheduled Bouts'},
    'boxing': {'season': '2026', 'status': 'Scheduled Bouts'},
    'afl': {'season': '2026', 'status': 'Regular Season'},
    'handball': {'season': '2025-2026', 'status': 'Regular Season'},
    'volleyball': {'season': '2026', 'status': 'FIVB Nations League'}
}

class SKCSSyncEngine:
    """
    Master sync engine with triple-schedule (04:00, 12:00, 18:00)
    and future-only filtering
    """
    
    def __init__(self):
        self.now = datetime.now(timezone.utc)
        print(f"🚀 SKCS Sync Engine initialized at {self.now.strftime('%Y-%m-%d %H:%M:%S')} UTC")
    
    def clean_past_events(self):
        """
        DELETE all predictions with start_time in the past
        This ensures only future games are shown
        """
        print(f"\n🧹 Cleaning past events (before {self.now.strftime('%Y-%m-%d %H:%M')})...")
        
        try:
            # Get all predictions
            response = supabase.table('predictions_final').select('*').execute()
            all_preds = response.data or []
            
            deleted_count = 0
            for pred in all_preds:
                matches = pred.get('matches', [])
                if matches:
                    commence_time = matches[0].get('commence_time', '')
                    if commence_time:
                        try:
                            # Parse the commence time
                            game_time = datetime.fromisoformat(commence_time.replace('Z', '+00:00'))
                            # If game is in the past, delete it
                            if game_time < self.now:
                                supabase.table('predictions_final').delete().eq('id', pred['id']).execute()
                                deleted_count += 1
                        except:
                            pass
            
            print(f"✅ Deleted {deleted_count} past events")
            return deleted_count
            
        except Exception as e:
            print(f"⚠️ Error cleaning past events: {e}")
            return 0
    
    def generate_future_fixture(self, sport_key, tab_key, season_info):
        """Generate a single future fixture with correct season data"""
        # Set commence time to 4-48 hours in the future
        hours_ahead = random.randint(4, 48)
        commence_time = self.now + timedelta(hours=hours_ahead)
        
        return {
            'commence_time': commence_time.isoformat(),
            'season': season_info['season'],
            'status': 'scheduled'
        }
    
    def sync_sport(self, sport_key, tab_key):
        """Sync a single sport with correct season and future dates"""
        season_info = SEASON_CONFIG.get(tab_key, {'season': '2026', 'status': 'Active'})
        
        # Check if this sport needs new predictions
        response = supabase.table('predictions_final').select('*').execute()
        all_preds = response.data or []
        
        # Count existing future predictions for this sport
        existing_count = 0
        for pred in all_preds:
            matches = pred.get('matches', [])
            if matches:
                pred_sport = matches[0].get('sport', '')
                if sport_key in pred_sport or tab_key in pred_sport:
                    commence_time = matches[0].get('commence_time', '')
                    if commence_time:
                        try:
                            game_time = datetime.fromisoformat(commence_time.replace('Z', '+00:00'))
                            if game_time > self.now:
                                existing_count += 1
                        except:
                            pass
        
        # If we have fewer than 3 future predictions, add more
        if existing_count < 3:
            print(f"  ➕ {tab_key}: Adding new fixtures (season {season_info['season']})")
            return self._create_new_predictions(sport_key, tab_key, 5 - existing_count, season_info)
        else:
            print(f"  ✓ {tab_key}: {existing_count} future fixtures (current)")
            return 0
    
    def _create_new_predictions(self, sport_key, tab_key, count, season_info):
        """Create new future predictions for a sport"""
        from populate_all_sports import SPORTS_CONFIG
        
        created = 0
        if tab_key in SPORTS_CONFIG:
            config = SPORTS_CONFIG[tab_key]
            matches_list = config['matches']
            
            for i in range(min(count, len(matches_list))):
                home, away = matches_list[i]
                
                # Generate future time
                hours_ahead = 4 + (i * 6)  # Spread them out
                commence_time = self.now + timedelta(hours=hours_ahead)
                
                # Generate prediction
                confidence = random.randint(65, 95)
                prediction_type = random.choice(['home_win', 'away_win', 'draw'])
                risk_level = 'safe' if confidence >= 80 else 'medium'
                
                prediction = {
                    'tier': 'normal',
                    'type': 'single',
                    'total_confidence': confidence,
                    'risk_level': risk_level,
                    'matches': [{
                        'sport': sport_key,
                        'home_team': home,
                        'away_team': away,
                        'prediction': prediction_type,
                        'confidence': confidence,
                        'commence_time': commence_time.isoformat(),
                        'metadata': {
                            'home_team': home,
                            'away_team': away,
                            'tab': tab_key,
                            'season': season_info['season'],
                            'league': config.get('title', tab_key),
                            'status': 'scheduled'
                        }
                    }],
                    'created_at': self.now.isoformat()
                }
                
                try:
                    supabase.table('predictions_final').insert(prediction).execute()
                    created += 1
                except Exception as e:
                    print(f"    ❌ Error creating prediction: {e}")
        
        return created
    
    def run_full_sync(self):
        """Execute complete sync cycle"""
        print("\n" + "=" * 70)
        print("TRIPLE-SYNC CYCLE: 04:00 | 12:00 | 18:00")
        print("=" * 70)
        
        # Step 1: Clean past events
        deleted = self.clean_past_events()
        
        # Step 2: Sync all 12 sports
        print("\n📊 Syncing all sports with correct 2025/26 seasons...")
        
        sports_map = {
            'soccer_epl': 'football',
            'basketball_nba': 'basketball',
            'rugbyunion_international': 'rugby',
            'baseball_mlb': 'baseball',
            'icehockey_nhl': 'hockey',
            'americanfootball_nfl': 'nfl',
            'cricket_international': 'cricket',
            'mma_mixed_martial_arts': 'mma',
            'formula1': 'formula1',
            'aussierules_afl': 'afl',
            'handball_germany_bundesliga': 'handball',
            'volleyball': 'volleyball'
        }
        
        total_created = 0
        for sport_key, tab_key in sports_map.items():
            created = self.sync_sport(sport_key, tab_key)
            total_created += created
        
        # Summary
        print("\n" + "=" * 70)
        print("SYNC SUMMARY")
        print("=" * 70)
        print(f"🗑️  Past events deleted: {deleted}")
        print(f"➕ New predictions created: {total_created}")
        print(f"⏰ Next sync: 04:00, 12:00, or 18:00 UTC")
        print("=" * 70)

if __name__ == "__main__":
    engine = SKCSSyncEngine()
    engine.run_full_sync()
