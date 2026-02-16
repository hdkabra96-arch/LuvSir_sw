
import { createClient } from '@supabase/supabase-js';

// Project credentials
const SUPABASE_URL = 'https://miybenidyvvetamzaskw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qtjyFXhHbPZm23IAAEJNFg_WRvlqlyJ';

// Safe initialization to prevent app crash if keys are invalid
let client;

try {
    client = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (error) {
    console.error("Supabase Client Init Failed:", error);
    // Return a dummy client that logs errors instead of crashing
    client = {
        from: () => ({
            select: () => Promise.resolve({ data: null, error: { message: "Database connection failed" } }),
            insert: () => Promise.resolve({ data: null, error: { message: "Database connection failed" } }),
            update: () => Promise.resolve({ data: null, error: { message: "Database connection failed" } }),
            delete: () => Promise.resolve({ data: null, error: { message: "Database connection failed" } }),
            upsert: () => Promise.resolve({ data: null, error: { message: "Database connection failed" } }),
        })
    } as any;
}

export const supabase = client;
