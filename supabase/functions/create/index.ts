// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'
import { APIClient, SendEmailRequest } from 'npm:customerio-node'
import { Database } from '../../database.types.ts'


const TOTP_VALIDITY_MINUTES = 10

const supabase = createClient<Database>(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

const CIO_API_TOKEN: string = Deno.env.get('CIO_API_TOKEN') ?? ''

const customerIOClient = new APIClient(CIO_API_TOKEN);

interface AuthResponse {
  authorize: {
      user_id: number;
      email: string;
  };
  echo_req: {
      authorize: string;
  };
  msg_type: string;
}


serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('not allowed', { status: 400 })
    }

    // Get and verify userId and access token
    let { userId } = await req.json()
    userId = Number(userId)
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId must be a number'}),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ) 
    }

    const authHeader = req.headers.get('Authorization')!
    const accessToken = authHeader.replace('Bearer ', '')
    const url = 'https://green.derivws.com/websockets/authorize?app_id=1'
    const authData = { authorize: accessToken }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(authData),
    })

    const authResponse: AuthResponse = await response.json()
    const authUserId = authResponse.authorize.user_id;
    const authEmail = authResponse.authorize.email;

    console.log(authUserId, authEmail)

    if (userId !== authUserId) {
      return new Response(
        JSON.stringify({ error: 'provided userId is not verified'}),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ) 
    }

    // Generate 6-digit TOTP
    const totp = Math.floor(100000 + Math.random() * 900000).toString()
    
    // Insert new TOTP
    const { data, error } = await supabase
      .from('totp_verification')
      .insert({
        user_id: userId,
        totp_code: totp,
        expires_at: new Date(Date.now() + TOTP_VALIDITY_MINUTES * 60000).toISOString()
      })
      .select()
      .single()

    if (error) throw error

    // // Send an email to the user with TOTP
    // const emailRequest = new SendEmailRequest({
    //   message_data: {
    //   },
    //   to: `${authEmail}`,
    //   from: '',
    //   subject: '',
    //   body: '',
    //   identifiers: {
    //     id: "afdf",
    //   },
    // });
    
    // customerIOClient.sendEmail(emailRequest)
    //   .then(res => console.log(res))
    //   .catch(err => console.log(err.statusCode, err.message))
    

    return new Response(
      JSON.stringify({ totp }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/create' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
