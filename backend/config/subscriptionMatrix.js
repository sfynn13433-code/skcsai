'use strict';

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const PLAN_CATEGORIES = ['direct', 'secondary', 'multi', 'same_match', 'acca_6match'];

const FAMILY_BASELINES = {
    core: 'core_30day_limitless',
    elite: 'elite_30day_deep_vip'
};

const SUBSCRIPTION_MATRIX = {
    core_4day_sprint: {
        plan_id: 'core_4day_sprint',
        name: '4-Day Sprint',
        tier: 'core',
        duration_days: 4,
        price: 3.99,
        chatbot_daily_limit: 10,
        sports_coverage: ['football', 'basketball', 'cricket', 'rugby', 'baseball'],
        market_access: ['1X2', 'double_chance', 'over_2_5', 'under_2_5', 'btts_yes'],
        daily_limits: {
            monday: { direct: 6, secondary: 4, multi: 2, same_match: 2, acca_6match: 1 },
            tuesday: { direct: 6, secondary: 4, multi: 2, same_match: 2, acca_6match: 1 },
            wednesday: { direct: 8, secondary: 5, multi: 3, same_match: 2, acca_6match: 1 },
            thursday: { direct: 8, secondary: 5, multi: 3, same_match: 2, acca_6match: 1 },
            friday: { direct: 10, secondary: 6, multi: 3, same_match: 3, acca_6match: 2 },
            saturday: { direct: 15, secondary: 8, multi: 5, same_match: 5, acca_6match: 3 },
            sunday: { direct: 12, secondary: 7, multi: 4, same_match: 4, acca_6match: 2 }
        }
    },
    core_9day_run: {
        plan_id: 'core_9day_run',
        name: '9-Day Run',
        tier: 'core',
        duration_days: 9,
        price: 7.99,
        chatbot_daily_limit: 15,
        sports_coverage: ['football', 'basketball', 'cricket', 'rugby', 'baseball', 'hockey'],
        market_access: ['1X2', 'double_chance', 'over_2_5', 'under_2_5', 'btts_yes', 'over_1_5'],
        daily_limits: {
            monday: { direct: 8, secondary: 5, multi: 3, same_match: 3, acca_6match: 1 },
            tuesday: { direct: 8, secondary: 5, multi: 3, same_match: 3, acca_6match: 1 },
            wednesday: { direct: 10, secondary: 6, multi: 4, same_match: 3, acca_6match: 2 },
            thursday: { direct: 10, secondary: 6, multi: 4, same_match: 3, acca_6match: 2 },
            friday: { direct: 12, secondary: 8, multi: 4, same_match: 4, acca_6match: 2 },
            saturday: { direct: 18, secondary: 10, multi: 6, same_match: 6, acca_6match: 4 },
            sunday: { direct: 14, secondary: 9, multi: 5, same_match: 5, acca_6match: 3 }
        }
    },
    core_14day_pro: {
        plan_id: 'core_14day_pro',
        name: '14-Day Pro',
        tier: 'core',
        duration_days: 14,
        price: 14.99,
        chatbot_daily_limit: 20,
        sports_coverage: ['football', 'basketball', 'cricket', 'rugby', 'baseball', 'hockey', 'volleyball'],
        market_access: ['1X2', 'double_chance', 'over_2_5', 'under_2_5', 'btts_yes', 'over_1_5'],
        daily_limits: {
            monday: { direct: 9, secondary: 6, multi: 4, same_match: 4, acca_6match: 2 },
            tuesday: { direct: 9, secondary: 6, multi: 4, same_match: 4, acca_6match: 2 },
            wednesday: { direct: 12, secondary: 8, multi: 5, same_match: 4, acca_6match: 2 },
            thursday: { direct: 12, secondary: 8, multi: 5, same_match: 4, acca_6match: 2 },
            friday: { direct: 15, secondary: 10, multi: 5, same_match: 5, acca_6match: 3 },
            saturday: { direct: 22, secondary: 12, multi: 8, same_match: 8, acca_6match: 5 },
            sunday: { direct: 18, secondary: 11, multi: 6, same_match: 6, acca_6match: 3 }
        }
    },
    core_30day_limitless: {
        plan_id: 'core_30day_limitless',
        name: '30-Day Limitless',
        tier: 'core',
        duration_days: 30,
        price: 34.99,
        chatbot_daily_limit: 30,
        sports_coverage: ['football', 'basketball', 'cricket', 'rugby', 'baseball', 'hockey', 'volleyball', 'mma', 'formula1', 'afl', 'handball'],
        market_access: 'all',
        daily_limits: {
            monday: { direct: 10, secondary: 8, multi: 5, same_match: 5, acca_6match: 3 },
            tuesday: { direct: 10, secondary: 8, multi: 5, same_match: 5, acca_6match: 3 },
            wednesday: { direct: 15, secondary: 10, multi: 7, same_match: 6, acca_6match: 4 },
            thursday: { direct: 15, secondary: 10, multi: 7, same_match: 6, acca_6match: 4 },
            friday: { direct: 20, secondary: 12, multi: 8, same_match: 8, acca_6match: 5 },
            saturday: { direct: 30, secondary: 15, multi: 10, same_match: 10, acca_6match: 8 },
            sunday: { direct: 25, secondary: 14, multi: 9, same_match: 9, acca_6match: 6 }
        }
    },
    elite_4day_deep_dive: {
        plan_id: 'elite_4day_deep_dive',
        name: '4-Day Deep Dive',
        tier: 'elite',
        duration_days: 4,
        price: 9.99,
        chatbot_daily_limit: 25,
        sports_coverage: 'all',
        market_access: 'all',
        daily_limits: {
            monday: { direct: 8, secondary: 5, multi: 3, same_match: 3, acca_6match: 1 },
            tuesday: { direct: 8, secondary: 5, multi: 3, same_match: 3, acca_6match: 1 },
            wednesday: { direct: 10, secondary: 7, multi: 4, same_match: 3, acca_6match: 2 },
            thursday: { direct: 10, secondary: 7, multi: 4, same_match: 3, acca_6match: 2 },
            friday: { direct: 14, secondary: 8, multi: 5, same_match: 5, acca_6match: 3 },
            saturday: { direct: 20, secondary: 12, multi: 8, same_match: 8, acca_6match: 5 },
            sunday: { direct: 16, secondary: 10, multi: 6, same_match: 6, acca_6match: 4 }
        }
    },
    elite_9day_deep_strike: {
        plan_id: 'elite_9day_deep_strike',
        name: '9-Day Deep Strike',
        tier: 'elite',
        duration_days: 9,
        price: 19.99,
        chatbot_daily_limit: 35,
        sports_coverage: 'all',
        market_access: 'all',
        daily_limits: {
            monday: { direct: 10, secondary: 7, multi: 4, same_match: 4, acca_6match: 2 },
            tuesday: { direct: 10, secondary: 7, multi: 4, same_match: 4, acca_6match: 2 },
            wednesday: { direct: 14, secondary: 9, multi: 6, same_match: 5, acca_6match: 3 },
            thursday: { direct: 14, secondary: 9, multi: 6, same_match: 5, acca_6match: 3 },
            friday: { direct: 18, secondary: 11, multi: 7, same_match: 7, acca_6match: 4 },
            saturday: { direct: 28, secondary: 15, multi: 10, same_match: 10, acca_6match: 7 },
            sunday: { direct: 22, secondary: 13, multi: 8, same_match: 8, acca_6match: 5 }
        }
    },
    elite_14day_deep_pro: {
        plan_id: 'elite_14day_deep_pro',
        name: '14-Day Deep Pro',
        tier: 'elite',
        duration_days: 14,
        price: 39.99,
        chatbot_daily_limit: 50,
        sports_coverage: 'all',
        market_access: 'all',
        daily_limits: {
            monday: { direct: 12, secondary: 9, multi: 6, same_match: 6, acca_6match: 3 },
            tuesday: { direct: 12, secondary: 9, multi: 6, same_match: 6, acca_6match: 3 },
            wednesday: { direct: 18, secondary: 12, multi: 8, same_match: 7, acca_6match: 4 },
            thursday: { direct: 18, secondary: 12, multi: 8, same_match: 7, acca_6match: 4 },
            friday: { direct: 22, secondary: 15, multi: 10, same_match: 10, acca_6match: 6 },
            saturday: { direct: 35, secondary: 20, multi: 14, same_match: 14, acca_6match: 10 },
            sunday: { direct: 28, secondary: 18, multi: 12, same_match: 12, acca_6match: 8 }
        }
    },
    elite_30day_deep_vip: {
        plan_id: 'elite_30day_deep_vip',
        name: '30-Day Deep VIP',
        tier: 'elite',
        duration_days: 30,
        price: 59.99,
        chatbot_daily_limit: 150,
        sports_coverage: 'all',
        market_access: 'all',
        daily_limits: {
            monday: { direct: 15, secondary: 12, multi: 8, same_match: 8, acca_6match: 5 },
            tuesday: { direct: 15, secondary: 12, multi: 8, same_match: 8, acca_6match: 5 },
            wednesday: { direct: 22, secondary: 15, multi: 10, same_match: 10, acca_6match: 7 },
            thursday: { direct: 22, secondary: 15, multi: 10, same_match: 10, acca_6match: 7 },
            friday: { direct: 30, secondary: 18, multi: 12, same_match: 12, acca_6match: 10 },
            saturday: { direct: 45, secondary: 25, multi: 18, same_match: 18, acca_6match: 15 },
            sunday: { direct: 35, secondary: 22, multi: 15, same_match: 15, acca_6match: 12 }
        }
    }
};

