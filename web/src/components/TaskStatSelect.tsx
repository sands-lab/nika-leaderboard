import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import { TASK_STAT_LABEL, type TaskStat } from '../lib/pricing'

/**
 * Picks the per-task figure every analytics cost chart plots. The median is a
 * typical task; p95 shows what the expensive tail costs.
 */
export function TaskStatSelect() {
  const { taskStat, setTaskStat } = useLeaderboardData()
  return (
    <label
      className="task-stat"
      title={
        'Median: the cost of a typical task, over the release\'s tasks.\n' +
        'p95: 95% of tasks cost no more than this, so it shows the expensive tail.\n' +
        'Each task counts once, as the mean of its trials.'
      }
    >
      <span>Per task</span>
      <select value={taskStat} onChange={(e) => setTaskStat(e.target.value as TaskStat)}>
        {(Object.keys(TASK_STAT_LABEL) as TaskStat[]).map((stat) => (
          <option key={stat} value={stat}>
            {TASK_STAT_LABEL[stat]}
          </option>
        ))}
      </select>
    </label>
  )
}
