export interface BehanceProject {
    title: string;
    description: string;
    link: string;
    guid: string;
    pubDate: string;
    thumbnail: string;
    images?: string[];
}

// Minimal placeholder logic if scraping fails
export async function fetchBehanceProjects(): Promise<BehanceProject[]> {
    const RSS_URL = 'https://www.behance.net/feeds/user?username=rodrigodomnguez6';

    try {
        console.log('--- Behance Data Fetch Start ---');
        const response = await fetch(RSS_URL);
        if (!response.ok) throw new Error(`RSS fetch failed`);
        const text = await response.text();
        const itemMatches = text.match(/<item>[\s\S]*?<\/item>/g) || [];

        const projects = await Promise.all(itemMatches.map(async (itemXml) => {
            const extract = (tag: string) => {
                const regex = new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?\\s*</${tag}>`);
                return itemXml.match(regex)?.[1] || '';
            };

            const title = extract('title');
            const link = extract('link');
            const description = extract('description');
            const thumbnailMatch = description.match(/<img[^>]+src=['"]([^'"]+)['"]/);
            const thumbnail = thumbnailMatch ? thumbnailMatch[1] : '';

            // Attempt build-time extraction
            let images = await fetchProjectImages(link);

            // If still 0, we'll try a very aggressive regex on the raw HTML
            if (images.length === 0) {
                try {
                    const rawHtml = await (await fetch(link)).text();
                    const aggressiveRegex = /https:\/\/mir-[a-z0-9-]+\.behance\.net\/project_modules\/(?:[a-z0-9_]+)\/[a-zA-Z0-9._-]+\.(?:jpg|jpeg|png|webp)/g;
                    images = deduplicateBehanceImages(rawHtml.match(aggressiveRegex) || []);
                } catch (e) {
                    console.error(`Error in aggressive fetch for ${title}:`, e);
                }
            }

            console.log(`[Project] ${title.padEnd(40)} | Photos Found: ${images.length}`);

            return {
                title,
                description,
                link,
                guid: extract('guid'),
                pubDate: extract('pubDate'),
                thumbnail,
                images
            };
        }));

        console.log('--- Behance Data Fetch Complete ---');
        return projects;
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
    return uniqueUrls.slice(0, 10);
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
