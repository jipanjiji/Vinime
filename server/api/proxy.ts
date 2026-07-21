import { defineEventHandler, getQuery, createError, setHeader, setResponseStatus } from 'h3'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const videoUrl = query.url as string
  const referer = query.referer as string || ''
  const origin = query.origin as string || ''

  if (!videoUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing target "url" parameter for proxy.',
    })
  }

  try {
    const parsedUrl = new URL(videoUrl)

    // Validate target URL protocols
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid protocol. Only http or https is supported.',
      })
    }

    // Set up spoofed headers to send to the video host
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    }

    if (referer) {
      headers['Referer'] = referer
    } else {
      headers['Referer'] = parsedUrl.origin + '/'
    }

    if (origin) {
      headers['Origin'] = origin
    }

    // Forward the byte-range request header from the client browser
    const clientRange = event.node.req.headers['range']
    if (clientRange) {
      headers['Range'] = clientRange as string
    }

    // SCENARIO A: HLS playlist (.m3u8) — rewrite segment URLs to proxy through us
    if (parsedUrl.pathname.endsWith('.m3u8')) {
      const m3u8Text = await $fetch<string>(videoUrl, {
        headers,
        responseType: 'text'
      })

      const rewrittenM3u8 = rewriteM3u8(m3u8Text, videoUrl, referer, origin)

      setHeader(event, 'Content-Type', 'application/x-mpegURL')
      setHeader(event, 'Access-Control-Allow-Origin', '*')

      return rewrittenM3u8
    }

    // SCENARIO B: Direct MP4/TS segment — buffer and return (Vercel-compatible, no Node streams)
    const response = await fetch(videoUrl, {
      headers,
      redirect: 'follow'
    })

    if (!response.ok || response.status >= 400) {
      throw createError({
        statusCode: response.status || 503,
        statusMessage: `Video host returned error status ${response.status}`,
      })
    }

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Video host returned JSON error payload.',
      })
    }

    // Forward status code
    setResponseStatus(event, response.status)

    // Copy relevant response headers (skip transport-level headers)
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase()
      if (
        lowerKey !== 'transfer-encoding' &&
        lowerKey !== 'connection' &&
        lowerKey !== 'keep-alive'
      ) {
        setHeader(event, key, value)
      }
    })

    // Always allow cross-origin access
    setHeader(event, 'Access-Control-Allow-Origin', '*')

    // Read body as ArrayBuffer — works reliably on Vercel serverless (no Node stream needed)
    const buffer = await response.arrayBuffer()
    return Buffer.from(buffer)

  } catch (error: any) {
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: `Video Proxy failed: ${error.message}`,
    })
  }
})

/**
 * Rewrite HLS playlist (.m3u8) so all child segment/playlist URLs
 * are routed back through our proxy endpoint.
 */
function rewriteM3u8(m3u8Text: string, playlistUrl: string, referer: string, origin: string): string {
  const lines = m3u8Text.split('\n')
  const baseUrl = new URL(playlistUrl)

  const rewrittenLines = lines.map(line => {
    const trimmed = line.trim()
    if (!trimmed) return line

    // Metadata line with URI attribute (e.g. URI="iframes.m3u8")
    if (trimmed.startsWith('#')) {
      return trimmed.replace(/URI=["']([^"']+)["']/g, (match, relativeUri) => {
        try {
          const absoluteUri = new URL(relativeUri, baseUrl.href).href
          const proxiedUri = `/api/proxy?url=${encodeURIComponent(absoluteUri)}&referer=${encodeURIComponent(referer)}`
          return `URI="${proxiedUri}"`
        } catch {
          return match
        }
      })
    }

    // Direct URL or relative path to segment/sub-playlist
    try {
      const absoluteUri = new URL(trimmed, baseUrl.href).href
      return `/api/proxy?url=${encodeURIComponent(absoluteUri)}&referer=${encodeURIComponent(referer)}`
    } catch {
      return line
    }
  })

  return rewrittenLines.join('\n')
}
