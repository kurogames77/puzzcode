# PuzzCode Backend API

Backend API for the PuzzCode puzzle learning platform using Node.js, Express, and PostgreSQL.

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Database Setup

1. Open Navicat (or any PostgreSQL client)
2. Connect to your PostgreSQL database (localhost:5432)
3. Create a new database (optional, or use existing `postgres` database):
   ```sql
   CREATE DATABASE gamified;
   ```
4. Run the schema file:
   - In Navicat: Open `database/schema.sql` and execute it
   - Or via command line: `psql -U postgres -d gamified -f ../database/schema.sql`

### 3. Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your database credentials:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=postgres
   DB_USER=postgres
   DB_PASSWORD=your_password_here
   PORT=3001
   NODE_ENV=development
   ```

### 4. Run the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The server will run on `http://localhost:3001`

## API Endpoints

### Courses
- `GET /api/courses` - Get all courses
- `GET /api/courses/:id` - Get course by ID
- `POST /api/courses` - Create a new course
- `PUT /api/courses/:id` - Update a course
- `DELETE /api/courses/:id` - Delete a course
- `POST /api/courses/reset-student-counts` - Reset all student counts

### Lessons
- `GET /api/lessons/course/:courseId` - Get all lessons for a course
- `GET /api/lessons/:id` - Get lesson by ID
- `POST /api/lessons` - Create a new lesson (with 10 levels × 3 difficulties)
- `PUT /api/lessons/:id` - Update a lesson
- `DELETE /api/lessons/:id` - Delete a lesson

### Levels
- `GET /api/levels/:id` - Get level by ID
- `PUT /api/levels/:id` - Update level code and output

## Database Schema

- **courses**: Stores course information (Python, C++, etc.)
- **lessons**: Stores lessons within courses
- **levels**: Stores level variants (10 levels × Easy/Medium/Hard = 30 entries per lesson)

Each level can store:
- `initial_code`: The code snippet for the puzzle
- `expected_output`: The expected output when code runs correctly

