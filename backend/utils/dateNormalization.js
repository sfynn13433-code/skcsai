/**
 * SKCS Date Normalization Utilities
 * Handles timezone conversion, fixture date normalization, and prediction window logic
 * Ensures consistent date handling across all sports and prediction types
 */

'use strict';

const moment = require('moment-timezone');

// Timezone constants
const UTC_TIMEZONE = 'UTC';
const SAST_TIMEZONE = 'Africa/Johannesburg';
const SAST_OFFSET = '+02:00'; // South Africa Standard Time

/**
 * Convert any date string/object to UTC moment
 */
function toUTC(dateInput) {
    if (!dateInput) return null;
    
    const utc = moment.utc(dateInput);
    if (!utc.isValid()) {
        console.warn('[dateNormalization] Invalid UTC conversion for:', dateInput);
        return null;
    }
    
    return utc;
}

/**
 * Convert UTC moment to South Africa Standard Time
 */
function toSAST(utcMoment) {
    if (!utcMoment || !utcMoment.isValid()) return null;
    
    return utcMoment.tz(SAST_TIMEZONE);
}

/**
 * Normalize fixture date from provider
 * Input can be any timezone, output is normalized UTC + SAST
 */
function normalizeFixtureDate(providerDate, sport = 'unknown') {
    if (!providerDate) {
        console.warn(`[dateNormalization] Missing fixture date for sport: ${sport}`);
        return null;
    }
    
    try {
        // Parse provider date (handle various formats)
        let utcDate;
        
        if (typeof providerDate === 'string') {
            // Handle ISO strings, timestamps, etc.
            if (providerDate.includes('T') || providerDate.includes('-')) {
                utcDate = moment.utc(providerDate);
            } else if (providerDate.includes(' ')) {
                // Handle "2026-03-26 19:45:00" format
                utcDate = moment.utc(providerDate, 'YYYY-MM-DD HH:mm:ss');
            } else {
                // Handle Unix timestamps
                utcDate = moment.utc(parseInt(providerDate) * 1000);
            }
        } else if (providerDate instanceof Date) {
            utcDate = moment.utc(providerDate);
        } else if (typeof providerDate === 'number') {
            // Unix timestamp
            utcDate = moment.utc(providerDate * 1000);
        } else {
            throw new Error(`Unsupported date format: ${typeof providerDate}`);
        }
        
        if (!utcDate.isValid()) {
            throw new Error(`Invalid date parsing for: ${providerDate}`);
        }
        
        // Create normalized fixture object
        const sastDate = toSAST(utcDate);
        
        return {
            kickoff_utc: utcDate.toISOString(),
            kickoff_sast: sastDate.format(),
            match_date_sast: sastDate.format('YYYY-MM-DD'),
            match_time_sast: sastFormat('HH:mm'),
            day_of_week: sastDate.format('dddd').toLowerCase(),
            is_same_day: isSameDayFixture(utcDate),
            is_within_2h: isWithinTwoHoursOfKickoff(utcDate),
            sport: sport,
            provider_original: providerDate,
            normalized_at: moment.utc().toISOString()
        };
        
    } catch (error) {
        console.error(`[dateNormalization] Failed to normalize fixture date for ${sport}:`, error.message);
        return null;
    }
}

/**
 * Check if fixture is on the same day (SAST)
 */
function isSameDayFixture(kickoffUTC) {
    if (!kickoffUTC) return false;
    
    const fixtureSAST = toSAST(kickoffUTC);
    const nowSAST = moment().tz(SAST_TIMEZONE);
    
    return fixtureSAST.isSame(nowSAST, 'day');
}

/**
 * Check if fixture is within 2 hours of kickoff (SAST)
 */
function isWithinTwoHoursOfKickoff(kickoffUTC) {
    if (!kickoffUTC) return false;
    
    const now = moment();
    const kickoff = moment.utc(kickoffUTC);
    const hoursUntil = kickoff.diff(now, 'hours', true);
    
    return hoursUntil >= 0 && hoursUntil <= 2;
}

/**
 * Get prediction window for current scheduling cycle
 * Returns fixtures that should be included in the current prediction run
 */
function getPredictionWindow(currentTime = moment()) {
    const nowSAST = currentTime.tz(SAST_TIMEZONE);
    const nowUTC = currentTime.utc();
    
    // Define scheduling windows (SAST)
    const windows = {
        morning: { start: '04:00', end: '11:59' },
        midday: { start: '12:00', end: '17:59' },
        evening: { start: '18:00', end: '23:59' }
    };
    
    // Determine current window
    let currentWindow = null;
    const currentTimeStr = nowSAST.format('HH:mm');
    
    Object.entries(windows).forEach(([name, window]) => {
        if (currentTimeStr >= window.start && currentTimeStr <= window.end) {
            currentWindow = name;
        }
    });
    
    // Calculate fixture fetch range based on window
    let fetchStartUTC, fetchEndUTC;
    
    switch (currentWindow) {
        case 'morning':
            // Morning window: fetch today's fixtures (SAST)
            fetchStartUTC = nowSAST.clone().startOf('day').utc();
            fetchEndUTC = nowSAST.clone().endOf('day').utc();
            break;
            
        case 'midday':
            // Midday window: fetch today + tomorrow (SAST)
            fetchStartUTC = nowSAST.clone().startOf('day').utc();
            fetchEndUTC = nowSAST.clone().add(1, 'day').endOf('day').utc();
            break;
            
        case 'evening':
            // Evening window: fetch tomorrow + day after (SAST)
            fetchStartUTC = nowSAST.clone().add(1, 'day').startOf('day').utc();
            fetchEndUTC = nowSAST.clone().add(2, 'day').endOf('day').utc();
            break;
            
        default:
            // Outside windows: use today
            fetchStartUTC = nowSAST.clone().startOf('day').utc();
            fetchEndUTC = nowSAST.clone().endOf('day').utc();
    }
    
    return {
        current_window: currentWindow,
        current_time_sast: nowSAST.format(),
        fetch_range_utc: {
            start: fetchStartUTC.toISOString(),
            end: fetchEndUTC.toISOString()
        },
        fetch_range_sast: {
            start: toSAST(fetchStartUTC).format(),
            end: toSAST(fetchEndUTC).format()
        },
        scheduling_info: {
            timezone: SAST_TIMEZONE,
            utc_offset: SAST_OFFSET,
            next_window: getNextWindow(currentTimeStr)
        }
    };
}

