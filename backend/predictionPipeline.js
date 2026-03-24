// predictionPipeline.js
const config = require('./config');

class PredictionPipeline {
    constructor(matchId, getMatch, getTeamStats, getInjuries, getNewsSentiment) {
        this.matchId = matchId;
        this.getMatch = getMatch;
        this.getTeamStats = getTeamStats;
        this.getInjuries = getInjuries;
        this.getNewsSentiment = getNewsSentiment;
        this.match = null;
        this.stageResults = {};
    }

    async run() {
        this.match = await this.getMatch(this.matchId);
        if (!this.match) return null;

        await this.stage1();
        await this.stage2();
        await this.stage3();
        await this.stage4();
        if (!this.stage5()) return null;
        return this.stage6();
    }

    async stage1() {
        const homeStats = await this.getTeamStats(this.match.home_team_id);
        const awayStats = await this.getTeamStats(this.match.away_team_id);

        let homeProb = 34, drawProb = 33, awayProb = 33;
        if (homeStats && awayStats) {
            const homeStrength = homeStats.points / homeStats.matches_played;
            const awayStrength = awayStats.points / awayStats.matches_played;
            const total = homeStrength + awayStrength + 2;
            homeProb = ((homeStrength + 1) / total) * 100;
            awayProb = ((awayStrength + 1) / total) * 100;
            drawProb = 100 - homeProb - awayProb;
        }

        this.stageResults.stage1 = {
            home: Math.round(homeProb * 10) / 10,
            draw: Math.round(drawProb * 10) / 10,
            away: Math.round(awayProb * 10) / 10,
            confidence: 'medium'
        };
    }

    async stage2() {
        const s1 = this.stageResults.stage1;
        if (!s1) return;

        const injuriesHome = await this.getInjuries(this.match.home_team_id);
        const injuriesAway = await this.getInjuries(this.match.away_team_id);
        const injCountHome = injuriesHome ? injuriesHome.length : 0;
        const injCountAway = injuriesAway ? injuriesAway.length : 0;

        let homeAdj = s1.home - (injCountHome * 5);
        let awayAdj = s1.away - (injCountAway * 5);
        let drawAdj = s1.draw + (injCountHome * 2.5) + (injCountAway * 2.5);

        const total = homeAdj + drawAdj + awayAdj;
        homeAdj = (homeAdj / total) * 100;
        drawAdj = (drawAdj / total) * 100;
        awayAdj = (awayAdj / total) * 100;

        this.stageResults.stage2 = {
            home: Math.round(homeAdj * 10) / 10,
            draw: Math.round(drawAdj * 10) / 10,
            away: Math.round(awayAdj * 10) / 10,
            injuries: { home: injCountHome, away: injCountAway },
            confidence: injCountHome + injCountAway > 0 ? 'medium-low' : 'medium'
        };
    }

    async stage3() {
        const s2 = this.stageResults.stage2 || this.stageResults.stage1;
        if (!s2) return;

        const homeSentiment = await this.getNewsSentiment(this.match.home_team_id);
        const awaySentiment = await this.getNewsSentiment(this.match.away_team_id);

        let homeAdj = s2.home + (homeSentiment * 2);
        let awayAdj = s2.away + (awaySentiment * 2);
        let drawAdj = 100 - homeAdj - awayAdj;

        const riskFlags = [];
        if (Math.abs(homeSentiment) > 0.5 || Math.abs(awaySentiment) > 0.5) {
            riskFlags.push('team_unrest');
        }

        const volatility = riskFlags.length >= 2 ? 'high' : riskFlags.length === 1 ? 'medium' : 'low';

        this.stageResults.stage3 = {
            home: Math.round(homeAdj * 10) / 10,
            draw: Math.round(drawAdj * 10) / 10,
            away: Math.round(awayAdj * 10) / 10,
            volatility,
            riskFlags,
            confidence: riskFlags.length ? 'medium-low' : 'medium'
        };
    }

