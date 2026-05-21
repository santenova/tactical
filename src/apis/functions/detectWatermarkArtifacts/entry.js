import { apiClient, createClientFromRequest } from "./apis/client";


const WATERMARK_PROMPT = `You are a specialized AI watermark and signature artifact detector. Analyze this image carefully for the following specific signals:

INVISIBLE/STEGANOGRAPHIC WATERMARKS:
- C2PA (Coalition for Content Provenance and Authenticity) metadata markers
- Google SynthID invisible watermarks embedded in pixel noise
- Stable Diffusion invisible watermarks (in latent space frequency patterns)
- DALL-E / OpenAI invisible watermarks
- Midjourney invisible frequency-domain signatures

VISIBLE AI GENERATOR SIGNATURES:
- Midjourney-style "--ar" ratio marks or generational artifacts in corners
- DALL-E style over-smoothed corner vignetting
- Stable Diffusion characteristic blurring at image boundaries
- Adobe Firefly subtle edge artifacts
- Any visible "AI Generated" text watermarks (sometimes hidden in low-contrast areas)
- Typical GAN/diffusion spectral frequency anomalies (checkerboard patterns, grid artifacts)

STATISTICAL ARTIFACT SIGNATURES:
- Unnatural pixel regularity in flat color regions (too-perfect gradients)
- Frequency-domain peaks that don't match camera sensor noise profiles
- Color channel correlation anomalies typical of VAE decoders
- Overly symmetric noise distribution

Return a JSON object with:
- watermark_integrity_score: number 0-100. HIGH (80-100) = no watermarks or AI signatures detected (image appears clean). LOW (0-20) = strong AI watermark or signature artifacts detected. MEDIUM (40-60) = ambiguous or minor signals.
- detected_signatures: array of strings, each describing a specific detected signal (empty array if none found)
- steganographic_risk: "high" | "medium" | "low" — likelihood of invisible watermark presence
- visible_watermarks_found: boolean — true if any visible AI watermark text or logo was found
- frequency_anomalies: boolean — true if spectral/frequency domain anomalies typical of AI generation were detected
- summary: 1-2 sentence summary of findings`;
const WATERMARK_SCHEMA = {
    type: "object",
    properties: {
        watermark_integrity_score: { type: "number" },
        detected_signatures: { type: "array", items: { type: "string" } },
        steganographic_risk: { type: "string" },
        visible_watermarks_found: { type: "boolean" },
        frequency_anomalies: { type: "boolean" },
        summary: { type: "string" },
    },
};
Deno.serve(async (req) => {
    try {
        const apiClient = createClientFromRequest(req);
        const { imageUrl } = await req.json();
        if (!imageUrl) {
            return Response.json({ error: 'imageUrl required' }, { status: 400 });
        }
        const result = await apiClient.asServiceRole.integrations.Core.InvokeLLM({
            prompt: WATERMARK_PROMPT,
            file_urls: [imageUrl],
            response_json_schema: WATERMARK_SCHEMA,
        });
        return Response.json(result);
    }
    catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
//# sourceMappingURL=entry.js.map
