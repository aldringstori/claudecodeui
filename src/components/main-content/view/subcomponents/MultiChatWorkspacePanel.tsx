import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import ChatInterface from '../../../chat/view/ChatInterface';
import type { Project, ProjectSession, SessionProvider } from '../../../../types/app';
import type { SessionLifecycleHandler } from '../../types/types';

const MULTI_CHAT_STORAGE_KEY = 'multichat-selected-projects';
const MULTI_CHAT_GRID_COLUMNS_KEY = 'multichat-grid-columns';
const STARRED_PROJECTS_STORAGE_KEY = 'starredProjects';
const CLAUDE_SETTINGS_STORAGE_KEY = 'claude-settings';

type ProjectSortOrder = 'name' | 'date';
type SessionWithProvider = ProjectSession & { __provider: SessionProvider };
type MultiChatGridColumns = 2 | 3;

function readStoredSelection(): string[] {
  try {
    const raw = localStorage.getItem(MULTI_CHAT_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

function getGridClass(projectCount: number): string {
  if (projectCount <= 1) {
    return 'grid-cols-1';
  }
  if (projectCount === 2) {
    return 'grid-cols-1 xl:grid-cols-2';
  }
  if (projectCount <= 4) {
    return 'grid-cols-1 lg:grid-cols-2';
  }
  if (projectCount <= 6) {
    return 'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3';
  }
  return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';
}

function getGridClassByPreference(gridColumns: MultiChatGridColumns): string {
  return gridColumns === 3 ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1 lg:grid-cols-2';
}

function readGridColumnsPreference(): MultiChatGridColumns {
  try {
    const raw = localStorage.getItem(MULTI_CHAT_GRID_COLUMNS_KEY);
    return raw === '3' ? 3 : 2;
  } catch {
    return 2;
  }
}

function getTileMinHeightClass(projectCount: number, gridColumns: MultiChatGridColumns): string {
  if (gridColumns === 3) {
    if (projectCount <= 3) {
      return 'min-h-[500px]';
    }
    return 'min-h-[420px]';
  }

  if (projectCount <= 2) {
    return 'min-h-[540px]';
  }
  if (projectCount <= 4) {
    return 'min-h-[500px]';
  }
  return 'min-h-[440px]';
}

function loadStarredProjects(): Set<string> {
  try {
    const raw = localStorage.getItem(STARRED_PROJECTS_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set();
  }
}

function readProjectSortOrder(): ProjectSortOrder {
  try {
    const raw = localStorage.getItem(CLAUDE_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return 'name';
    }

    const parsed = JSON.parse(raw) as { projectSortOrder?: ProjectSortOrder };
    return parsed.projectSortOrder === 'date' ? 'date' : 'name';
  } catch {
    return 'name';
  }
}

function getSessionDate(session: SessionWithProvider): Date {
  if (session.__provider === 'cursor') {
    return new Date(session.createdAt || 0);
  }

  if (session.__provider === 'codex') {
    return new Date(session.createdAt || session.lastActivity || 0);
  }

  return new Date(session.lastActivity || session.createdAt || 0);
}

function getSessionName(session: SessionWithProvider): string {
  if (session.__provider === 'cursor') {
    return String(session.name || 'Untitled Session');
  }

  if (session.__provider === 'codex') {
    return String(session.summary || session.name || 'Codex Session');
  }

  if (session.__provider === 'gemini') {
    return String(session.summary || session.name || 'Gemini Session');
  }

  return String(session.summary || 'New Session');
}

function getAllProjectSessions(project: Project): SessionWithProvider[] {
  const claudeSessions = (project.sessions || []).map((session) => ({ ...session, __provider: 'claude' as const }));
  const cursorSessions = (project.cursorSessions || []).map((session) => ({ ...session, __provider: 'cursor' as const }));
  const codexSessions = (project.codexSessions || []).map((session) => ({ ...session, __provider: 'codex' as const }));
  const geminiSessions = (project.geminiSessions || []).map((session) => ({ ...session, __provider: 'gemini' as const }));

  return [...claudeSessions, ...cursorSessions, ...codexSessions, ...geminiSessions].sort(
    (sessionA, sessionB) => getSessionDate(sessionB).getTime() - getSessionDate(sessionA).getTime(),
  );
}

function getProjectSessionCount(project: Project): number {
  const loadedClaudeCount = project.sessions?.length || 0;
  const totalClaudeCount = Math.max(project.sessionMeta?.total || 0, loadedClaudeCount);

  return totalClaudeCount +
    (project.cursorSessions?.length || 0) +
    (project.codexSessions?.length || 0) +
    (project.geminiSessions?.length || 0);
}

function getProjectLastActivity(project: Project): Date {
  const sessions = getAllProjectSessions(project);
  if (sessions.length === 0) {
    return new Date(0);
  }

  return sessions.reduce((latest, session) => {
    const sessionDate = getSessionDate(session);
    return sessionDate > latest ? sessionDate : latest;
  }, new Date(0));
}

function sortProjectsLikeSidebar(
  projects: Project[],
  projectSortOrder: ProjectSortOrder,
  starredProjects: Set<string>,
): Project[] {
  const sorted = [...projects];

  sorted.sort((projectA, projectB) => {
    const aStarred = starredProjects.has(projectA.name);
    const bStarred = starredProjects.has(projectB.name);

    if (aStarred && !bStarred) {
      return -1;
    }

    if (!aStarred && bStarred) {
      return 1;
    }

    const sessionCountDelta = getProjectSessionCount(projectB) - getProjectSessionCount(projectA);
    if (sessionCountDelta !== 0) {
      return sessionCountDelta;
    }

    if (projectSortOrder === 'date') {
      return getProjectLastActivity(projectB).getTime() - getProjectLastActivity(projectA).getTime();
    }

    return (projectA.displayName || projectA.name).localeCompare(projectB.displayName || projectB.name);
  });

  return sorted;
}

type MultiChatWorkspacePanelProps = {
  projects: Project[];
  ws: WebSocket | null;
  sendMessage: (message: unknown) => void;
  latestMessage: unknown;
  onInputFocusChange: (focused: boolean) => void;
  onSessionActive: SessionLifecycleHandler;
  onSessionInactive: SessionLifecycleHandler;
  onSessionProcessing: SessionLifecycleHandler;
  onSessionNotProcessing: SessionLifecycleHandler;
  processingSessions: Set<string>;
  onReplaceTemporarySession: SessionLifecycleHandler;
  onShowSettings: () => void;
  autoExpandTools: boolean;
  showRawParameters: boolean;
  showThinking: boolean;
  autoScrollToBottom: boolean;
  sendByCtrlEnter: boolean;
  externalMessageUpdate: number;
};

export default function MultiChatWorkspacePanel({
  projects,
  ws,
  sendMessage,
  latestMessage,
  onInputFocusChange,
  onSessionActive,
  onSessionInactive,
  onSessionProcessing,
  onSessionNotProcessing,
  processingSessions,
  onReplaceTemporarySession,
  onShowSettings,
  autoExpandTools,
  showRawParameters,
  showThinking,
  autoScrollToBottom,
  sendByCtrlEnter,
  externalMessageUpdate,
}: MultiChatWorkspacePanelProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedProjectNames, setSelectedProjectNames] = useState<string[]>(readStoredSelection);
  const [selectedSessionIdsByProject, setSelectedSessionIdsByProject] = useState<Record<string, string | null>>({});
  const [starredProjects, setStarredProjects] = useState<Set<string>>(loadStarredProjects);
  const [projectSortOrder, setProjectSortOrder] = useState<ProjectSortOrder>(readProjectSortOrder);
  const [gridColumns, setGridColumns] = useState<MultiChatGridColumns>(readGridColumnsPreference);

  useEffect(() => {
    const syncSortPreferences = () => {
      setStarredProjects(loadStarredProjects());
      setProjectSortOrder(readProjectSortOrder());
    };

    syncSortPreferences();

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === STARRED_PROJECTS_STORAGE_KEY || event.key === CLAUDE_SETTINGS_STORAGE_KEY) {
        syncSortPreferences();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    const interval = window.setInterval(() => {
      if (document.hasFocus()) {
        syncSortPreferences();
      }
    }, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.clearInterval(interval);
    };
  }, []);

  const sortedProjects = useMemo(
    () => sortProjectsLikeSidebar(projects, projectSortOrder, starredProjects),
    [projects, projectSortOrder, starredProjects],
  );

  useEffect(() => {
    const existingProjectNames = new Set(sortedProjects.map((project) => project.name));

    setSelectedProjectNames((previous) => {
      const filtered = previous.filter((projectName) => existingProjectNames.has(projectName));
      if (filtered.length > 0 || sortedProjects.length === 0) {
        return filtered;
      }

      return [sortedProjects[0].name];
    });

    setSelectedSessionIdsByProject((previous) => {
      const next: Record<string, string | null> = {};

      Object.entries(previous).forEach(([projectName, sessionId]) => {
        if (!existingProjectNames.has(projectName)) {
          return;
        }

        if (!sessionId) {
          next[projectName] = null;
          return;
        }

        const project = sortedProjects.find((item) => item.name === projectName);
        const sessionStillExists = project
          ? getAllProjectSessions(project).some((session) => session.id === sessionId)
          : false;

        next[projectName] = sessionStillExists ? sessionId : null;
      });

      return next;
    });
  }, [sortedProjects]);

  useEffect(() => {
    try {
      localStorage.setItem(MULTI_CHAT_STORAGE_KEY, JSON.stringify(selectedProjectNames));
    } catch {
      // Ignore localStorage failures and keep runtime state.
    }
  }, [selectedProjectNames]);

  useEffect(() => {
    try {
      localStorage.setItem(MULTI_CHAT_GRID_COLUMNS_KEY, String(gridColumns));
    } catch {
      // Ignore localStorage failures and keep runtime state.
    }
  }, [gridColumns]);

  const selectedProjects = useMemo(
    () => {
      const selectedSet = new Set(selectedProjectNames);
      return sortedProjects.filter((project) => selectedSet.has(project.name));
    },
    [selectedProjectNames, sortedProjects],
  );

  const gridClass = getGridClassByPreference(gridColumns) || getGridClass(selectedProjects.length);
  const tileMinHeightClass = getTileMinHeightClass(selectedProjects.length, gridColumns);

  const toggleProject = (projectName: string) => {
    setSelectedProjectNames((previous) =>
      previous.includes(projectName)
        ? previous.filter((name) => name !== projectName)
        : [...previous, projectName],
    );
  };

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="border-b border-border/60 bg-background/70 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Multi Chat Workspace</h3>
          <p className="text-xs text-muted-foreground">
            Open multiple project chats at once. Add or remove projects from the picker.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-border/70 bg-card p-0.5">
            <button
              type="button"
              onClick={() => setGridColumns(2)}
              className={`px-2 py-1 text-xs rounded ${gridColumns === 2 ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted/40'}`}
            >
              2 cols
            </button>
            <button
              type="button"
              onClick={() => setGridColumns(3)}
              className={`px-2 py-1 text-xs rounded ${gridColumns === 3 ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted/40'}`}
            >
              3 cols
            </button>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen((previous) => !previous)}
            className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Projects ({selectedProjects.length})
          </button>
        </div>
      </div>

      {pickerOpen && (
        <div className="border-b border-border/60 bg-muted/20 px-4 py-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedProjectNames(sortedProjects.map((project) => project.name))}
              className="rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs text-foreground hover:bg-muted/40"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={() => setSelectedProjectNames([])}
              className="rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs text-foreground hover:bg-muted/40"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs text-foreground hover:bg-muted/40"
            >
              Done
            </button>
          </div>

          <div className="max-h-48 overflow-auto rounded-md border border-border/60 bg-card divide-y divide-border/40">
            {sortedProjects.map((project) => {
              const isSelected = selectedProjectNames.includes(project.name);
              return (
                <button
                  key={project.name}
                  type="button"
                  onClick={() => toggleProject(project.name)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/30"
                >
                  <div className="min-w-0 pr-3">
                    <div className="text-sm text-foreground truncate">{project.displayName}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{project.fullPath}</div>
                  </div>
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto p-3">
        {selectedProjects.length === 0 ? (
          <div className="h-full rounded-lg border border-dashed border-border/70 bg-card/50 flex items-center justify-center px-6 text-center">
            <div className="space-y-2">
              <p className="text-sm text-foreground">No projects selected.</p>
              <p className="text-xs text-muted-foreground">
                Click <span className="font-medium">Projects</span> to choose chats for this workspace.
              </p>
            </div>
          </div>
        ) : (
          <div className={`grid ${gridClass} gap-3`}>
            {selectedProjects.map((project) => (
              <section
                key={project.name}
                className={`rounded-lg border border-border/60 bg-card overflow-hidden flex flex-col min-h-0 ${tileMinHeightClass}`}
              >
                <header className="relative px-3 py-2 border-b border-border/60 bg-muted/20">
                  <div className="min-w-0 text-center">
                    <h4 className="text-sm font-medium text-foreground truncate">{project.displayName}</h4>
                    <div className="text-[11px] text-muted-foreground truncate">{project.fullPath}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleProject(project.name)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    aria-label={`Remove ${project.displayName}`}
                    title={`Remove ${project.displayName}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </header>

                <div className="flex-1 min-h-0">
                  {(() => {
                    const sessions = getAllProjectSessions(project);
                    const selectedSessionId = selectedSessionIdsByProject[project.name] || null;
                    const selectedSession = selectedSessionId
                      ? sessions.find((session) => session.id === selectedSessionId) || null
                      : null;

                    return (
                      <div className="h-full min-h-0 flex">
                        <aside className="w-52 min-w-[180px] border-r border-border/60 bg-muted/15 flex flex-col">
                          <div className="p-2 border-b border-border/50">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedSessionIdsByProject((previous) => ({
                                  ...previous,
                                  [project.name]: null,
                                }))
                              }
                              className={`w-full rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                !selectedSession
                                  ? 'border-primary/60 bg-primary/10 text-primary'
                                  : 'border-border/70 bg-background text-foreground hover:bg-muted/40'
                              }`}
                            >
                              New Session
                            </button>
                          </div>

                          <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground border-b border-border/40">
                            Chat History ({sessions.length})
                          </div>

                          <div className="flex-1 overflow-auto p-1.5 space-y-1">
                            {sessions.length === 0 ? (
                              <div className="px-2 py-3 text-[11px] text-muted-foreground">
                                No sessions yet.
                              </div>
                            ) : (
                              sessions.map((session) => {
                                const isActive = selectedSession?.id === session.id;
                                const providerLabel =
                                  session.__provider === 'cursor'
                                    ? 'CURSOR'
                                    : session.__provider === 'codex'
                                      ? 'CODEX'
                                      : session.__provider === 'gemini'
                                        ? 'GEMINI'
                                        : 'CLAUDE';

                                return (
                                  <button
                                    key={`${project.name}-${session.__provider}-${session.id}`}
                                    type="button"
                                    onClick={() =>
                                      setSelectedSessionIdsByProject((previous) => ({
                                        ...previous,
                                        [project.name]: session.id,
                                      }))
                                    }
                                    className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors ${
                                      isActive
                                        ? 'border-primary/60 bg-primary/10'
                                        : 'border-border/60 bg-background hover:bg-muted/40'
                                    }`}
                                    title={getSessionName(session)}
                                  >
                                    <div className="text-[10px] text-muted-foreground font-medium">{providerLabel}</div>
                                    <div className="text-xs text-foreground truncate">{getSessionName(session)}</div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </aside>

                        <div className="flex-1 min-h-0">
                          <ChatInterface
                            selectedProject={project}
                            selectedSession={selectedSession}
                            ws={ws}
                            sendMessage={sendMessage}
                            latestMessage={latestMessage as any}
                            onInputFocusChange={onInputFocusChange}
                            onSessionActive={onSessionActive}
                            onSessionInactive={onSessionInactive}
                            onSessionProcessing={onSessionProcessing}
                            onSessionNotProcessing={onSessionNotProcessing}
                            processingSessions={processingSessions}
                            onReplaceTemporarySession={onReplaceTemporarySession}
                            onShowSettings={onShowSettings}
                            autoExpandTools={autoExpandTools}
                            showRawParameters={showRawParameters}
                            showThinking={showThinking}
                            autoScrollToBottom={autoScrollToBottom}
                            sendByCtrlEnter={sendByCtrlEnter}
                            externalMessageUpdate={externalMessageUpdate}
                            onShowAllTasks={null}
                            showKanbanPanel={false}
                            showQuickSettingsPanel={false}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
