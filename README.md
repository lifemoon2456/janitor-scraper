
***

markdown
<div align="center">

# 🧹 JanitorAI Character Scraper
### Cloud-Based Mock OpenAI Server with Web Dashboard

[![Deploy to Render](https://img.shields.io/badge/Deploy-Render-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com)
[![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)

**A powerful tool to intercept, log, and extract JanitorAI character cards directly to your browser. No Cloudflare, no Termux, no local server required.**

</div>

---

## 📖 Table of Contents
1. [Overview](#-overview)
2. [Features](#-features)
3. [Prerequisites](#-prerequisites)
4. [Deployment Guide](#-deployment-guide)
5. [How to Use](#-how-to-use)
6. [Important Notes](#-important-notes)

---

## 🌟 Overview

This project sets up a mock OpenAI API server using Node.js and Express. When connected to JanitorAI as a proxy, it intercepts the chat request and extracts the hidden character definitions (Persona, Scenario, Example Dialogs, First Message). 

Unlike local setups, this is optimized for **Render.com**, meaning it runs 24/7 in the cloud and provides a built-in Web Dashboard to easily view and copy the extracted data on both PC and Mobile.

## ✨ Features

- **🌐 Cloud Hosted:** Runs entirely on Render's free tier.
- **📊 Web Dashboard:** Clean, mobile-friendly UI to view and copy logs.
- **⚡ Zero Tunneling:** Render provides a public HTTPS URL automatically—no Cloudflare needed.
- **📋 One-Click Copy:** Easily copy the Proxy URL and character data from the dashboard.
- **🤖 Auto Anonymization:** Automatically replaces your persona name with `{{user}}` in the extracted data.

---

## 📋 Prerequisites

Before you begin, ensure you have the following:
- A [GitHub](https://github.com/) account.
- A [Render](https://render.com/) account (you can sign up using your GitHub account).
- A [JanitorAI](https://janitorai.com/) account.

---

## 🚀 Deployment Guide

Follow these steps to get your server running in the cloud.

### Step 1: Upload Files to GitHub
Create a new repository on GitHub and upload the project files. Your repository structure must look exactly like this:

```text
📁 your-repository/
 ├── 📄 server.js
 ├── 📄 package.json
 ├── 📄 README.md
 └── 📁 public/
      ├── 📄 index.html
      ├── 📄 style.css
      └── 📄 app.js
```

### Step 2: Create a Web Service on Render
1. Log in to [Render](https://dashboard.render.com/) and click **New +** > **Web Service**.
2. Connect your GitHub account and select the repository you just created.
3. Fill in the deployment settings as follows:

| Setting              | Value                |
| -------------------- | -------------------- |
| **Name**             | `janitor-scraper` (or any name) |
| **Runtime**          | Node                 |
| **Build Command**    | `npm install`        |
| **Start Command**    | `npm start`          |
| **Instance Type**    | Free                 |

4. Scroll down and click **Create Web Service**.
5. Wait 1-2 minutes for the build to finish. Once it says **Live**, copy your server URL from the top left (e.g., `https://janitor-scraper.onrender.com`).

---

## ⚙️ How to Use

Now that your server is live, it's time to scrape a character.

### Step 3: Configure JanitorAI
1. Open JanitorAI and go to a **Proxy-enabled** character.
2. Start a chat, then click the top right corner ("Using Janitor" or "Using...").
3. Select **Proxy**, then select **Custom** in the model settings.
4. Enter the configuration exactly as shown below:

| Field           | Value                                          |
| --------------- | ---------------------------------------------- |
| **URL**         | `https://your-render-url.onrender.com/v1/chat/completions` |
| **Model Name**  | `mock-model-1`                                 |
| **API Key**     | `custom-key`                                   |

5. Scroll down and click **Save Settings**, then refresh the chat page.

### Step 4: Extract the Character Data
1. In the JanitorAI chat, send any message (e.g., `hi`).
2. Open a new browser tab and go to your Render URL:
   👉 `https://your-render-url.onrender.com`
3. The Web Dashboard will load. Click the **🔄 Refresh** button on the left.
4. Click the character's name from the list.
5. The full character details will appear on the right. Click the **📋 Copy** button.
6. Paste the data into SillyTavern in their respective fields. Done!

---

## ⚠️ Important Notes

> **Ephemeral Storage:** Render's free tier uses an ephemeral file system. If the server goes to sleep or restarts, **all saved logs will be deleted**. Make sure to copy your scraped data *immediately* after sending the message in JanitorAI.

> **Sleep Mode:** The free tier server will spin down after 15 minutes of inactivity. Your first message to the proxy might take 10-15 seconds to process as the server wakes up. Subsequent messages will be fast.

---

<div align="center">

**Built with ❤️ for the Roleplay Community**

*Originally based on the [SillyTavern JanitorAI Scrapper script](https://github.com/ashuotaku/sillytavern/tree/main/Scripts/JanitorAI). Modified for cloud deployment with a Front-End Dashboard.*

</div>
```
