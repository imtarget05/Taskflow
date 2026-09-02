import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Columns3,
  Download,
  Globe,
  Lock,
  MessageSquare,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';

/**
 * Marketing landing page. Every claim maps to a real Taskflow capability
 * (projects, kanban boards, comments, members, realtime updates, search,
 * CSV export, and the project-aware AI assistant). No invented features.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <SiteHeader />
      <main>
        <Hero />
        <Capabilities />
        <HowItWorks />
        <AiSection />
        <FaqSection />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}

const NAV_LINKS = [
  { href: '#capabilities', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#ai', label: 'AI assistant' },
  { href: '#faq', label: 'FAQ' },
];

function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <Link to="/" className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">T</span>
          <span className="text-lg font-bold tracking-tight">Taskflow</span>
        </Link>
        <div className="hidden items-center gap-6 text-sm font-medium text-ink-secondary md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-ink">{l.label}</a>
          ))}
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            Log in
          </Link>
          <Link to="/register" className="btn-primary">Get started</Link>
        </div>
        <button
          type="button"
          className="rounded-md p-2 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:hidden"
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown className={`h-5 w-5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </nav>
      {open && (
        <div className="border-t border-line bg-surface px-4 py-3 md:hidden">
          <ul className="space-y-1">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-surface-muted hover:text-ink">
                  {l.label}
                </a>
              </li>
            ))}
            <li className="flex gap-2 pt-2">
              <Link to="/login" className="btn-secondary flex-1" onClick={() => setOpen(false)}>Log in</Link>
              <Link to="/register" className="btn-primary flex-1" onClick={() => setOpen(false)}>Get started</Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Gradient orbs */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-br from-primaryContainer/50 via-transparent to-secondaryContainer/30 blur-3xl motion-reduce:hidden" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-tertiary/10 blur-3xl motion-reduce:hidden" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-14 md:px-8 md:pb-20 md:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-primaryContainer px-4 py-1.5 text-xs font-semibold text-onPrimaryContainer shadow-elevation1">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Now with an AI project assistant
            </p>
            <h1 className="type-display mt-5 text-balance">
              Plan projects clearly.{' '}
              <span className="bg-gradient-to-r from-primary to-tertiary bg-clip-text text-transparent">Move work forward</span> with your team.
            </h1>
            <p className="type-body mt-4 max-w-md text-ink-secondary">
              Taskflow gives your team boards, tasks, and conversations in one calm
              workspace — plus an AI assistant that helps you think through the plan
              before you commit to it.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-onPrimary shadow-elevation1 transition-all hover:opacity-90 hover:shadow-elevation2 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 justify-center sm:px-6">
                Create your workspace
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link to="/login" className="inline-flex items-center justify-center gap-2 rounded-full border border-outline bg-surface px-6 py-2.5 text-sm font-medium text-ink shadow-elevation1 transition-all hover:bg-surfaceContainer active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 justify-center sm:px-6">Log in</Link>
            </div>
            <p className="type-meta mt-4 text-ink-muted">Free to start · Works in your browser · Vietnamese & English</p>
          </div>
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}/** Static marketing mockup of the real product UI — board + agent panel. */
function ProductPreview() {
  return (
    <div className="card overflow-hidden p-0" aria-hidden="true">
      <div className="flex items-center gap-1.5 border-b border-line bg-surface-muted px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="ml-3 text-xs font-medium text-ink-muted">taskflow / Website launch</span>
      </div>
      <div className="grid grid-cols-[3rem_1fr_9rem] text-xs sm:grid-cols-[4rem_1fr_11rem]">
        <div className="space-y-2 border-r border-line bg-surface-muted/50 p-2">
          {['Home', 'Projects', 'Settings'].map((item) => (
            <p key={item} className="truncate rounded px-1 py-1 text-ink-muted">{item}</p>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 p-2.5">
          {([
            ['To do', ['Draft homepage copy', 'Collect testimonials', 'Pick color palette']],
            ['Doing', ['Build pricing page', 'Set up analytics']],
            ['Done', ['Buy domain', 'Design logo']],
          ] as const).map(([col, tasks]) => (
            <div key={col}>
              <p className="mb-1.5 flex items-center justify-between font-semibold text-ink-secondary">
                {col}<span className="text-ink-muted">{tasks.length}</span>
              </p>
              <div className="space-y-1.5">
                {tasks.map((task) => (
                  <div key={task} className="rounded-md border border-line bg-surface px-2 py-1.5 leading-snug text-ink shadow-card">
                    {task}
                    {task === 'Build pricing page' && (
                      <span className="mt-1 block h-1 w-2/3 rounded-full bg-accent/30">
                        <span className="block h-full w-1/2 rounded-full bg-accent" />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="hidden flex-col gap-1.5 border-l border-line bg-accent-soft/40 p-2.5 sm:flex">
          <p className="flex items-center gap-1 font-semibold text-accent-ink">
            <Sparkles className="h-3 w-3" /> Assistant
          </p>
          <p className="rounded-lg rounded-tl-none bg-surface px-2 py-1.5 leading-snug shadow-card">
            Want me to outline tasks for the pricing page?
          </p>
          <p className="ml-auto rounded-lg rounded-br-none bg-accent px-2 py-1.5 leading-snug text-white">
            Yes — 5 steps max
          </p>
        </div>
      </div>
    </div>
  );
}

const CAPABILITIES = [
  {
    icon: <Columns3 className="h-5 w-5" aria-hidden="true" />,
    title: 'Kanban boards that stay tidy',
    body: 'Organize work into projects, columns, and tasks. Drag cards between columns and every change saves instantly.',
  },
  {
    icon: <Users className="h-5 w-5" aria-hidden="true" />,
    title: 'Collaboration built in',
    body: 'Invite members with clear roles, discuss work in task comments and project chat, and see updates in real time.',
  },
  {
    icon: <Search className="h-5 w-5" aria-hidden="true" />,
    title: 'Find anything fast',
    body: 'Search across projects and tasks from anywhere with the command palette — one keystroke away.',
  },
  {
    icon: <Download className="h-5 w-5" aria-hidden="true" />,
    title: 'Your data stays yours',
    body: 'Export boards to CSV or Google Sheets whenever you need them outside the app.',
  },
];

function Capabilities() {
  return (
    <section id="capabilities" aria-labelledby="capabilities-title" className="border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-14 md:px-8 md:py-20">
        <SectionHead
          id="capabilities-title"
          eyebrow="Features"
          title="Everything a small team needs — nothing it doesn’t"
          description="Taskflow focuses on the core of project work: visible boards, clear ownership, and conversations next to the work itself."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <div key={c.title} className="card card-hover p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">{c.icon}</span>
              <h3 className="type-card-title mt-4 font-semibold text-ink">{c.title}</h3>
              <p className="type-caption mt-1.5 text-ink-secondary">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { title: 'Create a project', body: 'Give it a name and a color. Your first board is ready immediately.' },
  { title: 'Organize the work', body: 'Add columns and tasks, set priorities and due dates, assign owners.' },
  { title: 'Work together', body: 'Teammates comment, move cards, and chat — everyone sees changes live.' },
  { title: 'Keep moving', body: 'Track progress on the board and ask the AI assistant when you’re stuck.' },
];

function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="mx-auto max-w-6xl px-4 py-14 md:px-8 md:py-20">
      <SectionHead id="how-title" eyebrow="How it works" title="From empty workspace to first shipped task" />
      <ol className="mt-10 grid gap-4 md:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card relative p-5">
            <span className="text-2xl font-bold text-accent" aria-hidden="true">{i + 1}</span>
            <h3 className="type-card-title mt-2 font-semibold text-ink">{s.title}</h3>
            <p className="type-caption mt-1.5 text-ink-secondary">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}function AiSection() {
  return (
    <section id="ai" aria-labelledby="ai-title" className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-2">
        <div>
          <SectionHead
            id="ai-title"
            eyebrow="AI assistant"
            title="An AI that plans with you — not instead of you"
            description="The assistant knows what Taskflow is and how your work is structured. It asks one clarifying question at a time, confirms its understanding, and helps you break work down before anything changes."
          />
          <ul className="mt-6 space-y-2.5 text-sm text-ink-secondary">
            {[
              'Reason about your workspace and suggest how to structure projects and tasks',
              'Ask before acting — nothing happens without your confirmation',
              'Chat in Vietnamese, English, or Chinese — it follows your language',
              'Share files and images in the conversation for extra context',
            ].map((point) => (
              <li key={point} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="card space-y-3 p-5" aria-hidden="true">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            <Globe className="h-3.5 w-3.5" /> Tiếng Việt
          </p>
          <p className="max-w-[85%] rounded-xl rounded-tl-none bg-surface-muted px-3.5 py-2.5 type-caption">
            Mình muốn tổ chức lại dự án website thành các giai đoạn rõ ràng hơn.
          </p>
          <p className="ml-auto max-w-[85%] rounded-xl rounded-br-none bg-accent px-3.5 py-2.5 type-caption text-white">
            Gợi ý chia làm 3 giai đoạn: lên ý tưởng, xây dựng, và ra mắt. Bạn muốn xem chi tiết từng giai đoạn không?
          </p>
          <p className="max-w-[85%] rounded-xl rounded-tl-none bg-surface-muted px-3.5 py-2.5 type-caption">
            Ừ, bắt đầu với “Xây dựng” trước đi.
          </p>
        </div>
      </div>
    </section>
  );
}

const FAQS = [
  {
    q: 'What is Taskflow?',
    a: 'A project management workspace for teams: projects with kanban boards, tasks with priorities and due dates, comments, project chat, and an AI planning assistant — in one place.',
  },
  {
    q: 'What can the AI assistant actually do?',
    a: 'It discusses and plans your work with you: structuring projects and boards, breaking work into tasks, and answering questions about your workflow. It asks a clarifying question when something is unclear and always lets you confirm before treating a plan as final. It replies in Vietnamese, English, or Chinese.',
  },
  {
    q: 'Does my team see changes instantly?',
    a: 'Yes. Boards, tasks, comments, and chat update in real time for everyone in the project.',
  },
  {
    q: 'Can I get my data out?',
    a: 'Anytime. Export a board to CSV with one click, or sync it to Google Sheets.',
  },
  {
    q: 'How do I sign up?',
    a: 'Create an account with email and password, or continue with Google if it’s enabled on your server.',
  },
];

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-3xl px-4 py-14 md:px-8 md:py-20">
      <SectionHead id="faq-title" eyebrow="FAQ" title="Questions, answered" />
      <div className="mt-8 divide-y divide-line rounded-xl border border-line bg-surface">
        {FAQS.map((f, i) => {
          const open = openIndex === i;
          return (
            <div key={f.q}>
              <h3>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`faq-panel-${i}`}
                  id={`faq-button-${i}`}
                  onClick={() => setOpenIndex(open ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                >
                  {f.q}
                  <ChevronDown className={`h-4 w-4 shrink-0 text-ink-muted transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
              </h3>
              {open && (
                <div id={`faq-panel-${i}`} role="region" aria-labelledby={`faq-button-${i}`} className="px-5 pb-4">
                  <p className="type-caption text-ink-secondary">{f.a}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}function SectionHead({ id, eyebrow, title, description }: { id?: string; eyebrow?: string; title: string; description?: string }) {
  return (
    <div className="max-w-2xl">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-accent">{eyebrow}</p>}
      <h2 id={id} className="type-page-title mt-2 text-balance text-ink">{title}</h2>
      {description && <p className="type-body mt-3 text-ink-secondary">{description}</p>}
    </div>
  );
}

function CtaBand() {
  return (
    <section className="bg-surface-muted/60">
      <div className="mx-auto max-w-6xl px-4 py-16 text-center md:px-8">
        <h2 className="type-page-title text-balance text-ink">Ready to see your work clearly?</h2>
        <p className="type-body mx-auto mt-3 max-w-md text-ink-secondary">
          Set up your workspace in under a minute. Invite your team when you’re ready.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/register" className="btn-primary w-full justify-center sm:w-auto sm:px-6">
            Get started free
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link to="/login" className="btn-secondary w-full justify-center sm:w-auto sm:px-6">Log in</Link>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-8 md:flex-row md:px-8">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-xs font-bold text-white">T</span>
          <span className="text-sm font-bold tracking-tight">Taskflow</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-secondary">
          <a href="#capabilities" className="hover:text-ink">Features</a>
          <a href="#how-it-works" className="hover:text-ink">How it works</a>
          <Link to="/login" className="hover:text-ink">Log in</Link>
          <Link to="/register" className="hover:text-ink">Register</Link>
        </nav>
        <p className="flex items-center gap-1.5 text-xs text-ink-muted">
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          Built for teams · <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Session-first privacy
        </p>
      </div>
    </footer>
  );
}