import React, { useState, useMemo, useEffect } from 'react';
import { Map, Grid, Search, Filter, Plus, LogOut, Sparkles, Lock } from 'lucide-react';
import { mockItems, CulinaryItem } from './data/mockData';
import ItemCard from './components/ItemCard';
import EmptyState from './components/EmptyState';
import AddManualItemModal from './components/AddManualItemModal';
import AddSmartItemModal from './components/AddSmartItemModal';
import MapView from './components/MapView';
import AuthScreen from './components/AuthScreen';
import { supabase } from './lib/supabase';

type ViewMode = 'GALLERY' | 'MAP' | 'ARCHIVE';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [items, setItems] = useState<CulinaryItem[]>(supabase ? [] : mockItems);
  const [viewMode, setViewMode] = useState<ViewMode>('GALLERY');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<CulinaryItem['type'] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSmartModalOpen, setIsSmartModalOpen] = useState(false);
  const [isInitializingAuth, setIsInitializingAuth] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setIsInitializingAuth(false);
      return;
    }

    // 1. If we are the popup, we receive the token in the URL hash.
    // Send it to the parent window and close ourselves.
    if (window.opener && window.name === 'oauth_popup') {
      if (window.location.hash && window.location.hash.includes('access_token=')) {
        window.opener.postMessage({ type: 'SUPABASE_AUTH_HASH', hash: window.location.hash }, '*');
        window.close();
      }
    }

    // 2. If we are the parent window, listen for the message from the popup.
    const handleMessage = async (e: MessageEvent) => {
      if (e.data?.type === 'SUPABASE_AUTH_HASH') {
        const hash = e.data.hash;
        const params = new URLSearchParams(hash.replace('#', '?'));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          if (data.session) {
            setSession(data.session);
          }
        }
      }
    };
    window.addEventListener('message', handleMessage);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsInitializingAuth(false);
      if (session && window.opener && window.name === 'oauth_popup') {
        window.close(); // fallback close
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session && window.opener && window.name === 'oauth_popup') {
        window.close(); // fallback close
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  useEffect(() => {
    async function fetchItems() {
      if (!supabase) return;
      const { data, error } = await supabase
        .from('culinary_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching items:', error);
      } else if (data) {
        setItems(data as CulinaryItem[]);
      }
    }

    // Fetch items for everyone — public SELECT policy allows unauthenticated reads.
    // Re-fetch when session changes so the admin sees fresh data after login.
    fetchItems();
  }, [session]);

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
      setItems([]);
    }
  };

  const relevantItems = useMemo(() => {
    let result = items;
    if (viewMode === 'ARCHIVE') {
       result = result.filter(item => item.status === 'EXPERIENCED');
    }
    if (activeType) {
      result = result.filter(item => item.type === activeType);
    }
    return result;
  }, [items, viewMode, activeType]);

  const recommendedTags = useMemo(() => {
    if (!searchQuery.trim()) {
      // Top 4 most frequent tags
      const frequencies: Record<string, number> = {};
      relevantItems.forEach(item => {
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
    
    relevantItems.forEach(item => {
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
  }, [relevantItems, searchQuery]);

  const displayTags = useMemo(() => {
    const tags = new Set(recommendedTags);
    if (activeFilter) {
      tags.add(activeFilter);
    }
    return Array.from(tags).sort();
  }, [recommendedTags, activeFilter]);

  const filteredItems = useMemo(() => {
    let result = relevantItems;
    
    if (activeFilter) {
      result = result.filter(item => item.context_tags.includes(activeFilter));
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.title.toLowerCase().includes(q) || 
        item.context_tags.some(tag => tag.toLowerCase().includes(q)) ||
        item.type.toLowerCase().includes(q)
      );
    }

    return result;
  }, [activeFilter, relevantItems, searchQuery]);

  const handleToggleStatus = async (id: string) => {
    const itemToUpdate = items.find(item => item.id === id);
    if (!itemToUpdate) return;
    
    const newStatus = itemToUpdate.status === 'SAVED' ? 'EXPERIENCED' : 'SAVED';

    // Optimistic UI update
    setItems(prev => prev.map(item => 
      item.id === id 
        ? { ...item, status: newStatus }
        : item
    ));

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    if (supabase && isUuid) {
      // Database update
      const { error } = await supabase
        .from('culinary_items')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) {
        console.error('Error updating status:', error);
        // Revert on error
        setItems(prev => prev.map(item => 
          item.id === id 
            ? { ...item, status: itemToUpdate.status }
            : item
        ));
      }
    }
  };

  const handleDeleteItem = async (id: string) => {
    // Optimistic UI update
    const previousItems = [...items];
    setItems(prev => prev.filter(item => item.id !== id));

    // Simple UUID check: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    if (supabase && isUuid) {
      const { error } = await supabase
        .from('culinary_items')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting item:', error);
        // Revert on error
        setItems(previousItems);
      }
    }
  };

  const handleAdminLogin = async () => {
    if (!supabase) return;
    const appUrl = import.meta.env.VITE_APP_URL;
    let redirectUrl = appUrl ? appUrl.replace(/\/$/, '') + '/' : window.location.origin + '/';
    if (!appUrl && window.location.origin.includes('localhost')) {
      redirectUrl = 'https://ais-dev-gn6pqrdw3kgg5hn4ye6mvn-80745451536.europe-west1.run.app/';
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
    });
    if (error) { console.error(error); return; }
    if (data?.url) {
      const popup = window.open(data.url, 'oauth_popup', 'width=600,height=700');
      if (!popup) alert('Please allow popups to sign in.');
    }
  };

  if (isInitializingAuth) {
    return <div className="min-h-screen flex items-center justify-center bg-stone-50"><p className="text-stone-500 font-bold uppercase tracking-widest text-xs">Loading...</p></div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 flex flex-col lg:flex-row lg:items-center justify-between px-4 sm:px-6 lg:px-10 py-4 lg:py-0 lg:h-20 border-b border-stone-200 bg-white/90 backdrop-blur-md gap-4 lg:gap-0">
        <div className="flex items-center justify-between gap-4 w-full lg:w-auto">
            <div className="flex items-center gap-4 lg:gap-8 flex-1 lg:flex-none">
              <h1 className="font-serif text-2xl font-bold tracking-tight uppercase shrink-0">CLR<span className="text-[var(--color-accent)]">,</span></h1>
              
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

            {/* Mobile Actions */}
            <div className="lg:hidden flex items-center gap-2 shrink-0">
              {session ? (
                <>
                  <button
                    onClick={() => setIsSmartModalOpen(true)}
                    className="h-8 px-3 bg-stone-800 rounded-full flex items-center gap-1.5 justify-center text-white shadow-lg hover:bg-stone-700 transition-colors text-[10px] font-bold uppercase"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-300" />
                    <span className="hidden sm:inline">Smart Add</span>
                  </button>
                  <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="h-8 w-8 bg-[var(--color-accent)] rounded-full flex items-center justify-center text-white shadow-lg hover:bg-[var(--color-accent-hover)] transition-colors"
                    aria-label="Add Item"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button onClick={handleLogout} className="h-8 w-8 bg-stone-800 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-lg">
                    <LogOut className="w-3 h-3" />
                  </button>
                </>
              ) : (
                supabase && (
                  <button onClick={handleAdminLogin} title="Admin Login" className="h-8 w-8 bg-stone-200 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-300 transition-colors">
                    <Lock className="w-3.5 h-3.5" />
                  </button>
                )
              )}
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
                setActiveFilter(null);
              }}
              className={`whitespace-nowrap px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter transition-colors ${
                activeFilter === null
                  ? 'bg-stone-800 text-white'
                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
              }`}
            >
              All Tags
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
          
          <div className="hidden lg:flex items-center gap-3">
            {session ? (
              <>
                <button
                  onClick={() => setIsSmartModalOpen(true)}
                  className="flex items-center gap-2 px-4 h-10 bg-stone-800 text-white text-xs font-bold uppercase tracking-widest rounded-full shadow-lg hover:bg-stone-700 hover:opacity-90 transition-all shrink-0"
                >
                  <Sparkles className="w-4 h-4 text-blue-300" />
                  Smart Add
                </button>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex items-center gap-2 w-10 justify-center h-10 bg-[var(--color-accent)] text-white text-xs font-bold uppercase tracking-widest rounded-full shadow-lg hover:bg-[var(--color-accent-hover)] hover:opacity-90 transition-all shrink-0"
                  title="Add Manual"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button onClick={handleLogout} className="h-10 w-10 shrink-0 bg-stone-800 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-stone-700 transition">
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              supabase && (
                <button
                  onClick={handleAdminLogin}
                  title="Admin Login"
                  className="h-10 px-4 shrink-0 bg-stone-100 border border-stone-200 rounded-full flex items-center gap-2 text-stone-500 text-xs font-bold uppercase tracking-widest hover:bg-stone-200 transition"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Admin
                </button>
              )
            )}
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
                     onToggleStatus={session ? handleToggleStatus : undefined}
                     onDelete={session ? handleDeleteItem : undefined}
                   />
                 );
               })
             )}
          </div>
        ) : (
          <MapView items={filteredItems} onToggleStatus={session ? handleToggleStatus : undefined} onDelete={session ? handleDeleteItem : undefined} />
        )}
      </main>

      <footer className="h-12 flex items-center justify-between px-6 sm:px-10 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">
        <p>© 2026 CULINARY LOGIC REPOSITORY</p>
        <div className="hidden sm:flex gap-8">
          <span>Status: Synced with Bot</span>
        </div>
      </footer>

      <AddManualItemModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onItemAdded={(newItem) => setItems(prev => [newItem, ...prev])}
      />
      <AddSmartItemModal
        isOpen={isSmartModalOpen}
        onClose={() => setIsSmartModalOpen(false)}
        onItemAdded={(newItem) => setItems(prev => [newItem, ...prev])}
      />
    </div>
  );
}
