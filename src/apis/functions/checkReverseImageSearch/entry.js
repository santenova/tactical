import { apiClient, createClientFromRequest } from "./apis/client";
Deno.serve(async (req) => {
    try {
        const apiClient = createClientFromRequest(req);
        const { imageUrl } = await req.json();
        if (!imageUrl) {
            return Response.json({ error: 'Image URL required' }, { status: 400 });
        }
        const encodedUrl = encodeURIComponent(imageUrl);
        const reverseSearchUrl = `https://images.google.com/searchbyimage?image_url=${encodedUrl}&hl=en`;
        // Use InvokeLLM with internet context to research the image's paper trail
        const paperTrailResult = await apiClient.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `You are an image provenance researcher. I need you to investigate the internet paper trail for this image URL: ${imageUrl}

Search the web for:
1. Whether this exact image or visually similar images appear on known stock photo sites (Shutterstock, Getty, Adobe Stock, Unsplash, Pexels, etc.)
2. Whether this image appears on AI art generation platforms (Midjourney showcases, ArtStation AI sections, DeviantArt AI, Civitai, etc.)
3. Whether this image appears in news outlets, official websites, or verified social media accounts (indicating it's a real photo)
4. Any metadata or context clues about the image origin available on the web
5. Whether the image URL domain itself is associated with AI-generated content or stock photography

Return a JSON object with:
- has_web_presence: boolean — true if image or very similar images found anywhere online
- found_on_stock_sites: boolean — true if found on stock photo sites
- found_on_ai_platforms: boolean — true if found on known AI art platforms or AI image generation sites
- found_on_news_or_official: boolean — true if found on news sites, official org websites, or verified accounts
- source_credibility: "high" | "medium" | "low" | "unknown" — overall credibility of detected sources
- estimated_origin: "real_photo" | "ai_generated" | "stock_photo" | "illustration" | "unknown"
- paper_trail_summary: A 2-3 sentence summary of what was found about this image's internet history and provenance
- sources_found: array of strings, each being a brief description of where the image was found (e.g. "Getty Images stock library", "Midjourney community showcase")
- confidence: number 0-100 representing how confident you are in these findings`,
            add_context_from_internet: true,
            response_json_schema: {
                type: "object",
                properties: {
                    has_web_presence: { type: "boolean" },
                    found_on_stock_sites: { type: "boolean" },
                    found_on_ai_platforms: { type: "boolean" },
                    found_on_news_or_official: { type: "boolean" },
                    source_credibility: { type: "string" },
                    estimated_origin: { type: "string" },
                    paper_trail_summary: { type: "string" },
                    sources_found: { type: "array", items: { type: "string" } },
                    confidence: { type: "number" },
                },
            },
        });
        return Response.json({
            hasMatches: paperTrailResult?.has_web_presence ?? false,
            resultsCount: paperTrailResult?.has_web_presence ? 1 : 0,
            reverseSearchUrl,
            paperTrail: paperTrailResult,
        });
    }
    catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
//# sourceMappingURL=entry.js.map
