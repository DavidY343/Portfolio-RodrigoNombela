export interface BehanceProject {
    title: string;
    description: string;
    link: string;
    guid: string;
    pubDate: string;
    thumbnail: string;
    images?: string[];
}

/**
 * Scrapes the user profile page to find all gallery links, following pagination.
 */
async function scrapeAllProjectLinks(username: string): Promise<string[]> {
    let allLinks: string[] = [];
    let after: string | null = null;
    let hasNextPage = true;
    let pagesProcessed = 0;

    console.log(`[Scraper] Starting profile crawl for ${username}...`);

    while (hasNextPage && pagesProcessed < 10) { // Safety limit of 10 pages
        const url = `https://www.behance.net/${username}${after ? `?after=${after}` : ''}`;
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) break;
            const html = await response.text();

            // Find all gallery links (absolute or relative)
            const galleryRegex = /(?:https:\/\/www\.behance\.net)?\/gallery\/(\d+)\/([a-zA-Z0-9_-]+)/g;
            let match;
            while ((match = galleryRegex.exec(html)) !== null) {
                const link = `https://www.behance.net/gallery/${match[1]}/${match[2]}`;
                if (!allLinks.includes(link)) {
                    allLinks.push(link);
                }
            }

            // Find all unique "after" tokens in the page
            const allAfterMatches = Array.from(html.matchAll(/\?after=([a-zA-Z0-9%_-]+)/g));
            const newAfter = allAfterMatches
                .map(m => m[1])
                .find(token => token !== after);

            if (newAfter) {
                after = newAfter;
                pagesProcessed++;
                console.log(`  - Page ${pagesProcessed} found (token: ${after}). Total links so far: ${allLinks.length}`);
            } else {
                // Try JSON "after" if URL one not found
                const jsonAfter = html.match(/"after"\s*:\s*"([a-zA-Z0-9%_-]+)"/);
                if (jsonAfter && jsonAfter[1] !== after) {
                    after = jsonAfter[1];
                    pagesProcessed++;
                    console.log(`  - Page ${pagesProcessed} found via JSON (token: ${after}). Total links so far: ${allLinks.length}`);
                } else {
                    hasNextPage = false;
                }
            }
        } catch (e) {
            console.error(`[Scraper] Error fetching page ${pagesProcessed + 1}:`, e);
            break;
        }
    }

    console.log(`[Scraper] Finished. Total projects found on profile: ${allLinks.length}`);
    return allLinks;
}

