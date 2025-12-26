Algorithm Tester
================

Testing interface for Python algorithms (Puzzle_Based, Multiplayer_Based, IRT, DDA).

## Quick Start

1. Install dependencies:
   ```bash
   cd Tester
   pip install -r requirements.txt
   ```

2. Start the backend (Terminal 1):
   ```bash
   python backend.py
   ```
   Runs on http://localhost:5000

3. Start the front-end server (Terminal 2):
   ```bash
   python -m http.server 8000
   ```
   Or use the batch file: `start_servers.bat`

4. Open http://localhost:8000 in your browser

## Features

- Test Puzzle_Based.py - Adaptive puzzle difficulty adjustment
- Test Multiplayer_Based.py - Matchmaking with K-Means clustering
- Test IRT_Algo.py - Item Response Theory algorithms
- Test DDA_Algo.py - Dynamic Difficulty Adjustment

## Usage

1. Select an algorithm from the dropdown
2. Choose a dataset or modify the JSON arguments
3. Click "Run ▶" to test
4. View results in the output panel

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/puzzle/adjust` - Puzzle-based adjustment
- `POST /api/multiplayer/match` - Multiplayer matchmaking
- `POST /api/irt/compute` - Full IRT computation
- `POST /api/dda/adjust` - DDA difficulty adjustment


