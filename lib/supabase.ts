
import { createClient } from '@supabase/supabase-js';

// Project credentials
const SUPABASE_URL = 'https://miybenidyvvetamzaskw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qtjyFXhHbPZm23IAAEJNFg_WRvlqlyJ';

let client;

try {
    // Basic validation to ensure we don't crash on invalid URLs
    if (!SUPABASE_URL || !SUPABASE_URL.startsWith('http')) {
        throw new Error("Invalid URL");
    }
    client = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (error) {
    console.warn("Supabase Client Init Skipped (Offline Mode Active)");
    // Return a dummy client that forces the App to use LocalStorage
    client = {
        from: () => ({
            select: () => Promise.resolve({ data: null, error: { message: "Offline Mode" } }),
            insert: () => Promise.resolve({ data: null, error: { message: "Offline Mode" } }),
            update: () => Promise.resolve({ data: null, error: { message: "Offline Mode" } }),
            delete: () => Promise.resolve({ data: null, error: { message: "Offline Mode" } }),
            upsert: () => Promise.resolve({ data: null, error: { message: "Offline Mode" } }),
        })
    } as any;
}

export const supabase = client;
