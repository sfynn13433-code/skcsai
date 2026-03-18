'use strict';

const KNOWN_MARKETS = new Set([
    '1X2',
    'double_chance',
    'over_2_5',
    'under_2_5',
    'btts_yes',
    'btts_no'
]);

const KNOWN_VOLATILITY = new Set(['low', 'medium', 'high']);

function assert(condition, message) {
    if (!condition) {
        const err = new Error(message);
        err.name = 'ValidationError';
        throw err;
    }
}

function validateConfidence(confidence) {
    assert(typeof confidence === 'number' && !Number.isNaN(confidence), 'confidence must be a number');
    assert(confidence >= 0 && confidence <= 100, 'confidence must be between 0 and 100');
}

function validateMarket(market) {
    assert(typeof market === 'string' && market.length > 0, 'market must be a non-empty string');
    assert(KNOWN_MARKETS.has(market), `market is not known: ${market}`);
}

function validateVolatility(volatility) {
    assert(typeof volatility === 'string' && volatility.length > 0, 'volatility must be a non-empty string');
    assert(KNOWN_VOLATILITY.has(volatility), `volatility is not valid: ${volatility}`);
}

function validateMatchId(matchId) {
    assert(typeof matchId === 'string' && matchId.trim().length > 0, 'match_id must be a non-empty string');
}

function validateRawPredictionInput(pred) {
    assert(pred && typeof pred === 'object', 'prediction must be an object');

    validateMatchId(pred.match_id);

    assert(typeof pred.sport === 'string' && pred.sport.trim().length > 0, 'sport must be a non-empty string');
    validateMarket(pred.market);

    assert(typeof pred.prediction === 'string' && pred.prediction.trim().length > 0, 'prediction must be a non-empty string');
    validateConfidence(pred.confidence);
    validateVolatility(pred.volatility);

    if (pred.odds !== null && pred.odds !== undefined) {
        assert(typeof pred.odds === 'number' && !Number.isNaN(pred.odds), 'odds must be a number when provided');
        assert(pred.odds > 0, 'odds must be > 0');
    }

    if (pred.metadata !== null && pred.metadata !== undefined) {
        assert(typeof pred.metadata === 'object', 'metadata must be an object when provided');
    }
}

function validateRawPredictionForInsert(row) {
    validateRawPredictionInput({
        match_id: row.match_id,
        sport: row.sport,
        market: row.market,
        prediction: row.prediction,
        confidence: row.confidence,
        volatility: row.volatility,
        odds: row.odds,
        metadata: row.metadata
    });
}

module.exports = {
    KNOWN_MARKETS,
    KNOWN_VOLATILITY,
    validateConfidence,
    validateMarket,
    validateVolatility,
    validateMatchId,
    validateRawPredictionInput,
    validateRawPredictionForInsert
};
