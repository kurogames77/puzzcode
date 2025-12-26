/**
 * Test Puzzle Attempt Flow
 * Tests the complete puzzle attempt flow with all new features
 */

const pool = require('../db');
// Use built-in fetch (Node 18+) or require node-fetch if needed
let fetch;
try {
  fetch = globalThis.fetch;
} catch (e) {
  try {
    fetch = require('node-fetch');
  } catch (e2) {
    fetch = (...args) => {
      throw new Error('fetch is not available. Please install node-fetch or use Node 18+');
    };
  }
}

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

const PORT = process.env.PORT || 3001;
const BASE_URL = `http://localhost:${PORT}`;

async function getAuthToken() {
  log('\n=== Getting Auth Token ===', 'blue');
  
  // First, check if we have a test user
  const userResult = await pool.query(
    "SELECT id, username FROM users WHERE username = 'testuser' LIMIT 1"
  );
  
  if (userResult.rows.length === 0) {
    log('⚠️  No test user found. Creating one...', 'yellow');
    // Create a test user (you'll need to adjust this based on your auth setup)
    log('   Please create a test user manually or login first', 'yellow');
    return null;
  }
  
  // Try to login (adjust endpoint based on your auth setup)
  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'testuser',
        password: 'testpass', // Adjust as needed
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      log('✅ Auth token obtained', 'green');
      return data.token || data.accessToken;
    }
  } catch (error) {
    log(`⚠️  Could not get auth token: ${error.message}`, 'yellow');
    log('   You may need to login manually and provide a token', 'yellow');
  }
  
  return null;
}

