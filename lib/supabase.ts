
import { createClient } from '@supabase/supabase-js';

// Project credentials
const SUPABASE_URL = 'https://miybenidyvvetamzaskw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qtjyFXhHbPZm23IAAEJNFg_WRvlqlyJ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
