// config.js
require('dotenv').config();

module.exports = {
    database: {
        url: process.env.DATABASE_URL || 'sqlite:./database.sqlite',
    },
    rapidApiKey: process.env.RAPIDAPI_KEY,
    oddsApiKey: process.env.ODDS_API_KEY,
    maxPredictionsPerDay: 500,
    deepTierConfidenceThreshold: 75,
    jwtSecret: process.env.JWT_SECRET,   // <-- new line
    tiers: {
        normal4:  { daily: 50,  deep: false },
        normal9:  { daily: 100, deep: false },
        normal14: { daily: 150, deep: false },
        normal30: { daily: 300, deep: false },
        deep4:    { daily: 75,  deep: true },
        deep9:    { daily: 150, deep: true },
        deep14:   { daily: 225, deep: true },
        deep30:   { daily: 500, deep: true }
    }
};