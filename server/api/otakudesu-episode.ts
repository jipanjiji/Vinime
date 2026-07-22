import { defineEventHandler, getQuery } from 'h3'
import * as cheerio from 'cheerio'

const CHROME_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'no-cache'
}

// Server-side Otakudesu episode scraper that:
// 1. Takes a Kuronime-style episode slug
// 2. Deduces anime title + episode number
// 3. Searches Otakudesu for the anime
// 4. Finds the matching episode page
// 5. Scrapes download links — all from Railway, no CORS needed on client
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const slug = (query.slug as string || '').replace(/^nonton-/, '').replace(/\/$/, '')

  if (!slug) {
    return { success: false, message: 'Missing slug parameter', videoSources: [] }
  }

  // 1. Extract episode number from slug
  const epNumMatch = slug.match(/(?:episode|eps)[- _](\d+(?:\.\d+)?)/i)
  const epNumber = epNumMatch ? epNumMatch[1] : '1'

  // 2. Extract season number (if any)
  const seasonMatch = slug.match(/season[- _](\d+)/i)
  const seasonNumber = seasonMatch ? parseInt(seasonMatch[1]) : 1

  // 3. Build search keyword from slug (remove episode/season/eps parts, take first 3 words)
  const searchKeyword = slug
    .replace(/[-_](?:season|s)[- _]?\d+/gi, '')
    .replace(/[-_](?:episode|eps|ep)[- _]?\d+/gi, '')
    .replace(/[-_]sub[- _]indo/gi, '')
    .replace(/-/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ')

  console.log(`[Otakudesu Server] slug=${slug}, keyword="${searchKeyword}", ep=${epNumber}, season=${seasonNumber}`)

  try {
    // Step A: Search Otakudesu for the anime
    const animePageUrl = await searchOtakudesuAnime(searchKeyword, seasonNumber)
    if (!animePageUrl) {
      return { success: false, message: `No Otakudesu anime found for: ${searchKeyword}`, videoSources: [] }
    }

    // Step B: Find the episode page URL from the anime page
    const episodePageUrl = await findEpisodeOnAnimePage(animePageUrl, epNumber)
    if (!episodePageUrl) {
      return { success: false, message: `Episode ${epNumber} not found on Otakudesu anime page: ${animePageUrl}`, videoSources: [] }
    }

    console.log(`[Otakudesu Server] Found episode page: ${episodePageUrl}`)

    // Step C: Scrape download links from episode page
    const videoSources = await scrapeEpisodePage(episodePageUrl)

    return {
      success: videoSources.length > 0,
      url: episodePageUrl,
      videoSources
    }
  } catch (err: any) {
    return { success: false, message: err.message, videoSources: [] }
  }
})

async function searchOtakudesuAnime(keyword: string, season: number): Promise<string | null> {
  const searchDomains = ['otakudesu.cloud', 'otakudesu.blog', 'otakudesu.lol']
  
  for (const domain of searchDomains) {
    try {
      const searchUrl = `https://${domain}/?s=${encodeURIComponent(keyword)}&post_type=anime`
      const html = await fetchPage(searchUrl)
      const $ = cheerio.load(html)
      
      const results: Array<{ title: string; url: string }> = []
      $('.chivsrc li, .search-page li, article.venser').each((_, el) => {
        const titleEl = $(el).find('h2 a, h3 a, .jdlz a').first()
        const href = titleEl.attr('href') || $(el).find('a').first().attr('href') || ''
        const title = titleEl.text().trim() || $(el).find('img').attr('alt') || ''
        if (href && title) results.push({ title, url: href })
      })

      if (results.length === 0) continue

      // Pick best match: prefer entry with season number in title if season > 1
      let best = results[0]
      if (season > 1) {
        const seasonStr = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][season] || season.toString()
        const withSeason = results.find(r => 
          r.title.toLowerCase().includes(`season ${season}`) ||
          r.title.toLowerCase().includes(`s${season}`) ||
          r.title.toLowerCase().includes(seasonStr.toLowerCase())
        )
        if (withSeason) best = withSeason
      }

      return best.url
    } catch {
      continue
    }
  }
  return null
}

