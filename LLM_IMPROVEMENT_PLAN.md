# Plan to Improve LLM Extraction Results

Based on a review of the current implementations for both the **Telegram Groq LLM** (Backend) and the **AUTO Smart Add LLM** (Frontend), here is a comprehensive plan to maximize extraction accuracy, reduce errors, and improve data quality.

## 1. Improving the Telegram Groq LLM (Backend)

Currently, the backend uses `llama3-70b-8192` on Groq and relies on prompt instructions to enforce JSON output, manually cleaning up Markdown fences (`.replace('```json', '')`). 

**Proposed Action Items:**
*   **A. Enable Native JSON Mode:** Groq natively supports guaranteed JSON output. We should pass `response_format={"type": "json_object"}` in the `groq_client.chat.completions.create` call. This completely eliminates parsing errors.
*   **B. Add Few-Shot Prompting (`prompts.py`):** The current prompt provides a good schema but no examples. We should add a section with 3 concrete examples (one each for `PLACE`, `RECIPE`, `GEAR`). This "shows rather than tells" the model how to format edge cases creatively (e.g., guessing serving sizes or extracting context_tags).
*   **C. Refine Social Media Heuristics:** Instagram and TikTok often have sparse metadata. We should modify the prompt to give rules of thumb: *"If the caption contains words like 'bake, teaspoon, oven', lean heavily towards `RECIPE`; if it contains 'reservation, menu, vibe', lean towards `PLACE`."*
*   **D. Handle Missing Data Cleanly:** Instruct the model to use `null` (or empty strings where strictly required by your DB) instead of hallucinating values for `prep_time_minutes` or `difficulty`.

## 2. Improving the AUTO Smart Add LLM (Frontend)

Currently, `AddSmartItemModal.tsx` uses `gemini-2.5-flash` using `responseSchema` (Structured Outputs), which is great. However, it suffers from a lack of context when users paste a bare URL.

**Proposed Action Items:**
*   **A. URL Metadata Pre-scraping:** Currently, the frontend just passes the raw URL string (e.g. `https://instagram.com/p/123`) straight to Gemini. **Gemini cannot browse the web dynamically within this API call.** We should connect the frontend to the backend's `/api/scrape` or `scrape_metadata` logic so that we pass the *Title* and *Description* of the URL to Gemini, rather than just the raw URL. This will cause a massive leap in accuracy for URL pastes.
*   **B. System Instructions:** Move the persona prompt (`"You are a culinary data extractor..."`) out of the `contents` property and instead attach it as a `systemInstruction` in the GenAI config. This enforces character and constraint adherence much more strongly in Gemini.
*   **C. Few-Shot Examples:** Similar to the Groq plan, we should use the `contents` array to simulate a multi-turn conversation that demonstrates a flawless JSON extraction before sending the actual user input.
*   **D. Enhance the JSON Schema:** We can tighten the `responseSchema`. For example, instead of a free-text string for `difficulty`, we can set `enum: ["Easy", "Medium", "Hard"]` strictly in the JSON Schema definition.

---
**Next Steps:**
If you approve of this plan, I can immediately start implementing the frontend (AUTO Smart Add) improvements. For the backend (Groq), I can provide you with the exact code snippet for the `backend/prompts.py` and `backend/app.py` for Claude Code to implement, or write it directly if you give me permission to touch the backend folder.
