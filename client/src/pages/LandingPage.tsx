import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckSquare,
  Columns3,
  History,
  MessageSquare,
  MousePointer2,
  Rocket,
  Search,
  Sparkles,
  Target,
  Users,
  Zap,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
            <CheckSquare className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-bold tracking-tight">TaskFlow</span>
        </div>

        <div className="hidden items-center gap-6 text-sm font-medium text-ink-secondary md:flex">
          <a href="#features" className="transition-colors hover:text-ink">
            Features
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-ink">
            How it works
          </a>
          <a href="#cta" className="transition-colors hover:text-ink">
            Get started
          </a>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Get started
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Soft brand glow behind the headline */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(60%_50%_at_50%_0%,rgb(var(--accent-soft)),transparent)]"
      />
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-20 md:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-secondary transition-colors hover:text-ink"
          >
            <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            Real-time Kanban for small teams
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
            Plan, organize, and ship in{' '}
            <span className="text-accent-ink">calm</span>, real&nbsp;time.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-secondary">
            TaskFlow keeps your team's work visible on a live Kanban board with collaboration,
            context, and a shared activity history — free for individuals, built for focus.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Get started free
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-6 py-3 text-base font-medium text-ink transition-colors hover:bg-surface-2"
            >
              See how it works
            </a>
          </div>
          <p className="mt-6 text-sm text-ink-muted">
            Free for individuals · No credit card · Collaborative by design
          </p>
        </div>
        <PreviewBoard />
      </div>
    </section>
  );
}

function PreviewBoard() {
  const columns = [
    {
      name: 'Backlog',
      tone: 'text-ink-secondary',
      dot: 'bg-surface-3',
      tasks: [
        { title: 'Interview prep', meta: 'High · Aug 24', done: false },
        { title: 'Write OAuth doc', meta: 'Research', done: false },
      ],
    },
    {
      name: 'In progress',
      tone: 'text-accent-ink',
      dot: 'bg-accent',
      tasks: [
        { title: 'Landing page hero', meta: '2 assignees', done: true },
        { title: 'Realtime sync test', meta: 'This week', done: false },
      ],
    },
    {
      name: 'Done',
      tone: 'text-ink-muted',
      dot: 'bg-success',
      tasks: [
        { title: 'Auth flow', meta: 'Completed', done: true },
        { title: 'Drag & drop columns', meta: 'Ship it', done: true },
      ],
    },
  ];

  return (
    <div
      aria-hidden="true"
      className="mx-auto mt-14 max-w-6xl rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6"
    >
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <span className="flex h-2.5 w-2.5 rounded-full bg-danger" />
        <span className="flex h-2.5 w-2.5 rounded-full bg-warning" />
        <span className="flex h-2.5 w-2.5 rounded-full bg-success" />
        <span className="mx-auto text-sm font-medium text-ink-secondary">Product launch</span>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink">
          Live
        </span>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {columns.map((col) => (
          <div key={col.name} className="rounded-xl border border-line bg-surface-2 p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                {col.name}
              </span>
              <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">
                {col.tasks.length}
              </span>
            </div>
            <div className="space-y-2">
              {col.tasks.map((task) => (
                <div
                  key={task.title}
                  className="rounded-lg border border-line bg-surface px-3 py-2 shadow-card"
                >
                  <p className={`text-sm font-medium ${task.done ? 'text-ink-muted line-through' : 'text-ink'}`}>
                    {task.title}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">{task.meta}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function HowItWorks() {
  const steps = [
    {
      icon: <Target className="h-5 w-5" aria-hidden="true" />,
      title: 'Create a project',
      body: 'Name your workspace, add a short description, and give it a color so your board feels instantly yours.',
    },
    {
      icon: <Columns3 className="h-5 w-5" aria-hidden="true" />,
      title: 'Shape the board',
      body: 'Add columns for any workflow — Backlog, In progress, Done — and drag tasks between them or reorder columns with ease.',
    },
    {
      icon: <Rocket className="h-5 w-5" aria-hidden="true" />,
      title: 'Collaborate in real time',
      body: 'Assign people, leave comments, and watch teammates update the same board live over WebSocket — no refresh needed.',
    },
  ];

  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-24 md:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight">From idea to shipped, without friction</h2>
        <p className="mt-4 text-lg text-ink-secondary">
          A focused Kanban workflow with the collaboration and context small teams actually use.
        </p>
      </div>
      <ol className="mt-12 grid gap-6 md:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="card p-6">
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                {step.icon}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Step {i + 1}
              </span>
            </div>
            <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
function Features() {
  const features = [
    {
      icon: <Zap className="h-5 w-5" aria-hidden="true" />,
      title: 'Realtime by default',
      body: 'Every column, task, and comment stays in sync across everyone in the project room via Socket.io.',
    },
    {
      icon: <MousePointer2 className="h-5 w-5" aria-hidden="true" />,
      title: 'Smooth drag & drop',
      body: 'Move tasks between columns and reorder them with dnd-kit. The board persists each change the moment you drop.',
    },
    {
      icon: <MessageSquare className="h-5 w-5" aria-hidden="true" />,
      title: 'Comments in context',
      body: 'Discuss work right where it happens. Every task keeps its comments and assignees in one place.',
    },
    {
      icon: <History className="h-5 w-5" aria-hidden="true" />,
      title: 'Activity timeline',
      body: 'A shared history records creates, updates, moves, and assignments so the team always knows what changed.',
    },
    {
      icon: <Search className="h-5 w-5" aria-hidden="true" />,
      title: 'Global search',
      body: 'Jump anywhere from your keyboard — Cmd/Ctrl+K opens search across every project, task, and comment.',
    },
    {
      icon: <Users className="h-5 w-5" aria-hidden="true" />,
      title: 'Built for small teams',
      body: 'Add members to projects, set priorities and due dates, and keep everyone on one shared source of truth.',
    },
  ];

  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-24 md:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight">Built for the way work really happens</h2>
        <p className="mt-4 text-lg text-ink-secondary">
          Every feature earns its place. No bloated modules, no dead icons — just the tools that keep a board moving.
        </p>
      </div>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <div key={feature.title} className="card flex flex-col gap-4 p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
              {feature.icon}
            </span>
            <h3 className="text-lg font-semibold">{feature.title}</h3>
            <p className="text-sm leading-relaxed text-ink-secondary">{feature.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
function CtaBand() {
  return (
    <section id="cta" className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-10 text-center shadow-card sm:p-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(var(--accent-soft)),transparent)]"
        />
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white">
          <Rocket className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
          Start organizing work today
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-secondary">
          Create a free workspace, invite your team, and keep your board flowing in real time. No credit card required.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            to="/register"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Get started free
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-lg border border-line bg-surface px-6 py-3 text-base font-medium text-ink transition-colors hover:bg-surface-2"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-10 sm:flex-row md:px-8">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
            <CheckSquare className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-bold tracking-tight">TaskFlow</p>
            <p className="text-xs text-ink-muted">Real-time Kanban workspace</p>
          </div>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-secondary">
          <a href="#features" className="transition-colors hover:text-ink">Features</a>
          <a href="#how-it-works" className="transition-colors hover:text-ink">How it works</a>
          <Link to="/login" className="transition-colors hover:text-ink">Sign in</Link>
          <Link to="/register" className="transition-colors hover:text-ink">Get started</Link>
        </nav>
        <p className="text-xs text-ink-muted">© {year} TaskFlow</p>
      </div>
    </footer>
  );
}