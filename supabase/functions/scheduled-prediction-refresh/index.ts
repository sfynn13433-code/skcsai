/**
 * SKCS Supabase Scheduled Prediction Refresh
 * Replaces GitHub Actions with native Supabase scheduling
 * Runs at 04:00, 12:00, 18:00 Africa/Johannesburg
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getSchedulingTimes } from '../../../backend/utils/dateNormalization.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PredictionWindow {
  current_window: string
  fetch_range_utc: {
    start: string
    end: string
  }
  fetch_range_sast: {
    start: string
    end: string
  }
}

interface RefreshStats {
  fixtures_imported: number
  fixtures_normalized: number
  predictions_generated: number
  predictions_filtered: number
  errors: string[]
  start_time: string
  end_time: string
  duration_ms: number
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('[scheduled-refresh] Starting prediction refresh')
    const startTime = new Date().toISOString()
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify this is a scheduled invocation (not manual)
    const isScheduled = req.headers.get('x-supabase-scheduled') === 'true'
    const authHeader = req.headers.get('authorization')
    
    if (!isScheduled && !authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing auth header' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get current prediction window
    const predictionWindow = await getPredictionWindow(supabase)
    
    // Execute the refresh pipeline
    const stats = await executeRefreshPipeline(supabase, predictionWindow)
    
    // Log completion
    console.log('[scheduled-refresh] Pipeline completed:', stats)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        prediction_window: predictionWindow,
        stats 
      }), 
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('[scheduled-refresh] Pipeline failed:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        stack: error.stack 
      }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

/**
 * Get current prediction window based on SAST time
 */
async function getPredictionWindow(supabase: any): Promise<PredictionWindow> {
  const now = new Date()
  const sastTime = new Date(now.getTime() + 2 * 60 * 60 * 1000) // UTC+2
  
  const hour = sastTime.getHours()
  let currentWindow = ''
  let fetchStart = new Date()
  let fetchEnd = new Date()
  
  // Determine window and fetch range
  if (hour >= 4 && hour < 12) {
    // Morning window (04:00-11:59 SAST): fetch today
    currentWindow = 'morning'
    fetchStart.setHours(0, 0, 0, 0)
    fetchEnd.setHours(23, 59, 59, 999)
  } else if (hour >= 12 && hour < 18) {
    // Midday window (12:00-17:59 SAST): fetch today + tomorrow
    currentWindow = 'midday'
    fetchStart.setHours(0, 0, 0, 0)
    fetchEnd.setDate(fetchEnd.getDate() + 1)
    fetchEnd.setHours(23, 59, 59, 999)
  } else {
    // Evening window (18:00-23:59 SAST): fetch tomorrow + day after
    currentWindow = 'evening'
    fetchStart.setDate(fetchStart.getDate() + 1)
    fetchStart.setHours(0, 0, 0, 0)
    fetchEnd.setDate(fetchEnd.getDate() + 2)
    fetchEnd.setHours(23, 59, 59, 999)
  }
  
  // Convert to UTC for database queries
  const utcStart = new Date(fetchStart.getTime() - 2 * 60 * 60 * 1000)
  const utcEnd = new Date(fetchEnd.getTime() - 2 * 60 * 60 * 1000)
  
  return {
    current_window: currentWindow,
    fetch_range_utc: {
      start: utcStart.toISOString(),
      end: utcEnd.toISOString()
    },
    fetch_range_sast: {
      start: fetchStart.toISOString(),
      end: fetchEnd.toISOString()
    }
  }
}

/**
 * Execute the complete refresh pipeline
 */
async function executeRefreshPipeline(
  supabase: any, 
  predictionWindow: PredictionWindow
): Promise<RefreshStats> {
  const stats: RefreshStats = {
    fixtures_imported: 0,
    fixtures_normalized: 0,
    predictions_generated: 0,
    predictions_filtered: 0,
    errors: [],
    start_time: new Date().toISOString(),
    end_time: '',
    duration_ms: 0
  }

  try {
    // Step 1: Sync fixtures from external APIs
    const fixturesImported = await syncFixtures(supabase, predictionWindow)
    stats.fixtures_imported = fixturesImported.count
    
    // Step 2: Normalize fixture dates and data
    const fixturesNormalized = await normalizeFixtures(supabase, predictionWindow)
    stats.fixtures_normalized = fixturesNormalized.count
    
    // Step 3: Generate predictions (stages 1-3)
    const predictionsGenerated = await generatePredictions(supabase, predictionWindow)
    stats.predictions_generated = predictionsGenerated.count
    
    // Step 4: Apply plan-specific filtering and materialize final predictions
    const predictionsFiltered = await filterAndMaterializePredictions(supabase, predictionWindow)
    stats.predictions_filtered = predictionsFiltered.count
    
  } catch (error) {
    stats.errors.push(error.message)
    throw error
  } finally {
    stats.end_time = new Date().toISOString()
    stats.duration_ms = new Date(stats.end_time).getTime() - new Date(stats.start_time).getTime()
  }

  return stats
}

