/**
 * Hook for reading/writing user config from chrome.storage.
 * Falls back to defaults when not in extension context.
 */

import { useState, useEffect, useCallback } from 'react';
import type { UserConfig, Threshold, FilterAction } from '@guardianstream/types';
import { DEFAULT_CONFIG } from '@guardianstream/types';
import { mergeConfig } from '../../shared/config.js';

export function useConfig() {
  const [config, setConfigState] = useState<UserConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome?.storage) {
      chrome.storage.local.get('config', (result) => {
        if (result.config) setConfigState(mergeConfig(result.config));
        setLoading(false);
      });
      // A correction made on the player (or from the Just muted list) writes
      // the config from the content script; show it here at once
      const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === 'local' && changes.config?.newValue) setConfigState(mergeConfig(changes.config.newValue as Partial<UserConfig>));
      };
      chrome.storage.onChanged.addListener(onChanged);
      return () => chrome.storage.onChanged.removeListener(onChanged);
    } else {
      setLoading(false);
    }
  }, []);

  const saveConfig = useCallback((newConfig: UserConfig) => {
    setConfigState(newConfig);
    if (typeof chrome !== 'undefined' && chrome?.storage) {
      chrome.storage.local.set({ config: newConfig });
    }
  }, []);

  const setCategoryThreshold = useCallback(
    (categoryId: string, threshold: Threshold) => {
      const newConfig = { ...config };
      const existing = newConfig.categories[categoryId];
      newConfig.categories = {
        ...newConfig.categories,
        [categoryId]: {
          threshold,
          action: existing?.action ?? 'mute',
        },
      };
      saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const setCategoryAction = useCallback(
    (categoryId: string, action: FilterAction) => {
      const newConfig = { ...config };
      const existing = newConfig.categories[categoryId];
      newConfig.categories = {
        ...newConfig.categories,
        [categoryId]: {
          threshold: existing?.threshold ?? 2,
          action,
        },
      };
      saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const setActivePack = useCallback(
    (packId: string | null) => {
      saveConfig({ ...config, activePack: packId });
    },
    [config, saveConfig],
  );

  return {
    config,
    loading,
    saveConfig,
    setCategoryThreshold,
    setCategoryAction,
    setActivePack,
  };
}
