/**
 * Cloudflare Pages middleware — locale redirect.
 *
 * If the visitor's Accept-Language starts with "ja" and the URL is under
 * the English docs root (/docs/), redirect to the Japanese equivalent
 * (/ja/docs/...).  A `lang=en` cookie (set when the user explicitly
 * switches to English via Starlight's locale picker) suppresses the
 * redirect so intentional EN readers aren't bounced.
 */
export const onRequest: PagesFunction = async ({ request, next }) => {
  const url = new URL(request.url);

  // Only redirect /docs/* paths (not /ja/docs/*, not assets, not LP)
  if (!url.pathname.startsWith('/docs/')) return next();

  // Respect explicit language choice (cookie or query param)
  const cookie = request.headers.get('cookie') ?? '';
  if (cookie.includes('lang=en')) return next();

  // Starlight locale switcher lands on /docs/ — set cookie and stay
  if (url.searchParams.get('lang') === 'en') {
    const res = await next();
    const headers = new Headers(res.headers);
    headers.append('set-cookie', 'lang=en; path=/; max-age=31536000; SameSite=Lax');
    return new Response(res.body, { status: res.status, headers });
  }

  // Check Accept-Language
  const accept = request.headers.get('accept-language') ?? '';
  const primary = accept.split(',')[0].trim().toLowerCase();
  if (!primary.startsWith('ja')) return next();

  // Redirect to Japanese version
  url.pathname = '/ja' + url.pathname;
  return Response.redirect(url.toString(), 302);
};
