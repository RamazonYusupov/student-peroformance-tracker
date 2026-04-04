# Student Performance Tracker

FastAPI + SQLite + React (Vite) implementation based on the provided product documentation.

## Stack
- Backend: FastAPI, SQLAlchemy, JWT auth
- Frontend: React + TypeScript + Recharts
- Database: SQLite for local development

## Features Implemented (V1 Core)
- Teacher login (single account from env)
- Dashboard summary widgets and recent activity
- Test creation and listing
- 4 question types: Multiple Choice, True/False, Short Answer, Paragraph
- Time-gated test access (before/active/expired)
- Student entry flow by full name (+ optional student ID)
- Student test session with timer and auto-submit on timeout
- Anti-cheat rules in frontend:
  - fullscreen enforcement
  - tab switch strike
  - 3-strike forced fail
  - context menu and Ctrl+C/V/A blocking
- Auto grading for MC/True-False
- Pending status for open-ended answers until manual grading
- Test results + score distribution analytics
- Student profile statistics and history

## Project Structure
- backend/: FastAPI app
- frontend/: React app

## 1) Backend Setup
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python init_db.py
uvicorn app.main:app --reload --port 8000
```

This creates a local SQLite database file at `backend\student_tracker.db`.

API docs:
- http://localhost:8000/docs

Default teacher credentials for this workspace:
- username: sanjar
- password: sanjar12345

If you replace backend/.env with your own values, use those credentials on the login page instead.

## 2) Frontend Setup
In a new terminal:

```powershell
cd frontend
npm install
npm run dev
```

Frontend URL:
- http://localhost:5173

## Main API Endpoints
- POST /api/auth/login
- GET /api/dashboard/summary
- GET|POST /api/tests
- GET|PUT|DELETE /api/tests/{test_id}
- GET /api/tests/{test_id}/results
- GET /api/tests/{test_id}/analytics
- GET /api/submissions/{submission_id}
- POST /api/submissions/{submission_id}/grade
- GET /api/students
- GET /api/students/{student_name}
- GET /api/public/tests/{test_id}/entry
- POST /api/public/tests/{test_id}/start
- POST /api/public/tests/{test_id}/submit

## Notes
- This is an MVP implementation aligned with V1 requirements from your document.
- Docker is not required for local development right now. The existing `docker-compose.yml` can be ignored unless you want to switch back to PostgreSQL later.
- Export CSV, question bank, multi-teacher, and student account auth are not included (planned in your documentation for later versions).
