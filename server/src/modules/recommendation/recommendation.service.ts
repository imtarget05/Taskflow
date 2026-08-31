import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';
import { computeScore, priorityToScore, generateReason, ScoringWeights, DEFAULT_WEIGHTS } from './scoring';

export interface UserSkillInput {
  skill: string;
  level: number;
}

export interface AvailabilitySlot {
  dayOfWeek: number;
  morning?: boolean;
  afternoon?: boolean;
  evening?: boolean;
}

export interface RecommendationResult {
  id: string;
  userId: string;
  projectId: string;
  taskId: string;
  score: number;
  reason: string;
  factors: {
    skillMatch: number;
    availability: number;
    priority: number;
    history: number;
    workloadBalance: number;
  };
  status: string;
  createdAt: Date;
  expiresAt: Date | null;
  task?: {
    id: string;
    title: string;
    priority: string;
    dueDate: Date | null;
  };
}

const MAX_WORKLOAD_DEFAULT = 10;
const RECOMMENDATION_TTL_DAYS = 7;

/**
 * Lấy weights config từ DB, fallback về DEFAULT_WEIGHTS
 */
export async function getConfig(): Promise<ScoringWeights> {
  const config = await prisma.recommendationConfig.findUnique({
    where: { key: 'weights' },
  });

  if (!config) return DEFAULT_WEIGHTS;

  const value = config.value as Partial<ScoringWeights>;
  return { ...DEFAULT_WEIGHTS, ...value };
}

/**
 * Cập nhật weights config
 */
export async function updateConfig(weights: Partial<ScoringWeights>): Promise<ScoringWeights> {
  const current = await getConfig();
  const updated = { ...current, ...weights };

  await prisma.recommendationConfig.upsert({
    where: { key: 'weights' },
    update: { value: updated as unknown as object },
    create: { key: 'weights', value: updated as unknown as object },
  });

  return updated;
}

/**
 * Lấy skills của user
 */
export async function getUserSkills(userId: string) {
  return prisma.userSkill.findMany({
    where: { userId },
    orderBy: { level: 'desc' },
  });
}

/**
 * Cập nhật skills của user (xóa cũ, thêm mới)
 */
export async function updateUserSkills(userId: string, skills: UserSkillInput[]) {
  await prisma.userSkill.deleteMany({ where: { userId } });

  if (skills.length === 0) return [];

  await prisma.userSkill.createMany({
    data: skills.map((s) => ({
      userId,
      skill: s.skill.toLowerCase().trim(),
      level: s.level,
    })),
  });

  return getUserSkills(userId);
}

/**
 * Lấy availability của user
 */
export async function getUserAvailability(userId: string) {
  return prisma.userAvailability.findMany({
    where: { userId },
    orderBy: { dayOfWeek: 'asc' },
  });
}

/**
 * Cập nhật availability của user
 */
export async function updateUserAvailability(userId: string, availability: AvailabilitySlot[]) {
  await prisma.userAvailability.deleteMany({ where: { userId } });

  if (availability.length === 0) return [];

  await prisma.userAvailability.createMany({
    data: availability.map((a) => ({
      userId,
      dayOfWeek: a.dayOfWeek,
      morning: a.morning ?? true,
      afternoon: a.afternoon ?? true,
      evening: a.evening ?? false,
    })),
  });

  return getUserAvailability(userId);
}

/**
 * Kiểm tra user có đang trong giờ rảnh không (dựa trên ngày/giờ hiện tại)
 */
function isUserAvailableNow(availability: AvailabilitySlot[]): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();

  const todayAvailability = availability.find((a) => a.dayOfWeek === dayOfWeek);
  if (!todayAvailability) return false;

  if (hour >= 9 && hour < 12) return todayAvailability.morning ?? false;
  if (hour >= 12 && hour < 18) return todayAvailability.afternoon ?? false;
  return todayAvailability.evening ?? false;
}

/**
 * Tính completion rate của user (tỷ lệ task đã hoàn thành / tổng task assigned)
 */
