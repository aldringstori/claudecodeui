import { useMemo, useState } from 'react';
import { Loader2, Plus, Send } from 'lucide-react';

type TaskLike = {
  id?: string | number;
  title?: string;
  status?: string;
  priority?: string;
};

type KanbanColumn = {
  id: string;
  title: string;
  status: string;
  tasks: TaskLike[];
  accentClass: string;
};

type ProjectKanbanAssistantPanelProps = {
  tasks: TaskLike[];
  onCreateTaskWithPrompt: (taskText: string) => Promise<boolean> | boolean;
  isSubmittingPrompt: boolean;
  isLoadingTasks: boolean;
};

const COLUMN_DEFINITIONS = [
  {
    id: 'pending',
    title: 'Pending',
    status: 'pending',
    accentClass: 'border-l-slate-400',
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    status: 'in-progress',
    accentClass: 'border-l-blue-500',
  },
  {
    id: 'done',
    title: 'Done',
    status: 'done',
    accentClass: 'border-l-emerald-500',
  },
];

function normalizeTaskTitle(task: TaskLike): string {
  return task.title || `Task ${task.id ?? 'N/A'}`;
}

export default function ProjectKanbanAssistantPanel({
  tasks,
  onCreateTaskWithPrompt,
  isSubmittingPrompt,
  isLoadingTasks,
}: ProjectKanbanAssistantPanelProps) {
  const [taskInput, setTaskInput] = useState('');

  const columns = useMemo<KanbanColumn[]>(() => {
    return COLUMN_DEFINITIONS.map((column) => ({
      ...column,
      tasks: tasks.filter((task) => task.status === column.status).slice(0, 8),
    }));
  }, [tasks]);

  const handleCreateTask = async () => {
    const normalizedInput = taskInput.trim();
    if (!normalizedInput || isSubmittingPrompt) {
      return;
    }

    const wasSubmitted = await onCreateTaskWithPrompt(normalizedInput);
    if (wasSubmitted) {
      setTaskInput('');
    }
  };

  return (
    <aside className="hidden xl:flex xl:w-[360px] 2xl:w-[400px] border-l border-border/60 bg-muted/20 h-full">
      <div className="w-full h-full flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60 bg-background/80">
          <h3 className="text-sm font-semibold text-foreground">Project Kanban</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Add a task and it will be sent to AI as a prompt automatically.
          </p>
        </div>

        <div className="px-4 py-3 border-b border-border/60 bg-background">
          <div className="flex gap-2">
            <input
              value={taskInput}
              onChange={(event) => setTaskInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleCreateTask();
                }
              }}
              placeholder="Describe a new task..."
              className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              disabled={isSubmittingPrompt}
            />
            <button
              onClick={() => {
                void handleCreateTask();
              }}
              disabled={isSubmittingPrompt || !taskInput.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title="Add task and send prompt"
            >
              {isSubmittingPrompt ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Ask AI</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {isLoadingTasks ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading project tasks...
            </div>
          ) : (
            columns.map((column) => (
              <section key={column.id} className="rounded-lg border border-border/60 bg-card">
                <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">{column.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {column.tasks.length}
                  </span>
                </div>

                {column.tasks.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">No tasks</div>
                ) : (
                  <div className="p-2 space-y-2">
                    {column.tasks.map((task, index) => (
                      <div
                        key={`${column.id}-${task.id ?? index}`}
                        className={`rounded-md border border-border/60 bg-background px-2.5 py-2 border-l-4 ${column.accentClass}`}
                      >
                        <div className="text-[11px] text-muted-foreground mb-1">#{task.id ?? '-'}</div>
                        <div className="text-xs text-foreground leading-snug">{normalizeTaskTitle(task)}</div>
                        {task.priority && (
                          <div className="mt-1 text-[10px] text-muted-foreground uppercase">
                            {task.priority}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-border/60 bg-background text-[11px] text-muted-foreground">
          <Plus className="inline w-3 h-3 mr-1" />
          This panel shows the first 8 tasks per lane.
        </div>
      </div>
    </aside>
  );
}
