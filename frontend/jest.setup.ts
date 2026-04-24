import "@testing-library/jest-dom";

// Vite env vars (transformer converts import.meta.env.* → process.env.*)
process.env.VITE_API_URL = process.env.VITE_API_URL ?? "http://localhost:8080";
process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://example-project.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "test-anon-key";
