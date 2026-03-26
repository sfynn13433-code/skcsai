"""
SKCS Subscription Tier Definitions
Defines the exact daily allocation for each of the 8 subscription plans
"""

SUBSCRIPTION_TIERS = {
    # CORE PLANS
    'core_4day_sprint': {
        'name': '4-Day Sprint',
        'tier': 'core',
        'duration_days': 4,
        'price': 3.99,
        'daily_allocations': {
            'monday': {'direct': 6, 'secondary': 4, 'multi': 2, 'same_match': 2, 'acca_6match': 1},
            'tuesday': {'direct': 6, 'secondary': 4, 'multi': 2, 'same_match': 2, 'acca_6match': 1},
            'wednesday': {'direct': 8, 'secondary': 5, 'multi': 3, 'same_match': 2, 'acca_6match': 1},
            'thursday': {'direct': 8, 'secondary': 5, 'multi': 3, 'same_match': 2, 'acca_6match': 1},
            'friday': {'direct': 10, 'secondary': 6, 'multi': 3, 'same_match': 3, 'acca_6match': 2},
            'saturday': {'direct': 15, 'secondary': 8, 'multi': 5, 'same_match': 5, 'acca_6match': 3},
            'sunday': {'direct': 12, 'secondary': 7, 'multi': 4, 'same_match': 4, 'acca_6match': 2},
        }
    },
    'core_9day_run': {
        'name': '9-Day Run ⭐',
        'tier': 'core',
        'duration_days': 9,
        'price': 7.99,
        'daily_allocations': {
            'monday': {'direct': 8, 'secondary': 5, 'multi': 3, 'same_match': 3, 'acca_6match': 1},
            'tuesday': {'direct': 8, 'secondary': 5, 'multi': 3, 'same_match': 3, 'acca_6match': 1},
            'wednesday': {'direct': 10, 'secondary': 6, 'multi': 4, 'same_match': 3, 'acca_6match': 2},
            'thursday': {'direct': 10, 'secondary': 6, 'multi': 4, 'same_match': 3, 'acca_6match': 2},
            'friday': {'direct': 12, 'secondary': 8, 'multi': 4, 'same_match': 4, 'acca_6match': 2},
            'saturday': {'direct': 18, 'secondary': 10, 'multi': 6, 'same_match': 6, 'acca_6match': 4},
            'sunday': {'direct': 14, 'secondary': 9, 'multi': 5, 'same_match': 5, 'acca_6match': 3},
        }
    },
    'core_14day_pro': {
        'name': '14-Day Pro',
        'tier': 'core',
        'duration_days': 14,
        'price': 14.99,
        'daily_allocations': {
            'monday': {'direct': 9, 'secondary': 6, 'multi': 4, 'same_match': 4, 'acca_6match': 2},
            'tuesday': {'direct': 9, 'secondary': 6, 'multi': 4, 'same_match': 4, 'acca_6match': 2},
            'wednesday': {'direct': 12, 'secondary': 8, 'multi': 5, 'same_match': 4, 'acca_6match': 2},
            'thursday': {'direct': 12, 'secondary': 8, 'multi': 5, 'same_match': 4, 'acca_6match': 2},
            'friday': {'direct': 15, 'secondary': 10, 'multi': 5, 'same_match': 5, 'acca_6match': 3},
            'saturday': {'direct': 22, 'secondary': 12, 'multi': 8, 'same_match': 8, 'acca_6match': 5},
            'sunday': {'direct': 18, 'secondary': 11, 'multi': 6, 'same_match': 6, 'acca_6match': 3},
        }
    },
    'core_30day_limitless': {
        'name': '30-Day Limitless',
        'tier': 'core',
        'duration_days': 30,
        'price': 29.99,
        'daily_allocations': {
            'monday': {'direct': 10, 'secondary': 8, 'multi': 5, 'same_match': 5, 'acca_6match': 3},
            'tuesday': {'direct': 10, 'secondary': 8, 'multi': 5, 'same_match': 5, 'acca_6match': 3},
            'wednesday': {'direct': 15, 'secondary': 10, 'multi': 7, 'same_match': 6, 'acca_6match': 4},
            'thursday': {'direct': 15, 'secondary': 10, 'multi': 7, 'same_match': 6, 'acca_6match': 4},
            'friday': {'direct': 20, 'secondary': 12, 'multi': 8, 'same_match': 8, 'acca_6match': 5},
            'saturday': {'direct': 30, 'secondary': 15, 'multi': 10, 'same_match': 10, 'acca_6match': 8},
            'sunday': {'direct': 25, 'secondary': 14, 'multi': 9, 'same_match': 9, 'acca_6match': 6},
        }
    },
    # ELITE PLANS
    'elite_4day_deep_dive': {
        'name': '4-Day Deep Dive',
        'tier': 'elite',
        'duration_days': 4,
        'price': 9.99,
        'daily_allocations': {
            'monday': {'direct': 8, 'secondary': 5, 'multi': 3, 'same_match': 3, 'acca_6match': 1},
            'tuesday': {'direct': 8, 'secondary': 5, 'multi': 3, 'same_match': 3, 'acca_6match': 1},
            'wednesday': {'direct': 10, 'secondary': 7, 'multi': 4, 'same_match': 3, 'acca_6match': 2},
            'thursday': {'direct': 10, 'secondary': 7, 'multi': 4, 'same_match': 3, 'acca_6match': 2},
            'friday': {'direct': 14, 'secondary': 8, 'multi': 5, 'same_match': 5, 'acca_6match': 3},
            'saturday': {'direct': 20, 'secondary': 12, 'multi': 8, 'same_match': 8, 'acca_6match': 5},
            'sunday': {'direct': 16, 'secondary': 10, 'multi': 6, 'same_match': 6, 'acca_6match': 4},
        }
    },
    'elite_9day_deep_strike': {
        'name': '9-Day Deep Strike ⭐',
        'tier': 'elite',
        'duration_days': 9,
        'price': 19.99,
        'daily_allocations': {
            'monday': {'direct': 10, 'secondary': 7, 'multi': 4, 'same_match': 4, 'acca_6match': 2},
            'tuesday': {'direct': 10, 'secondary': 7, 'multi': 4, 'same_match': 4, 'acca_6match': 2},
            'wednesday': {'direct': 14, 'secondary': 9, 'multi': 6, 'same_match': 5, 'acca_6match': 3},
            'thursday': {'direct': 14, 'secondary': 9, 'multi': 6, 'same_match': 5, 'acca_6match': 3},
            'friday': {'direct': 18, 'secondary': 11, 'multi': 7, 'same_match': 7, 'acca_6match': 4},
            'saturday': {'direct': 28, 'secondary': 15, 'multi': 10, 'same_match': 10, 'acca_6match': 7},
            'sunday': {'direct': 22, 'secondary': 13, 'multi': 8, 'same_match': 8, 'acca_6match': 5},
        }
    },
    'elite_14day_deep_pro': {
        'name': '14-Day Deep Pro',
        'tier': 'elite',
        'duration_days': 14,
        'price': 39.99,
        'daily_allocations': {
            'monday': {'direct': 12, 'secondary': 9, 'multi': 6, 'same_match': 6, 'acca_6match': 3},
            'tuesday': {'direct': 12, 'secondary': 9, 'multi': 6, 'same_match': 6, 'acca_6match': 3},
            'wednesday': {'direct': 18, 'secondary': 12, 'multi': 8, 'same_match': 7, 'acca_6match': 4},
            'thursday': {'direct': 18, 'secondary': 12, 'multi': 8, 'same_match': 7, 'acca_6match': 4},
            'friday': {'direct': 22, 'secondary': 15, 'multi': 10, 'same_match': 10, 'acca_6match': 6},
            'saturday': {'direct': 35, 'secondary': 20, 'multi': 14, 'same_match': 14, 'acca_6match': 10},
            'sunday': {'direct': 28, 'secondary': 18, 'multi': 12, 'same_match': 12, 'acca_6match': 8},
        }
    },
    'elite_30day_deep_vip': {
        'name': '30-Day Deep VIP',
        'tier': 'elite',
        'duration_days': 30,
        'price': 59.99,
        'daily_allocations': {
            'monday': {'direct': 15, 'secondary': 12, 'multi': 8, 'same_match': 8, 'acca_6match': 5},
            'tuesday': {'direct': 15, 'secondary': 12, 'multi': 8, 'same_match': 8, 'acca_6match': 5},
            'wednesday': {'direct': 22, 'secondary': 15, 'multi': 10, 'same_match': 10, 'acca_6match': 7},
            'thursday': {'direct': 22, 'secondary': 15, 'multi': 10, 'same_match': 10, 'acca_6match': 7},
            'friday': {'direct': 30, 'secondary': 18, 'multi': 12, 'same_match': 12, 'acca_6match': 10},
            'saturday': {'direct': 45, 'secondary': 25, 'multi': 18, 'same_match': 18, 'acca_6match': 15},
            'sunday': {'direct': 35, 'secondary': 22, 'multi': 15, 'same_match': 15, 'acca_6match': 12},
        }
    },
}

def get_tier_by_id(tier_id):
    """Get subscription tier details by ID"""
    return SUBSCRIPTION_TIERS.get(tier_id)

def get_daily_allocation(tier_id, day_of_week):
    """Get the daily allocation for a specific tier and day"""
    tier = SUBSCRIPTION_TIERS.get(tier_id)
    if not tier:
        return None
    return tier['daily_allocations'].get(day_of_week.lower())

def get_all_tiers():
    """Get all subscription tiers"""
    return SUBSCRIPTION_TIERS

def get_core_tiers():
    """Get only Core tier plans"""
    return {k: v for k, v in SUBSCRIPTION_TIERS.items() if v['tier'] == 'core'}

def get_elite_tiers():
    """Get only Elite tier plans"""
    return {k: v for k, v in SUBSCRIPTION_TIERS.items() if v['tier'] == 'elite'}
