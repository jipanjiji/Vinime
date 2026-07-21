import { defineEventHandler, getQuery, createError } from 'h3'
import * as cheerio from 'cheerio'
import CryptoJS from 'crypto-js'

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
    const CHROME_HEADERS = {
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

    let epHtml = ''
    let activeUrl = targetUrl
    const domains = ['kuronime.sbs', 'kuronime.me', 'kuronime.org']

    for (const d of domains) {
      try {
        const urlObj = new URL(activeUrl)
        urlObj.hostname = d
        console.log(`[Kuronime Scraper] Fetching: ${urlObj.toString()}`)
        epHtml = await $fetch<string>(urlObj.toString(), { headers: CHROME_HEADERS, timeout: 5000 })
        activeUrl = urlObj.toString()
        break
      } catch (err: any) {
        console.warn(`[Kuronime Scraper] Domain ${d} failed: ${err.message}`)
      }
    }

    if (!epHtml) {
      throw new Error('All Kuronime domains blocked or offline.')
    }

    const $ep = cheerio.load(epHtml)

    let hashVal = ''
    $ep('script').each((_, el) => {
      const content = $ep(el).html() || ''
      const matchHash = content.match(/var\s+_0xa100d42aa\s*=\s*["']([^"']+)["']/i)
      if (matchHash) {
        hashVal = matchHash[1]
        return false
      }
    })

    if (hashVal) {
      const apiRes = await $fetch<{ status: number; mirror: string }>(
        'https://animeku.org/api/v9/sources',
        {
          method: 'POST',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Content-Type': 'application/json',
            'Referer': targetUrl
          },
          body: { id: hashVal }
        }
      )

      if (apiRes && apiRes.status === 200 && apiRes.mirror) {
        const CryptoJSAesJson = {
          parse: function (jsonStr: string) {
            var j = JSON.parse(jsonStr)
            var cipherParams = CryptoJS.lib.CipherParams.create({
              ciphertext: CryptoJS.enc.Base64.parse(j.ct)
            })
            if (j.iv) cipherParams.iv = CryptoJS.enc.Hex.parse(j.iv)
            if (j.s) cipherParams.salt = CryptoJS.enc.Hex.parse(j.s)
            return cipherParams
          }
        }

        const decryptedBase64 = Buffer.from(apiRes.mirror, 'base64').toString('utf8')
        const secretKey = '3&!Z0M,VIZ;dZW=='

        const decryptedBytes = CryptoJS.AES.decrypt(
          decryptedBase64,
          secretKey,
          { format: CryptoJSAesJson as any }
        )
        const decryptedText = decryptedBytes.toString(CryptoJS.enc.Utf8)
        const decryptedData = JSON.parse(decryptedText)

        // 1. Extract Embeds
        const embed = decryptedData.embed || {}
        for (const quality in embed) {
          const servers = embed[quality]
          const cleanQuality = quality.replace(/^v/, '') // e.g. "v720p" -> "720p"
          for (const serverName in servers) {
            const url = servers[serverName]
            if (url) {
              videoSources.push({
                label: `[Kuronime] ${serverName} (${cleanQuality})`,
                url: url,
                quality: cleanQuality
              })
            }
          }
        }

        // 2. Extract Downloads
        const download = decryptedData.download || {}
        for (const quality in download) {
          const mirrors = download[quality]
          const cleanQuality = quality.replace(/^v/, '')
          for (const mirrorName in mirrors) {
            const url = mirrors[mirrorName]
            if (url && (url.includes('krakenfiles.com') || url.includes('pixeldrain.com') || url.includes('gofile.io') || url.includes('acefile.co'))) {
              videoSources.push({
                label: `[Kuronime Direct] ${mirrorName} (${cleanQuality})`,
                url: url,
                quality: cleanQuality
              })
            }
          }
        }
      }
    }

    return {
      success: true,
      url: targetUrl,
      videoSources
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to scrape Kuronime URL: ${error.message}`,
      videoSources: []
    }
  }
})
