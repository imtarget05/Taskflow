# Google OAuth Setup Guide

## Prerequisites
- A Google account
- A project in [Google Cloud Console](https://console.cloud.google.com/)

## Step-by-Step

### 1. Create OAuth 2.0 Credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Name: "TaskFlow" (or your preferred name)

### 2. Configure Authorized Redirect URIs
Add these redirect URIs:
- Development: `http://localhost:4000/api/auth/google/callback`
- Production: `https://your-domain.com/api/auth/google/callback`

### 3. Copy Credentials
After creation, copy:
- Client ID
- Client Secret

### 4. Add to .env
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_ORIGIN=http://localhost:4000  # Your API URL
```

### 5. Test
1. Start the server: `npm run dev:server`
2. Visit `http://localhost:5173/login`
3. Click "Continue with Google"
4. You should be redirected to Google sign-in

## Dev Mode (Mock OAuth)

For local development without real Google credentials, TaskFlow supports a dev mode:

1. Set in `.env`:
```env
GOOGLE_CLIENT_ID=dev-mock-client-id
GOOGLE_CLIENT_SECRET=dev-mock-secret
```

2. The OAuth flow will bypass Google and create/log in a mock user (`dev@taskflow.local`).

3. Dev mode is only active when:
   - `NODE_ENV !== 'production'`
   - `GOOGLE_CLIENT_ID` starts with `dev-`

## Troubleshooting
- **redirect_uri_mismatch**: Make sure the redirect URI in .env matches Google Console
- **access_denied**: User cancelled the OAuth flow
- **Google sign-in button not showing**: Check `/auth/google/status` returns `{ configured: true }`
- **Dev mode not working**: Ensure `NODE_ENV` is not `production` and `GOOGLE_CLIENT_ID` starts with `dev-`
