import { defineEventHandler, getQuery, createError } from 'h3'
import * as cheerio from 'cheerio'
import http2 from 'http2'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const targetUrl = query.url as string

  if (!targetUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing target "url" parameter.',
    })
  }

  try {
    const urlObj = new URL(targetUrl)
    const isSamehadaku = urlObj.hostname.includes('samehadaku')

    if (isSamehadaku) {
      // ==========================================
      // SAMEHADAKU PARSER ENGINE (HTTP/2 POWERED)
      // ==========================================
      console.log(`Using HTTP/2 Samehadaku Engine for: ${targetUrl}`);
      
      // 1. Fetch Samehadaku page HTML using HTTP/2
      const html = await fetchHttp2(targetUrl)
      const $ = cheerio.load(html)
      
      const videoSources: Array<{ label: string; url: string; quality: string }> = []

      // Find player options
      const options: Array<{ label: string; post: string; nume: string; type: string }> = []
      $('.east_player_option').each((_, el) => {
        const label = $(el).text().trim()
        const post = $(el).attr('data-post')
        const nume = $(el).attr('data-nume')
        const type = $(el).attr('data-type')
        if (post && nume && type) {
          options.push({ label, post, nume, type })
        }
      })

      const parsedOrigin = urlObj.origin
      const ajaxUrl = `${parsedOrigin}/wp-admin/admin-ajax.php`

      // 2. Fetch the player iframe links concurrently in parallel
      await Promise.all(
        options.map(async (opt) => {
          try {
            const payload = new URLSearchParams()
            payload.append('action', 'player_ajax')
            payload.append('post', opt.post)
            payload.append('nume', opt.nume)
            payload.append('type', opt.type)

            const ajaxResponse = await fetchHttp2(
              ajaxUrl,
              'POST',
              payload.toString(),
              { 'referer': targetUrl, 'x-requested-with': 'XMLHttpRequest' }
            )

            if (ajaxResponse) {
              let iframeSrc: string | null = null

              // Detect WordPress shortcodes (e.g. [vidlion id=xxxx] or [vidhide id=xxxx])
              const shortcodeMatch = ajaxResponse.match(/\[(\w+)\s+id=["']?([a-zA-Z0-9_-]+)["']?\]/)
              if (shortcodeMatch) {
                const codeName = shortcodeMatch[1].toLowerCase()
                const codeId = shortcodeMatch[2]
                if (codeName === 'vidlion' || codeName === 'vidhide') {
                  iframeSrc = `https://vidhidepro.com/v/${codeId}`
                }
              } else {
                const $iframe = cheerio.load(ajaxResponse)
                iframeSrc = $iframe('iframe').attr('src') || null
              }
              
              if (iframeSrc) {
                // Extract quality (e.g. "Wibufile 720p" -> "720p", "Vidhide 4K" -> "4K")
                let quality = 'unknown'
                const qualityMatch = opt.label.match(/(\d+p|4k)/i)
                if (qualityMatch) {
                  quality = qualityMatch[1]
                }

                // Standardize label (e.g. "Wibufile (720p)", "Vidhide (4K)")
                const serverName = opt.label.replace(/\s*(\d+p|4k)/i, '').trim()
                const displayLabel = `${serverName} (${quality})`

                videoSources.push({
                  label: displayLabel,
                  url: iframeSrc,
                  quality
                })
              }
            }
          } catch (mirrorErr) {
            // Ignore single mirror failures
          }
        })
      )

      const uniqueVideos = Array.from(new Map(videoSources.map(item => [item.url, item])).values())

      return {
        success: true,
        targetUrl,
        videoSources: uniqueVideos,
        iframeSources: [],
      }
    }

    // ==========================================
    // OTAKUDESU / DEFAULT PARSER ENGINE
    // ==========================================
    const html = await $fetch<string>(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    })

    const $ = cheerio.load(html)
    
    const videoSources: Array<{ label: string; url: string; quality: string }> = []
    const iframeSources: Array<{ label: string; url: string }> = []

    let scriptWithNonce = ''
    $('script').each((_, el) => {
      const content = $(el).html()
      if (content && content.includes('__x__nonce')) {
        scriptWithNonce = content
      }
    })

    if (scriptWithNonce) {
      const actionMatches = [...scriptWithNonce.matchAll(/action\s*:\s*["']([a-f0-9]{32})["']/g)]
      
      if (actionMatches.length >= 2) {
        const streamAction = actionMatches[0][1]
        const getNonceAction = actionMatches[1][1]

        const parsedOrigin = new URL(targetUrl).origin
        const ajaxUrl = `${parsedOrigin}/wp-admin/admin-ajax.php`

        try {
          const nonceBody = new URLSearchParams()
          nonceBody.append('action', getNonceAction)

          const nonceData = await $fetch<{ data: string }>(ajaxUrl, {
            method: 'POST',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': targetUrl,
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: nonceBody.toString()
          })

          const nonce = nonceData.data

          if (nonce) {
            const mirrorElements: Array<{ label: string; dataContent: string; quality: string }> = []
            
            $('.mirrorstream a, .mirrorstream li a').each((_, el) => {
              const dataContent = $(el).attr('data-content')
              const label = $(el).text().trim()
              
              let quality = 'unknown'
              const parentUlClass = $(el).closest('ul').attr('class') || ''
              const qualityMatch = parentUlClass.match(/m(\d+p)/)
              if (qualityMatch) {
                quality = qualityMatch[1]
              }

              if (dataContent) {
                mirrorElements.push({ label, dataContent, quality })
              }
            })

            await Promise.all(
              mirrorElements.map(async (m) => {
                try {
                  const decodedPayload = JSON.parse(Buffer.from(m.dataContent, 'base64').toString('utf8'))
                  
                  const streamBody = new URLSearchParams()
                  Object.keys(decodedPayload).forEach(key => {
                    streamBody.append(key, String(decodedPayload[key]))
                  })
                  streamBody.append('nonce', nonce)
                  streamBody.append('action', streamAction)

                  const streamData = await $fetch<{ data: string }>(ajaxUrl, {
                    method: 'POST',
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                      'Referer': targetUrl,
                      'Content-Type': 'application/x-www-form-urlencoded',
                      'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: streamBody.toString()
                  })

                  if (streamData && streamData.data) {
                    const playerHtml = Buffer.from(streamData.data, 'base64').toString('utf8')
                    const $iframe = cheerio.load(playerHtml)
                    const iframeSrc = $iframe('iframe').attr('src')

                    if (iframeSrc) {
                      videoSources.push({
                        label: `${m.label} (${m.quality})`,
                        url: iframeSrc,
                        quality: m.quality
                      })
                    }
                  }
                } catch (mirrorErr) {
                  // Skip failed mirrors
                }
              })
            )
          }
        } catch (ajaxErr) {
          // Fail gracefully
        }
      }
    }

    if (videoSources.length === 0) {
      $('.download, ul li, ol li').each((_, el) => {
        $(el).find('a').each((__, linkEl) => {
          const href = $(linkEl).attr('href')
          const text = $(linkEl).text().trim() || 'Link'
          if (href) {
            if (
              href.includes('mp4') || 
              href.includes('m3u8') || 
              href.includes('embed') || 
              href.includes('stream')
            ) {
              videoSources.push({ label: text, url: href, quality: 'unknown' })
            }
          }
        })
      })
    }

    $('iframe').each((_, el) => {
      const src = $(el).attr('src')
      const title = $(el).attr('title') || $(el).attr('name') || 'Player Iframe'
      if (src && !src.includes('ads')) {
        iframeSources.push({ label: title, url: src })
      }
    })

    const uniqueVideos = Array.from(new Map(videoSources.map(item => [item.url, item])).values())
    const uniqueIframes = Array.from(new Map(iframeSources.map(item => [item.url, item])).values())

    return {
      success: true,
      targetUrl,
      videoSources: uniqueVideos,
      iframeSources: uniqueIframes,
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Scraping failed: ${error.message}`,
      targetUrl,
    }
  }
})

/**
 * Reusable HTTP/2 GET/POST fetch helper to bypass Cloudflare Turnstile fingerprint check.
 */
function fetchHttp2(target: string, method = 'GET', body: string | null = null, extraHeaders: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(target)
    const client = http2.connect(`https://${url.hostname}`)

    client.on('error', (err) => {
      reject(err)
    })

    const headers: Record<string, string> = {
      ':method': method,
      ':path': url.pathname + url.search,
      ':authority': url.hostname,
      ':scheme': 'https',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      ...extraHeaders
    }

    if (body) {
      headers['content-type'] = 'application/x-www-form-urlencoded'
      headers['content-length'] = Buffer.byteLength(body).toString()
    }

    const req = client.request(headers)

    if (body) {
      req.write(body)
    }

    let responseData = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      responseData += chunk
    })

    req.on('end', () => {
      client.close()
      resolve(responseData)
    })

    req.end()
  })
}
