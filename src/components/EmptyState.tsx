import React from 'react';
import { UtensilsCrossed } from 'lucide-react';

interface Props {
  activeFilter?: string | null;
  searchQuery?: string;
  onClearFilter?: () => void;
}

export default function EmptyState({ activeFilter, searchQuery, onClearFilter }: Props) {
  const hasFilters = activeFilter || searchQuery;

  return (
    <div className="col-span-full h-[400px] flex flex-col items-center justify-center text-center p-8 bg-white border border-stone-100 rounded-2xl shadow-[var(--shadow-card)]">
      <div className="w-20 h-20 bg-stone-50 rounded-full flex items-center justify-center mb-6 border border-stone-100">
        <UtensilsCrossed className="w-10 h-10 text-stone-300" strokeWidth={1.5} />
      </div>
      <h3 className="font-serif text-2xl font-bold text-[var(--color-primary-text)] mb-2">
        Nothing Found
      </h3>
      <p className="text-stone-500 max-w-sm mb-6 leading-relaxed">
        {hasFilters
          ? `We couldn't find any culinary experiences matching your search and filter criteria. `
          : "Your repository is currently empty. Start adding places, recipes, and gear to build your collection."}
      </p>
      {hasFilters && onClearFilter && (
        <button 
          onClick={onClearFilter}
          className="px-6 py-2.5 bg-stone-800 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-stone-700 transition-colors"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}
