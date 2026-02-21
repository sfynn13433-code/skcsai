// apiClients.js
const axios = require('axios');
const config = require('./config');

class APISportsClient {
    constructor() {
        this.apiKey = config.rapidApiKey;
        this.baseUrl = 'https://api-football-v1.p.rapidapi.com/v3';
        this.headers = {
            'X-RapidAPI-Key': this.apiKey,
            'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
        };
    }

    async getFixtures(leagueId, season) {
        try {
            const response = await axios.get(`${this.baseUrl}/fixtures`, {
                headers: this.headers,
                params: { league: leagueId, season }
            });
            return response.data;
        } catch (error) {
            console.error('API-Sports error:', error.message);
            return null;
        }
    }

    async getTeamStats(leagueId, season, teamId) {
        try {
            const response = await axios.get(`${this.baseUrl}/teams/statistics`, {
                headers: this.headers,
                params: { league: leagueId, season, team: teamId }
            });
            return response.data;
        } catch (error) {
            console.error('API-Sports team stats error:', error.message);
            return null;
        }
    }

    async getInjuries(leagueId, season) {
        try {
            const response = await axios.get(`${this.baseUrl}/injuries`, {
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