// predictionPipeline.js – your 6-stage chef (uses the apiClients.js you just showed me)
const { APISportsClient, OddsAPIClient } = require('./apiClients');
const config = require('./config'); // your keys go here next

const apiSports = new APISportsClient();
const oddsAPI = new OddsAPIClient();

async function runFullPipeline(sport = 'football') {
  console.log(`🚀 Starting 6-stage pipeline for ${sport}...`);

  // Stage 1: API Data Collection (uses your apiClients.js)
  let fixturesData;
  if (sport === 'football') {
    fixturesData = await apiSports.getFixtures(39, 2026); // Premier League example
  } else if (sport === 'basketball') {
    // Small fix for basketball (docs say /games, not /fixtures)
    fixturesData = await apiSports.getFixtures(1, 2026, {}, 'basketball'); // change if needed
  }
  // Add more sports later

  // Stage 2: Normalization (clean the data)
  const matches = fixturesData?.response?.map(m => ({
    id: m.fixture?.id || m.id,
    home: m.teams?.home?.name || m.home_team,
    away: m.teams?.away?.name || m.away_team,
    date: m.fixture?.date || m.date
  })) || [];

  // Stage 3-6: Simple prediction + confidence + risk flag (we make it smarter next week)
  const predictions = matches.map(match => ({
    ...match,
    recommendation: Math.random() > 0.5 ? 'Home Win' : 'Away Win', // real AI later
    confidence: Math.floor(Math.random() * 30) + 65, // 65-95%
    risk_flag: Math.random() > 0.7 ? 'medium' : 'low'
  }));

  console.log(`✅ Pipeline finished – ${predictions.length} predictions ready!`);
  return predictions;
}

module.exports = { runFullPipeline };
