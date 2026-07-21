import { defineEventHandler, getQuery } from 'h3'
import * as cheerio from 'cheerio'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const genreSlug = query.genre as string

  try {
    if (genreSlug) {
      // 1. Scrape specific genre page (e.g. /genres/action/)
      const targetUrl = `https://kuronime.sbs/genres/${genreSlug}/`
      console.log(`[Genres Engine] Scraping specific genre: ${targetUrl}`)

      const html = await $fetch<string>(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      })
      const $ = cheerio.load(html)

      const animeList: Array<{
        title: string
        slug: string
        cover: string
        type: string
        rating: string
      }> = []

      $('.listupd article, .listupd .bs').each((_, el) => {
        const title = $(el).find('h2, h3, .title').text().trim()
        const href = $(el).find('a').first().attr('href') || ''
        const cover = $(el).find('img[itemprop="image"]').attr('src') || 
                      $(el).find('img:not(.dashicons-controls-play)').first().attr('src') || ''
        const type = $(el).find('.typez').text().trim() || 'TV'
        const ratingRaw = $(el).find('.numscore').text().trim() || $(el).find('.rating .num').text().trim() || ''
        const ratingMatch = ratingRaw.match(/(\d+\.?\d*)/)
        const rating = ratingMatch ? ratingMatch[1] : '0.0'

        if (href && title) {
          try {
            const parsedUrl = new URL(href)
            const slug = parsedUrl.pathname.replace(/^\/anime\//, '').replace(/\/$/, '')
            animeList.push({ title, slug, cover, type, rating })
          } catch {}
        }
      })

      const genreTitle = $('title').text().replace(' - Kuronime', '').trim()

      return {
        success: true,
        genreName: genreTitle,
        animeList
      }
    } else {
      // 2. Scrape general genres index list
      const targetUrl = 'https://kuronime.sbs/genres/'
      console.log(`[Genres Engine] Scraping genres list: ${targetUrl}`)

      const html = await $fetch<string>(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      })
      const $ = cheerio.load(html)

      const genresList: Array<{ name: string; slug: string }> = []
      const seenSlugs = new Set<string>()

      // Match genre links
      $('ul.genres a, .genreslist a, .tagcloud a, a[href*="/genres/"]').each((_, el) => {
        const name = $(el).text().trim()
        const href = $(el).attr('href') || ''

        if (href && name && name.toLowerCase() !== 'genres') {
          try {
            const parsedUrl = new URL(href)
            const slug = parsedUrl.pathname.replace(/^\/genres\//, '').replace(/\/$/, '')
            
            if (slug && !seenSlugs.has(slug)) {
              seenSlugs.add(slug)
              genresList.push({ name, slug })
            }
          } catch {}
        }
      })

      // Sort alphabetically
      genresList.sort((a, b) => a.name.localeCompare(b.name))

      return {
        success: true,
        genres: genresList
      }
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to fetch genres: ${error.message}`,
      genres: [],
      animeList: []
    }
  }
})
