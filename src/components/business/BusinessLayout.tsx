 import { ReactNode } from 'react';
 import { useNavigate, useLocation } from 'react-router-dom';
 import { Button } from '@/components/ui/button';
 import { ArrowLeft, LayoutDashboard, Megaphone, MessageSquare, Building2 } from 'lucide-react';
 
 interface BusinessLayoutProps {
   children: ReactNode;
   title: string;
   showBack?: boolean;
 }
 
 export function BusinessLayout({ children, title, showBack = true }: BusinessLayoutProps) {
   const navigate = useNavigate();
   const location = useLocation();
 
   const navItems = [
     { path: '/business/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
     { path: '/business/promote', icon: Megaphone, label: 'Promote' },
     { path: '/business/yap', icon: MessageSquare, label: 'Yap' },
   ];
 
   return (
     <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118]">
       <div className="max-w-[430px] mx-auto px-4 py-6 pb-24">
         {/* Header */}
         <div className="flex items-center gap-3 mb-6">
           {showBack && (
             <Button
               variant="ghost"
               size="icon"
               onClick={() => navigate(-1)}
               className="text-white hover:bg-white/10"
             >
               <ArrowLeft className="h-5 w-5" />
             </Button>
           )}
           <div className="flex items-center gap-2">
             <Building2 className="h-5 w-5 text-primary" />
             <h1 className="text-xl font-semibold text-white">{title}</h1>
           </div>
         </div>
 
         {children}
       </div>
 
       {/* Bottom Navigation */}
       <div className="fixed bottom-0 left-0 right-0 bg-[#1a0f2e]/95 backdrop-blur-lg border-t border-white/10">
         <div className="max-w-[430px] mx-auto flex justify-around py-3">
           {navItems.map((item) => {
             const isActive = location.pathname === item.path;
             return (
               <button
                 key={item.path}
                 onClick={() => navigate(item.path)}
                 className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
                   isActive
                     ? 'text-primary'
                     : 'text-white/60 hover:text-white/80'
                 }`}
               >
                 <item.icon className="h-5 w-5" />
                 <span className="text-xs">{item.label}</span>
               </button>
             );
           })}
         </div>
       </div>
     </div>
   );
 }