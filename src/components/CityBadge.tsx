import { useUserCity } from '@/hooks/useUserCity';

export function CityBadge() {
  const { city, isLoading } = useUserCity();

  if (isLoading) return null;

  const getCityDisplayName = () => {
    switch (city) {
      case 'la': return 'LA';
      case 'pb': return 'PB';
      default: return 'NYC';
    }
  };

  return (
    <div className="inline-flex items-center px-2 py-0.5 rounded-lg bg-[#d4ff00]/10 border border-[#d4ff00]/20">
      <span className="text-[#d4ff00] text-xs font-medium uppercase tracking-wide">
        {getCityDisplayName()}
      </span>
    </div>
  );
}
