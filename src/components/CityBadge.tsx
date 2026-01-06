import { useUserCity } from '@/hooks/useUserCity';

export function CityBadge() {
  const { city, isLoading } = useUserCity();

  if (isLoading) return null;

  const getCityDisplayName = () => {
    switch (city) {
      case 'la': return 'LA';
      default: return 'NYC';
    }
  };

  return (
    <div className="inline-flex items-center px-2.5 py-0.5 rounded-xl bg-[#d4ff00]/20 border border-[#d4ff00]/40">
      <span className="text-[#d4ff00] text-xs font-semibold uppercase tracking-wider">
        {getCityDisplayName()}
      </span>
    </div>
  );
}
