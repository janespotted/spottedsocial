import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MapPin, AlertCircle } from 'lucide-react';

export default function Map() {
  const [mapboxToken, setMapboxToken] = useState('');

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Friends Map</h1>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          To enable the map feature, you'll need to add your Mapbox access token.
          Get one free at{' '}
          <a
            href="https://mapbox.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary"
          >
            mapbox.com
          </a>
        </AlertDescription>
      </Alert>

      <Card className="p-8 text-center space-y-4">
        <MapPin className="h-12 w-12 mx-auto text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold mb-2">Map Coming Soon</h3>
          <p className="text-muted-foreground">
            See where your friends are in real-time on an interactive map.
          </p>
        </div>
      </Card>
    </div>
  );
}
