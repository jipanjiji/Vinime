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
    const epHtml = await fetchHttp2(targetUrl)
    const $ep = cheerio.load(epHtml)

    $ep('.server').each((_, el) => {
      const label = $ep(el).text().trim()
      let dataVideo = $ep(el).attr('data-video') || ''

      if (dataVideo) {
        if (dataVideo.startsWith('/')) {
          dataVideo = `https://anime-indo.lol${dataVideo}`
        }

        let quality = '720p'
        const lowerLabel = label.toLowerCase()
        if (lowerLabel.includes('360')) {
          quality = '360p'
        } else if (lowerLabel.includes('480')) {
          quality = '480p'
        } else if (lowerLabel.includes('1080')) {
          quality = '1080p'
        }

        videoSources.push({
          label: `[Animeindo] ${label} (${quality})`,
          url: dataVideo,
          quality
        })
      }
    })

    return {
      success: true,
      url: targetUrl,
      videoSources
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to scrape Animeindo URL: ${error.message}`,
      videoSources: []
    }
  }
})

async function fetchHttp2(target: string): Promise<string> {
  const res = await fetch(target, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    signal: AbortSignal.timeout(8000)
  })
  return res.text()
}
