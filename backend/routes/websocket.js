/**
 * WebSocket Event Handlers for Real-time Multiplayer
 */

const pool = require('../db');
const logger = require('../utils/logger');
const {
  addToQueue,
  removeFromQueue,
  addSocketToMatch,
  removeSocketFromMatch
} = require('../services/websocketMatchmaking');

// Store io instance for use in handlers
let ioInstance = null;

/**
 * Setup WebSocket event handlers
 * @param {object} io - Socket.IO server instance
 */
function setupWebSocketHandlers(io) {
  // Store io instance for use in handlers
  ioInstance = io;
  
  // Connection middleware
  io.use(require('../middleware/websocketAuth').authenticateSocket);

  io.on('connection', (socket) => {
    const userId = socket.userId;
    const username = socket.user.username;

    logger.log('websocket_connected', {
      userId,
      username,
      socketId: socket.id
    });

    // Automatically join user's personal room on connection
    // This ensures they can receive notifications even if they haven't explicitly joined
    socket.join(`user:${userId}`);
    logger.info('user_auto_joined_personal_room', {
      userId,
      socketId: socket.id
    });

    // Update user session to mark as online - use proper upsert pattern
    // First, close any old open sessions for this user
    pool.query(
      `UPDATE user_sessions 
       SET session_end = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND session_end IS NULL`,
      [userId]
    ).catch(err => {
      logger.error('close_old_sessions_error', { error: err.message });
    });

    // Then create a new active session
    pool.query(
      `INSERT INTO user_sessions (user_id, session_start, session_end)
       VALUES ($1, CURRENT_TIMESTAMP, NULL)`,
      [userId]
    ).catch(err => {
      logger.error('create_session_error', { error: err.message });
    });

    /**
     * Join matchmaking queue
     */
    socket.on('join_matchmaking_queue', async (data) => {
      try {
        const {
          matchType = 'ranked',
          language = 'python',
          matchSize = 3 // Default to 3 for ranked (min 3, max 5)
        } = data || {};

        // Check if user has enough EXP
        const statsCheck = await pool.query(
          `SELECT exp FROM student_statistics WHERE user_id = $1`,
          [userId]
        );
        const currentExp = statsCheck.rows[0]?.exp || 0;
        if (currentExp < 100) {
          socket.emit('matchmaking_error', {
            error: 'Insufficient EXP. You need at least 100 EXP to join matchmaking.',
            currentExp,
            requiredExp: 100
          });
          return;
        }

        addToQueue(userId, socket.id, { matchType, language, matchSize });

        socket.emit('matchmaking_queued', {
          message: 'Added to matchmaking queue',
          matchType,
          language,
          matchSize
        });
        
        // Trigger immediate matchmaking check (don't wait for next interval)
        // This makes matching much faster when players join
        setTimeout(() => {
          const { processMatchmakingQueue } = require('../services/websocketMatchmaking');
          processMatchmakingQueue(io).catch(err => {
            logger.error('immediate_matchmaking_trigger_error', {
              error: err.message,
              stack: err.stack
            });
          });
        }, 500); // Small delay to ensure player is fully added to queue
        
        // Broadcast to all sockets that a player joined the queue (for showing queue status)
        // Get player info for the broadcast
        const playerInfoResult = await pool.query(
          `SELECT 
            u.id, u.username, u.first_name, u.last_name, u.avatar_url,
            ss.rank_name
          FROM users u
          LEFT JOIN student_statistics ss ON ss.user_id = u.id
          WHERE u.id = $1`,
          [userId]
        );
        
        if (playerInfoResult.rows.length > 0) {
          const playerInfo = playerInfoResult.rows[0];
          // Emit to all sockets in the matchmaking namespace
          io.emit('player_joined_matchmaking', {
            userId: playerInfo.id,
            username: playerInfo.username,
            name: `${playerInfo.first_name || ''} ${playerInfo.last_name || ''}`.trim() || playerInfo.username,
            avatar: playerInfo.avatar_url,
            rank: playerInfo.rank_name || 'novice',
            matchType,
            language,
            matchSize
          });
        }

        logger.info('player_joined_queue_ws', {
          userId,
          socketId: socket.id,
          matchType,
          language,
          matchSize,
          queueSize: require('../services/websocketMatchmaking').getQueueStatus().queueSize
        });
      } catch (error) {
        logger.error('join_matchmaking_queue_error', {
          userId,
          error: error.message,
          stack: error.stack
        });
        socket.emit('matchmaking_error', {
          error: 'Failed to join matchmaking queue'
        });
      }
    });

    /**
     * Leave matchmaking queue
     */
    socket.on('leave_matchmaking_queue', () => {
      try {
        removeFromQueue(userId);
        socket.emit('matchmaking_left', {
          message: 'Left matchmaking queue'
        });
        logger.info('player_left_queue_ws', { userId, socketId: socket.id });
      } catch (error) {
        logger.error('leave_matchmaking_queue_error', {
          userId,
          error: error.message
        });
      }
    });

    /**
     * Subscribe to matchmaking updates for a specific match
     */
    socket.on('subscribe_matchmaking_updates', (data) => {
      try {
        const { matchId } = data || {};
        if (matchId) {
          socket.join(`matchmaking_${matchId}`);
          logger.info('subscribed_to_matchmaking_updates', {
            userId,
            matchId,
            socketId: socket.id
          });
        }
      } catch (error) {
        logger.error('subscribe_matchmaking_updates_error', {
          userId,
          error: error.message
        });
      }
    });

    /**
     * Join battle room
     */
    socket.on('join_battle', async (data) => {
      try {
        const { matchId } = data || {};
        if (!matchId) {
          socket.emit('battle_error', { error: 'Match ID required' });
          return;
        }

        // Verify user is participant
        const participantResult = await pool.query(
          `SELECT * FROM multiplayer_match_participants
           WHERE match_id = $1 AND user_id = $2`,
          [matchId, userId]
        );

        if (participantResult.rows.length === 0) {
          socket.emit('battle_error', { error: 'You are not a participant in this match' });
          return;
        }

        // Join room
        socket.join(`battle:${matchId}`);
        addSocketToMatch(matchId, socket.id);

        // Get current participants count for confirmation
        const room = io.sockets.adapter.rooms.get(`battle:${matchId}`);
        const participantCount = room ? room.size : 1;

        logger.info('player_joined_battle_room', {
          userId,
          matchId,
          socketId: socket.id,
          roomSize: participantCount,
          allSocketsInRoom: room ? Array.from(room).slice(0, 10) : []
        });

        socket.emit('battle_joined', { 
          matchId,
          participantCount,
          message: 'Successfully joined battle room'
        });

        // Notify other players
        socket.to(`battle:${matchId}`).emit('player_joined_battle', {
          userId,
          username,
          participantCount
        });

        logger.info('player_joined_battle_ws', {
          userId,
          matchId,
          socketId: socket.id
        });
      } catch (error) {
        logger.error('join_battle_error', {
          userId,
          error: error.message,
          stack: error.stack
        });
        socket.emit('battle_error', { error: 'Failed to join battle' });
      }
    });

    /**
     * Leave battle room
     */
    socket.on('leave_battle', (data) => {
      try {
        const { matchId } = data || {};
        if (matchId) {
          socket.leave(`battle:${matchId}`);
          removeSocketFromMatch(matchId, socket.id);
          socket.to(`battle:${matchId}`).emit('player_left_battle', {
            userId,
            username
          });
        }
      } catch (error) {
        logger.error('leave_battle_error', {
          userId,
          error: error.message
        });
      }
    });

    /**
     * Exit battle (forfeit) - IMMEDIATE notification, database update happens via HTTP
     */
    socket.on('exit_battle', async (data) => {
      try {
        const { matchId } = data || {};
        if (!matchId) {
          socket.emit('exit_error', { error: 'Match ID required' });
          return;
        }

        // Verify user is participant (quick check)
        const participantResult = await pool.query(
          `SELECT user_id FROM multiplayer_match_participants
           WHERE match_id = $1 AND user_id = $2`,
          [matchId, userId]
        );

        if (participantResult.rows.length === 0) {
          socket.emit('exit_error', { error: 'You are not a participant in this match' });
          return;
        }

        // Get opponent IDs for immediate notification
        const opponentsResult = await pool.query(
          `SELECT user_id FROM multiplayer_match_participants
           WHERE match_id = $1 AND user_id != $2`,
          [matchId, userId]
        );
        const winnerIds = opponentsResult.rows.map(r => r.user_id);

        // Get match type to calculate correct EXP reward
        const matchResult = await pool.query(
          `SELECT match_type FROM multiplayer_matches WHERE id = $1`,
          [matchId]
        );
        const isChallengeMatch = matchResult.rows.length > 0 && matchResult.rows[0].match_type === 'challenge';
        
        // Calculate EXP reward for winners (challenge matches use wager, ranked use base amount)
        let winExp = 150; // Default for ranked matches
        if (isChallengeMatch) {
          try {
            const wagerResult = await pool.query(
              `SELECT COALESCE(exp_wager, 100) AS exp_wager
               FROM battle_challenges
               WHERE match_id = $1
               ORDER BY responded_at DESC NULLS LAST, created_at DESC
               LIMIT 1`,
              [matchId]
            );
            if (wagerResult.rows.length > 0) {
              const wager = parseInt(wagerResult.rows[0].exp_wager || 100, 10);
              winExp = wager * 2; // Winner gets 2x wager (same as normal win)
            }
          } catch (wagerErr) {
            logger.warn('challenge_wager_lookup_failed_exit_ws', {
              matchId,
              error: wagerErr.message
            });
            // Default to 200 (100 * 2) for challenge matches if lookup fails
            winExp = 200;
          }
        }

        // NOTIFY OTHER PLAYERS IMMEDIATELY (before any database operations)
        // This ensures instant notification
        // Use io parameter to broadcast to all sockets in the room
        const room = io.sockets.adapter.rooms.get(`battle:${matchId}`);
        const socketIds = room ? Array.from(room) : [];
        
        logger.info('exit_battle_ws_check', {
          matchId,
          exitedUserId: userId,
          roomSize: room ? room.size : 0,
          roomExists: !!room,
          socketIds: socketIds.length,
          winnerIds,
          isChallengeMatch,
          winExp
        });

        // Create exit notification payload
        const exitNotification = {
          matchId,
          exitedUserId: userId,
          exitedUsername: username,
          winnerIds,
          matchStatus: 'completed',
          message: 'Your opponent has left the battle. You win by forfeit!',
          timestamp: Date.now(),
          expGained: winExp
        };

        const battleUpdate = {
          type: 'opponent_exited',
          payload: {
            matchId,
            exitedUserId: userId,
            matchStatus: 'completed',
            winners: winnerIds,
            timestamp: Date.now()
          }
        };

        const completionEvent = {
          matchId,
          status: 'completed',
          winners: winnerIds,
          exitedUserId: userId,
          timestamp: Date.now()
        };

        // CRITICAL: Send notifications BEFORE leaving the room
        // Send to battle room (if players are in the room)
        // Use socket.to() to exclude the exiting player from the room broadcast
        if (room && room.size > 0) {
          socket.to(`battle:${matchId}`).emit('opponent_exited', exitNotification);
          socket.to(`battle:${matchId}`).emit('battle_update', battleUpdate);
          socket.to(`battle:${matchId}`).emit('battle_completed', completionEvent);
          
          logger.info('broadcasting_exit_notification_ws', {
            matchId,
            exitedUserId: userId,
            roomSize: room.size,
            winnerIds,
            socketIds: socketIds.slice(0, 5) // Log first 5 socket IDs
          });
        }

        // ALWAYS send to each winner's personal user room (PRIMARY method)
        // This ensures notification even if they haven't joined the battle room yet
        // or if the battle room is empty
        for (const winnerId of winnerIds) {
          io.to(`user:${winnerId}`).emit('opponent_exited', exitNotification);
          io.to(`user:${winnerId}`).emit('battle_update', battleUpdate);
          io.to(`user:${winnerId}`).emit('battle_completed', completionEvent);
          logger.info('sent_exit_notification_to_user_room_ws', {
            matchId,
            winnerId,
            exitedUserId: userId
          });
        }

        // Also broadcast to all sockets in the battle room using io.to() as backup
        // This catches any edge cases where socket.to() might miss someone
        if (room && room.size > 0) {
          io.to(`battle:${matchId}`).emit('opponent_exited', exitNotification);
          io.to(`battle:${matchId}`).emit('battle_update', battleUpdate);
          io.to(`battle:${matchId}`).emit('battle_completed', completionEvent);
        }

        if (!room || room.size === 0) {
          logger.warn('no_opponents_in_room_ws', {
            matchId,
            roomSize: room ? room.size : 0,
            roomExists: !!room,
            sentToUserRooms: winnerIds.length,
            allRooms: Array.from(io.sockets.adapter.rooms.keys()).filter(k => k.includes('battle'))
          });
        }

        // Small delay to ensure notifications are sent before leaving
        // This prevents race conditions where the socket disconnects too quickly
        await new Promise(resolve => setTimeout(resolve, 100));

        // Leave the battle room AFTER notifications are sent
        socket.leave(`battle:${matchId}`);
        removeSocketFromMatch(matchId, socket.id);

        // Confirm to exiting player
        socket.emit('exit_confirmed', {
          matchId,
          message: 'You have left the battle'
        });

        logger.info('player_exited_battle_ws', {
          userId,
          matchId,
          socketId: socket.id,
          notifiedOpponents: winnerIds.length
        });
      } catch (error) {
        logger.error('exit_battle_ws_error', {
          userId,
          error: error.message,
          stack: error.stack
        });
        socket.emit('exit_error', { error: 'Failed to exit battle' });
      }
    });

    /**
     * Battle update (code submission, progress, etc.)
     */
    socket.on('battle_update', async (data) => {
      try {
        const { matchId, type, payload } = data || {};
        if (!matchId || !type) {
          return;
        }

        // Verify user is participant
        const participantResult = await pool.query(
          `SELECT * FROM multiplayer_match_participants
           WHERE match_id = $1 AND user_id = $2`,
          [matchId, userId]
        );

        if (participantResult.rows.length === 0) {
          return;
        }

        // Broadcast update to other players in the battle
        socket.to(`battle:${matchId}`).emit('battle_update', {
          type,
          payload: {
            ...payload,
            userId,
            username,
            timestamp: Date.now()
          }
        });

        logger.info('battle_update_ws', {
          userId,
          matchId,
          type,
          socketId: socket.id
        });
      } catch (error) {
        logger.error('battle_update_error', {
          userId,
          error: error.message,
          stack: error.stack
        });
      }
    });

    /**
     * Submit solution
     */
    socket.on('submit_solution', async (data) => {
      try {
        const { matchId, code, language = 'python' } = data || {};
        if (!matchId || !code) {
          socket.emit('submit_error', { error: 'Match ID and code required' });
          return;
        }

        // Use existing battle submission logic from battle.js
        // For now, emit to HTTP endpoint handler
        // In production, you might want to call the function directly
        socket.emit('submit_received', { matchId });

        // Broadcast to other players that solution was submitted
        socket.to(`battle:${matchId}`).emit('opponent_submitted', {
          userId,
          username
        });
      } catch (error) {
        logger.error('submit_solution_error', {
          userId,
          error: error.message,
          stack: error.stack
        });
        socket.emit('submit_error', { error: 'Failed to submit solution' });
      }
    });

    /**
     * Player status update (online/offline)
     */
    socket.on('player_status', (data) => {
      try {
        const { status } = data || {};
        // Broadcast status to relevant rooms
        socket.broadcast.emit('player_status_update', {
          userId,
          username,
          status: status || 'online'
        });
      } catch (error) {
        logger.error('player_status_error', {
          userId,
          error: error.message
        });
      }
    });

    /**
     * Join user's personal room for notifications
     */
    socket.on('join_user_room', (data) => {
      try {
        const { userId } = data || {};
        if (userId && userId === socket.userId) {
          socket.join(`user:${userId}`);
          logger.info('user_joined_personal_room', {
            userId,
            socketId: socket.id
          });
        }
      } catch (error) {
        logger.error('join_user_room_error', {
          userId: socket.userId,
          error: error.message
        });
      }
    });

    /**
     * Leave user's personal room
     */
    socket.on('leave_user_room', (data) => {
      try {
        const { userId } = data || {};
        if (userId && userId === socket.userId) {
          socket.leave(`user:${userId}`);
          logger.info('user_left_personal_room', {
            userId,
            socketId: socket.id
          });
        }
      } catch (error) {
        logger.error('leave_user_room_error', {
          userId: socket.userId,
          error: error.message
        });
      }
    });

    /**
     * Disconnect handler
     */
    socket.on('disconnect', async (reason) => {
      try {
        // Remove from matchmaking queue
        removeFromQueue(userId);

        // Check for active battles where this user is a participant
        // If they disconnect during an active battle, treat it as a forfeit
        try {
          const activeBattlesResult = await pool.query(
            `SELECT 
              m.id as match_id,
              m.status,
              m.started_at
            FROM multiplayer_matches m
            JOIN multiplayer_match_participants mmp ON m.id = mmp.match_id
            WHERE mmp.user_id = $1
              AND m.status = 'active'
              AND mmp.is_winner IS NULL`,
            [userId]
          );

          if (activeBattlesResult.rows.length > 0) {
            logger.info('disconnect_during_active_battle', {
              userId,
              username,
              activeBattles: activeBattlesResult.rows.length,
              matchIds: activeBattlesResult.rows.map(r => r.match_id)
            });

            // Process each active battle
            for (const battle of activeBattlesResult.rows) {
              const matchId = battle.match_id;
              const client = await pool.connect();

              try {
                await client.query('BEGIN');

                // Get match info and lock it
                const matchResult = await client.query(
                  `SELECT status, started_at, match_type FROM multiplayer_matches WHERE id = $1 FOR UPDATE`,
                  [matchId]
                );

                if (matchResult.rows.length === 0) {
                  await client.query('ROLLBACK');
                  client.release();
                  continue;
                }

                const match = matchResult.rows[0];
                const isChallengeMatch = match.match_type === 'challenge';

                // Skip if already completed
                if (match.status === 'completed') {
                  await client.query('ROLLBACK');
                  client.release();
                  continue;
                }

                // Get opponent IDs (winners)
                const opponentsResult = await client.query(
                  `SELECT user_id FROM multiplayer_match_participants
                   WHERE match_id = $1 AND user_id != $2`,
                  [matchId, userId]
                );
                const winnerIds = opponentsResult.rows.map(r => r.user_id);

                // Calculate EXP reward for winners (challenge matches use wager, ranked use base amount)
                let winExp = 150; // Default for ranked matches
                if (isChallengeMatch) {
                  try {
                    const wagerResult = await client.query(
                      `SELECT COALESCE(exp_wager, 100) AS exp_wager
                       FROM battle_challenges
                       WHERE match_id = $1
                       ORDER BY responded_at DESC NULLS LAST, created_at DESC
                       LIMIT 1`,
                      [matchId]
                    );
                    if (wagerResult.rows.length > 0) {
                      const wager = parseInt(wagerResult.rows[0].exp_wager || 100, 10);
                      winExp = wager * 2; // Winner gets 2x wager (same as normal win)
                    }
                  } catch (wagerErr) {
                    logger.warn('challenge_wager_lookup_failed_disconnect', {
                      matchId,
                      error: wagerErr.message
                    });
                    // Default to 200 (100 * 2) for challenge matches if lookup fails
                    winExp = 200;
                  }
                }

                // NOTIFY OTHER PLAYERS IMMEDIATELY via WebSocket (before database operations)
                if (io && winnerIds.length > 0) {
                  const exitNotification = {
                    matchId,
                    exitedUserId: userId,
                    exitedUsername: username,
                    winnerIds,
                    matchStatus: 'completed',
                    message: 'Your opponent has left the battle. You win by forfeit!',
                    timestamp: Date.now(),
                    expGained: winExp
                  };

                  const battleUpdate = {
                    type: 'opponent_exited',
                    payload: {
                      matchId,
                      exitedUserId: userId,
                      matchStatus: 'completed',
                      winners: winnerIds,
                      timestamp: Date.now()
                    }
                  };

                  const completionEvent = {
                    matchId,
                    status: 'completed',
                    winners: winnerIds,
                    exitedUserId: userId,
                    timestamp: Date.now()
                  };

                  // Send to battle room (if players are in the room)
                  const room = io.sockets.adapter.rooms.get(`battle:${matchId}`);
                  if (room && room.size > 0) {
                    logger.info('broadcasting_exit_notification_disconnect', {
                      matchId,
                      exitedUserId: userId,
                      roomSize: room.size,
                      winnerIds
                    });

                    io.to(`battle:${matchId}`).emit('opponent_exited', exitNotification);
                    io.to(`battle:${matchId}`).emit('battle_update', battleUpdate);
                    io.to(`battle:${matchId}`).emit('battle_completed', completionEvent);
                  }

                  // ALSO send to each winner's personal user room (redundancy)
                  for (const winnerId of winnerIds) {
                    io.to(`user:${winnerId}`).emit('opponent_exited', exitNotification);
                    io.to(`user:${winnerId}`).emit('battle_update', battleUpdate);
                    io.to(`user:${winnerId}`).emit('battle_completed', completionEvent);
                    logger.info('sent_exit_notification_to_user_room_disconnect', {
                      matchId,
                      winnerId,
                      exitedUserId: userId
                    });
                  }
                }

                // Mark exiting player as forfeited (not winner)
                await client.query(
                  `UPDATE multiplayer_match_participants
                   SET completed_code = false, is_winner = false
                   WHERE match_id = $1 AND user_id = $2`,
                  [matchId, userId]
                );

                // Apply EXP penalty (100 EXP for exiting)
                const expLoss = 100;
                await client.query(
                  `UPDATE multiplayer_match_participants
                   SET exp_lost = $1
                   WHERE match_id = $2 AND user_id = $3`,
                  [expLoss, matchId, userId]
                );

                // Get current EXP to calculate new rank for exiting player
                const exitStats = await client.query(
                  `SELECT exp FROM student_statistics WHERE user_id = $1`,
                  [userId]
                );
                const exitCurrentExp = exitStats.rows[0]?.exp || 0;
                const exitNewExp = Math.max(0, exitCurrentExp - expLoss);
                
                // Recalculate rank from new EXP (rank can decrease)
                const { getRankFromExp, normalizeExp } = require('../services/expRankService');
                const exitRankData = getRankFromExp(exitNewExp);
                const exitNormalizedExp = normalizeExp(exitNewExp);

                await client.query(
                  `UPDATE student_statistics
                   SET exp = $1,
                       normalized_exp = $2,
                       rank_name = $3,
                       rank_index = $4,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE user_id = $5`,
                  [exitNewExp, exitNormalizedExp, exitRankData.rankName, exitRankData.rankIndex, userId]
                );

                // Award win to remaining players if match is not already completed
                if (match.status !== 'completed' && winnerIds.length > 0) {
                  // Use calculated winExp (already computed above based on match type and wager)

                  for (const winnerId of winnerIds) {
                    // Update participant as winner
                    await client.query(
                      `UPDATE multiplayer_match_participants
                       SET is_winner = true,
                           completed_code = true,
                           exp_gained = $1
                       WHERE match_id = $2 AND user_id = $3`,
                      [winExp, matchId, winnerId]
                    );

                    // Update winner's EXP and rank
                    const winnerStats = await client.query(
                      `SELECT exp FROM student_statistics WHERE user_id = $1`,
                      [winnerId]
                    );
                    const winnerCurrentExp = winnerStats.rows[0]?.exp || 0;
                    const winnerNewExp = Math.min(10000, winnerCurrentExp + winExp);
                    const winnerRankData = getRankFromExp(winnerNewExp);
                    const winnerNormalizedExp = normalizeExp(winnerNewExp);

                    await client.query(
                      `UPDATE student_statistics
                       SET exp = $1,
                           normalized_exp = $2,
                           rank_name = $3,
                           rank_index = $4,
                           updated_at = CURRENT_TIMESTAMP
                       WHERE user_id = $5`,
                      [winnerNewExp, winnerNormalizedExp, winnerRankData.rankName, winnerRankData.rankIndex, winnerId]
                    );
                  }

                  // Mark match as completed
                  const completedAt = new Date();
                  let durationSeconds = null;
                  if (match.started_at) {
                    const startedAt = new Date(match.started_at);
                    durationSeconds = Math.max(0, Math.floor((completedAt - startedAt) / 1000));
                  }

                  await client.query(
                    `UPDATE multiplayer_matches
                     SET status = 'completed',
                         completed_at = CURRENT_TIMESTAMP,
                         duration_seconds = COALESCE($2, duration_seconds)
                     WHERE id = $1`,
                    [matchId, durationSeconds]
                  );
                }

                await client.query('COMMIT');
                client.release();

                logger.info('disconnect_battle_forfeit_processed', {
                  userId,
                  matchId,
                  winnerIds,
                  expLoss
                });
              } catch (battleError) {
                try {
                  await client.query('ROLLBACK');
                } catch (_) {
                  // ignore rollback errors
                }
                client.release();
                logger.error('disconnect_battle_forfeit_error', {
                  userId,
                  matchId,
                  error: battleError.message,
                  stack: battleError.stack
                });
              }
            }
          }
        } catch (battleCheckError) {
          logger.error('disconnect_battle_check_error', {
            userId,
            error: battleCheckError.message,
            stack: battleCheckError.stack
          });
        }

        // Update session - use subquery for ORDER BY since UPDATE doesn't support it directly
        pool.query(
          `UPDATE user_sessions 
           SET session_end = CURRENT_TIMESTAMP,
               duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - session_start))::INTEGER
           WHERE id = (
             SELECT id
             FROM user_sessions
             WHERE user_id = $1 AND session_end IS NULL
             ORDER BY session_start DESC
             LIMIT 1
           )`,
          [userId]
        ).catch(err => {
          logger.error('update_session_on_disconnect_error', { error: err.message });
        });

        logger.log('websocket_disconnected', {
          userId,
          username,
          socketId: socket.id,
          reason
        });
      } catch (error) {
        logger.error('disconnect_handler_error', {
          userId,
          error: error.message
        });
      }
    });
  });

  return io;
}

module.exports = {
  setupWebSocketHandlers
};

