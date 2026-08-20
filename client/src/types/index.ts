export type Role = 'OWNER' | 'MEMBER' | 'VIEWER';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  ownerId: string;
}

export interface ProjectSummary extends Project {
  members: ProjectMember[];
  columns: { _count: { tasks: number } }[];
}

export interface ProjectMember {
  id: string;
  role: Role;
  user: User;
}

export interface Task {
  id: string;
  projectId: string;
  columnId: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  priority: TaskPriority;
  position: number;
  completed: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  assignments: { id: string; user: User }[];
  comments?: Comment[];
  createdBy?: User;
}

export interface Column {
  id: string;
  projectId: string;
  name: string;
  position: number;
  tasks: Task[];
}

export interface Comment {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
  author: User;
}

export interface Activity {
  id: string;
  action: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  user: User;
}

export interface BoardData {
  project: Project & {
    columns: Column[];
    members: ProjectMember[];
  };
  role: Role;
}

export interface AuthResponse {
  user: User;
  csrfToken?: string;
}

export interface ChatMember {
  user: User;
  joinedAt: string;
}

export interface ChatMessage {
  id: string;
  groupId: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender: User;
}

export interface ChatGroup {
  id: string;
  projectId: string;
  name: string;
  members: ChatMember[];
  messages: ChatMessage[];
}