function normalizeDay(dayOfWeek) {
    return String(dayOfWeek || '').trim().toLowerCase();
}

function getTodayName(now = new Date()) {
    return now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase();
}

function calculateDailyAllocations(planId, dayOfWeek) {
    const plan = SUBSCRIPTION_MATRIX[planId];
    if (!plan) return null;
    return plan.daily_limits[normalizeDay(dayOfWeek)] || null;
}

function getPlanCapabilities(planId) {
    const plan = SUBSCRIPTION_MATRIX[planId];
    if (!plan) return null;

    return {
        ...plan,
        baseline_plan_id: FAMILY_BASELINES[plan.tier],
        tiers: [plan.tier === 'elite' ? 'deep' : 'normal'],
        capabilities: {
            chatbot_daily_limit: plan.chatbot_daily_limit,
            sports_coverage: plan.sports_coverage,
            market_access: plan.market_access,
            plan_tier: plan.tier
        }
    };
}

function getPlansByFamily(family) {
    return Object.values(SUBSCRIPTION_MATRIX).filter((plan) => plan.tier === family);
}

function getBaselinePlan(family = 'elite') {
    const baselinePlanId = FAMILY_BASELINES[family] || FAMILY_BASELINES.elite;
    return getPlanCapabilities(baselinePlanId);
}

