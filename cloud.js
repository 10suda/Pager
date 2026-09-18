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

export function createPagerClient(options = {}) {
  if (!isCloudConfigured) return null;

  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true
    },
    ...options
  });
}
