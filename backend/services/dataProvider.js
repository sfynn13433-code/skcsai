'use strict';

const config = require('../config');
const { APISportsClient } = require('../apiClients');

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

async function buildLiveData() {
    // Live mode: fetch upcoming fixtures from API-Sports.
    // For now, we simulate predictions (markets/prediction), scoring happens in aiScoring.
    const sport = (process.env.APISPORTS_SPORT || 'football').toLowerCase();
    const leagueId = process.env.APISPORTS_LEAGUE_ID;
    const season = process.env.APISPORTS_SEASON;

    if (!leagueId || !season) {
        throw new Error('Live mode requires APISPORTS_LEAGUE_ID and APISPORTS_SEASON environment variables');
    }

    const client = new APISportsClient();
    const data = await client.getFixtures(leagueId, season, {}, sport);

    const fixtures = data?.response || [];

    const out = fixtures.slice(0, 10).map((f) => {
        const fixtureId = f?.fixture?.id;
        const home = f?.teams?.home?.name;
        const away = f?.teams?.away?.name;

        return {
            match_id: fixtureId ? String(fixtureId) : `live-${String(home)}-${String(away)}`,
            sport,
            home_team: home || null,
            away_team: away || null,
            market: '1X2',
            prediction: 'home_win',
            confidence: null,
            volatility: null,
            odds: null
        };
    });

    console.log('[dataProvider] live fixtures fetched=%s returned=%s sport=%s league=%s season=%s', fixtures.length, out.length, sport, leagueId, season);

    return out;
}

async function getPredictionInputs() {
    const mode = normalizeMode(config.DATA_MODE);

    if (mode === 'test') {
        const data = buildTestData();
        console.log('[dataProvider] mode=test returned=%s', data.length);
        return { mode, predictions: data };
    }

    const data = await buildLiveData();
    return { mode, predictions: data };
}

module.exports = {
    getPredictionInputs
};
