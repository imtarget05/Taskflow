import { exportCsv, exportToGoogleSheets, exportTxt } from '../export.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    projectMember: { findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
  },
}));

jest.mock('googleapis', () => ({
  google: {
    auth: { JWT: jest.fn(() => ({ authorize: jest.fn().mockResolvedValue(undefined) })) },
    sheets: jest.fn(() => ({
      spreadsheets: {
        create: jest.fn().mockResolvedValue({ data: { spreadsheetId: 'sheet-1' } }),
        values: { update: jest.fn().mockResolvedValue({}) },
        batchUpdate: jest.fn().mockResolvedValue({}),
      },
    })),
    drive: jest.fn(() => ({
      permissions: { create: jest.fn().mockResolvedValue({}) },
    })),
  },
}));

import { prisma } from '../../../lib/prisma';
import { env } from '../../../config/env';

const mockedPrisma = prisma as unknown as {
  projectMember: { findUnique: jest.Mock };
  project: { findUnique: jest.Mock };
};

const BOARD = {
  id: 'p1',
  name: 'Launch, Site!',
  columns: [
    {
      id: 'c1',
      name: 'To Do',
      position: 0,
      tasks: [
        {
          id: 't1',
          title: 'Design, landing',
          description: 'Hero, with "quotes"',
          priority: 'HIGH',
          dueDate: new Date('2026-09-01'),
          completed: false,
          position: 0,
          assignments: [{ user: { id: 'u2', name: 'Jane, Doe', email: 'jane@x.com' } }],
        },
      ],
    },
    {
      id: 'c2',
      name: 'Done',
      position: 1,
      tasks: [
        {
          id: 't2',
          title: 'Ship v1',
          description: null,
          priority: 'MEDIUM',
          dueDate: null,
          completed: true,
          position: 0,
          assignments: [],
        },
      ],
    },
  ],
};

describe('export.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('exportCsv', () => {
    it('denies non-members', async () => {
      mockedPrisma.projectMember.findUnique.mockResolvedValue(null);
      await expect(exportCsv('p1', 'u1')).rejects.toMatchObject({ statusCode: 403 });
    });

    it('renders a CSV with a header and escaped cells', async () => {
      mockedPrisma.projectMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      mockedPrisma.project.findUnique.mockResolvedValue(BOARD);

      const { csv, filename } = await exportCsv('p1', 'u1');

      expect(filename).toBe('taskflow_Launch_Site.csv');
      const lines = csv.split('\r\n');
      expect(lines[0]).toBe('Task,Column,Priority,Assignees,Due date,Status,Description');
      expect(lines[1]).toContain('"Design, landing"');
      expect(lines[1]).toContain('"Jane, Doe"');
      expect(lines[1]).toContain('"Hero, with ""quotes"""');
      expect(lines[1]).toContain('2026-09-01');
      expect(lines[1]).toContain(',Open,');
      expect(lines[2]).toContain('Ship v1');
      expect(lines[2]).toContain('Done');
      expect(lines[2].endsWith(',')).toBe(true); // empty description
    });
  });

  describe('exportTxt', () => {
    it('renders a readable plain-text summary', async () => {
      mockedPrisma.projectMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      mockedPrisma.project.findUnique.mockResolvedValue(BOARD);

      const { text, filename } = await exportTxt('p1', 'u1');

      expect(filename).toBe('taskflow_Launch_Site.txt');
      expect(text).toContain('Launch, Site! — TaskFlow export');
      expect(text).toContain('## To Do');
      expect(text).toContain('[Open] Design, landing (HIGH, due 2026-09-01, Jane, Doe)');
      expect(text).toContain('Hero, with "quotes"');
      expect(text).toContain('## Done');
      expect(text).toContain('[Done] Ship v1 (MEDIUM, due —, —)');
      expect(text).toContain('\r\n');
    });
  });

  describe('exportToGoogleSheets', () => {
    it('returns 501 when the service account is not configured', async () => {
      const origEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      const origKey = env.GOOGLE_PRIVATE_KEY;
      env.GOOGLE_SERVICE_ACCOUNT_EMAIL = undefined;
      env.GOOGLE_PRIVATE_KEY = undefined;

      await expect(exportToGoogleSheets('p1', 'u1', 'a@b.c')).rejects.toMatchObject({ statusCode: 501 });

      env.GOOGLE_SERVICE_ACCOUNT_EMAIL = origEmail;
      env.GOOGLE_PRIVATE_KEY = origKey;
    });
  });
});