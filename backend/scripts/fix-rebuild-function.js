/**
 * Fix rebuild_lesson_performance_summary function
 * Updates the function to fix the SQL error
 */

const pool = require('../db');
const fs = require('fs');
const path = require('path');

const SQL = `
CREATE OR REPLACE FUNCTION rebuild_lesson_performance_summary(
    p_user_id UUID,
    p_lesson_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_attempts JSONB;
    v_total_successes INTEGER;
    v_total_attempts INTEGER;
    v_last_success_at TIMESTAMP WITH TIME ZONE;
    v_last_attempt_at TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get last 50 attempts for this user/lesson
    SELECT 
        jsonb_agg(
            jsonb_build_object(
                'level_id', attempt_data.level_id,
                'level_number', attempt_data.level_number,
                'difficulty', attempt_data.difficulty,
                'success', attempt_data.success,
                'attempt_time', attempt_data.attempt_time,
                'created_at', attempt_data.created_at
            ) ORDER BY attempt_data.created_at DESC
        ),
        COUNT(*) FILTER (WHERE attempt_data.success),
        COUNT(*),
        MAX(attempt_data.created_at) FILTER (WHERE attempt_data.success),
        MAX(attempt_data.created_at)
    INTO v_attempts, v_total_successes, v_total_attempts, v_last_success_at, v_last_attempt_at
    FROM (
        SELECT 
            pa.level_id,
            l.level_number,
            l.difficulty,
            pa.success,
            pa.attempt_time,
            pa.created_at
        FROM puzzle_attempt pa
        JOIN levels l ON pa.level_id = l.id
        WHERE pa.user_id = p_user_id 
          AND pa.lesson_id = p_lesson_id
        ORDER BY pa.created_at DESC
        LIMIT 50
    ) attempt_data;
    
    -- Update or insert summary
    INSERT INTO lesson_performance_summary (
        user_id,
        lesson_id,
        recent_attempts,
        total_recent_successes,
        total_recent_attempts,
        last_success_at,
        last_attempt_at,
        updated_at
    )
    VALUES (
        p_user_id,
        p_lesson_id,
        COALESCE(v_attempts, '[]'::jsonb),
        COALESCE(v_total_successes, 0),
        COALESCE(v_total_attempts, 0),
        v_last_success_at,
        v_last_attempt_at,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id, lesson_id) DO UPDATE SET
        recent_attempts = COALESCE(v_attempts, '[]'::jsonb),
        total_recent_successes = COALESCE(v_total_successes, 0),
        total_recent_attempts = COALESCE(v_total_attempts, 0),
        last_success_at = v_last_success_at,
        last_attempt_at = v_last_attempt_at,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;
`;

async function main() {
  console.log('🔧 Fixing rebuild_lesson_performance_summary function...\n');
  
  try {
    await pool.query(SQL);
    console.log('✅ Function updated successfully!\n');
    
    // Now test it by rebuilding one summary
    console.log('🧪 Testing the function...\n');
    const testResult = await pool.query(
      `SELECT DISTINCT user_id, lesson_id 
       FROM puzzle_attempt 
       WHERE lesson_id IS NOT NULL
       LIMIT 1`
    );
    
    if (testResult.rows.length > 0) {
      const { user_id, lesson_id } = testResult.rows[0];
      console.log(`   Rebuilding summary for user ${user_id.substring(0, 8)}... lesson ${lesson_id.substring(0, 8)}...`);
      
      await pool.query(
        'SELECT rebuild_lesson_performance_summary($1, $2)',
        [user_id, lesson_id]
      );
      
      console.log('✅ Function works correctly!\n');
    }
    
    console.log('✅ All done! You can now run: npm run test-flow');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main().finally(() => {
  pool.end();
});

