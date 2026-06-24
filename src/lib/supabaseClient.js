import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://oozopadfrupwujsagagn.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vem9wYWRmcnVwd3Vqc2FnYWduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNDg1NjQsImV4cCI6MjA5NzgyNDU2NH0.w0Jny1rCazR4i89zqcarTp9R1VQNkfyyr5gvD5l-6s0";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);