async function getCompletionRate(userId: string): Promise<number> {
  const [completed, total] = await Promise.all([
    prisma.taskAssignment.count({
      where: {
        userId,
        task: { completed: true },
      },
    }),
    prisma.taskAssignment.count({
      where: { userId },
    }),
  ]);

  if (total === 0) return 0.5;
  return completed / total;
}

/**
 * Tính workload hiện tại (số task đang assigned chưa hoàn thành)
 */
async function getCurrentWorkload(userId: string): Promise<number> {
  return prisma.taskAssignment.count({
    where: {
      userId,
      task: { completed: false },
    },
  });
}

/**
 * Extract tags từ task title + description
 */
function extractTaskTags(task: { title: string; description: string | null }): string[] {
  const text = `${task.title} ${task.description ?? ''}`.toLowerCase();
  const tags: string[] = [];

  const skillKeywords = [
    'react', 'nodejs', 'node', 'typescript', 'javascript', 'css', 'html',
    'design', 'ui', 'ux', 'database', 'api', 'testing', 'test',
    'frontend', 'backend', 'fullstack', 'devops', 'deploy',
    'auth', 'security', 'performance', 'optimization', 'refactor',
    'bug', 'fix', 'feature', 'documentation', 'docs',
  ];

  for (const keyword of skillKeywords) {
    if (text.includes(keyword)) {
      tags.push(keyword);
    }
  }

  return tags;
}

/**
 * Tạo recommendations cho user
 */
export async function recommendForUser(
  userId: string,
  projectId?: string,
  limit = 10
): Promise<RecommendationResult[]> {
  const [weights, userSkills, availability, completionRate, currentWorkload] = await Promise.all([
    getConfig(),
    getUserSkills(userId),
    getUserAvailability(userId),
    getCompletionRate(userId),
    getCurrentWorkload(userId),
  ]);

  const isAvailableNow = isUserAvailableNow(availability);

  // Lấy tasks chưa hoàn thành, chưa assigned cho user này
  const whereClause: Record<string, unknown> = {
    completed: false,
    NOT: { assignments: { some: { userId } } },
  };
  if (projectId) whereClause.projectId = projectId;

  const tasks = await prisma.task.findMany({
    where: whereClause,
    include: {
      project: { select: { id: true, name: true } },
      assignments: { select: { userId: true } },
    },
    take: 50,
  });

  // Tính score cho mỗi task
  const scoredTasks = tasks.map((task) => {
    const taskTags = extractTaskTags(task);
    const priorityScore = priorityToScore(task.priority);

    const { score, factors } = computeScore({
      weights,
      factors: {
        skillMatch: 0,
        availability: 0,
        priority: priorityScore,
        history: 0,
        workloadBalance: 0,
      },
      taskTags,
      userSkills,
      currentWorkload,
      maxWorkload: MAX_WORKLOAD_DEFAULT,
      completionRate,
      isAvailableNow,
    });

    return {
      task,
      score,
      factors,
      reason: generateReason(factors, score, task.title),
    };
  });

  // Sort theo score giảm dần, lấy top N
  scoredTasks.sort((a, b) => b.score - a.score);
  const topTasks = scoredTasks.slice(0, limit);

  // Lưu recommendations vào DB
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + RECOMMENDATION_TTL_DAYS);

  const recommendations: RecommendationResult[] = [];

  for (const { task, score, factors, reason } of topTasks) {
    const rec = await prisma.taskRecommendation.create({
      data: {
        userId,
        projectId: task.projectId,
        taskId: task.id,
        score,
        reason,
        factors: factors as unknown as object,
        status: 'pending',
        expiresAt,
      },
    });

    recommendations.push({
      id: rec.id,
      userId: rec.userId,
      projectId: rec.projectId,
      taskId: rec.taskId,
      score: rec.score,
      reason: rec.reason,
      factors: factors as RecommendationResult['factors'],
      status: rec.status,
      createdAt: rec.createdAt,
      expiresAt: rec.expiresAt,
      task: {
        id: task.id,
        title: task.title,
        priority: task.priority,
        dueDate: task.dueDate,
      },
    });
  }

  return recommendations;
}