/**
 * Step 1: Sync fixtures from external APIs
 */
async function syncFixtures(supabase: any, predictionWindow: PredictionWindow) {
  console.log('[sync-fixtures] Starting fixture sync for window:', predictionWindow.current_window)
  
  try {
    // Call the backend fixture sync endpoint
    const { data, error } = await supabase.functions.invoke('sync-fixtures', {
      body: {
        window: predictionWindow,
        sports: ['football', 'basketball', 'tennis', 'cricket', 'rugby', 'baseball', 'hockey', 'volleyball', 'mma', 'formula1', 'afl', 'handball']
      }
    })

    if (error) throw error
    
    console.log('[sync-fixtures] Imported fixtures:', data.count)
    return { count: data.count || 0 }
    
  } catch (error) {
    console.error('[sync-fixtures] Failed:', error)
    throw new Error(`Fixture sync failed: ${error.message}`)
  }
}

/**
 * Step 2: Normalize fixture dates and data
 */
async function normalizeFixtures(supabase: any, predictionWindow: PredictionWindow) {
  console.log('[normalize-fixtures] Starting normalization')
  
  try {
    // Call database function to normalize fixtures
    const { data, error } = await supabase.rpc('normalize_fixtures_for_window', {
      window_start: predictionWindow.fetch_range_utc.start,
      window_end: predictionWindow.fetch_range_utc.end
    })

    if (error) throw error
    
    console.log('[normalize-fixtures] Normalized fixtures:', data?.length || 0)
    return { count: data?.length || 0 }
    
  } catch (error) {
    console.error('[normalize-fixtures] Failed:', error)
    throw new Error(`Fixture normalization failed: ${error.message}`)
  }
}

/**
 * Step 3: Generate predictions through AI pipeline stages
 */
async function generatePredictions(supabase: any, predictionWindow: PredictionWindow) {
  console.log('[generate-predictions] Starting AI pipeline')
  
  try {
    // Execute stage 1
    const { data: stage1, error: error1 } = await supabase.rpc('generate_stage_1_predictions', {
      window_start: predictionWindow.fetch_range_utc.start,
      window_end: predictionWindow.fetch_range_utc.end
    })
    if (error1) throw error1

    // Execute stage 2
    const { data: stage2, error: error2 } = await supabase.rpc('generate_stage_2_predictions', {
      window_start: predictionWindow.fetch_range_utc.start,
      window_end: predictionWindow.fetch_range_utc.end
    })
    if (error2) throw error2

    // Execute stage 3
    const { data: stage3, error: error3 } = await supabase.rpc('generate_stage_3_predictions', {
      window_start: predictionWindow.fetch_range_utc.start,
      window_end: predictionWindow.fetch_range_utc.end
    })
    if (error3) throw error3

    const totalPredictions = (stage1?.length || 0) + (stage2?.length || 0) + (stage3?.length || 0)
    console.log('[generate-predictions] Generated predictions:', totalPredictions)
    
    return { count: totalPredictions }
    
  } catch (error) {
    console.error('[generate-predictions] Failed:', error)
    throw new Error(`Prediction generation failed: ${error.message}`)
  }
}

/**
 * Step 4: Filter predictions by plan and materialize final results
 */
async function filterAndMaterializePredictions(supabase: any, predictionWindow: PredictionWindow) {
  console.log('[filter-predictions] Starting plan filtering and materialization')
  
  try {
    // Get all subscription plans
    const { data: plans, error: plansError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('active', true)
    
    if (plansError) throw plansError

    let totalFiltered = 0
    
    // Apply filtering for each plan
    for (const plan of plans || []) {
      const { data: filtered, error: filterError } = await supabase.rpc('filter_predictions_for_plan', {
        plan_id: plan.plan_id,
        window_start: predictionWindow.fetch_range_utc.start,
        window_end: predictionWindow.fetch_range_utc.end
      })
      
      if (filterError) throw filterError
      
      totalFiltered += filtered?.length || 0
    }

    // Materialize final predictions table
    const { data: materialized, error: materializeError } = await supabase.rpc('materialize_final_predictions', {
      window_start: predictionWindow.fetch_range_utc.start,
      window_end: predictionWindow.fetch_range_utc.end
    })
    
    if (materializeError) throw materializeError

    console.log('[filter-predictions] Filtered and materialized predictions:', totalFiltered)
    return { count: totalFiltered }
    
  } catch (error) {
    console.error('[filter-predictions] Failed:', error)
    throw new Error(`Prediction filtering failed: ${error.message}`)
  }
}

/**
 * Health check endpoint
 */
async function healthCheck(supabase: any) {
  try {
    const { data, error } = await supabase
      .from('normalized_fixtures')
      .select('count')
      .limit(1)
    
    return {
      database: error ? 'error' : 'connected',
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    return {
      database: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    }
  }
}
