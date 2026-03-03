// Google OAuth2 Authentication Service — Phase 26
// Uses Authorization Code + PKCE via loopback HTTP server
// Tokens stored in SQLite google_tokens table

import { google, Auth } from 'googleapis'
type OAuth2Client = Auth.OAuth2Client
import * as http from 'http'
import * as url from 'url'
import * as crypto from 'crypto'
import Database from 'better-sqlite3'
import { GOOGLE_OAUTH_SCOPES } from '../../../shared/constants/google-scopes.constants'

const REDIRECT_PORT = 42813
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth/callback`

export interface GoogleUserProfile {
  email: string
  name: string
  picture?: string
  sub: string  // Google user ID
}

export interface GoogleTokens {
  accessToken: string
  refreshToken?: string
  expiryDate?: number
  email: string
  name: string
}

export class GoogleAuthService {
  private oauth2Client: OAuth2Client
  private db: Database.Database
  private clientId: string
  private clientSecret: string

  constructor(db: Database.Database) {
    this.db = db
    this.ensureTokensTable()
    // Read credentials: DB first, then env vars, then placeholder
    const dbCreds = this.getCredentialsFromDB()
    this.clientId = dbCreds?.clientId ?? process.env.GOOGLE_CLIENT_ID ?? ''
    this.clientSecret = dbCreds?.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? ''
    this.oauth2Client = new google.auth.OAuth2(this.clientId || 'placeholder', this.clientSecret || 'placeholder', REDIRECT_URI)
  }

  // ── Check if configured ────────────────────────────────────────────────────

  isConfigured(): boolean {
    return this.clientId.length > 0 && this.clientSecret.length > 0
      && !this.clientId.includes('placeholder') && !this.clientSecret.includes('placeholder')
  }

  // ── Save credentials to DB ─────────────────────────────────────────────────

  saveCredentials(clientId: string, clientSecret: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO google_credentials (id, client_id, client_secret, updated_at)
      VALUES ('default', ?, ?, datetime('now'))
    `).run(clientId.trim(), clientSecret.trim())
    this.clientId = clientId.trim()
    this.clientSecret = clientSecret.trim()
    this.oauth2Client = new google.auth.OAuth2(this.clientId, this.clientSecret, REDIRECT_URI)
  }

  // ── Get credentials from DB ────────────────────────────────────────────────

  getCredentialsFromDB(): { clientId: string; clientSecret: string } | null {
    try {
      const row = this.db.prepare('SELECT client_id, client_secret FROM google_credentials WHERE id = ?').get('default') as Record<string, unknown> | null
      if (!row || !row.client_id) return null
      return { clientId: row.client_id as string, clientSecret: row.client_secret as string }
    } catch { return null }
  }

  // ── Get stored Client ID (safe to expose) ─────────────────────────────────

  getStoredClientId(): string {
    return this.clientId
  }

  // ── Get signed-in user ────────────────────────────────────────────────────

  getSignedInUser(): GoogleTokens | null {
    try {
      const row = this.db.prepare('SELECT * FROM google_tokens WHERE id = ?').get('default') as Record<string, unknown> | null
      if (!row) return null
      return {
        accessToken: row.access_token as string,
        refreshToken: row.refresh_token as string | undefined,
        expiryDate: row.expiry_date as number | undefined,
        email: row.email as string,
        name: row.name as string,
      }
    } catch { return null }
  }

  // ── Check if signed in ────────────────────────────────────────────────────

  isSignedIn(): boolean {
    return this.getSignedInUser() !== null
  }

  // ── Sign in via OAuth2 PKCE loopback ──────────────────────────────────────

  async signIn(): Promise<GoogleTokens> {
    if (!this.isConfigured()) {
      throw new Error('Google OAuth credentials not configured.')
    }

    const state = crypto.randomBytes(16).toString('hex')
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [...GOOGLE_OAUTH_SCOPES],
      state,
      prompt: 'consent',
    })

    // Start loopback server FIRST — must be ready before browser redirects back
    const codePromise = this.waitForOAuthCode(state)

    // Open browser AFTER server is listening
    const { shell } = await import('electron')
    await shell.openExternal(authUrl)

    const code = await codePromise
    console.log('[GoogleAuth] Code received, exchanging for tokens…')

    // Exchange code for tokens — use native https to avoid googleapis gaxios hang in Electron
    const tokens = await this.exchangeCodeForTokens(code)
    console.log('[GoogleAuth] Tokens received, access_token present:', !!tokens.access_token)
    this.oauth2Client.setCredentials(tokens)

    // Get user profile via native https
    console.log('[GoogleAuth] Fetching user profile…')
    const profile = await this.fetchUserProfile(tokens.access_token!)
    console.log('[GoogleAuth] Profile received:', profile.email)

    const stored: GoogleTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      expiryDate: tokens.expiry_date ?? undefined,
      email: profile.email,
      name: profile.name,
    }

    this.storeTokens(stored, profile.picture)
    console.log('[GoogleAuth] Sign-in complete, tokens stored for', profile.email)
    return stored
  }

  // ── Sign out ───────────────────────────────────────────────────────────────

  signOut(): void {
    try {
      this.db.prepare('DELETE FROM google_tokens WHERE id = ?').run('default')
    } catch { /* ignore */ }
    this.oauth2Client.revokeCredentials().catch(() => { /* ignore */ })
  }

  // ── Get authenticated OAuth2Client ────────────────────────────────────────

  getAuthClient(): OAuth2Client | null {
    const tokens = this.getSignedInUser()
    if (!tokens) return null
    this.oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiryDate,
    })
    return this.oauth2Client
  }

  // ── Auto-refresh tokens ────────────────────────────────────────────────────

  async refreshIfNeeded(): Promise<boolean> {
    const tokens = this.getSignedInUser()
    if (!tokens?.refreshToken) return false

    const expiresIn = (tokens.expiryDate ?? 0) - Date.now()
    if (expiresIn > 5 * 60 * 1000) return true  // Not expired yet

    try {
      this.oauth2Client.setCredentials({ refresh_token: tokens.refreshToken })
      const { credentials } = await this.oauth2Client.refreshAccessToken()
      this.oauth2Client.setCredentials(credentials)
      // Update stored tokens
      this.db.prepare(`UPDATE google_tokens SET access_token = ?, expiry_date = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(credentials.access_token, credentials.expiry_date ?? null, 'default')
      return true
    } catch { return false }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  // Use native Node https instead of googleapis gaxios (avoids Electron main-process hang)
  private exchangeCodeForTokens(code: string): Promise<{
    access_token: string; refresh_token?: string; expiry_date?: number; token_type: string
  }> {
    return new Promise((resolve, reject) => {
      const https = require('https') as typeof import('https')
      const qs = require('querystring') as typeof import('querystring')
      const body = qs.stringify({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      })
      const req = https.request({
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = ''
        res.on('data', (chunk: string) => { data += chunk })
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as Record<string, unknown>
            if (json.error) { reject(new Error(`Token exchange error: ${String(json.error)} — ${String(json.error_description ?? '')}`)); return }
            resolve({
              access_token: json.access_token as string,
              refresh_token: json.refresh_token as string | undefined,
              expiry_date: json.expires_in ? Date.now() + (json.expires_in as number) * 1000 : undefined,
              token_type: json.token_type as string ?? 'Bearer',
            })
          } catch (e) { reject(e) }
        })
      })
      req.on('error', reject)
      req.setTimeout(15000, () => { req.destroy(new Error('Token exchange timed out after 15s')) })
      req.write(body)
      req.end()
    })
  }

  private fetchUserProfile(accessToken: string): Promise<{ email: string; name: string; picture?: string }> {
    return new Promise((resolve, reject) => {
      const https = require('https') as typeof import('https')
      const req = https.request({
        hostname: 'www.googleapis.com',
        path: '/oauth2/v2/userinfo',
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      }, (res) => {
        let data = ''
        res.on('data', (chunk: string) => { data += chunk })
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as Record<string, unknown>
            if (json.error) { reject(new Error(`Profile fetch error: ${String(json.error)}`)); return }
            resolve({
              email: json.email as string ?? '',
              name: (json.name as string) ?? (json.email as string) ?? 'Google User',
              picture: json.picture as string | undefined,
            })
          } catch (e) { reject(e) }
        })
      })
      req.on('error', reject)
      req.setTimeout(10000, () => { req.destroy(new Error('Profile fetch timed out after 10s')) })
      req.end()
    })
  }

  private waitForOAuthCode(expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url ?? '', true)
        if (parsedUrl.pathname !== '/oauth/callback') {
          res.writeHead(404); res.end(); return
        }

        const { code, state, error } = parsedUrl.query

        // Fix: query values are string | string[] — normalise to string
        const codeStr   = Array.isArray(code)  ? code[0]  : code
        const stateStr  = Array.isArray(state) ? state[0] : state
        const errorStr  = Array.isArray(error) ? error[0] : error

        console.log('[GoogleAuth] Callback received — state match:', stateStr === expectedState, '| error:', errorStr ?? 'none')

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })

        if (errorStr) {
          res.end(`<html><body style="font-family:sans-serif;padding:40px"><h2 style="color:#dc2626">Sign-in failed</h2><p>Google error: <code>${errorStr}</code></p><p>You can close this window and try again.</p></body></html>`)
          server.close()
          reject(new Error(`Google OAuth error: ${errorStr}`))
          return
        }

        if (!codeStr || stateStr !== expectedState) {
          res.end(`<html><body style="font-family:sans-serif;padding:40px"><h2 style="color:#dc2626">Authentication failed</h2><p>State mismatch or missing code. Please close this window and try signing in again.</p></body></html>`)
          server.close()
          reject(new Error(`OAuth state mismatch — expected: ${expectedState} | got: ${stateStr ?? 'none'}`))
          return
        }

        res.end('<html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2 style="color:#4338ca">✓ Signed in to MOM Pro!</h2><p style="color:#6b7280">You can close this window.</p></body></html>')
        server.close()
        resolve(codeStr)
      })

      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${REDIRECT_PORT} is already in use. Close other apps using this port and try again.`))
        } else {
          reject(err)
        }
      })

      server.listen(REDIRECT_PORT, '127.0.0.1', () => {
        console.log(`[GoogleAuth] Loopback server listening on port ${REDIRECT_PORT}`)
        // Timeout after 5 minutes
        setTimeout(() => {
          server.close()
          reject(new Error('Sign-in timed out. Please try again.'))
        }, 5 * 60 * 1000)
      })
    })
  }

  private storeTokens(tokens: GoogleTokens, picture?: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO google_tokens (id, access_token, refresh_token, expiry_date, email, name, picture, updated_at)
      VALUES ('default', ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(tokens.accessToken, tokens.refreshToken ?? null, tokens.expiryDate ?? null, tokens.email, tokens.name, picture ?? null)
  }

  private ensureTokensTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS google_tokens (
        id TEXT PRIMARY KEY DEFAULT 'default',
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expiry_date INTEGER,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        picture TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS google_credentials (
        id TEXT PRIMARY KEY DEFAULT 'default',
        client_id TEXT NOT NULL,
        client_secret TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `)
  }
}
