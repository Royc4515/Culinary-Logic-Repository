import React, { useState } from 'react';
import { X } from 'lucide-react';
import { CulinaryItem } from '../data/mockData';
import { supabase } from '../lib/supabase';

interface AddManualItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemAdded: (item: CulinaryItem) => void;
}

export default function AddManualItemModal({ isOpen, onClose, onItemAdded }: AddManualItemModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [type, setType] = useState<CulinaryItem['type']>('PLACE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [originalUrl, setOriginalUrl] = useState('');
  const [contextTags, setContextTags] = useState('');
  const [status, setStatus] = useState<CulinaryItem['status']>('SAVED');

  // Specific data state
  const [address, setAddress] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [brand, setBrand] = useState('');
  const [price, setPrice] = useState('');
  const [purchaseLink, setPurchaseLink] = useState('');

  const [photosStr, setPhotosStr] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const tagsArray = contextTags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    const specificData: any = {
      description: description
    };
    
    if (photosStr.trim()) {
      specificData.photos = photosStr.split(',').map(u => u.trim()).filter(u => u.length > 0);
    }

    if (type === 'PLACE') {
      specificData.location = { address, lat: 0, lng: 0 };
    } else if (type === 'RECIPE') {
      specificData.prep_time_minutes = prepTime ? parseInt(prepTime) : 0;
      specificData.cook_time_minutes = cookTime ? parseInt(cookTime) : 0;
      specificData.difficulty = difficulty;
      specificData.ingredients = []; // Simplified for manual entry
    } else if (type === 'GEAR') {
      specificData.brand = brand;
      specificData.price = price;
      specificData.purchase_link = purchaseLink;
    }

    const payload = {
      type,
      title,
      thumbnail_url: thumbnailUrl || 'https://via.placeholder.com/400?text=No+Image',
      original_url: originalUrl,
      context_tags: tagsArray,
      status,
      specific_data: specificData
    };

    if (supabase) {
      const { data, error: dbError } = await supabase
        .from('culinary_items')
        .insert(payload)
        .select()
        .single();
      
      if (dbError) {
        console.error('Error inserting item:', dbError);
        setError(dbError.message);
        setIsSubmitting(false);
      } else if (data) {
        onItemAdded(data as CulinaryItem);
        setIsSubmitting(false);
        onClose();
      }
    } else {
      // Logic for when Supabase is not connected (mock data mode)
      const mockItem: CulinaryItem = {
        id: Math.random().toString(36).substr(2, 9),
        ...payload
      } as unknown as CulinaryItem;
      onItemAdded(mockItem);
      setIsSubmitting(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-stone-100">
          <h2 className="text-sm font-bold uppercase tracking-widest text-stone-800">Add Item Manually</h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs">
              {error}
            </div>
          )}

          <form id="manual-add-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">Type</label>
              <div className="flex gap-2">
                {(['PLACE', 'RECIPE', 'GEAR'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md border ${
                      type === t 
                        ? 'bg-stone-800 text-white border-stone-800' 
                        : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">Title *</label>
              <input 
                type="text" 
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Name of the place, recipe or gear"
                required
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">Description</label>
              <textarea 
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="1-2 punchy sentences about this item"
                rows={2}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">Status</label>
                <select 
                  value={status}
                  onChange={e => setStatus(e.target.value as CulinaryItem['status'])}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] bg-white"
                >
                  <option value="SAVED">Saved</option>
                  <option value="EXPERIENCED">Experienced</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">Tags</label>
                <input 
                  type="text" 
                  value={contextTags}
                  onChange={e => setContextTags(e.target.value)}
                  placeholder="Comma separated"
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">Thumbnail URL</label>
              <input 
                type="url" 
                value={thumbnailUrl}
                onChange={e => setThumbnailUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">Gallery Photos (Comma separated URLs)</label>
              <textarea 
                value={photosStr}
                onChange={e => setPhotosStr(e.target.value)}
                placeholder="https://image1.jpg, https://image2.jpg"
                rows={2}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">Original URL</label>
              <input 
                type="url" 
                value={originalUrl}
                onChange={e => setOriginalUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div className="pt-4 border-t border-stone-100">
              <h3 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-3">Specific Data</h3>
              
              {type === 'PLACE' && (
                <div>
                  <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">Address</label>
                  <input 
                    type="text" 
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="Full address"
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]"
                  />
                </div>
              )}

              {type === 'RECIPE' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">Prep Time (min)</label>
                    <input 
                      type="number" 
                      value={prepTime}
                      onChange={e => setPrepTime(e.target.value)}
                      placeholder="e.g. 15"
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">Cook Time (min)</label>
                    <input 
                      type="number" 
                      value={cookTime}
                      onChange={e => setCookTime(e.target.value)}
                      placeholder="e.g. 30"
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)]"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">Difficulty</label>
                    <input 
                      type="text" 
                      value={difficulty}
                      onChange={e => setDifficulty(e.target.value)}
                      placeholder="Easy, Medium, Hard"
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)]"
                    />
                  </div>
                </div>
              )}

              {type === 'GEAR' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">Brand</label>
                    <input 
                      type="text" 
                      value={brand}
                      onChange={e => setBrand(e.target.value)}
                      placeholder="e.g. Vitamix"
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">Price</label>
                    <input 
                      type="text" 
                      value={price}
                      onChange={e => setPrice(e.target.value)}
                      placeholder="e.g. $400"
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)]"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">Purchase Link</label>
                    <input 
                      type="url" 
                      value={purchaseLink}
                      onChange={e => setPurchaseLink(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)]"
                    />
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>
        
        <div className="p-4 border-t border-stone-100 bg-stone-50 flex justify-end gap-3">
          <button 
            type="button" 
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-stone-500 hover:text-stone-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            form="manual-add-form"
            disabled={isSubmitting}
            className="px-5 py-2 bg-stone-800 text-white text-sm font-bold rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : 'Save Item'}
          </button>
        </div>
      </div>
    </div>
  );
}
