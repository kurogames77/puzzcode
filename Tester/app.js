/* Algorithm Testing Front-end - Calls Python Backend API */

const API_BASE = 'http://localhost:5000/api';

const $ = (id) => document.getElementById(id);

// Algorithm endpoint configurations
const ALGORITHMS = {
  'puzzle_adjust': {
    name: 'Puzzle Based Adjustment (Optimized)',
    endpoint: '/puzzle/adjust',
    defaultArgs: {
      player_name: 'Player',
      theta: 0.5,
      beta_old: 0.5,
      rank_name: 'novice',
      completed_achievements: 5,
      success_count: 10,
      fail_count: 3,
      target_performance: 0.7,
      adjustment_rate: 0.1,
      auto_sync: true
    },
    description: 'OPTIMIZED: Puzzle_Based.py combines IRT_Algo.py (Item Response Theory) + DDA_Algo.py (Dynamic Difficulty Adjustment) for adaptive puzzle difficulty. Supports single student and batch processing (multiple students playing simultaneously). Features caching, reduced redundant calculations, and 2-5x faster performance. Use sample dataset for 500 students.'
  },
  'multiplayer_match': {
    name: 'Multiplayer Matchmaking',
    endpoint: '/multiplayer/match',
    defaultArgs: {
      match_size: 5,
      allow_cross_cluster: true,
      min_match_score: 0.5,
      players: [
        {
          user_id: 'player1',
          theta: 0.5,
          beta: 0.5,
          success_count: 10,
          fail_count: 5,
          rank_name: 'bronze_coder',
          completed_achievements: 5
        },
        {
          user_id: 'player2',
          theta: 0.6,
          beta: 0.4,
          success_count: 15,
          fail_count: 3,
          rank_name: 'silver_coder',
          completed_achievements: 8
        },
        {
          user_id: 'player3',
          theta: 0.4,
          beta: 0.6,
          success_count: 8,
          fail_count: 7,
          rank_name: 'bronze_coder',
          completed_achievements: 3
        }
      ]
    },
    description: 'OPTIMIZED: Multiplayer_Based.py combines KMeans_Cluster.py (K-Means Clustering) + SkillBasedMatchMaking.py (Skill-Based Matchmaking) for intelligent player pairing. Uses IRT skill assessment for fair pairing within and across skill clusters. Features batch processing, caching, and optimized matching algorithms. Default: 5 players per match. Use sample dataset for 500 players.'
  },
  'irt_compute': {
    name: 'IRT Compute (Full)',
    endpoint: '/irt/compute',
    defaultArgs: {
      user_id: 'user123',
      theta: 0.5,
      beta: 0.5,
      success_count: 10,
      fail_count: 3,
      sessions_played: 5
    },
    description: 'Full IRT computation with all features'
  },
  'irt_probability': {
    name: 'IRT Probability (Simple)',
    endpoint: '/irt/probability',
    defaultArgs: {
      theta: 0.5,
      beta: 0.5,
      rank_name: 'novice',
      completed_achievements: 5,
      success_count: 10,
      fail_count: 3
    },
    description: 'Simplified IRT probability calculation'
  },
  'dda_adjust': {
    name: 'DDA Adjust Difficulty',
    endpoint: '/dda/adjust',
    defaultArgs: {
      beta_old: 0.5,
      irt_output: {
        probability: 0.65,
        adjusted_theta: 0.4
      },
      success_count: 10,
      fail_count: 3,
      target_performance: 0.7,
      adjustment_rate: 0.1
    },
    description: 'Dynamic Difficulty Adjustment'
  }
};

let currentAlgorithm = 'puzzle_adjust';
let samples = null;

async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    return data.status === 'ok';
  } catch (e) {
    return false;
  }
}

// Map algorithm types to dataset name patterns
function getDatasetFilter(algorithm) {
  if (algorithm === 'multiplayer_match') {
    return (name) => name.includes('Multiplayer');
  } else if (algorithm === 'puzzle_adjust') {
    return (name) => name.includes('Puzzle');
  } else if (algorithm === 'dda_adjust') {
    return (name) => name.includes('DDA');
  } else if (algorithm === 'irt_compute' || algorithm === 'irt_probability') {
    return (name) => name.includes('IRT') || name.includes('Puzzle'); // Puzzle uses IRT
  }
  return () => true; // Show all for unknown algorithms
}

