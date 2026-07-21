import { defineEventHandler, readBody, createError } from 'h3'

/**
 * Server-side proxy for animeku.org/api/v9/sources
 * This forwards the POST from the server to animeku.org so the browser
 * doesn't face CORS restrictions. On localhost this works fine;
 * on Vercel, change region to Singapore (sin1) to avoid IP blocks.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { id, referer } = body || {}

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id parameter.' })
  }

  try {
    const res = await $fetch<{ status: number; mirror: string }>(
      'https://animeku.org/api/v9/sources',
      {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://kuronime.sbs',
          'Referer': referer || 'https://kuronime.sbs/',
          'Sec-Fetch-Site': 'cross-site',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'empty',
        },
        body: { id }
      }
    )

    return { success: true, data: res }
  } catch (err: any) {
    return {
      success: false,
      message: err.message,
      data: null
    }
  }
})
