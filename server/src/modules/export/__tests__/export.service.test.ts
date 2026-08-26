import { exportCsv, exportToGoogleSheets, exportTxt, exportProgressReport } from '../export.service';

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

  describe('exportProgressReport', () => {
    it('renders a Vietnamese progress report with headline numbers', async () => {
      mockedPrisma.projectMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      mockedPrisma.project.findUnique.mockResolvedValue(BOARD);

      const { text, filename } = await exportProgressReport('p1', 'u1');

      expect(filename).toBe('baocao_Launch_Site.txt');
      expect(text).toContain('BÁO CÁO TIẾN ĐỘ — Launch, Site!');
      expect(text).toContain('Tổng số task : 2');
      expect(text).toContain('Hoàn thành   : 1');
      expect(text).toContain('Còn mở       : 1');
      expect(text).toContain('Tiến độ      : 50%');
      expect(text).toContain('== CHI TIẾT THEO CỘT ==');
      expect(text).toContain('## To Do (0/1 xong)');
      expect(text).toContain('[ ] Design, landing — HIGH, Jane, Doe');
      expect(text).toContain('## Done (1/1 xong)');
      expect(text).toContain('[x] Ship v1 — MEDIUM, chưa giao');
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

    it('writes a Tasks sheet plus a Tiến độ summary sheet and shares the file', async () => {
      const origEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      const origKey = env.GOOGLE_PRIVATE_KEY;
      env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'sa@taskflow.iam.gserviceaccount.com';
      env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----';
      mockedPrisma.projectMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      mockedPrisma.project.findUnique.mockResolvedValue(BOARD);

      try {
      const result = await exportToGoogleSheets('p1', 'u1', 'me@x.com');
      expect(result.spreadsheetId).toBe('sheet-1');
      expect(result.url).toContain('docs.google.com/spreadsheets/d/sheet-1');

      const { google } = jest.requireMock('googleapis') as {
        google: {
          sheets: jest.Mock;
          drive: jest.Mock;
        };
      };
      const sheetsApi = google.sheets.mock.results[0].value;
      const valuesUpdate = sheetsApi.spreadsheets.values.update;
      const batchUpdate = sheetsApi.spreadsheets.batchUpdate;
      const permissionsCreate = google.drive.mock.results[0].value.permissions.create;

      // First write = task rows into Sheet1 (Tasks).
      expect(valuesUpdate).toHaveBeenCalledTimes(2);
      const [tasksCall] = valuesUpdate.mock.calls;
      expect(tasksCall[0].range).toBe('Sheet1!A1');
      expect(tasksCall[0].requestBody.values[0]).toEqual([
        'Task', 'Column', 'Priority', 'Assignees', 'Due date', 'Status', 'Description',
      ]);

      // Second write = progress summary rows.
      const [, progressCall] = valuesUpdate.mock.calls;
      expect(progressCall[0].range).toBe('Progress!A1');
      const progressRows = progressCall[0].requestBody.values as string[][];
      expect(progressRows[0]).toEqual(['Metric', 'Value']);
      const metric = (name: string) => progressRows.find((r) => r[0] === name)?.[1];
      expect(metric('Tổng số task')).toBe('2');
      expect(metric('Hoàn thành')).toBe('1');
      expect(metric('Còn mở')).toBe('1');
      expect(metric('Tiến độ (%)')).toBe('50');

      // A "Progress" sheet tab is added before it is written to.
      const allBatchArgs = batchUpdate.mock.calls.map((c: unknown[]) => c[0]) as {
        requestBody?: { requests?: { addSheet?: unknown }[] };
      }[];
      const addSheetRequest = allBatchArgs.find((arg) =>
        arg.requestBody?.requests?.some((r) => r.addSheet)
      );
      expect(addSheetRequest).toBeTruthy();

      // The requesting user is granted writer access.
      expect(permissionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: { role: 'writer', type: 'user', emailAddress: 'me@x.com' },
        })
      );
      } finally {
        env.GOOGLE_SERVICE_ACCOUNT_EMAIL = origEmail;
        env.GOOGLE_PRIVATE_KEY = origKey;
      }
    });
  });
});