    async stage4() {
        const s3 = this.stageResults.stage3 || this.stageResults.stage2 || this.stageResults.stage1;
        if (!s3) return;

        const home = s3.home;
        const draw = s3.draw;
        const away = s3.away;

        const recommended = [];
        if (home > 45) recommended.push('Home Win');
        else if (away > 45) recommended.push('Away Win');
        else if (draw > 40) recommended.push('Draw');

        // Placeholder for BTTS and O/U probabilities – in real implementation, use ML models
        const bttsProb = 50 + Math.random() * 30;
        const over25Prob = 50 + Math.random() * 30;
        const under25Prob = 100 - over25Prob;

        if (recommended.includes('Home Win') || recommended.includes('Away Win')) {
            if (bttsProb > 50 && over25Prob > 50) {
                recommended.push('BTTS Yes', 'Over 2.5');
            } else if (bttsProb < 30 && under25Prob > 50) {
                recommended.push('BTTS No', 'Under 2.5');
            }
        }

        const accaSafe = s3.volatility === 'low' && 
                         ((home > 50 && away > 50) || (home > 50 && draw > 50) || (away > 50 && draw > 50));

        const confidence = Math.round((home + draw + away) / 3);

        this.stageResults.stage4 = {
            recommended,
            avoid: [],
            accaSafe,
            confidence,
            bttsProb: Math.round(bttsProb * 10) / 10,
            over25Prob: Math.round(over25Prob * 10) / 10,
            under25Prob: Math.round(under25Prob * 10) / 10,
            home,
            draw,
            away
        };
    }

    stage5() {
        const s4 = this.stageResults.stage4;
        if (!s4) return false;

        const rec = s4.recommended;

        // Conflict: Home Win + BTTS Yes + Under 2.5 impossible
        if (rec.includes('Home Win') && rec.includes('BTTS Yes') && rec.includes('Under 2.5')) {
            console.warn(`Conflict detected for match ${this.matchId}: Home Win + BTTS + Under 2.5`);
            const idx = rec.indexOf('BTTS Yes'); if (idx !== -1) rec.splice(idx, 1);
            const idx2 = rec.indexOf('Under 2.5'); if (idx2 !== -1) rec.splice(idx2, 1);
        }

        // Conflict: Away Win + BTTS Yes + Under 2.5 impossible
        if (rec.includes('Away Win') && rec.includes('BTTS Yes') && rec.includes('Under 2.5')) {
            console.warn(`Conflict detected for match ${this.matchId}: Away Win + BTTS + Under 2.5`);
            const idx = rec.indexOf('BTTS Yes'); if (idx !== -1) rec.splice(idx, 1);
            const idx2 = rec.indexOf('Under 2.5'); if (idx2 !== -1) rec.splice(idx2, 1);
        }

        // Conflict: Draw + BTTS No + Over 2.5 impossible
        if (rec.includes('Draw') && rec.includes('BTTS No') && rec.includes('Over 2.5')) {
            console.warn(`Conflict detected for match ${this.matchId}: Draw + BTTS No + Over 2.5`);
            const idx = rec.indexOf('BTTS No'); if (idx !== -1) rec.splice(idx, 1);
            const idx2 = rec.indexOf('Over 2.5'); if (idx2 !== -1) rec.splice(idx2, 1);
        }

        return true;
    }

    stage6() {
        const s4 = this.stageResults.stage4;
        const s3 = this.stageResults.stage3 || {};
        const confidence = s4.confidence;

        const normalTier = confidence >= 50;
        const deepTier = confidence >= (config.deepTierConfidenceThreshold || 75);

        return {
            matchId: this.matchId,
            probHome: s4.home,
            probDraw: s4.draw,
            probAway: s4.away,
            bttsProb: s4.bttsProb,
            over25Prob: s4.over25Prob,
            under25Prob: s4.under25Prob,
            recommended: s4.recommended,
            avoid: s4.avoid,
            accaSafe: s4.accaSafe,
            confidence,
            volatility: s3.volatility || 'medium',
            riskFlags: s3.riskFlags || [],
            normalTier,
            deepTier,
            createdAt: new Date(),
            validUntil: this.match.match_date ? new Date(new Date(this.match.match_date).getTime() - 6*60*60*1000) : null
        };
    }
}

module.exports = PredictionPipeline;