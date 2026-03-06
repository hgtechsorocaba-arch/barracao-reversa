// supabase.js

// URL inferred from the dashboard screenshot
const supabaseUrl = 'https://rdvoqaynmkwlsutsdbks.supabase.co';
// Key provided by the user
const supabaseKey = 'sb_publishable_lo4UybgUFxCbAKVbT-Pkzw_8JEipiqT';

// Check if Supabase JS SDK is loaded
if (typeof supabase === 'undefined') {
    console.error('Supabase JS library not found! Make sure to include it in the HTML before this script.');
} else {
    // Initialize the client
    window.supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
}
