import { defineEventHandler, getQuery, createError } from 'h3'
import * as cheerio from 'cheerio'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const episodeSlug = query.slug as string

  if (!episodeSlug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing target "slug" parameter.',
    })
  }

  try {
    const videoSources: Array<{ label: string; url: string; quality: string }> = []
    let parentAnime: any = null

    // A. KURONIME SCRAPER ENGINE (Resolve canonical metadata first)
    const kuronimeUrl = `https://kuronime.sbs/${episodeSlug}/`
    console.log(`[Episode Engine] Scraping Kuronime Watch Page: ${kuronimeUrl}`)
    
    try {
      const epHtml = await $fetch<string>(kuronimeUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      })
      const $ep = cheerio.load(epHtml)

      // 1. Extract parent anime slug
      let parentAnimeSlug = ''
      $ep('a[href*="/anime/"]').each((_, el) => {
        const href = $ep(el).attr('href') || ''
        try {
          const parsed = new URL(href)
          const slugSegment = parsed.pathname.replace(/^\/anime\//, '').replace(/\/$/, '')
          if (slugSegment && slugSegment !== 'genres' && slugSegment !== 'season') {
            parentAnimeSlug = slugSegment
            return false // break
          }
        } catch {}
      })

      if (parentAnimeSlug) {
        console.log(`[Episode parent] Scraping parent anime from Kuronime: ${parentAnimeSlug}`)
        parentAnime = await scrapeAnimeDetails(parentAnimeSlug)
      }

      // 2. Extract Kuronime players using hash
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
        console.log(`[Episode Engine] Found Kuronime hash. Fetching sources from animeku.org...`)
        const apiRes = await $fetch<{ status: number; mirror: string }>(
          'https://animeku.org/api/v9/sources',
          {
            method: 'POST',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Content-Type': 'application/json',
              'Referer': kuronimeUrl
            },
            body: { id: hashVal }
          }
        )

        if (apiRes && apiRes.status === 200 && apiRes.mirror) {
          const CryptoJS = (await import('crypto-js')).default
          
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

      // Extract direct Kuronime download links from HTML links
      $ep('a').each((_, el) => {
        const href = $ep(el).attr('href') || ''
        const text = $ep(el).text().trim()
        const parentText = $ep(el).parent().text().trim()
        const fullText = `${text} ${parentText}`

        let quality = '720p'
        if (fullText.toLowerCase().includes('1080')) quality = '1080p'
        else if (fullText.toLowerCase().includes('480')) quality = '480p'
        else if (fullText.toLowerCase().includes('360')) quality = '360p'
        else if (fullText.toLowerCase().includes('4k') || fullText.toLowerCase().includes('2160')) quality = '4K'

        if (href && (href.includes('pixeldrain.com') || href.includes('krakenfiles.com') || href.includes('gofile.io') || href.includes('acefile.co') || href.includes('filelions'))) {
          let mirrorName = text || 'Download'
          if (href.includes('pixeldrain.com')) mirrorName = 'Pixeldrain'
          else if (href.includes('krakenfiles.com')) mirrorName = 'Krakenfiles'
          else if (href.includes('gofile.io')) mirrorName = 'Gofile'
          else if (href.includes('acefile.co')) mirrorName = 'Acefile'

          const exists = videoSources.some(s => s.url === href)
          if (!exists) {
            videoSources.push({
              label: `[Kuronime Direct] ${mirrorName} (${quality})`,
              url: href,
              quality
            })
          }
        }
      })
    } catch (krErr: any) {
      console.warn('[Episode Engine] Kuronime primary scraping failed:', krErr.message)
    }

    // Determine Clean Canonical Title and Episode Number for secondary searches
    let cleanTitle = ''
    if (parentAnime?.title) {
      cleanTitle = parentAnime.title
        .replace(/sub\s*indo/i, '')
        .replace(/nonton\s*anime/i, '')
        .trim()
    } else {
      const match = episodeSlug.replace(/^nonton-/, '').match(/^(.*?)-episode-(\d+)/)
      cleanTitle = match ? match[1].split('-').join(' ') : episodeSlug
    }

    const matchEp = episodeSlug.match(/episode-(\d+)/) || episodeSlug.match(/eps-(\d+)/) || episodeSlug.match(/-(\d+)(?:-end)?$/)
    const episodeNumber = matchEp ? matchEp[1] : '1'

    // Compile dynamic queries list
    const searchQueries: string[] = []
    if (cleanTitle) searchQueries.push(cleanTitle)
    if (parentAnime?.alternativeTitles) {
      parentAnime.alternativeTitles.forEach((t: string) => {
        if (!searchQueries.includes(t)) searchQueries.push(t)
      })
    }
    const matchEpTitle = episodeSlug.replace(/^nonton-/, '').match(/^(.*?)-episode-(\d+)/)
    if (matchEpTitle) {
      const slugTitle = matchEpTitle[1].split('-').join(' ')
      if (!searchQueries.includes(slugTitle)) searchQueries.push(slugTitle)
      
      const strippedSlug = slugTitle
        .replace(/season\s*\d+/i, '')
        .replace(/\b(ii|iii|iv|v)\b/i, '')
        .trim()
      if (!searchQueries.includes(strippedSlug)) searchQueries.push(strippedSlug)
    }

    const uniqueQueries = Array.from(new Set(searchQueries.map(q => q.toLowerCase().trim()))).filter(Boolean)
    console.log(`[Episode Engine] Consolidated search queries list for fallback databases:`, uniqueQueries)

    // B. FALLBACK DATABASES SEARCHES (Run in parallel)
    await Promise.all([
      // 1. Samehadaku Scraper Engine (as fallback mirror)
      (async () => {
        try {
          let samehadakuEpisodeUrl = ''

          for (const q of uniqueQueries) {
            try {
              const searchUrl = `https://v2.samehadaku.how/?s=${encodeURIComponent(q)}`
              console.log(`[Episode Engine] Searching Samehadaku fallback: ${searchUrl}`)

              const searchHtml = await fetchHttp2(searchUrl)
              const $search = cheerio.load(searchHtml)
              const firstWord = q.split(' ')[0]

              let matchedAnimeLink = ''
              $search('.post-show ul li, .animepost').each((_, el) => {
                const href = $(el).find('a').first().attr('href') || ''
                const text = $(el).find('.title, h2').text().trim().toLowerCase()
                if (href && text.includes(firstWord)) {
                  matchedAnimeLink = href
                  return false // break
                }
              })

              if (matchedAnimeLink) {
                console.log(`[Episode Engine] Matched Samehadaku Detail: ${matchedAnimeLink}`)
                const animeHtml = await fetchHttp2(matchedAnimeLink)
                const $anime = cheerio.load(animeHtml)

                $anime('.lstepsiode li').each((_, el) => {
                  const href = $(el).find('.epsleft .lchx a').attr('href') || ''
                  const text = $(el).find('.epsright .eps').text().trim().toLowerCase()
                  
                  if (matchEpisodeNumber(href, episodeNumber) || text.includes(`episode ${episodeNumber}`) || text === episodeNumber) {
                    samehadakuEpisodeUrl = href
                    return false
                  }
                })

                if (samehadakuEpisodeUrl) break
              }
            } catch (err: any) {
              console.warn(`[Episode Engine] Samehadaku fallback query "${q}" failed:`, err.message)
            }
          }

          if (samehadakuEpisodeUrl) {
            console.log(`[Episode Engine] Matched Samehadaku Episode Player: ${samehadakuEpisodeUrl}`)
            const html = await fetchHttp2(samehadakuEpisodeUrl)
            const $ = cheerio.load(html)

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

            const parsedOrigin = new URL(samehadakuEpisodeUrl).origin
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
                    { 'referer': samehadakuEpisodeUrl, 'x-requested-with': 'XMLHttpRequest' }
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
                      videoSources.push({
                        label: `[Samehadaku] ${serverName} (${quality})`,
                        url: iframeSrc,
                        quality
                      })
                    }
                  }
                } catch {}
              })
            )

            // Extract Samehadaku download links
            $('.download-link ul li, .download-eps li, .sda_download li').each((_, el) => {
              let quality = 'unknown'
              const strongText = $(el).find('strong').text().trim()
              const qualityMatch = strongText.match(/(\d+p|4k)/i)
              if (qualityMatch) quality = qualityMatch[1].toLowerCase()

              $(el).find('a').each((__, aEl) => {
                const href = $(aEl).attr('href') || ''
                const label = $(aEl).text().trim()
                
                if (href && (href.includes('krakenfiles.com') || href.includes('pixeldrain.com') || href.includes('gofile.io') || href.includes('acefile.co'))) {
                  let mirrorName = label || 'Download Mirror'
                  if (href.includes('krakenfiles.com')) mirrorName = 'Krakenfiles'
                  else if (href.includes('pixeldrain.com')) mirrorName = 'Pixeldrain'
                  else if (href.includes('gofile.io')) mirrorName = 'Gofile'
                  else if (href.includes('acefile.co')) mirrorName = 'Acefile'

                  videoSources.push({
                    label: `[Samehadaku Direct] ${mirrorName} (${quality})`,
                    url: href,
                    quality
                  })
                }
              })
            })
          }
        } catch (shErr: any) {
          console.warn('[Episode Engine] Samehadaku fallback failed:', shErr.message)
        }
      })(),

      // 2. Otakudesu Scraper Engine (as fallback mirror)
      (async () => {
        try {
          let otakudesuEpisodeUrl = ''

          for (const q of uniqueQueries) {
            try {
              const searchUrl = `https://otakudesu.blog/?s=${encodeURIComponent(q)}&post_type=anime`
              const html = await $fetch<string>(searchUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
              })
              const $ = cheerio.load(html)
              
              let matchedAnimeLink = ''
              $('.chldnz').slice(0, 5).each((_, el) => {
                const href = $(el).find('a').first().attr('href') || ''
                const text = $(el).find('a').first().text().trim().toLowerCase()
                
                if (href && (text.includes(q) || q.includes(text))) {
                  matchedAnimeLink = href
                  return false
                }
              })

              if (matchedAnimeLink) {
                console.log(`[Episode Engine] Matched Otakudesu Detail: ${matchedAnimeLink}`)
                const animeHtml = await $fetch<string>(matchedAnimeLink, {
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
                })
                const $anime = cheerio.load(animeHtml)

                $anime('.episodelist ul li').each((_, el) => {
                  const href = $(el).find('a').attr('href') || ''
                  
                  if (matchEpisodeNumber(href, episodeNumber)) {
                    otakudesuEpisodeUrl = href
                    return false
                  }
                })

                if (otakudesuEpisodeUrl) break
              }
            } catch (err: any) {
              console.warn(`[Episode Engine] Otakudesu fallback query "${q}" failed:`, err.message)
            }
          }

          if (otakudesuEpisodeUrl) {
            console.log(`[Episode Engine] Matched Otakudesu Episode Player: ${otakudesuEpisodeUrl}`)
            const epHtml = await $fetch<string>(otakudesuEpisodeUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
            })
            const $ep = cheerio.load(epHtml)

            let scriptWithNonce = ''
            $ep('script').each((_, el) => {
              const content = $ep(el).html()
              if (content && content.includes('__x__nonce')) scriptWithNonce = content
            })

            if (scriptWithNonce) {
              const actionMatches = [...scriptWithNonce.matchAll(/action\s*:\s*["']([a-f0-9]{32})["']/g)]
              if (actionMatches.length >= 2) {
                const streamAction = actionMatches[0][1]
                const getNonceAction = actionMatches[1][1]

                const parsedOrigin = new URL(otakudesuEpisodeUrl).origin
                const ajaxUrl = `${parsedOrigin}/wp-admin/admin-ajax.php`

                const nonceBody = new URLSearchParams()
                nonceBody.append('action', getNonceAction)

                const nonceData = await $fetch<{ data: string }>(ajaxUrl, {
                  method: 'POST',
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': otakudesuEpisodeUrl,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
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
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Referer': otakudesuEpisodeUrl,
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'X-Requested-With': 'XMLHttpRequest'
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

            // Extract Otakudesu downloads
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
          }
        } catch (otErr: any) {
          console.warn('[Episode Engine] Otakudesu fallback failed:', otErr.message)
        }
      })(),

      // 3. Animeindo Scraper Engine (as fallback mirror)
      (async () => {
        try {
          let animeindoEpisodeUrl = ''

          for (const q of uniqueQueries) {
            try {
              const searchUrl = `https://anime-indo.lol/search.php?q=${encodeURIComponent(q)}`
              console.log(`[Episode Engine] Searching Animeindo: ${searchUrl}`)

              const searchHtml = await fetchHttp2(searchUrl)
              const $search = cheerio.load(searchHtml)
              const firstWord = q.split(' ')[0]

              let matchedAnimeLink = ''
              $search('a[href*="/anime/"]').each((_, el) => {
                const href = $search(el).attr('href') || ''
                const text = $search(el).text().trim().toLowerCase()
                if (href && text.includes(firstWord)) {
                  matchedAnimeLink = href.startsWith('http') ? href : `https://anime-indo.lol${href}`
                  return false // break
                }
              })

              if (matchedAnimeLink) {
                console.log(`[Episode Engine] Matched Animeindo Detail page: ${matchedAnimeLink}`)
                const animeHtml = await fetchHttp2(matchedAnimeLink)
                const $anime = cheerio.load(animeHtml)

                $anime('a').each((_, el) => {
                  const href = $anime(el).attr('href') || ''
                  const text = $anime(el).text().trim().toLowerCase()
                  
                  if (matchEpisodeNumber(href, episodeNumber) || text === episodeNumber || text === `eps ${episodeNumber}` || text === `episode ${episodeNumber}`) {
                    animeindoEpisodeUrl = href.startsWith('http') ? href : `https://anime-indo.lol${href}`
                    return false // break
                  }
                })

                if (animeindoEpisodeUrl) break
              }
            } catch (err: any) {
              console.warn(`[Episode Engine] Animeindo query "${q}" failed:`, err.message)
            }
          }

          if (animeindoEpisodeUrl) {
            console.log(`[Episode Engine] Matched Animeindo Episode Player: ${animeindoEpisodeUrl}`)
            const epHtml = await fetchHttp2(animeindoEpisodeUrl)
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
          }
        } catch (aiErr: any) {
          console.warn('[Episode Engine] Animeindo scraping failed:', aiErr.message)
        }
      })()
    ])

    const uniqueVideos = Array.from(new Map(videoSources.map(item => [item.url, item])).values())

    return {
      success: true,
      episodeSlug,
      videoSources: uniqueVideos,
      anime: parentAnime
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to resolve episode streams: ${error.message}`,
      videoSources: [],
      anime: null
    }
  }
})

function matchEpisodeNumber(href: string, numStr: string): boolean {
  const num = parseInt(numStr, 10)
  if (isNaN(num)) return false
  
  const variations = [
    String(num),
    String(num).padStart(2, '0'),
    String(num).padStart(3, '0')
  ]
  
  const lowerHref = href.toLowerCase()
  return variations.some(v => 
    lowerHref.includes(`-episode-${v}`) || 
    lowerHref.includes(`-eps-${v}`) || 
    lowerHref.endsWith(`-${v}/`) ||
    lowerHref.includes(`-${v}-`)
  )
}

async function scrapeAnimeDetails(slug: string) {
  const targetUrl = `https://kuronime.sbs/anime/${slug}/`
  const html = await $fetch<string>(targetUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
  })
  const $ = cheerio.load(html)

  const title = $('.entry-title').text().trim() || $('h1.entry-title').text().trim() || 'Anime Detail'
  const cover = $('.entry-content .main-info .con .l img').attr('src') || 
                $('img[itemprop="image"]').attr('src') || ''
  const rawScore = $('.numscore').first().text().trim() || $('.rating .num').first().text().trim() || $('.rating').first().text().trim() || ''
  const scoreMatch = rawScore.match(/(\d+\.?\d*)/)
  const score = scoreMatch ? scoreMatch[1] : '0.0'
  
  let synopsis = $('.sinopsis p, .entry-content p, .desc p').first().text().trim() ||
                 $('.sinopsis, .entry-content, .desc').text().trim() || ''

  const genres: string[] = []
  const alternativeTitles: string[] = []

  $('.entry-content .infodetail ul li').each((_, el) => {
    const text = $(el).text().trim()
    if (text.startsWith('Judul:')) {
      const alt = text.replace('Judul:', '').trim()
      alt.split(',').forEach(t => {
        const cleaned = t.trim()
        const isLatin = /^[A-Za-z0-9\s\-_.,:!@#%^&*()]+$/.test(cleaned)
        if (isLatin && cleaned && !alternativeTitles.includes(cleaned)) {
          alternativeTitles.push(cleaned)
        }
      })
    } else if (text.startsWith('Genre:')) {
      $(el).find('a').each((__, a) => {
        genres.push($(a).text().trim())
      })
    }
  })

  const episodes: Array<{
    title: string
    slug: string
    url: string
    episodeNumber: string
    date: string
  }> = []

  $('.bixbox.bxcl ul li').each((_, el) => {
    const epLabel = $(el).find('.lchx a').text().trim()
    const epHref = $(el).find('.lchx a').attr('href') || ''
    let episodeNumber = '1'
    const numMatch = epLabel.match(/(\d+(?:\.\d+)?)/)
    if (numMatch) episodeNumber = numMatch[1]

    if (epHref) {
      try {
        const parsedUrl = new URL(epHref)
        const epSlug = parsedUrl.pathname.replace(/^\/|\/$/g, '')
        episodes.push({
          title: epLabel,
          slug: epSlug,
          url: epHref,
          episodeNumber,
          date: $(el).find('.dt a').text().replace(/Nonton/g, '').trim()
        })
      } catch {}
    }
  })

  episodes.reverse() // Sort from oldest/episode 1 first

  return {
    title,
    slug,
    cover,
    score,
    synopsis,
    genres,
    episodes,
    alternativeTitles
  }
}

async function fetchHttp2(target: string, method = 'GET', body: string | null = null, extraHeaders: Record<string, string> = {}): Promise<string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    ...extraHeaders
  }

  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  const res = await fetch(target, {
    method,
    headers,
    body: body ?? undefined,
    signal: AbortSignal.timeout(8000)
  })

  return res.text()
}