async function testPuzzleAttempt(token) {
  log('\n=== Testing Puzzle Attempt Endpoint ===', 'blue');
  
  // Get a real level from database
  const levelResult = await pool.query(
    `SELECT l.id, l.lesson_id, l.difficulty, l.level_number, l.beta
     FROM levels l
     JOIN lessons le ON l.lesson_id = le.id
     LIMIT 1`
  );
  
  if (levelResult.rows.length === 0) {
    log('❌ No levels found in database', 'red');
    return false;
  }
  
  const level = levelResult.rows[0];
  log(`   Using level: ${level.id} (${level.difficulty}, level ${level.level_number})`, 'blue');
  
  // Test payload
  const attemptPayload = {
    levelId: level.id,
    lessonId: level.lesson_id,
    success: true,
    attemptTime: 45,
    attemptId: `test-${Date.now()}`, // Unique idempotency key
  };
  
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    log('   Sending puzzle attempt...', 'blue');
    const response = await fetch(`${BASE_URL}/api/puzzle/attempt`, {
      method: 'POST',
      headers,
      body: JSON.stringify(attemptPayload),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      log('✅ Puzzle attempt successful!', 'green');
      log(`   New difficulty: ${data.result.newDifficulty}`, 'green');
      log(`   Difficulty switched: ${data.result.difficultySwitched}`, 'green');
      log(`   New beta: ${data.result.newBeta}`, 'green');
      return true;
    } else {
      log(`❌ Puzzle attempt failed: ${data.error || JSON.stringify(data)}`, 'red');
      if (response.status === 401) {
        log('   Authentication required - token may be missing or invalid', 'yellow');
      }
      return false;
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    return false;
  }
}

async function verifySummaryTable() {
  log('\n=== Verifying Summary Table ===', 'blue');
  
  try {
    const result = await pool.query(
      `SELECT user_id, lesson_id, 
              jsonb_array_length(recent_attempts) as attempt_count,
              total_recent_successes,
              total_recent_attempts,
              updated_at
       FROM lesson_performance_summary
       ORDER BY updated_at DESC
       LIMIT 5`
    );
    
    if (result.rows.length > 0) {
      log('✅ Summary table has data:', 'green');
      result.rows.forEach((row, idx) => {
        log(`   ${idx + 1}. User ${row.user_id.substring(0, 8)}... Lesson ${row.lesson_id.substring(0, 8)}...`, 'green');
        log(`      Attempts: ${row.attempt_count}, Successes: ${row.total_recent_successes}/${row.total_recent_attempts}`, 'green');
      });
      return true;
    } else {
      log('⚠️  Summary table is empty (trigger may need to fire)', 'yellow');
      log('   This is OK if no attempts were made after migration', 'yellow');
      return true; // Not a failure, just no data yet
    }
  } catch (error) {
    log(`❌ Error checking summary: ${error.message}`, 'red');
    return false;
  }
}

async function verifyAuditTable() {
  log('\n=== Verifying Audit Table ===', 'blue');
  
  try {
    const result = await pool.query(
      `SELECT user_id, level_id, 
              old_difficulty, new_difficulty,
              rule_applied, rule_applied_flag,
              created_at
       FROM difficulty_audit
       ORDER BY created_at DESC
       LIMIT 5`
    );
    
    if (result.rows.length > 0) {
      log('✅ Audit table has data:', 'green');
      result.rows.forEach((row, idx) => {
        log(`   ${idx + 1}. ${row.old_difficulty} → ${row.new_difficulty}`, 'green');
        log(`      Rule: ${row.rule_applied || 'none'} (applied: ${row.rule_applied_flag})`, 'green');
      });
      return true;
    } else {
      log('⚠️  Audit table is empty (no difficulty changes logged yet)', 'yellow');
      log('   This is OK - audit only logs when difficulty actually changes', 'yellow');
      return true; // Not a failure
    }
  } catch (error) {
    log(`❌ Error checking audit: ${error.message}`, 'red');
    return false;
  }
}

async function backfillSummaryTable() {
  log('\n=== Backfilling Summary Table ===', 'blue');
  log('   Rebuilding summaries from existing puzzle_attempt...', 'blue');
  
  try {
    // Get unique user/lesson combinations
    const combinations = await pool.query(
      `SELECT DISTINCT user_id, lesson_id 
       FROM puzzle_attempt 
       WHERE lesson_id IS NOT NULL
       LIMIT 10`
    );
    
    if (combinations.rows.length === 0) {
      log('⚠️  No user/lesson combinations found', 'yellow');
      return true;
    }
    
    log(`   Found ${combinations.rows.length} user/lesson combinations`, 'blue');
    
    for (const combo of combinations.rows) {
      try {
        await pool.query(
          `SELECT rebuild_lesson_performance_summary($1, $2)`,
          [combo.user_id, combo.lesson_id]
        );
        log(`   ✅ Rebuilt summary for user ${combo.user_id.substring(0, 8)}... lesson ${combo.lesson_id.substring(0, 8)}...`, 'green');
      } catch (error) {
        log(`   ⚠️  Error rebuilding ${combo.user_id}: ${error.message}`, 'yellow');
      }
    }
    
    return true;
  } catch (error) {
    log(`❌ Error backfilling: ${error.message}`, 'red');
    return false;
  }
}

async function main() {
  log('\n🧪 Testing Puzzle Flow...\n', 'blue');
  
  // Step 1: Backfill summary table from existing data
  await backfillSummaryTable();
  
  // Step 2: Verify tables have data
  await verifySummaryTable();
  await verifyAuditTable();
  
  // Step 3: Test puzzle attempt (if we have auth)
  const token = await getAuthToken();
  if (token) {
    await testPuzzleAttempt(token);
    // Re-check tables after attempt
    await verifySummaryTable();
    await verifyAuditTable();
  } else {
    log('\n⚠️  Skipping puzzle attempt test (no auth token)', 'yellow');
    log('   To test the endpoint manually:', 'yellow');
    log('   1. Login via POST /api/auth/login', 'yellow');
    log('   2. Use the token in Authorization header', 'yellow');
    log('   3. POST /api/puzzle/attempt with levelId, success, attemptTime', 'yellow');
  }
  
  log('\n✅ Testing complete!', 'green');
  log('\nNext steps:', 'blue');
  log('1. Test the puzzle endpoint manually with a real user', 'blue');
  log('2. Check lesson_performance_summary table after attempts', 'blue');
  log('3. Check difficulty_audit table when difficulty changes', 'blue');
  log('4. Monitor logs for structured logging output', 'blue');
}

main().catch((error) => {
  log(`\n❌ Test failed: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

