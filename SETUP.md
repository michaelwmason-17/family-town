# Putting Family Town online

Takes about 20 minutes. You'll do the clicking; Claude handles the code.

## 1. Supabase (your data, sync, photos, sign-in)

1. Go to **supabase.com/dashboard**, then **New project**.
   - Name: `Family Town`
   - Database password: click **Generate** (you won't need to remember it)
   - Region: **West US**
   - Click **Create new project** and wait a minute or two.
2. In the left menu, open **SQL Editor**, then **New query**.
3. Open `supabase/schema.sql` from this folder, copy everything, paste it in, and click **Run**. You should see "Success. No rows returned."
4. Open **Project Settings** (gear icon), then **API Keys**, then the **Legacy API keys** tab. Copy these and paste them to Claude:
   - **Project URL**, which looks like `https://abcdefgh.supabase.co` (shown under Project Settings → Data API)
   - **anon public** key (meant to be public; safe to share)
   - Keep the **service_role** key handy for step 3. It's secret: paste it only into Vercel, never into a chat or a file.

## 2. GitHub (holds the website files)

1. On **github.com**, click **+** (top right), then **New repository**.
   - Name: `family-town`
   - Choose **Private**
   - Click **Create repository**.
2. On the next page, click **uploading an existing file**.
3. Open this `Family App` folder in Finder, select everything inside it (`api`, `supabase`, `index.html`, `web.js`, `config.js`, the icons, and so on), and drag it all onto the page.
4. Click **Commit changes**.

Never upload `Family Town data (keep private).json` from your Desktop. It isn't in this folder, so you're fine.

## 3. Vercel (puts it on the web)

1. On **vercel.com**, click **Add New…**, then **Project**, then **Import** next to `family-town`.
2. Before clicking Deploy, open **Environment Variables** and add:
   - `SUPABASE_URL`: your Project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: the service_role key (for the Apple Calendar feed)
   - `ESV_API_KEY`: your key from api.esv.org (optional; add it any time)
3. Click **Deploy**. You'll get an address like `family-town.vercel.app`.
4. Back in Supabase, open **Authentication**, then **URL Configuration**, and set **Site URL** to that address, so "confirm your email" links open the right place.

## 4. On your phones

1. Open the address in **Safari**.
2. **Create an account**, confirm the email, then sign in.
3. Tap **Start our family**. You'll get a 6-letter code.
   - Moving over from the Claude app? Do this step on the Mac and choose `Family Town data (keep private).json` from your Desktop when it asks.
4. Mollie signs up on her phone and taps **Join with code**.
5. In Safari, tap **Share**, then **Add to Home Screen**. It opens like a real app.
6. In the app's Calendar tab, tap **Add to Apple Calendar** to see your events in the iPhone Calendar.

## Making changes later

Claude edits the files here. Then you upload the changed files to GitHub the same way (drag them in, then **Commit changes**), and Vercel updates the site in about a minute.
