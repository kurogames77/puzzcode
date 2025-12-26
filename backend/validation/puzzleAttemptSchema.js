const { z } = require('zod');

const puzzleAttemptSchema = z.object({
  levelId: z.string().min(1, 'levelId is required'),
  lessonId: z.union([z.string().min(1), z.null(), z.undefined()]).optional(),
  success: z.boolean(),
  attemptTime: z.union([z.number().nonnegative().max(60 * 60, 'attemptTime is unrealistic'), z.null(), z.undefined()]).optional(),
  codeSubmitted: z.union([z.string(), z.null(), z.undefined(), z.literal('')]).optional(),
  expectedOutput: z.union([z.string(), z.null(), z.undefined(), z.literal('')]).optional(),
  actualOutput: z.union([z.string(), z.null(), z.undefined(), z.literal('')]).optional(),
  attemptId: z.union([z.string().min(4).max(128), z.null(), z.undefined()]).optional(),
}).passthrough(); // Allow extra fields to pass through

function validatePuzzleAttempt(body) {
  const result = puzzleAttemptSchema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const path = issue.path.join('.') || 'root';
      return `${path}: ${issue.message} (received: ${JSON.stringify(body[path] || body[issue.path[0]])})`;
    });
    console.error('Validation failed:', {
      body,
      errors,
      issues: result.error.issues
    });
    return {
      valid: false,
      errors,
    };
  }
  return { valid: true, data: result.data };
}

module.exports = {
  puzzleAttemptSchema,
  validatePuzzleAttempt,
};