export async function fetchBehanceProjects(): Promise<BehanceProject[]> {
    const username = 'rodrigodomnguez6';
    const RSS_URL = `https://www.behance.net/feeds/user?username=${username}`;

    try {
        console.log('--- Behance Data Sync Start ---');
        
        // 1. Get as much as possible from RSS (Fast metadata)
        const rssResponse = await fetch(RSS_URL);
        let rssProjects: BehanceProject[] = [];
        if (rssResponse.ok) {
            const text = await rssResponse.text();
            const itemMatches = text.match(/<item>[\s\S]*?<\/item>/g) || [];
            rssProjects = itemMatches.map((itemXml) => {
                const extract = (tag: string) => {
                    const regex = new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?\\s*</${tag}>`);
                    return itemXml.match(regex)?.[1] || '';
                };
                const description = extract('description');
                const thumbnailMatch = description.match(/<img[^>]+src=['"]([^'"]+)['"]/);
                return {
                    title: extract('title'),
                    link: extract('link'),
                    description,
                    guid: extract('guid'),
                    pubDate: extract('pubDate'),
                    thumbnail: thumbnailMatch ? thumbnailMatch[1] : '',
                    images: []
                };
            });
        }

        // 2. Scrape profile to find ALL links (even old ones not in RSS)
        const allProfileLinks = await scrapeAllProjectLinks(username);

        // 3. Merge and fetch missing details
        const finalProjects: BehanceProject[] = [];
        const processedLinks = new Set<string>();

        // Add RSS projects first
        for (const p of rssProjects) {
            if (!processedLinks.has(p.link)) {
                // Fetch images for RSS projects too
                p.images = await fetchProjectImages(p.link);
                finalProjects.push(p);
                processedLinks.add(p.link);
            }
        }

        // Add projects found via scraping that were not in RSS
        const missingLinks = allProfileLinks.filter(link => !processedLinks.has(link));
        console.log(`[Sync] Fetching metadata for ${missingLinks.length} additional projects found via scraping...`);

        // Use a small delay between fetches to avoid rate limiting if there are many
        for (const link of missingLinks) {
            try {
                // We need to fetch the page anyway to get the images, 
                // and fetchProjectImages can be extended to return more info OR we can do it here.
                // Let's reuse fetchProjectImages and extract title/thumbnail if possible.
                const images = await fetchProjectImages(link);
                
                // Fallback metadata if not in RSS
                // We'll scrape the project page for the title
                const projResponse = await fetch(link);
                const projHtml = await projResponse.text();
                const titleMatch = projHtml.match(/<title>(.*?)<\/title>/);
                const title = titleMatch ? titleMatch[1].split('::')[0].trim() : 'Proyecto sin título';
                
                // Extract description/thumbnail from meta tags
                const descMatch = projHtml.match(/<meta name="description" content="(.*?)"/);
                const thumbMatch = projHtml.match(/<meta property="og:image" content="(.*?)"/);

                finalProjects.push({
                    title,
                    link,
                    description: descMatch ? descMatch[1] : '',
                    guid: link,
                    pubDate: new Date().toISOString(), // Fallback
                    thumbnail: thumbMatch ? thumbMatch[1] : (images[0] || ''),
                    images
                });
                processedLinks.add(link);
            } catch (e) {
                console.error(`Error fetching missing project details for ${link}:`, e);
            }
        }

        console.log('--- Behance Data Sync Complete ---');
        console.log(`Total Projects: ${finalProjects.length}`);
        return finalProjects;
    } catch (error) {
        console.error('Error in fetchBehanceProjects:', error);
        return [];
    }
}


/**
 * Deduplicates Behance image URLs by their base identification part,
 * keeping the highest resolution available.
 */
function deduplicateBehanceImages(urls: string[], projectId: string = ''): string[] {
    const imageMap = new Map<string, string>();

    // Filter out potential non-content images like avatars, ribbons, or related projects
    // Most content images have the project ID in the filename.
    const filteredUrls = urls.filter(url => {
        // Must be a project module image
        if (!url.includes('/project_modules/')) return false;
        // If we have a project ID, the image should probably contain it 
        // (Behance filenames often follow: [id][project_id].[hash].jpg)
        if (projectId && !url.includes(projectId)) return false;
        return true;
    });

    filteredUrls.forEach(url => {
        const filename = url.split('/').pop()?.split('?')[0] || url;
        // The core ID is usually the first 6-8 chars before the project ID or dot
        const coreId = filename.split('.')[0];

        const sizeOrder = [
            'max_3840', '1400', 'max_1200', 'fs', 'max_808'
        ];

        const currentSizeIndex = sizeOrder.findIndex(s => url.includes(s));
        const priority = currentSizeIndex === -1 ? 99 : currentSizeIndex;

        const existingUrl = imageMap.get(coreId);
        if (!existingUrl) {
            imageMap.set(coreId, url);
        } else {
            const existingSizeIndex = sizeOrder.findIndex(s => existingUrl.includes(s));
            const existingPriority = existingSizeIndex === -1 ? 99 : existingSizeIndex;

            if (priority < existingPriority) {
                imageMap.set(coreId, url);
            }
        }
    });

    const uniqueUrls = Array.from(imageMap.values());
    console.log(`  - Unique Content Images Found: ${uniqueUrls.length}`);
    return uniqueUrls.slice(0, 15);
}

export async function fetchProjectImages(projectUrl: string): Promise<string[]> {
    try {
        // Extract project ID from URL (e.g., https://www.behance.net/gallery/21257745/Title)
        const idMatch = projectUrl.match(/gallery\/(\d+)/);
        const projectId = idMatch ? idMatch[1] : '';

        const response = await fetch(projectUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            }
        });
        if (!response.ok) return [];
        const html = await response.text();

        // 1. Try window.data first (most reliable if present)
        const stateMatch = html.match(/window\.data\s*=\s*JSON\.parse\("([\s\S]*?)"\);/);
        if (stateMatch) {
            try {
                const decodedJson = stateMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                const data = JSON.parse(decodedJson);
                const modules = data.project?.modules || [];
                const imgs = modules
                    .filter((m: any) => m.type === 'image')
                    .map((m: any) => {
                        const s = m.sizes || {};
                        return s['max_3840'] || s['1400'] || s['max_1200'] || s['fs'] || s['max_808'] || m.src;
                    })
                    .filter(Boolean);
                if (imgs.length > 0) return deduplicateBehanceImages(imgs, projectId);
            } catch (e) { }
        }

        // 2. Fallback to broad regex
        const regex = /https:\/\/mir-[a-z0-9-]+\.behance\.net\/project_modules\/(?:[a-z0-9_]+)\/[a-zA-Z0-9._-]+\.(?:jpg|jpeg|png|webp)/g;
        return deduplicateBehanceImages(html.match(regex) || [], projectId);

    } catch (error) {
        return [];
    }
}

export interface Category {
    id: string;
    name: string;
    description: string;
    regex: RegExp;
}

export const CATEGORIES: Category[] = [
    { id: 'conciertos', name: 'Conciertos', description: 'Energía y alma en directo.', regex: /conciertos?/i },
    { id: 'deporte', name: 'Deporte', description: 'Precisión y dinamismo en acción.', regex: /deporte|f[úu]tbol/i },
    { id: 'sesiones', name: 'Sesiones', description: 'Enfoque editorial y artístico.', regex: /sesi[oó]n/i },
    { id: 'paisaje', name: 'Paisaje', description: 'Belleza natural en detalle.', regex: /paisajes?/i },
    { id: 'otros', name: 'Otros', description: 'Exploraciones visuales diversas.', regex: /.*/ }
];

export function groupProjects(projects: BehanceProject[]) {
    const grouped: Record<string, BehanceProject[]> = {
        conciertos: [],
        deporte: [],
        sesiones: [],
        paisaje: [],
        otros: [],
    };

    projects.forEach(p => {
        const title = p.title.toLowerCase();
        if (CATEGORIES[0].regex.test(title)) grouped.conciertos.push(p);
        else if (CATEGORIES[1].regex.test(title)) grouped.deporte.push(p);
        else if (CATEGORIES[2].regex.test(title)) grouped.sesiones.push(p);
        else if (CATEGORIES[3].regex.test(title)) grouped.paisaje.push(p);
        else grouped.otros.push(p);
    });

    return grouped;
}
