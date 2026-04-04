/**
 * SKCS Subscription Matrix - Single Source of Truth
 * Top-tier-first design: 30-Day Deep VIP defines the superset capabilities
 * All other plans inherit and apply stricter caps from this baseline
 */

'use strict';

// TOP TIER BASELINE - 30-Day Deep VIP (superset of all capabilities)
const BASELINE_CAPABILITIES = {
    plan_family: 'elite',
    duration_label: '30-Day Deep VIP',
    price: 59.99,
    
    // Maximum daily allocations (baseline)
    daily_limits: {
        monday: { direct: 15, secondary: 12, multi: 8, same_match: 8, acca_6match: 5 },
        tuesday: { direct: 15, secondary: 12, multi: 8, same_match: 8, acca_6match: 5 },
        wednesday: { direct: 22, secondary: 15, multi: 10, same_match: 10, acca_6match: 7 },
        thursday: { direct: 22, secondary: 15, multi: 10, same_match: 10, acca_6match: 7 },
        friday: { direct: 30, secondary: 18, multi: 12, same_match: 12, acca_6match: 10 },
        saturday: { direct: 45, secondary: 25, multi: 18, same_match: 18, acca_6match: 15 },
        sunday: { direct: 35, secondary: 22, multi: 15, same_match: 15, acca_6match: 12 }
    },
    
    // System capabilities
    capabilities: {
        deep_analysis_weighting: true,
        elite_only_filtering: true,
        sports_coverage: 'all', // All 13 sports
        chatbot_daily_limit: 50,
        acca_eligibility: 'full', // Can use same-day and within-2h logic
        risk_filtering: 'aggressive',
        market_access: 'all', // All markets available
        priority_support: true,
        historical_data_depth: 'unlimited'
    }
};

// Plan definitions with caps applied to baseline
const SUBSCRIPTION_MATRIX = {
    // CORE PLANS - Apply caps to baseline
    'core_4day_sprint': {
        plan_id: 'core_4day_sprint',
        name: '4-Day Sprint',
        tier: 'core',
        duration_days: 4,
        price: 3.99,
        caps: {
            daily_multiplier: 0.4, // 40% of baseline
            chatbot_daily_limit: 10,
            acca_eligibility: 'restricted',
            sports_coverage: ['football', 'basketball', 'tennis', 'cricket'],
            market_access: ['1X2', 'double_chance', 'over_2_5', 'btts_yes']
        }
    },
    'core_9day_run': {
        plan_id: 'core_9day_run',
        name: '9-Day Run ⭐',
        tier: 'core',
        duration_days: 9,
        price: 7.99,
        caps: {
            daily_multiplier: 0.53, // 53% of baseline
            chatbot_daily_limit: 15,
            acca_eligibility: 'restricted',
            sports_coverage: ['football', 'basketball', 'tennis', 'cricket', 'rugby', 'baseball'],
            market_access: ['1X2', 'double_chance', 'over_2_5', 'btts_yes', 'over_1_5']
        }
    },
    'core_14day_pro': {
        plan_id: 'core_14day_pro',
        name: '14-Day Pro',
        tier: 'core',
        duration_days: 14,
        price: 14.99,
        caps: {
            daily_multiplier: 0.6, // 60% of baseline
            chatbot_daily_limit: 20,
            acca_eligibility: 'partial',
            sports_coverage: ['football', 'basketball', 'tennis', 'cricket', 'rugby', 'baseball', 'hockey', 'volleyball'],
            market_access: ['1X2', 'double_chance', 'over_2_5', 'btts_yes', 'over_1_5', 'under_2_5']
        }
    },
    'core_30day_limitless': {
        plan_id: 'core_30day_limitless',
        name: '30-Day Limitless',
        tier: 'core',
        duration_days: 30,
        price: 29.99,
        caps: {
            daily_multiplier: 0.67, // 67% of baseline
            chatbot_daily_limit: 30,
            acca_eligibility: 'partial',
            sports_coverage: ['football', 'basketball', 'tennis', 'cricket', 'rugby', 'baseball', 'hockey', 'volleyball', 'mma', 'formula1'],
            market_access: ['1X2', 'double_chance', 'over_2_5', 'btts_yes', 'over_1_5', 'under_2_5', 'both_teams_score', 'correct_score']
        }
    },
    
    // ELITE PLANS - Apply higher caps to baseline
    'elite_4day_deep_dive': {
        plan_id: 'elite_4day_deep_dive',
        name: '4-Day Deep Dive',
        tier: 'elite',
        duration_days: 4,
        price: 9.99,
        caps: {
            daily_multiplier: 0.53, // 53% of baseline
            chatbot_daily_limit: 25,
            acca_eligibility: 'partial',
            deep_analysis_weighting: true,
            sports_coverage: 'all',
            market_access: 'all'
        }
    },
    'elite_9day_deep_strike': {
        plan_id: 'elite_9day_deep_strike',
        name: '9-Day Deep Strike ⭐',
        tier: 'elite',
        duration_days: 9,
        price: 19.99,
        caps: {
            daily_multiplier: 0.73, // 73% of baseline
            chatbot_daily_limit: 35,
            acca_eligibility: 'partial',
            deep_analysis_weighting: true,
            elite_only_filtering: true,
            sports_coverage: 'all',
            market_access: 'all'
        }
    },
    'elite_14day_deep_pro': {
        plan_id: 'elite_14day_deep_pro',
        name: '14-Day Deep Pro',
        tier: 'elite',
        duration_days: 14,
        price: 39.99,
        caps: {
            daily_multiplier: 0.87, // 87% of baseline
            chatbot_daily_limit: 40,
            acca_eligibility: 'full',
            deep_analysis_weighting: true,
            elite_only_filtering: true,
            sports_coverage: 'all',
            market_access: 'all'
        }
    },
    'elite_30day_deep_vip': {
        plan_id: 'elite_30day_deep_vip',
        name: '30-Day Deep VIP',
        tier: 'elite',
        duration_days: 30,
        price: 59.99,
        caps: {
            daily_multiplier: 1.0, // 100% of baseline (no caps)
            chatbot_daily_limit: 50,
            acca_eligibility: 'full',
            deep_analysis_weighting: true,
            elite_only_filtering: true,
            sports_coverage: 'all',
            market_access: 'all',
            priority_support: true,
            historical_data_depth: 'unlimited'
        }
    }
};

