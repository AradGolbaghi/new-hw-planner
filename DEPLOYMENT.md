# Deployment Guide - Homework Planner

## Why Vercel Doesn't Work Well

Vercel uses **serverless functions** which are stateless:
- ❌ Sessions don't persist between requests
- ❌ File system writes don't persist (homework.json won't save)
- ❌ Each function invocation is isolated

## Recommended Hosting Providers

### 1. **Railway** ⭐ (BEST CHOICE)
- ✅ Full Node.js support with persistent storage
- ✅ Free tier: $5 credit/month
- ✅ Auto-deploys from GitHub
- ✅ Built-in environment variables
- ✅ Sessions work perfectly
- **Setup**: Connect GitHub repo, Railway auto-detects Node.js

**Website**: https://railway.app

### 2. **Render**
- ✅ Free tier available (with limitations)
- ✅ Persistent file storage
- ✅ Auto-deploys from GitHub
- ✅ Easy setup
- **Free tier**: Sleeps after 15 min inactivity

**Website**: https://render.com

### 3. **Fly.io**
- ✅ Global edge deployment
- ✅ Persistent volumes for file storage
- ✅ Good performance
- ✅ Free tier available
- **Setup**: Requires `fly.toml` config

**Website**: https://fly.io

### 4. **Heroku** (Classic)
- ✅ Reliable, well-documented
- ✅ Free tier removed, but affordable paid plans
- ✅ Add-ons for databases if needed
- **Cost**: ~$7/month for hobby dyno

**Website**: https://heroku.com

## Quick Setup for Railway (Recommended)

1. Go to https://railway.app
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your `Homework-planner` repository
5. Railway will auto-detect Node.js and deploy
6. Add environment variable if needed:
   - `SESSION_SECRET` (optional, has default)
7. Your app will be live at `your-app.railway.app`

That's it! Sessions and file storage will work perfectly.

## Quick Setup for Render

1. Go to https://render.com
2. Sign up with GitHub
3. Click "New" → "Web Service"
4. Connect your GitHub repo
5. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Environment**: Node
6. Deploy!

## Environment Variables

If you want to set a custom session secret:
- **Variable Name**: `SESSION_SECRET`
- **Value**: Any random string (e.g., `your-super-secret-key-here`)

## Testing After Deployment

1. Visit your deployed URL
2. Try logging in with:
   - Email: `example@gmail.com`
   - Password: `example`
3. Check browser console (F12) for any errors
4. Try creating homework - it should save!

