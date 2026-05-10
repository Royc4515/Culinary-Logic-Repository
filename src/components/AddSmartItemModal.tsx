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
      
      // Attempt to enrich with Microlink if a URL is provided
      if (parsedUrl) {
        try {
          const microlinkUrl = `https://api.microlink.io?url=${encodeURIComponent(parsedUrl)}`;
          const mlResponse = await fetch(microlinkUrl, { signal: AbortSignal.timeout(5000) });
          const mlData = await mlResponse.json();
          if (mlData.status === 'success' && mlData.data) {
            const imageUrl = typeof mlData.data.image === 'object' && mlData.data.image !== null ? mlData.data.image.url : (mlData.data.image || 'N/A');
            enhancedInputData = `Original Input: ${inputData}\n\nExtracted Metadata from URL:\nTitle: ${mlData.data.title || 'N/A'}\nDescription: ${mlData.data.description || 'N/A'}\nImage URL: ${imageUrl}`;
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
            description: "Must be 'PLACE', 'RECIPE', or 'GEAR'",
          },
          title: {
            type: "STRING",
            description: "Name of the place, recipe or gear. If unknown, use a placeholder.",
          },
          thumbnail_url: {
            type: "STRING",
            description: "An image URL (if present in the text) or an empty string",
          },
          original_url: {
            type: "STRING",
            description: "The source URL if provided",
          },
          context_tags: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "3-5 relevant short tags like 'Italian', 'Date Night', 'Baking', etc.",
          },
          specific_data: {
            type: "OBJECT",
            properties: {
              location: {
                type: "OBJECT",
                properties: {
                  address: { type: "STRING", description: "Full address if it's a place" },
                  lat: { type: "NUMBER", description: "Latitude if known, else 0" },
                  lng: { type: "NUMBER", description: "Longitude if known, else 0" }
                }
              },
              prep_time_minutes: { type: "NUMBER", description: "If a recipe" },
              cook_time_minutes: { type: "NUMBER", description: "If a recipe" },
              difficulty: { 
                type: "STRING", 
                enum: ["Easy", "Medium", "Hard"],
                description: "If a recipe (e.g. Easy, Medium, Hard)" 
              },
              ingredients: { 
                type: "ARRAY", 
                items: { type: "STRING" },
                description: "List of ingredients if a recipe"
              },
              brand: { type: "STRING", description: "If gear" },
              price: { type: "STRING", description: "If gear" },
              purchase_link: { type: "STRING", description: "If gear" }
            }
          }
        },
        required: ["type", "title", "context_tags", "specific_data"],
      };

      const systemInstruction = `You are an expert culinary data extractor. Use the user input and any provided metadata to generate structured JSON for a Culinary Logic Repository database.
If details like prep time, address, or difficulty aren't explicitly mentioned or deducible, leave them as null or defaults, but do not hallucinate facts.
Always output pure valid JSON matching the schema.`;

      const contents = [
        { role: 'user', parts: [{ text: "https://www.seriouseats.com/reverse-sear-steak-recipe" }] },
        { 
          role: 'model', 
          parts: [{ text: JSON.stringify({
            type: "RECIPE",
            title: "Reverse-Seared Steak",
            thumbnail_url: "",
            original_url: "https://www.seriouseats.com/reverse-sear-steak-recipe",
            context_tags: ["Steak", "Dinner", "Technique"],
            specific_data: {
              prep_time_minutes: 5,
              cook_time_minutes: 45,
              difficulty: "Medium",
              ingredients: ["Steak", "Salt", "Pepper", "Butter"]
            }
          })}] 
        },
        { role: 'user', parts: [{ text: "Pastis in the meatpacking district. Great vibes, terrible wait times." }] },
        {
          role: 'model',
          parts: [{ text: JSON.stringify({
            type: "PLACE",
            title: "Pastis",
            thumbnail_url: "",
            original_url: "",
            context_tags: ["Meatpacking", "Vibes", "Busy", "French"],
            specific_data: {
              location: {
                address: "Meatpacking District, New York",
                lat: 0,
                lng: 0
              }
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
