import { Card } from '@/components/ui/card';
import { Trophy } from 'lucide-react';

export default function Leaderboard() {
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Leaderboard</h1>

      <Card className="p-8 text-center space-y-4">
        <Trophy className="h-12 w-12 mx-auto text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold mb-2">Coming Soon</h3>
          <p className="text-muted-foreground">
            See who's been out the most this month and compete with friends.
          </p>
        </div>
      </Card>
    </div>
  );
}
