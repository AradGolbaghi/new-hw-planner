# Deploy to Render - Step by Step Guide

## ✅ Your App is Ready!

Your app is already configured for Render. Just follow these steps:

## Step 1: Push to GitHub

Make sure all your changes are committed and pushed:

```bash
git add .
git commit -m "Ready for Render deployment"
git push origin main
```

## Step 2: Sign Up for Render

1. Go to https://render.com
2. Click **"Get Started for Free"**
3. Sign up with your **GitHub account** (easiest way)

## Step 3: Create New Web Service

1. Once logged in, click **"New +"** in the top right
2. Select **"Web Service"**
3. Connect your GitHub account if prompted
4. Find and select your **Homework-planner** repository
5. Click **"Connect"**

## Step 4: Configure Your Service

Render will auto-detect most settings, but verify these:

### Basic Settings:
- **Name**: `homework-planner` (or any name you want)
- **Environment**: `Node`
- **Region**: Choose closest to you (e.g., `Oregon (US West)`)

### Build & Deploy:
- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- **Plan**: **Free** (sleeps after 15 min of inactivity, wakes up on first request)

### Environment Variables (Optional):
- Click **"Advanced"** → **"Add Environment Variable"**
- **Key**: `SESSION_SECRET`
- **Value**: Any random string (e.g., `my-super-secret-key-12345`)
  - If you don't add this, it will use the default

## Step 5: Deploy!

1. Click **"Create Web Service"** at the bottom
2. Wait 2-3 minutes for the build to complete
3. Your app will be live at: `https://homework-planner.onrender.com` (or your custom name)

## Step 6: Test Your App

1. Visit your Render URL
2. Try logging in:
   - Email: `example@gmail.com`
   - Password: `example`
3. Try creating homework - it should save!
4. Check the logs in Render dashboard if anything doesn't work

## ⚠️ Important Notes:

### Free Tier Limitations:
- **Sleeps after 15 minutes** of inactivity
- **Wakes up automatically** when someone visits (takes 30-50 seconds)
- Perfect for small projects and testing!

### Upgrading (Optional):
- Paid plans start at $7/month
- No sleep times
- Faster response times

## Troubleshooting:

### If login doesn't work:
1. Go to Render dashboard → Your service → **"Logs"** tab
2. Check for any errors
3. Make sure `SESSION_SECRET` is set (or use default)

### If homework doesn't save:
1. Check Render logs for file write errors
2. Make sure the service has write permissions (should work on free tier)

### If the app crashes:
1. Check logs in Render dashboard
2. Make sure `node server.js` is the start command
3. Check that PORT environment variable is set (Render sets this automatically)

## Need Help?

- Render Docs: https://render.com/docs
- Render Support: https://render.com/contact

Your app should work perfectly on Render! 🚀

