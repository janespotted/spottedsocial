import { useState, useEffect, useCallback } from 'react';

const CACHE_KEYS = {
  POSTS: 'offline_cache_posts',
  FRIENDS: 'offline_cache_friends',
};

const CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

function setCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.warn('Failed to cache data:', error);
  }
}

function getCache<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    
    const entry: CacheEntry<T> = JSON.parse(item);
    
    if (Date.now() - entry.timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(key);
      return null;
    }
    
    return entry.data;
  } catch (error) {
    console.warn('Failed to read cache:', error);
    return null;
  }
}

export function useOfflineCache() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const cachePosts = useCallback(<T>(posts: T) => {
    setCache(CACHE_KEYS.POSTS, posts);
  }, []);

  const getCachedPosts = useCallback(<T>(): T | null => {
    return getCache<T>(CACHE_KEYS.POSTS);
  }, []);

  const cacheFriends = useCallback(<T>(friends: T) => {
    setCache(CACHE_KEYS.FRIENDS, friends);
  }, []);

  const getCachedFriends = useCallback(<T>(): T | null => {
    return getCache<T>(CACHE_KEYS.FRIENDS);
  }, []);

  return {
    isOnline,
    cachePosts,
    getCachedPosts,
    cacheFriends,
    getCachedFriends,
  };
}
