import { prisma } from '../../lib/prisma';

function isPrismaError(err: unknown, code: string): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code === code;
  // Handle plain mock objects in tests
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return (err as { code: string }).code === code;
  }
  return false;
}
import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';
import { Prisma } from '@prisma/client';

export interface CreatePromptInput {
  name: string;
  version: string;
  content: string;
  variables: string[];
  isActive?: boolean;
  metrics?: Record<string, unknown>;
  createdBy?: string;
}

export interface CreateExperimentInput {
  name: string;
  promptName: string;
  variantA: string;
  variantB: string;
  trafficSplit?: number;
}

export interface ExperimentMetrics {
  accuracy?: number;
  latency?: number;
  count?: number;
}

/**
 * Create a new prompt template version.
 */
export async function createPrompt(data: CreatePromptInput) {
  try {
    return await prisma.promptTemplate.create({
      data: {
        name: data.name,
        version: data.version,
        content: data.content,
        variables: data.variables,
        isActive: data.isActive ?? false,
        metrics: data.metrics as Prisma.InputJsonValue | undefined,
        createdBy: data.createdBy,
      },
    });
  } catch (err: unknown) {
    if (isPrismaError(err, 'P2002')) {
      throw new AppError(
        `Prompt template "${data.name}" version "${data.version}" already exists`,
        StatusCodes.CONFLICT
      );
    }
    throw err;
  }
}

/**
 * Activate a specific prompt version. Deactivates all other versions of the same name.
 */
export async function activatePrompt(name: string, version: string) {
  // Deactivate all versions first
  await prisma.promptTemplate.updateMany({
    where: { name },
    data: { isActive: false },
  });

  // Activate target version
  try {
    return await prisma.promptTemplate.update({
      where: { name_version: { name, version } },
      data: { isActive: true },
    });
  } catch (err: unknown) {
    if (isPrismaError(err, 'P2025')) {
      throw new AppError(`Prompt "${name}" version "${version}" not found`, StatusCodes.NOT_FOUND);
    }
    throw err;
  }
}

/**
 * Get the currently active prompt for a given name.
 */
export async function getActivePrompt(name: string) {
  return prisma.promptTemplate.findFirst({
    where: { name, isActive: true },
  });
}

/**
 * List all prompt templates, optionally filtered by name.
 */
export async function listPrompts(name?: string) {
  return prisma.promptTemplate.findMany({
    where: name ? { name } : undefined,
    orderBy: { version: 'desc' },
  });
}

/**
 * Render a prompt template with variable substitution.
 * Returns null if no active prompt exists.
 */
export async function renderPrompt(name: string, variables: Record<string, string>): Promise<string | null> {
  const prompt = await getActivePrompt(name);
  if (!prompt) return null;

  let rendered = prompt.content;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return rendered;
}

/**
 * Create a new A/B test experiment.
 */
export async function createExperiment(data: CreateExperimentInput) {
  try {
    return await prisma.promptExperiment.create({
      data: {
        name: data.name,
        promptName: data.promptName,
        variantA: data.variantA,
        variantB: data.variantB,
        trafficSplit: data.trafficSplit ?? 0.5,
        status: 'running',
      },
    });
  } catch (err: unknown) {
    if (isPrismaError(err, 'P2002')) {
      throw new AppError(`Experiment "${data.name}" already exists`, StatusCodes.CONFLICT);
    }
    throw err;
  }
}

/**
 * Record metrics for an experiment variant.
 */
export async function recordExperimentResult(
  experimentId: string,
  variant: 'A' | 'B',
  metrics: ExperimentMetrics
) {
  const experiment = await prisma.promptExperiment.findUnique({
    where: { id: experimentId },
  });

  if (!experiment) {
    throw new AppError('Experiment not found', StatusCodes.NOT_FOUND);
  }

  const updateData = variant === 'A'
    ? { resultsA: metrics as Prisma.InputJsonValue }
    : { resultsB: metrics as Prisma.InputJsonValue };

  return prisma.promptExperiment.update({
    where: { id: experimentId },
    data: updateData,
  });
}

/**
 * Analyze experiment results and determine winner.
 * Uses accuracy as the primary metric; falls back to count if equal.
 */
export async function analyzeExperiment(experimentId: string) {
  const experiment = await prisma.promptExperiment.findUnique({
    where: { id: experimentId },
  });

  if (!experiment) {
    throw new AppError('Experiment not found', StatusCodes.NOT_FOUND);
  }

  let winner: string | null = null;

  const resultsA = experiment.resultsA as ExperimentMetrics | null;
  const resultsB = experiment.resultsB as ExperimentMetrics | null;

  if (resultsA && resultsB) {
    const accuracyA = resultsA.accuracy ?? 0;
    const accuracyB = resultsB.accuracy ?? 0;

    if (accuracyA > accuracyB) {
      winner = 'A';
    } else if (accuracyB > accuracyA) {
      winner = 'B';
    }
    // If equal accuracy, winner stays null (tie)
  }

  return prisma.promptExperiment.update({
    where: { id: experimentId },
    data: {
      winner,
      status: 'completed',
      endedAt: new Date(),
    },
  });
}

/**
 * Deactivate all prompt versions with a given name.
 */
export async function deactivateAll(name: string) {
  return prisma.promptTemplate.updateMany({
    where: { name },
    data: { isActive: false },
  });
}
