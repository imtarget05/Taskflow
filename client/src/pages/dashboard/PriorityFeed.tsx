import { Link } from 'react-router-dom';
import { AlertCircle, Clock, User, Bell, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Activity, Task } from '@/types';
import { Avatar, Badge, Button, Card } from '@/components/ui';

interface PriorityFeedProps {
  activities: (Activity & { projectName?: string })[];
  myTasks: Task[];
  currentUserName?: string;
  currentUserId?: string;
  onViewAllActivities?: () => void;
  onViewAllTasks?: () => void;
}

function getPriorityTone(priority: string): 'danger' | 'warning' | 'info' | 'success' | 'neutral' {
  switch (priority) {
    case 'URGENT':
      return 'danger';
    case 'HIGH':
      return 'warning';
    case 'MEDIUM':
      return 'info';
    case 'LOW':
      return 'success';
    default:
      return 'neutral';
  }
}

function getPriorityLabel(priority: string): string {
  switch (priority) {
    case 'URGENT':
      return 'Khẩn';
    case 'HIGH':
      return 'Cao';
    case 'MEDIUM':
      return 'Trung bình';
    case 'LOW':
      return 'Thấp';
    default:
      return priority;
  }
}

export function PriorityFeed({
  activities,
  myTasks,
  currentUserName,
  currentUserId,
  onViewAllActivities,
  onViewAllTasks,
}: PriorityFeedProps) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const overdueTasks = myTasks.filter((t) => t.dueDate && new Date(t.dueDate) < today && !t.completed);
  const dueTodayTasks = myTasks.filter((t) => t.dueDate && new Date(t.dueDate) >= today && new Date(t.dueDate) < new Date(today.getTime() + 86400000) && !t.completed);
  const assignedTasks = myTasks.filter((t) => t.assignments.some(a => a.user.id === currentUserId) && !t.completed);

  const hasContent = overdueTasks.length > 0 || dueTodayTasks.length > 0 || assignedTasks.length > 0 || activities.length > 0;

  if (!hasContent) return null;

  return (
    <section aria-labelledby="priority-feed-title" className="mt-6">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning-soft text-warning">
            <Bell className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 id="priority-feed-title" className="text-base font-semibold leading-5 text-ink">
              Cần chú ý
            </h2>
            <p className="type-meta text-ink-muted">Task quá hạn, hôm nay và giao cho bạn</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onViewAllTasks && (
            <Button variant="text" size="sm" onClick={onViewAllTasks}>
              Xem tất cả task
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
          {onViewAllActivities && (
            <Button variant="text" size="sm" onClick={onViewAllActivities}>
              Hoạt động
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <Card variant="outlined" className="overflow-hidden border-outlineVariant/60 bg-surfaceContainerLow">
        <ul className="divide-y divide-outlineVariant/40">
          {overdueTasks.length > 0 && (
            <>
              <li className="px-4 py-2 bg-danger-soft/50">
                <span className="type-caption font-medium text-danger flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Quá hạn ({overdueTasks.length})
                </span>
              </li>
              {overdueTasks.slice(0, 3).map((task) => (
                <PriorityTaskItem key={task.id} task={task} />
              ))}
              {overdueTasks.length > 3 && (
                <li className="px-4 py-2 text-center">
                  <Button variant="text" size="sm" onClick={onViewAllTasks}>
                    Xem thêm {overdueTasks.length - 3} task quá hạn
                  </Button>
                </li>
              )}
            </>
          )}

          {dueTodayTasks.length > 0 && (
            <>
              <li className="px-4 py-2 bg-warning-soft/50">
                <span className="type-caption font-medium text-warning flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  Hôm nay ({dueTodayTasks.length})
                </span>
              </li>
              {dueTodayTasks.slice(0, 3).map((task) => (
                <PriorityTaskItem key={task.id} task={task} />
              ))}
              {dueTodayTasks.length > 3 && (
                <li className="px-4 py-2 text-center">
                  <Button variant="text" size="sm" onClick={onViewAllTasks}>
                    Xem thêm {dueTodayTasks.length - 3} task hôm nay
                  </Button>
                </li>
              )}
            </>
          )}

          {assignedTasks.length > 0 && overdueTasks.length === 0 && dueTodayTasks.length === 0 && (
            <>
              <li className="px-4 py-2 bg-info-soft/50">
                <span className="type-caption font-medium text-info flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" aria-hidden="true" />
                  Được giao ({assignedTasks.length})
                </span>
              </li>
              {assignedTasks.slice(0, 5).map((task) => (
                <PriorityTaskItem key={task.id} task={task} />
              ))}
            </>
          )}

          {activities.length > 0 && (
            <>
              <li className="px-4 py-2 bg-surfaceContainerHighest/50">
                <span className="type-caption font-medium text-ink-secondary flex items-center gap-1.5">
                  <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                  Hoạt động gần đây
                </span>
              </li>
              {activities.slice(0, 5).map((activity) => (
                <ActivityItem key={activity.id} activity={activity} currentUserName={currentUserName} />
              ))}
              {activities.length > 5 && onViewAllActivities && (
                <li className="px-4 py-2 text-center">
                  <Button variant="text" size="sm" onClick={onViewAllActivities}>
                    Xem thêm {activities.length - 5} hoạt động
                  </Button>
                </li>
              )}
            </>
          )}
        </ul>
      </Card>
    </section>
  );
}

interface PriorityTaskItemProps {
  task: Task & { projectName?: string; columnName?: string };
}

function PriorityTaskItem({ task }: PriorityTaskItemProps) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !task.completed;
  const isDueToday = task.dueDate && new Date(task.dueDate).toDateString() === new Date().toDateString() && !task.completed;
  const assignee = task.assignments[0]?.user;

  return (
    <li className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surfaceContainerHighest/60">
      <Link
        to={`/projects/${task.projectId}`}
        className="flex min-w-0 flex-1 items-center gap-3 focus-m3-soft rounded-lg"
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            backgroundColor:
              task.priority === 'URGENT' ? 'rgb(var(--danger))' :
              task.priority === 'HIGH' ? 'rgb(var(--warning))' :
              task.priority === 'MEDIUM' ? 'rgb(var(--info))' :
              'rgb(var(--success))'
          }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{task.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {task.projectName && (
              <span className="truncate text-xs text-ink-muted">{task.projectName}</span>
            )}
            <Badge tone={getPriorityTone(task.priority)}>{getPriorityLabel(task.priority)}</Badge>
            {task.columnName && (
              <span className="text-xs text-ink-muted">{task.columnName}</span>
            )}
            {isOverdue && (
              <span className="flex items-center gap-1 text-xs text-danger font-medium">
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                Quá hạn
              </span>
            )}
            {isDueToday && !isOverdue && (
              <span className="flex items-center gap-1 text-xs text-warning font-medium">
                <Clock className="h-3 w-3" aria-hidden="true" />
                Hôm nay
              </span>
            )}
          </div>
        </div>
        {assignee && (
          <Avatar name={assignee.name} size="xs" className="shrink-0" />
        )}
      </Link>
    </li>
  );
}

interface ActivityItemProps {
  activity: Activity & { projectName?: string };
  currentUserName?: string;
}

function ActivityItem({ activity, currentUserName }: ActivityItemProps) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surfaceContainerHighest/60">
      <Avatar name={activity.user.name} size="xs" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink-secondary">
          <span className="font-semibold text-ink">
            {activity.user.name === currentUserName ? 'Bạn' : activity.user.name}
          </span>{' '}
          <span className="text-ink-muted">{activity.action.replace(/_/g, ' ').toLowerCase()}</span>
          {' in '}
          <span className="font-medium text-primary">{activity.projectName}</span>
          {activity.metadata && 'title' in activity.metadata && typeof activity.metadata.title === 'string' && (
            <span className="font-medium text-ink"> · {activity.metadata.title}</span>
          )}
        </p>
      </div>
      <span className="hidden shrink-0 items-center gap-1 text-xs text-ink-muted sm:flex">
        <Clock className="h-3 w-3" aria-hidden="true" />
        {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
      </span>
    </li>
  );
}