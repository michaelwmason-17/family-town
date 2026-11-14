# Status (2026-11-14, v13)
Live on the website and the Claude artifact. The notifications table is created in Supabase.

## To turn on phone notifications (one time)
1. In Vercel: Settings, then Environment Variables. Add the two values from the file on your Desktop
   called "Family Town notification keys (keep private).txt" (VAPID_PRIVATE_KEY and CRON_SECRET).
   Then Deployments, then the top one, then the ... menu, then Redeploy.
2. On each iPhone: open the site in Safari, then Share, then Add to Home Screen.
3. Open Family Town from the Home Screen, then the gear, then Notifications, then "Turn on notifications".

## Optional
- (Later, if wanted) A smarter AI Chef: it's built but switched off (CHEF_AI in index.html). It would need an Anthropic API key in Vercel as ANTHROPIC_API_KEY.
- Bible reading: add ESV_API_KEY in Vercel, then redeploy.
- Once Mollie has signed in: Supabase, then Authentication, then turn off "Allow new users to sign up".
