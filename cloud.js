import { createClient } from "@supabase/supabase-js";

// These compile-time constants are replaced by scripts/build.mjs. Keeping the
// configuration outside the source prevents accidental credential commits and
// lets the same code produce development and production builds.
const config = Object.freeze({
  environment: __PAGER_ENV__,
  supabaseUrl: __PAGER_SUPABASE_URL__,
  supabasePublishableKey: __PAGER_SUPABASE_PUBLISHABLE_KEY__
});

export const isCloudConfigured = Boolean(
  config.supabaseUrl && config.supabasePublishableKey
);

export function getCloudConfig() {
  return config;
}

export function createChromeStorageAdapter(storageArea = globalThis.chrome?.storage?.local) {
  if (!storageArea) return null;

  return {
    async getItem(key) {
      const result = await storageArea.get(key);
      return result[key] ?? null;
    },
    async setItem(key, value) {
      await storageArea.set({ [key]: value });
    },
    async removeItem(key) {
      await storageArea.remove(key);
    }
  };
}

export function createPagerClient(options = {}) {
  if (!isCloudConfigured) return null;

  const storage = createChromeStorageAdapter();

  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    ...options,
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
      ...(storage ? { storage } : {}),
      ...options.auth
    }
  });
}
