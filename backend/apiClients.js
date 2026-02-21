const axios = require('axios');
const config = require('./config');

class APISportsClient {
    constructor() {
        this.apiKey = config.apiSportsKey;
        this.headers = {
            'x-apisports-key': this.apiKey
        };
    }

    getBaseUrl(sport) {
        if (sport === 'basketball') {
            return 'https://v1.basketball.api-sports.io';
        }
        // default to football
        return 'https://v3.football.api-sports.io';
    }

    async getFixtures(leagueId, season, options = {}, sport = 'football') {
        try {
            const baseUrl = this.getBaseUrl(sport);
            const params = { league: leagueId, season };
            if (options.from) params.from = options.from;
            if (options.to) params.to = options.to;
            if (options.page) params.page = options.page;

            console.log(`🌐 Calling API: ${baseUrl}/fixtures`, params);

            const response = await axios.get(`${baseUrl}/fixtures`, {
                headers: this.headers,
                params
            });

            console.log(`✅ API response status: ${response.status}`);
            if (response.data.errors && Object.keys(response.data.errors).length > 0) {
                console.log('⚠️ API errors:', response.data.errors);
            }
            console.log(`📊 Results count: ${response.data.results || 0}`);

            return response.data;
        } catch (error) {
            console.error('❌ API-Sports error:', error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
            return null;
        }
    }

    // NEW: Get teams for a league and season
    async getTeams(leagueId, season, sport = 'football') {
        try {
            const baseUrl = this.getBaseUrl(sport);
            const params = { league: leagueId, season };

            console.log(`🌐 Calling API: ${baseUrl}/teams`, params);

            const response = await axios.get(`${baseUrl}/teams`, {
                headers: this.headers,
                params
            });

            console.log(`✅ API response status: ${response.status}`);
            if (response.data.errors && Object.keys(response.data.errors).length > 0) {
                console.log('⚠️ API errors:', response.data.errors);
            }
            console.log(`📊 Results count: ${response.data.results || 0}`);

            return response.data;
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
            const baseUrl = this.getBaseUrl(sport);
            const response = await axios.get(`${baseUrl}/teams/statistics`, {
                headers: this.headers,
                params: { league: leagueId, season, team: teamId }
            });
            return response.data;
        } catch (error) {
            console.error('API-Sports team stats error:', error.message);
            return null;
        }
    }

    async getInjuries(leagueId, season, sport = 'football') {
        try {
            const baseUrl = this.getBaseUrl(sport);
            const response = await axios.get(`${baseUrl}/injuries`, {
                headers: this.headers,
                params: { league: leagueId, season }
            });
            return response.data;
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

    async getOdds(sportKey, regions = 'uk', markets = 'h2h') {
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