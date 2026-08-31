import {
  computeScore,
  priorityToScore,
  generateReason,
  DEFAULT_WEIGHTS,
  ScoreFactors,
} from '../scoring';

describe('scoring', () => {
  describe('computeScore', () => {
    it('returns score between 0 and 1', () => {
      const result = computeScore({
        factors: {
          skillMatch: 0.5,
          availability: 0.5,
          priority: 0.5,
          history: 0.5,
          workloadBalance: 0.5,
        },
        taskTags: ['react'],
        userSkills: [{ skill: 'react', level: 3 }],
        currentWorkload: 2,
        maxWorkload: 10,
        completionRate: 0.8,
        isAvailableNow: true,
      });

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('gives higher score for matching skills', () => {
      const withMatch = computeScore({
        factors: {
          skillMatch: 0,
          availability: 0.5,
          priority: 0.5,
          history: 0.5,
          workloadBalance: 0.5,
        },
        taskTags: ['react', 'nodejs'],
        userSkills: [
          { skill: 'react', level: 5 },
          { skill: 'nodejs', level: 4 },
        ],
        currentWorkload: 2,
        maxWorkload: 10,
        completionRate: 0.8,
        isAvailableNow: true,
      });

      const withoutMatch = computeScore({
        factors: {
          skillMatch: 0,
          availability: 0.5,
          priority: 0.5,
          history: 0.5,
          workloadBalance: 0.5,
        },
        taskTags: ['react', 'nodejs'],
        userSkills: [
          { skill: 'design', level: 5 },
          { skill: 'testing', level: 3 },
        ],
        currentWorkload: 2,
        maxWorkload: 10,
        completionRate: 0.8,
        isAvailableNow: true,
      });

      expect(withMatch.score).toBeGreaterThan(withoutMatch.score);
    });

    it('gives higher score when user is available', () => {
      const available = computeScore({
        factors: {
          skillMatch: 0.5,
          availability: 0,
          priority: 0.5,
          history: 0.5,
          workloadBalance: 0.5,
        },
        isAvailableNow: true,
      });

      const notAvailable = computeScore({
        factors: {
          skillMatch: 0.5,
          availability: 0,
          priority: 0.5,
          history: 0.5,
          workloadBalance: 0.5,
        },
        isAvailableNow: false,
      });

      expect(available.score).toBeGreaterThan(notAvailable.score);
    });

    it('gives higher score for low workload', () => {
      const lowWorkload = computeScore({
        factors: {
          skillMatch: 0.5,
          availability: 0.5,
          priority: 0.5,
          history: 0.5,
          workloadBalance: 0,
        },
        currentWorkload: 1,
        maxWorkload: 10,
      });

      const highWorkload = computeScore({
        factors: {
          skillMatch: 0.5,
          availability: 0.5,
          priority: 0.5,
          history: 0.5,
          workloadBalance: 0,
        },
        currentWorkload: 9,
        maxWorkload: 10,
      });

      expect(lowWorkload.score).toBeGreaterThan(highWorkload.score);
    });

    it('uses custom weights when provided', () => {
      const result = computeScore({
        weights: { skillMatch: 0.8, priority: 0.2 },
        factors: {
          skillMatch: 0.9,
          availability: 0.5,
          priority: 0.1,
          history: 0.5,
          workloadBalance: 0.5,
        },
        taskTags: ['react'],
        userSkills: [{ skill: 'react', level: 5 }],
      });

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('normalizes weights to sum to 1', () => {
      const result = computeScore({
        weights: { skillMatch: 10, availability: 10, priority: 10, history: 10, workloadBalance: 10 },
        factors: {
          skillMatch: 0.5,
          availability: 0.5,
          priority: 0.5,
          history: 0.5,
          workloadBalance: 0.5,
        },
      });

      expect(result.weights.skillMatch).toBeCloseTo(0.2);
      expect(result.weights.availability).toBeCloseTo(0.2);
      expect(result.weights.priority).toBeCloseTo(0.2);
      expect(result.weights.history).toBeCloseTo(0.2);
      expect(result.weights.workloadBalance).toBeCloseTo(0.2);
    });

    it('returns neutral skill match when task has no tags', () => {
      const result = computeScore({
        factors: {
          skillMatch: 0,
          availability: 0.5,
          priority: 0.5,
          history: 0.5,
          workloadBalance: 0.5,
        },
        taskTags: [],
        userSkills: [{ skill: 'react', level: 5 }],
      });

      expect(result.factors.skillMatch).toBe(0.5);
    });

    it('returns low skill match when user has no skills', () => {
      const result = computeScore({
        factors: {
          skillMatch: 0,
          availability: 0.5,
          priority: 0.5,
          history: 0.5,
          workloadBalance: 0.5,
        },
        taskTags: ['react'],
        userSkills: [],
      });

      expect(result.factors.skillMatch).toBe(0.1);
    });

    it('handles partial skill matches', () => {
      const result = computeScore({
        factors: {
          skillMatch: 0,
          availability: 0.5,
          priority: 0.5,
          history: 0.5,
          workloadBalance: 0.5,
        },
        taskTags: ['react', 'nodejs', 'design'],
        userSkills: [{ skill: 'react', level: 5 }],
      });

      // Only 1 of 3 tags matches, level 5/5 = 1.0, so 1.0/3 = 0.333
      expect(result.factors.skillMatch).toBeCloseTo(0.333, 2);
    });
  });

  describe('priorityToScore', () => {
    it('maps URGENT to 1.0', () => {
      expect(priorityToScore('URGENT')).toBe(1.0);
    });

    it('maps HIGH to 0.75', () => {
      expect(priorityToScore('HIGH')).toBe(0.75);
    });

    it('maps MEDIUM to 0.5', () => {
      expect(priorityToScore('MEDIUM')).toBe(0.5);
    });

    it('maps LOW to 0.25', () => {
      expect(priorityToScore('LOW')).toBe(0.25);
    });

    it('returns 0.5 for unknown priority', () => {
      expect(priorityToScore('UNKNOWN')).toBe(0.5);
    });

    it('is case insensitive', () => {
      expect(priorityToScore('urgent')).toBe(1.0);
      expect(priorityToScore('High')).toBe(0.75);
    });
  });

  describe('generateReason', () => {
    it('generates reason with skill match', () => {
      const factors: ScoreFactors = {
        skillMatch: 0.8,
        availability: 0.5,
        priority: 0.5,
        history: 0.5,
        workloadBalance: 0.5,
      };

      const reason = generateReason(factors, 0.7, 'Build feature');
      expect(reason).toContain('kỹ năng phù hợp');
      expect(reason).toContain('Build feature');
    });

    it('generates reason with low workload', () => {
      const factors: ScoreFactors = {
        skillMatch: 0.3,
        availability: 0.5,
        priority: 0.5,
        history: 0.5,
        workloadBalance: 0.9,
      };

      const reason = generateReason(factors, 0.7, 'Fix bug');
      expect(reason).toContain('workload nhẹ');
    });

    it('generates reason with high priority', () => {
      const factors: ScoreFactors = {
        skillMatch: 0.3,
        availability: 0.5,
        priority: 1.0,
        history: 0.5,
        workloadBalance: 0.5,
      };

      const reason = generateReason(factors, 0.7, 'Urgent fix');
      expect(reason).toContain('ưu tiên cao');
    });

    it('generates reason with history', () => {
      const factors: ScoreFactors = {
        skillMatch: 0.3,
        availability: 0.5,
        priority: 0.5,
        history: 0.8,
        workloadBalance: 0.5,
      };

      const reason = generateReason(factors, 0.7, 'Similar task');
      expect(reason).toContain('từng hoàn thành task tương tự');
    });

    it('generates fallback reason for low score', () => {
      const factors: ScoreFactors = {
        skillMatch: 0.1,
        availability: 0.3,
        priority: 0.3,
        history: 0.3,
        workloadBalance: 0.5,
      };

      const reason = generateReason(factors, 0.3, 'Some task');
      expect(reason).toContain('Có thể xem xét');
    });

    it('generates positive fallback for high score with no strong factors', () => {
      const factors: ScoreFactors = {
        skillMatch: 0.3,
        availability: 0.3,
        priority: 0.3,
        history: 0.3,
        workloadBalance: 0.5,
      };

      const reason = generateReason(factors, 0.65, 'Good task');
      expect(reason).toContain('phù hợp với profile');
    });
  });

  describe('DEFAULT_WEIGHTS', () => {
    it('sums to 1.0', () => {
      const sum =
        DEFAULT_WEIGHTS.skillMatch +
        DEFAULT_WEIGHTS.availability +
        DEFAULT_WEIGHTS.priority +
        DEFAULT_WEIGHTS.history +
        DEFAULT_WEIGHTS.workloadBalance;

      expect(sum).toBeCloseTo(1.0);
    });
  });
});
