/**
 * Verification Script
 * Tests database, backend, and algorithm service connections
 */

const pool = require('../db');
// Use built-in fetch (Node 18+) or require node-fetch if needed
let fetch;
try {
  fetch = globalThis.fetch || require('node-fetch');
} catch (e) {
  // Fallback for older Node versions
  fetch = (...args) => {
    throw new Error('fetch is not available. Please install node-fetch or use Node 18+');
  };
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

async function testDatabase() {
  log('\n=== Testing Database Connection ===', 'blue');
  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    log('✅ Database connected successfully', 'green');
    log(`   PostgreSQL Version: ${result.rows[0].pg_version.split(' ')[0]} ${result.rows[0].pg_version.split(' ')[1]}`, 'green');
    log(`   Current Time: ${result.rows[0].current_time}`, 'green');
    return true;
  } catch (error) {
    log(`❌ Database connection failed: ${error.message}`, 'red');
    return false;
  }
}

async function testTables() {
  log('\n=== Testing Required Tables ===', 'blue');
  const requiredTables = [
    'users',
    'student_progress',
    'puzzle_attempt',
    'levels',
    'lessons',
    'adaptive_log',
    'lesson_performance_summary',
    'difficulty_audit',
  ];

  let allExist = true;
  for (const table of requiredTables) {
    try {
      const result = await pool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [table]
      );
      if (result.rows[0].exists) {
        // Get row count
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        log(`✅ ${table} exists (${countResult.rows[0].count} rows)`, 'green');
      } else {
        log(`❌ ${table} does not exist`, 'red');
        allExist = false;
      }
    } catch (error) {
      log(`❌ Error checking ${table}: ${error.message}`, 'red');
      allExist = false;
    }
  }
  return allExist;
}

async function testIndexes() {
  log('\n=== Testing Key Indexes ===', 'blue');
  const keyIndexes = [
    'idx_puzzle_attempt_user_lesson_success_created',
    'idx_levels_lesson_level_number',
    'idx_student_progress_user_level_composite',
  ];

  let allExist = true;
  for (const index of keyIndexes) {
    try {
      const result = await pool.query(
        `SELECT EXISTS (
          SELECT FROM pg_indexes 
          WHERE indexname = $1
        )`,
        [index]
      );
      if (result.rows[0].exists) {
        log(`✅ ${index} exists`, 'green');
      } else {
        log(`⚠️  ${index} does not exist (may need to run migrations)`, 'yellow');
      }
    } catch (error) {
      log(`❌ Error checking ${index}: ${error.message}`, 'red');
    }
  }
  return allExist;
}

async function testBackendAPI() {
  log('\n=== Testing Backend API ===', 'blue');
  const port = process.env.PORT || 3001;
  const baseUrl = `http://localhost:${port}`;

  try {
    const response = await fetch(`${baseUrl}/api/health`);
    if (response.ok) {
      const data = await response.json();
      log('✅ Backend API is running', 'green');
      log(`   Health check: ${JSON.stringify(data)}`, 'green');
      return true;
    } else {
      log(`❌ Backend API returned status ${response.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Backend API not reachable: ${error.message}`, 'red');
    log(`   Make sure the server is running on port ${port}`, 'yellow');
    return false;
  }
}

async function testPythonService() {
  log('\n=== Testing Python Algorithm Service ===', 'blue');
  const baseUrl = process.env.ALGO_SERVICE_URL || 'http://127.0.0.1:5000';
  const timeout = 2000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${baseUrl}/api/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        function: 'puzzle_adjust',
        args: {
          user_id: 'test-user',
          level_id: 'test-level',
          theta: 0.5,
          beta_old: 0.5,
          success_count: 5,
          fail_count: 2,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (response.ok) {
      const data = await response.json();
      log('✅ Python algorithm service is running', 'green');
      log(`   Response: ${JSON.stringify(data).substring(0, 100)}...`, 'green');
      return true;
    } else {
      log(`⚠️  Python service returned status ${response.status}`, 'yellow');
      log('   (This is OK - fallback to child_process will be used)', 'yellow');
      return false;
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      log('⚠️  Python service timeout (will use fallback)', 'yellow');
    } else {
      log(`⚠️  Python service not reachable: ${error.message}`, 'yellow');
      log('   (This is OK - fallback to child_process will be used)', 'yellow');
    }
    return false;
  }
}

async function testTriggers() {
  log('\n=== Testing Triggers ===', 'blue');
  try {
    const result = await pool.query(
      `SELECT trigger_name, event_object_table 
       FROM information_schema.triggers 
       WHERE trigger_name LIKE '%lesson_performance%' 
       OR trigger_name LIKE '%difficulty_audit%'`
    );

    if (result.rows.length > 0) {
      log('✅ Triggers found:', 'green');
      result.rows.forEach((row) => {
        log(`   - ${row.trigger_name} on ${row.event_object_table}`, 'green');
      });
      return true;
    } else {
      log('⚠️  No triggers found (may need to run migrations)', 'yellow');
      return false;
    }
  } catch (error) {
    log(`❌ Error checking triggers: ${error.message}`, 'red');
    return false;
  }
}

async function main() {
  log('\n🔍 Starting Connection Verification...\n', 'blue');

  const results = {
    database: await testDatabase(),
    tables: await testTables(),
    indexes: await testIndexes(),
    triggers: await testTriggers(),
    backend: await testBackendAPI(),
    python: await testPythonService(),
  };

  log('\n=== Summary ===', 'blue');
  log(`Database: ${results.database ? '✅' : '❌'}`, results.database ? 'green' : 'red');
  log(`Tables: ${results.tables ? '✅' : '❌'}`, results.tables ? 'green' : 'red');
  log(`Indexes: ${results.indexes ? '✅' : '⚠️'}`, results.indexes ? 'green' : 'yellow');
  log(`Triggers: ${results.triggers ? '✅' : '⚠️'}`, results.triggers ? 'green' : 'yellow');
  log(`Backend API: ${results.backend ? '✅' : '❌'}`, results.backend ? 'green' : 'red');
  log(`Python Service: ${results.python ? '✅' : '⚠️'}`, results.python ? 'green' : 'yellow');

  const allCritical = results.database && results.tables && results.backend;
  if (allCritical) {
    log('\n✅ All critical systems are connected!', 'green');
    process.exit(0);
  } else {
    log('\n❌ Some critical systems are not connected. Please check the errors above.', 'red');
    process.exit(1);
  }
}

// Run verification
main().catch((error) => {
  log(`\n❌ Verification failed: ${error.message}`, 'red');
  process.exit(1);
});

