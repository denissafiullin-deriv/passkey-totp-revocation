# Passkey Revocation with TOTP Email Verification

A secure system for revoking passkeys using Time-based One-Time Passwords (TOTP) with email verification, built on Supabase.

## Features

- 🔐 Secure TOTP generation and verification
- 📧 Email delivery via CustomerIO Transactional API
- ⏱️ Time-based expiration for TOTP codes
- 🛡️ Rate limiting and attempt tracking
- 🔒 User verification through access tokens

## Prerequisites

- Node.js (latest LTS version)
- Supabase CLI
- CustomerIO API credentials
- Supabase project credentials

## Environment Variables

Create a `.env` file with the following variables:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CIO_API_TOKEN=your_customerio_api_token
```

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Install Supabase CLI [link](https://supabase.com/docs/guides/local-development):

```bash
npm install supabase --save-dev
```

4. Initialize the Supabase project

```bash
npx supabase init
```

5. Start Supabase services locally

```bash
npx supabase start
```


## API Endpoints

### Create TOTP

**POST** `/functions/v1/create`

Creates a new TOTP for a user and sends it via email.

Request body:

```json
{
"userId": "number"
}
```

### Verify TOTP

**POST** `/functions/v1/verify`

Verifies the TOTP provided by the user.

Request body:

```json
{
"totp": "string",
"userId": "number"
}
```

## Security Features

- TOTP validity period: 10 minutes
- Rate limiting: 3 attempts per minute
- Maximum total attempts: 5 before blocking
- Secure user verification through access tokens
- Automatic TOTP expiration

## Development

To run the development server and watch for changes:

```bash
npx supabase functions serve
```

Access the Supabase Dashboard at: http://localhost:54323/

## Database Schema

The project uses a `totp_verification` table with the following structure:

- `id`: UUID (Primary Key)
- `user_id`: Number
- `totp_code`: String
- `expires_at`: Timestamp
- `attempt_count`: Number
- `last_attempt_at`: Timestamp
- `status`: Enum ('active', 'verified', 'blocked')
- `is_verified`: Boolean
