import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

/** Shared full-stack integration suite: project, column, task, comment, activity APIs. */
describe('Projects API integration', () => {
  let app: ReturnType<typeof createApp>;
  let ownerAgent: ReturnType<typeof request.agent>;
  let memberAgent: ReturnType<typeof request.agent>;
  let viewerAgent: ReturnType<typeof request.agent>;
  let ownerId = '';
  let memberId = '';
  let projectId = '';

  async function register(agent: ReturnType<typeof request.agent>, email: string, name: string) {
    const res = await authed(agent)
      .post('/api/auth/register')
      .send({ email, password: 'password123', name });
    expect(res.status).toBe(201);
    // Capture the double-submit CSRF cookie for subsequent mutation requests.
    const raw = res.headers['set-cookie'];
    const setCookie = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
    const csrfEntry = setCookie.find((entry) => entry.startsWith('csrf_token='));
    (agent as unknown as { csrfToken?: string }).csrfToken =
      csrfEntry?.split(';')[0].split('=')[1] ?? '';
    return res.body.user as { id: string };
  }

  /** Attach the CSRF header to a mutation request. */
  function authed(agent: ReturnType<typeof request.agent>) {
    const token = (agent as unknown as { csrfToken?: string }).csrfToken ?? '';
    return agent.set('X-CSRF-Token', token);
  }

  async function resetDb() {
    await prisma.refreshToken.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskAssignment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.column.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();
  }

  beforeAll(async () => {
    app = createApp();
    ownerAgent = request.agent(app);
    memberAgent = request.agent(app);
    viewerAgent = request.agent(app);
    await resetDb();
  });

  beforeEach(async () => {
    await resetDb();

    // Register users fresh for each test.
    ownerId = (await register(ownerAgent, 'owner@taskflow.dev', 'Owner')).id;
    memberId = (await register(memberAgent, 'member@taskflow.dev', 'Member')).id;
    await register(viewerAgent, 'viewer@taskflow.dev', 'Viewer');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createProject(name = 'Sprint 1') {
    const res = await authed(ownerAgent)
      .post('/api/projects')
      .send({ name, description: 'description', color: '#ff0000' });
    expect(res.status).toBe(201);
    projectId = res.body.data.id as string;
    return projectId;
  }

  async function addMember(agent: ReturnType<typeof request.agent>, email: string, role: Role) {
    const res = await authed(agent).post(`/api/projects/${projectId}/members`).send({ email, role });
    expect(res.status).toBe(201);
    return res;
  }

  async function taskInColumn(columnId: string, title: string) {
    const res = await authed(ownerAgent)
      .post(`/api/projects/${projectId}/tasks`)
      .send({ columnId, title });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; columnId: string; position: number };
  }

  describe('Projects', () => {
    it('creates a project with three default columns', async () => {
      const id = await createProject();

      const get = await ownerAgent.get(`/api/projects/${id}`);
      expect(get.status).toBe(200);
      expect(get.body.data.project.name).toBe('Sprint 1');
      expect(get.body.data.project.columns.map((c: { name: string }) => c.name)).toEqual([
        'To Do',
        'In Progress',
        'Done',
      ]);
      expect(get.body.data.role).toBe(Role.OWNER);
    });

    it('rejects a project with an empty name (field-level details)', async () => {
      const res = await authed(ownerAgent).post('/api/projects').send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.details.fieldErrors.name).toBeDefined();
    });

    it('lists projects the user belongs to', async () => {
      await createProject();
      await createProject('Sprint 2');

      const res = await ownerAgent.get('/api/projects');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('denies access to non-members with 403', async () => {
      await createProject();

      const res = await viewerAgent.get(`/api/projects/${projectId}`);
      expect(res.status).toBe(403);
    });

    it('updates a project as a member', async () => {
      await createProject();
      await addMember(ownerAgent, 'member@taskflow.dev', Role.MEMBER);

      const res = await authed(memberAgent)
        .patch(`/api/projects/${projectId}`)
        .send({ name: 'Renamed' });
      expect(res.status).toBe(200);

      const get = await memberAgent.get(`/api/projects/${projectId}`);
      expect(get.body.data.project.name).toBe('Renamed');
    });

    it('forbids a viewer from renaming the project', async () => {
      await createProject();
      await addMember(ownerAgent, 'viewer@taskflow.dev', Role.VIEWER);

      const res = await authed(viewerAgent).patch(`/api/projects/${projectId}`).send({ name: 'Hijack' });
      expect(res.status).toBe(403);
    });

    it('deletes the project as the owner', async () => {
      await createProject();

      const res = await authed(ownerAgent).delete(`/api/projects/${projectId}`);
      expect(res.status).toBe(200);

      const get = await ownerAgent.get(`/api/projects/${projectId}`);
      expect(get.status).toBe(403);
    });

    it('forbids a member from deleting the project', async () => {
      await createProject();
      await addMember(ownerAgent, 'member@taskflow.dev', Role.MEMBER);

      const res = await authed(memberAgent).delete(`/api/projects/${projectId}`);
      expect(res.status).toBe(403);
    });

    it('forbids access for users who are not members', async () => {
      await createProject();

      const res = await viewerAgent.get(`/api/projects/does-not-exist`);
      expect(res.status).toBe(403);
    });

    describe('Members', () => {
      it('adds a member by email and lists members', async () => {
        await createProject();
        await addMember(ownerAgent, 'member@taskflow.dev', Role.MEMBER);

        const res = await ownerAgent.get(`/api/projects/${projectId}/members`);
        expect(res.status).toBe(200);
        expect(res.body.data.map((m: { email: string }) => m.email)).toEqual(
          expect.arrayContaining(['member@taskflow.dev'])
        );
      });

      it('rejects adding a viewer as a member', async () => {
        await createProject();
        await addMember(ownerAgent, 'viewer@taskflow.dev', Role.VIEWER);

        const res = await authed(viewerAgent).post(`/api/projects/${projectId}/members`).send({
          email: 'member@taskflow.dev',
          role: Role.MEMBER,
        });
        expect(res.status).toBe(403);
      });

      it('rejects unknown emails with 404', async () => {
        await createProject();

        const res = await authed(ownerAgent)
          .post(`/api/projects/${projectId}/members`)
          .send({ email: 'ghost@taskflow.dev', role: Role.MEMBER });
        expect(res.status).toBe(404);
      });

      it('removes a member as the owner', async () => {
        await createProject();
        await addMember(ownerAgent, 'member@taskflow.dev', Role.MEMBER);

        const res = await authed(ownerAgent).delete(`/api/projects/${projectId}/members/${memberId}`);
        expect(res.status).toBe(200);

        const members = await ownerAgent.get(`/api/projects/${projectId}/members`);
        expect(members.body.data.map((m: { id: string }) => m.id)).not.toContain(memberId);
      });

      it('forbids the owner from removing themselves', async () => {
        await createProject();

        const res = await authed(ownerAgent).delete(`/api/projects/${projectId}/members/${ownerId}`);
        expect(res.status).toBe(400);
      });
    });
  });

  describe('Columns', () => {
    it('creates a column at the end of the board', async () => {
      await createProject();

      const res = await authed(ownerAgent)
        .post(`/api/projects/${projectId}/columns`)
        .send({ name: 'Backlog' });
      expect(res.status).toBe(201);
      expect(res.body.data.position).toBe(3);

      const boards = await ownerAgent.get(`/api/projects/${projectId}`);
      expect(boards.body.data.project.columns.map((c: { name: string }) => c.name)).toContain(
        'Backlog'
      );
    });

    it('rejects an empty column name with field-level details', async () => {
      await createProject();

      const res = await authed(ownerAgent).post(`/api/projects/${projectId}/columns`).send({ name: '' });
      expect(res.status).toBe(400);
      expect(res.body.details.fieldErrors.name).toBeDefined();
    });

    it('renames a column', async () => {
      await createProject();
      const columns = await ownerAgent.get(`/api/projects/${projectId}`);
      const columnId = columns.body.data.project.columns[0].id as string;

      const res = await authed(ownerAgent)
        .patch(`/api/projects/${projectId}/columns/${columnId}`)
        .send({ name: 'Planned' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Planned');
    });

    it('requires a member role to create columns', async () => {
      await createProject();
      await addMember(ownerAgent, 'viewer@taskflow.dev', Role.VIEWER);

      const res = await authed(viewerAgent)
        .post(`/api/projects/${projectId}/columns`)
        .send({ name: 'Backlog' });
      expect(res.status).toBe(403);
    });

    it('deletes a column and moves its tasks to the fallback', async () => {
      await createProject();
      const boards = await ownerAgent.get(`/api/projects/${projectId}`);
      const [c1, c2] = boards.body.data.project.columns as { id: string }[];
      await taskInColumn(c1.id, 'Task A');
      await taskInColumn(c1.id, 'Task B');

      const res = await authed(ownerAgent).delete(`/api/projects/${projectId}/columns/${c1.id}`);
      expect(res.status).toBe(200);

      const after = await ownerAgent.get(`/api/projects/${projectId}`);
      const remaining = after.body.data.project.columns.find(
        (c: { id: string }) => c.id === c2.id
      );
      expect(remaining.tasks).toHaveLength(2);
    });

    it('refuses to delete the last column', async () => {
      await createProject();
      const boards = await ownerAgent.get(`/api/projects/${projectId}`);
      const columns = boards.body.data.project.columns as { id: string }[];
      await authed(ownerAgent).delete(`/api/projects/${projectId}/columns/${columns[0].id}`);
      await authed(ownerAgent).delete(`/api/projects/${projectId}/columns/${columns[1].id}`);

      const res = await authed(ownerAgent).delete(`/api/projects/${projectId}/columns/${columns[2].id}`);
      expect(res.status).toBe(400);
    });

    it('moves a task between columns via move endpoint', async () => {
      await createProject();
      const boards = await ownerAgent.get(`/api/projects/${projectId}`);
      const [c1, c2] = boards.body.data.project.columns as { id: string }[];
      await taskInColumn(c1.id, 'Task A');
      await taskInColumn(c1.id, 'Task B');

      const res = await authed(ownerAgent)
        .post(`/api/projects/${projectId}/columns/${c1.id}/move`)
        .send({ sourceColumnId: c1.id, targetColumnId: c2.id, sourceIndex: 0, targetIndex: 0 });
      expect(res.status).toBe(200);
      expect(res.body.data.columnId).toBe(c2.id);

      const after = await ownerAgent.get(`/api/projects/${projectId}`);
      const source = after.body.data.project.columns.find(
        (c: { id: string }) => c.id === c1.id
      );
      expect(source.tasks).toHaveLength(1);
    });

    it('reorders tasks inside the same column', async () => {
      await createProject();
      const boards = await ownerAgent.get(`/api/projects/${projectId}`);
      const [c1] = boards.body.data.project.columns as { id: string }[];
      await taskInColumn(c1.id, 'Task A');
      const taskB = await taskInColumn(c1.id, 'Task B');

      const res = await authed(ownerAgent)
        .post(`/api/projects/${projectId}/columns/${c1.id}/move`)
        .send({
          sourceColumnId: c1.id,
          targetColumnId: c1.id,
          sourceIndex: 1,
          targetIndex: 0,
        });
      expect(res.status).toBe(200);

      const after = await ownerAgent.get(`/api/projects/${projectId}`);
      const source = after.body.data.project.columns.find(
        (c: { id: string }) => c.id === c1.id
      );
      expect(source.tasks.map((t: { id: string }) => t.id)[0]).toBe(taskB.id);
    });

    it('rejects moves referencing columns outside the project', async () => {
      await createProject();
      const boards = await ownerAgent.get(`/api/projects/${projectId}`);
      const [c1] = boards.body.data.project.columns as { id: string }[];

      const res = await authed(ownerAgent)
        .post(`/api/projects/${projectId}/columns/${c1.id}/move`)
        .send({
          sourceColumnId: c1.id,
          targetColumnId: 'foreign-column',
          sourceIndex: 0,
          targetIndex: 0,
        });
      expect(res.status).toBe(400);
    });
  });

  describe('Tasks', () => {
    it('creates a task with priority and assignee, then lists and fetches it', async () => {
      await createProject();
      await addMember(ownerAgent, 'member@taskflow.dev', Role.MEMBER);
      const boards = await ownerAgent.get(`/api/projects/${projectId}`);
      const [c1] = boards.body.data.project.columns as { id: string }[];

      const create = await authed(ownerAgent).post(`/api/projects/${projectId}/tasks`).send({
        columnId: c1.id,
        title: 'Build API',
        priority: 'URGENT',
        assigneeIds: [memberId],
      });
      expect(create.status).toBe(201);
      expect(create.body.data.priority).toBe('URGENT');
      expect(create.body.data.assignments).toHaveLength(1);

      const list = await ownerAgent.get(`/api/projects/${projectId}/tasks`);
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);

      const get = await ownerAgent.get(
        `/api/projects/${projectId}/tasks/${create.body.data.id}`
      );
      expect(get.status).toBe(200);
      expect(get.body.data.title).toBe('Build API');
    });

    it('rejects an empty task title with field-level details', async () => {
      await createProject();
      const boards = await ownerAgent.get(`/api/projects/${projectId}`);
      const [c1] = boards.body.data.project.columns as { id: string }[];

      const res = await authed(ownerAgent)
        .post(`/api/projects/${projectId}/tasks`)
        .send({ columnId: c1.id, title: '' });
      expect(res.status).toBe(400);
      expect(res.body.details.fieldErrors.title).toBeDefined();
    });

    it('rejects tasks in a column from another project', async () => {
      await createProject();

      const res = await authed(ownerAgent)
        .post(`/api/projects/${projectId}/tasks`)
        .send({ columnId: 'foreign-column', title: 'Task' });
      expect(res.status).toBe(400);
    });

    it('forbids viewers from creating tasks', async () => {
      await createProject();
      await addMember(ownerAgent, 'viewer@taskflow.dev', Role.VIEWER);
      const boards = await ownerAgent.get(`/api/projects/${projectId}`);
      const [c1] = boards.body.data.project.columns as { id: string }[];

      const res = await authed(viewerAgent)
        .post(`/api/projects/${projectId}/tasks`)
        .send({ columnId: c1.id, title: 'Nope' });
      expect(res.status).toBe(403);
    });

    it('updates a task title, priority and column', async () => {
      await createProject();
      const boards = await ownerAgent.get(`/api/projects/${projectId}`);
      const [c1, c2] = boards.body.data.project.columns as { id: string }[];
      const task = await taskInColumn(c1.id, 'Old title');

      const res = await authed(ownerAgent)
        .patch(`/api/projects/${projectId}/tasks/${task.id}`)
        .send({ title: 'New title', priority: 'HIGH', columnId: c2.id });
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('New title');
      expect(res.body.data.priority).toBe('HIGH');
      expect(res.body.data.columnId).toBe(c2.id);
    });

    it('returns 404 when updating a task from another project', async () => {
      await createProject();
      const boards = await ownerAgent.get(`/api/projects/${projectId}`);
      const [c1] = boards.body.data.project.columns as { id: string }[];
      const task = await taskInColumn(c1.id, 'Task');

      await authed(ownerAgent).delete(`/api/projects/${projectId}/tasks/${task.id}`);

      const res = await authed(ownerAgent)
        .patch(`/api/projects/${projectId}/tasks/${task.id}`)
        .send({ title: 'Gone' });
      expect(res.status).toBe(404);
    });

    it('deletes a task', async () => {
      await createProject();
      const boards = await ownerAgent.get(`/api/projects/${projectId}`);
      const [c1] = boards.body.data.project.columns as { id: string }[];
      const task = await taskInColumn(c1.id, 'Temp');

      const res = await authed(ownerAgent).delete(`/api/projects/${projectId}/tasks/${task.id}`);
      expect(res.status).toBe(200);

      const get = await ownerAgent.get(`/api/projects/${projectId}/tasks/${task.id}`);
      expect(get.status).toBe(404);
    });
  });

  describe('Comments', () => {
    it('adds a comment and logs an activity, then the author deletes it', async () => {
      await createProject();
      const boards = await ownerAgent.get(`/api/projects/${projectId}`);
      const [c1] = boards.body.data.project.columns as { id: string }[];
      const task = await taskInColumn(c1.id, 'Task');

      const create = await authed(ownerAgent)
        .post(`/api/projects/${projectId}/tasks/${task.id}/comments`)
        .send({ body: '  Nice work  ' });
      expect(create.status).toBe(201);
      expect(create.body.data.body).toBe('Nice work');

      const activities = await ownerAgent.get(`/api/projects/${projectId}/activities`);
      expect(activities.status).toBe(200);
      expect(
        activities.body.data.some((a: { action: string }) => a.action === 'COMMENT_ADDED')
      ).toBe(true);

      const del = await authed(ownerAgent).delete(
        `/api/projects/${projectId}/tasks/${task.id}/comments/${create.body.data.id}`
      );
      expect(del.status).toBe(200);
    });

    it('rejects an empty comment with field-level details', async () => {
      await createProject();
      const boards = await ownerAgent.get(`/api/projects/${projectId}`);
      const [c1] = boards.body.data.project.columns as { id: string }[];
      const task = await taskInColumn(c1.id, 'Task');

      const res = await authed(ownerAgent)
        .post(`/api/projects/${projectId}/tasks/${task.id}/comments`)
        .send({ body: '' });
      expect(res.status).toBe(400);
      expect(res.body.details.fieldErrors.body).toBeDefined();
    });

    it('forbids non-authors from deleting a comment', async () => {
      await createProject();
      await addMember(ownerAgent, 'member@taskflow.dev', Role.MEMBER);
      const boards = await ownerAgent.get(`/api/projects/${projectId}`);
      const [c1] = boards.body.data.project.columns as { id: string }[];
      const task = await taskInColumn(c1.id, 'Task');

      const create = await authed(ownerAgent)
        .post(`/api/projects/${projectId}/tasks/${task.id}/comments`)
        .send({ body: 'Mine' });

      const res = await authed(memberAgent).delete(
        `/api/projects/${projectId}/tasks/${task.id}/comments/${create.body.data.id}`
      );
      expect(res.status).toBe(403);
    });

    it('returns 404 for comments on a missing task', async () => {
      await createProject();

      const res = await authed(ownerAgent)
        .post(`/api/projects/${projectId}/tasks/ghost/comments`)
        .send({ body: 'Hello' });
      expect(res.status).toBe(404);
    });
  });

  describe('Activities', () => {
    it('logs task lifecycle events', async () => {
      await createProject();
      const boards = await ownerAgent.get(`/api/projects/${projectId}`);
      const [c1] = boards.body.data.project.columns as { id: string }[];
      const task = await taskInColumn(c1.id, 'Task');
      await authed(ownerAgent).patch(`/api/projects/${projectId}/tasks/${task.id}`).send({ title: 'Renamed' });
      await authed(ownerAgent).delete(`/api/projects/${projectId}/tasks/${task.id}`);

      const res = await ownerAgent.get(`/api/projects/${projectId}/activities`);
      expect(res.status).toBe(200);
      const actions = res.body.data.map((a: { action: string }) => a.action);
      expect(actions).toEqual(
        expect.arrayContaining(['TASK_CREATED', 'TASK_UPDATED', 'TASK_DELETED'])
      );
    });

    it('limits activity to the project members', async () => {
      await createProject();

      const res = await viewerAgent.get(`/api/projects/${projectId}/activities`);
      expect(res.status).toBe(403);
    });
  });
});