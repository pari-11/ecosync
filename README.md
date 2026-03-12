Here's your `README.md` — paste this as a new file in the root of your repo:

```md
# 🌍 EcoSync — Carbon-Aware Browser Platform

EcoSync is a carbon-aware productivity platform that monitors your browser's energy consumption in real time, tracks the carbon intensity of your local electricity grid, and helps you make greener digital choices.

---

## ✨ Features

- **📡 Dashboard** — Live grid carbon intensity (India IN-WE), traffic light status, CO₂ rate and session emissions
- **🗂️ Tab Auditor** — Classifies all open browser tabs as Heavy, Dynamic, or Static with per-tab power estimates. Auto-refreshes every 15s
- **🟢 Simulate Green Window** — Demo mode to preview how the dashboard looks on a clean grid
- **🌙 Dark Mode** — Toggle between light and dark theme, saved to localStorage
- **⬇️ Downloads Monitor** *(coming soon)* — Defer downloads to greener grid windows
- **🗓️ Eco-Scheduler** *(coming soon)* — Schedule heavy tasks to low-carbon periods

---

## 🗂️ Project Structure

```
carbon-test/
├── main.py                  # FastAPI backend
├── requirements.txt
├── README.md
└── extension/
    ├── manifest.json
    ├── background.js        # Chrome extension service worker
    ├── globe.png
    ├── icons/
    │   └── logo.png
    ├── popup/
    │   ├── index.html
    │   ├── popup.js
    │   └── popup.css
    └── website/
        ├── main.html        # EcoSync web dashboard
        └── app.js
```

---

## ⚙️ Setup & Installation

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/ecosync.git
cd ecosync
```

### 2. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 3. Start the backend
```bash
python main.py
```
Keep this terminal running. Backend runs at `http://localhost:8000`.

### 4. Load the Chrome Extension
- Open `chrome://extensions/`
- Enable **Developer Mode** (top right toggle)
- Click **Load Unpacked**
- Select the `extension/` folder

### 5. Open the website
Open `extension/website/main.html` in Chrome.

---

## 🔄 How It Works

```
Chrome Extension (background.js)
        ↓  Pushes tab + carbon data every 10s
FastAPI Backend (localhost:8000)
        ↓  Serves data via REST API
EcoSync Website (main.html)
```

The extension classifies all open tabs by energy type and pushes state to the backend. The website reads from the backend — no `chrome.runtime` dependency needed.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Extension | Chrome MV3, JavaScript |
| Backend | Python, FastAPI, uvicorn |
| Frontend | HTML, CSS, JavaScript |
| Carbon Data | Electricity Maps API |

---

## 📋 Requirements

- Python 3.8+
- Google Chrome
- Backend running at `localhost:8000`

---

## 👩‍💻 Built by

Parnika Thakur
```
