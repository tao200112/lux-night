
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Try to load env from .env.local if not present (simple hack usually depends on how it's invoked)
// But relying on process.env is standard.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

// If we are strictly checking DB existence, we might need SERVICE_ROLE_KEY if RLS blocks us, 
// but asking for public tables (if policies allow) should be fine with ANON. 
// However, 'events_v2' might be admin-only. Let's try ANON first, if fail, we report "Access Denied" or "Not Found".

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Checking events_v2 table...');
  try {
    const { data, error } = await supabase.from('events_v2').select('count', { count: 'exact', head: true });
    if (error) {
      console.log('Error accessing events_v2:', error.message);
      if (error.code === '42P01') {
        console.log('Table events_v2 DOES NOT EXIST.');
      }
    } else {
      console.log('SUCCESS: events_v2 table exists.');
    }
    
    // Check ticket_types_v2
    const { error: error2 } = await supabase.from('ticket_types_v2').select('count', { count: 'exact', head: true });
    if (error2) console.log('Error accessing ticket_types_v2:', error2.message);
    else console.log('SUCCESS: ticket_types_v2 table exists.');

  } catch (err) {
    console.error('Script error:', err);
  }
}

check();
