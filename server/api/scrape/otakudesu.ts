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

  const CHROME_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1'
  }

  try {
    const videoSources: Array<{ label: string; url: string; quality: string }> = []

    let epHtml = ''
    let activeUrl = targetUrl
    const domains = ['otakudesu.cloud', 'otakudesu.blog', 'otakudesu.lol']

    for (const d of domains) {
      try {
        const urlObj = new URL(activeUrl)
        urlObj.hostname = d
        console.log(`[Otakudesu Scraper] Fetching: ${urlObj.toString()}`)
        epHtml = await $fetch<string>(urlObj.toString(), { headers: CHROME_HEADERS, timeout: 6000 })
        activeUrl = urlObj.toString()
        break
      } catch (err: any) {
        console.warn(`[Otakudesu Scraper] Domain ${d} failed: ${err.message}`)
      }
    }

    if (!epHtml) {
      throw new Error('All Otakudesu domains blocked or offline.')
    }

    const $ep = cheerio.load(epHtml)

    // Extract embed options
    let scriptWithNonce = ''
    $ep('script').each((_, el) => {
      const content = $ep(el).html()
      if (content && content.includes('__x__nonce')) scriptWithNonce = content
    })

    if (scriptWithNonce) {
      const actionMatches = [...scriptWithNonce.matchAll(/action\s*:\s*["']([a-f0-9]{32})["']/g)]
      if (actionMatches.length >= 2) {
        // actionMatches[0] = streamAction, actionMatches[1] = getNonceAction
        const streamAction = actionMatches[0][1]
        const getNonceAction = actionMatches[1][1]

        // Extract the AJAX URL directly from the script (the script hardcodes otakudesu.blog)
        const ajaxUrlMatch = scriptWithNonce.match(/\$\.ajax\(["'](https?:\/\/[^"']+admin-ajax\.php)["']/) ||
          scriptWithNonce.match(/["'](https?:\/\/[^"']+admin-ajax\.php)["']/)
        const ajaxUrl = ajaxUrlMatch ? ajaxUrlMatch[1] : `${new URL(activeUrl).origin}/wp-admin/admin-ajax.php`
        console.log(`[Otakudesu Scraper] AJAX URL: ${ajaxUrl}, streamAction: ${streamAction}, getNonceAction: ${getNonceAction}`)

        const nonceBody = new URLSearchParams()
        nonceBody.append('action', getNonceAction)

        const nonceData = await $fetch<{ data: string }>(ajaxUrl, {
          method: 'POST',
          headers: {
            ...CHROME_HEADERS,
            'Referer': activeUrl,
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin'
          },
          body: nonceBody.toString()
        })

        const nonce = nonceData.data
        if (nonce) {
          const mirrorElements: Array<{ label: string; dataContent: string; quality: string }> = []
          $ep('.mirrorstream a, .mirrorstream li a').each((_, el) => {
            const dataContent = $ep(el).attr('data-content')
            const label = $ep(el).text().trim()
            
            let quality = 'unknown'
            const parentUlClass = $ep(el).closest('ul').attr('class') || ''
            const qualityMatch = parentUlClass.match(/m(\d+p)/)
            if (qualityMatch) quality = qualityMatch[1]

            if (dataContent) mirrorElements.push({ label, dataContent, quality })
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
                    ...CHROME_HEADERS,
                    'Referer': activeUrl,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin'
                  },
                  body: streamBody.toString()
                })

                if (streamData?.data) {
                  const playerHtml = Buffer.from(streamData.data, 'base64').toString('utf8')
                  const $iframe = cheerio.load(playerHtml)
                  const iframeSrc = $iframe('iframe').attr('src')
                  if (iframeSrc) {
                    videoSources.push({
                      label: `[Otakudesu] ${m.label} (${m.quality})`,
                      url: iframeSrc,
                      quality: m.quality
                    })
                  }
                }
              } catch {}
            })
          )
        }
      }
    }

    // Extract download links
    $ep('.download ul li').each((_, el) => {
      let quality = 'unknown'
      const headerText = $ep(el).find('h4, strong').text().trim()
      const qualityMatch = headerText.match(/(\d+p|4k)/i)
      if (qualityMatch) quality = qualityMatch[1].toLowerCase()

      $ep(el).find('a').each((__, aEl) => {
        const href = $ep(aEl).attr('href') || ''
        const label = $ep(aEl).text().trim()

        if (href && (href.includes('krakenfiles.com') || href.includes('pixeldrain.com') || href.includes('gofile.io') || href.includes('acefile.co'))) {
          let mirrorName = label || 'Download Mirror'
          if (href.includes('krakenfiles.com')) mirrorName = 'Krakenfiles'
          else if (href.includes('pixeldrain.com')) mirrorName = 'Pixeldrain'
          else if (href.includes('gofile.io')) mirrorName = 'Gofile'
          else if (href.includes('acefile.co')) mirrorName = 'Acefile'

          videoSources.push({
            label: `[Otakudesu Direct] ${mirrorName} (${quality})`,
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
      message: `Failed to scrape Otakudesu URL: ${error.message}`,
      videoSources: []
    }
  }
})
