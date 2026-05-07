import React, { useState, useMemo } from 'react';
import { Map, Grid, Search, Filter } from 'lucide-react';
import { mockItems, CulinaryItem } from './data/mockData';
import ItemCard from './components/ItemCard';
import EmptyState from './components/EmptyState';

type ViewMode = 'GALLERY' | 'MAP' | 'ARCHIVE';

export default function App() {
  const [items, setItems] = useState<CulinaryItem[]>(mockItems);
  const [viewMode, setViewMode] = useState<ViewMode>('GALLERY');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<CulinaryItem['type'] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const recommendedTags = useMemo(() => {
    if (!searchQuery.trim()) {
      // Top 4 most frequent tags
      const frequencies: Record<string, number> = {};
      items.forEach(item => {
        item.context_tags.forEach(tag => {
          frequencies[tag] = (frequencies[tag] || 0) + 1;
        });
      });
      return Object.entries(frequencies)
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0])
        .slice(0, 4);
    }

    const q = searchQuery.toLowerCase();
    const matchingTags = new Set<string>();
    
    items.forEach(item => {
      const titleMatch = item.title.toLowerCase().includes(q);
      const tagMatch = item.context_tags.some(t => t.toLowerCase().includes(q));
      
      item.context_tags.forEach(tag => {
        if (tag.toLowerCase().includes(q)) {
          matchingTags.add(tag); // Exact or partial tag match
        } else if (titleMatch || tagMatch) {
          matchingTags.add(tag); // Related tag from matched item
        }
      });
    });

    return Array.from(matchingTags).slice(0, 6);
  }, [items, searchQuery]);

  const displayTags = useMemo(() => {
    const tags = new Set(recommendedTags);
    if (activeFilter) {
      tags.add(activeFilter);
    }
    return Array.from(tags).sort();
  }, [recommendedTags, activeFilter]);

  const filteredItems = useMemo(() => {
    let result = items;
    // If Archive mode, only show EXPERIENCED. If gallery, show all or maybe just SAVED? 
    // The design didn't specify, let's say Gallery shows all and Archive is just a placeholder.
    if (viewMode === 'ARCHIVE') {
       result = result.filter(item => item.status === 'EXPERIENCED');
    }
    
    if (activeType) {
      result = result.filter(item => item.type === activeType);
    }
    
    if (activeFilter) {
      result = result.filter(item => item.context_tags.includes(activeFilter));
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.title.toLowerCase().includes(q) || 
        item.context_tags.some(tag => tag.toLowerCase().includes(q))
      );
    }

    return result;
  }, [activeFilter, items, viewMode, searchQuery]);

  const handleToggleStatus = (id: string) => {
    setItems(prev => prev.map(item => 
      item.id === id 
        ? { ...item, status: item.status === 'SAVED' ? 'EXPERIENCED' : 'SAVED' }
        : item
    ));
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 flex flex-col lg:flex-row lg:items-center justify-between px-4 sm:px-6 lg:px-10 py-4 lg:py-0 lg:h-20 border-b border-stone-200 bg-white/90 backdrop-blur-md gap-4 lg:gap-0">
        <div className="flex items-center justify-between gap-4 w-full lg:w-auto">
            <div className="flex items-center gap-4 lg:gap-8 flex-1 lg:flex-none">
              <h1 className="font-serif text-2xl font-bold tracking-tight uppercase shrink-0">CLR<span className="text-[var(--color-accent)]">.</span></h1>
              
              {/* Mobile Search Bar */}
              <div className="relative flex-1 lg:hidden">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input 
                  type="text" 
                  placeholder="Search..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-1.5 w-full rounded-full text-xs font-medium border border-stone-200 outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all bg-stone-50 focus:bg-white placeholder:text-stone-400 text-[var(--color-primary-text)]"
                />
              </div>

              {/* Desktop View Toggle */}
              <div className="hidden lg:flex gap-6 text-sm font-medium uppercase tracking-widest opacity-70">
                <button
                  onClick={() => setViewMode('GALLERY')}
                  className={`transition-opacity ${
                    viewMode === 'GALLERY' 
                      ? 'text-[var(--color-accent)] border-b border-[var(--color-accent)] opacity-100' 
                      : 'hover:opacity-100'
                  }`}
                >
                  Gallery
                </button>
                <button
                  onClick={() => setViewMode('MAP')}
                  className={`transition-opacity ${
                    viewMode === 'MAP' 
                      ? 'text-[var(--color-accent)] border-b border-[var(--color-accent)] opacity-100' 
                      : 'hover:opacity-100'
                  }`}
                >
                  Map View
                </button>
                <button
                  onClick={() => setViewMode('ARCHIVE')}
                  className={`transition-opacity ${
                    viewMode === 'ARCHIVE' 
                      ? 'text-[var(--color-accent)] border-b border-[var(--color-accent)] opacity-100' 
                      : 'hover:opacity-100'
                  }`}
                >
                  Archive
                </button>
              </div>
            </div>

            {/* Mobile Avatar */}
            <div className="lg:hidden h-8 w-8 shrink-0 bg-stone-800 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-lg">
              RC
            </div>
        </div>

        {/* Quick Filters & Desktop Search */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 w-full lg:w-auto">
          <div className="relative hidden lg:block">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input 
              type="text" 
              placeholder="Search repository..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 lg:w-64 rounded-full text-xs font-medium border border-stone-200 outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all bg-stone-50 focus:bg-white placeholder:text-stone-400 text-[var(--color-primary-text)]"
            />
          </div>

          {/* Mobile View Toggle */}
          <div className="flex lg:hidden gap-6 text-[10px] sm:text-xs font-bold uppercase tracking-widest opacity-80 pb-2 border-b border-stone-100">
              <button
                onClick={() => setViewMode('GALLERY')}
                className={`transition-opacity ${
                  viewMode === 'GALLERY' ? 'text-[var(--color-accent)] border-[var(--color-accent)] opacity-100 underline decoration-2 underline-offset-8' : 'hover:opacity-100'
                }`}
              >Gallery</button>
              <button
                onClick={() => setViewMode('MAP')}
                className={`transition-opacity ${
                  viewMode === 'MAP' ? 'text-[var(--color-accent)] border-[var(--color-accent)] opacity-100 underline decoration-2 underline-offset-8' : 'hover:opacity-100'
                }`}
              >Map View</button>
              <button
                onClick={() => setViewMode('ARCHIVE')}
                className={`transition-opacity ${
                   viewMode === 'ARCHIVE' ? 'text-[var(--color-accent)] border-[var(--color-accent)] opacity-100 underline decoration-2 underline-offset-8' : 'hover:opacity-100'
                }`}
              >Archive</button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2 lg:pb-0 border-b lg:border-b-0 lg:border-r border-stone-200 lg:pr-4">
             <button
               onClick={() => setActiveType(null)}
               className={`whitespace-nowrap px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter transition-colors ${
                 activeType === null ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
               }`}
             >All Types</button>
             <button
               onClick={() => setActiveType('PLACE')}
               className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter transition-colors ${
                 activeType === 'PLACE' ? 'bg-[var(--color-accent)] text-white' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
               }`}
             >Places</button>
             <button
               onClick={() => setActiveType('RECIPE')}
               className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter transition-colors ${
                 activeType === 'RECIPE' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
               }`}
             >Recipes</button>
             <button
               onClick={() => setActiveType('GEAR')}
               className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter transition-colors ${
                 activeType === 'GEAR' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
               }`}
             >Gear</button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 lg:pb-0">
            <button
              onClick={() => {
                setViewMode('GALLERY');
                setActiveFilter(null);
                setActiveType(null);
                setSearchQuery('');
              }}
              className={`whitespace-nowrap px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter transition-colors ${
                activeFilter === null && viewMode !== 'ARCHIVE' && activeType === null
                  ? 'bg-stone-800 text-white'
                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
              }`}
            >
              All
            </button>
            {displayTags.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveFilter(activeFilter === tag ? null : tag)}
                className={`whitespace-nowrap px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter transition-colors ${
                  activeFilter === tag
                    ? 'bg-stone-800 text-white'
                    : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          
          <div className="hidden lg:flex h-10 w-10 shrink-0 bg-stone-800 rounded-full items-center justify-center text-white font-bold text-xs shadow-lg">
            RC
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full">
        {viewMode === 'GALLERY' || viewMode === 'ARCHIVE' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
             {filteredItems.length === 0 ? (
               <EmptyState 
                 activeFilter={activeFilter} 
                 searchQuery={searchQuery}
                 onClearFilter={() => {
                   setActiveFilter(null);
                   setSearchQuery('');
                 }} 
               />
             ) : (
               filteredItems.map((item, index) => {
                 // Make the first item large, then every 6th item large
                 const isFeatured = index % 5 === 0;
                 return (
                   <ItemCard 
                     key={item.id} 
                     item={item} 
                     featured={isFeatured}
                     className={isFeatured ? 'md:col-span-2 md:row-span-2' : ''} 
                     onToggleStatus={handleToggleStatus}
                   />
                 );
               })
             )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl h-[600px] flex items-center justify-center border border-stone-100 shadow-[var(--shadow-card)]">
             <div className="text-center">
                <Map className="w-12 h-12 mx-auto text-stone-300 mb-4" />
                <h3 className="text-lg font-serif">Geographic View</h3>
                <p className="text-stone-400 text-sm mt-2">Map integration placeholder. In a full implementation,<br/>this would display Server-Side geocoded locations.</p>
             </div>
          </div>
        )}
      </main>

      <footer className="h-12 flex items-center justify-between px-6 sm:px-10 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">
        <p>© 2026 CULINARY LOGIC REPOSITORY</p>
        <div className="hidden sm:flex gap-8">
          <span>Status: Synced with Bot</span>
        </div>
      </footer>
    </div>
  );
}
