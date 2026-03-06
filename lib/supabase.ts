
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
    // Uses a chainable proxy so .order(), .eq(), .select() etc. don't crash
    const offlineResult = { data: null, error: { message: "Offline Mode" } };
    const createChainable = (): any => {
        const handler: ProxyHandler<any> = {
            get(_target, prop) {
                if (prop === 'then') return undefined; // makes it non-thenable until awaited
                return (..._args: any[]) => {
                    const next = new Promise<any>((resolve) => resolve(offlineResult));
                    return new Proxy(next, handler);
                };
            }
        };
        return new Proxy({}, handler);
    };
    client = {
        from: () => createChainable()
    } as any;
}

export const supabase = client;
