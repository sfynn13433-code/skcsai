'use strict';

const config = require('../config');
const { APISportsClient, OddsAPIClient } = require('../apiClients');

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

function humanizeCompetitionLabel(value) {
    const key = String(value || '').trim();
    if (!key) return null;

    const aliases = {
        soccer_epl: 'Premier League',
        soccer_england_efl_cup: 'EFL Cup',
        soccer_uefa_champs_league: 'UEFA Champions League',
        soccer_uefa_europa_league: 'UEFA Europa League',
        soccer_spain_la_liga: 'La Liga',
        soccer_germany_bundesliga: 'Bundesliga',
        soccer_italy_serie_a: 'Serie A',
        soccer_france_ligue_one: 'Ligue 1',
        basketball_nba: 'NBA',
        basketball_euroleague: 'EuroLeague',
        americanfootball_nfl: 'NFL',
        icehockey_nhl: 'NHL',
        baseball_mlb: 'MLB',
        mma_mixed_martial_arts: 'MMA',
        aussierules_afl: 'AFL',
        rugbyunion_international: 'International Rugby',
        rugbyunion_six_nations: 'Six Nations'
    };

    if (aliases[key]) return aliases[key];

    return key
        .split('_')
        .filter(Boolean)
        .map(part => part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function derivePredictionFromH2HOutcomes(event) {
    const bookmakers = Array.isArray(event?.bookmakers) ? event.bookmakers : [];

    for (const bookmaker of bookmakers) {
        const markets = Array.isArray(bookmaker?.markets) ? bookmaker.markets : [];
        const h2h = markets.find((market) => market?.key === 'h2h');
        const outcomes = Array.isArray(h2h?.outcomes) ? h2h.outcomes : [];
        if (outcomes.length < 2) continue;

        const ranked = outcomes
            .filter((outcome) => typeof outcome?.price === 'number' && Number.isFinite(outcome.price))
            .sort((a, b) => a.price - b.price);

        const best = ranked[0];
        const second = ranked[1] || null;
        if (!best) continue;

        const bestName = String(best.name || '').trim();
        const prediction = bestName === event.home_team
            ? 'home_win'
            : bestName === event.away_team
                ? 'away_win'
                : null;

        if (!prediction) continue;

        const gap = second ? Math.max(0, second.price - best.price) : 0.15;
        const confidence = Math.max(56, Math.min(78, 58 + gap * 35));
        const volatility = confidence >= 72 ? 'low' : confidence >= 64 ? 'medium' : 'high';

        return {
            prediction,
            confidence: Math.round(confidence * 100) / 100,
            volatility,
            bookmaker: bookmaker.title || null
        };
    }

    return null;
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

    return data.map(event => {
        const marketView = derivePredictionFromH2HOutcomes(event);
        return {
        match_id: `odds-${event.id}`,
        sport: normalizedSport,
        home_team: event.home_team,
        away_team: event.away_team,
        date: event.commence_time || null,
        market: '1X2',
        prediction: marketView?.prediction || null,
        confidence: marketView?.confidence || null,
        volatility: marketView?.volatility || null,
        odds: null,
        provider: 'odds-api',
        league: event.sport_title || humanizeCompetitionLabel(sportKey),
        bookmaker: marketView?.bookmaker || null
    };
    });
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
            odds: null,
            provider: 'api-sports',
            league: f.league?.name || null,
            country: f.league?.country || null,
            round: f.league?.round || null,
            venue: f.fixture?.venue?.name || null
        };
    }
    // Other sports v1/v2 format (games, races, fights)
    const id = f.id || f.game?.id || f.fight?.id || f.race?.id;
    const home = f.teams?.home?.name || f.players?.home?.name || f.competitors?.[0]?.name || null;
    const away = f.teams?.away?.name || f.players?.away?.name || f.competitors?.[1]?.name || null;
    const date = f.date || f.game?.date || f.fight?.date || f.race?.date || null;
    const status = f.status?.short || f.game?.status?.short || null;
    const league = f.league?.name || f.competition?.name || f.tournament?.name || humanizeCompetitionLabel(sport);
    const venue = f.venue?.name || f.game?.venue?.name || f.race?.circuit?.name || null;

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
        odds: null,
        provider: 'api-sports',
        league,
        venue,
        stage: f.stage || f.competition?.stage || f.tournament?.stage || null
    };
}

async function buildLiveData(options = {}) {
    const sport = options.sport || 'football';
    const leagueId = options.leagueId || null;
    const season = options.season || null;
    const today = todayStr();
    const windowEnd = futureStr(5);

    const client = new APISportsClient();

    // Build query options based on sport
    const queryOpts = { from: today, to: windowEnd };

    let data = await client.getFixtures(leagueId, season, queryOpts, sport);
    let fixtures = data?.response || [];

    // Some sports only support single-day queries. Retry with `date` if needed.
    if (fixtures.length === 0 && sport !== 'football') {
        data = await client.getFixtures(leagueId, season, { date: today }, sport);
        fixtures = data?.response || [];
    }

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
