import { defineEventHandler, getQuery, createError } from 'h3'
import * as cheerio from 'cheerio'

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
    const videoSources: Array<{ label: string; url: string; quality: string }> = []
    const html = await fetchHttp2(targetUrl)
    const $ = cheerio.load(html)

    // 1. Extract standard player options
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

    const parsedOrigin = new URL(targetUrl).origin
    const ajaxUrl = `${parsedOrigin}/wp-admin/admin-ajax.php`

    // Fetch mirrors in parallel
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
              let quality = 'unknown'
              const qualityMatch = opt.label.match(/(\d+p|4k)/i)
              if (qualityMatch) {
                quality = qualityMatch[1].toLowerCase()
              }

              const serverName = opt.label.replace(/\s*(\d+p|4k)/i, '').trim()
              videoSources.push({
                label: `[Samehadaku] ${serverName} (${quality})`,
                url: iframeSrc,
                quality
              })
            }
          }
        } catch {
          // Skip fail
        }
      })
    )

    // 2. Extract download links
    $('.download-link ul li, .download-eps li, .sda_download li').each((_, el) => {
      let quality = 'unknown'
      const strongText = $(el).find('strong').text().trim()
      const qualityMatch = strongText.match(/(\d+p|4k)/i)
      if (qualityMatch) {
        quality = qualityMatch[1].toLowerCase()
      }

      $(el).find('a').each((__, aEl) => {
        const href = $(aEl).attr('href') || ''
        const label = $(aEl).text().trim()
        
        if (href && (href.includes('krakenfiles.com') || href.includes('pixeldrain.com') || href.includes('gofile.io') || href.includes('acefile.co'))) {
          let mirrorName = label || 'Download Mirror'
          if (href.includes('krakenfiles.com')) mirrorName = 'Krakenfiles'
          else if (href.includes('pixeldrain.com')) mirrorName = 'Pixeldrain'
          else if (href.includes('gofile.io')) mirrorName = 'Gofile'
          else if (href.includes('acefile.co')) mirrorName = 'Acefile'

          videoSources.push({
            label: `[Samehadaku Direct] ${mirrorName} (${quality})`,
            url: href,
            quality
          })
        }
      })
    })

    return {
      success: true,
      url: targetUrl,
      videoSources
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to scrape Samehadaku URL: ${error.message}`,
      videoSources: []
    }
  }
})

async function fetchHttp2(target: string, method = 'GET', body: string | null = null, extraHeaders: Record<string, string> = {}): Promise<string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    ...extraHeaders
  }

  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  const res = await fetch(target, {
    method,
    headers,
    body: body ?? undefined,
    signal: AbortSignal.timeout(8000)
  })

  return res.text()
}
