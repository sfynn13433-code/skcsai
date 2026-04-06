'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { APISportsClient } = require('../backend/apiClients');

require('dotenv').config({
    path: path.join(__dirname, '..', 'backend', '.env'),
    quiet: true
});

const DEFAULT_DATE = new Date().toISOString().slice(0, 10);
const SUPPORTED_SPORTS = new Set(['football']);
const footballClient = new APISportsClient();
const diagnosticsCache = new Map();

function parseArgs(argv) {
    const args = {
        date: DEFAULT_DATE,
        sport: 'football',
        runId: null
    };

    for (const arg of argv) {
        if (arg.startsWith('--date=')) {
            args.date = arg.slice('--date='.length);
        } else if (arg.startsWith('--sport=')) {
            args.sport = arg.slice('--sport='.length).toLowerCase();
        } else if (arg.startsWith('--run-id=')) {
            const value = Number(arg.slice('--run-id='.length));
            args.runId = Number.isFinite(value) ? value : null;
        }
    }

    return args;
}

function normalizePrediction(prediction) {
    return String(prediction || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_')
        .replace(/-/g, '_');
}

function parseNumber(value) {
    if (value === null || typeof value === 'undefined' || value === '') return null;
    const numeric = Number(String(value).replace('%', '').trim());
    return Number.isFinite(numeric) ? numeric : null;
}

function deriveMatchResult(scores) {
    if (!Number.isFinite(scores.home) || !Number.isFinite(scores.away)) {
        return null;
    }

    if (scores.home > scores.away) return 'HOME_WIN';
    if (scores.home < scores.away) return 'AWAY_WIN';
    return 'DRAW';
}

function extractScores(rawProviderData) {
    const fulltime = rawProviderData?.score?.fulltime || rawProviderData?.goals || {};
    const halftime = rawProviderData?.score?.halftime || {};

    return {
        fulltime: {
            home: parseNumber(fulltime.home),
            away: parseNumber(fulltime.away)
        },
        halftime: {
            home: parseNumber(halftime.home),
            away: parseNumber(halftime.away)
        }
    };
}

function extractFixtureId(rawProviderData) {
    const fixtureId = rawProviderData?.fixture?.id;
    return Number.isFinite(Number(fixtureId)) ? Number(fixtureId) : null;
}

function buildStatsByTeam(statRows) {
    const map = new Map();
    for (const row of statRows || []) {
        const teamId = row?.team?.id ? String(row.team.id) : null;
        const teamName = row?.team?.name || null;
        const normalized = {};
        for (const stat of row?.statistics || []) {
            normalized[stat.type] = stat.value;
        }

        const entry = {
            teamId,
            teamName,
            corners: parseNumber(normalized['Corner Kicks']),
            redCards: parseNumber(normalized['Red Cards']),
            yellowCards: parseNumber(normalized['Yellow Cards']),
            shotsOnGoal: parseNumber(normalized['Shots on Goal']),
            totalShots: parseNumber(normalized['Total Shots']),
            possession: parseNumber(normalized['Ball Possession'])
        };

        if (teamId) map.set(teamId, entry);
        if (teamName) map.set(teamName.toLowerCase(), entry);
    }
    return map;
}

function getTeamStats(statsByTeam, teamId, teamName) {
    if (teamId && statsByTeam.has(String(teamId))) {
        return statsByTeam.get(String(teamId));
    }
    if (teamName && statsByTeam.has(String(teamName).toLowerCase())) {
        return statsByTeam.get(String(teamName).toLowerCase());
    }
    return null;
}

function countRedCardEvents(events) {
    return (events || []).filter((event) => event.type === 'Card' && /red/i.test(String(event.detail || ''))).length;
}

function extractGoalEvents(events) {
    return (events || [])
        .filter((event) => event.type === 'Goal' && !/missed penalty/i.test(String(event.detail || '')))
        .map((event) => ({
            minute: parseNumber(event?.time?.elapsed),
            teamId: event?.team?.id ? String(event.team.id) : null,
            teamName: event?.team?.name || null,
            detail: event?.detail || null
        }))
        .sort((a, b) => (a.minute || 0) - (b.minute || 0));
}

async function fetchFootballDiagnostics(rawProviderData) {
    const fixtureId = extractFixtureId(rawProviderData);
    if (!fixtureId) {
        return { fixtureId: null, events: [], statistics: [], error: 'Missing fixture id' };
    }

    if (diagnosticsCache.has(fixtureId)) {
        return diagnosticsCache.get(fixtureId);
    }

    const promise = (async () => {
        try {
            const [eventsResponse, statisticsResponse] = await Promise.all([
                footballClient.requestWithRotation('football', 'fixtures/events', { fixture: fixtureId }),
                footballClient.requestWithRotation('football', 'fixtures/statistics', { fixture: fixtureId })
            ]);

            return {
                fixtureId,
                events: eventsResponse?.response || [],
                statistics: statisticsResponse?.response || [],
                error: null
            };
        } catch (error) {
            return {
                fixtureId,
                events: [],
                statistics: [],
                error: error.message
            };
        }
    })();

    diagnosticsCache.set(fixtureId, promise);
    return promise;
}

function parseMarketLine(market, prefix) {
    const match = String(market || '').match(new RegExp(`^${prefix}_(\\d+)_(\\d+)$`));
    if (!match) return null;
    return Number(`${match[1]}.${match[2]}`);
}

function evaluateFootballMarket(row, rawProviderData, diagnostics) {
    const scores = extractScores(rawProviderData);
    const matchResult = deriveMatchResult(scores.fulltime);
    const normalizedPrediction = normalizePrediction(row.predicted_outcome);
    const goalEvents = extractGoalEvents(diagnostics.events);
    const statsByTeam = buildStatsByTeam(diagnostics.statistics);
    const homeStats = getTeamStats(
        statsByTeam,
        rawProviderData?.teams?.home?.id,
        rawProviderData?.teams?.home?.name || row.home_team
    );
    const awayStats = getTeamStats(
        statsByTeam,
        rawProviderData?.teams?.away?.id,
        rawProviderData?.teams?.away?.name || row.away_team
    );
    const totalGoals = Number.isFinite(scores.fulltime.home) && Number.isFinite(scores.fulltime.away)
        ? scores.fulltime.home + scores.fulltime.away
        : null;
    const bothTeamsScored = Number.isFinite(scores.fulltime.home)
        && Number.isFinite(scores.fulltime.away)
        && scores.fulltime.home > 0
        && scores.fulltime.away > 0;
    const halftimeDraw = Number.isFinite(scores.halftime.home)
        && Number.isFinite(scores.halftime.away)
        && scores.halftime.home === scores.halftime.away;
    const totalCorners = [homeStats?.corners, awayStats?.corners].every(Number.isFinite)
        ? homeStats.corners + awayStats.corners
        : null;
    const totalRedCardsFromStats = [homeStats?.redCards, awayStats?.redCards].some((value) => Number.isFinite(value))
        ? (homeStats?.redCards || 0) + (awayStats?.redCards || 0)
        : null;
    const totalRedCards = totalRedCardsFromStats !== null
        ? totalRedCardsFromStats
        : countRedCardEvents(diagnostics.events);

    const context = {
        goalEvents,
        homeStats,
        awayStats,
        totalCorners,
        totalRedCards
    };

    if (!matchResult) {
        return {
            resolutionStatus: 'unsupported',
            isCorrect: null,
            actualResult: null,
            notes: 'Final score unavailable in canonical_events.raw_provider_data.',
            scores,
            context
        };
    }

    let isCorrect = null;
    let notes = null;

    switch (row.market) {
    case 'match_result':
        if (normalizedPrediction === 'HOME_WIN' || normalizedPrediction === 'HOME') {
            isCorrect = matchResult === 'HOME_WIN';
        } else if (normalizedPrediction === 'AWAY_WIN' || normalizedPrediction === 'AWAY') {
            isCorrect = matchResult === 'AWAY_WIN';
        } else if (normalizedPrediction === 'DRAW') {
            isCorrect = matchResult === 'DRAW';
        } else {
            notes = `Unsupported match_result prediction value: ${row.predicted_outcome}`;
        }
        break;
    case 'double_chance_1x':
        isCorrect = matchResult !== 'AWAY_WIN';
        break;
    case 'double_chance_x2':
        isCorrect = matchResult !== 'HOME_WIN';
        break;
    case 'double_chance_12':
        isCorrect = matchResult !== 'DRAW';
        break;
    case 'over_1_5':
        isCorrect = totalGoals !== null ? totalGoals > 1.5 : null;
        break;
    case 'over_2_5':
        isCorrect = totalGoals !== null ? totalGoals > 2.5 : null;
        break;
    case 'under_4_5':
        isCorrect = totalGoals !== null ? totalGoals < 4.5 : null;
        break;
    case 'btts_no':
        isCorrect = bothTeamsScored !== null ? !bothTeamsScored : null;
        break;
    case 'ht_draw':
        isCorrect = Number.isFinite(scores.halftime.home) && Number.isFinite(scores.halftime.away) ? halftimeDraw : null;
        if (isCorrect === null) notes = 'Halftime score unavailable in canonical_events.raw_provider_data.';
        break;
    default: {
        const cornersLine = parseMarketLine(row.market, 'corners_over');
        if (cornersLine !== null) {
            isCorrect = totalCorners !== null ? totalCorners > cornersLine : null;
            if (isCorrect === null) notes = 'Corner statistics unavailable from API-Sports.';
            break;
        }

        const redCardUnderLine = parseMarketLine(row.market, 'red_cards_under');
        if (redCardUnderLine !== null) {
            isCorrect = totalRedCards !== null ? totalRedCards < redCardUnderLine : null;
            if (isCorrect === null) notes = 'Red card statistics unavailable from API-Sports.';
            break;
        }

        notes = `Market ${row.market} is not yet supported by the evaluator.`;
        break;
    }
    }

    if (typeof isCorrect !== 'boolean') {
        return {
            resolutionStatus: 'unsupported',
            isCorrect: null,
            actualResult: matchResult,
            notes,
            scores,
            context
        };
    }

    return {
        resolutionStatus: isCorrect ? 'won' : 'lost',
        isCorrect,
        actualResult: matchResult,
        notes,
        scores,
        context
    };
}

function pickPredictedTeam(row) {
    switch (normalizePrediction(row.predicted_outcome)) {
    case 'HOME_WIN':
    case 'HOME':
        return { team: row.home_team, opponent: row.away_team };
    case 'AWAY_WIN':
    case 'AWAY':
        return { team: row.away_team, opponent: row.home_team };
    default:
        if (row.market === 'double_chance_1x') {
            return { team: row.home_team, opponent: row.away_team };
        }
        if (row.market === 'double_chance_x2') {
            return { team: row.away_team, opponent: row.home_team };
        }
        return { team: null, opponent: null };
    }
}

function selectPrimaryNewsSignal(teamNews) {
    if (!teamNews || !Array.isArray(teamNews.articles) || !teamNews.articles.length) {
        return null;
    }

    const priority = new Map([
        ['suspension', 6],
        ['injury_news', 5],
        ['lineup_news', 4],
        ['team_unrest', 4],
        ['manager_instability', 3],
        ['media_signal', 2]
    ]);

    return [...teamNews.articles].sort((a, b) => {
        const priorityDiff = (priority.get(b.signalType) || 0) - (priority.get(a.signalType) || 0);
        if (priorityDiff !== 0) return priorityDiff;
        const relevanceDiff = (Number(b.relevanceScore) || 0) - (Number(a.relevanceScore) || 0);
        if (relevanceDiff !== 0) return relevanceDiff;
        return (Number(a.sentimentScore) || 0) - (Number(b.sentimentScore) || 0);
    })[0];
}

function buildLossDiagnostics(row, evaluation, rawProviderData, diagnostics, storedContext = {}) {
    const reasons = [];
    const goalEvents = evaluation.context.goalEvents || [];
    const teamSelection = pickPredictedTeam(row);
    const predictedTeam = teamSelection.team;
    const opponentTeam = teamSelection.opponent;
    const actualResultLabel = evaluation.actualResult ? evaluation.actualResult.replace(/_/g, ' ') : null;
    const weatherSnapshot = storedContext.weather || null;
    const injurySnapshot = storedContext.injuries || null;
    const newsSnapshot = storedContext.news || null;

    if (evaluation.resolutionStatus === 'void') {
        return {
            summary: 'Match was postponed, so the pick was voided.',
            factors: [{ type: 'postponed', label: 'Postponed', detail: 'The fixture did not go ahead as scheduled.' }]
        };
    }

    if (evaluation.resolutionStatus === 'pending') {
        return {
            summary: `Awaiting a final result. Current event status: ${row.event_status}.`,
            factors: []
        };
    }

    if (evaluation.resolutionStatus === 'unsupported') {
        return {
            summary: evaluation.notes || 'This market cannot be graded from the currently stored evidence.',
            factors: []
        };
    }

    if (evaluation.resolutionStatus !== 'lost') {
        return {
            summary: `Prediction landed. Actual result: ${actualResultLabel || 'resolved'}.`,
            factors: []
        };
    }

    const redCardEvents = (diagnostics.events || []).filter((event) => event.type === 'Card' && /red/i.test(String(event.detail || '')));
    if (predictedTeam) {
        const teamRedCard = redCardEvents.find((event) => event.team?.name === predictedTeam);
        if (teamRedCard) {
            reasons.push({
                type: 'red_card',
                label: 'Red card',
                detail: `${predictedTeam} received a ${teamRedCard.detail.toLowerCase()} at ${teamRedCard.time?.elapsed}' (${teamRedCard.player?.name || 'unknown player'}).`
            });
        }
    }

    if (predictedTeam) {
        const missedPenalty = (diagnostics.events || []).find((event) =>
            event.team?.name === predictedTeam &&
            event.type === 'Goal' &&
            /missed penalty/i.test(String(event.detail || ''))
        );
        if (missedPenalty) {
            reasons.push({
                type: 'missed_penalty',
                label: 'Missed penalty',
                detail: `${predictedTeam} missed a penalty at ${missedPenalty.time?.elapsed}' (${missedPenalty.player?.name || 'unknown player'}).`
            });
        }
    }

    const totalGoals = Number.isFinite(evaluation.scores.fulltime.home) && Number.isFinite(evaluation.scores.fulltime.away)
        ? evaluation.scores.fulltime.home + evaluation.scores.fulltime.away
        : null;
    const totalCorners = evaluation.context.totalCorners;
    const totalRedCards = evaluation.context.totalRedCards;

    if (predictedTeam && injurySnapshot?.byTeam instanceof Map) {
        const teamInjuries = injurySnapshot.byTeam.get(String(predictedTeam).toLowerCase()) || null;
        if (teamInjuries && teamInjuries.total >= 2) {
            const sampleText = (teamInjuries.samples || [])
                .slice(0, 2)
                .map((sample) => `${sample.playerName || 'Unknown'} (${sample.statusReason || sample.statusType || 'missing'})`)
                .join(', ');
            reasons.push({
                type: 'injury_absences',
                label: 'Pre-match absences',
                detail: `${predictedTeam} had ${teamInjuries.total} recorded absences before kickoff${sampleText ? `, including ${sampleText}` : ''}.`
            });
        }
    }

    if (predictedTeam && newsSnapshot?.byTeam instanceof Map) {
        const teamNews = newsSnapshot.byTeam.get(String(predictedTeam).toLowerCase()) || null;
        const primaryNews = selectPrimaryNewsSignal(teamNews);
        const alreadyHasOfficialInjuryReason = reasons.some((reason) => reason.type === 'injury_absences');
        const isStrongNewsSignal = teamNews && (teamNews.total >= 2 || (primaryNews?.relevanceScore || 0) >= 4);

        if (primaryNews && isStrongNewsSignal) {
            if (primaryNews.signalType === 'suspension') {
                reasons.push({
                    type: 'suspension_news',
                    label: 'Suspension signal',
                    detail: `${predictedTeam} carried a pre-match suspension signal in the news window: "${primaryNews.articleTitle}".`
                });
            } else if (primaryNews.signalType === 'injury_news' && !alreadyHasOfficialInjuryReason) {
                reasons.push({
                    type: 'pre_match_injury_news',
                    label: 'Injury warning',
                    detail: `${predictedTeam} had negative pre-match availability coverage: "${primaryNews.articleTitle}".`
                });
            } else if (primaryNews.signalType === 'lineup_news') {
                reasons.push({
                    type: 'lineup_news',
                    label: 'Lineup uncertainty',
                    detail: `${predictedTeam} had lineup uncertainty before kickoff: "${primaryNews.articleTitle}".`
                });
            } else if (primaryNews.signalType === 'team_unrest') {
                reasons.push({
                    type: 'team_unrest',
                    label: 'Team unrest',
                    detail: `${predictedTeam} carried off-field instability into the fixture: "${primaryNews.articleTitle}".`
                });
            } else if (primaryNews.signalType === 'manager_instability') {
                reasons.push({
                    type: 'manager_instability',
                    label: 'Manager instability',
                    detail: `${predictedTeam} had pre-match coaching instability coverage: "${primaryNews.articleTitle}".`
                });
            } else if (primaryNews.signalType === 'media_signal' && Number(primaryNews.sentimentScore) <= -2) {
                reasons.push({
                    type: 'negative_media_signal',
                    label: 'Negative media signal',
                    detail: `${predictedTeam} went into the match under negative media pressure: "${primaryNews.articleTitle}".`
                });
            }
        }
    }

    if (weatherSnapshot) {
        const precipitation = Number(weatherSnapshot.precipitation_mm);
        const wind = Number(weatherSnapshot.wind_speed_kmh);
        const severeWeather = precipitation >= 2 || wind >= 25 || [95, 96, 99].includes(Number(weatherSnapshot.weather_code));
        const weatherSensitiveMarket = row.market.startsWith('over_') || row.market.startsWith('under_') || row.market.startsWith('corners_') || row.market === 'ht_draw';
        if (severeWeather && (weatherSensitiveMarket || !reasons.length)) {
            const conditions = [];
            if (Number.isFinite(precipitation) && precipitation > 0) conditions.push(`${precipitation} mm precipitation`);
            if (Number.isFinite(wind) && wind > 0) conditions.push(`${wind} km/h wind`);
            if (weatherSnapshot.weather_summary) conditions.push(weatherSnapshot.weather_summary);
            reasons.push({
                type: 'weather_volatility',
                label: 'Weather volatility',
                detail: `Kickoff conditions were volatile${conditions.length ? `: ${conditions.join(', ')}` : ''}.`
            });
        }
    }

    if (row.market === 'match_result' || row.market.startsWith('double_chance')) {
        if (predictedTeam && opponentTeam) {
            const predictedTeamStats = predictedTeam === row.home_team ? evaluation.context.homeStats : evaluation.context.awayStats;
            const opponentStats = predictedTeam === row.home_team ? evaluation.context.awayStats : evaluation.context.homeStats;

            const earlyOpponentGoals = goalEvents.filter((event) => event.teamName === opponentTeam && Number.isFinite(event.minute) && event.minute <= 45).length;
            if (earlyOpponentGoals >= 2) {
                reasons.push({
                    type: 'first_half_collapse',
                    label: 'First-half collapse',
                    detail: `${opponentTeam} scored ${earlyOpponentGoals} times before half-time.`
                });
            }

            const lateOpponentGoal = [...goalEvents].reverse().find((event) => event.teamName === opponentTeam && Number.isFinite(event.minute) && event.minute >= 75);
            if (lateOpponentGoal) {
                reasons.push({
                    type: 'late_goal_swing',
                    label: 'Late goal swing',
                    detail: `${opponentTeam} scored a decisive late goal at ${lateOpponentGoal.minute}'.`
                });
            }

            if (predictedTeamStats && opponentStats) {
                const predictedShots = predictedTeamStats.shotsOnGoal;
                const opponentShots = opponentStats.shotsOnGoal;
                const predictedPossession = predictedTeamStats.possession;
                const opponentPossession = opponentStats.possession;

                if (Number.isFinite(predictedShots) && Number.isFinite(opponentShots) && predictedShots >= opponentShots + 2) {
                    reasons.push({
                        type: 'finishing_variance',
                        label: 'Finishing variance',
                        detail: `${predictedTeam} still had more shots on target (${predictedShots} vs ${opponentShots}) but did not get the result.`
                    });
                } else if (
                    Number.isFinite(predictedPossession) &&
                    Number.isFinite(opponentPossession) &&
                    predictedPossession + 10 <= opponentPossession
                ) {
                    reasons.push({
                        type: 'match_control_lost',
                        label: 'Lost midfield control',
                        detail: `${predictedTeam} had only ${predictedPossession}% possession against ${opponentPossession}% for ${opponentTeam}.`
                    });
                }
            }
        }
    }

    if (row.market === 'over_1_5' || row.market === 'over_2_5' || row.market === 'under_4_5') {
        reasons.push({
            type: 'goal_total_miss',
            label: 'Goals line miss',
            detail: `The match finished with ${totalGoals} total goals, which did not clear the ${row.predicted_outcome} line.`
        });
    }

    if (row.market === 'btts_no') {
        reasons.push({
            type: 'both_teams_scored',
            label: 'BTTS miss',
            detail: `Both teams scored, so the BTTS-NO angle failed. Final score: ${evaluation.scores.fulltime.home}-${evaluation.scores.fulltime.away}.`
        });
    }

    if (row.market === 'ht_draw') {
        reasons.push({
            type: 'half_time_state',
            label: 'Half-time state',
            detail: `Half-time score was ${evaluation.scores.halftime.home}-${evaluation.scores.halftime.away}, not level.`
        });
    }

    if (row.market.startsWith('corners_over_') && totalCorners !== null) {
        reasons.push({
            type: 'corners_line_miss',
            label: 'Corners line miss',
            detail: `The match produced ${totalCorners} total corners, short of the ${row.predicted_outcome} target.`
        });
    }

    if (row.market.startsWith('red_cards_under_') && totalRedCards !== null) {
        reasons.push({
            type: 'red_card_line_miss',
            label: 'Discipline line miss',
            detail: `The match produced ${totalRedCards} red cards, so the ${row.predicted_outcome} market failed.`
        });
    }

    if (!reasons.length) {
        reasons.push({
            type: 'result_divergence',
            label: 'Result divergence',
            detail: 'The outcome moved away from the pre-match edge, but no stronger verified incident was captured in the current data.'
        });
    }

    return {
        summary: reasons[0].detail,
        factors: reasons.slice(0, 4)
    };
}

async function evaluatePrediction(row, storedContext = {}) {
    const rawResult = row.raw_provider_data || {};
    const eventStatus = row.event_status || 'missing';
    const base = {
        actualResult: null,
        resolutionStatus: 'pending',
        isCorrect: null,
        notes: null,
        scores: {
            fulltime: { home: null, away: null },
            halftime: { home: null, away: null }
        },
        diagnosticContext: {},
        lossReasonSummary: null,
        lossFactors: [],
        rawResult
    };

    if (!row.event_id || !row.raw_provider_data) {
        return {
            ...base,
            resolutionStatus: 'missing_event',
            notes: 'No canonical_events row matched this prediction leg.'
        };
    }

    if (!SUPPORTED_SPORTS.has(row.sport)) {
        return {
            ...base,
            resolutionStatus: 'unsupported',
            notes: `Sport ${row.sport} is not supported yet.`
        };
    }

    if (eventStatus === 'Match Postponed') {
        const postponedReasons = buildLossDiagnostics(
            row,
            { ...base, resolutionStatus: 'void', scores: base.scores, context: {} },
            row.raw_provider_data,
            { events: [], statistics: [], error: null },
            {
                injuries: storedContext.injuryMap?.get(row.event_id) || null,
                weather: storedContext.weatherMap?.get(row.event_id) || null,
                news: storedContext.newsMap?.get(row.event_id) || null
            }
        );
        return {
            ...base,
            resolutionStatus: 'void',
            notes: 'Event was postponed.',
            actualResult: 'POSTPONED',
            lossReasonSummary: postponedReasons.summary,
            lossFactors: postponedReasons.factors
        };
    }

    if (eventStatus !== 'Match Finished') {
        return {
            ...base,
            resolutionStatus: 'pending',
            notes: `Event status is ${eventStatus}.`
        };
    }

    const diagnostics = await fetchFootballDiagnostics(row.raw_provider_data);
    const evaluated = evaluateFootballMarket(row, row.raw_provider_data, diagnostics);
    const lossDiagnostics = buildLossDiagnostics(
        row,
        evaluated,
        row.raw_provider_data,
        diagnostics,
        {
            injuries: storedContext.injuryMap?.get(row.event_id) || null,
            weather: storedContext.weatherMap?.get(row.event_id) || null,
            news: storedContext.newsMap?.get(row.event_id) || null
        }
    );

    return {
        ...base,
        ...evaluated,
        diagnosticContext: {
            fixtureId: diagnostics.fixtureId,
            providerError: diagnostics.error,
            eventCount: diagnostics.events.length,
            statisticsTeams: diagnostics.statistics.length,
            totalCorners: evaluated.context.totalCorners ?? null,
            totalRedCards: evaluated.context.totalRedCards ?? null,
            injuryReportsForEvent: storedContext.injuryMap?.get(row.event_id)?.total || 0,
            weatherSnapshotAvailable: Boolean(storedContext.weatherMap?.get(row.event_id)),
            newsSignalsForEvent: storedContext.newsMap?.get(row.event_id)?.total || 0
        },
        lossReasonSummary: lossDiagnostics.summary,
        lossFactors: lossDiagnostics.factors
    };
}

async function ensureTableExists(client) {
    const sqlPaths = [
        path.join(__dirname, 'sql', 'create_prediction_publish_runs.sql'),
        path.join(__dirname, 'sql', 'create_predictions_accuracy.sql'),
        path.join(__dirname, 'sql', 'create_event_context_tables.sql')
    ];
    for (const sqlPath of sqlPaths) {
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await client.query(sql);
    }
}

async function loadStoredContext(client, eventIds) {
    if (!eventIds.length) {
        return { injuryMap: new Map(), weatherMap: new Map(), newsMap: new Map() };
    }

    const injuriesRes = await client.query(
        `SELECT event_id, team_name, status_type, status_reason, player_name
         FROM event_injury_snapshots
         WHERE event_id = ANY($1::text[])`,
        [eventIds]
    );
    const weatherRes = await client.query(
        `SELECT event_id, temperature_c, precipitation_mm, wind_speed_kmh, weather_code, weather_summary
         FROM event_weather_snapshots
         WHERE event_id = ANY($1::text[])`,
        [eventIds]
    );
    const newsRes = await client.query(
        `SELECT
            event_id,
            team_name,
            signal_type,
            signal_label,
            signal_strength,
            relevance_score,
            sentiment_score,
            evidence_keywords,
            article_title,
            article_url,
            published_at
         FROM event_news_snapshots
         WHERE event_id = ANY($1::text[])
         ORDER BY relevance_score DESC NULLS LAST, published_at DESC NULLS LAST`,
        [eventIds]
    );

    const injuryMap = new Map();
    for (const row of injuriesRes.rows || []) {
        if (!injuryMap.has(row.event_id)) {
            injuryMap.set(row.event_id, { total: 0, byTeam: new Map() });
        }
        const eventEntry = injuryMap.get(row.event_id);
        eventEntry.total += 1;

        const teamKey = String(row.team_name || 'unknown').toLowerCase();
        if (!eventEntry.byTeam.has(teamKey)) {
            eventEntry.byTeam.set(teamKey, { teamName: row.team_name || 'unknown', total: 0, samples: [] });
        }
        const teamEntry = eventEntry.byTeam.get(teamKey);
        teamEntry.total += 1;
        if (teamEntry.samples.length < 4) {
            teamEntry.samples.push({
                playerName: row.player_name,
                statusType: row.status_type,
                statusReason: row.status_reason
            });
        }
    }

    const weatherMap = new Map();
    for (const row of weatherRes.rows || []) {
        weatherMap.set(row.event_id, row);
    }

    const newsMap = new Map();
    for (const row of newsRes.rows || []) {
        if (!newsMap.has(row.event_id)) {
            newsMap.set(row.event_id, { total: 0, byTeam: new Map() });
        }
        const eventEntry = newsMap.get(row.event_id);
        eventEntry.total += 1;

        const teamKey = String(row.team_name || 'unknown').toLowerCase();
        if (!eventEntry.byTeam.has(teamKey)) {
            eventEntry.byTeam.set(teamKey, { teamName: row.team_name || 'unknown', total: 0, articles: [] });
        }

        const teamEntry = eventEntry.byTeam.get(teamKey);
        teamEntry.total += 1;
        if (teamEntry.articles.length < 6) {
            teamEntry.articles.push({
                signalType: row.signal_type,
                signalLabel: row.signal_label,
                signalStrength: row.signal_strength,
                relevanceScore: row.relevance_score,
                sentimentScore: row.sentiment_score,
                articleTitle: row.article_title,
                articleUrl: row.article_url,
                publishedAt: row.published_at,
                evidenceKeywords: row.evidence_keywords
            });
        }
    }

    return { injuryMap, weatherMap, newsMap };
}

async function resolvePublishRunId(client, date, sport, requestedRunId) {
    if (requestedRunId) {
        return requestedRunId;
    }

    const res = await client.query(
        `
        SELECT pf.publish_run_id
        FROM predictions_final pf
        LEFT JOIN prediction_publish_runs pr ON pr.id = pf.publish_run_id
        CROSS JOIN LATERAL jsonb_array_elements(pf.matches) AS leg(match_item)
        WHERE LEFT(COALESCE(leg.match_item->>'match_date', leg.match_item->>'commence_time', ''), 10) = $1
          AND COALESCE(leg.match_item->>'sport', '') = $2
          AND pf.publish_run_id IS NOT NULL
        GROUP BY pf.publish_run_id, COALESCE(pr.completed_at, pr.started_at)
        ORDER BY COALESCE(pr.completed_at, pr.started_at) DESC NULLS LAST, pf.publish_run_id DESC
        LIMIT 1
        `,
        [date, sport]
    );

    return res.rows?.[0]?.publish_run_id ? Number(res.rows[0].publish_run_id) : null;
}

async function fetchPredictionRows(client, date, sport, publishRunId) {
    const query = `
        SELECT
            pf.id AS prediction_final_id,
            pf.publish_run_id,
            pf.tier AS prediction_tier,
            pf.type AS prediction_type,
            pf.total_confidence AS confidence,
            leg.ordinality::integer - 1 AS prediction_match_index,
            COALESCE(leg.match_item->>'match_id', leg.match_item->'metadata'->>'event_id') AS event_id,
            COALESCE(leg.match_item->>'sport', '') AS sport,
            COALESCE(leg.match_item->>'market', leg.match_item->'metadata'->>'market', 'unknown') AS market,
            COALESCE(leg.match_item->>'prediction', leg.match_item->'metadata'->>'predicted_outcome', 'unknown') AS predicted_outcome,
            COALESCE(
                leg.match_item->'metadata'->>'prediction_source',
                leg.match_item->'metadata'->>'source',
                leg.match_item->'metadata'->>'provider_name',
                'unknown'
            ) AS prediction_source,
            leg.match_item->>'home_team' AS home_team,
            leg.match_item->>'away_team' AS away_team,
            LEFT(COALESCE(leg.match_item->>'match_date', leg.match_item->>'commence_time', ''), 10) AS fixture_date,
            ce.status AS event_status,
            ce.raw_provider_data,
            ce.provider_name AS result_source
        FROM predictions_final pf
        CROSS JOIN LATERAL jsonb_array_elements(pf.matches) WITH ORDINALITY AS leg(match_item, ordinality)
        LEFT JOIN canonical_events ce
            ON ce.id::text = COALESCE(leg.match_item->>'match_id', leg.match_item->'metadata'->>'event_id')
        WHERE LEFT(COALESCE(leg.match_item->>'match_date', leg.match_item->>'commence_time', ''), 10) = $1
          AND COALESCE(leg.match_item->>'sport', '') = $2
          AND ($3::bigint IS NULL OR pf.publish_run_id = $3::bigint)
        ORDER BY pf.id, prediction_match_index
    `;

    const { rows } = await client.query(query, [date, sport, publishRunId]);
    return rows;
}

async function upsertAccuracyRow(client, row, evaluation) {
    const upsertSql = `
        INSERT INTO predictions_accuracy (
            prediction_final_id,
            publish_run_id,
            prediction_match_index,
            event_id,
            sport,
            prediction_tier,
            prediction_type,
            confidence,
            market,
            predicted_outcome,
            prediction_source,
            result_source,
            home_team,
            away_team,
            fixture_date,
            actual_result,
            event_status,
            resolution_status,
            is_correct,
            actual_home_score,
            actual_away_score,
            actual_home_score_ht,
            actual_away_score_ht,
            loss_reason_summary,
            loss_factors,
            evaluation_notes,
            diagnostic_context,
            raw_result,
            evaluated_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, NOW()
        )
        ON CONFLICT (prediction_final_id, prediction_match_index)
        DO UPDATE SET
            publish_run_id = EXCLUDED.publish_run_id,
            event_id = EXCLUDED.event_id,
            sport = EXCLUDED.sport,
            prediction_tier = EXCLUDED.prediction_tier,
            prediction_type = EXCLUDED.prediction_type,
            confidence = EXCLUDED.confidence,
            market = EXCLUDED.market,
            predicted_outcome = EXCLUDED.predicted_outcome,
            prediction_source = EXCLUDED.prediction_source,
            result_source = EXCLUDED.result_source,
            home_team = EXCLUDED.home_team,
            away_team = EXCLUDED.away_team,
            fixture_date = EXCLUDED.fixture_date,
            actual_result = EXCLUDED.actual_result,
            event_status = EXCLUDED.event_status,
            resolution_status = EXCLUDED.resolution_status,
            is_correct = EXCLUDED.is_correct,
            actual_home_score = EXCLUDED.actual_home_score,
            actual_away_score = EXCLUDED.actual_away_score,
            actual_home_score_ht = EXCLUDED.actual_home_score_ht,
            actual_away_score_ht = EXCLUDED.actual_away_score_ht,
            loss_reason_summary = EXCLUDED.loss_reason_summary,
            loss_factors = EXCLUDED.loss_factors,
            evaluation_notes = EXCLUDED.evaluation_notes,
            diagnostic_context = EXCLUDED.diagnostic_context,
            raw_result = EXCLUDED.raw_result,
            evaluated_at = NOW()
    `;

    const values = [
        row.prediction_final_id,
        row.publish_run_id,
        row.prediction_match_index,
        row.event_id,
        row.sport,
        row.prediction_tier,
        row.prediction_type,
        row.confidence,
        row.market,
        row.predicted_outcome,
        row.prediction_source,
        row.result_source || null,
        row.home_team,
        row.away_team,
        row.fixture_date || null,
        evaluation.actualResult,
        row.event_status || 'missing',
        evaluation.resolutionStatus,
        evaluation.isCorrect,
        evaluation.scores.fulltime.home,
        evaluation.scores.fulltime.away,
        evaluation.scores.halftime.home,
        evaluation.scores.halftime.away,
        evaluation.lossReasonSummary,
        JSON.stringify(evaluation.lossFactors || []),
        evaluation.notes,
        JSON.stringify(evaluation.diagnosticContext || {}),
        JSON.stringify(evaluation.rawResult || {})
    ];

    await client.query(upsertSql, values);
}

async function main() {
    const { date, sport, runId } = parseArgs(process.argv.slice(2));

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error(`Invalid --date value: ${date}. Expected YYYY-MM-DD.`);
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    try {
        await ensureTableExists(client);

        const effectiveRunId = await resolvePublishRunId(client, date, sport, runId);
        const rows = await fetchPredictionRows(client, date, sport, effectiveRunId);
        if (rows.length === 0) {
            console.log(`No prediction legs found for ${sport} on ${date}${effectiveRunId ? ` in publish run ${effectiveRunId}` : ''}.`);
            return;
        }

        const storedContext = await loadStoredContext(
            client,
            [...new Set(rows.map((row) => row.event_id).filter(Boolean))]
        );

        const summary = {
            total: rows.length,
            won: 0,
            lost: 0,
            pending: 0,
            void: 0,
            unsupported: 0,
            missing_event: 0
        };

        for (const row of rows) {
            const evaluation = await evaluatePrediction(row, storedContext);
            summary[evaluation.resolutionStatus] = (summary[evaluation.resolutionStatus] || 0) + 1;
            await upsertAccuracyRow(client, row, evaluation);
        }

        console.log(JSON.stringify({
            date,
            sport,
            publishRunId: effectiveRunId,
            processed: summary.total,
            diagnosticsFetched: diagnosticsCache.size,
            summary
        }, null, 2));
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
