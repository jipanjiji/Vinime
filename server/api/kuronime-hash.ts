import { defineEventHandler, getQuery, createError } from 'h3'
import * as cheerio from 'cheerio'

/**
 * Lightweight endpoint: fetches Kuronime episode HTML from server (200 OK),
 * extracts the animeku.org hash, and returns it to the frontend.
 * The frontend then POSTs to animeku.org directly from the user's browser
 * (bypassing Vercel's blocked datacenter IP).
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const slug = query.slug as string

  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug parameter.' })
  }

  try {
    const kuronimeUrl = `https://kuronime.sbs/${slug}/`

    const epHtml = await $fetch<string>(kuronimeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none'
      }
    })

    const $ep = cheerio.load(epHtml)

    // Extract animeku.org hash
    let hashVal = ''
    $ep('script').each((_, el) => {
      const content = $ep(el).html() || ''
      const matchHash = content.match(/var\s+_0xa100d42aa\s*=\s*["']([^"']+)["']/i)
      if (matchHash) {
        hashVal = matchHash[1]
        return false
      }
    })

    // Extract direct download links from HTML as well (backup)
    const directLinks: Array<{ quality: string; mirror: string; url: string }> = []
    $ep('a').each((_, el) => {
      const href = $ep(el).attr('href') || ''
      if (!href) return
      const parentText = ($ep(el).parents().text() + ' ' + $ep(el).text()).toLowerCase()
      let quality = '720p'
      if (parentText.includes('1080')) quality = '1080p'
      else if (parentText.includes('480')) quality = '480p'
      else if (parentText.includes('360')) quality = '360p'

      if (href.includes('pixeldrain.com') || href.includes('krakenfiles.com') || href.includes('gofile.io') || href.includes('acefile.co')) {
        let mirror = 'Download'
        if (href.includes('pixeldrain.com')) mirror = 'Pixeldrain'
        else if (href.includes('krakenfiles.com')) mirror = 'Krakenfiles'
        else if (href.includes('gofile.io')) mirror = 'Gofile'
        else if (href.includes('acefile.co')) mirror = 'Acefile'
        if (!directLinks.some(d => d.url === href)) {
          directLinks.push({ quality, mirror, url: href })
        }
      }
    })

    return {
      success: true,
      hash: hashVal || null,
      kuronimeUrl,
      directLinks
    }
  } catch (err: any) {
    return {
      success: false,
      hash: null,
      directLinks: [],
      message: err.message
    }
  }
})
