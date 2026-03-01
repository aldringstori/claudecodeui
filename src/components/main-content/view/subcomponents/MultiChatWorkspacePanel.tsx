import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Blocks,
  Braces,
  Code2,
  Coffee,
  FileCode2,
  FolderOpen,
  Gem,
  GripVertical,
  Hexagon,
  Plus,
  Terminal,
  X,
  type LucideIcon,
} from 'lucide-react';
import ChatInterface from '../../../chat/view/ChatInterface';
import type { Project, ProjectSession, SessionProvider } from '../../../../types/app';
import type { SessionLifecycleHandler } from '../../types/types';
import { authenticatedFetch } from '../../../../utils/api';
import FileTree from '../../../file-tree/view/FileTree';
import { useEditorSidebar } from '../../../code-editor/hooks/useEditorSidebar';
import EditorSidebar from '../../../code-editor/view/EditorSidebar';
import StandaloneShell from '../../../standalone-shell/view/StandaloneShell';

const MULTI_CHAT_STORAGE_KEY = 'multichat-selected-projects';
const MULTI_CHAT_GRID_COLUMNS_KEY = 'multichat-grid-columns';
const STARRED_PROJECTS_STORAGE_KEY = 'starredProjects';
const CLAUDE_SETTINGS_STORAGE_KEY = 'claude-settings';
const MULTI_CHAT_SELECTED_PROJECTS_KEY = 'multiChatSelectedProjects';
const MULTI_CHAT_SELECTED_SESSIONS_KEY = 'multiChatSelectedSessionsByProject';

type ProjectSortOrder = 'name' | 'date';
type SessionWithProvider = ProjectSession & { __provider: SessionProvider };
type MultiChatGridColumns = 2 | 3;
type ProjectAccentStyle = {
  borderClass: string;
  labelBorderClass: string;
  labelTextClass: string;
  lineClass: string;
  glowClass: string;
};

type ProjectLanguageIconConfig = {
  label: string;
  icon: LucideIcon;
  colorClass: string;
};

const PROJECT_ACCENTS: ProjectAccentStyle[] = [
  {
    borderClass: 'border-cyan-400/70',
    labelBorderClass: 'border-cyan-400/70',
    labelTextClass: 'text-cyan-500 dark:text-cyan-300',
    lineClass: 'bg-cyan-400/70',
    glowClass: 'shadow-[0_0_0_1px_rgba(34,211,238,0.2)]',
  },
  {
    borderClass: 'border-fuchsia-400/70',
    labelBorderClass: 'border-fuchsia-400/70',
    labelTextClass: 'text-fuchsia-500 dark:text-fuchsia-300',
    lineClass: 'bg-fuchsia-400/70',
    glowClass: 'shadow-[0_0_0_1px_rgba(232,121,249,0.2)]',
  },
  {
    borderClass: 'border-emerald-400/70',
    labelBorderClass: 'border-emerald-400/70',
    labelTextClass: 'text-emerald-500 dark:text-emerald-300',
    lineClass: 'bg-emerald-400/70',
    glowClass: 'shadow-[0_0_0_1px_rgba(52,211,153,0.2)]',
  },
  {
    borderClass: 'border-amber-400/70',
    labelBorderClass: 'border-amber-400/70',
    labelTextClass: 'text-amber-600 dark:text-amber-300',
    lineClass: 'bg-amber-400/70',
    glowClass: 'shadow-[0_0_0_1px_rgba(251,191,36,0.2)]',
  },
  {
    borderClass: 'border-violet-400/70',
    labelBorderClass: 'border-violet-400/70',
    labelTextClass: 'text-violet-500 dark:text-violet-300',
    lineClass: 'bg-violet-400/70',
    glowClass: 'shadow-[0_0_0_1px_rgba(167,139,250,0.2)]',
  },
  {
    borderClass: 'border-rose-400/70',
    labelBorderClass: 'border-rose-400/70',
    labelTextClass: 'text-rose-500 dark:text-rose-300',
    lineClass: 'bg-rose-400/70',
    glowClass: 'shadow-[0_0_0_1px_rgba(251,113,133,0.2)]',
  },
];

