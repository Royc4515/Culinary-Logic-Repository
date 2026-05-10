import React, { useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { CulinaryItem } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { GoogleGenAI } from '@google/genai';

interface AddSmartItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemAdded: (item: CulinaryItem) => void;
}

export default function AddSmartItemModal({ isOpen, onClose, onItemAdded }: AddSmartItemModalProps) {
  const [inputData, setInputData] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function extractUrl(text: string): string | null {
    const urls = text.match(/(https?:\/\/[^\s]+)/);
    return urls ? urls[0] : null;
  }

  const handleProcess = async () => {
    if (!inputData.trim()) return;
    setIsProcessing(true);
    setError(null);

    try {
      const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY || (globalThis as any).GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key is required for AI features.');
      }

      let enhancedInputData = inputData;
      const parsedUrl = extractUrl(inputData);
      
      // Enrich with Microlink if a URL is provided
      if (parsedUrl) {
        try {
          const microlinkUrl = `https://api.microlink.io?url=${encodeURIComponent(parsedUrl)}&screenshot=false`;
          const mlResponse = await fetch(microlinkUrl, { signal: AbortSignal.timeout(6000) });
          const mlData = await mlResponse.json();
          if (mlData.status === 'success' && mlData.data) {
            const d = mlData.data;
            const imageUrl = typeof d.image === 'object' && d.image !== null ? d.image.url : (d.image || '');
            const logoUrl = typeof d.logo === 'object' && d.logo !== null ? d.logo.url : '';
            const parts = [
              `Original Input: ${inputData}`,
              `\nExtracted Metadata from URL (${parsedUrl}):`,
              `Title: ${d.title || 'N/A'}`,
              `Site: ${d.publisher || d.author || 'N/A'}`,
              `Description: ${d.description || 'N/A'}`,
              imageUrl ? `Image URL: ${imageUrl}` : '',
              logoUrl ? `Logo URL: ${logoUrl}` : '',
              d.lang ? `Language: ${d.lang}` : '',
            ].filter(Boolean);
            enhancedInputData = parts.join('\n');
          }
        } catch (e) {
          console.warn("Could not fetch metadata for URL", e);
        }
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const responseSchema = {
        type: "OBJECT",
        properties: {
          type: {
            type: "STRING",
            enum: ["PLACE", "RECIPE", "GEAR"],
          },
          title: {
            type: "STRING",
            description: "Canonical name. Cleaned, no emojis.",
          },
          description: {
            type: "STRING",
            description: "1-2 punchy sentences a friend would say to convince you to try it. Concrete details, not generic praise.",
          },
          thumbnail_url: {
            type: "STRING",
            description: "Image URL from the input or metadata, else empty string",
          },
          original_url: {
            type: "STRING",
            description: "Source URL if provided, else empty string",
          },
          context_tags: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "6-10 specific Title-Case tags mixing: vibe (Date Night, Hidden Gem, Solo Lunch), cuisine (Neapolitan Pizza, Levantine), occasion (Birthday, Brunch), dietary (Vegan, Gluten-Free Friendly), price (Affordable, Splurge), technique (Wood-Fired, Sous-Vide)",
          },
          specific_data: {
            type: "OBJECT",
            properties: {
              // PLACE fields
              location: {
                type: "OBJECT",
                properties: {
                  address: { type: "STRING", description: "Street + city as written" },
                  lat: { type: "NUMBER", description: "Always 0 — backend geocodes" },
                  lng: { type: "NUMBER", description: "Always 0 — backend geocodes" },
                },
              },
              cuisine: { type: "STRING", description: "Primary cuisine e.g. 'Modern Israeli', 'Sichuan', 'Coffee & Pastries'" },
              price_range: { type: "STRING", description: "$ | $$ | $$$ | $$$$ or empty" },
              vibe: { type: "STRING", description: "One short phrase capturing the room, e.g. 'Candle-lit, intimate, second-date energy'" },
              signature_dishes: { type: "ARRAY", items: { type: "STRING" }, description: "3-6 must-order dishes if mentioned" },
              dietary_tags: { type: "ARRAY", items: { type: "STRING" }, description: "e.g. Vegan, Vegetarian Options, Gluten-Free Friendly" },
              best_for: { type: "ARRAY", items: { type: "STRING" }, description: "e.g. Date Night, Group Dinner, Quick Lunch, Coffee Meeting" },
              phone: { type: "STRING" },
              hours_summary: { type: "STRING", description: "Plain-English hours if known" },
              google_maps_url: { type: "STRING" },
              website: { type: "STRING" },
              wolt_url: { type: "STRING" },
              instagram_url: { type: "STRING" },
              // RECIPE fields
              course: { type: "STRING", description: "Appetizer | Main | Side | Dessert | Breakfast | Drink | Sauce | Snack" },
              prep_time_minutes: { type: "NUMBER" },
              cook_time_minutes: { type: "NUMBER" },
              total_time_minutes: { type: "NUMBER" },
              serving_size: { type: "STRING", description: "e.g. '4 people'" },
              difficulty: { type: "STRING", description: "Easy | Medium | Hard" },
              key_techniques: { type: "ARRAY", items: { type: "STRING" }, description: "e.g. Braising, Sous-Vide" },
              ingredients: { type: "ARRAY", items: { type: "STRING" } },
              tips: { type: "ARRAY", items: { type: "STRING" }, description: "Short actionable tips" },
              // GEAR fields
              brand: { type: "STRING" },
              category: { type: "STRING", description: "e.g. Chef Knife, Stand Mixer, Cookbook" },
              price: { type: "STRING", description: "Price as written, e.g. '$249'" },
              use_case: { type: "STRING", description: "What it's for in one line" },
              pros: { type: "ARRAY", items: { type: "STRING" }, description: "3 short pros" },
              cons: { type: "ARRAY", items: { type: "STRING" } },
              purchase_link: { type: "STRING" },
            },
          },
        },
        required: ["type", "title", "description", "context_tags", "specific_data"],
      };

      const systemInstruction = `You are a sharp, well-traveled culinary curator and data extractor. Extract structured info from the user's input.

Rules:
- description: 1-2 punchy sentences a friend would say. Concrete details over adjectives. "Great food and atmosphere" is FORBIDDEN.
- context_tags: 6-10 specific Title-Case tags mixing vibe, cuisine, occasion, dietary, price, technique. No duplicates with cuisine/vibe fields.
- Never invent facts — if a field is unknown use empty string, empty array, or 0.
- PLACE: fill cuisine, price_range, vibe, signature_dishes, dietary_tags, best_for from whatever context is available.
- RECIPE: fill course, total_time_minutes, difficulty, dietary_tags, key_techniques, ingredients, tips.
- GEAR: fill category, use_case, pros, cons.
- lat/lng are always 0 — backend geocodes them.`;

      const contents = [
        { role: 'user', parts: [{ text: "https://www.seriouseats.com/reverse-sear-steak-recipe" }] },
        {
          role: 'model',
          parts: [{ text: JSON.stringify({
            type: "RECIPE",
            title: "Reverse-Seared Steak",
            description: "Start low in the oven, finish with a screaming-hot sear — gets you edge-to-edge medium-rare with a crust that shatters. Worth every extra minute.",
            thumbnail_url: "",
            original_url: "https://www.seriouseats.com/reverse-sear-steak-recipe",
            context_tags: ["Steak", "Dinner Party", "Weeknight Win", "Beef", "Grilling", "Technique-Forward"],
            specific_data: {
              course: "Main",
              prep_time_minutes: 5,
              cook_time_minutes: 55,
              total_time_minutes: 60,
              serving_size: "2 people",
              difficulty: "Medium",
              dietary_tags: ["Gluten-Free", "Dairy-Free"],
              key_techniques: ["Reverse Sear", "Resting"],
              ingredients: ["Thick-cut ribeye or strip steak", "Kosher salt", "Black pepper", "Neutral oil", "Butter", "Thyme", "Garlic"],
              tips: ["Season 24h ahead for best crust", "Use a wire rack so air circulates", "Let it rest 5 min before cutting"]
            }
          })}]
        },
        { role: 'user', parts: [{ text: "Pastis in the meatpacking district. Great vibes, classic French brasserie, always packed on weekends." }] },
        {
          role: 'model',
          parts: [{ text: JSON.stringify({
            type: "PLACE",
            title: "Pastis",
            description: "A faithful recreation of a Paris brasserie — zinc bar, tiled floors, and steak frites that actually taste like the real thing. Go on a Tuesday; weekends are chaos.",
            thumbnail_url: "",
            original_url: "",
            context_tags: ["French Brasserie", "Date Night", "Classic NYC", "Lively", "Cocktails", "Brunch"],
            specific_data: {
              location: { address: "52 Gansevoort St, New York, NY", lat: 0, lng: 0 },
              cuisine: "French Brasserie",
              price_range: "$$$",
              vibe: "Buzzy Paris brasserie with zinc bar and perpetual energy",
              signature_dishes: ["Steak Frites", "Moules Marinières", "Croque Monsieur"],
              dietary_tags: ["Vegetarian Options"],
              best_for: ["Date Night", "Group Dinner", "Brunch"],
              phone: "",
              hours_summary: "",
              google_maps_url: "",
              website: "",
              wolt_url: "",
              instagram_url: ""
            }
          })}]
        },
        { role: 'user', parts: [{ text: enhancedInputData }] }
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: 'application/json',
          responseSchema: responseSchema as any,
          temperature: 0.1,
        }
      });


      let dataText;
      try {
        dataText = response.text;
      } catch (e) {
        // sometimes getting .text throws if finishReason is SAFETY, etc.
        console.error("Error accessing response.text:", e);
      }

      if (!dataText) {
        console.error("AI response full object:", JSON.stringify(response, null, 2));
        const finishReason = response.candidates?.[0]?.finishReason;
        if (finishReason === 'SAFETY') {
          throw new Error("AI blocked the extraction due to safety reasons.");
        }
        throw new Error("Could not parse data from AI. The model returned no text.");
      }

      // Strip potential markdown code blocks if the model didn't listen
      dataText = dataText.replace(/```(?:json)?/g, '').trim();

      let extractedData;
      try {
        extractedData = JSON.parse(dataText);
      } catch (parseError: any) {
        console.error("AI returned invalid JSON. Raw output was:", dataText);
        throw new Error("AI returned invalid data format: " + parseError.message);
      }
      
      const payload = {
        type: extractedData.type || 'PLACE',
        title: extractedData.title || 'Untitled',
        thumbnail_url: extractedData.thumbnail_url || 'https://images.unsplash.com/photo-1495195134817-a1a18bc0c410?q=80&w=2000&auto=format&fit=crop',
        original_url: extractedData.original_url || '',
        context_tags: extractedData.context_tags || [],
        status: 'SAVED',
        specific_data: extractedData.specific_data || {}
      };

      if (supabase) {
        // Assume user is authenticated
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
            throw new Error('Must be logged in to save via Supabase.');
        }

        const { data: insertedData, error: dbError } = await supabase
          .from('culinary_items')
          .insert({
            ...payload,
            user_id: userData.user.id
          })
          .select()
          .single();
        
        if (dbError) throw new Error(dbError.message);
        if (insertedData) {
          onItemAdded(insertedData as CulinaryItem);
        }
      } else {
        // Mock DB Mode
        const mockItem: CulinaryItem = {
          id: Math.random().toString(36).substr(2, 9),
          created_at: new Date().toISOString(),
          ...payload,
        } as unknown as CulinaryItem;
        onItemAdded(mockItem);
      }

      onClose();
      setInputData('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while processing using AI.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--color-accent)] to-rose-400" />
        
        <div className="flex items-center justify-between p-6 border-b border-stone-100 pb-4">
          <div className="flex items-center gap-3">
             <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 flex items-center justify-center text-indigo-500">
               <Sparkles className="w-4 h-4" />
             </div>
             <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-stone-800">The Brain</h2>
                <p className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">AI Auto-Extraction</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-800 transition-colors bg-stone-50 rounded-full hover:bg-stone-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-medium">
              {error}
            </div>
          )}

          <p className="text-sm text-stone-500 mb-4 leading-relaxed">
            Paste a recipe link, restaurant review, or just type out some raw notes. The Culinary Brain will automatically parse it and categorize it.
          </p>

          <textarea
            value={inputData}
            onChange={(e) => setInputData(e.target.value)}
            placeholder="e.g. https://www.seriouseats.com/reverse-sear-steak-recipe or 'A great new pasta place in Soho called Misi. Need to try their linguini.'"
            className="w-full h-32 px-4 py-3 bg-stone-50 text-sm border border-stone-200 rounded-2xl focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] focus:bg-white transition-all text-stone-700 resize-none font-medium"
          />
        </div>
        
        <div className="p-6 border-t border-stone-100 bg-stone-50 flex justify-end gap-3 rounded-b-3xl">
          <button 
            type="button" 
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-bold text-stone-500 uppercase tracking-widest hover:text-stone-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleProcess}
            disabled={isProcessing || !inputData.trim()}
            className="flex items-center gap-2 px-6 py-2.5 bg-stone-800 text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-stone-700 transition-colors disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Thinking...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Extract Data
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
