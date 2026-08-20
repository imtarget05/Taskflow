import { google } from 'googleapis';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';

export function isSheetsConfigured(): boolean {
  return Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY);
}

interface BoardData {
  id: string;
  name: string;
  columns: {
    id: string;
    name: string;
    position: number;
    tasks: {
      id: string;
      title: string;
      description: string | null;
      priority: string;
      dueDate: Date | null;
      completed: boolean;
      position: number;
      assignments: { user: { id: string; name: string; email: string } }[];
    }[];
  }[];
}

async function loadBoardForExport(projectId: string, userId: string): Promise<BoardData> {
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership) throw new AppError('Not a member of this project', 403);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      columns: {
        orderBy: { position: 'asc' },
        include: {
          tasks: {
            orderBy: { position: 'asc' },
            include: {
              assignments: {
                include: { user: { select: { id: true, name: true, email: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!project) throw new AppError('Project not found', 404);
  return project;
}

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Rows are [Task, Column, Priority, Assignees, Due date, Status, Description]. */
function buildRows(board: BoardData): string[][] {
  const rows: string[][] = [['Task', 'Column', 'Priority', 'Assignees', 'Due date', 'Status', 'Description']];
  for (const column of board.columns) {
    for (const task of column.tasks) {
      rows.push([
        task.title,
        column.name,
        task.priority,
        task.assignments.map((a) => a.user.name).join(', ') || '—',
        task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-CA') : '',
        task.completed ? 'Done' : 'Open',
        task.description ?? '',
      ]);
    }
  }
  return rows;
}

export function exportCsv(projectId: string, userId: string): Promise<{ filename: string; csv: string }> {
  return loadBoardForExport(projectId, userId).then((board) => {
    const rows = buildRows(board);
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
    const filename = `taskflow_${board.name.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'project'}.csv`;
    return { filename, csv };
  });
}

export async function exportToGoogleSheets(
  projectId: string,
  userId: string,
  userEmail: string
): Promise<{ url: string; spreadsheetId: string }> {
  if (!isSheetsConfigured()) {
    throw new AppError('Google Sheets export is not configured on the server', 501);
  }
  const board = await loadBoardForExport(projectId, userId);
  const rows = buildRows(board);

  const key = env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n');
  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
    subject: env.GOOGLE_SHEETS_DELEGATED_USER || undefined,
  });
  await auth.authorize();

  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: `TaskFlow — ${board.name}`,
        autoRecalc: 'ON_CHANGE',
      },
    },
  });
  const spreadsheetId = created.data.spreadsheetId;
  if (!spreadsheetId) {
    throw new AppError('Google Sheets returned no spreadsheet id', 502);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Sheet1!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.93, green: 0.93, blue: 0.98 },
              },
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
      ],
    },
  });

  // Share with the requesting user so they can open & edit the sheet.
  try {
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: {
        role: 'writer',
        type: 'user',
        emailAddress: userEmail,
      },
      fields: 'id',
    });
  } catch {
    // The service account may not be domain-delegated; the link still works
    // if the sheet is created by the user's domain or made public later.
  }

  return { url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, spreadsheetId };
}