async function loadSamples() {
  try {
  const res = await fetch('sample_data.json?v=' + Date.now());
  const data = await res.json();
    return data;
  } catch (e) {
    console.warn('Could not load sample_data.json:', e);
    return { datasets: [] };
  }
}

function updateDatasetDropdown() {
  const select = $('dataset');
  if (!select) return; // Safety check
  
  select.innerHTML = '<option value="">Custom (use Args field)</option>';
  
  if (!samples || !samples.datasets || !currentAlgorithm) {
    console.warn('Cannot update dataset dropdown:', { samples: !!samples, hasDatasets: !!(samples && samples.datasets), currentAlgorithm });
    return;
  }
  
  const filter = getDatasetFilter(currentAlgorithm);
  
  samples.datasets.forEach((d, idx) => {
    // Filter datasets by algorithm type
    if (filter(d.name)) {
    const opt = document.createElement('option');
    opt.value = idx;
      // Cleaner display: show name and brief description
      let displayName = d.name;
      if (d.name.includes('500 Players') || d.name.includes('500 Students')) {
        displayName = '📊 ' + d.name + ' (Large test dataset)';
      } else if (d.name.includes('Multiplayer')) {
        displayName = '👥 ' + d.name;
      } else if (d.name.includes('Puzzle')) {
        displayName = '🧩 ' + d.name;
      } else if (d.name.includes('DDA')) {
        displayName = '⚡ ' + d.name;
      }
      opt.textContent = displayName;
    select.appendChild(opt);
    }
  });
  
  // If no datasets match, show message
  if (select.children.length === 1) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No datasets available for this algorithm';
    opt.disabled = true;
    select.appendChild(opt);
  }
}

function setOutput(text, type = 'log') {
  const out = $('output');
  const prefix = type === 'error' ? '❌ ' : type === 'time' ? '⏱ ' : type === 'success' ? '✅ ' : '';
  out.textContent = `${prefix}${text}`;
  out.style.color = type === 'error' ? '#ff6b6b' : type === 'success' ? '#51cf66' : 'var(--text)';
}

function updateAlgorithmUI() {
  if (!currentAlgorithm) {
    console.warn('No algorithm selected');
    return;
  }
  
  const algoConfig = ALGORITHMS[currentAlgorithm];
  if (!algoConfig) {
    console.warn('Unknown algorithm:', currentAlgorithm);
    return;
  }

  // Update description
  const codeArea = $('code');
  if (codeArea) {
    codeArea.value = `${algoConfig.description}\n\nDefault Arguments:\n${JSON.stringify(algoConfig.defaultArgs, null, 2)}`;
  }
  
  // Update function name display
  const fnName = $('fnName');
  if (fnName) {
    fnName.value = algoConfig.name;
  }
  
  // Update args with default
  const argsArea = $('args');
  if (argsArea) {
    const defaultArgsStr = JSON.stringify(algoConfig.defaultArgs, null, 2);
    argsArea.value = defaultArgsStr;
  }
  
  // Update dataset dropdown to show only relevant datasets
  updateDatasetDropdown();
}

