import type { APIRoute } from 'astro';
import { fetchProjectImages } from '../../services/behance';

export const GET: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const projectUrl = url.searchParams.get('url');

        if (!projectUrl) {
            return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        console.log(`[API Proxy] Fetching images for: ${projectUrl}`);
        const images = await fetchProjectImages(projectUrl);

        return new Response(JSON.stringify({ images }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
            }
        });
    } catch (error) {
        console.error('[API Proxy Error]:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch images' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
