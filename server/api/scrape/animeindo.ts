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

function fetchHttp2(target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(target)
    const client = http2.connect(`https://${url.hostname}`)

    client.on('error', (err) => {
      reject(err)
    })

    const req = client.request({
      ':method': 'GET',
      ':path': url.pathname + url.search,
      ':authority': url.hostname,
      ':scheme': 'https',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    })

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
