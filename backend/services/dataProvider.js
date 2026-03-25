'use strict';

const SPORT_KEY_MAP = {
    'soccer_epl': 'football',
    'soccer_england_efl_cup': 'football',
    'soccer_uefa_champs_league': 'football',
    'basketball_nba': 'basketball',
    'basketball_euroleague': 'basketball',
    'americanfootball_nfl': 'nfl',
    'icehockey_nhl': 'hockey',
    'baseball_mlb': 'baseball',
    'mma_mixed_martial_arts': 'mma',
    'aussierules_afl': 'afl',
    'rugbyunion_six_nations': 'rugby',
    'rugbyunion_international': 'rugby'
};

function normalizeSportKey(sportKey) {
    return SPORT_KEY_MAP[sportKey] || sportKey;
}

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

    const normalizedSport = normalizeSportKey(sportKey);

    return data.map(event => ({
        match_id: `odds-${event.id}`,
        sport: normalizedSport,
        home_team: event.home_team,
        away_team: event.away_team,
        market: '1X2',
        prediction: 'home_win',
        confidence: null,
        volatility: null,
        odds: null
    }));
}

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function futureStr(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

function normalizeFixture(f, sport) {
    // Football v3 format
    if (f?.fixture?.id) {
        return {
            match_id: String(f.fixture.id),
            sport,
            home_team: f.teams?.home?.name || null,
            away_team: f.teams?.away?.name || null,
            date: f.fixture?.date || null,
            status: f.fixture?.status?.short || null,
            market: '1X2',
            prediction: null,
            confidence: null,
            volatility: null,
            odds: null
        };
    }
    // Other sports v1/v2 format (games, races, fights)
    const id = f.id || f.game?.id || f.fight?.id || f.race?.id;
    const home = f.teams?.home?.name || f.players?.home?.name || f.competitors?.[0]?.name || null;
    const away = f.teams?.away?.name || f.players?.away?.name || f.competitors?.[1]?.name || null;
    const date = f.date || f.game?.date || f.fight?.date || f.race?.date || null;
    const status = f.status?.short || f.game?.status?.short || null;

    return {
        match_id: id ? String(id) : `live-${sport}-${home}-${away}`,
        sport,
        home_team: home,
        away_team: away,
        date,
        status,
        market: '1X2',
        prediction: null,
        confidence: null,
        volatility: null,
        odds: null
    };
}

async function buildLiveData(options = {}) {
    const sport = options.sport || 'football';
    const leagueId = options.leagueId || null;
    const season = options.season || null;
    const today = todayStr();
    const weekAhead = futureStr(7);

    const client = new APISportsClient();

    // Build query options based on sport
    const queryOpts = {};
    if (sport === 'football') {
        queryOpts.from = today;
        queryOpts.to = weekAhead;
    } else {
        queryOpts.date = today;
    }

    const data = await client.getFixtures(leagueId, season, queryOpts, sport);
    const fixtures = data?.response || [];

    if (fixtures.length === 0) {
        console.log(`[dataProvider] ${sport}: 0 fixtures from API-Sports`);
        // Fallback to Odds API for this sport
        const oddsKey = options.oddsKey;
        if (oddsKey) {
            console.log(`[dataProvider] ${sport}: trying Odds API fallback (${oddsKey})`);
            return await fetchOddsData(oddsKey);
        }
        return [];
    }

    const out = fixtures.slice(0, 30).map(f => normalizeFixture(f, sport));
    console.log(`[dataProvider] ${sport}: fetched=${fixtures.length} returned=${out.length}`);
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