const LANGUAGE_ICON_BY_NAME: Record<string, ProjectLanguageIconConfig> = {
  php: { label: 'PHP', icon: Blocks, colorClass: 'text-violet-500 dark:text-violet-300' },
  typescript: { label: 'TypeScript', icon: FileCode2, colorClass: 'text-sky-500 dark:text-sky-300' },
  javascript: { label: 'JavaScript', icon: Braces, colorClass: 'text-amber-500 dark:text-amber-300' },
  python: { label: 'Python', icon: Code2, colorClass: 'text-emerald-500 dark:text-emerald-300' },
  go: { label: 'Go', icon: Hexagon, colorClass: 'text-cyan-500 dark:text-cyan-300' },
  rust: { label: 'Rust', icon: Hexagon, colorClass: 'text-orange-500 dark:text-orange-300' },
  ruby: { label: 'Ruby', icon: Gem, colorClass: 'text-rose-500 dark:text-rose-300' },
  java: { label: 'Java', icon: Coffee, colorClass: 'text-red-500 dark:text-red-300' },
  csharp: { label: 'C#', icon: Hexagon, colorClass: 'text-purple-500 dark:text-purple-300' },
  unknown: { label: 'Code', icon: FileCode2, colorClass: 'text-muted-foreground' },
};

function getProjectAccent(projectName: string): ProjectAccentStyle {
  if (!projectName) {
    return PROJECT_ACCENTS[0];
  }

  let hash = 0;
  for (let index = 0; index < projectName.length; index += 1) {
    hash = (hash * 31 + projectName.charCodeAt(index)) >>> 0;
  }

  return PROJECT_ACCENTS[hash % PROJECT_ACCENTS.length];
}

function getProjectLanguageIcon(project: Project): ProjectLanguageIconConfig {
  const languageKey = String(project.primaryLanguage || '').trim().toLowerCase();
  return LANGUAGE_ICON_BY_NAME[languageKey] || LANGUAGE_ICON_BY_NAME.unknown;
}

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

