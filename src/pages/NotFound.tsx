import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#2d1b4e] to-[#0a0118]">
      <div className="text-center max-w-[430px] mx-auto px-4">
        <div className="w-24 h-24 rounded-full bg-[#2d1b4e] border-2 border-[#a855f7]/40 flex items-center justify-center mx-auto mb-6">
          <span className="text-5xl">🔍</span>
        </div>
        <h1 className="mb-2 text-6xl font-bold text-[#d4ff00]">404</h1>
        <p className="mb-2 text-xl text-white font-medium">Page not found</p>
        <p className="mb-8 text-white/60">
          Looks like this page went out without telling us where
        </p>
        <Button
          onClick={() => navigate('/')}
          className="bg-[#a855f7] text-white hover:bg-[#a855f7]/90 shadow-[0_0_15px_rgba(168,85,247,0.4)]"
        >
          <Home className="w-4 h-4 mr-2" />
          Return to Home
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
