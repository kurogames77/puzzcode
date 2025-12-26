# Database Migrations

This directory contains PostgreSQL migrations for the gamified learning platform.

## Migration Order

Run migrations in the following order:

1. **Base Schema** (if starting fresh):
   - `schema.sql` - Core tables (courses, lessons, levels)

2. **User Tables**:
   - `create_user_tables.sql` - Users, student_progress, puzzle_attempts, etc.

3. **Additional Features**:
   - `add_lesson_difficulty.sql` - Lesson difficulty column
   - `add_beta_to_levels.sql` - Beta values for levels
   - `add_preferred_difficulty.sql` - Preferred difficulty tracking
   - `create_adaptive_log.sql` - Adaptive algorithm logging

4. **Performance & Quality Improvements** (NEW):
   - `add_performance_indexes.sql` - Composite indexes for query optimization
   - `create_lesson_performance_summary.sql` - Rolling summary table with triggers
   - `add_constraints_and_fks.sql` - Foreign keys and CHECK constraints
   - `create_difficulty_audit.sql` - Append-only audit table for difficulty changes
   - `improve_data_quality.sql` - NOT NULL constraints, defaults, generated columns
   - `add_partitioning_and_retention.sql` - Partitioning strategy and retention policy

## Key Features

### Indexes
- Composite indexes on `puzzle_attempts` for efficient "recent successes per lesson" queries
- Indexes on `levels` for fast lesson/level number lookups
- Optimized indexes for `student_progress` and `adaptive_log`

### Lesson Performance Summary
- Automatic trigger updates when puzzle attempts are inserted
- Stores last 50 attempts per user per lesson in JSONB
- Speeds up 5/8-level checks without heavy queries
- Use `rebuild_lesson_performance_summary(user_id, lesson_id)` for maintenance

### Constraints & Foreign Keys
- All foreign keys properly defined with CASCADE/SET NULL
- CHECK constraints for difficulty labels (Easy, Medium, Hard)
- Range checks for beta (0.1-1.0) and theta (-3.0 to 3.0)
- Data consistency checks (e.g., total_attempts >= success_count + fail_count)

### Difficulty Audit
- Append-only table tracking all difficulty changes
- Records rule applications, thresholds triggered, old/new beta
- Use `log_difficulty_change()` function from application code
- Prevents updates/deletes via triggers

### Data Quality
- NOT NULL constraints where appropriate
- Default values for critical fields
- Generated column `difficulty_band` from beta value
- `attempt_id` column for idempotency (unique per user)

### Partitioning (Optional)
- Monthly range partitioning for `puzzle_attempts` by `created_at`
- Retention policy to archive old partitions
- Maintenance functions for automatic partition creation
- **Note**: Requires data migration if table already exists

## Usage Examples

### Query Recent Successes (using summary table)
```sql
SELECT recent_attempts 
FROM lesson_performance_summary 
WHERE user_id = $1 AND lesson_id = $2;
```

### Log Difficulty Change
```sql
SELECT log_difficulty_change(
    p_user_id := $1,
    p_level_id := $2,
    p_lesson_id := $3,
    p_old_beta := 0.5,
    p_new_beta := 0.7,
    p_old_difficulty := 'Medium',
    p_new_difficulty := 'Hard',
    p_rule_applied := 'intermediate_medium_run_promotion',
    p_rule_applied_flag := true,
    p_algorithm_beta := 0.6
);
```

### Maintain Partitions
```sql
-- Create partitions for next 3 months
SELECT setup_puzzle_attempts_partitions(3);

-- Monthly maintenance (call via cron)
SELECT maintain_puzzle_attempts_partitions();

-- Archive old partitions (keep 12 months)
SELECT * FROM archive_old_puzzle_attempts(12);
```

## Running Migrations

### Using psql
```bash
psql -U postgres -d gamified -f database/migrations/add_performance_indexes.sql
```

### Using Node.js (if you have a migration runner)
```javascript
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ /* config */ });

async function runMigration(file) {
  const sql = fs.readFileSync(file, 'utf8');
  await pool.query(sql);
}
```

## Notes

- **Concurrency**: The application code already uses `SELECT ... FOR UPDATE` on `student_progress` rows. This is handled in `backend/routes/puzzle.js`.

- **Partitioning**: If `puzzle_attempts` already has data, you'll need to:
  1. Create new partitioned table
  2. Migrate existing data
  3. Swap tables
  4. Update application

- **Performance**: The summary table and indexes significantly improve query performance for rule evaluation. Monitor query times and adjust indexes as needed.

- **Audit**: The `difficulty_audit` table is separate from `adaptive_log`. Use `adaptive_log` for algorithm tracking and `difficulty_audit` for focused rule/change auditing.