/**
 * Calculate plan-specific daily allocations by applying caps to baseline
 */
function calculateDailyAllocations(planId, dayOfWeek) {
    const plan = SUBSCRIPTION_MATRIX[planId];
    if (!plan) return null;
    
    const baseline = BASELINE_CAPABILITIES.daily_limits[dayOfWeek.toLowerCase()];
    if (!baseline) return null;
    
    const multiplier = plan.caps.daily_multiplier || 1.0;
    
    return {
        direct: Math.floor(baseline.direct * multiplier),
        secondary: Math.floor(baseline.secondary * multiplier),
        multi: Math.floor(baseline.multi * multiplier),
        same_match: Math.floor(baseline.same_match * multiplier),
        acca_6match: Math.floor(baseline.acca_6match * multiplier)
    };
}

/**
 * Get plan capabilities by merging baseline with plan-specific caps
 */
function getPlanCapabilities(planId) {
    const plan = SUBSCRIPTION_MATRIX[planId];
    if (!plan) return null;
    
    const capabilities = { ...BASELINE_CAPABILITIES.capabilities };
    
    // Apply plan-specific caps and overrides
    Object.entries(plan.caps).forEach(([key, value]) => {
        if (value !== undefined) {
            capabilities[key] = value;
        }
    });
    
    return {
        ...plan,
        tiers: plan.tier === 'elite' ? ['deep'] : ['normal'],
        capabilities,
        daily_limits: Object.keys(BASELINE_CAPABILITIES.daily_limits).reduce((acc, day) => {
            acc[day] = calculateDailyAllocations(planId, day);
            return acc;
        }, {})
    };
}

/**
 * Filter predictions based on plan capabilities
 * Implements top-tier-first logic: generate full pool, then cap for lower tiers
 */
function filterPredictionsForPlan(predictions, planId) {
    const plan = getPlanCapabilities(planId);
    if (!plan) return [];
    
    const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dailyLimits = calculateDailyAllocations(planId, dayOfWeek);
    if (!dailyLimits) return [];
    
    let filtered = [...predictions];
    
    // Apply sport coverage filter
    if (Array.isArray(plan.capabilities.sports_coverage)) {
        filtered = filtered.filter(p => {
            if (p.matches && p.matches[0]) {
                return plan.capabilities.sports_coverage.includes(p.matches[0].sport);
            }
            return false;
        });
    }
    
    // Apply market access filter
    if (Array.isArray(plan.capabilities.market_access)) {
        filtered = filtered.filter(p => {
            if (p.matches && p.matches[0]) {
                return plan.capabilities.market_access.includes(p.matches[0].market);
            }
            return false;
        });
    }
    
    // Apply elite-only filtering
    if (!plan.capabilities.elite_only_filtering) {
        filtered = filtered.filter(p => !p.elite_only || p.elite_only !== true);
    }
    
    // Apply daily caps by prediction type
    const typeCounts = { direct: 0, secondary: 0, multi: 0, same_match: 0, acca_6match: 0 };
    const capped = [];
    
    for (const pred of filtered) {
        const type = pred.type || 'direct';
        if (typeCounts[type] < dailyLimits[type]) {
            capped.push(pred);
            typeCounts[type]++;
        }
    }
    
    return capped;
}

/**
 * Get all plans for a tier family
 */
function getPlansByFamily(family) {
    return Object.values(SUBSCRIPTION_MATRIX).filter(plan => plan.tier === family);
}

/**
 * Get the highest tier plan (baseline)
 */
function getBaselinePlan() {
    return getPlanCapabilities('elite_30day_deep_vip');
}

module.exports = {
    SUBSCRIPTION_MATRIX,
    BASELINE_CAPABILITIES,
    calculateDailyAllocations,
    getPlanCapabilities,
    filterPredictionsForPlan,
    getPlansByFamily,
    getBaselinePlan
};
