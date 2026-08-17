import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { useProjects, useCreateProject } from '@/hooks/useProjects';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const created = await createProject.mutateAsync({ name, description });
    setShowForm(false);
    setName('');
    setDescription('');
    navigate(`/projects/${created.id}`);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-brand-600">TaskFlow</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{user?.name}</span>
            <button onClick={() => void logout()} className="btn-secondary text-sm">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your projects</h2>
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
            {showForm ? 'Cancel' : '+ New project'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="card mt-4 space-y-3 p-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="input"
              required
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="input"
              rows={2}
            />
            <button type="submit" className="btn-primary">
              Create project
            </button>
          </form>
        )}

        {isLoading ? (
          <p className="mt-8 text-slate-500">Loading projects…</p>
        ) : projects && projects.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="card group p-5 transition hover:shadow-md"
              >
                <div
                  className="mb-3 h-1.5 w-10 rounded-full"
                  style={{ backgroundColor: project.color ?? '#6366f1' }}
                />
                <h3 className="font-semibold text-slate-800 group-hover:text-brand-600">
                  {project.name}
                </h3>
                {project.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{project.description}</p>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-8 text-slate-500">
            No projects yet. Create your first project to get started.
          </p>
        )}
      </main>
    </div>
  );
}