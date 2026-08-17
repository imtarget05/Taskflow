import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Seeding database...');

  const alicePassword = await bcrypt.hash('password123', 10);
  const bobPassword = await bcrypt.hash('password123', 10);

  const alice = await prisma.user.upsert({
    where: { email: 'alice@taskflow.dev' },
    update: {},
    create: { email: 'alice@taskflow.dev', name: 'Alice Nguyen', password: alicePassword },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@taskflow.dev' },
    update: {},
    create: { email: 'bob@taskflow.dev', name: 'Bob Le', password: bobPassword },
  });

  const project = await prisma.project.upsert({
    where: { id: 'demo-project' },
    update: { ownerId: alice.id },
    create: {
      id: 'demo-project',
      name: 'TaskFlow Launch',
      description: 'Demo project for TaskFlow',
      color: '#6366f1',
      ownerId: alice.id,
    },
  });

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: alice.id } },
    update: { role: Role.OWNER },
    create: { projectId: project.id, userId: alice.id, role: Role.OWNER },
  });
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: bob.id } },
    update: { role: Role.MEMBER },
    create: { projectId: project.id, userId: bob.id, role: Role.MEMBER },
  });

  const columnNames = ['To Do', 'In Progress', 'Done'];
  const columns = [];
  for (let i = 0; i < columnNames.length; i += 1) {
    const column = await prisma.column.upsert({
      where: { id: `demo-column-${i}` },
      update: { name: columnNames[i], projectId: project.id, position: i },
      create: {
        id: `demo-column-${i}`,
        projectId: project.id,
        name: columnNames[i],
        position: i,
      },
    });
    columns.push(column);
  }

  const sampleTasks = [
    { title: 'Setup database schema', description: 'Design Prisma schema & run first migration', priority: 'HIGH' },
    { title: 'Build auth module', description: 'JWT + refresh token flow', priority: 'URGENT' },
    { title: 'Kanban board drag & drop', description: 'dnd-kit integration on the board', priority: 'MEDIUM' },
  ];

  for (let i = 0; i < sampleTasks.length; i += 1) {
    await prisma.task.upsert({
      where: { id: `demo-task-${i}` },
      update: { projectId: project.id },
      create: {
        id: `demo-task-${i}`,
        projectId: project.id,
        columnId: columns[i % columns.length].id,
        title: sampleTasks[i].title,
        description: sampleTasks[i].description,
        priority: sampleTasks[i].priority as never,
        position: i,
        createdById: alice.id,
      },
    });
  }

  console.log('✅ Seed complete. Demo accounts: alice@taskflow.dev / bob@taskflow.dev (password123)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());