function getTileHeightClass(gridColumns: MultiChatGridColumns): string {
  if (gridColumns === 3) {
    return 'h-[520px]';
  }
  return 'h-[620px]';
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

type MultiChatProjectTileView = 'chat' | 'files' | 'shell';

type MultiChatProjectTileProps = {
  project: Project;
  accentStyle: ProjectAccentStyle;
  selectedSessionId: string | null;
  onSessionChange: (projectName: string, sessionId: string | null) => void;
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

function MultiChatProjectTile({
  project,
  selectedSessionId,
  onSessionChange,
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
}: MultiChatProjectTileProps) {
  const [view, setView] = useState<MultiChatProjectTileView>('chat');

  const {
    editingFile,
    editorWidth,
    editorExpanded,
    hasManualWidth,
    resizeHandleRef,
    handleFileOpen,
    handleCloseEditor,
    handleToggleEditorExpand,
    handleResizeStart,
  } = useEditorSidebar({
    selectedProject: project,
    isMobile: false,
    initialWidth: 380,
  });

  const sessions = useMemo(
    () => getAllProjectSessions(project),
    [project],
  );

  const selectedSession = useMemo(
    () => (selectedSessionId ? sessions.find((session) => session.id === selectedSessionId) || null : null),
    [selectedSessionId, sessions],
  );

  return (
    <div className="h-full min-h-0 flex">
      <aside className="w-52 min-w-[180px] border-r border-border/60 bg-muted/15 flex flex-col">
        <div className="p-2 border-b border-border/50 space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setView('files')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                view === 'files'
                  ? 'border-primary/60 bg-primary/10 text-primary'
                  : 'border-border/70 bg-background text-foreground hover:bg-muted/40'
              }`}
              title={`Open ${project.displayName} files`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Files
            </button>
            <button
              type="button"
              onClick={() => setView('shell')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                view === 'shell'
                  ? 'border-primary/60 bg-primary/10 text-primary'
                  : 'border-border/70 bg-background text-foreground hover:bg-muted/40'
              }`}
              title={`Open ${project.displayName} shell`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Shell
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onSessionChange(project.name, null);
              setView('chat');
            }}
            className={`w-full rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              view === 'chat' && !selectedSession
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
                  onClick={() => {
                    onSessionChange(project.name, session.id);
                    setView('chat');
                  }}
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

      <div className="flex-1 min-h-0 overflow-hidden">
        {view === 'chat' && (
          <ChatInterface
            selectedProject={project}
            selectedSession={selectedSession}
            ws={ws}
            sendMessage={sendMessage}
            latestMessage={latestMessage as any}
            onFileOpen={handleFileOpen}
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
        )}

        {view === 'files' && (
          <div className="h-full w-full flex min-h-0 overflow-hidden">
            <div className={`flex min-h-0 min-w-0 overflow-hidden ${editorExpanded ? 'hidden' : ''} flex-1`}>
              <FileTree selectedProject={project} onFileOpen={handleFileOpen} />
            </div>

            <EditorSidebar
              editingFile={editingFile}
              isMobile={false}
              editorExpanded={editorExpanded}
              editorWidth={editorWidth}
              hasManualWidth={hasManualWidth}
              resizeHandleRef={resizeHandleRef}
              onResizeStart={handleResizeStart}
              onCloseEditor={handleCloseEditor}
              onToggleEditorExpand={handleToggleEditorExpand}
              projectPath={project.path || project.fullPath}
              fillSpace
            />
          </div>
        )}

        {view === 'shell' && (
          <div className="h-full w-full min-h-0">
            <StandaloneShell
              project={project}
              session={selectedSession}
              showHeader={false}
              minimal
            />
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [draggedProjectName, setDraggedProjectName] = useState<string | null>(null);
  const projectTileRefs = useRef<Record<string, HTMLElement | null>>({});
  const [hasLoadedServerPreferences, setHasLoadedServerPreferences] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    const loadServerPreferences = async () => {
      try {
        const response = await authenticatedFetch(
          `/api/user/ui-preferences?keys=${MULTI_CHAT_SELECTED_PROJECTS_KEY},${MULTI_CHAT_SELECTED_SESSIONS_KEY}`,
        );
        if (!response.ok) {
          throw new Error(`Failed to load multi-chat preferences (${response.status})`);
        }

        const payload = await response.json() as {
          preferences?: Record<string, unknown>;
        };
        const preferences = payload.preferences || {};
        const projectNames = preferences[MULTI_CHAT_SELECTED_PROJECTS_KEY];
        const sessionMap = preferences[MULTI_CHAT_SELECTED_SESSIONS_KEY];

        if (!cancelled && Array.isArray(projectNames)) {
          const normalizedProjectNames = projectNames.filter(
            (value): value is string => typeof value === 'string' && value.length > 0,
          );

          if (normalizedProjectNames.length > 0) {
            setSelectedProjectNames(normalizedProjectNames);
          }
        }

        if (!cancelled && sessionMap && typeof sessionMap === 'object' && !Array.isArray(sessionMap)) {
          const normalizedSessionMap = Object.fromEntries(
            Object.entries(sessionMap as Record<string, unknown>).filter(
              ([projectName, sessionId]) =>
                typeof projectName === 'string' &&
                projectName.length > 0 &&
                (typeof sessionId === 'string' || sessionId === null),
            ),
          ) as Record<string, string | null>;

          if (Object.keys(normalizedSessionMap).length > 0) {
            setSelectedSessionIdsByProject(normalizedSessionMap);
          }
        }
      } catch (error) {
        console.warn('Unable to load multi-chat preferences:', error);
      } finally {
        if (!cancelled) {
          setHasLoadedServerPreferences(true);
        }
      }
    };

    void loadServerPreferences();

    return () => {
      cancelled = true;
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

  useEffect(() => {
    if (!hasLoadedServerPreferences) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void authenticatedFetch('/api/user/ui-preferences', {
        method: 'PATCH',
        body: JSON.stringify({
          preferences: {
            [MULTI_CHAT_SELECTED_PROJECTS_KEY]: selectedProjectNames,
            [MULTI_CHAT_SELECTED_SESSIONS_KEY]: selectedSessionIdsByProject,
          },
        }),
      }).catch((error) => {
        console.warn('Unable to save multi-chat preferences:', error);
      });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [hasLoadedServerPreferences, selectedProjectNames, selectedSessionIdsByProject]);

  const selectedProjects = useMemo(
    () => {
      return selectedProjectNames
        .map((projectName) => sortedProjects.find((project) => project.name === projectName) || null)
        .filter((project): project is Project => Boolean(project));
    },
    [selectedProjectNames, sortedProjects],
  );
  const selectedProjectNameSet = useMemo(
    () => new Set(selectedProjectNames),
    [selectedProjectNames],
  );
  const availableProjects = useMemo(
    () => sortedProjects.filter((project) => !selectedProjectNameSet.has(project.name)),
    [sortedProjects, selectedProjectNameSet],
  );

  const gridClass = getGridClassByPreference(gridColumns) || getGridClass(selectedProjects.length);
  const tileHeightClass = getTileHeightClass(gridColumns);

  const toggleProject = (projectName: string) => {
    setSelectedProjectNames((previous) =>
      previous.includes(projectName)
        ? previous.filter((name) => name !== projectName)
        : [...previous, projectName],
    );
  };

  const moveProjectByStep = (projectName: string, step: -1 | 1) => {
    setSelectedProjectNames((previous) => {
      const index = previous.indexOf(projectName);
      if (index < 0) {
        return previous;
      }

      const targetIndex = index + step;
      if (targetIndex < 0 || targetIndex >= previous.length) {
        return previous;
      }

      const next = [...previous];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const moveProjectBeforeTarget = (sourceProjectName: string, targetProjectName: string) => {
    setSelectedProjectNames((previous) => {
      const sourceIndex = previous.indexOf(sourceProjectName);
      const targetIndex = previous.indexOf(targetProjectName);

      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return previous;
      }

      const next = [...previous];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const jumpToProjectTile = (projectName: string) => {
    const tile = projectTileRefs.current[projectName];
    if (!tile) {
      return;
    }

    tile.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
  };

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="border-b border-border/60 bg-background/70 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Multi Chat Workspace</h3>
          <p className="text-xs text-muted-foreground">
            Open multiple project chats at once. Add or remove projects from the picker.
          </p>
          {selectedProjects.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <div className="flex items-center gap-3 whitespace-nowrap">
                {selectedProjects.map((project) => (
                  <button
                    key={`jump-${project.name}`}
                    type="button"
                    onClick={() => jumpToProjectTile(project.name)}
                    className="text-xs text-primary underline-offset-2 hover:underline"
                    title={`Jump to ${project.displayName}`}
                  >
                    {project.displayName}
                  </button>
                ))}
              </div>
            </div>
          )}
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
              onClick={() =>
                setSelectedProjectNames((previous) => {
                  const existing = new Set(previous);
                  const additions = sortedProjects
                    .map((project) => project.name)
                    .filter((projectName) => !existing.has(projectName));

                  if (additions.length === 0) {
                    return previous;
                  }

                  return [...previous, ...additions];
                })
              }
              disabled={availableProjects.length === 0}
              className="rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs text-foreground enabled:hover:bg-muted/40 disabled:opacity-50 disabled:cursor-not-allowed"
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
            {availableProjects.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground">All projects are already open.</div>
            ) : (
              availableProjects.map((project) => (
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
                  <div className="text-[11px] font-medium text-primary">Add</div>
                </button>
              ))
            )}
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
          <div className={`grid ${gridClass} gap-3 pt-4`}>
            {selectedProjects.map((project, projectIndex) => {
              const accentStyle = getProjectAccent(project.name);
              const languageIconConfig = getProjectLanguageIcon(project);
              const HeaderLanguageIcon = languageIconConfig.icon;

              return (
                <section
                  key={project.name}
                  ref={(element) => {
                    projectTileRefs.current[project.name] = element;
                  }}
                  onDragOver={(event) => {
                    if (!draggedProjectName) {
                      return;
                    }
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourceProjectName = draggedProjectName || event.dataTransfer.getData('text/plain');
                    if (sourceProjectName && sourceProjectName !== project.name) {
                      moveProjectBeforeTarget(sourceProjectName, project.name);
                    }
                    setDraggedProjectName(null);
                  }}
                  className={`relative isolate z-0 rounded-xl border bg-card overflow-visible flex flex-col min-h-0 ${tileHeightClass} ${
                    draggedProjectName === project.name ? 'border-primary/70' : accentStyle.borderClass
                  } ${accentStyle.glowClass}`}
                >
                  <div className="pointer-events-none absolute top-0 left-1/2 z-[90] w-[84%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-2">
                    <span className={`relative z-0 h-px flex-1 ${accentStyle.lineClass}`} />
                    <span
                      className={`relative z-10 bg-card px-2.5 py-0.5 text-[11px] font-semibold leading-normal ${accentStyle.labelTextClass} max-w-[65%] truncate`}
                      title={project.displayName}
                    >
                      {project.displayName}
                    </span>
                    <span className={`relative z-0 h-px flex-1 ${accentStyle.lineClass}`} />
                  </div>

                  <header className="relative px-3 pt-5 pb-2 border-b border-border/60 bg-muted/20">
                    <div className="absolute left-2 top-1/2 -translate-y-1/2">
                      <div
                        className={`inline-flex items-center justify-center rounded-md border ${accentStyle.labelBorderClass} bg-background/80 p-1`}
                        title={`Primary language: ${languageIconConfig.label}`}
                        aria-label={`Primary language: ${languageIconConfig.label}`}
                      >
                        <HeaderLanguageIcon className={`h-3.5 w-3.5 ${languageIconConfig.colorClass}`} />
                      </div>
                    </div>
                    <div className="min-w-0 text-center">
                      <div className="text-[11px] text-muted-foreground truncate">{project.fullPath}</div>
                    </div>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          setDraggedProjectName(project.name);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', project.name);
                        }}
                        onDragEnd={() => setDraggedProjectName(null)}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-grab active:cursor-grabbing"
                        aria-label={`Drag ${project.displayName}`}
                        title={`Drag ${project.displayName}`}
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveProjectByStep(project.name, -1)}
                        disabled={projectIndex === 0}
                        className="p-1 rounded-md text-muted-foreground enabled:hover:text-foreground enabled:hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label={`Move ${project.displayName} up`}
                        title={`Move ${project.displayName} up`}
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveProjectByStep(project.name, 1)}
                        disabled={projectIndex === selectedProjects.length - 1}
                        className="p-1 rounded-md text-muted-foreground enabled:hover:text-foreground enabled:hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label={`Move ${project.displayName} down`}
                        title={`Move ${project.displayName} down`}
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleProject(project.name)}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        aria-label={`Remove ${project.displayName}`}
                        title={`Remove ${project.displayName}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </header>

                  <div className="flex-1 min-h-0">
                    <MultiChatProjectTile
                      project={project}
                      accentStyle={accentStyle}
                      selectedSessionId={selectedSessionIdsByProject[project.name] || null}
                      onSessionChange={(projectName, sessionId) =>
                        setSelectedSessionIdsByProject((previous) => ({
                          ...previous,
                          [projectName]: sessionId,
                        }))
                      }
                      ws={ws}
                      sendMessage={sendMessage}
                      latestMessage={latestMessage}
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
                    />
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
