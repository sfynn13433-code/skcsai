'use strict';

// Plan IDs are what the frontend selects.
// They map onto the existing backend tier keys that control daily prediction limits:
//   - normalX => "core" (non-deep)
//   - deepX   => "elite" (deep)
const subscriptionPlans = {
    core_4: { tier: 'core', days: 4, tierKey: 'normal4' },
    core_9: { tier: 'core', days: 9, tierKey: 'normal9' },
    core_14: { tier: 'core', days: 14, tierKey: 'normal14' },
    core_30: { tier: 'core', days: 30, tierKey: 'normal30' },

    elite_4: { tier: 'elite', days: 4, tierKey: 'deep4' },
    elite_9: { tier: 'elite', days: 9, tierKey: 'deep9' },
    elite_14: { tier: 'elite', days: 14, tierKey: 'deep14' },
    elite_30: { tier: 'elite', days: 30, tierKey: 'deep30' },

    // IDs used by public/subscription.html and SUBSCRIPTION_TIERS on the server
    core_4day_sprint: { tier: 'core', days: 4, tierKey: 'normal4' },
    core_9day_run: { tier: 'core', days: 9, tierKey: 'normal9' },
    core_14day_pro: { tier: 'core', days: 14, tierKey: 'normal14' },
    core_30day_limitless: { tier: 'core', days: 30, tierKey: 'normal30' },
    elite_4day_deep_dive: { tier: 'elite', days: 4, tierKey: 'deep4' },
    elite_9day_deep_strike: { tier: 'elite', days: 9, tierKey: 'deep9' },
    elite_14day_deep_pro: { tier: 'elite', days: 14, tierKey: 'deep14' },
    elite_30day_deep_vip: { tier: 'elite', days: 30, tierKey: 'deep30' },

    // Legacy plan IDs used by the existing static frontend.
    normal_4: { tier: 'core', days: 4, tierKey: 'normal4' },
    normal_9: { tier: 'core', days: 9, tierKey: 'normal9' },
    normal_14: { tier: 'core', days: 14, tierKey: 'normal14' },
    normal_30: { tier: 'core', days: 30, tierKey: 'normal30' },

    deep_4: { tier: 'elite', days: 4, tierKey: 'deep4' },
    deep_9: { tier: 'elite', days: 9, tierKey: 'deep9' },
    deep_14: { tier: 'elite', days: 14, tierKey: 'deep14' },
    deep_30: { tier: 'elite', days: 30, tierKey: 'deep30' }
};

function getPlan(planId) {
    if (typeof planId !== 'string') return null;
    return subscriptionPlans[planId] || null;
}

function getTierKeyForPlan(planId) {
    const plan = getPlan(planId);
    return plan ? plan.tierKey : null;
}

module.exports = {
    subscriptionPlans,
    getPlan,
    getTierKeyForPlan
};

