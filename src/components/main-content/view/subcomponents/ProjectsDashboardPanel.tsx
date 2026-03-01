import type { Project } from '../../../../types/app';

type ProjectsDashboardPanelProps = {
  projects: Project[];
};

type ProjectTaskStats = {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  review: number;
  completionPercentage: number;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return 0;
}

function getTaskStats(project: Project): ProjectTaskStats {
  const metadata = (project.taskmaster?.metadata || {}) as Record<string, unknown>;
  const total = toNumber(metadata.taskCount);
  const pending = toNumber(metadata.pending);
  const inProgress = toNumber(metadata.inProgress);
  const completed = toNumber(metadata.completed);
  const review = toNumber(metadata.review);

  let completionPercentage = toNumber(metadata.completionPercentage);
  if (!completionPercentage && total > 0) {
    completionPercentage = Math.round((completed / total) * 100);
  }

  return {
    total,
    pending,
    inProgress,
    completed,
    review,
    completionPercentage,
  };
}

function getSessionCount(project: Project): number {
  return (project.sessionMeta?.total || 0) +
    (project.cursorSessions?.length || 0) +
    (project.codexSessions?.length || 0) +
    (project.geminiSessions?.length || 0);
}

function formatDate(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString();
}

function extractPortFromValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const direct = Number.parseInt(value, 10);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }

  const mappedMatch = value.match(/(\d+)\s*:\s*\d+/);
  if (mappedMatch) {
    const mappedPort = Number.parseInt(mappedMatch[1], 10);
    if (Number.isFinite(mappedPort) && mappedPort > 0) {
      return mappedPort;
    }
  }

  return null;
}

function normalizeProjectUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (trimmed.startsWith('127.0.0.1:') || trimmed.startsWith('localhost:')) {
    return `http://${trimmed}`;
  }

  if (/^\d+$/.test(trimmed)) {
    return `http://127.0.0.1:${trimmed}`;
  }

  return null;
}

function getProjectUrl(project: Project): string | null {
  const topLevelCandidates = [
    project.url,
    project.primaryUrl,
    project.previewUrl,
    project.webUrl,
    project.appUrl,
    project.accessUrl,
  ];

  for (const candidate of topLevelCandidates) {
    const normalized = normalizeProjectUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const nestedContainers = [
    project.server,
    project.service,
    project.serviceInfo,
    project.docker,
    project.container,
  ];

  for (const container of nestedContainers) {
    if (!container || typeof container !== 'object') {
      continue;
    }

    const record = container as Record<string, unknown>;
    const nestedCandidates = [
      record.url,
      record.primaryUrl,
      record.previewUrl,
      record.webUrl,
      record.appUrl,
      record.accessUrl,
    ];

    for (const candidate of nestedCandidates) {
      const normalized = normalizeProjectUrl(candidate);
      if (normalized) {
        return normalized;
      }
    }

    const nestedPortCandidates = [record.port, record.hostPort];
    for (const portCandidate of nestedPortCandidates) {
      const port = extractPortFromValue(portCandidate);
      if (port) {
        return `http://127.0.0.1:${port}`;
      }
    }
  }

  const topLevelPortCandidates = [project.port, project.hostPort];
  for (const portCandidate of topLevelPortCandidates) {
    const port = extractPortFromValue(portCandidate);
    if (port) {
      return `http://127.0.0.1:${port}`;
    }
  }

  return null;
}

export default function ProjectsDashboardPanel({ projects }: ProjectsDashboardPanelProps) {
  const sortedProjects = [...projects].sort((a, b) => a.displayName.localeCompare(b.displayName));

  const totals = sortedProjects.reduce(
    (accumulator, project) => {
      const stats = getTaskStats(project);
      accumulator.projects += 1;
      accumulator.tasks += stats.total;
      accumulator.pending += stats.pending;
      accumulator.inProgress += stats.inProgress;
      accumulator.completed += stats.completed;
      accumulator.sessions += getSessionCount(project);
      return accumulator;
    },
    {
      projects: 0,
      tasks: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      sessions: 0,
    },
  );

  return (
    <div className="h-full overflow-auto p-4 md:p-5">
      <div className="mb-4 grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="rounded-lg border border-border/60 bg-card p-3">
          <div className="text-xs text-muted-foreground">Projects</div>
          <div className="text-lg font-semibold text-foreground">{totals.projects}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-3">
          <div className="text-xs text-muted-foreground">Total Tasks</div>
          <div className="text-lg font-semibold text-foreground">{totals.tasks}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-3">
          <div className="text-xs text-muted-foreground">Pending</div>
          <div className="text-lg font-semibold text-foreground">{totals.pending}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-3">
          <div className="text-xs text-muted-foreground">In Progress</div>
          <div className="text-lg font-semibold text-foreground">{totals.inProgress}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-3">
          <div className="text-xs text-muted-foreground">Completed</div>
          <div className="text-lg font-semibold text-foreground">{totals.completed}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-3">
          <div className="text-xs text-muted-foreground">Sessions</div>
          <div className="text-lg font-semibold text-foreground">{totals.sessions}</div>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 border-b border-border/60">
              <tr>
                <th className="text-left font-medium text-muted-foreground px-3 py-2">Project</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2">Path</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2">URL</th>
                <th className="text-right font-medium text-muted-foreground px-3 py-2">Sessions</th>
                <th className="text-right font-medium text-muted-foreground px-3 py-2">Tasks</th>
                <th className="text-right font-medium text-muted-foreground px-3 py-2">Pending</th>
                <th className="text-right font-medium text-muted-foreground px-3 py-2">In Progress</th>
                <th className="text-right font-medium text-muted-foreground px-3 py-2">Done</th>
                <th className="text-right font-medium text-muted-foreground px-3 py-2">Review</th>
                <th className="text-right font-medium text-muted-foreground px-3 py-2">Complete %</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2">Last Task Update</th>
              </tr>
            </thead>
            <tbody>
              {sortedProjects.map((project) => {
                const stats = getTaskStats(project);
                const metadata = (project.taskmaster?.metadata || {}) as Record<string, unknown>;
                const projectUrl = getProjectUrl(project);
                return (
                  <tr key={project.name} className="border-b border-border/40 last:border-b-0 hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{project.displayName}</div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[320px] truncate" title={project.fullPath}>
                      {project.fullPath}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[280px] truncate">
                      {projectUrl ? (
                        <a
                          href={projectUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                          title={projectUrl}
                        >
                          {projectUrl}
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">{getSessionCount(project)}</td>
                    <td className="px-3 py-2 text-right text-foreground">{stats.total}</td>
                    <td className="px-3 py-2 text-right text-foreground">{stats.pending}</td>
                    <td className="px-3 py-2 text-right text-foreground">{stats.inProgress}</td>
                    <td className="px-3 py-2 text-right text-foreground">{stats.completed}</td>
                    <td className="px-3 py-2 text-right text-foreground">{stats.review}</td>
                    <td className="px-3 py-2 text-right text-foreground">{stats.completionPercentage}%</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(metadata.lastModified)}</td>
                  </tr>
                );
              })}
              {sortedProjects.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-muted-foreground" colSpan={11}>
                    No projects found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
