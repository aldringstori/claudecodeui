import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '../../../utils/api';
import { CLAUDE_MODELS, CODEX_MODELS, CURSOR_MODELS, GEMINI_MODELS } from '../../../../shared/modelConstants';
import type { PendingPermissionRequest, PermissionMode, Provider } from '../types/types';
import type { Project, ProjectSession, SessionProvider } from '../../../types/app';

interface UseChatProviderStateArgs {
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
}

const DEFAULT_PERMISSION_MODE: PermissionMode = 'bypassPermissions';
const UI_PREFERENCES_PROVIDER_KEY = 'providerByProject';

function isSessionProvider(value: unknown): value is SessionProvider {
  return value === 'claude' || value === 'cursor' || value === 'codex' || value === 'gemini';
}

function isPermissionMode(value: unknown): value is PermissionMode {
  return value === 'default' ||
    value === 'acceptEdits' ||
    value === 'bypassPermissions' ||
    value === 'plan';
}

export function useChatProviderState({ selectedProject, selectedSession }: UseChatProviderStateArgs) {
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(DEFAULT_PERMISSION_MODE);
  const [pendingPermissionRequests, setPendingPermissionRequests] = useState<PendingPermissionRequest[]>([]);
  const [provider, setProvider] = useState<SessionProvider>(() => {
    return (localStorage.getItem('selected-provider') as SessionProvider) || 'claude';
  });
  const [providerByProject, setProviderByProject] = useState<Record<string, SessionProvider>>({});
  const [hasLoadedProviderPreferences, setHasLoadedProviderPreferences] = useState(false);
  const [cursorModel, setCursorModel] = useState<string>(() => {
    return localStorage.getItem('cursor-model') || CURSOR_MODELS.DEFAULT;
  });
  const [claudeModel, setClaudeModel] = useState<string>(() => {
    return localStorage.getItem('claude-model') || CLAUDE_MODELS.DEFAULT;
  });
  const [codexModel, setCodexModel] = useState<string>(() => {
    return localStorage.getItem('codex-model') || CODEX_MODELS.DEFAULT;
  });
  const [geminiModel, setGeminiModel] = useState<string>(() => {
    return localStorage.getItem('gemini-model') || GEMINI_MODELS.DEFAULT;
  });

  const lastProviderRef = useRef(provider);
  const lastPreferredProviderProjectRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProviderPreferences = async () => {
      try {
        const response = await authenticatedFetch(`/api/user/ui-preferences?keys=${UI_PREFERENCES_PROVIDER_KEY}`);
        if (!response.ok) {
          throw new Error(`Failed to load provider preferences (${response.status})`);
        }

        const payload = await response.json() as {
          preferences?: Record<string, unknown>;
        };
        const rawMap = payload.preferences?.[UI_PREFERENCES_PROVIDER_KEY];
        if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) {
          return;
        }

        const normalizedMap: Record<string, SessionProvider> = {};
        Object.entries(rawMap as Record<string, unknown>).forEach(([projectName, projectProvider]) => {
          if (!projectName || !isSessionProvider(projectProvider)) {
            return;
          }
          normalizedMap[projectName] = projectProvider;
        });

        if (!cancelled) {
          setProviderByProject(normalizedMap);
        }
      } catch (error) {
        console.warn('Unable to load provider preferences:', error);
      } finally {
        if (!cancelled) {
          setHasLoadedProviderPreferences(true);
        }
      }
    };

    void loadProviderPreferences();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedSession?.id) {
      setPermissionMode(DEFAULT_PERMISSION_MODE);
      return;
    }

    const savedMode = localStorage.getItem(`permissionMode-${selectedSession.id}`);
    setPermissionMode(isPermissionMode(savedMode) ? savedMode : DEFAULT_PERMISSION_MODE);
  }, [selectedSession?.id]);

  useEffect(() => {
    if (!selectedSession?.__provider || selectedSession.__provider === provider) {
      return;
    }

    setProvider(selectedSession.__provider);
    localStorage.setItem('selected-provider', selectedSession.__provider);
  }, [provider, selectedSession]);

  useEffect(() => {
    if (!hasLoadedProviderPreferences || !selectedProject?.name || selectedSession?.__provider) {
      return;
    }

    const projectName = selectedProject.name;
    if (lastPreferredProviderProjectRef.current === projectName) {
      return;
    }

    lastPreferredProviderProjectRef.current = projectName;

    const preferredProvider = providerByProject[projectName];
    if (!preferredProvider || preferredProvider === provider) {
      return;
    }

    setProvider(preferredProvider);
    localStorage.setItem('selected-provider', preferredProvider);
  }, [hasLoadedProviderPreferences, provider, providerByProject, selectedProject?.name, selectedSession?.__provider]);

  useEffect(() => {
    if (!hasLoadedProviderPreferences || !selectedProject?.name) {
      return;
    }

    if (providerByProject[selectedProject.name] === provider) {
      localStorage.setItem('selected-provider', provider);
      return;
    }

    const nextProviderByProject = {
      ...providerByProject,
      [selectedProject.name]: provider,
    };

    setProviderByProject(nextProviderByProject);
    localStorage.setItem('selected-provider', provider);

    const timeoutId = window.setTimeout(() => {
      void authenticatedFetch('/api/user/ui-preferences', {
        method: 'PATCH',
        body: JSON.stringify({
          preferences: {
            [UI_PREFERENCES_PROVIDER_KEY]: nextProviderByProject,
          },
        }),
      }).catch((error) => {
        console.warn('Unable to save provider preferences:', error);
      });
    }, 200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [hasLoadedProviderPreferences, provider, providerByProject, selectedProject?.name, selectedSession?.__provider]);

  useEffect(() => {
    if (lastProviderRef.current === provider) {
      return;
    }
    setPendingPermissionRequests([]);
    lastProviderRef.current = provider;
  }, [provider]);

  useEffect(() => {
    setPendingPermissionRequests((previous) =>
      previous.filter((request) => !request.sessionId || request.sessionId === selectedSession?.id),
    );
  }, [selectedSession?.id]);

  useEffect(() => {
    if (provider !== 'cursor') {
      return;
    }

    authenticatedFetch('/api/cursor/config')
      .then((response) => response.json())
      .then((data) => {
        if (!data.success || !data.config?.model?.modelId) {
          return;
        }

        const modelId = data.config.model.modelId as string;
        if (!localStorage.getItem('cursor-model')) {
          setCursorModel(modelId);
        }
      })
      .catch((error) => {
        console.error('Error loading Cursor config:', error);
      });
  }, [provider]);

  const cyclePermissionMode = useCallback(() => {
    const modes: PermissionMode[] =
      provider === 'codex'
        ? ['default', 'acceptEdits', 'bypassPermissions']
        : ['default', 'acceptEdits', 'bypassPermissions', 'plan'];

    const currentIndex = modes.indexOf(permissionMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];
    setPermissionMode(nextMode);

    if (selectedSession?.id) {
      localStorage.setItem(`permissionMode-${selectedSession.id}`, nextMode);
    }
  }, [permissionMode, provider, selectedSession?.id]);

  return {
    provider,
    setProvider,
    cursorModel,
    setCursorModel,
    claudeModel,
    setClaudeModel,
    codexModel,
    setCodexModel,
    geminiModel,
    setGeminiModel,
    permissionMode,
    setPermissionMode,
    pendingPermissionRequests,
    setPendingPermissionRequests,
    cyclePermissionMode,
  };
}
