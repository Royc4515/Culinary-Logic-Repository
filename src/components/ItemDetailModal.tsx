import React, { useEffect, useState } from 'react';
import { CulinaryItem } from '../data/mockData';
import { X, MapPin, ChefHat, Wrench, Bookmark, Star, Share2, Trash2 } from 'lucide-react';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  item: CulinaryItem;
  isOpen: boolean;
  onClose: () => void;
  onToggleStatus?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

export default function ItemDetailModal({ item, isOpen, onClose, onToggleStatus, onDelete }: Props) {
  const [mounted, setMounted] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isExperienced = item.status === 'EXPERIENCED';

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      document.body.style.overflow = 'hidden';
    } else {
      setTimeout(() => {
        setMounted(false);
        setIsDeleting(false); // Reset deleting state when modal closes
      }, 300);
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen && !mounted) return null;

  const handleDelete = () => {
    onDelete?.(item.id);
    onClose();
  };

  const handleShare = async () => {
    const shareData = {
      title: item.title,
      text: item.personal_review || `Check out ${item.title}`,
      url: item.original_url || window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}\n${shareData.url}`);
        alert('Link copied to clipboard!');
      }
    } catch (err) { }
  };

  const renderContent = () => {
    if (item.type === 'PLACE') {
      const loc = item.specific_data.location;
      return (
        <div className="space-y-6">
          {loc && (
            <div className="h-64 rounded-2xl overflow-hidden border border-stone-200">
              {hasValidKey ? (
                <APIProvider apiKey={API_KEY} version="weekly">
                   <Map
                     defaultCenter={{lat: loc.lat, lng: loc.lng}}
                     defaultZoom={15}
                     mapId="CULINARY_MAP_DETAIL"
                     disableDefaultUI={true}
                     gestureHandling="greedy"
                   >
                     <AdvancedMarker position={{lat: loc.lat, lng: loc.lng}}>
                       <Pin background="#f59e0b" glyphColor="#fff" borderColor="#b45309" />
                     </AdvancedMarker>
                   </Map>
                </APIProvider>
              ) : (
                <div className="h-full w-full bg-stone-100 flex items-center justify-center text-xs text-stone-500 p-4 text-center">
                  Google Maps Platform Key missing. Cannot display mini-map.
                </div>
              )}
            </div>
          )}
          
          <div>
            <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2">Location Details</h4>
            {loc && <p className="text-stone-700 text-sm mb-4">{loc.address}</p>}
            
            <div className="flex flex-wrap gap-3">
              {item.original_url && (
                <button onClick={() => window.open(item.original_url, '_blank')} className="px-4 py-2 bg-stone-800 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-stone-700">Open Resource</button>
              )}
               {item.specific_data.website && (
                 <button onClick={() => window.open(item.specific_data.website, '_blank')} className="px-4 py-2 bg-stone-100 text-stone-700 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-stone-200">Website</button>
               )}
            </div>
          </div>
        </div>
      );
    }
    
    if (item.type === 'RECIPE') {
      return (
        <div className="space-y-8">
           <div className="flex flex-wrap gap-8 py-4 border-y border-stone-100 text-sm">
              {!!item.specific_data.prep_time_minutes && <div><span className="text-stone-400 font-bold uppercase tracking-widest text-[10px] block mb-1">Prep Time</span> {item.specific_data.prep_time_minutes} min</div>}
              {!!item.specific_data.cook_time_minutes && <div><span className="text-stone-400 font-bold uppercase tracking-widest text-[10px] block mb-1">Cook Time</span> {item.specific_data.cook_time_minutes} min</div>}
              {item.specific_data.difficulty && <div><span className="text-stone-400 font-bold uppercase tracking-widest text-[10px] block mb-1">Difficulty</span> {item.specific_data.difficulty}</div>}
           </div>

           {item.specific_data.ingredients && item.specific_data.ingredients.length > 0 && (
             <div>
               <h4 className="text-xl font-serif text-stone-800 mb-4">Ingredients</h4>
               <ul className="space-y-3">
                 {item.specific_data.ingredients.map((ing: string, i: number) => (
                   <li key={i} className="flex gap-4 items-start text-stone-700">
                     <span className="text-[var(--color-accent)] font-bold mt-1">•</span>
                     <span className="leading-relaxed">{ing}</span>
                   </li>
                 ))}
               </ul>
             </div>
           )}

           {item.original_url && (
               <button onClick={() => window.open(item.original_url, '_blank')} className="w-full py-4 bg-stone-800 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-stone-700 transition-colors shadow-lg">View Full Instructions</button>
           )}
        </div>
      );
    }

    if (item.type === 'GEAR') {
      return (
        <div className="space-y-6">
           <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100">
             <div className="grid grid-cols-2 gap-6">
               <div>
                 <span className="text-stone-400 font-bold uppercase tracking-widest text-[10px] block mb-1">Brand</span>
                 <p className="text-stone-800 font-bold">{item.specific_data.brand || 'Unknown'}</p>
               </div>
               <div>
                 <span className="text-stone-400 font-bold uppercase tracking-widest text-[10px] block mb-1">Price Info</span>
                 <p className="text-stone-800 font-bold">{item.specific_data.price || 'N/A'}</p>
               </div>
             </div>
           </div>

           {(item.specific_data.purchase_link || item.original_url) && (
              <button onClick={() => window.open(item.specific_data.purchase_link || item.original_url, '_blank')} className="w-full py-4 bg-stone-800 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-stone-700 transition-colors shadow-lg">Purchase / View Specs</button>
           )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className={`fixed inset-0 z-[200] flex items-center justify-center p-0 md:p-6 transition-all duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
      <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-md" onClick={onClose} />
      
      <div className={`relative w-full h-full md:h-auto md:max-h-full md:max-w-4xl bg-white md:rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row transition-transform duration-500 ${isOpen ? 'translate-y-0 scale-100' : 'translate-y-10 md:translate-y-0 md:scale-95'}`}>
        
        {/* Left pane: Image + Overview */}
        <div className="h-64 md:h-auto md:w-5/12 bg-stone-800 relative shrink-0">
          <img src={item.thumbnail_url} alt={item.title} className="w-full h-full object-cover opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          
          <button 
             onClick={onClose}
             className="absolute top-4 left-4 md:hidden w-8 h-8 rounded-full bg-white/20 backdrop-blur text-white flex items-center justify-center"
          >
             <X className="w-5 h-5" />
          </button>

          <div className="absolute bottom-6 left-6 right-6">
            <div className="flex flex-wrap gap-2 mb-3">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter ${
                item.type === 'PLACE' ? 'bg-[var(--color-accent)] text-white' : 
                item.type === 'RECIPE' ? 'bg-blue-500 text-white' : 'bg-emerald-500 text-white'
              }`}>
                {item.type}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter ${
                 isExperienced ? 'bg-white/20 text-white backdrop-blur' : 'bg-black/50 text-stone-200 backdrop-blur'
              }`}>
                {item.status}
              </span>
            </div>
            <h2 className="font-serif text-3xl font-bold text-white leading-tight">{item.title}</h2>
          </div>
        </div>

        {/* Right pane: Details */}
        <div className="flex-1 flex flex-col h-full bg-white overflow-y-auto">
          <div className="sticky top-0 bg-white/90 backdrop-blur border-b border-stone-100 px-6 py-4 flex items-center justify-between z-10 hidden md:flex">
             <div className="flex gap-2 items-center">
                <button onClick={handleShare} className="p-2 text-stone-400 hover:text-[var(--color-accent)] hover:bg-stone-50 rounded-full transition-colors">
                  <Share2 className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => onToggleStatus?.(item.id)}
                  className={`p-2 rounded-full transition-colors ${isExperienced ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/10' : 'text-stone-400 hover:text-[var(--color-accent)] hover:bg-stone-50'}`}
                >
                  <Bookmark className="w-5 h-5" fill={isExperienced ? 'currentColor' : 'none'} />
                </button>
                <button 
                  onClick={() => setIsDeleting(true)}
                  className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
             </div>
             <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-800 transition-colors">
               <X className="w-6 h-6" />
             </button>
          </div>

          <div className="p-6 md:p-8 flex-1">
             {/* Mobile actions - only show on small screens */}
             <div className="flex justify-between items-center mb-6 md:hidden">
                <div className="flex gap-2">
                  <button onClick={handleShare} className="flex items-center gap-2 px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg text-xs font-bold uppercase tracking-widest">
                    <Share2 className="w-4 h-4" /> Share
                  </button>
                  <button 
                    onClick={() => onToggleStatus?.(item.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest border ${
                       isExperienced ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/5' : 'border-stone-200 text-stone-600'
                    }`}
                  >
                    <Bookmark className="w-4 h-4" fill={isExperienced ? 'currentColor' : 'none'} /> {isExperienced ? 'Saved' : 'Save'}
                  </button>
                </div>
                <button 
                  onClick={() => setIsDeleting(true)}
                  className="p-2 text-stone-400 hover:text-red-600 rounded-full transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
             </div>

             <div className="flex flex-wrap gap-2 mb-6">
                {item.context_tags.map(tag => (
                   <span key={tag} className="px-3 py-1 bg-stone-100 text-stone-600 rounded-full text-xs font-bold uppercase tracking-wider">{tag}</span>
                ))}
             </div>

             {item.personal_review && (
                <div className="mb-8">
                  <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-3">Notes & Thoughts</h4>
                  <p className="text-stone-700 leading-relaxed bg-stone-50 p-4 rounded-2xl italic border-l-4 border-[var(--color-accent)]">"{item.personal_review}"</p>
                </div>
             )}

             {renderContent()}
          </div>
          
          {/* Deletion Confirmation Overlay */}
          <AnimatePresence>
            {isDeleting && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm flex items-center justify-center p-8 text-center"
              >
                <div className="max-w-xs w-full">
                  <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Trash2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-serif text-stone-900 mb-2">Delete Item?</h3>
                  <p className="text-stone-500 text-sm mb-8 leading-relaxed">
                    This will permanently remove <span className="font-bold text-stone-800">"{item.title}"</span> from your record. This action cannot be undone.
                  </p>
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={handleDelete}
                      className="w-full py-3 bg-red-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                    >
                      Permanently Delete
                    </button>
                    <button 
                      onClick={() => setIsDeleting(false)}
                      className="w-full py-3 bg-stone-100 text-stone-600 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-stone-200 transition-colors"
                    >
                      Keep Item
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
