import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Brain } from 'lucide-react';
import { Card } from '../common/Card.jsx';
import { Skeleton } from '../common/Skeleton.jsx';
import { reportsService } from '../../services/reports.service.js';
import { usePolling } from '../../hooks/usePolling.js';

/** "What has the AI learned" teaser — best/worst market regime by the AI's own closed-trade history. Links to the full Reports page for the complete breakdown. */
export function LearningInsightTeaser() {
  const [learning, setLearning] = useState(null);
  usePolling(() => reportsService.learning().then(setLearning).catch(() => {}), 30000);

  if (!learning) {
    return (
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-14" />
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 font-display font-semibold">
          <Brain size={16} className="text-muted" />
          Learning Engine
        </span>
        <Link to="/reports" className="text-xs text-accent hover:underline">
          Details →
        </Link>
      </div>
      {learning.sampleSize === 0 ? (
        <div className="py-2 text-sm text-muted">{learning.note}</div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">AI track record</span>
            <span className="font-medium">{learning.sampleSize} trades · {learning.overall.winRate}% win</span>
          </div>
          {learning.bestCondition && (
            <div className="flex justify-between">
              <span className="text-muted">Best regime</span>
              <span className="font-medium text-accent">{learning.bestCondition.key} · {learning.bestCondition.winRate}%</span>
            </div>
          )}
          {learning.worstCondition && (
            <div className="flex justify-between">
              <span className="text-muted">Avoided regime</span>
              <span className="font-medium text-danger">{learning.worstCondition.key} · {learning.worstCondition.winRate}%</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