function normalizeSportName(value) {
    const sport = String(value || '').trim().toLowerCase();
    if (!sport) return '';
    if (sport.startsWith('soccer_')) return 'football';
    if (sport.startsWith('icehockey_')) return 'hockey';
    if (sport.startsWith('basketball_')) return 'basketball';
    if (sport.startsWith('americanfootball_')) return 'nfl';
    if (sport.startsWith('baseball_')) return 'baseball';
    if (sport.startsWith('rugbyunion_')) return 'rugby';
    if (sport.startsWith('aussierules_')) return 'afl';
    if (sport.startsWith('mma_')) return 'mma';
    return sport;
}

function normalizeMarketName(value) {
    return String(value || '').trim().toLowerCase();
}

function getPredictionCategory(prediction) {
    const explicit = String(prediction?.section_type || prediction?.type || '').trim().toLowerCase();
    if (PLAN_CATEGORIES.includes(explicit)) return explicit;

    const matches = Array.isArray(prediction?.matches) ? prediction.matches : [];
    const uniqueMatchIds = new Set(matches.map((match) => String(match?.match_id || '').trim()).filter(Boolean));
    const firstMarket = normalizeMarketName(matches[0]?.market);

    if (matches.length >= 6 || explicit === 'acca') return 'acca_6match';
    if (matches.length > 1 && uniqueMatchIds.size === 1) return 'same_match';
    if (matches.length >= 2) return 'multi';
    if (matches.length === 1 && firstMarket && firstMarket !== '1x2' && firstMarket !== 'match_result') return 'secondary';
    return 'direct';
}

function getPredictionSport(prediction) {
    const firstMatch = Array.isArray(prediction?.matches) && prediction.matches[0] ? prediction.matches[0] : {};
    return normalizeSportName(firstMatch.sport || firstMatch?.metadata?.sport || '');
}

function getPredictionMarket(prediction) {
    const firstMatch = Array.isArray(prediction?.matches) && prediction.matches[0] ? prediction.matches[0] : {};
    return normalizeMarketName(firstMatch.market || '');
}

function cloneWithSectionType(prediction, sectionType) {
    return {
        ...prediction,
        section_type: sectionType
    };
}

function filterPredictionsForPlan(predictions, planId, now = new Date()) {
    const plan = getPlanCapabilities(planId);
    if (!plan) return [];

    const dayName = getTodayName(now);
    const dailyLimits = calculateDailyAllocations(planId, dayName);
    if (!dailyLimits) return [];

    let filtered = Array.isArray(predictions) ? predictions.slice() : [];

    if (Array.isArray(plan.capabilities.sports_coverage)) {
        const allowedSports = new Set(plan.capabilities.sports_coverage.map(normalizeSportName));
        filtered = filtered.filter((prediction) => allowedSports.has(getPredictionSport(prediction)));
    }

    if (Array.isArray(plan.capabilities.market_access)) {
        const allowedMarkets = new Set(plan.capabilities.market_access.map(normalizeMarketName));
        filtered = filtered.filter((prediction) => {
            const category = getPredictionCategory(prediction);
            if (category !== 'direct' && category !== 'secondary') return true;
            return allowedMarkets.has(getPredictionMarket(prediction));
        });
    }

    const buckets = new Map(PLAN_CATEGORIES.map((category) => [category, []]));
    for (const prediction of filtered) {
        const category = getPredictionCategory(prediction);
        if (!buckets.has(category)) continue;
        buckets.get(category).push(cloneWithSectionType(prediction, category));
    }

    const shaped = [];
    for (const category of PLAN_CATEGORIES) {
        const limit = dailyLimits[category] || 0;
        if (limit <= 0) continue;
        shaped.push(...buckets.get(category).slice(0, limit));
    }

    return shaped;
}

module.exports = {
    DAY_NAMES,
    PLAN_CATEGORIES,
    SUBSCRIPTION_MATRIX,
    calculateDailyAllocations,
    getPlanCapabilities,
    filterPredictionsForPlan,
    getPlansByFamily,
    getBaselinePlan
};
