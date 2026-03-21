'use strict';

const config = require('../config');
const { APISportsClient, OddsAPIClient } = require('../apiClients');

function normalizeMode(mode) {
    if (mode === 'test' || mode === 'live') return mode;
    throw new Error(`Invalid DATA_MODE: ${mode}`);
}

function buildTestData() {
    // 8 deterministic test entries
    return [
        { match_id: 'test-001', sport: 'football', home_team: 'Arsenal', away_team: 'Chelsea', market: '1X2', prediction: 'home_win', odds: 1.85 },
        { match_id: 'test-002', sport: 'football', home_team: 'Liverpool', away_team: 'Everton', market: 'double_chance', prediction: 'home_or_draw', odds: 1.25 },
        { match_id: 'test-003', sport: 'football', home_team: 'Barcelona', away_team: 'Atletico', market: 'over_2_5', prediction: 'over_2_5', odds: 1.95 },
        { match_id: 'test-004', sport: 'football', home_team: 'Inter', away_team: 'Juventus', market: 'btts_yes', prediction: 'btts_yes', odds: 1.90 },
        { match_id: 'test-005', sport: 'basketball', home_team: 'Lakers', away_team: 'Warriors', market: '1X2', prediction: 'home_win', odds: 1.70 },
        { match_id: 'test-006', sport: 'football', home_team: 'PSG', away_team: 'Marseille', market: 'over_2_5', prediction: 'over_2_5', odds: 1.80 },
        { match_id: 'test-007', sport: 'football', home_team: 'Bayern', away_team: 'Dortmund', market: 'btts_yes', prediction: 'btts_yes', odds: 1.75 },
        { match_id: 'test-008', sport: 'football', home_team: 'Ajax', away_team: 'Feyenoord', market: 'double_chance', prediction: 'home_or_draw', odds: 1.35 }
    ].map(p => ({
        ...p,
        confidence: null,
        volatility: null
    }));
}

async function fetchOddsData(sportKey) {
    const client = new OddsAPIClient();
    const data = await client.getOdds(sportKey);
    if (!data) return [];

    return data.map(event => ({
        match_id: `odds-${event.id}`,
        sport: sportKey,
        home_team: event.home_team,
        away_team: event.away_team,
        market: '1X2', // Default mapping
        prediction: 'home_win', // Placeholder
        confidence: null,
        volatility: null,
        odds: null // Could parse from bookmakers if needed
    }));
}

async function buildLiveData(options = {}) {
    const requestedSport = options.sport || process.env.APISPORTS_SPORT || 'football';
    const leagueId = options.leagueId || process.env.APISPORTS_LEAGUE_ID;
    const season = options.season || process.env.APISPORTS_SEASON;

    // 1. If it's MMA or NFL, use Odds-API
    if (requestedSport === 'mma_mixed_martial_arts' || requestedSport === 'americanfootball_nfl') {
        return await fetchOddsData(requestedSport);
    }

    // 2. Default to API-Sports (Football/Basketball)
    if (!leagueId || !season) {
        console.warn(`[dataProvider] skipping ${requestedSport} sync: missing league/season`);
        return [];
    }

    const client = new APISportsClient();
    const data = await client.getFixtures(leagueId, season, {}, requestedSport);
    const fixtures = data?.response || [];

    const out = fixtures.slice(0, 20).map((f) => {
        const fixtureId = f?.fixture?.id;
        const home = f?.teams?.home?.name;
        const away = f?.teams?.away?.name;

        return {
            match_id: fixtureId ? String(fixtureId) : `live-${String(home)}-${String(away)}`,
            sport: requestedSport,
            home_team: home || null,
            away_team: away || null,
            market: '1X2',
            prediction: 'home_win',
            confidence: null,
            volatility: null,
            odds: null
        };
    });

    console.log('[dataProvider] live fixtures fetched=%s returned=%s sport=%s league=%s season=%s', fixtures.length, out.length, requestedSport, leagueId, season);
    return out;
}

async function getPredictionInputs(options = {}) {
    const mode = normalizeMode(config.DATA_MODE);

    if (mode === 'test') {
        const data = buildTestData();
        console.log('[dataProvider] mode=test returned=%s', data.length);
        return { mode, predictions: data };
    }

    const data = await buildLiveData(options);
    return { mode, predictions: data };
}

module.exports = {
    getPredictionInputs,
    buildLiveData
};
