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

  // Seed user skills
  const aliceSkills = [
    { skill: 'react', level: 5 },
    { skill: 'nodejs', level: 4 },
    { skill: 'typescript', level: 4 },
    { skill: 'database', level: 3 },
  ];

  const bobSkills = [
    { skill: 'design', level: 5 },
    { skill: 'ui', level: 4 },
    { skill: 'css', level: 4 },
    { skill: 'testing', level: 3 },
  ];

  for (const s of aliceSkills) {
    await prisma.userSkill.upsert({
      where: { userId_skill: { userId: alice.id, skill: s.skill } },
      update: { level: s.level },
      create: { userId: alice.id, skill: s.skill, level: s.level },
    });
  }

  for (const s of bobSkills) {
    await prisma.userSkill.upsert({
      where: { userId_skill: { userId: bob.id, skill: s.skill } },
      update: { level: s.level },
      create: { userId: bob.id, skill: s.skill, level: s.level },
    });
  }

  // Seed user availability (Mon-Fri, 9-18)
  for (const userId of [alice.id, bob.id]) {
    for (let day = 1; day <= 5; day += 1) {
      await prisma.userAvailability.upsert({
        where: { userId_dayOfWeek: { userId, dayOfWeek: day } },
        update: { morning: true, afternoon: true, evening: false },
        create: { userId, dayOfWeek: day, morning: true, afternoon: true, evening: false },
      });
    }
  }

  // Seed recommendation config (default weights)
  await prisma.recommendationConfig.upsert({
    where: { key: 'weights' },
    update: {},
    create: {
      key: 'weights',
      value: {
        skillMatch: 0.40,
        availability: 0.25,
        priority: 0.20,
        history: 0.10,
        workloadBalance: 0.05,
      },
    },
  });

  console.log('✅ Seed complete. Demo accounts: alice@taskflow.dev / bob@taskflow.dev (password123)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
