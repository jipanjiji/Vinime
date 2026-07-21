import { defineEventHandler, getQuery, createError } from 'h3'
import * as cheerio from 'cheerio'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const embedUrl = query.url as string

  if (!embedUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing target "url" parameter for resolver.',
    })
  }

  const lowerUrl = embedUrl.toLowerCase()

  // 1. Pixeldrain Direct Stream Bypass (support both /u/ and /api/file/ formats)
  if (lowerUrl.includes('pixeldrain.com')) {
    try {
      let id = ''
      if (lowerUrl.includes('/u/')) {
        id = embedUrl.split('/u/')[1]?.split('?')[0]?.replace(/\/$/, '')
      } else if (lowerUrl.includes('/api/file/')) {
        id = embedUrl.split('/api/file/')[1]?.split('?')[0]?.replace(/\/$/, '')
      }
      if (id) {
        return {
          success: true,
          rawVideoUrl: `https://pixeldrain.com/api/file/${id}`,
          type: 'video/mp4',
          embedUrl
        }
      }
    } catch {}
  }

  // 2. Direct Stream Check (already mp4, m3u8, mkv, webm, or direct storage hosts)
  if (
    lowerUrl.includes('.mp4') ||
    lowerUrl.includes('.m3u8') ||
    lowerUrl.includes('.mkv') ||
    lowerUrl.includes('.webm') ||
    lowerUrl.includes('googlevideo.com') ||
    lowerUrl.includes('blogger.com') ||
    lowerUrl.includes('blogspot.com') ||
    lowerUrl.includes('googleusercontent.com') ||
    lowerUrl.includes('wibufile.com') ||
    lowerUrl.includes('filedon.co') ||
    lowerUrl.includes('cloudflarestorage.com') ||
    lowerUrl.includes('archive.org')
  ) {
    return {
      success: true,
      rawVideoUrl: embedUrl,
      type: lowerUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4',
      embedUrl
    }
  }

  try {
    // Fetch page
    const html = await $fetch<string>(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://otakudesu.blog/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    })

    const $ = cheerio.load(html)
    let rawVideoUrl = ''
    let detectedType = 'unknown'

    // 3. Krakenfiles Player Parsing
    if (lowerUrl.includes('krakenfiles.com/view/') || lowerUrl.includes('krakenfiles.com/embed-video/')) {
      const videoSrc = $('video source').first().attr('src')
      if (videoSrc) {
        rawVideoUrl = videoSrc.startsWith('//') ? `https:${videoSrc}` : videoSrc
        detectedType = 'video/mp4'
      }
    }

    // 4. Look in script tags for direct video links or packer obfuscation
    if (!rawVideoUrl) {
      $('script').each((_, el) => {
        const scriptContent = $(el).html()
        if (scriptContent) {
          // Method A: Check for direct m3u8/mp4 URLs in quotes
          const urlMatch = scriptContent.match(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)(?:\?[^"']*)?)["']/i)
          if (urlMatch && urlMatch[1]) {
            const matchedUrl = urlMatch[1]
            if (!matchedUrl.includes('ads') && !matchedUrl.includes('analytics')) {
              rawVideoUrl = matchedUrl
              detectedType = matchedUrl.includes('m3u8') ? 'application/x-mpegURL' : 'video/mp4'
              return false
            }
          }

          // Method B: Support unpacked scripts
          if (scriptContent.includes('eval(function(p,a,c,k,e,d)')) {
            const unpacked = unpackPacker(scriptContent)
            if (unpacked) {
              const unpackedMatch = unpacked.match(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)(?:\?[^"']*)?)["']/i)
              if (unpackedMatch && unpackedMatch[1]) {
                rawVideoUrl = unpackedMatch[1]
                detectedType = rawVideoUrl.includes('m3u8') ? 'application/x-mpegURL' : 'video/mp4'
                return false
              }
            }
          }
        }
      })
    }

    // Method C: Check standard HTML5 tags
    if (!rawVideoUrl) {
      $('video, video source').each((_, el) => {
        const src = $(el).attr('src')
        if (src) {
          rawVideoUrl = src
          detectedType = src.includes('m3u8') ? 'application/x-mpegURL' : 'video/mp4'
          return false
        }
      })
    }

    // Method D: Check for Inertia.js data-page attribute (Filedon support)
    if (!rawVideoUrl) {
      const dataPageAttr = $('#app').attr('data-page')
      if (dataPageAttr) {
        try {
          const dataPage = JSON.parse(dataPageAttr)
          const possibleUrl = dataPage.props?.url || dataPage.props?.file?.url || dataPage.url
          if (possibleUrl) {
            rawVideoUrl = possibleUrl
            detectedType = rawVideoUrl.includes('m3u8') ? 'application/x-mpegURL' : 'video/mp4'
          }
        } catch {}
      }
    }

    if (!rawVideoUrl) {
      return {
        success: false,
        message: 'Could not extract raw video stream URL.',
        embedUrl
      }
    }

    return {
      success: true,
      rawVideoUrl,
      type: detectedType,
      embedUrl
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Error resolving embed URL: ${error.message}`,
      embedUrl
    }
  }
})

function unpackPacker(packedJS: string): string {
  try {
    const packerRegex = /eval\(function\(p,a,c,k,e,d\)\{.*?\}\((.*)\)\)/s
    const match = packedJS.match(packerRegex)
    if (!match) return ''

    const argsStr = match[1]
    const evalArgs = new Function(`return [${argsStr}]`)()
    const p = evalArgs[0]
    const a = parseInt(evalArgs[1], 10)
    const c = parseInt(evalArgs[2], 10)
    const k = evalArgs[3]
    
    let result = p
    const wordPattern = new RegExp('\\b\\w+\\b', 'g')
    result = result.replace(wordPattern, (word: string) => {
      let val = 0
      const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
      for (let i = 0; i < word.length; i++) {
        const idx = chars.indexOf(word[i])
        if (idx === -1) return word
        val = val * a + idx
      }
      return k[val] || word
    })
    return result
  } catch {
    return ''
  }
}
