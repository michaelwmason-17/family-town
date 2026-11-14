// Family Town settings for the website version.
// The "anon" key is meant to be public: your data is protected by the sign-in and
// the privacy rules in supabase/schema.sql, not by hiding this key.
window.FT_CONFIG = {
  supabaseUrl: 'https://jndgdeiscqjymranvbat.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuZGdkZWlzY3FqeW1yYW52YmF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2MTkwNTYsImV4cCI6MjExMDE5NTA1Nn0.BaN0TnqD9DhLoblSd4bWjTQWQBLSU8QmuzP8EYnwxxg',
  // Public half of the notification key (safe to share). The private half lives only in Vercel.
  vapidPublicKey: 'BAp43c74f9Nej5TzTZmytfQ2wmnNWCt2HS4cThCgZuRNcTWmMAua9hdNQHqlH7BEQYhMIHIOULYwImUn4-Z0Qcc',
};
