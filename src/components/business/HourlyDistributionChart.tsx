 import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Clock } from 'lucide-react';
 
 interface HourlyData {
   hour: number;
   count: number;
   label: string;
 }
 
 interface HourlyDistributionChartProps {
   data: HourlyData[];
   peakHour: number | null;
   loading?: boolean;
 }
 
 export function HourlyDistributionChart({ data, peakHour, loading }: HourlyDistributionChartProps) {
   const hasData = data.some(d => d.count > 0);
 
   return (
     <Card className="bg-white/5 border-white/10">
       <CardHeader className="pb-2">
         <CardTitle className="text-white text-base flex items-center gap-2">
           <Clock className="h-4 w-4 text-primary" />
           Hourly Distribution
         </CardTitle>
       </CardHeader>
       <CardContent>
         {loading ? (
           <div className="h-[160px] bg-white/5 rounded-lg animate-pulse" />
         ) : !hasData ? (
           <div className="h-[160px] flex flex-col items-center justify-center text-white/50">
             <Clock className="h-8 w-8 mb-2 opacity-50" />
             <p className="text-sm">Peak hours will appear here</p>
             <p className="text-xs mt-1">as guests check in</p>
           </div>
         ) : (
           <div className="h-[160px]">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                 <XAxis 
                   dataKey="label" 
                   stroke="#ffffff50"
                   fontSize={10}
                   tickLine={false}
                   axisLine={false}
                   interval={0}
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
                   labelFormatter={(label) => `${label}`}
                   formatter={(value: number) => [value, 'Check-ins']}
                 />
                 <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                   {data.map((entry, index) => (
                     <Cell 
                       key={`cell-${index}`}
                       fill={entry.hour === peakHour ? '#d4ff00' : '#a855f7'}
                       fillOpacity={entry.hour === peakHour ? 1 : 0.6}
                     />
                   ))}
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
           </div>
         )}
       </CardContent>
     </Card>
   );
 }