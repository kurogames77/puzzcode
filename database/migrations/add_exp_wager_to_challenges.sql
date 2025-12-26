-- Add exp_wager column to battle_challenges table
-- This allows challenges to specify how much EXP will be wagered

ALTER TABLE battle_challenges 
ADD COLUMN IF NOT EXISTS exp_wager INTEGER DEFAULT 100;

-- Add comment to explain the column
COMMENT ON COLUMN battle_challenges.exp_wager IS 'Amount of EXP wagered by both players. Winner takes all.';

