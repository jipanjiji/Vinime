import { defineEventHandler, getQuery } from 'h3'

const API_BASE = 'https://backapi.oploverz.ac'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
  'Origin': 'https://oploverz.site',
  'Referer': 'https://oploverz.site/'
}

// Server-side Oploverz scraper using their public JSON API.
// URL pattern: /series/{anime-slug-s#}/episode/{ep-number}
// Slug mapping from Kuronime: "season-3" → "-s3", "season-1" → "" (no suffix)
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const slug = (query.slug as string || '').replace(/^nonton-/, '').replace(/\/$/, '')

  if (!slug) {
    return { success: false, message: 'Missing slug parameter', videoSources: [] }
  }

  // Extract episode number
  const epNumMatch = slug.match(/(?:episode|eps)[- _](\d+(?:\.\d+)?)/i)
  const epNumber = epNumMatch ? epNumMatch[1] : '1'

  // Extract season and build the Oploverz anime slug
  const seasonMatch = slug.match(/season[- _](\d+)/i)
  const seasonNumber = seasonMatch ? parseInt(seasonMatch[1]) : 1

  // Build base anime slug (remove episode/season parts)
  const animeSlugBase = slug
    .replace(/[-_](?:episode|eps)[- _]?\d+.*/gi, '')
    .replace(/[-_]season[- _]?\d+/gi, '')
    .replace(/[-_]s\d+$/gi, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  // Aploverz uses "-s2", "-s3", etc. for seasons 2+; season 1 has no suffix
  const seasonSuffix = seasonNumber > 1 ? `-s${seasonNumber}` : ''
  const animeSlug = `${animeSlugBase}${seasonSuffix}`

  console.log(`[Oploverz Server] slug=${slug}, animeSlug=${animeSlug}, ep=${epNumber}`)

  try {
    // Step 1: Try to find the anime via Oploverz public API
    const animeData = await fetchOploversz<any>(`${API_BASE}/anime?slug=${encodeURIComponent(animeSlug)}`)

    if (!animeData?.result?.id) {
      // Try searching by keyword if direct slug fails
      const keyword = animeSlugBase.replace(/-/g, ' ')
      const searchData = await fetchOploversz<any>(`${API_BASE}/anime?q=${encodeURIComponent(keyword)}&limit=5`)
      
      const results = searchData?.result?.data || searchData?.result || []
      const animeList = Array.isArray(results) ? results : []

      if (animeList.length === 0) {
        return { success: false, message: `Anime not found on Oploverz: ${animeSlug}`, videoSources: [] }
      }

      // Pick best match
      let bestAnime = animeList[0]
      if (seasonNumber > 1) {
        const withSeason = animeList.find((a: any) => 
          (a.slug || '').includes(`-s${seasonNumber}`) ||
          (a.title || '').toLowerCase().includes(`s${seasonNumber}`)
        )
        if (withSeason) bestAnime = withSeason
      }

      const animeId = bestAnime.id
      return await scrapeEpisode(animeId, epNumber, bestAnime.slug || animeSlug)
    }

    const animeId = animeData.result.id
    return await scrapeEpisode(animeId, epNumber, animeData.result.slug || animeSlug)
  } catch (err: any) {
    console.error('[Oploverz Server] Error:', err.message)
    return { success: false, message: err.message, videoSources: [] }
  }
})

async function scrapeEpisode(animeId: string | number, epNumber: string, animeSlug: string) {
  const videoSources: Array<{ label: string; url: string; quality: string; isIframe: boolean }> = []

  try {
    // Find episode by number
    const epData = await fetchOploversz<any>(`${API_BASE}/episode?anime_id=${animeId}&number=${epNumber}`)
    const episode = epData?.result
    
    if (!episode) {
      // Try listing all episodes and finding by number
      const epsData = await fetchOploversz<any>(`${API_BASE}/episode?anime_id=${animeId}&limit=100`)
      const episodes = epsData?.result?.data || epsData?.result || []
      const epList = Array.isArray(episodes) ? episodes : []
      const found = epList.find((e: any) => String(e.number) === String(epNumber) || String(e.episode_number) === String(epNumber))
      if (!found) {
        return { success: false, message: `Episode ${epNumber} not found for anime ${animeSlug}`, videoSources: [] }
      }
      return await extractSourcesFromEpisode(found, animeSlug, epNumber)
    }

    return await extractSourcesFromEpisode(episode, animeSlug, epNumber)
  } catch (err: any) {
    return { success: false, message: `Failed to get episode: ${err.message}`, videoSources: [] }
  }
}

async function extractSourcesFromEpisode(episode: any, animeSlug: string, epNumber: string) {
  const videoSources: Array<{ label: string; url: string; quality: string; isIframe: boolean }> = []
  
  // Collect all links from episode data
  const downloads = episode.downloads || episode.download_links || episode.links || []
  
  for (const dl of downloads) {
    const quality = dl.quality || dl.resolution || 'unknown'
    const links = dl.links || dl.sources || [dl]

    for (const link of links) {
      const href = link.url || link.href || link.link || link
      const host = link.host || link.name || link.server || ''
      
      if (typeof href !== 'string' || !href.startsWith('http')) continue

      let mirrorName = host || 'Mirror'
      let isIframe = false

      if (href.includes('acefile.co')) { mirrorName = 'Acefile' }
      else if (href.includes('filedon.co') || href.includes('filedon.io')) { mirrorName = 'Filedon' }
      else if (href.includes('vikingfile.com') || href.includes('vikingfile.net')) { mirrorName = 'VikingFile' }
      else if (href.includes('pixeldrain.com')) { mirrorName = 'Pixeldrain' }
      else if (href.includes('krakenfiles.com')) { mirrorName = 'Krakenfiles' }
      else if (href.includes('gofile.io')) { mirrorName = 'Gofile' }
      else { isIframe = true }

      if (!videoSources.some(v => v.url === href)) {
        videoSources.push({
          label: `[Oploverz] ${mirrorName} (${quality})`,
          url: href,
          quality: quality.toLowerCase().replace(/p$/, '') + 'p',
          isIframe
        })
      }
    }
  }

  // If no structured downloads, try stream sources
  const streams = episode.streams || episode.stream_links || episode.videos || []
  for (const stream of streams) {
    const quality = stream.quality || stream.resolution || '720p'
    const href = stream.url || stream.src || stream.link
    if (typeof href !== 'string' || !href.startsWith('http')) continue
    
    if (!videoSources.some(v => v.url === href)) {
      videoSources.push({
        label: `[Oploverz] Stream (${quality})`,
        url: href,
        quality: quality.toLowerCase(),
        isIframe: !href.includes('.mp4') && !href.includes('.m3u8')
      })
    }
  }

  console.log(`[Oploverz Server] Found ${videoSources.length} sources for ep ${epNumber} of ${animeSlug}`)

  return {
    success: videoSources.length > 0,
    videoSources
  }
}

async function fetchOploversz<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}
