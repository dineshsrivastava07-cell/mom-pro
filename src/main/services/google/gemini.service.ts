// Gemini AI Service — uses Google OAuth2 access token (no separate API key required)
// Authenticates via the signed-in Google account using generative-language scope

import * as https from 'https'

interface GeminiCandidate {
  content: { parts: Array<{ text: string }> }
}

interface GeminiResponse {
  candidates?: GeminiCandidate[]
  usageMetadata?: { totalTokenCount?: number }
  error?: { message?: string; code?: number }
}

export class GeminiService {
  private static readonly HOSTNAME = 'generativelanguage.googleapis.com'
  private static readonly MODEL = 'gemini-2.0-flash'

  constructor(private readonly accessToken: string) {}

  // ── Chat: system prompt + user query + optional RAG context ───────────────

  async chat(
    systemPrompt: string,
    userPrompt: string,
    contextStr: string
  ): Promise<{ text: string; tokensUsed: number }> {
    const userContent = contextStr
      ? `${contextStr}\n\nUser: ${userPrompt}`
      : userPrompt

    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
    })

    const data = await this.post(
      `/v1beta/models/${GeminiService.MODEL}:generateContent`,
      body
    )

    const parsed = JSON.parse(data) as GeminiResponse
    if (parsed.error) {
      throw new Error(`Gemini API error ${parsed.error.code ?? ''}: ${parsed.error.message ?? 'Unknown'}`)
    }

    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
    const tokensUsed = parsed.usageMetadata?.totalTokenCount ?? 0
    return { text, tokensUsed }
  }

  // ── Check availability: confirm token works with Gemini ───────────────────

  static async checkAvailable(accessToken: string): Promise<boolean> {
    return new Promise((resolve) => {
      const options: https.RequestOptions = {
        hostname: GeminiService.HOSTNAME,
        path: '/v1beta/models',
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      }
      const req = https.request(options, (res) => resolve(res.statusCode === 200))
      req.on('error', () => resolve(false))
      req.on('timeout', () => { req.destroy(); resolve(false) })
      req.end()
    })
  }

  // ── Native HTTPS POST helper ───────────────────────────────────────────────

  private post(path: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: GeminiService.HOSTNAME,
        port: 443,
        path,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 30000,
      }

      const req = https.request(options, (res) => {
        let data = ''
        res.on('data', (chunk: string) => { data += chunk })
        res.on('end', () => {
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`Gemini HTTP ${res.statusCode}: ${data.slice(0, 200)}`))
          } else {
            resolve(data)
          }
        })
      })

      req.on('error', (e) => reject(new Error(`Gemini network error: ${e.message}`)))
      req.on('timeout', () => { req.destroy(); reject(new Error('Gemini request timed out after 30s')) })
      req.write(body)
      req.end()
    })
  }
}
