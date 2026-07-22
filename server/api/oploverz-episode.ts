import { defineEventHandler, getQuery } from 'h3'
import * as cheerio from 'cheerio'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'no-cache'
}

// Slug conversion: Kuronime → Oploverz
// "mushoku-tensei-isekai-ittara-honki-dasu-season-3-episode-1" 
//   → series slug: "mushoku-tensei-isekai-ittara-honki-dasu-s3"
//   → episode: 1
// URL: https://oploverz.site/series/{series-slug}/episode/{ep-num}
function buildOploversUrls(slug: string): { url: string; epNumber: string }[] {
  const clean = slug.replace(/^nonton-/, '').replace(/\/$/, '')

  const epNumMatch = clean.match(/(?:episode|eps)[- _](\d+(?:\.\d+)?)/i)
  const epNumber = epNumMatch ? epNumMatch[1] : '1'

  const seasonMatch = clean.match(/season[- _](\d+)/i)
  const seasonNumber = seasonMatch ? parseInt(seasonMatch[1]) : 1

  // Build anime base slug (strip season + episode)
  const base = clean
    .replace(/[-_](?:episode|eps)[- _]?\d+.*/gi, '')
    .replace(/[-_]season[- _]?\d+/gi, '')
    .replace(/[-_]sub[- _]indo/gi, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const seasonSuffix = seasonNumber > 1 ? `-s${seasonNumber}` : ''
  const seriesSlug = `${base}${seasonSuffix}`

  const urls = [
    { url: `https://oploverz.site/series/${seriesSlug}/episode/${epNumber}`, epNumber },
    // Try without suffix (season 1 fallback)
    ...(seasonNumber > 1
      ? [{ url: `https://oploverz.site/series/${base}/episode/${epNumber}`, epNumber }]
      : []),
    // Try alternate domain
    { url: `https://anime.oploverz.ac/series/${seriesSlug}/episode/${epNumber}`, epNumber },
  ]

  return urls
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const slug = (query.slug as string || '').replace(/^nonton-/, '').replace(/\/$/, '')

  if (!slug) {
    return { success: false, message: 'Missing slug', videoSources: [] }
  }

  const candidates = buildOploversUrls(slug)
  console.log(`[Oploverz Server] Trying URLs for slug="${slug}":`, candidates.map(c => c.url))

  for (const { url, epNumber } of candidates) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) })
      if (!res.ok) {
        console.log(`[Oploverz Server] ${url} → HTTP ${res.status}`)
        continue
      }

      const html = await res.text()

      // Verify this is an actual episode page (not 404 or redirect)
      if (!html.includes('Unduh') && !html.includes('download') && !html.includes('480p') && !html.includes('720p')) {
        console.log(`[Oploverz Server] ${url} → not an episode page`)
        continue
      }

      const videoSources = parseOploversDownloads(html, url)
      if (videoSources.length > 0) {
        console.log(`[Oploverz Server] Found ${videoSources.length} sources from ${url}`)
        return { success: true, url, videoSources }
      }
    } catch (err: any) {
      console.warn(`[Oploverz Server] ${url} → ${err.message}`)
    }
  }

  return { success: false, message: 'No Oploverz episode found for this slug', videoSources: [] }
})

function parseOploversDownloads(html: string, pageUrl: string) {
  const videoSources: Array<{ label: string; url: string; quality: string; isIframe: boolean }> = []
  const $ = cheerio.load(html)

  // Parse structured download links: each row has quality (480p/720p/1080p) + link buttons
  // Oploverz HTML: <div class="flex flex-row items-start gap-5 ...">
  //   <div class="w-20"><p>480p</p></div>
  //   <div class="flex flex-row ..."><a href="https://acefile.co/...">GD</a> ...
  
  // Strategy 1: Look for quality rows with anchor links
  $('div').each((_, row) => {
    const rowEl = $(row)
    const qualityEl = rowEl.find('> div > p, > div.w-20 p').first()
    const qualityText = qualityEl.text().trim()
    const qualityMatch = qualityText.match(/(\d+p|4k)/i)
    if (!qualityMatch) return

    const quality = qualityMatch[1].toLowerCase()
    rowEl.find('a[href]').each((__, aEl) => {
      const href = $(aEl).attr('href') || ''
      const label = $(aEl).text().trim()

      if (!href.startsWith('http')) return

      // Filter only known file hosts
      const isKnownHost = 
        href.includes('acefile.co') || href.includes('filedon.co') || href.includes('filedon.io') ||
        href.includes('vikingfile.com') || href.includes('vikingfile.net') || 
        href.includes('pixeldrain.com') || href.includes('krakenfiles.com') || href.includes('gofile.io')

      if (!isKnownHost) return

      let mirrorName = label
      if (href.includes('acefile.co')) mirrorName = 'Acefile'
      else if (href.includes('filedon.co') || href.includes('filedon.io')) mirrorName = 'Filedon'
      else if (href.includes('vikingfile')) mirrorName = 'VikingFile'
      else if (href.includes('pixeldrain.com')) mirrorName = 'Pixeldrain'
      else if (href.includes('krakenfiles.com')) mirrorName = 'Krakenfiles'
      else if (href.includes('gofile.io')) mirrorName = 'Gofile'

      if (!videoSources.some(v => v.url === href)) {
        videoSources.push({
          label: `[Oploverz] ${mirrorName} (${quality})`,
          url: href,
          quality,
          isIframe: false
        })
      }
    })
  })

  // Strategy 2: Fallback — find ALL known host links in page, guess quality from context
  if (videoSources.length === 0) {
    $('a[href]').each((_, aEl) => {
      const href = $(aEl).attr('href') || ''
      if (!href.startsWith('http')) return

      const isKnownHost =
        href.includes('acefile.co') || href.includes('filedon.co') || href.includes('filedon.io') ||
        href.includes('vikingfile.com') || href.includes('vikingfile.net') ||
        href.includes('pixeldrain.com') || href.includes('krakenfiles.com') || href.includes('gofile.io')

      if (!isKnownHost) return

      // Try to find quality from surrounding text
      const parentText = $(aEl).parents().slice(0, 4).text()
      const qualityM = parentText.match(/(\d+p|4k)/i)
      const quality = qualityM ? qualityM[1].toLowerCase() : 'unknown'

      let mirrorName = $(aEl).text().trim()
      if (href.includes('acefile.co')) mirrorName = 'Acefile'
      else if (href.includes('filedon.co') || href.includes('filedon.io')) mirrorName = 'Filedon'
      else if (href.includes('vikingfile')) mirrorName = 'VikingFile'
      else if (href.includes('pixeldrain.com')) mirrorName = 'Pixeldrain'
      else if (href.includes('krakenfiles.com')) mirrorName = 'Krakenfiles'
      else if (href.includes('gofile.io')) mirrorName = 'Gofile'

      if (!videoSources.some(v => v.url === href)) {
        videoSources.push({
          label: `[Oploverz] ${mirrorName} (${quality})`,
          url: href,
          quality,
          isIframe: false
        })
      }
    })
  }

  return videoSources
}
