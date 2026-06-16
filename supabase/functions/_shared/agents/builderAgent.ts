/**
 * Builder Agent — Phase C: Project Intelligence System
 *
 * Specializes in: project strategy, milestone planning, blocker resolution,
 * velocity analysis, deadline risk, and builder productivity.
 *
 * Audience: software engineers, founders, freelancers, product managers.
 */

export interface ProjectItem {
  id:          string;
  title:       string;
  status:      string;
  deadline?:   string;
  color:       string;
  description?: string;
}

export interface MilestoneItem {
  id:        string;
  projectId: string;
  title:     string;
  status:    string;
  dueDate?:  string;
  estimatedHours?: number;
  order:     number;
}

export interface ProjectIntelligenceItem {
  projectId:             string;
  projectName:           string;
  healthScore:           number;
  healthLabel:           string;
  completionProbability: number;
  velocity:              number;
  blockedCount:          number;
  overdueCount:          number;
  daysSinceActivity:     number;
  deadlineRisk:          string;
  daysUntilDeadline:     number | null;
  completedCount:        number;
  totalCount:            number;
  recommendation:        string;
}

export interface ProjectRiskItem {
  projectName:    string;
  riskLevel:      string;
  reason:         string;
  actionRequired: string;
}

export interface BuilderAgentContext {
  todayDate:          string;
  projects:           ProjectItem[];
  milestones:         MilestoneItem[];
  projectIntelligence: ProjectIntelligenceItem[];
  projectRisks:       ProjectRiskItem[];
  focusMinsOnProjects: number;
  retrievedMemories:  Array<{ title: string; content: string; similarity: number }>;
}

export function buildBuilderAgentPrompt(ctx: BuilderAgentContext): string {
  const today = new Date(ctx.todayDate + 'T00:00:00');

  const projectMap = Object.fromEntries(ctx.projects.map((p) => [p.id, p]));

  const activeProjects = ctx.projects.filter((p) => p.status === 'active');

  // Intelligence summary — sorted by worst health first
  const intelLines = ctx.projectIntelligence.length
    ? [...ctx.projectIntelligence]
        .sort((a, b) => a.healthScore - b.healthScore)
        .map((pi) => {
          const bar = pi.healthScore >= 75 ? '◼◼◼◼' :
                      pi.healthScore >= 50 ? '◼◼◼◻' :
                      pi.healthScore >= 25 ? '◼◼◻◻' : '◼◻◻◻';
          const deadlineStr = pi.daysUntilDeadline !== null
            ? ` · deadline in ${pi.daysUntilDeadline}d [${pi.deadlineRisk.toUpperCase()}]`
            : '';
          const actStr = pi.daysSinceActivity < 999
            ? ` · last active ${pi.daysSinceActivity}d ago`
            : ' · never active';
          const vel = pi.velocity > 0 ? ` · ${pi.velocity}/week velocity` : '';
          return [
            `• ${pi.projectName} — Health: ${pi.healthScore}% [${pi.healthLabel.toUpperCase()}] ${bar}`,
            `  Progress: ${pi.completedCount}/${pi.totalCount} milestones · ${pi.completionProbability}% success probability`,
            `  ${pi.blockedCount} blocked · ${pi.overdueCount} overdue${deadlineStr}${actStr}${vel}`,
            `  → ${pi.recommendation}`,
          ].join('\n');
        }).join('\n\n')
    : '• No project intelligence data yet.';

  // Risk lines
  const riskLines = ctx.projectRisks.length
    ? ctx.projectRisks.slice(0, 6).map((r) =>
        `• [${r.riskLevel.toUpperCase()}] ${r.projectName}: ${r.reason}\n  Action: ${r.actionRequired}`
      ).join('\n')
    : '• No active project risks.';

  // Milestone breakdown per active project
  const milestoneLines = activeProjects.length
    ? activeProjects.map((p) => {
        const ms = ctx.milestones
          .filter((m) => m.projectId === p.id)
          .sort((a, b) => a.order - b.order);

        if (!ms.length) return `${p.title}: no milestones`;

        const blocked  = ms.filter((m) => m.status === 'blocked');
        const inProg   = ms.filter((m) => m.status === 'in_progress');
        const pending  = ms.filter((m) => m.status === 'pending');
        const done     = ms.filter((m) => m.status === 'completed');
        const overdue  = ms.filter((m) => m.status !== 'completed' && m.dueDate && m.dueDate < ctx.todayDate);

        const msDetails = [
          ...blocked.map((m) => `  🔴 [BLOCKED] ${m.title}`),
          ...inProg.map((m)  => `  🟡 [IN PROGRESS] ${m.title}`),
          ...overdue.filter((m) => m.status === 'pending').map((m) => `  🟠 [OVERDUE] ${m.title}`),
          ...pending.filter((m) => !overdue.find((o) => o.id === m.id)).slice(0, 3).map((m) => `  ⚪ [PENDING] ${m.title}`),
          done.length > 0 ? `  ✅ ${done.length} completed` : '',
        ].filter(Boolean).join('\n');

        return `${p.title}:\n${msDetails}`;
      }).join('\n\n')
    : '• No active projects.';

  // Retrieved project memories
  const memoryLines = ctx.retrievedMemories.length
    ? ctx.retrievedMemories.slice(0, 4).map((m, i) =>
        `[${i + 1}] ${m.title}\n${m.content.slice(0, 400)}`
      ).join('\n\n')
    : '• No relevant project notes found.';

  // Project ID reference table for action blocks
  const projectIdTable = activeProjects.length
    ? activeProjects.map((p) => `• "${p.title}" → ${p.id}`).join('\n')
    : '• No active projects.';

  return `You are the Builder Agent of LifeOS — an expert project strategist for engineers, founders, and creators.
Your role: help the user understand project health, unblock themselves, and make the next best move.
You have real project intelligence data — use specific numbers and project names, never generic advice.

TODAY: ${ctx.todayDate}
FOCUS TIME ON PROJECTS THIS WEEK: ${ctx.focusMinsOnProjects} minutes
ACTIVE PROJECTS: ${activeProjects.length}

═══ PROJECT INTELLIGENCE (worst health first) ═══
${intelLines}

═══ ACTIVE RISKS ═══
${riskLines}

═══ MILESTONE BREAKDOWN ═══
${milestoneLines}

═══ RELEVANT PROJECT NOTES FROM MEMORY ═══
${memoryLines}

═══ PROJECT ID REFERENCE (use in create_memory action blocks) ═══
${projectIdTable}

═══ BUILDER RULES ═══
1. Lead with the LOWEST health project — name the specific blocker or risk.
2. If a risk is CRITICAL, address it first regardless of what was asked.
3. When discussing blockers, suggest concrete unblocking actions (escalate, descope, delegate, research).
4. Recommend focus sessions of 45–90 minutes on a single milestone — not "work on projects generally."
5. When velocity is zero, help the user identify why and suggest the smallest possible restart action.
6. Reference actual health scores: "CampusHub is at 34% — that's at-risk because of 2 blocked milestones."
7. For deadline risks, suggest scope cuts rather than impossible crunch schedules.
8. Use retrieved project notes to answer "why" questions about past decisions.
9. If a project has no milestones, that's the first problem to solve — recommend breaking it down now.
10. Keep recommendations specific: name the milestone, estimate the time, suggest when to do it.`;
}
