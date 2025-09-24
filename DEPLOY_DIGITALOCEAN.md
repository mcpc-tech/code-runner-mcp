# 🚀 Deploy to DigitalOcean App Platform

## Quick & Simple Deployment (5 minutes)

### Step 1: Prepare Your Repository
Ensure your code is pushed to GitHub:
```bash
git add .
git commit -m "Prepare for DigitalOcean deployment"
git push origin main
```

### Step 2: Deploy via DigitalOcean Console
1. Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
2. Click **"Create App"**
3. Connect your GitHub repository: `ANC-DOMINATER/code-runner-mcp`
4. Choose branch: `main`
5. Auto-deploy on push: ✅ **Enabled**

### Step 3: Configure App Settings
**Service Configuration:**
- **Service Type**: Web Service
- **Source**: Dockerfile
- **HTTP Port**: 9000
- **Instance Size**: Basic ($5/month)
- **Instance Count**: 1

**Environment Variables:**
```
PORT=9000
DENO_PERMISSION_ARGS=--allow-net
NODEFS_ROOT=/tmp
NODEFS_MOUNT_POINT=/tmp
```

### Step 4: Deploy
Click **"Create Resources"** - Deployment will take 3-5 minutes.

## 🎯 What You Get
- ✅ **Automatic HTTPS** certificate
- ✅ **Custom domain** support (yourapp.ondigitalocean.app)
- ✅ **Auto-scaling** based on traffic
- ✅ **Health monitoring** with automatic restarts
- ✅ **Zero-downtime** deployments
- ✅ **Integrated logging** and metrics

## 💰 Cost
- **Basic Plan**: $5/month for 512MB RAM, 1 vCPU
- **Scales automatically** based on usage
- **Pay only for what you use**

## 🔗 Access Your API
Once deployed, your MCP server will be available at:
```
https://your-app-name.ondigitalocean.app
```

**MCP Inspector Connection:**
- **Transport Type**: Streamable HTTP ✅ (Recommended)
- **URL**: `https://monkfish-app-9ciwk.ondigitalocean.app/mcp`

**API Endpoints:**
- Root: `https://your-app-name.ondigitalocean.app/`
- Health: `https://your-app-name.ondigitalocean.app/health`
- Documentation: `https://your-app-name.ondigitalocean.app/docs`
- **MCP (Streamable HTTP)**: `https://your-app-name.ondigitalocean.app/mcp` ✅
- MCP Messages: `https://your-app-name.ondigitalocean.app/messages`
- ~~SSE (Deprecated)~~: `https://your-app-name.ondigitalocean.app/sse`

## 🔄 Auto-Deployment
Every push to `main` branch automatically triggers a new deployment.

## 📊 Monitor Your App
- View logs in DigitalOcean console
- Monitor performance metrics
- Set up alerts for downtime

---
**That's it! Your MCP server is live! 🎉**
