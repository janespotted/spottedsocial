 import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { TrendingUp } from 'lucide-react';
 
 interface DailyTrend {
   date: string;
   count: number;
   label: string;
 }
 
 interface CheckInTrendChartProps {
   data: DailyTrend[];
   loading?: boolean;
 }
 
 export function CheckInTrendChart({ data, loading }: CheckInTrendChartProps) {
   const hasData = data.some(d => d.count > 0);
 
   return (
     <Card className="bg-white/5 border-white/10">
       <CardHeader className="pb-2">
         <CardTitle className="text-white text-base flex items-center gap-2">
           <TrendingUp className="h-4 w-4 text-primary" />
           7-Day Check-in Trend
         </CardTitle>
       </CardHeader>
       <CardContent>
         {loading ? (
           <div className="h-[180px] bg-white/5 rounded-lg animate-pulse" />
         ) : !hasData ? (
           <div className="h-[180px] flex flex-col items-center justify-center text-white/50">
             <TrendingUp className="h-8 w-8 mb-2 opacity-50" />
             <p className="text-sm">Your trend data will appear here</p>
             <p className="text-xs mt-1">as guests check in</p>
           </div>
         ) : (
           <div className="h-[180px]">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                 <defs>
                   <linearGradient id="checkInGradient" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="0%" stopColor="#d4ff00" stopOpacity={0.4} />
                     <stop offset="100%" stopColor="#a855f7" stopOpacity={0.1} />
                   </linearGradient>
                 </defs>
                 <XAxis 
                   dataKey="label" 
                   stroke="#ffffff50"
                   fontSize={11}
                   tickLine={false}
                   axisLine={false}
                 />
                 <YAxis 
                   stroke="#ffffff50"
                   fontSize={11}
                   tickLine={false}
                   axisLine={false}
                   allowDecimals={false}
                 />
                 <Tooltip
                   contentStyle={{
                     backgroundColor: '#1a0f2e',
                     border: '1px solid rgba(255,255,255,0.1)',
                     borderRadius: '8px',
                     color: '#fff',
                   }}
                   labelStyle={{ color: '#d4ff00' }}
                   formatter={(value: number) => [value, 'Check-ins']}
                 />
                 <Area
                   type="monotone"
                   dataKey="count"
                   stroke="#d4ff00"
                   strokeWidth={2}
                   fill="url(#checkInGradient)"
                 />
               </AreaChart>
             </ResponsiveContainer>
           </div>
         )}
       </CardContent>
     </Card>
   );
 }