/**
 * Get next scheduling window
 */
function getNextWindow(currentTimeStr) {
    const windows = [
        { name: 'morning', start: '04:00', end: '11:59' },
        { name: 'midday', start: '12:00', end: '17:59' },
        { name: 'evening', start: '18:00', end: '23:59' }
    ];
    
    for (let i = 0; i < windows.length; i++) {
        if (currentTimeStr < windows[i].start) {
            return windows[i];
        }
    }
    
    // If past all windows, return tomorrow's morning
    return windows[0];
}

/**
 * Validate fixture date for prediction eligibility
 */
function isFixtureEligibleForPrediction(fixtureDate, predictionType = 'standard') {
    if (!fixtureDate) return { eligible: false, reason: 'Missing fixture date' };
    
    const normalized = normalizeFixtureDate(fixtureDate);
    if (!normalized) return { eligible: false, reason: 'Invalid date normalization' };
    
    const now = moment();
    const kickoff = moment.utc(normalized.kickoff_utc);
    const hoursUntil = kickoff.diff(now, 'hours', true);
    
    // Basic eligibility rules
    if (hoursUntil < 0) {
        return { eligible: false, reason: 'Fixture already started' };
    }
    
    if (hoursUntil > 72) {
        return { eligible: false, reason: 'Fixture too far in future' };
    }
    
    // Type-specific rules
    switch (predictionType) {
        case 'acca':
            // ACCA: only same-day fixtures
            if (!normalized.is_same_day) {
                return { eligible: false, reason: 'ACCA requires same-day fixture' };
            }
            break;
            
        case 'within_2h':
            // Within 2h predictions
            if (!normalized.is_within_2h) {
                return { eligible: false, reason: 'Not within 2 hours of kickoff' };
            }
            break;
            
        case 'elite':
            // Elite: can use same-day and within-2h
            if (!normalized.is_same_day && !normalized.is_within_2h) {
                return { eligible: false, reason: 'Elite requires same-day or within-2h' };
            }
            break;
    }
    
    return { 
        eligible: true, 
        normalized,
        hours_until_kickoff: hoursUntil
    };
}

/**
 * Deduplicate fixtures by sport + provider_fixture_id
 */
function deduplicateFixtures(fixtures) {
    const seen = new Set();
    const deduplicated = [];
    
    for (const fixture of fixtures) {
        const key = `${fixture.sport}_${fixture.provider_fixture_id}`;
        if (!seen.has(key)) {
            seen.add(key);
            deduplicated.push(fixture);
        } else {
            console.warn(`[dateNormalization] Duplicate fixture detected: ${key}`);
        }
    }
    
    return deduplicated;
}

/**
 * Get scheduling times for Supabase cron jobs
 */
function getSchedulingTimes() {
    return {
        // Supabase cron uses UTC, but we want SAST times
        morning_utc: '0 2 * * *',    // 04:00 SAST = 02:00 UTC
        midday_utc: '0 10 * * *',    // 12:00 SAST = 10:00 UTC  
        evening_utc: '0 16 * * *',    // 18:00 SAST = 16:00 UTC
        timezone: SAST_TIMEZONE,
        sast_times: ['04:00', '12:00', '18:00'],
        utc_times: ['02:00', '10:00', '16:00']
    };
}

/**
 * Log date normalization statistics
 */
function logNormalizationStats(fixtures, operation = 'normalization') {
    const stats = {
        total: fixtures.length,
        valid: 0,
        invalid: 0,
        same_day: 0,
        within_2h: 0,
        by_sport: {},
        errors: []
    };
    
    fixtures.forEach(fixture => {
        if (fixture.kickoff_utc) {
            stats.valid++;
            if (fixture.is_same_day) stats.same_day++;
            if (fixture.is_within_2h) stats.within_2h++;
            
            const sport = fixture.sport || 'unknown';
            stats.by_sport[sport] = (stats.by_sport[sport] || 0) + 1;
        } else {
            stats.invalid++;
            stats.errors.push({
                sport: fixture.sport,
                provider_id: fixture.provider_fixture_id,
                original_date: fixture.provider_original
            });
        }
    });
    
    console.log(`[dateNormalization] ${operation} stats:`, stats);
    return stats;
}

module.exports = {
    toUTC,
    toSAST,
    normalizeFixtureDate,
    isSameDayFixture,
    isWithinTwoHoursOfKickoff,
    getPredictionWindow,
    isFixtureEligibleForPrediction,
    deduplicateFixtures,
    getSchedulingTimes,
    logNormalizationStats,
    
    // Constants
    SAST_TIMEZONE,
    UTC_TIMEZONE,
    SAST_OFFSET
};
