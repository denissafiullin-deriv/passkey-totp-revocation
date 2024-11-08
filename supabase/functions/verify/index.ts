// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// verifyTOTP.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'
import { Database } from '../database.types.ts'

const MAX_ATTEMPTS_PER_MINUTE = 3
const MAX_TOTAL_ATTEMPTS = 5

const supabase = createClient<Database>(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  try {
    const { totp, userId } = await req.json()

    // Check rate limiting
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString()
    const { data: recentAttempts } = await supabase
      .from('totp_verification')
      .select('id')
      .eq('user_id', userId)
      .gt('last_attempt_at', oneMinuteAgo)

    if (recentAttempts && recentAttempts.length >= MAX_ATTEMPTS_PER_MINUTE) {
      return new Response(
        JSON.stringify({ error: 'Too many attempts. Please wait a minute.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get active TOTP
    const { data: totpRecord, error: totpError } = await supabase
      .from('totp_verification')
      .select()
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (totpError || !totpRecord) {
      return new Response(
        JSON.stringify({ error: 'No active TOTP found' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update attempt count and verify
    const newAttemptCount = totpRecord.attempt_count + 1
    const isBlocked = newAttemptCount >= MAX_TOTAL_ATTEMPTS
    const isCorrect = totpRecord.totp_code === Number(totp)

    const { error: updateError } = await supabase
      .from('totp_verification')
      .update({
        attempt_count: newAttemptCount,
        last_attempt_at: new Date().toISOString(),
        status: isBlocked ? 'BLOCKED' : (isCorrect ? 'VERIFIED' : 'ACTIVE'),
        is_verified: isCorrect
      })
      .eq('id', totpRecord.id)

    if (updateError) throw updateError

    if (isBlocked) {
      return new Response(
        JSON.stringify({ error: 'TOTP blocked due to too many attempts' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: isCorrect }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