async function runAlgorithm() {
  try {
    setOutput('Running algorithm...', 'log');
    
    const algoConfig = ALGORITHMS[currentAlgorithm];
    if (!algoConfig) {
      throw new Error(`Unknown algorithm: ${currentAlgorithm}`);
    }

    // Check backend health first
    const isHealthy = await checkBackendHealth();
    if (!isHealthy) {
      throw new Error('Backend API is not available. Make sure backend.py is running on port 5000.');
    }

    // Parse arguments from the args textarea (which is populated by dataset selection)
      const customArgs = $('args').value.trim();
    let args;
    
    if (!customArgs) {
      throw new Error('Please select a dataset or enter arguments.');
    }
    
    try {
      args = JSON.parse(customArgs);
    } catch (e) {
      throw new Error('Args must be valid JSON object. ' + e.message);
    }
    
    if (typeof args !== 'object' || Array.isArray(args)) {
      throw new Error('Args must be a JSON object (not array).');
    }

    // Call backend API
  const t0 = performance.now();
    const response = await fetch(`${API_BASE}${algoConfig.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args)
    });

  const t1 = performance.now();
    const ms = +(t1 - t0).toFixed(3);

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    // Format output based on algorithm type
    let resultStr;
    if (currentAlgorithm === 'multiplayer_match' && data.result.matches) {
      // Special formatting for multiplayer matches
      const summary = data.result.summary || {};
      resultStr = `=== MATCHMAKING RESULTS ===\n\n`;
      resultStr += `Summary:\n`;
      resultStr += `  Total Players: ${summary.total_players || 0}\n`;
      resultStr += `  Matched Players: ${summary.matched_players || 0}\n`;
      resultStr += `  Unmatched Players: ${summary.unmatched_players || 0}\n`;
      resultStr += `  Total Matches: ${summary.total_matches || 0}\n`;
      resultStr += `  Match Size: ${summary.match_size || 0} players per match\n\n`;
      
      resultStr += `Matches (${data.result.matches.length} groups):\n\n`;
      data.result.matches.forEach((match, idx) => {
        resultStr += `--- Match ${idx + 1} (Score: ${(match.match_score || 0).toFixed(3)}) ---\n`;
        resultStr += `Cluster: ${match.cluster || 'unknown'}\n`;
        resultStr += `Players (${match.player_count || 0}):\n`;
        (match.matched_players || []).forEach((player, pIdx) => {
          resultStr += `  ${pIdx + 1}. ${player.user_id} | θ=${player.theta} | Rank: ${player.rank_name} | W:${player.success_count}/L:${player.fail_count}\n`;
        });
        resultStr += `\n`;
      });
    } else if (currentAlgorithm === 'puzzle_adjust') {
      // Check if batch mode (multiple students)
      if (data.result.batch_mode && data.result.students) {
        // Batch processing output
        const batchSummary = data.result.summary || {};
        resultStr = `=== PUZZLE DIFFICULTY ADJUSTMENT (BATCH MODE) ===\n\n`;
        resultStr += `📊 SUMMARY:\n`;
        resultStr += `  Total Students: ${batchSummary.total_students || 0}\n`;
        resultStr += `  Successfully Processed: ${batchSummary.processed || 0}\n`;
        resultStr += `  Failed: ${batchSummary.failed || 0}\n\n`;
        resultStr += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        // Display each student's results
        data.result.students.forEach((student, idx) => {
          if (student.error) {
            resultStr += `❌ STUDENT #${student.student_index || idx + 1}: ${student.player_name || 'Unknown'}\n`;
            resultStr += `   Error: ${student.error}\n\n`;
            return;
          }
          
          resultStr += `👤 STUDENT #${student.student_index || idx + 1}: ${student.player_name || 'Unknown'}\n`;
          resultStr += `   Rank: ${student.rank_name || 'Unknown'} | `;
          resultStr += `Achievements: ${student.completed_achievements || 0} | `;
          resultStr += `Attempts: ${(student.success_count || 0) + (student.fail_count || 0)}\n`;
          
          resultStr += `   📊 Performance: `;
          resultStr += `Skill (θ): ${(student.player_skill || 0).toFixed(3)} | `;
          resultStr += `Level: ${student.success_level || 'N/A'}/${student.fail_level || 'N/A'}\n`;
          resultStr += `   📈 Rates: `;
          resultStr += `Success: ${((student.actual_success_rate || 0) * 100).toFixed(1)}% (${student.success_count || 0}W/${student.fail_count || 0}L) | `;
          resultStr += `Predicted: ${((student.predicted_success || 0) * 100).toFixed(1)}%\n`;
          
          resultStr += `   🎯 Difficulty: `;
          resultStr += `${(student.old_difficulty || 0).toFixed(3)} → ${(student.new_difficulty || 0).toFixed(3)} `;
          resultStr += `(${student.difficulty_label || 'Unknown'})`;
          const diff_change = (student.new_difficulty || 0) - (student.old_difficulty || 0);
          if (Math.abs(diff_change) > 0.001) {
            if (diff_change > 0) {
              resultStr += ` ⬆️ +${diff_change.toFixed(3)}\n`;
            } else {
              resultStr += ` ⬇️ ${diff_change.toFixed(3)}\n`;
            }
          } else {
            resultStr += ` ➡️ No change\n`;
          }
          
          resultStr += `\n`;
          
          // Show separator for readability (every 10 students)
          if ((idx + 1) % 10 === 0 && idx < data.result.students.length - 1) {
            resultStr += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
          }
        });
        
        resultStr += `\n✅ Batch processing completed!\n`;
      } else if (data.result.summary) {
        // Single student processing (original behavior)
        const summary = data.result.summary || {};
        const playerName = summary.player_name || 'Player';
        
        resultStr = `=== PUZZLE DIFFICULTY ADJUSTMENT ===\n\n`;
        resultStr += `👤 PLAYER INFORMATION:\n`;
        resultStr += `  Name: ${playerName}\n`;
        resultStr += `  Rank: ${summary.rank_name || 'Unknown'}\n`;
        resultStr += `  Achievements: ${summary.completed_achievements || 0}\n`;
        resultStr += `  Total Attempts: ${(summary.success_count || 0) + (summary.fail_count || 0)}\n\n`;
        
        resultStr += `📊 PLAYER PERFORMANCE:\n`;
        resultStr += `  Skill Level (θ): ${(summary.player_skill || 0).toFixed(3)}\n`;
        resultStr += `  Performance Level: ${summary.success_level || 'Unknown'} / ${summary.fail_level || 'Unknown'}\n`;
        resultStr += `  Success Rate: ${((summary.actual_success_rate || 0) * 100).toFixed(1)}% (${summary.success_count || 0} successes)\n`;
        resultStr += `  Fail Rate: ${((summary.actual_fail_rate || 0) * 100).toFixed(1)}% (${summary.fail_count || 0} failures)\n\n`;
        
        resultStr += `🎯 DIFFICULTY ADJUSTMENT:\n`;
        resultStr += `  Old Difficulty (β): ${(summary.old_difficulty || 0).toFixed(3)}\n`;
        resultStr += `  New Difficulty (β): ${(summary.new_difficulty || 0).toFixed(3)}\n`;
        resultStr += `  Difficulty Label: ${summary.difficulty_label || 'Unknown'}\n`;
        const diff_change = (summary.new_difficulty || 0) - (summary.old_difficulty || 0);
        if (diff_change > 0) {
          resultStr += `  ⬆️  Increased by ${diff_change.toFixed(3)} (Harder)\n`;
        } else if (diff_change < 0) {
          resultStr += `  ⬇️  Decreased by ${Math.abs(diff_change).toFixed(3)} (Easier)\n`;
        } else {
          resultStr += `  ➡️  No change\n`;
        }
        resultStr += `\n`;
        
        resultStr += `📈 PREDICTION:\n`;
        resultStr += `  Predicted Success: ${((summary.predicted_success || 0) * 100).toFixed(1)}%\n`;
        resultStr += `  Target Performance: ${((summary.target_performance || 0) * 100).toFixed(1)}%\n`;
        const performance_gap = (summary.target_performance || 0) - (summary.predicted_success || 0);
        if (Math.abs(performance_gap) < 0.05) {
          resultStr += `  ✅ Performance aligned with target\n`;
        } else if (performance_gap > 0) {
          resultStr += `  📊 Need to increase difficulty by ${(performance_gap * 100).toFixed(1)}%\n`;
        } else {
          resultStr += `  📊 Need to decrease difficulty by ${(Math.abs(performance_gap) * 100).toFixed(1)}%\n`;
        }
        resultStr += `\n`;
        
        resultStr += `💡 RECOMMENDATION:\n`;
        if (summary.difficulty_label) {
          const label = summary.difficulty_label.toLowerCase();
          if (label === 'easy') {
            resultStr += `  Start with easier puzzles to build confidence\n`;
          } else if (label === 'medium') {
            resultStr += `  Use medium difficulty for balanced challenge\n`;
          } else if (label === 'hard') {
            resultStr += `  Challenge with harder puzzles to improve skills\n`;
          } else if (label === 'expert') {
            resultStr += `  Advanced puzzles for expert-level practice\n`;
          }
        }
        
        // Optionally show full details (collapsed by default)
        resultStr += `\n--- Full Details (JSON) ---\n`;
        resultStr += JSON.stringify(data.result.full_details || data.result, null, 2);
      }
    } else {
      resultStr = JSON.stringify(data.result, null, 2);
    }
    
    setOutput(`Result:\n${resultStr}\n\n⏱ Time: ${ms} ms (including network)`, 'success');
    
    } catch (e) {
      setOutput(e.message || String(e), 'error');
      console.error(e);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  // Initialize UI
  samples = await loadSamples();
  
  // Populate algorithm selector (clear first to avoid duplicates on reloads)
  const algoSelect = $('algorithm');
  algoSelect.innerHTML = '';
  const seen = new Set();
  Object.keys(ALGORITHMS).forEach(key => {
    if (seen.has(key)) return;
    seen.add(key);
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = ALGORITHMS[key].name;
    algoSelect.appendChild(opt);
  });
  
  // Update code area to be read-only info display
  const codeArea = $('code');
  codeArea.readOnly = true;
  codeArea.style.backgroundColor = '#0d0d15';
  codeArea.style.cursor = 'default';
  
  // Algorithm selector change handler
  algoSelect.addEventListener('change', (e) => {
    currentAlgorithm = e.target.value;
    updateAlgorithmUI();
    // Reset dataset selection when algorithm changes
    $('dataset').selectedIndex = 0;
    const defaultArgsStr = JSON.stringify(ALGORITHMS[currentAlgorithm].defaultArgs, null, 2);
    $('args').value = defaultArgsStr;
  });
  
  // Initialize with first algorithm
  if (Object.keys(ALGORITHMS).length > 0) {
    currentAlgorithm = Object.keys(ALGORITHMS)[0];
    algoSelect.value = currentAlgorithm;
    updateAlgorithmUI();
  }
  
  // Dataset selector change handler
  $('dataset').addEventListener('change', (e) => {
    const datasetIdx = e.target.value;
    if (datasetIdx !== '' && samples && samples.datasets) {
      const selected = samples.datasets[parseInt(datasetIdx, 10)];
      if (selected && selected.args) {
        // Update args field with selected dataset
        const datasetArgs = JSON.stringify(selected.args, null, 2);
        $('args').value = datasetArgs;
        setOutput(`✅ Loaded dataset: ${selected.name}`, 'success');
      } else if (selected && selected.buildFrom) {
        try {
          const build = selected.buildFrom;
          // Find source dataset by name
          const source = (samples.datasets || []).find(d => d.name === build.sourceDatasetName);
          if (!source || !source.args || !Array.isArray(source.args.players)) {
            throw new Error('Source dataset not found or invalid: ' + (build.sourceDatasetName || 'unknown'));
          }
          // Transform multiplayer players -> puzzle batch students
          const students = source.args.players.map((p, i) => ({
            player_name: p.user_id || `Student_${(i+1).toString().padStart(3,'0')}`,
            theta: typeof p.theta === 'number' ? p.theta : 0.5,
            beta_old: typeof p.beta === 'number' ? p.beta : 0.5,
            rank_name: p.rank_name || 'novice',
            completed_achievements: typeof p.completed_achievements === 'number' ? p.completed_achievements : 0,
            success_count: typeof p.success_count === 'number' ? p.success_count : 0,
            fail_count: typeof p.fail_count === 'number' ? p.fail_count : 0
          }));
          const defaults = build.defaults || { target_performance: 0.7, adjustment_rate: 0.1, auto_sync: true };
          const puzzleArgs = { students, ...defaults };
          $('args').value = JSON.stringify(puzzleArgs, null, 2);
          setOutput(`✅ Loaded dataset: ${selected.name}`, 'success');
        } catch (err) {
          setOutput(`Failed to build dataset: ${err.message || err}`, 'error');
          console.error(err);
        }
      }
    } else if (datasetIdx === '') {
      // Reset to default args if "Custom" is selected
      const defaultArgsStr = JSON.stringify(ALGORITHMS[currentAlgorithm].defaultArgs, null, 2);
      $('args').value = defaultArgsStr;
    }
  });
  
  // Update button handlers
  $('runBtn').addEventListener('click', runAlgorithm);

  $('resetBtn').addEventListener('click', () => {
    updateAlgorithmUI();
    $('dataset').selectedIndex = 0;
    setOutput('Ready.');
  });
  
  // Check backend on load
  checkBackendHealth().then(isHealthy => {
    if (isHealthy) {
      setOutput('✅ Backend connected. Ready to test algorithms.', 'success');
    } else {
      setOutput('⚠️ Backend not connected. Start backend.py first (python backend.py)', 'error');
    }
  });
});


