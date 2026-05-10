import React, { useState } from 'react';
import { CulinaryItem } from '../data/mockData';
import { MapPin, Clock, ChefHat, Wrench, Bookmark, Star, ChevronDown, Share2, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import ItemDetailModal from './ItemDetailModal';

interface Props {
  item: CulinaryItem;
  className?: string;
  key?: string;
  featured?: boolean;
  onToggleStatus?: (id: string) => void;
  onDelete?: (id: string) => void;
  isMinimal?: boolean;
}

export default function ItemCard({ item, className = '', featured = false, onToggleStatus, onDelete, isMinimal = false }: Props) {
  const isExperienced = item.status === 'EXPERIENCED';
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
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
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Error sharing:', err);
      }
    }
  };

  const getTypeIcon = () => {
    switch (item.type) {
      case 'PLACE': return <MapPin className="w-4 h-4" />;
      case 'RECIPE': return <ChefHat className="w-4 h-4" />;
      case 'GEAR': return <Wrench className="w-4 h-4" />;
    }
  };

  return (
    <>
    <motion.div 
      layout
      initial={{ borderRadius: 16 }}
      onClick={() => setIsModalOpen(true)}
      className={`group relative bg-white rounded-2xl overflow-hidden shadow-[var(--shadow-card)] transition-all duration-300 border border-stone-100 flex flex-col cursor-pointer ${className} ${!isModalOpen ? 'hover:-translate-y-1 hover:shadow-lg' : 'shadow-md ring-1 ring-[var(--color-accent)] ring-opacity-20'}`}
    >
      
      {/* Media Zone */}
      <div className={`relative shrink-0 overflow-hidden bg-stone-800 ${featured ? 'h-64 sm:h-80 md:h-96' : 'h-48 sm:h-56'}`}>
        <img 
          src={item.thumbnail_url} 
          alt={item.title} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        
        {/* Top Badges */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
          <div className="flex gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--color-accent)] text-white uppercase tracking-tighter">
              {getTypeIcon()}
              {item.type}
            </span>
            {item.specific_data?.telegram_id && (
               <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#24A1DE] text-white uppercase tracking-tighter shadow-sm blur-none backdrop-blur-md opacity-90">
                 <Send className="w-2.5 h-2.5" />
                 via Telegram
               </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleShare}
              title="Share"
              className="p-2 rounded-xl backdrop-blur-sm transition-colors bg-white/20 text-white hover:bg-white hover:text-[var(--color-accent)]"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleStatus?.(item.id);
              }}
              className={`p-2 rounded-xl backdrop-blur-sm transition-colors ${
              isExperienced 
                ? 'bg-[var(--color-accent)] text-white' 
                : 'bg-white/20 text-white hover:bg-white hover:text-[var(--color-accent)]'
            }`}>
              <Bookmark className="w-4 h-4" fill={isExperienced ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>

        {/* Featured inner text */}
        {featured && (
          <div className="absolute bottom-6 left-6 right-6 z-10 pointer-events-none">
            <div className="flex items-center gap-2 mb-2 pointer-events-auto">
               <span className="text-white/70 text-xs font-bold uppercase tracking-widest">{item.context_tags.join(' • ')}</span>
            </div>
            <h3 className="font-serif font-bold text-3xl sm:text-4xl leading-tight text-white mb-2">
              {item.title}
            </h3>
            {item.rating && (
              <div className="flex items-center gap-1 text-[var(--color-accent)] text-sm font-bold">
                {'★'.repeat(item.rating)}{'☆'.repeat(5-item.rating)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content Layer (Only if not fully featured overlaid, or we keep it for extra details) */}
      {!featured && (
        <motion.div layout className="p-6 flex flex-col flex-grow">
          <motion.div layout className="flex justify-between items-start mb-2">
            <h3 className="font-serif font-bold text-xl leading-tight text-[var(--color-primary-text)]">
              {item.title}
            </h3>
            {item.rating && (
              <div className="flex items-center gap-1 text-[var(--color-accent)] text-xs font-bold tracking-widest mt-1">
                {'★'.repeat(item.rating)}
              </div>
            )}
          </motion.div>

          {/* Context Badges (Filters) */}
          <motion.div layout className="flex flex-wrap items-center gap-2 mb-4">
            {item.context_tags.map((tag, i) => (
              <React.Fragment key={tag}>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-tight">
                  {tag}
                </span>
                {i < item.context_tags.length - 1 && (
                  <span className="text-stone-300 text-[10px]">•</span>
                )}
              </React.Fragment>
            ))}
          </motion.div>
          
          {/* Secondary Info / Review */}
          <motion.div layout className="mt-auto">
            {item.personal_review && (
              <motion.p layout className={`text-sm text-stone-500 leading-relaxed mb-4 line-clamp-2`}>
                {item.personal_review}
              </motion.p>
            )}

            {/* Specific Data Snippet */}
            <motion.div layout className="text-[10px] text-stone-400 font-bold uppercase tracking-widest flex items-center justify-between gap-2 mt-2">
              <div className="flex items-center gap-2">
                {item.type === 'PLACE' && item.specific_data.location && (
                  <span className="truncate flex items-center gap-1.5"><MapPin className="w-3 h-3"/> {item.specific_data.location.address.split(',')[0]}</span>
                )}
                {item.type === 'RECIPE' && item.specific_data.prep_time_minutes && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {item.specific_data.prep_time_minutes} min • {item.specific_data.difficulty}
                  </span>
                )}
                {item.type === 'GEAR' && item.specific_data.brand && (
                  <span className="flex items-center gap-1.5"><Wrench className="w-3 h-3"/> {item.specific_data.brand} • {item.specific_data.price}</span>
                )}
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}

      {/* If featured, show fewer details at the bottom or an expanded review */}
      {featured && (
         <motion.div layout className="p-6 bg-white flex flex-col flex-grow justify-between border-t border-stone-100">
            {item.personal_review && (
              <motion.p layout className={`text-sm text-stone-500 leading-relaxed line-clamp-2`}>
                {item.personal_review}
              </motion.p>
            )}

            <motion.div layout className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-between">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isExperienced ? 'bg-green-50 text-green-700' : 'bg-stone-50 text-stone-500'}`}>
                Status: {item.status.toLowerCase()}
              </span>
              <div className="flex items-center gap-3">
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsModalOpen(true);
                  }}
                  className="py-2 px-4 bg-stone-800 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-stone-700 transition-colors">
                  View Specs
                </button>
              </div>
            </motion.div>
         </motion.div>
      )}
    </motion.div>

    <ItemDetailModal 
      item={item}
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      onToggleStatus={onToggleStatus}
      onDelete={onDelete}
    />
    </>
  );
}
