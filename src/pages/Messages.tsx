import { Card } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

export default function Messages() {
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Messages</h1>

      <Card className="p-8 text-center space-y-4">
        <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold mb-2">No conversations yet</h3>
          <p className="text-muted-foreground">
            Start chatting with friends from the map or your friends list.
          </p>
        </div>
      </Card>
    </div>
  );
}
