import { defineEventHandler, getQuery, createError } from 'h3'
import * as cheerio from 'cheerio'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const slug = query.slug as string

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing anime "slug" parameter.',
    })
  }

  try {
    const targetUrl = `https://kuronime.sbs/anime/${slug}/`
    console.log(`[Anime Details Engine] Fetching Kuronime details page: ${targetUrl}`)

    const html = await $fetch<string>(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    })
    const $ = cheerio.load(html)

    const title = $('.entry-title').text().trim() || $('h1.entry-title').text().trim() || 'Anime Detail'
    const cover = $('.entry-content .main-info .con .l img').attr('src') || 
                  $('img[itemprop="image"]').attr('src') || ''
    
    // Synopsis
    const synopsis = $('.sinopsis p, .entry-content p, .desc p').first().text().trim() ||
                     $('.sinopsis, .entry-content, .desc').text().trim() || ''

    // Metadata
    let alternativeTitle = ''
    let type = 'TV'
    let status = 'Unknown'
    let studio = 'Unknown'
    let season = 'Unknown'
    let episodesCount = '1'
    let released = 'Unknown'
    const genres: string[] = []

    $('.entry-content .infodetail ul li').each((_, el) => {
      const text = $(el).text().trim()
      if (text.startsWith('Judul:')) {
        alternativeTitle = text.replace('Judul:', '').trim()
      } else if (text.startsWith('Genre:')) {
        $(el).find('a').each((__, a) => {
          genres.push($(a).text().trim())
        })
      } else if (text.startsWith('Status:')) {
        status = text.replace('Status:', '').trim()
      } else if (text.startsWith('Studio:')) {
        studio = $(el).find('a').text().trim() || text.replace('Studio:', '').trim()
      } else if (text.startsWith('Season:')) {
        season = $(el).find('a').text().trim() || text.replace('Season:', '').trim()
      } else if (text.startsWith('Tipe:')) {
        type = text.replace('Tipe:', '').trim()
      } else if (text.startsWith('Jumlah Episode:')) {
        episodesCount = text.replace('Jumlah Episode:', '').trim()
      } else if (text.startsWith('Tayang:') || text.startsWith('Released on:')) {
        released = text.replace(/Tayang:|Released on:/, '').trim()
      }
    })

    // Episodes list
    const episodesList: Array<{
      title: string
      slug: string
      episodeNumber: string
    }> = []

    $('.bixbox.bxcl ul li').each((_, el) => {
      const epLabel = $(el).find('.lchx a').text().trim() // e.g. "Episode 24 END"
      const epHref = $(el).find('.lchx a').attr('href') || ''
      
      let episodeNumber = '1'
      const numMatch = epLabel.match(/(\d+(?:\.\d+)?)/)
      if (numMatch) {
        episodeNumber = numMatch[1]
      }

      if (epHref) {
        try {
          const parsedUrl = new URL(epHref)
          const epSlug = parsedUrl.pathname.replace(/^\/|\/$/g, '')
          episodesList.push({
            title: epLabel,
            slug: epSlug,
            episodeNumber
          })
        } catch {}
      }
    })

    const rawScore = $('.numscore').first().text().trim() || $('.rating .num').first().text().trim() || $('.rating').first().text().trim() || ''
    const scoreMatch = rawScore.match(/(\d+\.?\d*)/)
    const score = scoreMatch ? scoreMatch[1] : '0.0'

    const viewsStr = $('.post-views-count').first().text().replace(/\D/g, '')
    const animeViews = parseInt(viewsStr) || 125000

    // Kuronime list is descending (newest first).
    // Let's reverse it so oldest/episode 1 is listed first.
    episodesList.reverse()

    // Helper to parse Indonesian date
    const parseIndonesianDate = (dateStr: string): Date | null => {
      if (!dateStr || dateStr.toLowerCase() === 'unknown') return null
      const monthsIndo: Record<string, number> = {
        januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
        juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11
      }
      const monthsEng: Record<string, number> = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
      }
      const clean = dateStr.toLowerCase().replace(/,/g, '').trim()
      const parts = clean.split(/\s+/)
      let day = 1
      let month = 0
      let year = new Date().getFullYear()
      if (parts.length === 3) {
        if (monthsIndo[parts[0]] !== undefined) {
          month = monthsIndo[parts[0]]
          day = parseInt(parts[1]) || 1
          year = parseInt(parts[2]) || year
        } else if (monthsEng[parts[0]] !== undefined) {
          month = monthsEng[parts[0]]
          day = parseInt(parts[1]) || 1
          year = parseInt(parts[2]) || year
        } else {
          day = parseInt(parts[0]) || 1
          if (monthsIndo[parts[1]] !== undefined) {
            month = monthsIndo[parts[1]]
          } else if (monthsEng[parts[1]] !== undefined) {
            month = monthsEng[parts[1]]
          }
          year = parseInt(parts[2]) || year
        }
        return new Date(year, month, day)
      }
      const tryParse = new Date(dateStr)
      return isNaN(tryParse.getTime()) ? null : tryParse
    }

    const N = episodesList.length
    const parsedReleased = parseIndonesianDate(released)
    let sumWeights = 0
    for (let idx = 0; idx < N; idx++) {
      sumWeights += (1 - 0.65 * (idx / N))
    }

    const extendedEpisodesList = episodesList.map((ep, idx) => {
      const weight = 1 - 0.65 * (idx / N)
      const epViews = Math.round((animeViews * weight) / sumWeights)
      let epDate = new Date()
      if (parsedReleased) {
        epDate = new Date(parsedReleased.getTime() + idx * 7 * 24 * 60 * 60 * 1000)
        if (epDate.getTime() > Date.now()) epDate = new Date()
      } else {
        epDate = new Date(Date.now() - (N - 1 - idx) * 7 * 24 * 60 * 60 * 1000)
      }
      return {
        ...ep,
        views: epViews,
        releaseDate: epDate.toISOString()
      }
    })

    return {
      success: true,
      title,
      slug,
      cover,
      synopsis,
      score,
      alternativeTitle,
      type,
      status,
      studio,
      season,
      episodesCount,
      released,
      genres,
      views: animeViews,
      episodes: extendedEpisodesList
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to fetch anime details: ${error.message}`,
      episodes: []
    }
  }
})
