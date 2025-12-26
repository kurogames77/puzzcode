/**
 * WebSocket Matchmaking Service
 * Integrates with existing Python algorithms for real-time matchmaking
 */

const { findMatches } = require('./matchmakingService');
const pool = require('../db');
const logger = require('../utils/logger');

// In-memory queue for matchmaking
const matchmakingQueue = new Map(); // userId -> { socketId, matchType, language, matchSize, timestamp }
const activeMatches = new Map(); // matchId -> Set of socketIds

/**
 * Get player data for matchmaking (same as battle.js)
 */
async function getPlayerDataForMatchmaking(userId) {
  const progressResult = await pool.query(
    `SELECT 
      COALESCE(AVG(CASE WHEN total_attempts > 0 THEN theta ELSE NULL END), 0.0) as avg_theta,
      COALESCE(AVG(CASE WHEN total_attempts > 0 THEN beta ELSE NULL END), 0.5) as avg_beta,
      COALESCE(MAX(adjusted_theta), 0.0) as latest_adjusted_theta,
      COALESCE(MAX(beta), 0.5) as latest_beta,
      SUM(success_count) as total_success,
      SUM(fail_count) as total_fail
    FROM student_progress
    WHERE user_id = $1 AND total_attempts > 0`,
    [userId]
  );

  const statsResult = await pool.query(
    `SELECT 
      exp, rank_name, rank_index,
      total_success_count, total_fail_count,
      completed_achievements
    FROM student_statistics
    WHERE user_id = $1`,
    [userId]
  );

  const stats = statsResult.rows[0] || {
    exp: 0,
    rank_name: 'novice',
    rank_index: 0,
    total_success_count: 0,
    total_fail_count: 0,
    completed_achievements: 0
  };

  const progress = progressResult.rows[0] || {
    avg_theta: 0.0,
    avg_beta: 0.5,
    latest_adjusted_theta: 0.0,
    latest_beta: 0.5,
    total_success: 0,
    total_fail: 0
  };

  const theta = progress.latest_adjusted_theta || progress.avg_theta || 0.0;
  const beta = progress.latest_beta || progress.avg_beta || 0.5;

  return {
    user_id: userId,
    theta: parseFloat(theta),
    beta: parseFloat(beta),
    rank_name: stats.rank_name || 'novice',
    rank_index: typeof stats.rank_index === 'number'
      ? stats.rank_index
      : parseInt(stats.rank_index, 10) || 0,
    completed_achievements: stats.completed_achievements || 0,
    success_count: parseInt(stats.total_success_count) || parseInt(progress.total_success) || 0,
    fail_count: parseInt(stats.total_fail_count) || parseInt(progress.total_fail) || 0
  };
}

/**
 * Add player to matchmaking queue
 */
function addToQueue(userId, socketId, options = {}) {
  const {
    matchType = 'ranked',
    language = 'python',
    matchSize = 3 // Default to 3 for ranked (min 3, max 5)
  } = options;

  matchmakingQueue.set(userId, {
    socketId,
    matchType,
    language,
    matchSize,
    timestamp: Date.now()
  });

  logger.log('player_joined_queue', {
    userId,
    socketId,
    matchType,
    language,
    matchSize,
    queueSize: matchmakingQueue.size
  });
  
  // Emit to all connected sockets that a player joined (for showing queue status)
  // This will be handled by the WebSocket handler
}

/**
 * Remove player from matchmaking queue
 */
function removeFromQueue(userId) {
  const removed = matchmakingQueue.delete(userId);
  if (removed) {
    logger.log('player_left_queue', { userId });
  }
  return removed;
}

/**
 * Process matchmaking queue and find matches
 * This now checks both WebSocket in-memory queue AND database pending matches
 * to allow WebSocket and HTTP players to be matched together
 */
