import { defineEventHandler, getQuery } from 'h3'
import * as cheerio from 'cheerio'

// Attempt to resolve a Samehadaku episode URL from a Kuronime-style episode slug.
// This runs entirely server-side on Railway (no CORS / Cloudflare issues for the client).
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const slug = (query.slug as string || '').replace(/^nonton-/, '').replace(/\/$/, '')

  if (!slug) {
    return { success: false, message: 'Missing slug parameter', videoSources: [] }
  }

  // Build candidate URLs for Samehadaku
  const candidateUrls = [
    `https://v2.samehadaku.how/${slug}/`,
    `https://v2.samehadaku.how/${slug}-sub-indo/`,
    // Try season normalizations (e.g. season-3 → s3)
    `https://v2.samehadaku.how/${slug.replace(/season-(\d+)/i, 's$1')}/`,
    `https://v2.samehadaku.how/${slug.replace(/-season-(\d+)/i, '')}/`,
  ]

  let workingHtml = ''
  let workingUrl = ''

  for (const url of candidateUrls) {
    try {
      const html = await fetchHttp2(url)
      // Check that this is an actual episode page (has player options)
      if (html.includes('east_player_option') || html.includes('download-link')) {
        workingHtml = html
        workingUrl = url
        break
      }
    } catch {
      // Continue to next candidate
    }
  }

  if (!workingHtml) {
    return { success: false, message: 'Samehadaku episode page not found for this slug', videoSources: [] }
  }

  const videoSources: Array<{ label: string; url: string; quality: string; isIframe: boolean }> = []
  const $ = cheerio.load(workingHtml)

  // Extract standard player options (iframe embeds)
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

  const parsedOrigin = new URL(workingUrl).origin
  const ajaxUrl = `${parsedOrigin}/wp-admin/admin-ajax.php`

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
          { 'referer': workingUrl, 'x-requested-with': 'XMLHttpRequest' }
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
            if (qualityMatch) quality = qualityMatch[1].toLowerCase()

            const serverName = opt.label.replace(/\s*(\d+p|4k)/i, '').trim()
            const isDirectSrc = iframeSrc.includes('pixeldrain') || iframeSrc.includes('krakenfiles') || iframeSrc.includes('gofile') || iframeSrc.includes('wibufile')
            videoSources.push({
              label: `[Samehadaku] ${serverName} (${quality})`,
              url: iframeSrc,
              quality,
              isIframe: !isDirectSrc
            })
          }
        }
      } catch {
        // Skip failed option
      }
    })
  )

  // Extract download links (direct video hosting links)
  $('.download-link ul li, .download-eps li, .sda_download li').each((_, el) => {
    let quality = 'unknown'
    const strongText = $(el).find('strong').text().trim()
    const qualityMatch = strongText.match(/(\d+p|4k)/i)
    if (qualityMatch) quality = qualityMatch[1].toLowerCase()

    $(el).find('a').each((__, aEl) => {
      const href = $(aEl).attr('href') || ''
      const label = $(aEl).text().trim()

      if (href && (href.includes('krakenfiles.com') || href.includes('pixeldrain.com') || href.includes('gofile.io') || href.includes('acefile.co') || href.includes('wibufile'))) {
        let mirrorName = label || 'Download Mirror'
        if (href.includes('krakenfiles.com')) mirrorName = 'Krakenfiles'
        else if (href.includes('pixeldrain.com')) mirrorName = 'Pixeldrain'
        else if (href.includes('gofile.io')) mirrorName = 'Gofile'
        else if (href.includes('acefile.co')) mirrorName = 'Acefile'
        else if (href.includes('wibufile')) mirrorName = 'Wibufile'

        if (!videoSources.some(v => v.url === href)) {
          videoSources.push({
            label: `[Samehadaku Direct] ${mirrorName} (${quality})`,
            url: href,
            quality,
            isIframe: false
          })
        }
      }
    })
  })

  return {
    success: videoSources.length > 0,
    url: workingUrl,
    videoSources
  }
})

async function fetchHttp2(target: string, method = 'GET', body: string | null = null, extraHeaders: Record<string, string> = {}): Promise<string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    ...extraHeaders
  }

  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  const res = await fetch(target, {
    method,
    headers,
    body: body ?? undefined,
    signal: AbortSignal.timeout(12000)
  })

  return res.text()
}
