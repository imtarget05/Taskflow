// Pure scoring algorithm — rule-based, deterministic, no DB access.
// Score = w1*skillMatch + w2*availability + w3*priority + w4*history + w5*workloadBalance

export interface ScoringWeights {
  skillMatch: number;
  availability: number;
  priority: number;
  history: number;
  workloadBalance: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  skillMatch: 0.40,
  availability: 0.25,
  priority: 0.20,
  history: 0.10,
  workloadBalance: 0.05,
};

export interface ScoreFactors {
  skillMatch: number;
  availability: number;
  priority: number;
  history: number;
  workloadBalance: number;
}

export interface ScoringInput {
  weights?: Partial<ScoringWeights>;
  factors: ScoreFactors;
  taskTags?: string[];
  userSkills?: { skill: string; level: number }[];
  currentWorkload?: number;
  maxWorkload?: number;
  completionRate?: number;
  isAvailableNow?: boolean;
}

/**
 * Tính điểm đề xuất cho một task-user pair.
 * Trả về score 0-1 và factors đã chuẩn hóa.
 */
export function computeScore(input: ScoringInput): { score: number; factors: ScoreFactors; weights: ScoringWeights } {
  const weights = { ...DEFAULT_WEIGHTS, ...input.weights };

  // Normalize weights to sum to 1
  const totalWeight = weights.skillMatch + weights.availability + weights.priority + weights.history + weights.workloadBalance;
  const normalized: ScoringWeights = {
    skillMatch: weights.skillMatch / totalWeight,
    availability: weights.availability / totalWeight,
    priority: weights.priority / totalWeight,
    history: weights.history / totalWeight,
    workloadBalance: weights.workloadBalance / totalWeight,
  };

  const factors: ScoreFactors = {
    skillMatch: clamp01(computeSkillMatch(input.taskTags ?? [], input.userSkills ?? [])),
    availability: clamp01(input.isAvailableNow ? 1.0 : 0.3),
    priority: clamp01(input.factors.priority),
    history: clamp01(input.completionRate ?? 0.5),
    workloadBalance: clamp01(computeWorkloadBalance(input.currentWorkload ?? 0, input.maxWorkload ?? 10)),
  };

  const score =
    normalized.skillMatch * factors.skillMatch +
    normalized.availability * factors.availability +
    normalized.priority * factors.priority +
    normalized.history * factors.history +
    normalized.workloadBalance * factors.workloadBalance;

  return { score: clamp01(score), factors, weights: normalized };
}

function computeSkillMatch(taskTags: string[], userSkills: { skill: string; level: number }[]): number {
  if (taskTags.length === 0) return 0.5;
  if (userSkills.length === 0) return 0.1;

  let matchScore = 0;
  for (const tag of taskTags) {
    const normalizedTag = tag.toLowerCase().trim();
    const match = userSkills.find(
      (us) =>
        us.skill.toLowerCase() === normalizedTag ||
        normalizedTag.includes(us.skill.toLowerCase()) ||
        us.skill.toLowerCase().includes(normalizedTag)
    );
    if (match) {
      matchScore += match.level / 5;
    }
  }
  return matchScore / taskTags.length;
}

function computeWorkloadBalance(current: number, max: number): number {
  if (max <= 0) return 0.5;
  const ratio = current / max;
  if (ratio <= 0.3) return 1.0;
  if (ratio <= 0.5) return 0.8;
  if (ratio <= 0.7) return 0.5;
  if (ratio <= 0.9) return 0.3;
  return 0.1;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Priority mapping: URGENT=1.0, HIGH=0.75, MEDIUM=0.5, LOW=0.25
 */
export function priorityToScore(priority: string): number {
  switch (priority.toUpperCase()) {
    case 'URGENT':
      return 1.0;
    case 'HIGH':
      return 0.75;
    case 'MEDIUM':
      return 0.5;
    case 'LOW':
      return 0.25;
    default:
      return 0.5;
  }
}

/**
 * Generate Vietnamese reason for the recommendation
 */
export function generateReason(factors: ScoreFactors, score: number, taskTitle: string): string {
  const parts: string[] = [];

  if (factors.skillMatch >= 0.7) parts.push('kỹ năng phù hợp');
  else if (factors.skillMatch >= 0.4) parts.push('có kỹ năng liên quan');

  if (factors.workloadBalance >= 0.8) parts.push('workload nhẹ');
  else if (factors.workloadBalance <= 0.3) parts.push('workload cao');

  if (factors.priority >= 0.75) parts.push('ưu tiên cao');

  if (factors.history >= 0.7) parts.push('từng hoàn thành task tương tự');

  if (parts.length === 0) {
    if (score >= 0.6) return `Đề xuất "${taskTitle}" — phù hợp với profile của bạn`;
    return `Có thể xem xét "${taskTitle}"`;
  }

  return `Đề xuất "${taskTitle}" vì: ${parts.join(', ')}`;
}
