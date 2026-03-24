// config.js
require('dotenv').config();

module.exports = {
    DATA_MODE: process.env.DATA_MODE || 'test',
    database: {
        url: process.env.DATABASE_URL,
    },
    supabase: {
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY,
    },
    // Original RapidAPI key – used for other RapidAPI services
    rapidApiKey: process.env.RAPIDAPI_KEY,
    
    // Dedicated API‑Sports key – used ONLY for sports data
    apiSportsKey: process.env.X_APISPORTS_KEY,
    
    oddsApiKey: process.env.ODDS_API_KEY,
    maxPredictionsPerDay: 500,
    deepTierConfidenceThreshold: 75,
    jwtSecret: process.env.JWT_SECRET,
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