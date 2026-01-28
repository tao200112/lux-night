
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('events_v2').select('count', { count: 'exact', head: true });
  if (error) {
    console.log('Error accessing events_v2:', error.message);
  } else {
    console.log('Successfully accessed events_v2. Count:', data);
  }
}

check();
