# skcsai
AI-powered multi-sport prediction platform with confidence-based and responsible analytics.
# SKCS AI Sports Predictions

AI-powered multi-sport prediction platform built around **confidence-based analytics**, **risk transparency**, and **responsible decision support**.

SKCS does not promise wins.  
It provides **intelligent probability analysis**, **risk-aware alternatives**, and **tiered insights** to help users make informed choices.

---

## 🎯 Core Principles

- Confidence-based predictions (not hype-driven)
- Transparent risk labeling
- Safer alternatives for volatile matches
- Tiered intelligence (Normal vs Deep)
- Responsible analytics, not gambling guarantees

---

## 🧠 How SKCS Works (High Level)

1. Sports data is ingested from official APIs
2. Base predictions are generated for all supported markets
3. Each prediction is scored for:
   - Confidence %
   - Volatility
   - Historical reliability
4. Predictions are filtered and presented based on user tier
5. Final predictions are locked 6 hours before kickoff

---

## 🏟️ Supported Prediction Types

### Match Outcomes
- 1X2 (Home / Draw / Away)
- Match Winner (sport dependent)

### Totals & Scoring
- Over / Under markets
- Both Teams To Score (BTTS)

### Advanced Markets
- Winner in Sets (Tennis)
- Handicaps / Run Lines
- Same Match Bets
- Multi Bets
- ACCA (Accumulator) Bets

---

## 🔵 Normal Tier

Designed for coverage and accessibility.

**Characteristics:**
- Fixed daily limits
- Mixed confidence bands
- Safer minimum thresholds

**Typical Rules:**
- Multi Bets ≥ 55% confidence
- Same Match Bets ≥ 50% confidence
- Limited ACCAs per day
- Broader match selection

Normal = **Volume + Coverage**

---

## 🔴 Deep Tier (Premium)

Designed for precision and discipline.

**Key Difference:**
- Uses **dynamic percentile filtering**
- Only top-performing predictions are shown

Example:
> “Only predictions in the top 20–25% confidence band for the day.”

**Characteristics:**
- No fixed prediction count
- Highest confidence only
- Strong volatility filtering
- Tighter ACCA construction rules

Deep = **Quality + Accuracy**

---

## 🛡️ Safety Net System (Key Feature)

SKCS automatically evaluates the risk of every primary prediction.

### If Confidence is Low:
- Safer alternatives are offered
  - Double Chance
  - Handicap buffers
  - Conservative totals

### If Confidence is High:
- Value-enhancing options are offered
  - Handicaps
  - Player props
  - High-value combinations

This system is designed to:
- Reduce unnecessary losses
- Increase trust
- Encourage responsible selection

---

## ⏱️ Prediction Stages

Predictions move through three stages:

1. **Initial** – Based on early data
2. **Adjusted** – Context-aware refinements
3. **Final** – Locked 6 hours before kickoff

Only **Final** predictions are visible to users.

---

## 🧩 ACCA Logic

- ACCAs are rule-based and validated
- Match duplication is not allowed
- Sport compatibility is enforced
- Daily caps vary by day of week
- Deep ACCAs only use top percentile legs

---

## 🏗️ Architecture Overview

- **GitHub** – Source control & documentation
- **Supabase** – Database, logic, Edge Functions
- **Frontend** – Tool-agnostic (web/app ready)

Supabase handles logic & enforcement.  
GitHub defines structure & evolution.

---

## ⚠️ Disclaimer

SKCS AI Sports Predictions provides analytical insights only.  
No guarantees are made. Users are responsible for their decisions.

---

## 📍 Project Status

Current focus:
- Backend logic
- Prediction pipelines
- Tier enforcement
- Responsible analytics framework

Frontend integration follows once logic is stable.