async function findEpisodeOnAnimePage(animePageUrl: string, epNumber: string): Promise<string | null> {
  try {
    const html = await fetchPage(animePageUrl)
    const $ = cheerio.load(html)

    let found: string | null = null
    const epNum = parseInt(epNumber)

    // Look through episode list links
    $('.episodelist a, .eps a, ul.episodelist li a, .epslist a').each((_, el) => {
      if (found) return false
      const href = $(el).attr('href') || ''
      const text = $(el).text().trim()
      
      // Match "Episode X" or "Ep X" in the link text
      const numMatch = text.match(/(?:episode|eps?)[^\d]*(\d+(?:\.\d+)?)/i)
      if (numMatch && parseFloat(numMatch[1]) === epNum) {
        found = href
        return false
      }
      // Also check if the URL itself contains the episode number pattern
      if (href.match(new RegExp(`(?:episode|eps?)[- _]?0*${epNum}(?:[^\\d]|$)`, 'i'))) {
        found = href
        return false
      }
    })

    return found
  } catch {
    return null
  }
}

async function scrapeEpisodePage(episodeUrl: string): Promise<Array<{ label: string; url: string; quality: string; isIframe: boolean }>> {
  const videoSources: Array<{ label: string; url: string; quality: string; isIframe: boolean }> = []
  
  const html = await fetchPage(episodeUrl)
  const $ = cheerio.load(html)

  const candidates: Array<{ label: string; rawUrl: string; quality: string }> = []

  // Extract download links (direct video hosting links)
  $('.download ul li').each((_, el) => {
    let quality = 'unknown'
    const headerText = $(el).find('h4, strong').text().trim()
    const qualityMatch = headerText.match(/(\d+p|4k)/i)
    if (qualityMatch) quality = qualityMatch[1].toLowerCase()

    $(el).find('a').each((__, aEl) => {
      const href = $(aEl).attr('href') || ''
      const label = $(aEl).text().trim()

      if (href && href.startsWith('http')) {
        candidates.push({ label, rawUrl: href, quality })
      }
    })
  })

  // Resolve desustream redirect links in parallel
  await Promise.all(
    candidates.map(async (c) => {
      try {
        let finalUrl = c.rawUrl
        if (c.rawUrl.includes('desustream.com')) {
          // Perform a fast request checking for 302 location header
          const res = await fetch(c.rawUrl, {
            method: 'GET',
            redirect: 'manual',
            headers: CHROME_HEADERS,
            signal: AbortSignal.timeout(6000)
          })
          const loc = res.headers.get('location')
          if (loc) finalUrl = loc
        }

        const lowerUrl = finalUrl.toLowerCase()
        const isAllowedHost = 
          lowerUrl.includes('krakenfiles.com') ||
          lowerUrl.includes('pixeldrain.com') ||
          lowerUrl.includes('gofile.io') ||
          lowerUrl.includes('acefile.co') ||
          lowerUrl.includes('filedon.co') ||
          lowerUrl.includes('filedon.io') ||
          lowerUrl.includes('vikingfile.com') ||
          lowerUrl.includes('vikingfile.net') ||
          lowerUrl.includes('wibufile')

        if (isAllowedHost) {
          if (lowerUrl.includes('krakenfiles.com')) {
            const krMatch = finalUrl.match(/krakenfiles\.com\/view\/([a-zA-Z0-9]+)/)
            if (krMatch) {
              finalUrl = `https://krakenfiles.com/embed-video/${krMatch[1]}`
            }
          }

          let mirrorName = c.label || 'Mirror'
          if (lowerUrl.includes('krakenfiles.com')) mirrorName = 'Krakenfiles'
          else if (lowerUrl.includes('pixeldrain.com')) mirrorName = 'Pixeldrain'
          else if (lowerUrl.includes('gofile.io')) mirrorName = 'Gofile'
          else if (lowerUrl.includes('acefile.co')) mirrorName = 'Acefile'
          else if (lowerUrl.includes('filedon.co') || lowerUrl.includes('filedon.io')) mirrorName = 'Filedon'
          else if (lowerUrl.includes('vikingfile')) mirrorName = 'VikingFile'
          else if (lowerUrl.includes('wibufile')) mirrorName = 'Wibufile'

          const isIframe = lowerUrl.includes('acefile.co') || 
                           lowerUrl.includes('filedon.co') || 
                           lowerUrl.includes('filedon.io') ||
                           lowerUrl.includes('krakenfiles.com')

          if (!videoSources.some(v => v.url === finalUrl)) {
            videoSources.push({
              label: `[Otakudesu Direct] ${mirrorName} (${c.quality})`,
              url: finalUrl,
              quality: c.quality,
              isIframe
            })
          }
        }
      } catch (err: any) {
        console.warn(`[Otakudesu Scraper] Failed to resolve URL ${c.rawUrl}: ${err.message}`)
      }
    })
  )

  return videoSources
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: CHROME_HEADERS,
    signal: AbortSignal.timeout(12000)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
  return res.text()
}
