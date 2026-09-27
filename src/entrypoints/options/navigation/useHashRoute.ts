import { useState, useEffect, useCallback } from 'react';

export interface RouteInfo {
  path: string;
  params: Record<string, string>;
}

export function parseHash(hash: string): RouteInfo {
  const cleanHash = hash.replace(/^#\/?/, '').trim();
  if (!cleanHash) {
    return { path: '/general', params: {} };
  }

  const [rawPath = '', rawQuery] = cleanHash.split('?');
  const path = '/' + rawPath.replace(/^\/+/, '');
  const params: Record<string, string> = {};

  if (rawQuery) {
    const searchParams = new URLSearchParams(rawQuery);
    searchParams.forEach((val, key) => {
      params[key] = val;
    });
  }

  return { path, params };
}

export function useHashRoute() {
  const [route, setRoute] = useState<RouteInfo>(() => {
    if (typeof window === 'undefined') {
      return { path: '/general', params: {} };
    }
    return parseHash(window.location.hash);
  });

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHash(window.location.hash));
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useCallback((target: string) => {
    let formatted = target.trim();
    if (!formatted.startsWith('/')) {
      formatted = '/' + formatted;
    }
    window.location.hash = formatted;
  }, []);

  return {
    path: route.path,
    params: route.params,
    navigate,
  };
}