async function processMatchmakingQueue(io) {
  try {
    // Get WebSocket queued players
    const wsQueuedUserIds = Array.from(matchmakingQueue.keys());
    
    // Also get players from database pending matches (HTTP matchmaking)
    // BUT exclude players who are already in a match that was created recently (within last 30 seconds)
    // This prevents re-matching players who were just matched
    let dbQueuedPlayers = [];
    try {
      const dbQueueResult = await pool.query(
        `SELECT DISTINCT
          mmp.user_id,
          m.id as match_id,
          m.match_type,
          m.created_at
        FROM multiplayer_match_participants mmp
        JOIN multiplayer_matches m ON m.id = mmp.match_id
        WHERE m.status = 'pending'
          AND m.created_at > NOW() - INTERVAL '10 minutes'
          -- Exclude players who are already in a recently created match (within last 30 seconds)
          -- This prevents re-matching the same players
          AND NOT EXISTS (
            SELECT 1
            FROM multiplayer_match_participants mmp2
            JOIN multiplayer_matches m2 ON m2.id = mmp2.match_id
            WHERE mmp2.user_id = mmp.user_id
              AND m2.status = 'pending'
              AND m2.created_at > NOW() - INTERVAL '30 seconds'
              AND m2.id != m.id
              -- Only exclude if the other match has 3+ participants (a real match, not just queued)
              AND (SELECT COUNT(*) FROM multiplayer_match_participants WHERE match_id = m2.id) >= 3
          )
        ORDER BY m.created_at DESC`,
        []
      );

      // Get player data for database queued players
      if (dbQueueResult.rows.length > 0) {
        const dbUserIds = dbQueueResult.rows.map(row => row.user_id);
        // Filter out players already in WebSocket queue
        const uniqueDbUserIds = dbUserIds.filter(userId => !wsQueuedUserIds.includes(userId));
        
        if (uniqueDbUserIds.length > 0) {
          dbQueuedPlayers = await Promise.all(
            uniqueDbUserIds.map(userId => getPlayerDataForMatchmaking(userId))
          );
          
          // Add match preferences from database
          // Try to infer language from WebSocket queue if player is also there, otherwise default
          for (let i = 0; i < dbQueuedPlayers.length; i++) {
            const dbRow = dbQueueResult.rows.find(row => row.user_id === dbQueuedPlayers[i].user_id);
            if (dbRow) {
              // Check if this player is also in WebSocket queue (they might have joined via both methods)
              const wsQueueData = matchmakingQueue.get(dbQueuedPlayers[i].user_id);
              const inferredLanguage = wsQueueData?.language || 'python'; // Default to python if not found
              
              dbQueuedPlayers[i].queueData = {
                socketId: wsQueueData?.socketId || null, // Use WebSocket socket if available
                matchType: dbRow.match_type || 'ranked',
                language: inferredLanguage, // Use language from WebSocket queue if available
                matchSize: wsQueueData?.matchSize || 3, // Default to 3 for ranked (min 3, max 5)
                timestamp: dbRow.created_at ? new Date(dbRow.created_at).getTime() : Date.now(),
                matchId: dbRow.match_id // Store match ID to update later
              };
            }
          }
        }
      }
    } catch (dbError) {
      logger.error('db_queue_fetch_error', {
        error: dbError.message,
        stack: dbError.stack
      });
    }

    // Combine WebSocket and database queued players
    const wsPlayers = await Promise.all(
      wsQueuedUserIds.map(userId => getPlayerDataForMatchmaking(userId))
    );

    // Add queue data to WebSocket players
    for (let i = 0; i < wsPlayers.length; i++) {
      const queueData = matchmakingQueue.get(wsPlayers[i].user_id);
      if (queueData) {
        wsPlayers[i].queueData = queueData;
      }
    }

    // Filter out players who are already in an active match (recently created)
    // This prevents re-matching players who were just matched
    const activeMatchPlayerIds = new Set();
    try {
      const activeMatchesResult = await pool.query(
        `SELECT DISTINCT mmp.user_id
         FROM multiplayer_match_participants mmp
         JOIN multiplayer_matches m ON m.id = mmp.match_id
         WHERE m.status = 'pending'
           AND m.created_at > NOW() - INTERVAL '30 seconds'
           AND (SELECT COUNT(*) FROM multiplayer_match_participants WHERE match_id = m.id) >= 3`,
        []
      );
      activeMatchesResult.rows.forEach(row => activeMatchPlayerIds.add(row.user_id));
    } catch (err) {
      logger.error('active_match_check_error', { error: err.message });
    }

    // Filter out players already in active matches
    const wsPlayersFiltered = wsPlayers.filter(p => !activeMatchPlayerIds.has(p.user_id));
    const dbQueuedPlayersFiltered = dbQueuedPlayers.filter(p => !activeMatchPlayerIds.has(p.user_id));
    
    // Combine all players
    let allPlayers = [...wsPlayersFiltered, ...dbQueuedPlayersFiltered];
    
    // Filter to only ONLINE players (active session within last 15 minutes)
    // Increased time window to be more lenient for local network testing
    // Also check WebSocket connections as a fallback
    if (allPlayers.length > 0) {
      const playerIds = allPlayers.map(p => p.user_id);
      try {
        // Check for active sessions (more lenient - 15 minutes instead of 5)
        const onlineCheckResult = await pool.query(
          `SELECT DISTINCT user_id
           FROM user_sessions
           WHERE user_id = ANY($1::uuid[])
             AND session_end IS NULL
             AND session_start > NOW() - INTERVAL '15 minutes'`,
          [playerIds]
        );
        
        const onlineUserIds = new Set(onlineCheckResult.rows.map(row => row.user_id));
        
        // Also check WebSocket connections as a fallback (if player has active socket, consider them online)
        for (const player of allPlayers) {
          const queueData = matchmakingQueue.get(player.user_id) || player.queueData;
          if (queueData && queueData.socketId) {
            const socket = io.sockets.sockets.get(queueData.socketId);
            if (socket && socket.connected) {
              // If player has active WebSocket connection, consider them online
              onlineUserIds.add(player.user_id);
            }
          }
        }
        
        // Filter to only online players
        const beforeFilter = allPlayers.length;
        allPlayers = allPlayers.filter(p => onlineUserIds.has(p.user_id));
        
        logger.log('online_status_filter', {
          totalBefore: beforeFilter,
          onlineCount: onlineUserIds.size,
          filteredCount: allPlayers.length,
          filteredPlayers: allPlayers.map(p => ({
            userId: p.user_id,
            rank: p.rank_name,
            language: p.queueData?.language,
            hasSocket: !!(matchmakingQueue.get(p.user_id)?.socketId || p.queueData?.socketId)
          }))
        });
      } catch (onlineError) {
        logger.error('online_status_check_error', {
          error: onlineError.message,
          stack: onlineError.stack
        });
        // If online check fails, continue with all players (fail open)
        // This ensures matchmaking still works even if session tracking has issues
      }
    }

    logger.log('matchmaking_queue_status', {
      wsPlayers: wsQueuedUserIds.length,
      dbPlayers: dbQueuedPlayers.length,
      activeMatchPlayers: activeMatchPlayerIds.size,
      filteredWsPlayers: wsPlayersFiltered.length,
      filteredDbPlayers: dbQueuedPlayersFiltered.length,
      totalPlayers: allPlayers.length,
      wsUserIds: wsQueuedUserIds,
      activeMatchUserIds: Array.from(activeMatchPlayerIds),
      allPlayersDetails: allPlayers.map(p => ({
        userId: p.user_id,
        rank: p.rank_name,
        normalizedRank: (p.rank_name || 'novice').toLowerCase(),
        hasQueueData: !!p.queueData,
        language: p.queueData?.language,
        normalizedLanguage: (p.queueData?.language || 'python').toLowerCase(),
        matchType: p.queueData?.matchType,
        matchSize: p.queueData?.matchSize,
        hasSocket: !!(matchmakingQueue.get(p.user_id)?.socketId || p.queueData?.socketId),
        socketConnected: (() => {
          const queueData = matchmakingQueue.get(p.user_id) || p.queueData;
          if (queueData?.socketId) {
            const socket = io.sockets.sockets.get(queueData.socketId);
            return socket?.connected || false;
          }
          return false;
        })()
      }))
    });

    if (allPlayers.length < 2) {
      logger.log('not_enough_players_total', { total: allPlayers.length });
      return; // Not enough players total
    }

    // PHASE 1: Group players by same rank + same language + same matchType (PRIORITY)
    // PHASE 2: Group players by same language + same matchType (FALLBACK if no same-rank available)
    const sameRankGroups = new Map(); // For Phase 1: same rank + language
    const crossRankGroups = new Map(); // For Phase 2: same language only
    
    for (let i = 0; i < allPlayers.length; i++) {
      const player = allPlayers[i];
      const queueData = player.queueData;
      if (!queueData) continue;

      // Normalize rank and language for consistent matching
      // Handle case variations and null values
      const rankName = (player.rank_name || 'novice').toLowerCase().trim();
      const language = (queueData.language || 'python').toLowerCase().trim();
      const matchType = queueData.matchType || 'ranked';
      const matchSize = queueData.matchSize || 3;
      
      // Phase 1 key: same rank + same language + same matchType + same matchSize
      const sameRankKey = `${matchType}_${language}_${matchSize}_${rankName}`;
      
      // Phase 2 key: same language + same matchType + same matchSize (no rank requirement)
      const crossRankKey = `${matchType}_${language}_${matchSize}`;
      
      logger.log('grouping_player', {
        userId: player.user_id,
        rankName: player.rank_name,
        normalizedRank: rankName,
        language: language,
        matchType: matchType,
        matchSize: matchSize,
        sameRankKey,
        crossRankKey
      });
      
      // Add to same-rank group (Phase 1)
      if (!sameRankGroups.has(sameRankKey)) {
        sameRankGroups.set(sameRankKey, []);
      }
      sameRankGroups.get(sameRankKey).push(player);
      
      // Also add to cross-rank group (Phase 2)
      if (!crossRankGroups.has(crossRankKey)) {
        crossRankGroups.set(crossRankKey, []);
      }
      crossRankGroups.get(crossRankKey).push(player);
    }

    // Log all groups for debugging BEFORE processing
    logger.log('all_matchmaking_groups_before_processing', {
      sameRankGroups: sameRankGroups.size,
      crossRankGroups: crossRankGroups.size,
      sameRankDetails: Array.from(sameRankGroups.entries()).map(([k, v]) => ({
        key: k,
        playerCount: v.length,
        playerIds: v.map(p => p.user_id),
        players: v.map(p => ({
          userId: p.user_id,
          rank: p.rank_name,
          language: p.queueData?.language
        }))
      })),
      crossRankDetails: Array.from(crossRankGroups.entries()).map(([k, v]) => ({
        key: k,
        playerCount: v.length,
        playerIds: v.map(p => p.user_id),
        players: v.map(p => ({
          userId: p.user_id,
          rank: p.rank_name,
          language: p.queueData?.language
        }))
      }))
    });

    // PHASE 1: Try to match players with SAME RANK + SAME LANGUAGE (PRIORITY)
    // Track which players were matched in this phase
    const matchedPlayerIds = new Set();
    
    for (const [key, groupPlayers] of sameRankGroups) {
      // For ranked matchmaking, require minimum 3 players, maximum 5
      const requestedMatchSize = groupPlayers[0].queueData.matchSize || 3;
      const minMatchSize = 3; // Minimum players for ranked match
      const maxMatchSize = 5; // Maximum players for ranked match
      
      logger.log('matchmaking_group_check', {
        key,
        groupSize: groupPlayers.length,
        minMatchSize,
        requestedMatchSize,
        maxMatchSize,
        players: groupPlayers.map(p => ({ 
          userId: p.user_id, 
          rank: p.rank_name, 
          normalizedRank: (p.rank_name || 'novice').toLowerCase(),
          language: p.queueData?.language,
          matchType: p.queueData?.matchType,
          matchSize: p.queueData?.matchSize,
          hasSocket: !!p.queueData?.socketId
        }))
      });
      
      // Need at least minimum players to create a match
      if (groupPlayers.length < minMatchSize) {
        logger.log('not_enough_players_in_group', {
          key,
          currentPlayers: groupPlayers.length,
          required: minMatchSize
        });
        
        // Even if not enough players, notify WebSocket players about others in queue
        // This allows them to see who's waiting (for 2+ players)
        if (groupPlayers.length >= 2) {
          // Notify all WebSocket players in this group about other queued players
          for (const player of groupPlayers) {
            const queueData = player.queueData;
            if (queueData && queueData.socketId) {
              const socket = io.sockets.sockets.get(queueData.socketId);
              if (socket) {
                // Get all other players' info
                const otherPlayers = groupPlayers.filter(p => p.user_id !== player.user_id);
                const otherPlayersInfo = await Promise.all(
                  otherPlayers.map(async (p) => {
                    const userResult = await pool.query(
                      `SELECT u.id, u.username, u.first_name, u.last_name, u.avatar_url,
                              ss.rank_name
                       FROM users u
                       LEFT JOIN student_statistics ss ON ss.user_id = u.id
                       WHERE u.id = $1`,
                      [p.user_id]
                    );
                    if (userResult.rows.length > 0) {
                      const u = userResult.rows[0];
                      return {
                        userId: u.id,
                        username: u.username,
                        name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
                        avatar: u.avatar_url,
                        rank: u.rank_name || 'novice'
                      };
                    }
                    return null;
                  })
                );
                
                const resolvedPlayers = otherPlayersInfo.filter(p => p !== null);
                
                socket.emit('matchmaking_queue_update', {
                  queuedPlayers: resolvedPlayers,
                  currentCount: groupPlayers.length,
                  requiredCount: minMatchSize,
                  message: `Waiting for ${minMatchSize - groupPlayers.length} more player(s)...`
                });
                
                logger.log('sent_queue_update', {
                  userId: player.user_id,
                  otherPlayersCount: resolvedPlayers.length,
                  totalInGroup: groupPlayers.length
                });
              }
            }
          }
        }
        continue;
      }
      
      // Determine actual match size (use available players up to max)
      const actualMatchSize = Math.min(groupPlayers.length, Math.min(requestedMatchSize, maxMatchSize));
      
      logger.log('attempting_match_creation', {
        key,
        groupSize: groupPlayers.length,
        minMatchSize,
        actualMatchSize,
        requestedMatchSize,
        maxMatchSize
      });
      
      // Only create match if we have at least minMatchSize players
      if (groupPlayers.length < minMatchSize) {
        logger.warn('skipping_match_creation_insufficient_players', {
          key,
          groupSize: groupPlayers.length,
          minMatchSize
        });
        continue;
      }

      try {
        // Store queue data before processing
        const playersQueueData = new Map();
        for (const player of groupPlayers) {
          const queueData = matchmakingQueue.get(player.user_id) || player.queueData;
          if (queueData) {
            playersQueueData.set(player.user_id, queueData);
          }
        }
        
        // RULE: Use algorithm for all same-rank matches
        // - If 5 players with same rank: Use algorithm to match them
        // - If 3-4 players with same rank: Use algorithm to match them
        // Select up to maxMatchSize players for the match
        const playersToMatch = groupPlayers.slice(0, Math.min(groupPlayers.length, maxMatchSize));
        
        logger.log('using_algorithm_for_same_rank_match', {
          key,
          groupSize: groupPlayers.length,
          minMatchSize,
          actualMatchSize,
          maxMatchSize,
          playersToMatch: playersToMatch.length,
          reason: 'Applying KMeans_Cluster, SkillBasedMatchMaking, and Multiplayer_Based algorithms'
        });
        
        // Use algorithm for skill-based matching (KMeans_Cluster.py, SkillBasedMatchMaking.py, Multiplayer_Based.py)
        const matches = await findMatches(
          playersToMatch.map(p => ({
            user_id: p.user_id,
            theta: p.theta,
            beta: p.beta,
            rank_name: p.rank_name,
            completed_achievements: p.completed_achievements,
            success_count: p.success_count,
            fail_count: p.fail_count
          })),
          {
            matchSize: actualMatchSize, // Use actual match size (3-5 players)
            allowCrossCluster: true,
            minMatchScore: 0.2, // Lower threshold for same-rank matches (more lenient)
            kClusters: 3 // Use K-means clustering
          }
        );

        logger.log('matchmaking_algorithm_result', {
          key,
          matchesFound: matches ? matches.length : 0,
          groupSize: groupPlayers.length,
          actualMatchSize
        });
        
        if (matches && matches.length > 0) {
          // Process first match using the processMatch function
          const match = matches[0];
          await processMatch(match, groupPlayers, playersQueueData, io, matchmakingQueue);
          
          // Mark matched players
          match.players.forEach(p => matchedPlayerIds.add(p.user_id));
        }
      } catch (matchError) {
        logger.error('matchmaking_error', {
          error: matchError.message,
          stack: matchError.stack,
          key
        });
      }
    }
    
    // PHASE 2: If no same-rank matches found, try cross-rank matching for SAME LANGUAGE + ONLINE
    // Only match players who weren't already matched in Phase 1
    const unmatchedPlayers = allPlayers.filter(p => !matchedPlayerIds.has(p.user_id));
    
    if (unmatchedPlayers.length >= 3) {
      logger.log('phase2_cross_rank_matching', {
        unmatchedPlayers: unmatchedPlayers.length,
        players: unmatchedPlayers.map(p => ({
          userId: p.user_id,
          rank: p.rank_name,
          language: p.queueData?.language
        }))
      });
      
      // Use the cross-rank groups we already built (same language, different ranks)
      // Filter to only groups that have unmatched players
      for (const [crossRankKey, crossRankPlayers] of crossRankGroups) {
        // Filter to only unmatched players in this group
        const unmatchedInGroup = crossRankPlayers.filter(p => !matchedPlayerIds.has(p.user_id));
        
        if (unmatchedInGroup.length < 3) {
          continue; // Skip groups with less than 3 unmatched players
        }
        const minMatchSize = 3;
        const maxMatchSize = 5;
        
        if (unmatchedInGroup.length >= minMatchSize) {
          logger.log('attempting_cross_rank_match', {
            key: crossRankKey,
            playerCount: unmatchedInGroup.length,
            players: unmatchedInGroup.map(p => ({
              userId: p.user_id,
              rank: p.rank_name,
              language: p.queueData?.language
            }))
          });
          
          try {
            // Store queue data
            const playersQueueData = new Map();
            for (const player of unmatchedInGroup) {
              const queueData = matchmakingQueue.get(player.user_id) || player.queueData;
              if (queueData) {
                playersQueueData.set(player.user_id, queueData);
              }
            }
            
            // RULE: Use algorithm for cross-rank matching (3-4 players with different ranks)
            // This allows players with different ranks to be matched using skill-based algorithms
            // Select up to maxMatchSize players
            const playersToMatch = unmatchedInGroup.slice(0, Math.min(unmatchedInGroup.length, maxMatchSize));
            const actualMatchSize = Math.min(playersToMatch.length, maxMatchSize);
            
            logger.log('using_algorithm_for_cross_rank_match', {
              key: crossRankKey,
              playerCount: unmatchedInGroup.length,
              actualMatchSize,
              players: unmatchedInGroup.map(p => ({
                userId: p.user_id,
                rank: p.rank_name,
                language: p.queueData?.language
              })),
              reason: 'Applying algorithms for 3-4 players with different ranks (KMeans_Cluster, SkillBasedMatchMaking, Multiplayer_Based)'
            });
            
            // Use algorithm for skill-based matching (allows different ranks)
            // More lenient threshold for cross-rank matching to ensure matches form
            const matches = await findMatches(
              playersToMatch.map(p => ({
                user_id: p.user_id,
                theta: p.theta,
                beta: p.beta,
                rank_name: p.rank_name,
                completed_achievements: p.completed_achievements,
                success_count: p.success_count,
                fail_count: p.fail_count
              })),
              {
                matchSize: actualMatchSize,
                allowCrossCluster: true, // Allow cross-cluster matching for different ranks
                minMatchScore: 0.15, // Lenient threshold for cross-rank matching (3-4 players)
                kClusters: 3 // Use K-means clustering
              }
            );
            
            if (matches && matches.length > 0) {
              logger.log('cross_rank_match_found_via_algorithm', {
                key: crossRankKey,
                matchScore: matches[0].match_score,
                playerCount: matches[0].players.length,
                cluster: matches[0].cluster,
                algorithmUsed: 'KMeans_Cluster + SkillBasedMatchMaking + Multiplayer_Based'
              });
              
              const match = matches[0];
              await processMatch(match, unmatchedInGroup, playersQueueData, io, matchmakingQueue);
              
              // Mark as matched
              match.players.forEach(p => matchedPlayerIds.add(p.user_id));
            } else {
              logger.warn('cross_rank_no_match_found_via_algorithm', {
                key: crossRankKey,
                playerCount: unmatchedInGroup.length,
                actualMatchSize,
                reason: 'Algorithm did not find suitable match (score too low or clustering issue)'
              });
            }
          } catch (crossRankError) {
            logger.error('cross_rank_matchmaking_error', {
              error: crossRankError.message,
              stack: crossRankError.stack,
              key: crossRankKey
            });
          }
        }
      }
    }
  } catch (error) {
    logger.error('process_match_error', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Process a match and create it in the database
 */
async function processMatch(match, groupPlayers, playersQueueData, io, matchmakingQueue) {
  try {
    const matchedPlayerIds = match.players.map(p => p.user_id);
    
    logger.log('creating_match', {
      matchedPlayerIds,
      matchScore: match.match_score,
      cluster: match.cluster
    });

    // Get old pending match IDs for HTTP players (to cancel them later)
    const oldMatchIds = new Set();
    for (const player of match.players) {
      const playerData = groupPlayers.find(p => p.user_id === player.user_id);
      if (playerData?.queueData?.matchId) {
        oldMatchIds.add(playerData.queueData.matchId);
      }
    }

    // Create match in database
    const matchResult = await pool.query(
      `INSERT INTO multiplayer_matches (
        match_type, status, cluster_id, match_score
      ) VALUES ($1, 'pending', $2, $3)
      RETURNING id, created_at`,
      [
        groupPlayers[0].queueData.matchType,
        match.cluster !== undefined ? match.cluster : null,
        match.match_score || null
      ]
    );

    const matchId = matchResult.rows[0].id;

    // Cancel old pending matches (for HTTP players who had individual pending matches)
    // Also cancel any other pending matches for these players to prevent duplicate matches
    if (oldMatchIds.size > 0 || matchedPlayerIds.length > 0) {
      // Cancel old matches AND any other pending matches for these players
      await pool.query(
        `UPDATE multiplayer_matches 
         SET status = 'cancelled' 
         WHERE (
           -- Cancel old match IDs
           (id = ANY($1::uuid[]) AND status = 'pending')
           OR
           -- Cancel any other pending matches for these players (to prevent duplicates)
           (id IN (
             SELECT DISTINCT m.id
             FROM multiplayer_matches m
             JOIN multiplayer_match_participants mmp ON m.id = mmp.match_id
             WHERE m.status = 'pending'
               AND mmp.user_id = ANY($2::uuid[])
               AND m.id != $3
           ))
         )`,
        [Array.from(oldMatchIds), matchedPlayerIds, matchId]
      );
      
      logger.log('cancelled_old_matches', {
        oldMatchIds: Array.from(oldMatchIds),
        matchedPlayerIds,
        newMatchId: matchId
      });
    }

    // Store queue data before removing from queue (if not already stored)
    if (!playersQueueData || playersQueueData.size === 0) {
      playersQueueData = new Map();
      for (const player of match.players) {
        const queueData = matchmakingQueue.get(player.user_id) || 
          groupPlayers.find(p => p.user_id === player.user_id)?.queueData;
        if (queueData) {
          playersQueueData.set(player.user_id, queueData);
        }
      }
    }

    // Deduct EXP and add participants
    const { getRankFromExp, normalizeExp } = require('./expRankService');
    const socketIds = [];
    for (const player of match.players) {
      const playerStats = await pool.query(
        `SELECT exp FROM student_statistics WHERE user_id = $1`,
        [player.user_id]
      );
      const playerExp = playerStats.rows[0]?.exp || 0;
      const newExp = Math.max(0, playerExp - 100);
      
      const rankData = getRankFromExp(newExp);
      const normalizedExp = normalizeExp(newExp);
      
      await pool.query(
        `UPDATE student_statistics
         SET exp = $1,
             normalized_exp = $2,
             rank_name = $3,
             rank_index = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $5`,
        [newExp, normalizedExp, rankData.rankName, rankData.rankIndex, player.user_id]
      );
      
      await pool.query(
        `INSERT INTO multiplayer_match_participants (
          match_id, user_id, theta, beta, rank_name,
          success_count, fail_count, completed_achievements
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          matchId,
          player.user_id,
          player.theta,
          player.beta,
          player.rank_name,
          player.success_count,
          player.fail_count,
          player.completed_achievements
        ]
      );

      // Remove from WebSocket queue (if they were in it)
      removeFromQueue(player.user_id);

      // Notify player via WebSocket (only if they have a socket)
      const queueData = playersQueueData.get(player.user_id);
      if (queueData && queueData.socketId) {
        const socket = io.sockets.sockets.get(queueData.socketId);
        if (socket) {
          // Get all participants with their full details for display
          const allParticipants = await pool.query(
            `SELECT 
              mmp.user_id,
              mmp.rank_name,
              u.username,
              u.first_name,
              u.last_name,
              u.avatar_url
            FROM multiplayer_match_participants mmp
            JOIN users u ON u.id = mmp.user_id
            WHERE mmp.match_id = $1`,
            [matchId]
          );
          
          socket.emit('match_found', {
            matchId,
            matchScore: match.match_score,
            cluster: match.cluster,
            participants: allParticipants.rows.map(p => ({
              userId: p.user_id,
              username: p.username,
              name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username,
              avatar: p.avatar_url,
              rank: p.rank_name
            })),
            participantCount: allParticipants.rows.length
          });
          
          // Join the matchmaking room for this match to receive updates
          socket.join(`matchmaking_${matchId}`);
          
          socketIds.push(queueData.socketId);
        }
      }
      // HTTP players will be notified when they poll the matchmaking status endpoint
    }

    // Track active match (socketIds already collected above)
    if (socketIds.length > 0) {
      activeMatches.set(matchId, new Set(socketIds));
    }

    // Notify all players in the matchmaking room about the match
    // This ensures all players see each other in real-time
    const allParticipantsResult = await pool.query(
      `SELECT 
        mmp.user_id,
        mmp.rank_name,
        u.username,
        u.first_name,
        u.last_name,
        u.avatar_url
      FROM multiplayer_match_participants mmp
      JOIN users u ON u.id = mmp.user_id
      WHERE mmp.match_id = $1`,
      [matchId]
    );

    io.to(`matchmaking_${matchId}`).emit('matchmaking_participants_updated', {
      matchId,
      participants: allParticipantsResult.rows.map(p => ({
        userId: p.user_id,
        username: p.username,
        name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username,
        avatar: p.avatar_url,
        rank: p.rank_name
      })),
      participantCount: allParticipantsResult.rows.length
    });

    logger.log('match_created', {
      matchId,
      playerCount: match.players.length,
      matchScore: match.match_score
    });
  } catch (error) {
    logger.error('process_match_error', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Start periodic matchmaking processing
 */
function startMatchmakingProcessor(io, intervalMs = 2000) {
  // Process more frequently (every 2 seconds) for faster matching
  setInterval(() => {
    processMatchmakingQueue(io);
  }, intervalMs);
}

/**
 * Get queue status
 */
function getQueueStatus() {
  return {
    queueSize: matchmakingQueue.size,
    activeMatches: activeMatches.size
  };
}

/**
 * Track socket in active match
 */
function addSocketToMatch(matchId, socketId) {
  if (!activeMatches.has(matchId)) {
    activeMatches.set(matchId, new Set());
  }
  activeMatches.get(matchId).add(socketId);
}

/**
 * Remove socket from active match
 */
function removeSocketFromMatch(matchId, socketId) {
  if (activeMatches.has(matchId)) {
    activeMatches.get(matchId).delete(socketId);
    if (activeMatches.get(matchId).size === 0) {
      activeMatches.delete(matchId);
    }
  }
}

/**
 * Get detailed queue information for debugging
 */
function getQueueDetails() {
  const queueDetails = [];
  for (const [userId, queueData] of matchmakingQueue.entries()) {
    queueDetails.push({
      userId,
      socketId: queueData.socketId,
      matchType: queueData.matchType,
      language: queueData.language,
      matchSize: queueData.matchSize,
      timestamp: queueData.timestamp
    });
  }
  return queueDetails;
}

module.exports = {
  addToQueue,
  removeFromQueue,
  processMatchmakingQueue,
  startMatchmakingProcessor,
  getQueueStatus,
  getQueueDetails,
  addSocketToMatch,
  removeSocketFromMatch,
  getPlayerDataForMatchmaking
};

