const axios = require('axios');
const config = require('./config');

class APISportsClient {
    constructor() {
        this.apiKey = config.apiSportsKey;
        this.maxKeySlots = 10;
    }

    getBaseUrl(sport) {
        const urls = {
            football:         'https://v3.football.api-sports.io',
            afl:              'https://v1.afl.api-sports.io',
            baseball:         'https://v1.baseball.api-sports.io',
            basketball:       'https://v1.basketball.api-sports.io',
            formula1:         'https://v1.formula-1.api-sports.io',
            handball:         'https://v1.handball.api-sports.io',
            hockey:           'https://v1.hockey.api-sports.io',
            mma:              'https://v1.mma.api-sports.io',
            nba:              'https://v2.nba.api-sports.io',
            american_football:'https://v1.american-football.api-sports.io',
            rugby:            'https://v1.rugby.api-sports.io',
            volleyball:       'https://v1.volleyball.api-sports.io'
        };
        return urls[sport] || urls.football;
    }

    getHostForSport(sport) {
        return this.getBaseUrl(sport).replace(/^https?:\/\//, '');
    }

    getEnvPrefixForSport(sport) {
        const prefixes = {
            football: 'API_FOOTBALL_KEY',
            basketball: 'API_BASKETBALL_KEY',
            nba: 'API_NBA_KEY',
            afl: 'API_AFL_KEY',
            baseball: 'API_BASEBALL_KEY',
            formula1: 'API_FORMULA1_KEY',
            handball: 'API_HANDBALL_KEY',
            hockey: 'API_HOCKEY_KEY',
            mma: 'API_MMA_KEY',
            american_football: 'API_NFL_KEY',
            rugby: 'API_RUGBY_KEY',
            volleyball: 'API_VOLLEYBALL_KEY'
        };
        return prefixes[sport] || 'API_FOOTBALL_KEY';
    }

    getKeysForSport(sport) {
        const prefix = this.getEnvPrefixForSport(sport);
        const keys = [];

        for (let i = 1; i <= this.maxKeySlots; i += 1) {
            const value = process.env[`${prefix}_${i}`];
            if (value && String(value).trim()) {
                keys.push(String(value).trim());
            }
        }

        if (this.apiKey && String(this.apiKey).trim()) {
            keys.push(String(this.apiKey).trim());
        }

        return [...new Set(keys)];
    }

    hasQuotaErrorPayload(data) {
        const errors = data && data.errors ? data.errors : null;
        if (!errors || typeof errors !== 'object') return false;
        return Boolean(errors.requests || errors.token);
    }

    async requestWithRotation(sport, endpoint, params) {
        const baseUrl = this.getBaseUrl(sport);
        const keys = this.getKeysForSport(sport);

        if (!keys.length) {
            throw new Error(`No API keys configured for sport=${sport}`);
        }

        let lastError = null;
        for (let i = 0; i < keys.length; i += 1) {
            const key = keys[i];
            const headers = {
                'x-apisports-key': key,
                'x-rapidapi-host': this.getHostForSport(sport)
            };

            try {
                const response = await axios.get(`${baseUrl}/${endpoint}`, {
                    headers,
                    params
                });

                if (this.hasQuotaErrorPayload(response.data)) {
                    console.warn(`[API-Sports] ${sport} key ${i + 1} exhausted. Rotating...`);
                    lastError = new Error(`Quota/token exhausted for key index ${i + 1}`);
                    continue;
                }

                return response.data;
            } catch (error) {
                const payload = error.response && error.response.data ? error.response.data : null;
                if (this.hasQuotaErrorPayload(payload)) {
                    console.warn(`[API-Sports] ${sport} key ${i + 1} exhausted via error payload. Rotating...`);
                    lastError = error;
                    continue;
                }
                lastError = error;
            }
        }

        throw new Error(
            `[API-Sports] all keys exhausted/failed for ${sport}: ${lastError ? lastError.message : 'unknown error'}`
        );
    }

    getEndpoint(sport) {
        const endpoints = {
            football:         'fixtures',
            formula1:         'races',
            mma:              'fights'
        };
        return endpoints[sport] || 'games';
    }

    async getFixtures(leagueId, season, options = {}, sport = 'football') {
        try {
            const endpoint = this.getEndpoint(sport);
            const params = {};

            if (leagueId) params.league = leagueId;
            if (season) params.season = season;
            if (options.from) params.from = options.from;
            if (options.to) params.to = options.to;
            if (options.date) params.date = options.date;
            if (options.page) params.page = options.page;

            console.log(`[API-Sports] ${sport}: ${endpoint}`, params);
            const data = await this.requestWithRotation(sport, endpoint, params);

            console.log(`[API-Sports] ${sport}: results=${data.results || 0}`);
            if (data.errors && Object.keys(data.errors).length > 0) {
                console.warn(`[API-Sports] ${sport} errors:`, data.errors);
            }

            return data;
        } catch (error) {
            console.error(`[API-Sports] ${sport} error:`, error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
            return null;
        }
    }

    // NEW: Get teams for a league and season
    async getTeams(leagueId, season, sport = 'football') {
        try {
            const params = { league: leagueId, season };

            console.log(`🌐 Calling API: ${sport}/teams`, params);
            const data = await this.requestWithRotation(sport, 'teams', params);

            if (data.errors && Object.keys(data.errors).length > 0) {
                console.log('⚠️ API errors:', data.errors);
            }
            console.log(`📊 Results count: ${data.results || 0}`);

            return data;
        } catch (error) {
            console.error('❌ API-Sports teams error:', error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
            return null;
        }
    }

    async getTeamStats(leagueId, season, teamId, sport = 'football') {
        try {
            return await this.requestWithRotation(sport, 'teams/statistics', {
                league: leagueId,
                season,
                team: teamId
            });
        } catch (error) {
            console.error('API-Sports team stats error:', error.message);
            return null;
        }
    }

    async getInjuries(leagueId, season, sport = 'football') {
        try {
            return await this.requestWithRotation(sport, 'injuries', {
                league: leagueId,
                season
            });
        } catch (error) {
            console.error('API-Sports injuries error:', error.message);
            return null;
        }
    }
}

class OddsAPIClient {
    constructor() {
        this.apiKey = config.oddsApiKey;
        this.baseUrl = 'https://api.the-odds-api.com/v4';
    }

    async getOdds(sportKey, regions = 'us', markets = 'h2h') {
        try {
            const response = await axios.get(`${this.baseUrl}/sports/${sportKey}/odds`, {
                params: {
                    apiKey: this.apiKey,
                    regions,
                    markets
                }
            });
            return response.data;
        } catch (error) {
            console.error('Odds API error:', error.message);
            return null;
        }
    }
}

module.exports = { APISportsClient, OddsAPIClient };