/**
 * Refresh recommendations (xóa cũ, tạo mới)
 */
export async function refreshRecommendations(userId: string, projectId?: string, limit = 10): Promise<RecommendationResult[]> {
  // Xóa recommendations cũ (pending)
  await prisma.taskRecommendation.deleteMany({
    where: {
      userId,
      status: 'pending',
      ...(projectId ? { projectId } : {}),
    },
  });

  return recommendForUser(userId, projectId, limit);
}

/**
 * Accept recommendation
 */
export async function acceptRecommendation(userId: string, recId: string, assign = true) {
  const rec = await prisma.taskRecommendation.findUnique({
    where: { id: recId },
  });

  if (!rec) {
    throw new AppError('Recommendation not found', StatusCodes.NOT_FOUND);
  }

  if (rec.userId !== userId) {
    throw new AppError('Forbidden', StatusCodes.FORBIDDEN);
  }

  if (rec.status !== 'pending') {
    throw new AppError(`Cannot accept recommendation with status: ${rec.status}`, StatusCodes.BAD_REQUEST);
  }

  // Cập nhật status
  const updated = await prisma.taskRecommendation.update({
    where: { id: recId },
    data: { status: 'accepted' },
  });

  // Nếu assign = true, tạo task assignment
  if (assign) {
    // Kiểm tra đã assigned chưa
    const existing = await prisma.taskAssignment.findUnique({
      where: { taskId_userId: { taskId: rec.taskId, userId } },
    });

    if (!existing) {
      await prisma.taskAssignment.create({
        data: {
          taskId: rec.taskId,
          userId,
        },
      });
    }
  }

  return updated;
}

/**
 * Dismiss recommendation
 */
export async function dismissRecommendation(userId: string, recId: string) {
  const rec = await prisma.taskRecommendation.findUnique({
    where: { id: recId },
  });

  if (!rec) {
    throw new AppError('Recommendation not found', StatusCodes.NOT_FOUND);
  }

  if (rec.userId !== userId) {
    throw new AppError('Forbidden', StatusCodes.FORBIDDEN);
  }

  if (rec.status !== 'pending') {
    throw new AppError(`Cannot dismiss recommendation with status: ${rec.status}`, StatusCodes.BAD_REQUEST);
  }

  return prisma.taskRecommendation.update({
    where: { id: recId },
    data: { status: 'dismissed' },
  });
}

/**
 * List recommendations của user
 */
export async function listRecommendations(userId: string, status?: string, limit = 20): Promise<RecommendationResult[]> {
  const recommendations = await prisma.taskRecommendation.findMany({
    where: {
      userId,
      ...(status ? { status } : {}),
    },
    orderBy: { score: 'desc' },
    take: limit,
    include: {
      task: {
        select: {
          id: true,
          title: true,
          priority: true,
          dueDate: true,
        },
      },
    },
  });

  return recommendations.map((rec) => ({
    id: rec.id,
    userId: rec.userId,
    projectId: rec.projectId,
    taskId: rec.taskId,
    score: rec.score,
    reason: rec.reason,
    factors: rec.factors as unknown as RecommendationResult['factors'],
    status: rec.status,
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt,
    task: rec.task ?? undefined,
  }));
}

/**
 * Lấy thống kê recommendations
 */
export async function getStats(userId: string) {
  const [total, pending, accepted, dismissed, avgScore] = await Promise.all([
    prisma.taskRecommendation.count({ where: { userId } }),
    prisma.taskRecommendation.count({ where: { userId, status: 'pending' } }),
    prisma.taskRecommendation.count({ where: { userId, status: 'accepted' } }),
    prisma.taskRecommendation.count({ where: { userId, status: 'dismissed' } }),
    prisma.taskRecommendation.aggregate({
      where: { userId },
      _avg: { score: true },
    }),
  ]);

  const acceptanceRate = total > 0 ? accepted / total : 0;

  return {
    total,
    pending,
    accepted,
    dismissed,
    avgScore: avgScore._avg.score ?? 0,
    acceptanceRate,
  };
}
