

## Enhanced Business Dashboard with Charts, Analytics & Onboarding Carousel

### Overview

Transform the current basic dashboard into a professional business intelligence hub with:
1. Interactive charts for check-in trends
2. More detailed analytics metrics
3. Intro onboarding carousel for first-time business users

---

### Current Issues

| Problem | Impact |
|---------|--------|
| Only basic number counts (0, 0, 0) | Looks empty and uninformative |
| No visual charts | Hard to spot trends at a glance |
| No onboarding for new business users | Users don't know what features exist |
| Limited analytics depth | Missing useful metrics like day-of-week patterns |

---

### Proposed Changes

#### 1. Business Onboarding Carousel

Show once for new business users (stored in localStorage) with 3-4 slides:

| Slide | Title | Description |
|-------|-------|-------------|
| 1 | Welcome to Your Dashboard | "Track real-time check-ins, see when your venue is busiest, and understand your audience" |
| 2 | Promote Your Venue | "Boost visibility on the leaderboard and map to attract more visitors" |
| 3 | Engage with Yap | "Post updates directly to users' feeds - announce specials, events, or vibes" |
| 4 | Let's Get Started | Quick venue selector to begin |

---

#### 2. Enhanced Dashboard Layout

```text
+----------------------------------------+
|  Welcome back, [Venue Name]            |
|  Last updated: 2 mins ago              |
+----------------------------------------+
|                                        |
|  [======= CHECK-IN TREND CHART =======]|
|  (Area/Bar chart - last 7 days)        |
|                                        |
+----------------------------------------+
|  TODAY     |  7 DAYS    |  30 DAYS    |
|    12      |    89      |    342      |
|  +50% vs   |  +12% vs   |  Avg: 11/day|
|  yesterday |  last week |             |
+--------------------+-------------------+
|  PEAK HOUR         |  BUSIEST DAY     |
|  10PM - 11PM       |  Saturday        |
|  28 check-ins      |  Avg: 18/night   |
+--------------------+-------------------+
|                                        |
|  [=== HOURLY DISTRIBUTION CHART ===]   |
|  (Bar chart showing 6PM-2AM hours)     |
|                                        |
+----------------------------------------+
|  QUICK ACTIONS                         |
|  [Promote] [Post to Yap] [View Map]    |
+----------------------------------------+
```

---

#### 3. New Analytics Metrics

| Metric | Description |
|--------|-------------|
| **Daily Trend Chart** | Area/line chart showing last 7 days |
| **Hourly Distribution** | Bar chart of check-ins by hour (peak hours visual) |
| **Busiest Day** | Which day of week gets most check-ins |
| **Yesterday Comparison** | Today vs yesterday % change |
| **Average per Day** | 30-day average for context |
| **Week-over-Week Trend** | Visual arrow + percentage |

---

### Technical Implementation

#### New Files

| File | Purpose |
|------|---------|
| `src/components/business/BusinessOnboarding.tsx` | Intro carousel for first-time business users |
| `src/components/business/CheckInTrendChart.tsx` | 7-day area/line chart component |
| `src/components/business/HourlyDistributionChart.tsx` | Bar chart for hourly patterns |

#### Modified Files

| File | Changes |
|------|---------|
| `src/pages/business/BusinessDashboard.tsx` | Complete redesign with charts, enhanced metrics, onboarding check |

---

### Data Fetching Enhancement

Expand the current analytics fetch to include:

```typescript
interface EnhancedAnalytics {
  // Existing
  today: number;
  week: number;
  month: number;
  peakHour: number | null;
  weekChange: number;
  
  // New
  yesterday: number;
  yesterdayChange: number;
  busiestDay: string | null; // "Saturday", "Friday", etc.
  avgPerDay: number;
  dailyTrend: { date: string; count: number }[]; // Last 7 days
  hourlyDistribution: { hour: number; count: number }[]; // 6PM-2AM
}
```

---

### Charts Using Recharts

The project already has `recharts` installed and a `ChartContainer` component. We'll use:

- **AreaChart** - For 7-day trend (smooth, visually appealing)
- **BarChart** - For hourly distribution (easy to compare)

Color scheme will match the app's purple/neon gradient theme.

---

### Onboarding Flow

```text
User lands on /business/dashboard
        ↓
Check localStorage for 'business_onboarding_complete'
        ↓
  Not found? → Show BusinessOnboarding carousel
        ↓
  Complete → Set localStorage flag + show dashboard
```

---

### UI Improvements

| Current | Improved |
|---------|----------|
| Static "Check-ins" card | Trend chart with visual context |
| Small stat boxes | Larger cards with comparisons |
| "No data" text | Empty state with encouraging message |
| Basic grid layout | Professional card hierarchy |
| No welcome message | Personalized venue name greeting |

---

### Mobile Considerations

- Charts will be responsive and touch-friendly
- Horizontal scroll for hourly chart if needed
- Cards stack vertically on narrow screens
- Onboarding carousel works well on mobile (existing pattern)

---

### Empty State Handling

When venue has no check-ins yet:
- Show charts with placeholder visual (dotted line at zero)
- Encouraging message: "Your analytics will appear here as guests check in"
- Prominent CTA to promote venue

---

### Files to Create/Modify

| Action | File |
|--------|------|
| Create | `src/components/business/BusinessOnboarding.tsx` |
| Create | `src/components/business/CheckInTrendChart.tsx` |
| Create | `src/components/business/HourlyDistributionChart.tsx` |
| Modify | `src/pages/business/BusinessDashboard.tsx` |

