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
  createdAt: string;
  updatedAt: string;
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
  /** Present on the cross-project dashboard feed (GET /api/activities). */
  projectId?: string;
  projectName?: string;
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

export interface TaskRecommendation {
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
  status: 'pending' | 'accepted' | 'dismissed' | 'expired';
  createdAt: string;
  expiresAt?: string | null;
  task?: {
    id: string;
    title: string;
    description?: string | null;
    priority: TaskPriority;
    projectName?: string;
  };
}

export interface UserSkill {
  id: string;
  skill: string;
  level: number;
}

export interface UserAvailability {
  id: string;
  dayOfWeek: number;
  morning: boolean;
  afternoon: boolean;
  evening: boolean;
}

export interface RecommendationWeights {
  skillMatch: number;
  availability: number;
  priority: number;
  history: number;
  workloadBalance: number;
}

export interface RecommendationStats {
  total: number;
  pending: number;
  accepted: number;
  dismissed: number;
  acceptRate: number;
}
